require('dotenv').config();
const helmet = require('helmet');
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const morgan = require('morgan');
const { logger, createRequestLogger } = require('./utils/logger');
const requestContext = require('./middleware/requestContext');
const { authMiddleware } = require('./middleware/auth');
const { orgContextMiddleware } = require('./middleware/orgContext');
const { adminPermissionMiddleware } = require('./middleware/adminPermission');
const { clientVersionMiddleware } = require('./middleware/clientVersion');
const { createRateLimiter } = require('./middleware/rateLimiter');
const { verifySchemaContract } = require('./utils/schemaContract');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const startTime = Date.now();
const REQUEST_TIMEOUT_MS = 30000;
const MAX_JSON_BODY_BYTES = 500000;
const MAX_UPLOAD_JSON_BODY_BYTES = 15 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_DEFAULT_MAX = 180;
const RATE_LIMIT_LOGIN_MAX = 30;

// Trust the Nginx reverse proxy for correct client IP / protocol detection
app.set('trust proxy', 1);

// ---------- 请求上下文与公共健康检查 ----------
app.use(requestContext);
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = function(body) {
    if (req.timedOut && res.writableEnded) return res;
    if (body && typeof body === 'object' && !Array.isArray(body) && !body.requestId) {
      body.requestId = req.requestId || '';
    }
    return sendJson(body);
  };
  next();
});

app.use((req, res, next) => {
  const controller = new AbortController();
  req.abortController = controller;
  req.signal = controller.signal;
  const timer = setTimeout(() => {
    req.timedOut = true;
    controller.abort(new Error('request_timeout'));
    if (!res.headersSent) res.status(503).json({ status: 'request_timeout', message: '请求处理超时' });
  }, REQUEST_TIMEOUT_MS);
  const clear = () => clearTimeout(timer);
  res.once('finish', clear);
  res.once('close', clear);
  next();
});

app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (_) {
    res.status(503).json({ status: 'degraded' });
  }
});

// ---------- morgan custom tokens ----------
morgan.token('ip', req => req.ip || '-');
morgan.token('rid', req => req.requestId || '-');
morgan.token('uid', req => req.openid ? req.openid.slice(0, 12) : '-');
morgan.token('ua', req => (req.get('user-agent') || '-').slice(0, 80));
morgan.token('ref', req => (req.get('referer') || '-').slice(0, 60));
morgan.token('res-size', (req, res) => res.get('content-length') || '-');

// ---------- middleware ----------
app.use(morgan(':method :url :status :response-time ms ip=:ip uid=:uid ua=:ua ref=:ref rid=:rid size=:res-size', {
  stream: createRequestLogger(),
  skip: (req) => req.path === '/api/ping' || req.path === '/api/health'
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://accumulation93.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Active-Org', 'X-Role', 'X-Client-Version', 'X-Request-Id']
}));
app.use(clientVersionMiddleware);

app.use(createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  defaultMax: RATE_LIMIT_DEFAULT_MAX,
  loginMax: RATE_LIMIT_LOGIN_MAX,
  capacity: 5000
}));

const LARGE_JSON_ROUTES = new Set([
  '/api/uploadAuditFile',
  '/api/parseTableFile',
  '/api/verifyAuditFile',
  '/api/verifyFileSignature'
]);
app.use((req, res, next) => {
  const bodyLimit = LARGE_JSON_ROUTES.has(req.path) ? MAX_UPLOAD_JSON_BODY_BYTES : MAX_JSON_BODY_BYTES;
  const contentLength = Number(req.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
    return res.status(413).json({ status: 'payload_too_large', message: '请求内容过大' });
  }
  return express.json({ limit: bodyLimit, strict: true })(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object') return next();
  const stack = [{ value: req.body, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (current.depth > 24 || nodes > 100000) {
      return res.status(413).json({ status: 'payload_too_complex', message: '请求结构过于复杂' });
    }
    if (!current.value || typeof current.value !== 'object') continue;
    for (const value of Object.values(current.value)) {
      if (value && typeof value === 'object') stack.push({ value, depth: current.depth + 1 });
    }
  }
  next();
});

// Remove Express fingerprint header
app.disable('x-powered-by');

app.use(authMiddleware);

// 组织上下文中间件（基于 X-Active-Org header，注入 ALS）
app.use(orgContextMiddleware);

// 管理端细粒度权限由服务端统一强制执行；前端隐藏入口仅用于改善体验。
app.use(adminPermissionMiddleware);

app.get('/api/admin/health', async (req, res) => {
  const startedAt = Date.now();
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      databaseLatencyMs: Date.now() - startedAt,
      processId: process.pid
    });
  } catch (e) {
    req.logger.error('Protected health check failed', { error: e.message });
    res.status(503).json({ status: 'degraded', message: '数据库不可用' });
  }
});

