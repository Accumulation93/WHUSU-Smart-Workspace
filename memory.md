# REDSU Scoring System — 项目完整记忆

> 本文件包含项目全部上下文，新会话打开时先读此文件，如同已有上下文。
> 最后更新：2026-05-04

---

## 1. 项目概述

**REDSU 考核评分系统** — 武汉大学某部门成员互评微信小程序。
正在从 **微信云函数 + NoSQL** 迁移到 **Node.js Express + MySQL 8.0**。

## 2. 目录结构

```
ScoringServerDomain/
├── server/                         # Node.js Express 后端 (新)
│   ├── .env                        # 数据库、微信、JWT 密钥
│   ├── package.json
│   ├── certs/
│   │   ├── key.pem                 # ECC 私钥 (prime256v1)
│   │   └── cert.pem                # 自签名证书 (CN=localhost, 10年)
│   ├── db/
│   │   ├── init.sql                # 完整 MySQL 建表语句 (535行)
│   │   └── setup-local.bat         # 交互式本地数据库初始化脚本
│   └── src/
│       ├── index.js                # HTTPS Express 入口 (端口 3000)
│       ├── config/db.js            # mysql2/promise 连接池
│       ├── middleware/auth.js      # JWT Bearer → req.openid
│       ├── routes/                 # 15 个路由文件
│       │   ├── auth.js             # 登录/绑定
│       │   ├── admin.js            # 管理员管理
│       │   ├── hr.js               # 人事信息 + CSV批量导入
│       │   ├── departments.js      # 部门CRUD
│       │   ├── identities.js       # 身份类别CRUD
│       │   ├── workGroups.js       # 工作分工商CRUD
│       │   ├── org.js              # 组织切换/归档
│       │   ├── activities.js       # 评分活动
│       │   ├── templates.js        # 评分问题模板
│       │   ├── rules.js            # 评分规则
│       │   ├── scoring.js          # 评分提交
│       │   ├── results.js          # 评分结果
│       │   ├── hrProfile.js        # 人事扩展资料
│       │   ├── user.js             # 用户端API
│       │   └── system.js           # 系统配置
│       ├── models/                 # 20 个 model 文件 (原生 SQL)
│       └── utils/
│           ├── helpers.js          # safeString, generateId(64位), toNumber, roundScore
│           └── csv.js              # CSV 解析工具
├── miniprogram/                    # 微信小程序前端 (活跃)
│   ├── app.js / app.json / app.wxss
│   ├── utils/api.js                # wx.request 封装 (callFunction)
│   └── pages/
│       ├── login/login.js          # 双角色登录 + 绑定
│       ├── home/home.js            # 主页 (用户/管理双视图)
│       ├── score/score.js          # 评分表单
│       ├── admin/admin.js          # 管理面板 (~5400行)
│       ├── scorerTasks/            # 评分人任务列表
│       └── settings/               # 设置页
├── miniprogramCloud/               # 原始云函数前端备份
└── cloudfunctions/                 # 63个云函数 (已删除，迁移到 Express)
```

## 3. 数据库架构 (MySQL 8.0)

### 连接信息 (server/.env)
```
DB_HOST=localhost
DB_PORT=3361
DB_USER=redsu
DB_PASSWORD=redsu
DB_NAME=redsu_scoring
```

