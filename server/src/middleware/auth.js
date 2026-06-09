const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set');
}

// Paths that do not require authentication
const PUBLIC_PATHS = new Set([
  '/api/ping',
  '/api/health',
  '/api/userLogin',
  '/api/adminLogin'
]);

/**
 * Extract openid from JWT token and attach to req.
 * Public paths (login, health) are always allowed through.
 * For all other paths, missing or invalid token returns 401.
 */
function authMiddleware(req, res, next) {
  // Allow public paths without authentication
  if (PUBLIC_PATHS.has(req.path)) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.openid = decoded.openid || '';
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
    const decoded = jwt.verify(token, JWT_SECRET);
    req.openid = decoded.openid || '';
    if (!req.openid) {
      logger.warn('Empty openid in token', { requestId: req.requestId, path: req.path });
      return res.status(401).json({ status: 'auth_failed', message: '登录凭证无效' });
    }
  } catch (e) {
    req.openid = '';
    logger.warn('Invalid or expired JWT', { requestId: req.requestId, path: req.path, error: e.message });
    return res.status(401).json({ status: 'auth_failed', message: '登录已过期，请重新登录' });
  }
  next();
}

module.exports = { authMiddleware, JWT_SECRET };
