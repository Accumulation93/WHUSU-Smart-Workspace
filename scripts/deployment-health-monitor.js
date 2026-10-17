const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = 'https://accumulation93.com/api/health';
const INTERVAL_MS = 15000;
const DURATION_MS = 300000;

// 串行、限时采样；限流立即结束，不继续占用同网络出口的健康检查额度。
async function monitor({ request = () => fetch(URL, {
  headers: { 'User-Agent': 'WHUSU-Deployment-Health/1.0' },
  signal: AbortSignal.timeout(8000), redirect: 'error'
}), now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
emit = row => console.log(JSON.stringify(row)), durationMs = DURATION_MS } = {}) {
  const deadline = now() + Math.min(DURATION_MS, Math.max(0, durationMs));
  let failures = 0;
  let samples = 0;
  let consecutiveFailures = 0;
  while (now() < deadline) {
    const started = now();
    let status = 0;
    let healthy = false;
    let retryAfter = '';
    try {
      const response = await request();
      status = response.status;
      retryAfter = response.headers.get('retry-after') || '';
      healthy = status === 200 && (await response.json()).status === 'ok';
      if (!healthy && response.body) await response.body.cancel().catch(() => {});
    } catch (_) { /* 网络错误作为失败记录，禁止立即重试。 */ }
    samples += 1;
    if (!healthy) failures += 1;
    consecutiveFailures = healthy ? 0 : consecutiveFailures + 1;
    emit({ time: new Date(started).toISOString(), status, healthy, ms: now() - started, retryAfter });
    if (status === 429) return { samples, failures, stopped: 'rate_limited', retryAfter };
    const delay = Math.min(60000, INTERVAL_MS * (2 ** Math.min(consecutiveFailures, 2)));
    if (now() + delay >= deadline) break;
    await sleep(delay);
  }
  return { samples, failures, stopped: 'complete' };
}

async function main() {
  const lock = path.join(os.tmpdir(), 'whusu-deployment-health.lock');
  // 不自动删除存量锁：异常退出后应先确认旧监测进程已结束。
  const fd = fs.openSync(lock, 'wx', 0o600);
  try {
    fs.writeSync(fd, String(process.pid));
    const result = await monitor();
    console.log(JSON.stringify(result));
    if (result.failures) process.exitCode = 1;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.code === 'EEXIST' ? '已有健康监测锁，请确认旧进程结束后再运行。' : error.message);
  process.exitCode = 1;
});
module.exports = { monitor, INTERVAL_MS, DURATION_MS };
