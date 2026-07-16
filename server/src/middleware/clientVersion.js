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

function clientVersionMiddleware(req, res, next) {
  const minimumVersion = String(process.env.MIN_CLIENT_VERSION || '').trim();
  if (!minimumVersion || !req.path.startsWith('/api/')) return next();
  if (req.path === '/api/ping' || req.path === '/api/health') return next();

  const clientVersion = req.get('X-Client-Version') || '';
  const comparison = compareVersions(clientVersion, minimumVersion);
  if (comparison == null || comparison < 0) {
    return res.status(426).json({
      status: 'client_upgrade_required',
      message: '当前小程序版本过低，请重启应用完成更新',
      minimumVersion
    });
  }
  next();
}

module.exports = { parseVersion, compareVersions, clientVersionMiddleware };
