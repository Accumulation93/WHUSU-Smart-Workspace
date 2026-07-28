const assert = require('assert');
const dedup = require('../src/utils/requestDeduplication');

function makeConnection(mode) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('INSERT IGNORE')) return [{ affectedRows: mode === 'new' ? 1 : 0 }];
      if (sql.includes('SELECT resource_id')) {
        return [[{ resource_id: 'resource-first', response_json: '{"status":"success","id":"resource-first"}' }]];
      }
      return [{ affectedRows: 1 }];
    }
  };
}

async function run() {
  const freshConn = makeConnection('new');
  const fresh = await dedup.claim(freshConn, {
    orgId: 'org-a', actorKey: 'user:u1', operationType: 'create', clientRequestId: 'req-1', resourceId: 'resource-new'
  });
  assert.strictEqual(fresh.claimed, true);
  assert.strictEqual(fresh.enabled, true);
  await dedup.complete(freshConn, {
    ...fresh,
    orgId: 'org-a', actorKey: 'user:u1', operationType: 'create', resourceId: 'resource-new'
  }, { status: 'success', id: 'resource-new' });
  assert(freshConn.calls.some((call) => call.sql.includes('UPDATE request_deduplication')));

  const replayConn = makeConnection('replay');
  const replay = await dedup.claim(replayConn, {
    orgId: 'org-a', actorKey: 'user:u1', operationType: 'create', clientRequestId: 'req-1', resourceId: 'resource-other'
  });
  assert.strictEqual(replay.claimed, false);
  assert.strictEqual(replay.resourceId, 'resource-first');
  assert.deepStrictEqual(replay.response, { status: 'success', id: 'resource-first' });

  assert.throws(() => dedup.normalizeClientRequestId('包含空格'), /invalid_client_request_id/);

  const cleanupCalls = [];
  const cleanupResults = [500, 120];
  const removed = await dedup.cleanupOld({
    async query(sql, params) {
      cleanupCalls.push({ sql, params });
      return [{ affectedRows: cleanupResults.shift() }];
    }
  }, { retentionDays: 90, batchSize: 500, maxBatches: 20 });
  assert.strictEqual(removed, 620);
  assert.strictEqual(cleanupCalls.length, 2);
  assert.match(cleanupCalls[0].sql, /created_at < DATE_SUB/);
  assert.deepStrictEqual(cleanupCalls[0].params, [90, 500]);
  console.log('写请求幂等测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
