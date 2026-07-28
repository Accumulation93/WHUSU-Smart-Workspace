---
paths: "server/**"
---

# CLAUDE.md — Express 后端

> 服务端专属规范。通用规范见根目录 `CLAUDE.md`。

---

## 1. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Express 4.18 (HTTPS, :3000, 127.0.0.1) |
| 数据库 | MySQL 8.0, mysql2/promise 连接池 |
| 认证 | JWT Bearer Token（7 天过期） |
| 部署 | PM2 cluster ×2 + Nginx → Ubuntu 22.04 |

---

## 2. 中间件链

```
requestContext(UUID) → Morgan → Helmet → CORS → 限流 → Body Parser
→ Payload 检查 → Auth → 超时(30s) → 业务路由 → 404 → Error Handler
```

---

## 3. 路由和 Model 模式

**所有业务 API 用 POST。** 响应格式：`{ status: 'success'|'error', message?, ...data }`

```javascript
router.post('/someFunction', async (req, res) => {
  try {
    const result = await someModel.doSomething(req.openid, req.body);
    res.json({ status: 'success', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
```

### 响应格式完整契约

```json
// 成功
{ "status": "success", "data": { ... } }
// 登录成功
{ "status": "login_success", "token": "...", "user": { ... } }
// 需要绑定
{ "status": "need_bind", "token": "..." }
// 错误
{ "status": "error", "message": "错误描述" }
```

### 关键响应契约（必须精确匹配，前端多处依赖）

| API | status | 额外字段 |
|-----|--------|---------|
| `userLogin` | `login_success` | `token`, `user: { id, hrId, name, studentId, department, identity, workGroup }` |
| `adminLogin` | `login_success` | `token`, `user: { ...同上, adminLevel }` |
| `bindUserInfo` | `success` | `hrInfo: { id, name, studentId }` |
| `bindAdminInfo` | `success` | `token`, `adminLevel` |

---

## 4. 认证流程

1. `wx.login()` 获取 code
2. POST `/api/userLogin` 或 `/api/adminLogin` 携带 `{ code }`
3. 服务端优先检查 JWT（`req.openid`），其次微信 code2session，最后 code 作为开发环境 fallback
4. 公开路径：`/api/ping`, `/api/health`, `/api/userLogin`, `/api/adminLogin`
5. JWT 中间件 **不拒绝未认证请求** — `req.openid` 为空字符串，由各路由自行检查

---

## 5. 数据库访问

```javascript
// 连接池：DB_POOL_LIMIT 可配置；生产 API 每实例 20、通知 Worker 10，
// queueLimit=200, charset=utf8mb4, timezone=+08:00
// 每个连接 SET SESSION max_execution_time = 15000

// 参数化查询（必须）：
pool.query('SELECT * FROM hr_info WHERE student_id = ?', [studentId]);

// 事务：
const { withTransaction } = require('../config/db');
await withTransaction(async (conn) => {
  const id = await someModel.create(data, conn);
  await anotherModel.update(otherId, changes, conn);
  // 成功→COMMIT, 失败→ROLLBACK, 始终 release
});
```

---

## 6. 后端关键约束

- **所有数据表主键 VARCHAR(64)**，由 `generateId()` 生成（64 位 base-62 随机字符串），无自增 ID
- **所有查询 `org_id` 隔离**，通过 `getCurrentOrgId()` 读取（30s TTL 缓存），`clearOrgCache()` 切换后调用
- **API 名称/参数/响应 = 原云函数**，保持向后兼容
- **`safeString()` 转换 null/undefined → ''** — 对 `openid` NULL 检查至关重要
- **禁止 SQL 字符串拼接** — 始终用参数化查询
- **SQL 放 Model 层** — 路由中不直接写 SQL
- **数据库依赖必须在模块顶层声明** — 禁止在某个路由回调内 `require('../../config/db')` 后由其他回调使用；遗留路由确需直接访问连接池时，必须在首个 `router.*` 注册前声明，并通过 `scripts/security-audit.js --strict` 的 `route-pool-scope` 检查

---

## 7. 关键模块

### scoreCalc.js（658 行）
管理端和用户端共用的评分计算引擎。三维分组 (targetId, scorerCategoryKey, templateId)，weighted_average / trim_extremes 计算方式。

### sharedCache.js
MySQL 背书的跨 PM2 实例缓存（`_shared_cache` 表），5 分钟 TTL，新评分提交后自动失效。

### orgContext.js
`getCurrentOrgId()` + 30s TTL 缓存。

### hashChain.js
SHA-256 签名哈希链：按 (file_id, round) 分组验证链式完整性，同时支持当前和 legacy 算法。

### fileSecurity.js
HMAC-SHA256 上传 token（30min TTL），magic-byte 文件类型检测，多层授权。

---

## 8. 关键工具函数 (server/src/utils)

| 函数 | 用途 |
|------|------|
| `safeString(val)` | null/undefined → '' |
| `generateId()` | 64 位 base-62 随机字符串 `[0-9a-zA-Z]` |
| `toNumber(val, fallback)` | 安全数字转换 |
| `roundScore(val, decimals)` | 四舍五入评分 |

---

## 9. 数据库核心表速查

| 类别 | 表名 |
|------|------|
| 基础 | `organizations`, `system_config` |
| 架构 | `departments`, `identities`, `work_groups` |
| 人事 | `hr_info`, `user_info`, `admin_info` |
| 评分 | `score_activities`, `score_question_templates`, `score_questions` |
| 规则 | `rate_target_rules`, `rate_rule_clauses`, `clause_template_configs` |
| 记录 | `score_records`, `score_answers` |
| 资料 | `hr_profile_templates`, `hr_profile_template_fields`, `hr_profile_records`, `hr_profile_record_values` |
| 归档 | 核心表对应 `_history` 表（组织切换时归档） |

完整建表语句见 `server/db/init.sql`。

---

## 10. 服务端禁止事项

- ❌ SQL 字符串拼接
- ❌ 响应格式不一致
- ❌ 忘记 `WHERE org_id` 隔离
- ❌ `req.openid` 为 null 时的安全漏洞 → 用 `safeString()`
- ❌ 修改现有 API 响应字段 → 破坏前端契约
- ❌ 在路由中直接写 SQL → 放 Model 层
- ❌ 忘记参数化查询
