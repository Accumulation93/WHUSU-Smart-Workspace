const assert = require('assert/strict');
const { monitor } = require('./deployment-health-monitor');

async function run(statuses) {
  let time = 0;
  const calls = [];
  return { result: await monitor({
    now: () => time,
    sleep: async ms => { time += ms; },
    emit: () => {},
    request: async () => {
      calls.push(time);
      const status = statuses.shift() || 200;
      return { status, headers: { get: () => status === 429 ? '45' : null },
        json: async () => ({ status: status === 200 ? 'ok' : 'degraded' }) };
    }
  }), calls };
}

(async () => {
  const healthy = await run([]);
  assert.equal(healthy.calls.length, 20);
  assert.equal(healthy.calls[1] - healthy.calls[0], 15000);
  assert.equal(healthy.result.failures, 0);
  const limited = await run([200, 429]);
  assert.equal(limited.calls.length, 2);
  assert.equal(limited.result.stopped, 'rate_limited');
  assert.equal(limited.result.retryAfter, '45');
  const failed = await run([503, 503, 200]);
  assert.deepEqual(failed.calls.slice(0, 4), [0, 30000, 90000, 105000]);
  assert.equal(failed.result.failures, 2);
  console.log('健康采样频率、总量、退避与限流停止检查通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
