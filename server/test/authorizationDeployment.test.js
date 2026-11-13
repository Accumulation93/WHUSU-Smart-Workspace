'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const tool = require('../scripts/authorizationDeployment');

test('授权切换要求全部实际进程运行兼容版本，不能只检查PM2名称或配置路径', () => {
  const current = path.resolve('runtime-current');
  const names = ['whusu-smart-workspace-api', 'whusu-smart-workspace-api', 'whusu-smart-workspace-notification-worker', 'whusu-smart-workspace-backup'];
  const processes = names.map((name, index) => ({ name, pid: index + 10, pm2_env: { status: 'online' } }));
  const cwd = () => path.join(current, 'server');
  tool.assertProcesses(processes, current, cwd);
  assert.throws(() => tool.assertProcesses(processes.slice(1), current, cwd), /process_count/);
  assert.throws(() => tool.assertProcesses(processes, current, pid => pid === 11 ? 'old-release/server' : cwd()), /old_process/);
  assert.throws(() => tool.assertProcesses(processes.map(item => ({ ...item, pm2_env: { status: 'launching' } })), current, cwd), /not_online/);
  assert.throws(() => tool.assertProtocol({ version: 0 }, 1), /incompatible/);
  for (const activationReady of [undefined, false, 'true', 1]) {
    assert.throws(() => tool.assertActivationReady({ version: 1, activationReady }), /not_ready/);
  }
  tool.assertActivationReady({ version: 1, activationReady: true });
  assert(tool.assertRouteCoverage() > 100);
});

test('授权启用后拒绝无协议旧提交和删解释器的提交，允许兼容回退及后续版本', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'authorization-release-test-'));
  const git = args => cp.execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, content) => { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  const commit = message => { git(['add', '--', 'server']); git(['-c', 'user.name=验证', '-c', 'user.email=test@example.invalid', 'commit', '-m', message]); return git(['rev-parse', 'HEAD']); };
  try {
    git(['init', '--quiet']); write('server/old.txt', 'old'); const old = commit('旧版本');
    write('server/authorization-protocol.json', '{"version":1}');
    for (const file of ['server/scripts/authorizationDeployment.js', 'server/src/core/services/authorizationSession.js', 'server/src/core/models/authorizationCutover.js']) write(file, 'module.exports = {};');
    const compatible = commit('兼容版本');
    assert.equal(tool.readReleaseProtocol(directory, compatible).version, 1);
    assert.throws(() => tool.assertActivationReady(tool.readReleaseProtocol(directory, compatible)), /not_ready/);
    write('server/authorization-protocol.json', '{"version":1,"activationReady":true}');
    assert.throws(() => tool.readReleaseProtocol(directory, compatible), /marker_modified/);
    const ready = commit('允许首次启用');
    tool.assertActivationReady(tool.readReleaseProtocol(directory, ready));
    const state = { phase: 'enforced', minimum_protocol: 1, fallback_sha: compatible };
    assert.throws(() => tool.assertGitRelease(state, directory, old));
    tool.assertGitRelease(state, directory, compatible);
    write('server/new.txt', 'new'); const next = commit('后续版本');
    tool.assertGitRelease(state, directory, next);
    write('server/authorization-protocol.json', '{"version":2,"activationReady":true}');
    for (const file of ['server/src/core/models/identityNature.js', 'server/src/core/models/identityNatureCutover.js', 'server/scripts/finalizeIdentityNatures.js']) write(file, 'module.exports = {};');
    const natureReady = commit('Nature protocol');
    const natureState = { phase: 'enforced', minimum_protocol: 2, fallback_sha: natureReady };
    assert.throws(() => tool.assertGitRelease(natureState, directory, next));
    tool.assertGitRelease(natureState, directory, natureReady);
    fs.unlinkSync(path.join(directory, 'server/src/core/services/authorizationSession.js'));
    const broken = commit('缺失解释器');
    assert.throws(() => tool.assertGitRelease(state, directory, broken));
    tool.assertGitRelease({ phase: 'shadow' }, directory, old);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('发布和授权切换共用锁，回退检查先于链接与数据库恢复', () => {
  const deploy = fs.readFileSync(path.resolve(__dirname, '../scripts/deployProduction.sh'), 'utf8');
  const entry = fs.readFileSync(path.resolve(__dirname, '../scripts/deployEntrypoint.sh'), 'utf8');
  const activate = fs.readFileSync(path.resolve(__dirname, '../scripts/authorizationDeployment.sh'), 'utf8');
  assert(entry.indexOf('authorizationDeployment.js" check-git') < entry.indexOf('exec bash'));
  const rollback = deploy.slice(deploy.indexOf('rollback() {'), deploy.indexOf("trap 'rollback"));
  assert(rollback.indexOf('check_authorization_release') < rollback.indexOf('atomic_link'));
  assert(rollback.indexOf('check_authorization_release') < rollback.indexOf('deploymentDatabase.js" restore'));
  assert.match(activate, /flock -n 9/);
  assert.match(activate, /\$DEPLOY_DIR\/deploy.lock/);
  const natureActivate = fs.readFileSync(path.resolve(__dirname, '../scripts/finalizeIdentityNatures.sh'), 'utf8');
  assert.match(natureActivate, /flock -n 9/);
  assert.match(natureActivate, /\$DEPLOY_DIR\/deploy.lock/);
  assert.match(deploy, /authorizationDeployment\.js" protected-shas/);
  assert.match(deploy, /CAN_PRUNE_RELEASES=0/);
  assert(deploy.indexOf('AUTHORIZATION_PROTECTED_SHAS"$') < deploy.lastIndexOf('worktree remove --force'));
});
