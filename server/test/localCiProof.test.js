'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verify, git, expected, readVerified, REF } = require('../../scripts/ci/proof');
const pair = crypto.generateKeyPairSync('ed25519');
const keys = { device: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
const now = Date.now();
const target = { sha: 'a'.repeat(40), tree: 'b'.repeat(40), policy: 'c'.repeat(64) };
function sign(extra = {}) {
  const payload = { version: 1, ...target, device: 'device', status: 'success', completedAt: now, ...extra };
  return { payload, signature: crypto.sign(null, Buffer.from(JSON.stringify(payload)), pair.privateKey).toString('base64') };
}
assert(verify(sign(), target, keys, now));
for (const extra of [{ sha: 'd'.repeat(40) }, { tree: 'd'.repeat(40) }, { policy: 'd'.repeat(64) },
  { status: 'failed' }, { device: 'unknown' }, { completedAt: now - 86400001 }, { completedAt: now + 60001 }, { version: 2 }]) {
  assert.equal(verify(sign(extra), target, keys, now), false);
}
const tampered = sign(); tampered.payload.sha = 'e'.repeat(40);
assert.equal(verify(tampered, { ...target, sha: tampered.payload.sha }, keys, now), false);
assert.equal(verify({ ...sign(), signature: 'bad' }, target, keys, now), false);
assert.equal(verify(null, target, keys, now), false);

// 真实 Git notes 读取，确认结果不能挪用到另一份提交或修改过的检查规则。
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-ci-proof-test-'));
git(directory, ['init', '-q']); git(directory, ['config', 'user.email', 'test@example.invalid']); git(directory, ['config', 'user.name', 'CI test']);
for (const file of ['scripts/ci/checks.json', 'scripts/ci/run.js', 'scripts/ci/proof.js', 'scripts/ci/local.js', '.github/workflows/ci.yml', 'web/playwright.config.js']) {
  fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true }); fs.writeFileSync(path.join(directory, file), 'test\n');
}
fs.writeFileSync(path.join(directory, 'scripts/ci/trusted-devices.json'), JSON.stringify(keys));
git(directory, ['add', '.']); git(directory, ['commit', '-qm', '验证夹具']);
const sha = git(directory, ['rev-parse', 'HEAD']), payload = { version: 1, ...expected(directory, sha), device: 'device', status: 'success', completedAt: now };
const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), pair.privateKey).toString('base64');
assert.equal(readVerified(directory, sha), null);
git(directory, ['notes', '--ref=' + REF, 'add', '-F', '-', sha], { input: JSON.stringify({ payload, signature }) });
assert(readVerified(directory, sha));
fs.appendFileSync(path.join(directory, 'scripts/ci/checks.json'), 'changed\n');
git(directory, ['add', '.']); git(directory, ['commit', '-qm', '变更检查清单']);
const next = git(directory, ['rev-parse', 'HEAD']);
git(directory, ['notes', '--ref=' + REF, 'copy', sha, next]);
assert.equal(readVerified(directory, next), null);
assert.equal(readVerified(directory, '--invalid'), null);

const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
assert.match(workflow, /workflow_dispatch:[\s\S]*force_remote:/);
assert.match(workflow, /needs: validation-complete/);
assert.match(workflow, /needs.validation-complete.result == 'success'/);
assert.match(workflow, /test "\$SOURCE_RESULT" = success/);
assert.match(workflow, /test "\$REMOTE_RESULT" = success/);
assert.match(workflow, /test "\$REMOTE_RESULT" = skipped/);
console.log('本机 CI 证明验证通过：签名、提交、规则、期限、失败、未知设备及真实 Git notes 隔离');

// Vite 会修改宿主 NODE_ENV；并行启动的服务端测试必须继续使用启动时环境。
const originalMode = process.env.NODE_ENV;
const { run } = require('../../scripts/ci/run');
process.env.NODE_ENV = 'ci-parent-mutated';
run(process.execPath, ['-e', 'require("node:assert/strict").equal(process.env.NODE_ENV, ' + JSON.stringify(originalMode) + ')'])
  .then(() => console.log('并行 CI 子进程环境隔离验证通过'))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => { if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode; });
