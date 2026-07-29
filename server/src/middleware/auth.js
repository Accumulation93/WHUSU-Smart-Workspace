const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const unifiedIdentityModel = require('../core/models/unifiedIdentity');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set');
}

// Paths that do not require authentication
const PUBLIC_PATHS = new Set([
  '/api/ping',
  '/api/health',
  '/api/userLogin',
  '/api/adminLogin',
  '/api/auth/wechat/session',
  '/api/auth/claims',
  '/api/auth/claims/verify',
  '/api/auth/recovery/start',
  '/api/auth/recovery/complete'
]);

/**
 * Extract openid from JWT token and attach to req.
 * Public paths (login, health) are always allowed through.
 * For all other paths, missing or invalid token returns 401.
 */
async function authMiddleware(req, res, next) {
  // Allow public paths without authentication
  if (PUBLIC_PATHS.has(req.path)) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.openid = decoded.openid || '';
        req.bootstrapId = decoded.kind === 'unified_bootstrap' ? decoded.bid || '' : '';
      } catch (e) {
        req.openid = '';
      }
    } else {
      req.openid = '';
    }
    return next();
  }

  // Protected paths require valid JWT
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    req.openid = '';
    logger.warn('Missing auth token', { requestId: req.requestId, path: req.path });
    return res.status(401).json({ status: 'auth_failed', message: '未登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.kind === 'unified_access') {
      jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
        audience: 'whusu-smart-workspace-api',
        issuer: 'whusu-smart-workspace'
      });
      const loaded = await unifiedIdentityModel.loadSession(decoded.sid);
      if (!loaded
        || loaded.session.account_id !== decoded.accountId
        || Number(loaded.session.token_version) !== Number(decoded.tokenVersion)
        || loaded.context.contextId !== decoded.contextId) {
        logger.warn('Unified auth session unavailable', {
          requestId: req.requestId,
          path: req.path,
          sessionId: decoded.sid || ''
        });
        return res.status(401).json({ status: 'auth_failed', message: '登录已失效，请重新登录' });
      }
      req.openid = loaded.openid;
      req.authSession = loaded.session;
      req.authAccount = {
        id: loaded.session.account_id,
        personId: loaded.session.person_id,
        tokenVersion: loaded.session.account_token_version,
        name: loaded.session.name,
        studentId: loaded.session.student_id
      };
      req.authContext = loaded.context;
      // 统一身份令牌中的服务端上下文是唯一授权来源。请求头仅保留给旧客户端兼容。
      req.headers['x-active-org'] = loaded.context.organizationId;
      req.headers['x-role'] = loaded.context.role;
    } else {
      req.openid = decoded.openid || '';
      if (!req.openid) {
        logger.warn('Empty openid in token', { requestId: req.requestId, path: req.path });
        return res.status(401).json({ status: 'auth_failed', message: '登录凭证无效' });
      }
    }
  } catch (e) {
    req.openid = '';
    logger.warn('Invalid or expired JWT', { requestId: req.requestId, path: req.path, error: e.message });
    return res.status(401).json({ status: 'auth_failed', message: '登录已过期，请重新登录' });
  }
  next();
}

module.exports = { authMiddleware, JWT_SECRET };
