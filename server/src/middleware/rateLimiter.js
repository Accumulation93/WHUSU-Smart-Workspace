const localeCopy = require('../locales/zh-CN/generated/middleware/rateLimiter');
const securityCopy = require('../locales/zh-CN/core/security');
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
      return res.status(429).json({ status: 'rate_limited', message: localeCopy.copy_4482813d2a });
    }
    next();
  };
}

function createSharedRateLimiter(options) {
  const config = options || {};
  const store = config.store;
  const policies = config.policies || {};
  const keyResolver = typeof config.keyResolver === 'function'
    ? config.keyResolver
    : (req) => 'ip:' + String(req.ip || '-');
  const cleanupIntervalMs = Math.max(1000, Number(config.cleanupIntervalMs) || 60000);
  let lastCleanupAt = 0;

  if (!store || typeof store.consume !== 'function' || typeof store.cleanupExpired !== 'function') {
    throw new Error(securityCopy.codes.sharedRateLimitStoreRequired);
  }

  return async function sharedRateLimiter(req, res, next) {
    const routePath = normalizeRoutePath(req.path);
    const policy = policies[routePath];
    if (!policy) return next();
    const now = Date.now();
    const windowMs = Math.max(1000, Number(policy.windowMs) || 60000);
    const maxRequests = Math.max(1, Number(policy.maxRequests) || 1);
    const discriminator = String(keyResolver(req, routePath) || 'anonymous');
    try {
      if (now - lastCleanupAt >= cleanupIntervalMs) {
        await store.cleanupExpired(now);
        lastCleanupAt = now;
      }
      const result = await store.consume({
        key: routePath + ':' + discriminator,
        routeKey: routePath,
        windowMs,
        maxRequests,
        now
      });
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - result.count)));
      res.setHeader('X-RateLimit-Scope', 'shared');
      if (!result.allowed) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - now) / 1000))));
        return res.status(429).json({ status: 'rate_limited', message: localeCopy.copy_4482813d2a });
      }
      return next();
    } catch (error) {
      if (req.logger && typeof req.logger.error === 'function') {
        req.logger.error('Shared rate limit unavailable', {
          error: error.message,
          path: routePath,
          requestId: req.requestId
        });
      }
      return res.status(503).json({
        status: 'rate_limit_unavailable',
        message: securityCopy.rateLimitUnavailable
      });
    }
  };
}

module.exports = { normalizeRoutePath, createRateLimiter, createSharedRateLimiter };
