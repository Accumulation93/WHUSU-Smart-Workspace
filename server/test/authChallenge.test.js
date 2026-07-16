const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');

let inserted;
const pool = {
  async query(sql, params) {
    if (sql.includes('INSERT INTO auth_challenges')) {
      inserted = {
        id: params[0],
        challenge_type: params[1],
        openid_hash: params[2],
        payload_json: params[3],
        expires_at: params[4],
        consumed_at: null
      };
      return [{ affectedRows: 1 }];
    }
    throw new Error('未预期的 SQL：' + sql);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return pool;
  if (request === '../../middleware/auth') return { JWT_SECRET: 'challenge-test-secret' };
  return originalLoad.call(this, request, parent, isMain);
};
const challengeModel = require('../src/core/models/authChallenge');
Module._load = originalLoad;

const conn = {
  async query(sql) {
    if (sql.includes('SELECT * FROM auth_challenges')) return [[inserted]];
    if (sql.includes('UPDATE auth_challenges')) {
      if (inserted.consumed_at) return [{ affectedRows: 0 }];
      inserted.consumed_at = new Date();
      return [{ affectedRows: 1 }];
    }
    throw new Error('未预期的事务 SQL：' + sql);
  }
};

async function run() {
  const token = await challengeModel.create('auto_bind', 'openid-a', { targetOrgId: 'org-44' });
  assert(token);
  assert.strictEqual(inserted.openid_hash, crypto.createHash('sha256').update('openid-a').digest('hex'));

  let locked = await challengeModel.lock(conn, token, 'auto_bind', 'openid-a');
  assert.strictEqual(locked.status, 'success');
  assert.strictEqual(locked.payload.targetOrgId, 'org-44');

  locked = await challengeModel.lock(conn, token, 'auto_bind', 'openid-b');
  assert.strictEqual(locked.status, 'challenge_expired');

  assert.strictEqual(await challengeModel.consume(conn, inserted.id), true);
  locked = await challengeModel.lock(conn, token, 'auto_bind', 'openid-a');
  assert.strictEqual(locked.status, 'challenge_expired');
  assert.strictEqual(await challengeModel.consume(conn, inserted.id), false);

  console.log('一次性绑定挑战测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
