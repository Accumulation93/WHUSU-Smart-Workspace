'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();

// 只在一次读取请求内复用。业务事务不得复用读取前的岗位或权限结果。
function run(work) {
  if (storage.getStore()) return work();
  return storage.run({ memo: new Map(), stages: {}, sqlCount: 0, sqlMs: 0, poolWaitMs: 0, rows: 0 }, work);
}

function memo(key, work) {
  const state = storage.getStore();
  if (!state || !state.readOnly) return work();
  if (!state.memo.has(key)) {
    const pending = Promise.resolve().then(work);
    state.memo.set(key, pending);
    pending.catch(() => { if (state.memo.get(key) === pending) state.memo.delete(key); });
  }
  return state.memo.get(key);
}

async function measure(name, work) {
  const started = performance.now();
  try { return await work(); } finally {
    const state = storage.getStore();
    if (state) state.stages[name] = (state.stages[name] || 0) + performance.now() - started;
  }
}

function instrumentPool(pool) {
  const acquire = pool.getConnection.bind(pool);
  pool.getConnection = async function() {
    const started = performance.now();
    const connection = await acquire();
    const state = storage.getStore();
    if (state) state.poolWaitMs += performance.now() - started;
    const query = connection.query.bind(connection);
    connection.query = async function(...args) {
      const current = storage.getStore();
      const time = performance.now();
      try {
        const result = await query(...args);
        if (current && Array.isArray(result[0])) current.rows += result[0].length;
        return result;
      } finally {
        if (current) { current.sqlCount += 1; current.sqlMs += performance.now() - time; }
      }
    };
    return connection;
  };
  pool.query = async function(...args) {
    const connection = await pool.getConnection();
    try { return await connection.query(...args); } finally { connection.release(); }
  };
}

module.exports = { run, memo, measure, instrumentPool, getState: () => storage.getStore() };
