# CLAUDE.md — Express 后端

> 服务端专属规范。通用规范（代码风格、Git 等）见根目录 `CLAUDE.md`。

---

## 1. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Express 4.18 (HTTPS, 端口 3000, 绑定 127.0.0.1) |
| 数据库 | MySQL 8.0 (InnoDB, utf8mb4)，mysql2/promise 连接池 |
| 认证 | JWT (jsonwebtoken)，7 天过期 |
| 日志 | Winston + winston-daily-rotate-file + Morgan |
| 部署 | PM2 cluster mode (2 实例) + Nginx 反向代理 → Ubuntu 22.04 |
| 安全 | Helmet + CORS + 内存限流 + Payload 大小限制 |

---

## 2. 目录结构

```
server/src/
├── index.js                  # Express 入口 + 中间件链 + 优雅关机
├── config/
│   └── db.js                 # mysql2/promise 连接池
├── middleware/
│   ├── auth.js               # JWT Bearer → req.openid
│   └── requestContext.js     # UUID 请求 ID
├── core/                     # 核心模块：认证、组织、部门、身份、分组、HR、系统
│   ├── routes/               # 12 个核心路由
│   └── models/               # 12 个核心 Model
├── modules/
│   ├── scoring/ {routes, models, utils}/
│   ├── audit/   {routes, models, utils}/
│   └── venue/   {routes, models, utils}/
├── routes/                   # （空，历史遗留 — 所有路由已迁移到 core/ 或 modules/）
├── models/                   # （空，历史遗留）
├── utils/
│   ├── helpers.js            # safeString, generateId, toNumber, roundScore
│   ├── csv.js                # CSV 解析
│   └── logger.js             # Winston 日志器
└── modules/
    ├── scoring/ {routes, models, utils}/
    ├── audit/   {routes, models, utils}/
    └── venue/   {routes, models, utils}/
```

---

## 3. 中间件链（请求处理顺序）

```
1. requestContext        → req.requestId = UUID
2. Morgan HTTP Logger    → 结构化请求日志（跳过 /api/ping, /api/health）
3. Helmet                → 安全头（CSP 关闭，跨域资源策略 cross-origin）
4. CORS                  → 仅允许 accumulation93.com
5. 内存限流              → Login: 30次/分钟，其他: 180次/分钟
6. Body Parser           → express.json (15MB), urlencoded
7. Payload 大小检查      → 普通: 500KB, uploadAuditFile: 15MB
8. Auth Middleware        → JWT Bearer 验证 → req.openid
9. 请求超时               → 30 秒
10. 业务路由              → /api/*
11. 404 Handler           → 未匹配路由
12. Error Handler         → 500 Internal Server Error
```

---

## 4. 路由和 Model 模式

### 4.1 路由文件

```javascript
const express = require('express');
const router = express.Router();
const someModel = require('../models/someModel');

// 所有业务路由用 POST
router.post('/someFunction', async (req, res) => {
  try {
    const result = await someModel.doSomething(req.openid, req.body);
    res.json({ status: 'success', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
```

**规则：**
- 所有业务 API 用 POST 方法
- 响应格式：`{ status: 'success'|'error', message?, ...data }`
- 路由名称使用 camelCase（如 `userLogin`、`getScoreFormData`）
- 每个路由文件需在 `index.js` 中 `app.use('/api', require(...))` 注册

### 4.2 Model 文件

```javascript
const pool = require('../config/db');

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM table_name WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create(data) {
  const id = generateId();
  await pool.query('INSERT INTO table_name (id, ...) VALUES (?, ...)', [id, ...]);
  return id;
}

module.exports = { getById, create };
```

**规则：**
- 所有查询通过 `pool.query()`（参数化查询防 SQL 注入）
- 所有数据由 `org_id` 隔离：`WHERE org_id = ?`
- `generateId()` 生成 64 位十六进制随机主键（`crypto.randomBytes(32).toString('hex')`）
- **事务支持：** Model 函数接受可选的 `conn` 参数，传入则使用该连接（事务内），不传则使用 pool

