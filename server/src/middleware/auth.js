const localeCopy = require('../locales/zh-CN/generated/middleware/auth');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const unifiedIdentityModel = require('../core/models/unifiedIdentity');
const webSessionCookie = require('../core/services/webSessionCookie');
const { validateIdentityCryptoConfig } = require('../core/services/identityCrypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set');
}
if (process.env.NODE_ENV === 'production' && Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes in production');
}
if (process.env.NODE_ENV === 'production') validateIdentityCryptoConfig();

// 无需认证的入口；认领/恢复入口独立验证受限引导令牌。
const PUBLIC_PATHS = new Set([
  '/api/ping',
  '/api/health',
  '/api/userLogin',
  '/api/adminLogin',
  '/api/getTimeConfig',
  '/api/auth/wechat/session',
  '/api/auth/claims',
  '/api/auth/claims/verify',
  '/api/auth/claims/redeem',
  '/api/auth/password/session',
  '/api/auth/web/logout',
  '/api/auth/recovery/start',
  '/api/auth/recovery/complete'
]);

/**
 * 令牌校验只有一份实现：登录、业务请求和退出登录都走这里。
 * 无法确认身份时返回空值，由调用方决定是拒绝请求，还是仅清除浏览器里的凭证。
 */
async function resolveUnifiedSession(token) {
  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw) return null;
  try {
    const decoded = jwt.verify(raw, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.kind !== 'unified_access') return null;
    jwt.verify(raw, JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'whusu-smart-workspace-api',
      issuer: 'whusu-smart-workspace'
    });
    const loaded = await unifiedIdentityModel.loadSession(decoded.sid);
    if (!loaded
      || loaded.session.account_id !== decoded.accountId
      || Number(loaded.session.token_version) !== Number(decoded.tokenVersion)
      || loaded.context.contextId !== decoded.contextId) {
      return null;
    }
    return {
      session: loaded.session,
      context: loaded.context,
      account: {
        id: loaded.session.account_id,
        personId: loaded.session.person_id,
        tokenVersion: loaded.session.account_token_version,
        name: loaded.session.name,
        studentId: loaded.session.student_id
      }
    };
  } catch (_) {
    return null;
  }
}

function applyResolvedSession(req, resolved) {
  req.authSession = resolved.session;
  req.authAccount = resolved.account;
  req.authContext = resolved.context;
  // 统一身份令牌中的服务端上下文是唯一授权来源。请求头仅保留给旧客户端兼容。
  req.headers['x-active-org'] = resolved.context.organizationId;
  req.headers['x-role'] = resolved.context.role;
}

/**
 * 网页把令牌放在 HttpOnly Cookie 里，小程序放在 Authorization 头里。
 * 头优先于 Cookie：同一浏览器同时持有两者时，显式声明的凭据说了算。
 */
function readRequestToken(req) {
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (headerToken) return { token: headerToken, source: 'header' };
  const cookieToken = webSessionCookie.readWebSessionToken(req);
  if (cookieToken) return { token: cookieToken, source: 'cookie' };
  return { token: '', source: '' };
}

// 业务请求只接收服务端会话确认的账号、自然人和工作角色；微信仅属于登录凭据。
async function authMiddleware(req, res, next) {
  req.openid = ''; // 保留空兼容字段，禁止把任何微信标识当作业务调用者。
  if (PUBLIC_PATHS.has(req.path)) {
    return next();
  }

  // 受保护入口必须同时通过令牌、服务端会话和工作角色验证。
  const { token, source } = readRequestToken(req);

  if (!token) {
    req.openid = '';
    logger.warn('Missing auth token', { requestId: req.requestId, path: req.path });
    return res.status(401).json({ status: 'auth_failed', message: localeCopy.copy_20ca49e5e7 });
  }

  const resolved = await resolveUnifiedSession(token);
  if (!resolved) {
    req.openid = '';
    logger.warn('Unified auth session unavailable', {
      requestId: req.requestId,
      path: req.path,
      tokenSource: source
    });
    return res.status(401).json({ status: 'auth_failed', message: localeCopy.copy_b10d64a68c });
  }
  applyResolvedSession(req, resolved);
  req.authTokenSource = source;
  next();
}

module.exports = {
  authMiddleware,
  resolveUnifiedSession,
  readRequestToken,
  PUBLIC_PATHS,
  JWT_SECRET
};
