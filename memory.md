# WHUSU Smart Workspace — 项目完整记忆

> 本文件包含项目全部上下文，新会话打开时先读此文件，如同已有上下文。
> 最后更新：2026-07-26

---

## 1. 项目概述

**WHUSU智慧工作台** — 武汉大学某部门成员互评微信小程序。
正在从 **微信云函数 + NoSQL** 迁移到 **Node.js Express + MySQL 8.0**。

## 2. 目录结构

```
WHUSUSmartWorkspaceServer/
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
DB_USER=whusu_workspace
DB_PASSWORD=your_password
DB_NAME=whusu_smart_workspace
```

MySQL 8.0 Community Server: `C:\Program Files\MySQL\MySQL Server 8.0\`
连接池: mysql2/promise；`DB_POOL_LIMIT` 可配置，生产 API 每实例 20、通知 Worker 10，charset=utf8mb4

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
- `admin_info` — 管理员（`admin_level=super_admin|admin`；超级管理员全局跨组织，普通管理员按 `org_id` 隔离；邀请码按授权范围明文展示与重置）

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
- `admin_info`: 生产迁移前仅 1 条旧最高管理员；两级迁移后规范为全局 `super_admin`
- `hr_info`: **空** — 尚未导入人事数据
- 其余表: 空

### setup-local.bat 行为
1. 测试 MySQL 连接
2. 创建数据库 + 执行 init.sql (如果表已存在则跳过)
3. 插入 system_config 种子数据
4. 创建全局超级管理员（如果已有 `super_admin` 且 `org_id=''` 则跳过）
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

### 登录流程 (miniprogram/subpackages/main/pages/login/login.js)
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

### Bug 13: 全页面缺失 `@swc/runtime/_define_property.js`
**原因**: 项目同时配置了 `swc: false` 与 `disableSWC: false`，开发者工具实际以后一项为准启用 SWC；含对象展开、计算属性和 async 的页面被编译为 `@swc/runtime/*` 引用，但原生构建设置 `nodeModules: false`，运行时没有对应 helper。全局 `Page(uiPreview.attach({...}))` 曾进一步扩大影响范围。

**连锁表现**: 页面脚本未完成 `Page()` 注册后继续出现 `wx://not-found`；接口 `timeout` 是独立网络问题，不是组件路径根因。

**修复**:
- 所有页面恢复直接 `Page({ ... })` 注册，删除生产依赖图中的 `uiPreview` 和批量注入脚本。
- 固定 `project.config.json` 为 `swc: false`、`disableSWC: true`，强制使用不依赖外部 SWC runtime 的编译路径。
- API 超时改为 `wx.request({ timeout: 15000 })`，移除 `setTimeout + abort` 模拟超时。
- 新增 `scripts/miniprogram-compat-audit.js`，检查 runtime 引用、页面包装、本地模块、页面四件套和组件四件套。
- 详细规则见 `docs/miniprogram-compiler-compatibility.md`、`CLAUDE.md`、`AGENTS.md` 和 `.claude/rules/miniprogram.md`。

### Bug 14: 全页面缺失 `@babel/runtime/helpers/unsupportedIterableToArray.js`
**原因**: 关闭 SWC 后仍保留 `enhance: true`，同时 `project.private.config.json` 开启 `compileHotReLoad`。Babel enhance 为大量页面生成 runtime helper，热重载模块表只包含直接 helper，遗漏 `unsupportedIterableToArray` 等递归依赖，页面在 `Page()` 注册前中断。

**修复**:
- 固定有效编译配置为 `nodeModules: false`、`es6: false`、`enhance: false`、`swc: false`、`disableSWC: true`、`compileHotReLoad: false`。
- 兼容性审计同时读取公共与私有配置，并分别校验两份配置，任一文件都不得留下会被覆盖或重新启用的危险开关。
- 清除项目编译缓存并冷启动开发者工具；逐页生成全部 39 个源 JS 的编译产物，确认 Babel/SWC runtime 命中为零。

### Bug 15: 原生文字按钮变成“胖椭圆”

**原因**: 页面级 WXSS 使用 `border-radius: 999rpx`，同时把固定按钮高度写入 `line-height`；当多个长文案按钮被挤进三列并换行时，每一行都会继承整按钮高度，最终形成近圆形或纵向胖椭圆。

**永久规则**:
- 原生 `<button>` 和 `.primary-btn`、`.secondary-btn`、`.danger-btn`、`.approve-btn`、`.reject-btn`、`.dialog-btn` 等完整文字操作按钮，只允许使用柔和圆角矩形：手机 `24–28rpx`、Pad 竖屏 `12–14px`、Pad 横屏 `11–12px`。
- 状态标签、筛选 chip 和紧凑链接统一使用 `--ui-compact-radius`（手机 `18rpx`、Pad 竖屏 `12px`、Pad 横屏 `11px`）；`999rpx`、`999px`、`50%` 仅用于头像、加载圈、进度节点和纯图标圆钮。
- 文字按钮使用 `height: auto`、受控 `min-height`、`line-height: 1.3–1.4` 与上下 padding；手机窄屏每行最多两个文字按钮，长文案改两列或整行。
- 完整文字按钮不得把绝对 `line-height` 设为接近 `min-height`，否则会与继承的上下 padding 叠加成异常高按钮。
- `scripts/ui-audit.js --strict` 会拦截完整文字按钮上的胶囊/圆形半径和异常高度叠加，禁止回归。

### Bug 16: 审核附件随 release 清理而丢失

**原因**: 审核附件曾写入版本目录或旧仓库目录，数据库保存绝对路径；原子发布后的 release 清理会删除这些文件，备份任务又只保存数据库，导致记录存在但附件不可读。

**永久规则**:
- 审核附件固定写入 `/home/ubuntu/whusu-smart-workspace-shared/uploads/audit`，禁止位于仓库或 `whusu-smart-workspace-releases` 内。
- release 中的 `server/uploads` 只能是指向共享目录的软链接，发布前必须校验目标。
- 数据库迁移后运行 `migrateAuditUploads.js`，只接受文件名、大小和 SHA-256 唯一匹配的旧附件，并在文件全部校验完成后事务更新路径。
- 小时备份必须同时生成数据库 `.sql.gz` 与附件 `.uploads.tar.gz`，均先写 `.partial` 再原子改名；备份进程跟随当前 release。

### Bug 17: 通知投递与跨组织分页可靠性不足

**永久规则**:
- 通知 outbox 最多自动尝试 8 次，之后进入 `dead`；健康检查展示死信数量，只能通过受控运维命令按 ID 重试。
- 已完成 outbox 保留 30 天、死信保留 90 天、通知保留 30 天、请求幂等记录保留 90 天；清理由 Worker 每日限次、分批执行。
- 跨组织通知使用 `(created_at, id)` 键集游标，各组织先按相同边界查询后全局合并排序；禁止恢复为随页码增长的全量 offset 查询。
- 门户和消息中心的轮询请求必须防止同一页面重复并发；组织或身份切换后作废旧请求，再补发一次当前上下文请求。

### Bug 18: 弹窗高度、滚动范围与背景触摸职责混淆

**原因**: 普通详情、确认框和短表单与时间表等专业视口共用了固定 `vh` 高度；外层遮罩已经处理安全区，内部操作栏又重复叠加 `env(safe-area-inset-bottom)`，部分页面还同时添加壳体 padding、页脚 padding 和 footer margin，导致按钮下方及内容末尾出现大段空白。

**永久规则**:
- 短确认框和普通复杂表单都保持内容自适应；`complex` 只表示标题、正文、操作栏结构，不能因此强制占满可用视口。条件控件展开、收起时，外壳必须随实际内容增减；正文超过统一的可用高度后由直接子级 `scroll-view` 独立滚动。只有表格、时间表等真正需要稳定工作区的窗口才可显式使用 `viewport` 或 `wide` 高度。
- 居中弹窗的安全区只由 overlay 负责，footer 禁止再次添加底部安全区；底部 sheet 和固定键盘只允许在最外层底边处理一次。
- 同一处垂直间距只能由一层负责，禁止壳体底部 padding、footer padding 与 footer margin 三重叠加。
- 可能换行的标题、详情值、组织名、说明和按钮文案必须显式设置舒展行高：标题约 `1.4–1.5`，正文约 `1.55–1.7`。
- 每次修改包裹型控件都要人工检查短内容、长内容、两行文字及手机/Pad 竖横屏；`scripts/ui-audit.js --strict` 必须保持 `forcedDialogViewport=0`，但脚本不得代替实际渲染检查。

### Bug 19: 弹窗跟随页面滚动、Pad 横向偏移与背景穿透

**原因**: 门户和首页的居中弹窗同时使用了父层 flex 居中，以及子层 `position: absolute + left/right + top: 50% + translateY(-50%)`。手机上左右锚点恰好填满可用宽度，不易察觉；Pad 规则把弹窗 `max-width` 封顶后，绝对定位的约束变为过度约束，弹窗仍从左侧锚点开始布局，右侧间距被浏览器重算，最终明显左偏。

**永久规则**:
- 所有弹窗使用 `root-portal` 脱离页面滚动链；`.ui-overlay` 和 `.ui-overlay-blocker` 固定覆盖 `100vw × 100vh`，`.ui-dialog-shell` 固定使用 `50vw / 50vh + translate(-50%, -50%)` 相对物理可视区域居中。
- 全屏阻断层与窗口外壳必须为同级：阻断层使用 `catchtouchmove="noop"`、`z-index: 0`，窗口使用 `z-index: 1` 且不得拦截祖先触摸移动。这样只锁定背景，不会锁死正文和内层列表。
- 底部 sheet 是常规例外，但 Pad 宽度封顶时必须使用 `left: 50% + translateX(-50%)` 明确居中，不得把手机端对称 inset 与 Pad 的 `max-width` 混用。
- 手机、Pad 竖屏和 Pad 横屏必须实测弹窗左右视觉边距相等；`scripts/ui-audit.js --strict` 必须保持 `miscenteredDialogShell=0`。
- 所有纵向弹窗 `scroll-view` 必须启用 `enhanced`、`scroll-y`、`nested-scroll-enabled`；内层列表优先滚动，标题、底部操作区、遮罩和背景页面均不随之移动。新增或修改弹窗时必须应用 `.agents/skills/wechat-popup-scroll-contract/SKILL.md`。

### Bug 20: 字体层级漂移与相近手机信息卡布局分叉

**原因**: 各页面分别写死字号，Pad 断点只覆盖少量常用类，其余 `rpx` 继续随屏幕放大，导致正文、内容值和页签可能超过标题；首页还在 `max-width: 360px` 断点把信息块强制改为整行，使尺寸相近的手机出现姓名/身份卡片一行与分行两套结果。

**永久规则**:
- 全局字体只使用 `app.wxss` 的语义阶梯：微型、说明、元数据、标签、控件、正文、强调、值、章节、弹窗、页面标题；所有设备保持角色顺序不变。
- 字体在所有设备上使用受控逻辑 `px` 字阶：紧凑手机、标准手机、Pad 竖屏、Pad 横屏四档整体递增；禁止再用 `rpx` 让宽屏手机机械放大文字。横竖屏可以改变布局，不得改变标题、正文、标签之间的比例。
- 弹窗不维护独立放大字号：弹窗标题等同页面章节标题，正文、说明、标签、表单和按钮分别复用页面对应的语义字号；Pad 每一档必须明确大于手机对应档位。
- 页签字号、高度、内边距、间距和圆角统一使用 `--ui-tab-*` 令牌，禁止页面各自恢复胶囊页签或任意高度。
- 姓名/身份等摘要对使用稳定的两列 `minmax(0, 1fr)` 网格；长文字在自己的卡片内安全换行，全宽信息显式跨两列，不得因 360px 等相近手机断点整块掉到下一行。
- 多行标题使用约 `1.4–1.5` 行高，正文和说明使用约 `1.55–1.7`；`scripts/ui-audit.js --strict` 必须保持字体阶梯、页签令牌和摘要网格契约全部为 0 风险。

### Bug 21: 全局媒体查询掩盖页面裸字号与 Pad 装饰区膨胀

**原因**: 旧 UI 审计只要发现 `app.wxss` 存在 520px/900px 媒体查询，就把所有页面记为已适配；页面局部裸写的 `rpx/px` 字号没有被逐条检查。Pad 上这些字号继续随视口放大，语义层级倒挂。登录等低信息页面还在横屏断点强制双栏，并给装饰 Hero 设置大块 `min-height`，把真正操作区挤到一侧。

**永久规则**:
- 所有可见文字和字体字形只能使用 `--ui-type-*` 语义字阶，页面与共享 WXSS 禁止裸写 `font-size: ...rpx/px`；全局存在媒体查询不代表页面局部字号已经响应式化。
- 登录、跳转、认证等低信息工具页在手机、Pad 竖屏和 Pad 横屏都保持单列居中；不得为了填满横向空间凭空拆成左右两栏。
- 装饰 Hero 必须由内容和紧凑内边距决定高度，Pad 横屏禁止大于等于 240px 的固定或最小高度，不得把标题贴到大块空白的底边。
- `scripts/ui-audit.js --strict` 必须保持 `rawFontSizes=0`、`oversizedDecorativeHero=0`；脚本中的每页媒体覆盖统计只能读取该文件自身，禁止再由 `app.wxss` 的断点替所有页面冒充通过。
- 普通卡片、面板、章节和包裹容器必须由内容自然撑开，禁止用大块固定/最小高度或异常单侧内边距“做平衡”；严格审计同时保持 `forcedContentViewport=0`、`oversizedContentPadding=0`。

### Bug 22: Pad 横屏压缩规则误伤手机与 Pad 竖屏

**原因**: 为 Pad 横屏收紧标签、说明文字和卡片留白时，把规则写在横屏媒体查询之外；全局 `!important` 随后覆盖页面原有移动端尺度，造成手机内容过密、Pad 竖屏字体与弹窗比例失衡，而真正的横屏局部控件仍保留被 `rpx` 放大的留白。

**永久规则**:
- 手机竖屏、Pad 竖屏、Pad 横屏必须拥有明确的密度取值：字体统一使用受控逻辑 `px` 字阶；手机布局间距可使用舒适 `rpx`，Pad 竖屏使用稳定 `px` 保持呼吸感，只有 Pad 横屏使用紧凑 `px` 降低纵向浪费。
- 横屏专用的卡片内边距、行距、按钮高度和圆角必须位于 `@media (min-width: 900px) and (orientation: landscape)` 内；禁止把横屏压缩值作为全局 `!important` 规则。
- Pad 竖屏弹窗保留约 20px 单侧屏幕边距和受控阅读宽度，常规上限为 760px；Pad 横屏弹窗使用 1024px 常规上限、1120px 宽表格上限。所有弹窗继续遵守物理视口定位与内部滚动契约。
- 子应用的局部卡片、列表和工具栏不得只依赖全局媒体查询；存在独立 `rpx` 留白时必须分别补充 Pad 竖屏与 Pad 横屏覆盖，并完成真实设备方向视觉检查。

### Bug 23: RootPortal 生命周期导致页面跳转超时

**原因**: 业务页面源码直接声明 `root-portal` 时，即使外层 `wx:if` 为假，旧基础库仍可能提前注册该页面的原生顶层宿主。导航后目标页逻辑、标题、`onShow` 和 `onReady` 均已执行，旧页的绘制层却继续覆盖目标页。这不是登录接口或会话失败，而是页面栈与原生绘制层没有一起完成切换。

**永久规则**:
- 业务页面 WXML 禁止直接声明 `root-portal`。统一使用全局 `viewport-portal` 组件，并且必须把 `wx:if` 写在组件实例本身；弹窗关闭时销毁整个组件，打开时才创建其内部 `root-portal`。禁止让组件常驻后只切换 `enable`。
- 登录页的认证表单只覆盖当前登录页面，使用普通固定弹层，不创建原生脱离层，避免登录页成为后续所有页面的顶层宿主。
- `root-portal` 继续负责把遮罩提升到物理可视区域根层，弹窗的全屏遮罩、屏幕居中和内部滚动契约保持不变。
- 登录成功后先用 `setData` 卸载弹层，再在 `wx.nextTick` 中 `navigateTo` 门户，确保登录页保留在页面栈且旧合成层已经释放。
- 全系统页面跳转统一经过可信导航工具。若目标页已经成为当前页但 `navigateTo` 仍超时，使用 `redirectTo` 原位重建故障目标页，保留前一页和原生返回关系；禁止用 `reLaunch` 清空正常页面栈。
- 登录页每次重新显示都必须释放导航锁；失败提示只能说明页面未打开，不能把已经成功的认证误报为“请重新登录”。

### Bug 24: UI Kit 规则重复定义与静态行内样式绕过设备体系

**原因**: `app.wxss` 曾同时保留两套 `.ui-overlay / .ui-dialog-shell` 几何定义，并在两个横屏媒体块中重复声明页签高度；页面 WXML 又用静态 `style`、`placeholder-style` 写死手机 rpx 间距、字号和颜色。最终表现取决于加载顺序，Pad 可能沿用手机尺寸，弹窗也可能被页面局部规则重新偏移。

**永久规则**:
- `.ui-overlay` 的物理视口几何在 `app.wxss` 中只能有一个定义；设备差异只覆盖令牌和受控宽度，不再复制整套遮罩、中心点与触摸规则。
- 弹窗边距、内边距、分组间距、操作区间距和圆角统一使用 `--ui-dialog-*` 令牌，手机、Pad 竖屏、Pad 横屏分别取值。
- WXML 禁止静态 `style` 和 `placeholder-style`；进度、坐标、拖拽、时间表和动画等数据驱动几何可以保留动态行内样式，其余表现必须进入语义类。
- `scripts/ui-audit.js --strict` 必须保持 `staticInlineStyles=0`、`duplicateGlobalUiContracts=0`，并继续保持全部弹窗定位、滚动和触摸契约为 0 风险。

### 弹窗内部卡片与留白规则（2026-08-03）

- 弹窗物理视口定位、正文滚动和内部视觉层级必须分开维护。默认只使用 `ui-dialog-shell + ui-dialog-content` 两个视觉层；单一表单或详情使用纯布局 `ui-dialog-stack`，禁止重复绘制同质内卡。
- 多个独立分区共同存在时，正文叠加 `ui-dialog-content--stack` 变为透明滚动层，由 `ui-dialog-section / summary / toolbar / list-panel` 承担视觉分组。`.ui-dialog-section` 不得成为普通正文中的唯一分区。
- 页面级 `.form-body / .detail-body / .detail-popup-form` 在通用正文表面内只能承担布局或专用子控件样式，不能再次同时声明 padding、背景、边框和阴影。
- 手机、Pad 竖屏、Pad 横屏的外壳/正文/分区留白固定分别为约 `32rpx/18rpx/22rpx`、`24px/14px/16px`、`22px/12px/14px`。横屏更紧凑但不能把压缩值泄漏到手机。
- `RootPortal` 原生顶层宿主不保证继承 `page` 上的 CSS 自定义属性。所有弹窗尺寸、间距、字体和颜色令牌必须直接作用于 `.ui-overlay / .ui-sheet-overlay`，关键宽高和 padding 声明必须提供手机安全回退值；否则 `calc()` 会整体失效并让窗口按内容收缩、内部留白归零。
- `scripts/ui-audit.js --strict` 必须保持 `redundantDialogSingleSection=0`、`duplicateDialogWrapperSurfaces=0`，并检查正文表面、短弹窗内容卡、三档弹窗间距令牌和 RootPortal 内部令牌所有权；脚本通过仍不能替代微信开发者工具逐窗视觉检查。

### 发布与编译配置锁

- `project.config.json` 与已跟踪的 `project.private.config.json` 必须同时固定 `nodeModules=false`、`es6=false`、`enhance=false`、`swc=false`、`disableSWC=true`、`useCompilerPlugins=false`、`compileHotReLoad=false`；兼容审计分别检查两份配置，禁止私有配置覆盖安全值。基础库升级必须单独完成全页面绘制与导航回归，不能和故障修复混在同一次变更中。
- 生产连接池固定通过 `DB_POOL_LIMIT` 控制：两个 API 实例各 20，通知 Worker 10；单进程上限 50，禁止恢复为每进程 50 的默认值。

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
- `showShortToast()` 不得按字数机械截断提示语，避免把“请重新选择组织或身份”等操作指引截成无意义的半句话。
- Toast 本身仍应简短；若完整说明超过两行，应改用页面内提示条或自绘确认层。

---

## 7. 关键约束

- **唯一的本地工作目录（用户明确要求）**：所有代码修改、Git 检查、提交、推送、CI 跟踪和部署操作都必须从 `D:\WeChat\WHUSUSmartWorkspace\WHUSUSmartWorkspaceServer` 执行。不得再使用带任务名、修复名或旧项目名后缀的并行仓库作为正式工作目录；需要临时隔离时只能在任务结束前合并回该目录并清理临时 worktree。
- **固定交付规则（用户明确要求）**：每次完成项目任务后，都必须提交本次相关改动、推送当前分支，并等待远端 CI 自动部署完成；随后核对生产环境运行提交、PM2 服务状态和公开健康接口，确认正常后再向用户反馈结果。未经上述验证，不得把任务表述为已完成。若提交、推送、CI 或部署受阻，必须明确报告阻塞点，不能静默跳过。
- **统一发布分支**：`main` 是普通用户端、管理端和服务端的唯一生产发布基线；功能分支必须先合并到 `main`，GitHub Actions 仅在 `main` 质量门禁通过后部署该提交，远端部署脚本和人工重试也只能核验 `origin/main`。
- **面向用户文案规则（用户明确要求）**：所有页面标题、说明、空状态、按钮、Toast、确认层、通知和服务端返回文案必须正式、简洁，并直接说明用户要做什么。禁止出现“上下文、会话、参数、标识、主体、字段映射、快照、哈希、令牌、数据库”等实现术语；禁止出现“一个账号，全部身份”“都从这里登录”“从这里登录”等解释系统架构的口号或口语化宣传语。身份、组织、岗位、权限等确有业务含义的词可以使用，但必须落到用户能理解的操作或结果。
- **文案审计方式**：搜索只能帮助定位文案，不能代替审计。每次修改可见文案时，必须结合所在页面、触发操作、用户身份和后续动作逐句用自然语言判断；失败提示优先写成“请……”的下一步，完成提示优先写成“已……”的结果，删除等高风险操作保留必要后果说明，其他约束性表述尽量删除。前端不得直接展示内部异常；服务端未预见的返回文案必须经过公共文案保护。
- **登录绑定认证续接**：`userLogin` / `adminLogin` 返回 `need_bind` 或 `auto_bind_available` 时，返回的 JWT 是后续绑定请求的认证会话，前端必须在展示绑定表单或确认弹窗之前同步保存 `token + role` 并清空旧组织上下文；绑定接口始终保持受保护，禁止为了兼容前端遗漏而改成公开接口。CI 必须从登录响应一直验证到绑定请求的 `Authorization`、`X-Role` 和空组织头，不能只 mock 业务返回值。
- API 名称、参数、响应格式 = 原云函数
- 前端包装: `{ result: res.data }` 包裹服务端响应
- `safeString()` 转换 null/undefined 为 '' — NULL 比较的关键
- `generateId()` = 64 位 base-62 随机字符串 ([0-9a-zA-Z])
- 所有 ID 均为 VARCHAR(64)，无自增主键
- departments/identities/work_groups 无 sort_order
- 微信开发者工具需开启"不校验合法域名"(自签名 HTTPS 证书)
- Windows 批处理: `setlocal enabledelayedexpansion` 时在 `endlocal` 前捕获 ERRORLEVEL

### 统一页面顶部与空间分配规则（2026-07-29）

- 所有页面导航栏标题统一为“子应用名称 - WHUSU智慧工作台”；不得只显示品牌名、技术模块名或页面内部状态。
- 页面顶部统一使用微信原生导航栏和原生返回键，并在 `app.json` 中显式配置 `navigationStyle: "default"`；不能只删除旧的 `custom` 配置，因为开发者工具增量编译可能继续沿用旧运行态。不得再用全局自定义状态栏/导航栏替换；原生导航负责不同设备的安全区、胶囊避让、返回手势和页面栈表现。
- 登录成功必须用 `navigateTo` 进入门户并保留登录页，确保门户显示微信原生返回键；禁止用 `redirectTo` 替换登录页。门户确实返回登录页时等同于退出登录，必须清除统一认证、当前组织、当前身份及相关缓存；显式退出优先返回已有登录页，不能重复叠加登录页；进入子应用、切换身份或普通页面隐藏不得触发退出。
- 所有登录后的门户页、子应用页和管理页统一使用共享顶部身份卡。身份卡必须展示 WHUSU智慧工作台、当前子应用或页面名称、姓名、当前身份、当前组织，以及“组织与身份”切换入口；禁止页面自行复制一套相似顶部卡。
- 共享顶部身份卡沿用上一版门户的信息层级：姓名直接显示在蓝色主卡上并作为主要标题，身份及部门/职能组为次级信息，组织与身份切换位于紧凑的内层玻璃行；页面名称只能作为小号元数据，禁止放大为主标题。
- 共享顶部身份卡禁止首字头像、姓名首字特写和独立的装饰性品牌方块，避免装饰元素抢占个人姓名与工作信息的视觉重点。
- 统一登录默认有效期为 7 天。业务请求遇到登录过期时，先使用新的微信登录凭证无感恢复并仅重试原请求一次；恢复失败、绑定失效或账号不可用时，必须清理失效状态、明确提示“登录已过期，请重新登录”并回到登录页，禁止让各业务页误报“请稍后刷新”。
- 应用服务宫格按可用宽度完整分配：手机 3 列、Pad 竖屏 4 列、Pad 横屏 5 列。使用 CSS Grid 的等分列，禁止用百分比宽度减固定间距，避免像素取整导致末列换行和右侧大片空白。
- 包裹型控件由内容自然撑开，一个视觉间距只能有一个所有者。外层内边距、内层首尾边距、页脚边距不得叠加形成空尾；也不得为了消除空白而把内容贴边。
- 按钮、页签、选择项和宫格项使用 flex 居中与对称上下内边距。禁止同时叠加固定高度、同值行高和上下内边距；多行文字必须使用可读行高并由内容自然增高。
- 全局一级页签必须使用统一的高度、字号和对称内边距令牌，禁止退化成扁平文字条；标题左侧蓝色竖条必须以 `top: 50%` 配合 `translateY(-50%)` 相对完整标题行垂直居中，禁止使用固定 `rpx/px` 顶部偏移。
- 手机、Pad 竖屏、Pad 横屏必须检查短内容、长内容、弹框、空状态、嵌套卡片和宫格。`scripts/ui-audit.js --strict` 必须保持 `workspaceShellIssues=0`、`stackedButtonMetrics=0`、`forcedDialogViewport=0`、`oversizedContentPadding=0`，脚本仅作为回归门禁，不能替代逐页视觉判断。
- 人事列表卡片只代表自然人，保持简洁：展示姓名、学号、绑定/审核状态，以及存在岗位时的岗位数量；所属部门、身份和“工作分工（职能组）”均属于岗位，只在查看/编辑详情中按岗位展示，不得放回人员基础字段或列表摘要。
- 人事岗位不存在“主要岗位/主要身份”概念：前端不显示，接口不返回，数据库不得保留 `is_primary`、`active_primary_membership_id` 或等价字段。当前使用哪个身份由登录后的组织与身份选择决定，不能反向制造主要岗位。
- 人事详情属于长表单，但壳体仍由内容自然撑开，只对内部滚动区设置视口上限；新增或编辑岗位后必须把岗位编辑器滚入可见区域，多个岗位之后的补充资料字段仍须可滚动到达和编辑。工作分工未设置时整行隐藏，不显示“未设置”占位卡。
- 组织或身份切换完成后，必须先判断原页面是否仍支持新身份及其权限；不支持时直接回到新版门户，禁止留在原子应用显示空权限页、加载失败或要求刷新。
- Pad 控件不能随屏幕机械放大：完整文字按钮约 44px、紧凑操作约 32px、一级页签约 40px，圆角必须明显小于高度的一半；“使用中”等状态标签使用小圆角矩形和 3–4px 对称上下内边距，禁止胖椭圆。
- 管理工作台在手机、Pad 竖屏和 Pad 横屏均沿用顶部玻璃分段选择器。不得只在横屏改为宽大的左侧纵向栏，避免同一功能在不同设备上像两套软件，也避免导航项与文字之间浪费空间。
- 人事详情按操作者实际权限展示同一自然人的跨组织身份：人事查看/修改权限只作用于普通岗位，管理员查看/修改权限只作用于管理身份；服务端必须推导可见组织并在目标组织内重新验权。只有超级管理员可以新增超级管理员。
- **认证功能归属人事（2026-08-04）**：管理端不再设置“认证与账号”人员目录。成员外卡和详情摘要只显示“冻结中 / 待恢复 / 已绑定 / 待激活 / 未绑定”中优先级最高的同一个状态；详情的“账号与认证”不得再用“当前状态、微信绑定、恢复方式”字段卡重复表达，只保留认证码、恢复码、设备、待处理事项及对应操作。批量选择与生成、撤销操作和成员筛选并列常驻，不另套模块，手机双列、Pad 四列，无适用目标时原生禁用；状态气泡和按钮必须保留柔和但不过半高的圆角，既不能方硬，也不能变成胖椭圆。只有“认证设置”作为人事信息下级页签保留。普通用户的恢复码、登录口令和设备管理仍统一并入“人事信息 → 账号与登录”。旧地址仅负责跳转兼容，内部操作日志只保留在服务端审计中。
- **人事身份模型边界（2026-08-04）**：历史 `hr_info.id` 到统一自然人的解析由 `personIdentityOverview` 模型负责；`unifiedIdentity` 不提供 `resolvePersonByLegacyHrId`。人事资料路由不得跨模型调用未导出方法，布局回归测试必须校验这一边界，避免查看、编辑和认证目录同时失效。
- **认证目录与局部更新**：认证管理必须一次取得当前管理员权限范围内的完整人员目录，再在小程序内即时搜索和筛选，禁止使用 100/200 条固定上限造成假性缺失；批量生成或撤销按服务端安全批次覆盖全部选中人员。冻结、解冻、处理恢复、退出设备等单条操作只更新对应记录，禁止重新加载整个页面、重置筛选或改变滚动位置。
- **人事目录故障隔离**：成员资料是人事页面的基础数据，认证、账号、恢复状态属于增强数据。增强接口失败时不得清空或阻塞成员资料，前端必须分别结算并给出准确的局部状态；禁止再用 `Promise.all` 将基础目录与可降级能力绑成全有或全无。服务端新增或修改人员目录 SQL 时必须以 `server/db/init.sql` 和迁移后的真实结构为准，并加入可在全新数据库执行的回归检查，不能引用臆造字段后只靠静态审计放行。
- **全局圆角上调与全量源码整改（2026-08-04）**：按钮、页签、选择项和状态气泡的圆角统一上调一档并收口到 `--ui-control-radius` 与 `--ui-compact-radius`：手机主按钮 `28rpx`、紧凑控件 `18rpx`、页签 `24rpx`；Pad 竖屏主按钮 `14px`、紧凑控件 `12px`；Pad 横屏主按钮与页签 `12px`、紧凑控件 `11px`。圆角必须明显小于控件高度一半；页面级 WXSS 不得用固定数值覆盖令牌，可见文本控件不得保留 `999rpx` 胶囊（图标型关闭钮、头像、加载圈、进度节点除外）。本次已对全部分包与主包页面样式逐条整改约 169 处，页面源码直接引用令牌，不再依赖全局 `!important` 兜底；严格 UI 审计把全部标签/气泡/紧凑操作类纳入覆盖清单，并拦截页面级胶囊与方硬标签。卡片、输入框、弹窗外壳圆角不变。
- **人事成员选择与微型标签（2026-08-04）**：人事信息成员外卡的批量选择改为内联等宽紧凑胶囊“选择 / 已选”（固定 min-width、不带 ✓ 前缀），位于姓名学号行左侧、与状态气泡同排，不单独占行，样式复用人员选择器的 `.select-chip` 语言；查看/编辑、删除、通过、驳回等行内操作使用 `.hr-action-chip`，圆角走标准按钮档（手机 28rpx、Pad 竖屏 14px、Pad 横屏 12px）；账号状态气泡使用紧凑圆角令牌。CSV/校验类型等微型元数据标签与认证目录勾选框一并收口。严格 UI 审计新增“固定圆角与设备档位不符即报错”：固定值必须命中紧凑 `18rpx/12px/11px`、按钮 `28rpx/14px/12px`、页签 `24rpx/12px/12px`，`999rpx/50%` 仅保留给头像、加载圈、进度节点、时间轴节点和纯图标圆钮。
- **人事详情标题与账号操作（2026-08-04）**：人事详情弹窗标题采用“人事详情·姓名”，与“场地借用·场地名”同款专业格式。账号与认证区的生成恢复码、冻结/解除冻结、解绑微信统一使用 `secondary-btn` 浅蓝玻璃样式（以生成恢复码为准，不再用红色危险样式）；操作按钮按设备分三套布局：手机与 Pad 竖屏 3 列并行，Pad 横屏 6 列一行，避免单个按钮独占一行。
- **口令登录被组织上下文拦截（2026-08-05）**：`orgContextMiddleware` 的旁路名单漏掉 `/api/auth/password/session` 与 `/api/auth/claims/redeem`，导致登录入口在携带残留 `X-Active-Org` 时被“请先登录”拦截；已把两个公共登录入口补入 `ORG_CONTEXT_BYPASS_PATHS`，并新增中间件回归测试。WXML 标题等文案禁用 `+` 字符串拼接，统一用嵌套 `<text wx:if>` 写法，避免微信编译器报错。
- **登录口令最低长度放开（2026-08-05）**：登录口令不再限制最短长度。服务端移除 `passphrase_min_length` 校验与策略钳制，管理端移除“口令最短长度”输入框，客户端移除长度校验，输入阶段零校验；仅保存时校验：口令为空提示“请输入登录口令”，过弱口令（123456/password 等前缀）提示“口令过于简单”。`auth_policy` 列保留但始终写 0，新增幂等迁移把现有行置 0。
- **口令保存与客户端接口名校验（2026-08-05）**：`callFunction` 的接口名正则不允许连字符，导致 `auth/security/recovery-credential`（口令保存/恢复码轮换）在客户端直接被拦、从不发请求并报“未保存，请重试”；已放开正则允许 `-`。
- **管理端成员登录设置（2026-08-05）**：新增 `POST /admin/auth/security`、`/sessions/revoke`、`/passphrase`、`/passphrase/revoke`，权限 `auth.accounts.recover`，账号按“自然人 + 当前组织”服务端解析；管理端人事详情“账号与认证”分区新增登录设备列表（逐台退出）与登录口令（设置/清除），复用确认层与紧凑按钮规范，操作仅局部更新。
- **场地借用多审批流（2026-08-05）**：`venue_approval_flows` 支持每场地多流程（新增 `allow_user_select / allow_designate_first / allow_designate_next`），`venue_bookings` 新增 `approval_flow_state_json` 保存每条流程的当前步/已批步骤/指定人；统一引擎 `venueApprovalMultiFlow` 供提交、待办、通过、驳回共用。并行流程下操作者满足任一激活流程当前步即可见可批；通过后按“严格全步骤”重匹配（历史每步审批人当前仍满足该步条件），任一流程走完即通过、其余终止，绝不跨流程串步；下一步指定仅限单流程模式且指定人必须满足该步规则；所有流程都无下一步候选人时保持待审批并标记 `candidateMissing`，不自动驳回。迁移 `20260805090000_venue_multi_flow_approval.sql` 幂等落地。
- **场地多流程管理界面（2026-08-05）**：管理端规则页去除“当前组织·借用审批”顶部状态卡与“编辑中/当前流程”概念；多条审批流程完全平等，每条流程卡片直接提供“编辑 / 删除”按钮；“指定第一步 / 指定下一步”合并为单一“指定审批人”开关，前后端按同一开关生效（`allow_designate_first` 与 `allow_designate_next` 同步写入、引擎按两者取或判断）。
- **门户预览与审批待办修复（2026-08-08）**：门户待办/通知预览盒子高度最多 3 条并框内滚动，令牌 `--ui-message-preview-row/--ui-message-preview-gap` 控制，删除按条目数估算的行内高度；借用申请表单底部由容器提供对称留白。`listPendingVenueApprovals` 重构后残留的 `applicantHrInfo` 引用改为使用引擎返回值，修复“待办点击后空白”；UI 规范已固化到 ui-kit-manager skill 的 `references/ui-kit-standards.md` 并在 SKILL.md 引用。

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

## 10. 人事统一治理与设备识别（2026-08-04）

- 管理端认证、账号状态、恢复方式和认证设置全部归入人事信息；成员外卡仅保留一个合并状态，单人操作位于详情，批量操作位于成员筛选工具区。前端不再展示独立认证页或操作记录，服务端继续保留安全审计。
- `listHrGovernance` 返回当前权限范围内的完整人员目录。认证、冻结、解冻和凭据操作只更新对应人员行，不能重载整页或丢失筛选状态。
- 登录设备使用小程序本地持久化安装标识的 HMAC 摘要；无法持久化时设备标记为无法识别，不使用 OpenID、姓名、学号、IP 或硬件指纹推断设备。
- 部署迁移会撤销全部有效会话但保留历史；用户下次微信或口令登录时重新建立设备会话。
- 跨组织补充资料使用 `person_profile_values`，唯一键为自然人、去首尾空格后的字段名和完全一致的字段类型。只合并已生效值，冲突按最新生效时间选择，所有来源写入历史表。
```