### 4.3 事务模式 (withTransaction)

```javascript
// config/db.js 提供 withTransaction 辅助函数
const { withTransaction } = require('../config/db');

await withTransaction(async (conn) => {
  // conn 是一个独立连接，已 BEGIN TRANSACTION
  const id = await someModel.create(data, conn);      // 传入 conn
  await anotherModel.update(otherId, changes, conn);  // 传入 conn
  // 成功 → 自动 COMMIT，失败 → 自动 ROLLBACK
  // 无论成功或失败 → 自动 release 连接
});
```

**规则：** 涉及多表写入的操作必须使用事务。Model 层所有写操作都接受可选的 `conn` 参数。

---

## 5. 认证中间件

**文件：** `middleware/auth.js`

```javascript
// 公开路径（无需 JWT）：
PUBLIC_PATHS = ['/api/ping', '/api/health', '/api/userLogin', '/api/adminLogin']

// 非公开路径：缺少 token → 401 '未登录'
// 公开路径：有 token 解析到 req.openid，无 token → req.openid = ''
```

**关键：** 中间件不拒绝公开路径的请求，只解析 token（如有）。路由自行决定是否允许无 `req.openid` 的访问。

---

## 6. 数据库连接

```javascript
// config/db.js — mysql2/promise 连接池
const pool = mysql.createPool({
  host, port, user, password, database,
  connectionLimit: 50,        // 最大连接数
  queueLimit: 200,            // 排队上限
  charset: 'utf8mb4',
  timezone: '+08:00',
  connectTimeout: 5000,
  enableKeepAlive: true
});
// 每个新连接执行：SET SESSION max_execution_time = 15000 (15s 查询超时)
```

**所有 SQL 查询必须参数化：**
```javascript
// ✅ 正确
pool.query('SELECT * FROM hr_info WHERE student_id = ?', [studentId]);

// ❌ 禁止
pool.query(`SELECT * FROM hr_info WHERE student_id = '${studentId}'`);
```

---

## 7. 组织数据隔离

**所有数据表查询由 `org_id` 隔离。** 通过 `getCurrentOrgId()` 获取当前组织 ID：

```javascript
const orgId = await getCurrentOrgId();
const [rows] = await pool.query('SELECT * FROM departments WHERE org_id = ?', [orgId]);
```

组织切换时：当前数据归档到 `_history` 表 → 恢复目标组织数据。

---

## 8. 关键工具函数

```javascript
// helpers.js
safeString(val)              // null/undefined → ''，对 NULL openid 检查至关重要
generateId()                 // 64 位 base-62 随机字符串 ([0-9a-zA-Z])
toNumber(val, fallback)      // 安全数字转换
roundScore(val, decimals)    // 四舍五入评分

// logger.js
logger.info(msg, { event, ... })   // 结构化 JSON 日志
```

---

## 9. 关键服务端模块

### 9.1 组织上下文 (`utils/orgContext.js`)

```javascript
const orgId = await getCurrentOrgId();
// 30 秒 TTL 内存缓存，从 system_config.current_organization 读取
// clearOrgCache() 在组织切换后调用
```

**所有 org-scoped Model 必须先 `await getCurrentOrgId()` 再查询。**

### 9.2 评分计算引擎 (`modules/scoring/utils/scoreCalc.js` — 658 行)

**管理端和用户端共用的评分计算核心。** 关键保证：

1. 评分人的**当前**身份/部门必须匹配 `rate_target_rule`（身份变更使旧记录失效）
2. 模板配置签名必须与当前配置一致（过时记录标记但不排除；无签名记录自动修复）
3. `requireAllComplete` 规则 — 不完整的 scorer-clause 组合被排除
4. 分数按 (targetId, scorerCategoryKey, templateId) 三维分组
5. 计算方式：`weighted_average` 或 `trim_extremes`，管理端和用户端完全一致
6. Legacy → structured 签名自动规范化

