require('dotenv').config();
const helmet = require('helmet');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const pool = require('./config/db');
const morgan = require('morgan');
const { logger, createRequestLogger } = require('./utils/logger');
const requestContext = require('./middleware/requestContext');
const { authMiddleware } = require('./middleware/auth');
const { orgContextMiddleware } = require('./middleware/orgContext');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const startTime = Date.now();
const REQUEST_TIMEOUT_MS = 30000;
const MAX_JSON_BODY_BYTES = 500000;
const MAX_UPLOAD_JSON_BODY_BYTES = 15 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_DEFAULT_MAX = 180;
const RATE_LIMIT_LOGIN_MAX = 30;
const rateLimitBuckets = new Map();

// Trust the Nginx reverse proxy for correct client IP / protocol detection
app.set('trust proxy', 1);

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
const dbName = process.env.DB_NAME || 'redsu_scoring';
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASSWORD;

// ---------- health + ping (before all middleware) ----------
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor((Date.now() - startTime) / 1000) });
});

app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';
  let dbError = null;
  let dbLatency = 0;
  const t0 = Date.now();
  try {
    const conn = await mysql.createConnection({
      host: dbHost, port: dbPort, user: dbUser, password: dbPass,
      database: dbName, connectTimeout: 3000
    });
    await conn.ping();
    await conn.end();
    dbStatus = 'connected';
    dbLatency = Date.now() - t0;
  } catch (e) {
    dbStatus = 'disconnected';
    dbError = e.message;
    dbLatency = Date.now() - t0;
  }
  res.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    node: {
      version: process.version,
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
    },
    database: {
      status: dbStatus,
      latency: dbLatency + ' ms',
      error: dbError,
      host: dbHost, port: dbPort, database: dbName
    }
  });
});

// ---------- morgan custom tokens ----------
morgan.token('ip', req => req.ip || '-');
morgan.token('rid', req => req.requestId || '-');
morgan.token('uid', req => req.openid ? req.openid.slice(0, 12) : '-');
morgan.token('ua', req => (req.get('user-agent') || '-').slice(0, 80));
morgan.token('ref', req => (req.get('referer') || '-').slice(0, 60));
morgan.token('res-size', (req, res) => res.get('content-length') || '-');

// ---------- middleware ----------
app.use(requestContext);
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Active-Org']
}));

app.use((req, res, next) => {
  const now = Date.now();
  const isLoginPath = req.path === '/api/userLogin' || req.path === '/api/adminLogin';
  const maxRequests = isLoginPath ? RATE_LIMIT_LOGIN_MAX : RATE_LIMIT_DEFAULT_MAX;
  const key = (req.ip || '-') + ':' + req.path;
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, value] of rateLimitBuckets.entries()) {
      if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey);
    }
  }

  if (bucket.count > maxRequests) {
    return res.status(429).json({ status: 'rate_limited', message: 'Too many requests, please try again later' });
  }

  next();
});
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false }));

// Remove Express fingerprint header
app.disable('x-powered-by');

// Reject oversized or deeply-nested JSON payloads
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    try {
      const raw = JSON.stringify(req.body);
      const limit = req.path === '/api/uploadAuditFile' ? MAX_UPLOAD_JSON_BODY_BYTES : MAX_JSON_BODY_BYTES;
      if (raw.length > limit) {
        return res.status(413).json({ status: 'error', message: 'Payload too large' });
      }
    } catch (_) { /* ignore stringify failures */ }
  }
  next();
});

app.use(authMiddleware);

// 组织上下文中间件（基于 X-Active-Org header，注入 ALS）
app.use(orgContextMiddleware);

// ---------- request timeout ----------
app.use((req, res, next) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ status: 'error', message: 'Request timeout' });
    }
  }, REQUEST_TIMEOUT_MS);
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
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
    const conn = await mysql.createConnection({
      host: dbHost, port: dbPort, user: dbUser, password: dbPass,
      database: dbName, connectTimeout: 5000
    });
    const t0 = Date.now();
    await conn.ping();
    await conn.end();
    logger.info('Database connected', {
      event: 'db.connect',
      host: dbHost,
      port: dbPort,
      database: dbName,
      latency: Date.now() - t0
    });
  } catch (e) {
    logger.warn('Database unreachable', { event: 'db.error', error: e.message, host: dbHost });
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
  logger.error('Unhandled rejection', { reason });
});
