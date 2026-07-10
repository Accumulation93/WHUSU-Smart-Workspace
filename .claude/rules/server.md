---
paths: "server/**"
---

# CLAUDE.md — Express 后端

> 服务端专属规范。通用规范（代码风格、Git 等）见根目录 `CLAUDE.md`。

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
requestContext → Morgan → Helmet → CORS → 限流 → Body Parser
→ Payload 检查 → Auth Middleware → 请求超时(30s) → 业务路由
→ 404 Handler → Error Handler
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

---

## 4. 数据库访问

```javascript
// 连接池：connectionLimit=50, queueLimit=200, charset=utf8mb4, timezone=+08:00
// 每个连接执行 SET SESSION max_execution_time = 15000

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

**所有数据表查询由 `org_id` 隔离。** `getCurrentOrgId()` 从 system_config 读取（30s TTL 缓存）。

---

## 5. 认证中间件

- **公开路径：** `/api/ping`, `/api/health`, `/api/userLogin`, `/api/adminLogin`
- **非公开路径：** 缺少/无效 token → 401

---

## 6. 关键模块

### scoreCalc.js（658 行）
管理端和用户端共用的评分计算引擎。三维分组 (targetId, scorerCategoryKey, templateId)，weighted_average / trim_extremes 计算方式。

### sharedCache.js
MySQL 背书的跨 PM2 实例缓存（`_shared_cache` 表），5 分钟 TTL，新评分提交后自动失效。

### orgContext.js
`getCurrentOrgId()` + 30s TTL 缓存。`clearOrgCache()` 在组织切换后调用。

### hashChain.js
SHA-256 签名哈希链：按 (file_id, round) 分组验证链式完整性。同时支持当前和 legacy 算法。

### fileSecurity.js
HMAC-SHA256 上传 token（30min TTL），magic-byte 文件类型检测。多层授权。

---

## 7. 服务端特定禁止事项

- ❌ SQL 字符串拼接
- ❌ 响应格式不一致
- ❌ 忘记 `WHERE org_id`
- ❌ `req.openid` 为 null 时的安全漏洞 → 用 `safeString()`
- ❌ 修改现有 API 响应字段 → 破坏前端契约
- ❌ 在路由中直接写 SQL → 放 Model 层