### 9.3 共享缓存 (`modules/scoring/utils/sharedCache.js`)

```sql
-- MySQL 背书的跨 PM2 实例缓存
CREATE TABLE _shared_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  cache_data LONGTEXT,      -- JSON 序列化
  expires_at DATETIME
);
```

- 自动建表，每 5 分钟过期清理
- `pubCache.js` 包装 5 分钟 TTL + Map ↔ JSON 序列化
- 新评分提交后自动失效

### 9.4 文件安全 (`modules/audit/utils/fileSecurity.js`)

- 上传目录 `server/uploads/audit/` + `_tmp/` 临时目录
- 最大 10MB，仅 PNG/JPEG/WEBP/PDF
- **Magic-byte 检测**（不仅校验声明的 MIME 类型）
- HMAC-SHA256 签名上传 token（30 分钟 TTL，timing-safe 比较）
- 多层授权：admin / submitter / approver / verification permission

### 9.5 哈希链 (`modules/audit/utils/hashChain.js`)

- `hashFile(buffer)` — SHA-256 文件哈希
- `computeSignatureHash()` — 绑定签名元数据（位置/页面/大小/旋转/轮次/前一哈希/文档哈希）
- `verifySignatureChain()` — 按 (file_id, round) 分组，验证链式完整性 + 哈希一致性
- 同时支持当前和 legacy 哈希算法（向后兼容）

---

## 10. 上传文件处理

- `uploadAuditFile` 使用 multer 处理 multipart 文件
- 文件大小限制 15MB（`MAX_UPLOAD_JSON_BODY_BYTES`）
- 文件存储在 `server/uploads/` 目录

---

## 11. 部署相关

**PM2：** `ecosystem.config.js` — 2 个集群实例 + 备份守护进程，最大内存 512MB

**Nginx：** 反向代理到 `127.0.0.1:3000`，SSL 终止在 Nginx 层

**环境变量：** `server/.env`（gitignore），模板见 `server/.env.example`

**优雅关机：** SIGTERM/SIGINT → 关闭 HTTP server → 释放连接池 → 退出（10s 超时强制退出）

---

## 12. 模块业务路由速查

| 路由文件 | 挂载路径 | 功能 |
|----------|---------|------|
| `core/routes/auth.js` | `/api/` | 登录、绑定、解绑 |
| `core/routes/org.js` | `/api/` | 组织切换/归档 |
| `core/routes/departments.js` | `/api/` | 部门 CRUD |
| `core/routes/identities.js` | `/api/` | 身份类别 CRUD |
| `core/routes/workGroups.js` | `/api/` | 工作分工 CRUD |
| `core/routes/hr.js` | `/api/` | 人事 CRUD + CSV 导入 |
| `core/routes/admin.js` | `/api/` | 管理员管理 |
| `core/routes/user.js` | `/api/` | 用户端 API |
| `core/routes/system.js` | `/api/` | 系统配置 |
| `core/routes/hrProfile.js` | `/api/` | 人事扩展资料模板+记录 |
| `modules/scoring/routes/*` | `/api/` | 活动、模板、规则、评分、结果、发布 |
| `modules/audit/routes/*` | `/api/` | 审核管理、用户、签名、文件、通知 |
| `modules/venue/routes/*` | `/api/` | 场地管理、用户预约、审批管理 |

---

## 13. 服务端特定禁止事项

- ❌ SQL 字符串拼接 → 只用参数化查询
- ❌ 响应格式不一致 → 统一 `{ status: 'success'|'error', ... }`
- ❌ 忘记 WHERE org_id → 数据跨组织泄露
- ❌ `req.openid` 为 `null` 时的安全漏洞 → 用 `safeString()` 转换
- ❌ 修改现有 API 响应字段 → 破坏前端契约
- ❌ 在路由中直接写 SQL → 放 Model 层
