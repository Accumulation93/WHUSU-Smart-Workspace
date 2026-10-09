const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = fs.readFileSync(path.join(__dirname, '../scripts/deployProduction.sh'), 'utf8').replace(/\r/g, '');
const start = source.indexOf('if [[ "$FRONTEND_ONLY" -eq 1 ]]; then', source.indexOf('PENDING_COUNT='));
const end = source.indexOf('\nfi', start) + 3;
const branch = source.slice(start, end);
assert(start > 0 && end > start);
assert.doesNotMatch(branch, /reload_release|stop_process_group|pm2|touch .*MAINTENANCE_FLAG|migrate.*--apply/);
const rollbackStart = source.indexOf('  if [[ "$FRONTEND_ONLY" -eq 1 ]]; then', source.indexOf('rollback() {'));
const rollbackEnd = source.indexOf('\n  fi', rollbackStart) + 5;
const rollbackBranch = source.slice(rollbackStart, rollbackEnd);
assert(rollbackStart > 0);
assert.doesNotMatch(rollbackBranch, /reload_release|stop_process_group|pm2|restore/);
assert.match(rollbackBranch, /atomic_link "\$OLD_RELEASE"/);

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
// 用替身执行真实发布分支：核验迁移阻断、静态响应失败、正常发布与回退，禁止访问生产。
function run(body, variables) {
  const script = `set -e
FRONTEND_ONLY=1
PENDING_COUNT=0
RELEASE_SWITCHED=1
NEW_RELEASE=/test/new
OLD_RELEASE=/test/old
TARGET_SHA=test
MAINTENANCE_FLAG=/not-existing-whusu-test-flag
PUBLIC_HEALTH_URL=https://test.invalid/api/health
DEPLOY_DIR=/test/deploy
STATE_DIR=/dev
log() { echo "$*"; }
wait_for_health() { echo health; }
read_port() { echo 3000; }
curl() { echo static; }
atomic_link() { echo "switch:$1"; }
cmp() { return 0; }
mkdir() { :; }
install() { :; }
${variables || ''}
${body.replace(/> "\$STATE_DIR\/[^\"]+"/g, '> /dev/null')}`;
  return spawnSync(bash, ['-s'], { input: script, encoding: 'utf8' });
}
const success = run(branch);
assert.equal(success.status, 0, success.stderr);
assert.match(success.stdout, /switch:\/test\/new/);
const pending = run(branch, 'PENDING_COUNT=1');
assert.notEqual(pending.status, 0);
assert.doesNotMatch(pending.stdout, /switch:/);
const failedStatic = run(branch, 'cmp() { return 1; }');
assert.notEqual(failedStatic.status, 0);
const rollback = run(rollbackBranch);
assert.equal(rollback.status, 1);
assert.match(rollback.stdout, /switch:\/test\/old/);
console.log('网页独立发布：成功、迁移阻断、静态验证失败与目录回退 4 项通过');
