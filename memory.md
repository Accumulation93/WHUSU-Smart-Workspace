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
- 原生 `<button>` 和 `.primary-btn`、`.secondary-btn`、`.danger-btn`、`.approve-btn`、`.reject-btn`、`.dialog-btn` 等完整文字操作按钮，只允许使用 `16–24rpx`（Pad 为 `10–14px`）的紧凑圆角矩形。
- `999rpx`、`999px`、`50%` 仅用于状态标签、筛选 chip、紧凑内联链接、头像和纯图标控件。
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

### Bug 18: 居中弹窗固定占满视口导致底部大段留白

**原因**: 普通详情、确认框和短表单与时间表等专业视口共用了固定 `vh` 高度；外层遮罩已经处理安全区，内部操作栏又重复叠加 `env(safe-area-inset-bottom)`，部分页面还同时添加壳体 padding、页脚 padding 和 footer margin，导致按钮下方及内容末尾出现大段空白。

**永久规则**:
- 普通居中弹窗和纵向 `scroll-view` 必须 `height: auto`，只用 `max-height` 限制溢出；固定视口仅限时间表、签名定位、双向数据网格等确有需要的专业界面。
- 居中弹窗的安全区只由 overlay 负责，footer 禁止再次添加底部安全区；底部 sheet 和固定键盘只允许在最外层底边处理一次。
- 同一处垂直间距只能由一层负责，禁止壳体底部 padding、footer padding 与 footer margin 三重叠加。
- 可能换行的标题、详情值、组织名、说明和按钮文案必须显式设置舒展行高：标题约 `1.4–1.5`，正文约 `1.55–1.7`。
- 每次修改包裹型控件都要人工检查短内容、长内容、两行文字及手机/Pad 竖横屏；`scripts/ui-audit.js --strict` 必须保持 `forcedDialogViewport=0`，但脚本不得代替实际渲染检查。

### Bug 19: Pad 弹窗宽度封顶后横向偏移

**原因**: 门户和首页的居中弹窗同时使用了父层 flex 居中，以及子层 `position: absolute + left/right + top: 50% + translateY(-50%)`。手机上左右锚点恰好填满可用宽度，不易察觉；Pad 规则把弹窗 `max-width` 封顶后，绝对定位的约束变为过度约束，弹窗仍从左侧锚点开始布局，右侧间距被浏览器重算，最终明显左偏。

**永久规则**:
- 居中弹窗只能有一个几何定位责任层：统一由 `.ui-overlay` 的 flex 布局负责水平和垂直居中。
- `.ui-dialog-shell` 必须保持 `position: relative`、`align-self: center` 和左右自动外边距；普通居中弹窗壳禁止再写 `left/right`、`top: 50%` 或平移居中。
- 底部 sheet 是常规例外，但 Pad 宽度封顶时必须使用 `left: 50% + translateX(-50%)` 明确居中，不得把手机端对称 inset 与 Pad 的 `max-width` 混用。
- 手机、Pad 竖屏和 Pad 横屏必须实测弹窗左右视觉边距相等；`scripts/ui-audit.js --strict` 必须保持 `miscenteredDialogShell=0`。

### Bug 20: 字体层级漂移与相近手机信息卡布局分叉

**原因**: 各页面分别写死字号，Pad 断点只覆盖少量常用类，其余 `rpx` 继续随屏幕放大，导致正文、内容值和页签可能超过标题；首页还在 `max-width: 360px` 断点把信息块强制改为整行，使尺寸相近的手机出现姓名/身份卡片一行与分行两套结果。

**永久规则**:
- 全局字体只使用 `app.wxss` 的语义阶梯：微型、说明、元数据、标签、控件、正文、强调、值、章节、弹窗、页面标题；所有设备保持角色顺序不变。
- 手机使用 `rpx` 阶梯，Pad 从 520px 起把整套阶梯按同一倍率映射为受控 `px`；横竖屏可以改变布局，不得改变标题、正文、标签之间的比例。
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

### 发布与编译配置锁

- `project.config.json` 与已跟踪的 `project.private.config.json` 必须同时固定 `nodeModules=false`、`es6=false`、`enhance=false`、`swc=false`、`disableSWC=true`、`useCompilerPlugins=false`、`compileHotReLoad=false`；兼容审计分别检查两份配置，禁止私有配置覆盖安全值。
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
- 所有页面统一使用安全区导航组件：通过 `wx.getWindowInfo()` 读取状态栏，通过 `wx.getMenuButtonBoundingClientRect()` 避让右上角胶囊，并把状态区与标题区明确分层；标题只在自己的导航行内垂直居中。禁止恢复页面各自的原生导航栏、按固定状态栏高度定位，或针对某个华为/HarmonyOS 机型写特判。
- 所有登录后的门户页、子应用页和管理页统一使用共享顶部身份卡。身份卡必须展示 WHUSU智慧工作台、当前子应用或页面名称、姓名、当前身份、当前组织，以及“组织与身份”切换入口；禁止页面自行复制一套相似顶部卡。
- 共享顶部身份卡沿用上一版门户的信息层级：姓名直接显示在蓝色主卡上并作为主要标题，身份及部门/职能组为次级信息，组织与身份切换位于紧凑的内层玻璃行；页面名称只能作为小号元数据，禁止放大为主标题。
- 共享顶部身份卡禁止首字头像、姓名首字特写和独立的装饰性品牌方块，避免装饰元素抢占个人姓名与工作信息的视觉重点。
- 统一登录默认有效期为 7 天。业务请求遇到登录过期时，先使用新的微信登录凭证无感恢复并仅重试原请求一次；恢复失败、绑定失效或账号不可用时，必须清理失效状态、明确提示“登录已过期，请重新登录”并回到登录页，禁止让各业务页误报“请稍后刷新”。
- 应用服务宫格按可用宽度完整分配：手机 3 列、Pad 竖屏 4 列、Pad 横屏 5 列。使用 CSS Grid 的等分列，禁止用百分比宽度减固定间距，避免像素取整导致末列换行和右侧大片空白。
- 包裹型控件由内容自然撑开，一个视觉间距只能有一个所有者。外层内边距、内层首尾边距、页脚边距不得叠加形成空尾；也不得为了消除空白而把内容贴边。
- 按钮、页签、选择项和宫格项使用 flex 居中与对称上下内边距。禁止同时叠加固定高度、同值行高和上下内边距；多行文字必须使用可读行高并由内容自然增高。
- 手机、Pad 竖屏、Pad 横屏必须检查短内容、长内容、弹框、空状态、嵌套卡片和宫格。`scripts/ui-audit.js --strict` 必须保持 `workspaceShellIssues=0`、`stackedButtonMetrics=0`、`forcedDialogViewport=0`、`oversizedContentPadding=0`，脚本仅作为回归门禁，不能替代逐页视觉判断。
- 人事基础信息卡固定使用语义网格：姓名与学号为首行等宽双列，所属部门、身份和已设置的“工作分工（职能组）”分别占完整一行；禁止重新拼成随文字长度挤压的内联元数据。工作分工未设置时整行隐藏，不显示“未设置”占位卡。
- 组织或身份切换完成后，必须先判断原页面是否仍支持新身份及其权限；不支持时直接回到新版门户，禁止留在原子应用显示空权限页、加载失败或要求刷新。

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