// ---------- 诊断：拦截并记录所有错误响应 ----------
app.use((req, res, next) => {
  const _json = res.json.bind(res);
  res.json = function (body) {
    if (body && body.status === 'error' && body.message) {
      logger.error('Route error response', {
        event: 'route.error',
        path: req.path,
        method: req.method,
        message: body.message,
        openid: (req.openid || '').slice(0, 12) || undefined,
        requestId: req.requestId,
        stack: new Error().stack
      });
    }
    return _json(body);
  };
  next();
});

// ---------- business routes ----------
app.use('/api', require('./core/routes/auth'));
app.use('/api', require('./core/routes/org'));
app.use('/api', require('./core/routes/departments'));
app.use('/api', require('./core/routes/identities'));
app.use('/api', require('./core/routes/workGroups'));
app.use('/api', require('./core/routes/hr'));
app.use('/api', require('./core/routes/admin'));
app.use('/api', require('./core/routes/adminPermissions'));
app.use('/api', require('./core/routes/user'));
app.use('/api', require('./modules/scoring/routes/scoring'));
app.use('/api', require('./modules/scoring/routes/activities'));
app.use('/api', require('./modules/scoring/routes/templates'));
app.use('/api', require('./modules/scoring/routes/rules'));
app.use('/api', require('./modules/scoring/routes/results'));
app.use('/api', require('./core/routes/hrProfile'));
app.use('/api', require('./core/routes/system'));
app.use('/api', require('./core/routes/parseTableFile'));
app.use('/api', require('./core/routes/buildTableFile'));
app.use('/api', require('./modules/scoring/routes/publications'));
app.use('/api', require('./modules/audit/routes/auditAdmin'));
app.use('/api', require('./modules/audit/routes/auditUser'));
app.use('/api', require('./modules/audit/routes/auditSignature'));
app.use('/api', require('./modules/audit/routes/auditFile'));
app.use('/api', require('./modules/audit/routes/notification'));

// ---------- Venue Booking ----------
app.use('/api', require('./modules/venue/routes/venueAdmin'));
app.use('/api', require('./modules/venue/routes/venueUser'));
app.use('/api', require('./modules/venue/routes/venueApprovalAdmin'));

// ---------- 404 handler (fail fast for unknown routes) ----------
app.use('/api', (req, res) => {
  res.status(404).json({ status: 'not_found', message: 'Route not found: ' + req.method + ' ' + req.path });
});

// ---------- error handler ----------
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    event: 'server.error',
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
    requestId: req.requestId,
    openid: (req.openid || '').slice(0, 12) || undefined
  });
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const server = app.listen(PORT, '127.0.0.1', async () => {
  logger.info('Server started', {
    event: 'server.start',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    node: process.version,
    pid: process.pid
  });

  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    const schema = await verifySchemaContract(pool);
    logger.info('Database connected', { event: 'db.connect', latency: Date.now() - t0, schemaRevision: schema.revision });
  } catch (e) {
    logger.error('Database or schema unavailable', { event: 'db.error', error: e.message, code: e.code });
    setImmediate(() => shutdown('SCHEMA_CHECK_FAILED'));
    return;
  }

  logger.info('Server is ready');
});

// ---------- graceful shutdown ----------
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(signal + ' received, shutting down...', {
    event: 'server.shutdown',
    signal,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
  server.close(() => {
    logger.info('HTTP server closed');
    pool.end().then(() => { process.exit(0); }).catch(() => { process.exit(0); });
  });
  setTimeout(() => { process.exit(1); }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  if (!shuttingDown) { shuttingDown = true; process.exit(1); }
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled rejection', { error: error.message, stack: error.stack });
  if (!shuttingDown) { shuttingDown = true; process.exit(1); }
});
