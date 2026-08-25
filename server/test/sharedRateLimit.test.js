'use strict';

const assert = require('assert');
process.env.DB_USER = process.env.DB_USER || 'security-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'security-test';
const { createStore } = require('../src/core/models/sharedRateLimit');
const { createSharedRateLimiter } = require('../src/middleware/rateLimiter');

function createFakeDatabase() {
  const rows = new Map();
  return {
    rows,
    async getConnection() {
      let lastInsertId = 0;
      return {
        async query(sql, params) {
          if (sql.includes('INSERT INTO security_rate_limit_buckets')) {
            const hash = params[0];
            const windowStartedAt = params[2].getTime();
            const current = rows.get(hash);
            const count = current && current.windowStartedAt === windowStartedAt
              ? current.count + 1
              : 1;
            rows.set(hash, {
              count,
              windowStartedAt,
              expiresAt: params[3].getTime()
            });
            lastInsertId = count;
            return [{ affectedRows: 1 }];
          }
          if (sql.includes('SELECT LAST_INSERT_ID()')) return [[{ request_count: lastInsertId }]];
          throw new Error('未处理 SQL: ' + sql);
        },
        release() {}
      };
    },
    async query(sql, params) {
      if (sql.startsWith('DELETE FROM security_rate_limit_buckets')) {
        const now = params[0].getTime();
        let affectedRows = 0;
        rows.forEach((row, key) => {
          if (row.expiresAt <= now) {
            rows.delete(key);
            affectedRows += 1;
          }
        });
        return [{ affectedRows }];
      }
      throw new Error('未处理 SQL: ' + sql);
    }
  };
}

async function invoke(middleware, path, ip) {
  let nextCalled = false;
  const headers = {};
  const response = {
    statusCode: 200,
    body: null,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await middleware({
    path,
    ip,
    requestId: 'request-1',
    logger: { error() {} }
  }, response, () => { nextCalled = true; });
  return { nextCalled, response, headers };
}

(async () => {
  const database = createFakeDatabase();
  const storeA = createStore(database);
  const storeB = createStore(database);
  const policy = { '/api/health': { windowMs: 60000, maxRequests: 2 } };
  const limiterA = createSharedRateLimiter({ store: storeA, policies: policy, keyResolver: (req) => 'ip:' + req.ip });
  const limiterB = createSharedRateLimiter({ store: storeB, policies: policy, keyResolver: (req) => 'ip:' + req.ip });

  let result = await invoke(limiterA, '/api/health', '127.0.0.1');
  assert.strictEqual(result.nextCalled, true);
  result = await invoke(limiterB, '/api/health', '127.0.0.1');
  assert.strictEqual(result.nextCalled, true, '第二个 PM2 实例必须读取同一共享计数');
  result = await invoke(limiterA, '/api/health', '127.0.0.1');
  assert.strictEqual(result.response.statusCode, 429);
  assert.strictEqual(result.response.body.status, 'rate_limited');
  assert.strictEqual(result.headers['X-RateLimit-Scope'], 'shared');

  const unavailableLimiter = createSharedRateLimiter({
    store: {
      async cleanupExpired() { throw new Error('database unavailable'); },
      async consume() { throw new Error('database unavailable'); }
    },
    policies: policy
  });
  result = await invoke(unavailableLimiter, '/api/health', '127.0.0.2');
  assert.strictEqual(result.response.statusCode, 503);
  assert.strictEqual(result.response.body.status, 'rate_limit_unavailable');
  assert.strictEqual(result.nextCalled, false, '共享数据库异常必须 fail closed');

  console.log('跨实例共享计数、健康限流与数据库异常安全失败测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