MySQL 8.0 Community Server: `C:\Program Files\MySQL\MySQL Server 8.0\`
连接池: mysql2/promise, connectionLimit=10, charset=utf8mb4

### 表结构总览 (server/db/init.sql)

**所有表使用 VARCHAR(64) 作为主键**，ID 由 `generateId()` 生成（64位 base-62 随机字符串）。
**无自增 ID，无 code 字段**（外键直接用 id）。

#### 1. 基础组织
- `organizations` — 组织记录 (id, name)
- `system_config` — 系统配置 (id='default', timezone=8, current_organization)

#### 2. 组织架构 (无 sort_order)
- `departments` — 部门 (id, name, description)
- `identities` — 身份类别 (id, name, description)
- `work_groups` — 工作分工 (id, name, department_id)

#### 3. 人事信息
- `hr_info` — 人事记录 (id, name, student_id UNIQUE, department_id, identity_id, work_group_id)

#### 4. 用户绑定
- `user_info` — 普通用户 (openid UNIQUE, hr_id)
- `admin_info` — 管理员 (openid, admin_level=root_admin|super_admin, bind_status, invite_code)

#### 5. 评分活动与模板
- `score_activities` — 评分活动 (name, start_date, end_date, is_current)
- `score_question_templates` — 评分问题模板 (name, description)
- `score_questions` — 模板内的问题 (template_id FK, sort_order, question, score_label, min/start/max/step_value)

#### 6. 评分规则
- `rate_target_rules` — 评分人规则 (activity_id FK, scorer_department_id, scorer_identity_id, scorer_key)
- `rate_rule_clauses` — 规则条款 (rule_id FK, scope_type, target_identity_id)
- `clause_template_configs` — 条款↔模板关联 (clause_id FK, template_id FK, sort_order, weight)

#### 7. 评分记录
- `score_records` — 评分记录 (activity_id, rule_id, scorer_id, target_id, template_config_signature)
- `score_answers` — 评分答案 (record_id FK, question_index, score)

#### 8. 人事扩展资料
- `hr_profile_templates` — 资料模板 (template_key UNIQUE, edit_mode)
- `hr_profile_template_fields` — 模板字段 (template_id FK, sort_order, label, type, validation rules)
- `hr_profile_records` — 资料记录 (hr_id, audit_status, rejection_reason)
- `hr_profile_record_values` — 资料值 (record_id FK, field_id, field_value, is_pending)

#### 9. 历史表 (组织切换归档)
每个主要表都有对应的 `_history` 表：departments, identities, work_groups, hr_info, user_info, admin_info, score_activities, rate_target_rules, rate_rule_clauses, clause_template_configs, hr_profile_templates, hr_profile_template_fields, score_records, score_answers, hr_profile_records, hr_profile_record_values

注意：organizations 没有 _history 表（组织本身不随组织切换产生历史）。

### 当前数据状态
- `admin_info`: 1条 — 陈逸凡, student_id=2023302181034, admin_level=root_admin, invite_code=A9U49V
- `hr_info`: **空** — 尚未导入人事数据
- 其余表: 空

### setup-local.bat 行为
1. 测试 MySQL 连接
2. 创建数据库 + 执行 init.sql (如果表已存在则跳过)
3. 插入 system_config 种子数据
4. 创建 root admin (如果已有 root_admin 则跳过)
5. 显示所有表

---

## 4. 认证流程

### JWT 中间件 (server/src/middleware/auth.js)
- 提取 `Authorization: Bearer <token>` 请求头
- 用 JWT_SECRET 验证
- 设置 `req.openid` (无效token则为空字符串)
- **不拒绝未认证请求** — 由各路由自行检查

### 前端 API 层 (miniprogram/utils/api.js)
```js
const API_BASE = 'https://localhost:3000/api';
callFunction({ name, data, success, fail })
// 自动添加 Authorization: Bearer <token>
// 响应包装: success({ result: res.data })
```

### 登录流程 (miniprogram/pages/login/login.js)
1. 用户选择角色 → 点击登录
2. `wx.login()` 获取 code
3. POST /api/userLogin 或 /api/adminLogin 携带 `{ code }`
4. 服务端优先检查 JWT (req.openid)，其次使用微信 code2session，最后使用 code 作为开发环境 openid
5. 前端处理:
   - `login_success` → 保存 token + profile → 跳转主页
   - `need_bind` → 保存 token → 显示绑定表单
   - 其他 → toast 错误信息

### 关键响应契约 (必须精确匹配)
- **userLogin success**: `{ status: 'login_success', token, user: { id, hrId, name, studentId, departmentId, department, identityId, identity, workGroupId, workGroup } }`
- **userLogin need_bind**: `{ status: 'need_bind', token }`
- **adminLogin success**: `{ status: 'login_success', token, user: { ...同上..., adminLevel } }`
- **bindUserInfo success**: `{ status: 'success', message: '绑定成功', hrInfo: { id, name, studentId } }`
- **bindAdminInfo success**: `{ status: 'success', message: '管理员绑定成功', token, adminLevel }`

### openid 处理注意
- `safeString()` 将 null/undefined 转为 '' — 对 NULL openid 检查至关重要
- admin_info.openid=NULL 表示邀请码未被绑定
- 两个登录路由都必须在微信 API 不可达时使用开发回退 (code 作为 openid)

---

## 5. 所有已修复的 Bug

### Bug 1: setup-local.bat "此时不应有 0"
**原因**: `for /f '...'` 中 `'root_admin'` 的单引号破坏了命令分隔符
**修复**: 使用 `for /f "usebackq skip=1" %%c in (\`mysql ...\`)` (反引号分隔)

### Bug 2: 绑定时 "请先登录"
**原因**: need_bind 响应不带 token，绑定时 req.openid 为空
**修复**: userLogin/adminLogin 现在在 need_bind 响应中也返回 token

### Bug 3: 前端从未保存 JWT token
**原因**: handleLoginResult/handleBindResult 从未调用 wx.setStorageSync
**修复**: 在两个 handler 中添加 `wx.setStorageSync('token', result.token)`

### Bug 4: admin.openid=NULL 时 "邀请码已被使用"
**原因**: `safeString(NULL)=''`, `'' !== 'userOpenid'` → true，空 openid 被误判为已绑定
**修复**: 改为 `if (boundOpenid && boundOpenid !== openid)` — NULL/空 openid 视为可用

### Bug 5: adminLogin 缺少微信 API 开发回退
**原因**: adminLogin 没有 `if (!openid) openid = code` 的回退逻辑
**修复**: 添加与 userLogin 匹配的回退逻辑

### Bug 6: 管理员登录成功却显示 "暂时无法登录"
**原因**: adminLogin 返回 `status: 'success'`（应为 `login_success`），且返回扁平字段而非 `user` 对象
**修复**: adminLogin 现在返回 `status: 'login_success'` + 完整 `user` 对象

### Bug 7: bind 响应格式不匹配
**原因**: 前端检查 `status === 'bind_success'` 但服务端返回 `status: 'success'`
**修复**: 前端改为检查 `status === 'success'`，绑定后关闭弹窗即可

### Bug 8: 普通用户登录后跳转管理员页面
**原因**: (1) userLogin 忽略 JWT 中的 openid，refreshUserFromCloud 调用时无 code 返回 need_bind → 触发 profile 删除和角色切换
**修复**: userLogin 优先检查 req.openid，home.js 错误路径不再删除已有 user profile

### Bug 9: CSV 批量导入抹去 work_group 字段
**原因**: 更新已有记录时无条件覆盖所有字段，CSV 不含 workGroup 则覆盖为空
**修复**: 更新路径改为 `row.workGroupName ? workGroupId : safeString(prev.work_group_id)`

### Bug 10: setup-local.bat "Unknown command '\`'"
**原因**: MySQL CLI 将 `\`` 中的 `\` 解释为客户端命令前缀
**修复**: 移除反斜杠，仅使用反引号引用 MySQL 标识符

### Bug 11: Toast 提示文字被截断 (各页签)
**原因**: 微信小程序 `wx.showToast` title 限制约 7 个中文字符，多条消息超过此限制
**修复**: 
- 修改 `showShortToast()` 函数（admin.js + home.js）自动截断超长文本至 7 字符 + "…"
- 精简所有超过 7 个中文字符的固定 toast 消息（约 40+ 处）
- 涉及文件: admin.js, home.js, score.js, login.js

### Bug 12: 人事编辑页选择器加载不全
**原因**: `editHr` 和 `startCreateHr` 方法没有调用 `updateHrFormOptions()` 填充部门/身份/工作分工下拉选项
**修复**: 在两个方法中添加 `this.updateHrFormOptions()` 调用

---

## 6. 最新功能更新 (2026-05-04)

### 评分问题拖拽排序
- **admin.wxml**: 每个问题卡片添加拖拽手柄 (☰) + ↑↓ 圆形箭头按钮
- **admin.js**: 
  - `moveQuestionUp/Down(index)` — 按钮交换相邻问题
  - `startQuestionDrag/onQuestionDragMove/endQuestionDrag` — 长按拖拽排序
  - `draggingQuestionIndex` 状态追踪，拖拽中卡片半透明
  - 删除/重置/编辑时重置拖拽状态
- **admin.wxss**: `.question-header`, `.drag-handle`, `.reorder-btn` 等样式
- **服务端无需修改**: `templates.js` 保存时以数组索引 `i` 为 `sort_order` 重新写入

### ID 格式变更
- 所有记录 ID 从 32 位 hex 改为 **64 位 base-62 随机字符串** (generateId)
- 填充 VARCHAR(64) 最大长度，避免碰撞

### Toast 消息截断修复
- `showShortToast()` 增加了超 7 字符自动截断逻辑
- 40+ 条固定 toast 消息精简至 ≤7 个中文汉字

---

## 7. 关键约束

- API 名称、参数、响应格式 = 原云函数
- 前端包装: `{ result: res.data }` 包裹服务端响应
- `safeString()` 转换 null/undefined 为 '' — NULL 比较的关键
- `generateId()` = 64 位 base-62 随机字符串 ([0-9a-zA-Z])
- 所有 ID 均为 VARCHAR(64)，无自增主键
- departments/identities/work_groups 无 sort_order
- 微信开发者工具需开启"不校验合法域名"(自签名 HTTPS 证书)
- Windows 批处理: `setlocal enabledelayedexpansion` 时在 `endlocal` 前捕获 ERRORLEVEL

## 8. 待办事项

1. 导入 HR 人事数据 (hr_info 表为空)
2. 端到端测试: 普通用户登录 → 绑定 → login_success → 主页
3. 端到端测试: 管理员登录 → 绑定 → login_success → 管理面板
4. 创建组织、部门、身份分类、工作分工
5. 测试完整评分流程
6. 部署生产环境 (有效 HTTPS 证书或云域名)

## 9. 环境设置

### 前置条件
- Node.js 16+
- MySQL 8.0 Community Server
- 微信开发者工具

### 快速启动
```bash
# 1. 初始化数据库
cd server/db
# 双击运行 setup-local.bat

# 2. 启动后端
cd server
npm install
npm start
# HTTPS 服务运行在 https://localhost:3000

# 3. 用微信开发者工具打开 miniprogram/ 目录
# 设置 → 不校验合法域名 ☑
```
