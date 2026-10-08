const localeCopy = require('../locales/zh-CN/generated/middleware/clientVersion');
const WEB_CLIENT_TYPE = 'web';
// 网页是持续发布的站点，版本号由构建注入；小程序由用户手动更新，两者必须分别设底线。
const DEFAULT_WEB_MINIMUM_VERSION = '1.0.0';

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function clientType(req) {
  const value = typeof req.get === 'function' ? req.get('X-Client-Type') : '';
  return String(value || '').trim().toLowerCase();
}

function minimumVersionFor(req) {
  if (clientType(req) === WEB_CLIENT_TYPE) {
    return String(process.env.MIN_WEB_CLIENT_VERSION || DEFAULT_WEB_MINIMUM_VERSION).trim();
  }
  return String(process.env.MIN_CLIENT_VERSION || '').trim();
}

function clientVersionMiddleware(req, res, next) {
  const minimumVersion = minimumVersionFor(req);
  if (!minimumVersion || !req.path.startsWith('/api/')) return next();
  if (req.path === '/api/ping' || req.path === '/api/health') return next();

  const clientVersion = req.get('X-Client-Version') || '';
  const comparison = compareVersions(clientVersion, minimumVersion);
  if (comparison == null || comparison < 0) {
    return res.status(426).json({
      status: 'client_upgrade_required',
      message: localeCopy.copy_5951e7703b,
      minimumVersion
    });
  }
  next();
}

module.exports = {
  parseVersion,
  compareVersions,
  clientType,
  minimumVersionFor,
  clientVersionMiddleware
};
