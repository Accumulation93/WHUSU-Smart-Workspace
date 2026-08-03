# WHUSU Smart Workspace

前端 UI 规范、共享组件清单和页面模板分别见：
`docs/ui-kit.md`、`docs/ui-components.md`、`docs/ui-page-templates.md`。
这些文档与 `miniprogram/app.wxss` 的设备令牌保持同步；手机、Pad 竖屏和 Pad 横屏保留独立的字号、间距与控件密度。

武汉大学部门成员互评考核系统 — 微信小程序 + Node.js Express + MySQL

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序 (原生框架) |
| 后端 | Node.js Express (HTTPS) |
| 数据库 | MySQL 8.0 (InnoDB, utf8mb4) |
| 认证 | JWT + 微信 code2session |

## 项目结构

```
WHUSUSmartWorkspaceServer/
├── server/              # Express 后端 (15 路由, 20 Model)
│   ├── db/init.sql      # 完整建表语句 + 种子数据
│   ├── db/setup-local.bat  # 一键初始化本地数据库
│   └── src/
├── miniprogram/         # 微信小程序前端 (6 页面)
├── miniprogramCloud/    # 原云函数前端备份
└── cloudfunctions/      # 云函数 (已迁移至 Express)
```

## 快速开始

### 1. 数据库初始化
```bash
cd server/db
# Windows: 双击 setup-local.bat
# 脚本会引导你完成: 连接测试 → 建库建表 → 种子数据 → 创建管理员
```

### 2. 配置环境变量
编辑 `server/.env`:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=whusu_smart_workspace
WECHAT_APPID=your_appid
WECHAT_SECRET=your_secret
JWT_SECRET=your_jwt_secret
```

### 3. 启动后端
```bash
cd server
npm install
npm start
# HTTPS 服务运行在 https://localhost:3000
```

### 4. 启动前端
- 打开微信开发者工具
- 导入 `miniprogram/` 目录
- 设置 → 项目设置 → 勾选"不校验合法域名、web-view（业务域名）"

## 功能概述

### 用户端
- 微信一键登录 / 学号姓名绑定
- 查看待评分人列表 + 完成状态
- 按评分问题模板逐题打分
- 查看个人资料 + 申请修改

### 管理端
- **组织管理**: 部门、身份类别、工作分工 CRUD
- **人事管理**: 成员增删改查 + CSV 批量导入
- **评分活动**: 创建活动 + 设置当前活动
- **评分问题**: 问题模板编辑 + **拖拽排序** + 复制
- **评分规则**: 按 部门+身份 → 目标身份 配置评分规则
- **评分结果**: 多维查看（评分人完成度 / 被评分人得分 / 汇总导出）
- **组织切换**: 多组织数据隔离 + 归档恢复
- **管理员**: 邀请码生成 + 管理员管理
- **审核**: 人事扩展资料审核（通过/驳回）

## API 路由

所有业务 API 均为 POST，路径 `/api/{functionName}`，JWT Bearer 认证。

| 路由文件 | 功能 |
|----------|------|
| `auth.js` | userLogin, adminLogin, bindUserInfo, bindAdminInfo, unbindRole |
| `hr.js` | listHrInfo, saveHrInfo, deleteHrInfo, importHrCsv, batchMaintainFromHrInfo |
| `departments.js` | listDepartments, saveDepartment, deleteDepartment |
| `identities.js` | listIdentities, saveIdentity, deleteIdentity |
| `workGroups.js` | listWorkGroups, saveWorkGroup, deleteWorkGroup |
| `org.js` | listOrganizations, saveOrganization, deleteOrganization, switchOrganization |
| `activities.js` | 评分活动 CRUD + setCurrentActivity |
| `templates.js` | listScoreTemplates, saveScoreTemplate, deleteScoreTemplate, duplicateScoreTemplate |
| `rules.js` | 评分规则 CRUD + generateRateTargetRules |
| `scoring.js` | getScoreFormData, submitScore, getScoreResults |
| `results.js` | getScoreResults (多维度), exportScoreResults |
| `hrProfile.js` | 人事扩展资料模板 + 记录 CRUD + 审核 |
| `admin.js` | 管理员 CRUD, 邀请码生成, 导出 |
| `user.js` | getUserHrProfile, 用户端资料更新 |
| `system.js` | getSystemConfig, updateSystemConfig |

## 数据库表

30 个基础表 + 16 个 `_history` 归档表。所有主键为 VARCHAR(64)，使用 64 位 base-62 随机 ID。

核心表: `organizations`, `system_config`, `departments`, `identities`, `work_groups`, `hr_info`, `user_info`, `admin_info`, `score_activities`, `score_question_templates`, `score_questions`, `rate_target_rules`, `rate_rule_clauses`, `clause_template_configs`, `score_records`, `score_answers`, `hr_profile_templates`, `hr_profile_template_fields`, `hr_profile_records`, `hr_profile_record_values`

完整建表语句见 `server/db/init.sql`。

## 详细文档

项目完整上下文、Bug 修复记录、认证流程、数据库详情见 [MEMORY.md](MEMORY.md)。

## 部署

生产环境需要:
1. 修改 `miniprogram/utils/api.js` 中的 `API_BASE` 为生产域名
2. 使用有效的 SSL 证书（如 Let's Encrypt 或微信云托管）
3. 在微信公众平台配置合法域名
4. 修改 `server/.env` 中的数据库连接和 JWT_SECRET
