# WHUSU Smart Workspace - MySQL 关系数据库模型

> 从微信云开发 NoSQL (MongoDB-like) 迁移至 MySQL 8.0 关系型数据库
> 所有 JSON 数组字段已拆分为独立表，完全符合第三范式 (3NF)

## 设计原则

- 所有 `_id` → `VARCHAR(64)` 主键（保留原始 ID 以兼容组织切换）
- JSON 数组全部拆为独立表，有序数据带 `sort_order` 或 `question_index` 字段
- 不使用 `code` 字段，所有关联通过 `id` 实现
- departments、identities、work_groups 均无 `sort_order`
- 日期使用 `DATETIME` 类型
- 历史表用于组织切换 (archive/restore) 机制

## 表结构一览 (共 18 张主表 + 18 张历史表)

### 基础组织表
| 表名 | 主键 | 说明 |
|------|------|------|
| organizations | id | 组织注册表 |
| system_config | id = 'default' | 系统配置（时区、当前组织） |

### 组织架构表
| 表名 | 主键 | 外键 | 说明 |
|------|------|------|------|
| departments | id | - | 部门 |
| identities | id | - | 身份/角色 |
| work_groups | id | department_id → departments.id | 工作分工（职能组） |

### 人事与绑定表
| 表名 | 主键 | 外键 | 说明 |
|------|------|------|------|
| hr_info | id | department_id, identity_id, work_group_id | 人事成员信息 |
| user_info | id | hr_id → hr_info.id | 普通用户绑定 |
| admin_info | id | - | 管理员账号 |

### 评分活动与模板表
| 表名 | 主键 | 外键 | 说明 |
|------|------|------|------|
| score_activities | id | - | 评分活动 |
| score_question_templates | id | - | 评分问题模板（主表） |
| score_questions | id | template_id → score_question_templates.id | **模板中的题目（有序）** |
| score_template_order | template_id | template_id → score_question_templates.id | 模板显示顺序 |

### 评分规则表
| 表名 | 主键 | 外键 | 说明 |
|------|------|------|------|
| rate_target_rules | id | activity_id → score_activities.id | 评分规则（主表） |
| rate_rule_clauses | id | rule_id → rate_target_rules.id | **规则子句（有序）** |
| clause_template_configs | id | clause_id → rate_rule_clauses.id, template_id → score_question_templates.id | **子句模板配置（有序）** |

### 评分记录表
| 表名 | 主键 | 外键 | 说明 |
|------|------|------|------|
| score_records | id | activity_id, rule_id, scorer_id, target_id | 评分记录（主表） |
| score_answers | id | record_id → score_records.id | **评分答案（有序，按 question_index）** |

### 人事扩展资料表
| 表名 | 主键 | 外键 | 说明 |
|------|------|------|------|
| hr_profile_templates | id | - | 扩展资料模板（主表） |
| hr_profile_template_fields | id | template_id → hr_profile_templates.id | **模板字段定义（有序）** |
| hr_profile_records | id | hr_id → hr_info.id | 用户扩展资料记录 |
| hr_profile_record_values | id | record_id → hr_profile_records.id | **用户的字段值（按 field_id 对应）** |

### 历史表

所有主表对应 `_history` 表，额外包含:
- `original_id` - 原始记录 ID
- `org_id` - 归档组织 ID
- `archived_at` - 归档时间

## JSON 拆表映射

| 原始 NoSQL JSON 字段 | 新 MySQL 表 | 顺序字段 |
|----------------------|------------|---------|
| `score_question_templates.questions[]` | `score_questions` | `sort_order` |
| `rate_target_rules.clauses[]` | `rate_rule_clauses` | `sort_order` |
| `clauses[].templateConfigs[]` | `clause_template_configs` | `sort_order` |
| `score_records.answers[]` | `score_answers` | `question_index` |
| `hr_profile_templates.fields[]` | `hr_profile_template_fields` | `sort_order` |
| `hr_profile_records.values{}` | `hr_profile_record_values` (is_pending=0) | 按 field_id 关联 |
| `hr_profile_records.pendingValues{}` | `hr_profile_record_values` (is_pending=1) | 按 field_id 关联 |

## 数据库脚本

- 本地: `server/db/setup-local.bat` (Windows) / `server/db/setup-local.sh` (Linux/Mac)
- 云端: 云函数 `initDatabaseSchema` + `server/db/init.sql`
