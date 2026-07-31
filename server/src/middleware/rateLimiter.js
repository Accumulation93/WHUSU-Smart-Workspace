function normalizeRoutePath(pathname) {
  return String(pathname || '/')
    .split('?')[0]
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .replace(/\/[A-Za-z0-9_-]{32,}(?=\/|$)/g, '/:id');
}

function createRateLimiter(options) {
  const config = options || {};
  const windowMs = Number(config.windowMs) || 60000;
  const defaultMax = Number(config.defaultMax) || 180;
  const loginMax = Number(config.loginMax) || 30;
  const capacity = Number(config.capacity) || 5000;
  const buckets = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const routePath = normalizeRoutePath(req.path);
  const isLoginPath = routePath === '/api/userLogin'
      || routePath === '/api/adminLogin'
      || routePath === '/api/auth/wechat/session'
      || routePath === '/api/auth/claims'
      || routePath === '/api/auth/claims/verify'
      || routePath === '/api/auth/claims/redeem'
      || routePath === '/api/auth/password/session'
      || routePath === '/api/auth/recovery/start'
      || routePath === '/api/auth/recovery/complete';
    const maxRequests = isLoginPath ? loginMax : defaultMax;
    const key = String(req.ip || '-') + ':' + routePath;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      if (!buckets.has(key) && buckets.size >= capacity) {
        for (const [candidate, value] of buckets) {
          if (value.resetAt <= now || buckets.size >= capacity) buckets.delete(candidate);
          if (buckets.size < capacity) break;
        }
      }
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));
    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ status: 'rate_limited', message: '请求过于频繁，请稍后重试' });
    }
    next();
  };
}

module.exports = { normalizeRoutePath, createRateLimiter };
