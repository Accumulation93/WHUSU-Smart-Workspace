---
paths: "server/**"
---

# Express 后端规则

本文件描述当前服务端边界。完整数据库事实以 `server/db/init.sql` 和按文件名顺序已执行的 `server/db/deploy/*.sql` 为准；不要以历史 NoSQL 导出、旧路由清单或固定文件行数推断当前结构。

## 1. 运行时与目录

- `server/src/index.js` 启动 Express HTTP 服务，仅监听 `127.0.0.1:${PORT}`；生产 HTTPS 由 Nginx 反向代理终止。
- `server/src/core/` 放认证、组织、人事、管理员、文件解析等跨模块核心路由和模型。
- `server/src/modules/scoring/`、`server/src/modules/audit/`、`server/src/modules/venue/` 放模块专属路由、模型和领域逻辑。
- `server/src/config/`、`middleware/`、`utils/`、`locales/` 分别承担配置、请求边界、基础工具和用户可见语言资源。

## 2. 中间件顺序

以 `server/src/index.js` 的注册顺序为准：请求上下文与响应保护 → 请求超时 → `/api/ping`、`/api/health` 公共健康接口 → Morgan/Helmet/CORS → 客户端版本 → 限流 → JSON/表单解析与请求体复杂度限制 → 认证 → 组织上下文 → 管理员权限 → 受保护健康接口和业务路由 → 404 → 错误处理。修改顺序时必须同步检查公共入口、组织隔离和错误响应。

## 3. 认证与组织上下文

- 公开入口包括 `/api/ping`、`/api/health`、旧版 `userLogin/adminLogin` 以及统一认证的微信会话、身份声明、口令会话和恢复入口；具体集合以 `server/src/middleware/auth.js` 为事实来源。
- 除公开入口外，所有请求必须携带有效 JWT。统一身份令牌还必须通过服务端会话、账号 token 版本和组织/身份上下文校验；缺少或失效令牌返回 401，不再把未认证请求放行给业务路由。
- 统一令牌中的服务端组织/身份上下文是授权来源；旧客户端的 `X-Active-Org`、`X-Role` 仅作兼容输入，不能绕过服务端上下文。
- 所有组织域查询必须验证当前 `org_id`；切换组织/身份时作废旧请求和缓存，不能让旧上下文的迟到响应覆盖当前页面。

## 4. 响应契约

- 成功接口沿用既有业务契约：常见形式为 `{ status: 'success', ... }` 或 `{ status: 'success', data: {...} }`；修改接口前必须读取调用方和现有路由，不能擅自把一种形式批量改成另一种。
- 登录/统一认证响应使用约定的 `login_success`、`need_bind`、`success`、`auth_failed` 等状态及其既有字段；字段名、状态值和错误语义必须向后兼容。
- `res.json` 会补充 `requestId` 并通过公共文案保护层处理用户可见信息。内部日志可以记录诊断信息，但不得把内部 ID、堆栈或数据库术语直接返回客户端。

## 5. 数据库与安全

- SQL 必须参数化并放在 Model/领域服务层；路由只做输入校验、授权和响应编排。
- 组织域数据必须带组织边界；跨组织、全局超级管理员、通知 Worker 等例外必须有明确代码路径和测试，不得用缺少 `WHERE org_id` 的宽查询代替授权。
- 常规业务主键使用 `VARCHAR(64)` 和 `generateId()`；部署元数据表 `schema_migrations.name VARCHAR(255)` 是迁移账本的明确例外，不得把该例外扩散到业务表。
- 连接池、事务和 `SET SESSION max_execution_time` 使用 `server/src/config/db.js` 的现行实现；事务失败必须回滚并释放连接。
- 禁止在业务 SQL 中拼接用户输入、动态表名或未审计的排序字段；动态标识符只能来自显式白名单。

## 6. 领域边界

- 评分：`modules/scoring`，负责活动、模板、规则、评分提交、结果和公示。
- 审核：`modules/audit`，负责审核流程、审批、签名/验签、通知、附件和 read cursor；附件必须写入共享持久目录，不得写入 release。
- 场地：`modules/venue`，负责场地、开放/截止窗口、活动占用、预约、审批流、审批历史和详情。
- 统一认证、人事、组织、权限、系统和文件表格能力位于 `core`，不得在模块内复制第二套认证或组织上下文实现。

## 7. 迁移与发布

- 生产只使用 `server/db/deploy/` 中的时间戳幂等迁移和 `schema_migrations` 账本；旧 `migrate.sh/migrate.bat` 只可作为历史兼容工具，不能声称覆盖当前全部迁移，也不得直接用于生产。
- 有数据库结构或数据变更时新增迁移，不修改已执行迁移；纯前端、文档和样式改动不伪造迁移。
- 修改后执行与范围匹配的测试、权限/租户审计、迁移预检和 `git diff --check`。推送后由 GitHub Actions 先通过 `audit-and-test`，再执行部署；部署后核对完整 SHA、release/current、PM2 进程、迁移账本和本地/公网健康接口。

## 8. 用户可见文案

- API 响应、公开错误、通知、待办和导出标题只能来自 `server/src/locales/zh-CN/**`；业务代码通过语言资源和变量参数生成动态句子。
- 状态码、路由、权限键、SQL、数据库值和内部日志不是语言资源，不得为了通过审计而错误移入 locale。
- 完成服务端修改必须运行 `node scripts/user-visible-copy-audit.js --localization-prefix=server/src/ --strict-localization`，并按任务要求运行 `--strict-guidance`。
