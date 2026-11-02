'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const SHA = /^[a-f0-9]{40}$/;

function git(directory, args) {
  return cp.execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', windowsHide: true,
    timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function assertProtocol(marker, minimum) {
  if (!Number.isInteger(minimum) || minimum < 1 || !marker || !Number.isInteger(marker.version) || marker.version < minimum) throw Error('authorization_release_incompatible');
}

function assertRouteCoverage() {
  const routes = require('../src/core/services/adminPermissions').ROUTE_RULES;
  const registration = require('../src/core/models/authorizationBusinessRoute');
  const missing = [...routes.keys()].filter(route => !registration.isAdapted(route) && !registration.isRetired(route));
  if (missing.length) throw Error('authorization_routes_incomplete');
  return routes.size;
}

function readRelease(directory, expectedSha, minimum = 1) {
  if (!SHA.test(expectedSha || '')) throw Error('authorization_release_sha_invalid');
  const resolved = fs.realpathSync(directory);
  if (git(resolved, ['rev-parse', 'HEAD']) !== expectedSha) throw Error('authorization_release_sha_mismatch');
  const marker = JSON.parse(fs.readFileSync(path.join(resolved, 'server/authorization-protocol.json'), 'utf8'));
  assertProtocol(marker, minimum);
  for (const relative of ['server/src/core/services/authorizationSession.js', 'server/src/core/models/authorizationCutover.js',
    'server/scripts/authorizationDeployment.js', 'server/node_modules/mysql2/package.json']) {
    if (!fs.statSync(path.join(resolved, relative)).isFile()) throw Error('authorization_release_incomplete');
  }
  return resolved;
}

async function readTransition(connection) {
  const [[table]] = await connection.query("SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='authorization_runtime_transition'");
  if (!Number(table.total)) return null;
  const [[state]] = await connection.query('SELECT phase,minimum_protocol,compatible_sha,fallback_sha FROM authorization_runtime_transition WHERE id=1');
  if (!state) throw Error('authorization_transition_missing');
  return state;
}

function assertGitRelease(state, repository, sha) {
  if (!state || state.phase === 'shadow') return;
  if (state.phase !== 'enforced' || !SHA.test(sha || '') || !SHA.test(state.fallback_sha || '')) throw Error('authorization_transition_invalid');
  const marker = JSON.parse(git(repository, ['show', sha + ':server/authorization-protocol.json']));
  assertProtocol(marker, Number(state.minimum_protocol));
  git(repository, ['merge-base', '--is-ancestor', state.fallback_sha, sha]);
  for (const file of ['server/scripts/authorizationDeployment.js', 'server/src/core/services/authorizationSession.js', 'server/src/core/models/authorizationCutover.js']) {
    git(repository, ['cat-file', '-e', sha + ':' + file]);
  }
}

function assertProcesses(processes, current, resolveCwd) {
  for (const [name, count] of [['whusu-smart-workspace-api', 2], ['whusu-smart-workspace-notification-worker', 1], ['whusu-smart-workspace-backup', 1]]) {
    const matches = processes.filter(item => item.name === name);
    if (matches.length !== count) throw Error('authorization_runtime_process_count');
    for (const item of matches) {
      if (item.pm2_env?.status !== 'online' || !Number.isInteger(item.pid) || item.pid < 1) throw Error('authorization_runtime_not_online');
      if (resolveCwd(item.pid) !== path.join(current, 'server')) throw Error('authorization_runtime_old_process');
    }
  }
}

function verifyRuntime({ compatibleSha, fallbackSha, protocol }, options = {}) {
  assertRouteCoverage();
  if (process.platform !== 'linux') throw Error('authorization_activation_requires_production_linux');
  const releases = options.releases || process.env.WHUSU_SMART_WORKSPACE_RELEASES_DIR || '/home/ubuntu/whusu-smart-workspace-releases';
  const currentLink = options.current || process.env.WHUSU_SMART_WORKSPACE_CURRENT_LINK || '/home/ubuntu/whusu-smart-workspace-current';
  if (compatibleSha === fallbackSha) throw Error('authorization_independent_fallback_required');
  const current = readRelease(path.join(releases, compatibleSha), compatibleSha, protocol);
  readRelease(path.join(releases, fallbackSha), fallbackSha, protocol);
  git(current, ['merge-base', '--is-ancestor', fallbackSha, compatibleSha]);
  if (fs.realpathSync(currentLink) !== current) throw Error('authorization_current_release_mismatch');
  // PM2输出含环境配置，仅在进程内解析，不写日志或报告。
  const processes = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 15000,
    maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  assertProcesses(processes, current, pid => fs.realpathSync('/proc/' + pid + '/cwd'));
  return true;
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const command = process.argv[2];
  if (command === 'check-git' || command === 'check-release' || command === 'protected-shas') {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
    try {
      const state = await readTransition(connection);
      if (command === 'protected-shas') {
        if (state?.phase === 'enforced') {
          if (!SHA.test(state.compatible_sha || '') || !SHA.test(state.fallback_sha || '')) throw Error('authorization_transition_invalid');
          console.log(state.compatible_sha + '\n' + state.fallback_sha);
        }
        return;
      }
      const directory = process.argv[3];
      const sha = command === 'check-git' ? process.argv[4] : git(directory, ['rev-parse', 'HEAD']);
      assertGitRelease(state, directory, sha);
      if (command === 'check-release' && state?.phase === 'enforced') readRelease(directory, sha, Number(state.minimum_protocol));
      console.log(JSON.stringify({ status: 'success', phase: state?.phase || 'shadow', sha }));
    } finally { await connection.end(); }
    return;
  }
  if (!['stage', 'activate', 'status'].includes(command)) throw Error('authorization_deployment_command_invalid');
  const pool = require('../src/config/db');
  try {
    const model = require('../src/core/models/authorizationCutover');
    const result = command === 'stage' ? await model.stageAll()
      : command === 'status' ? await readTransition(pool)
        : await model.activate({ compatibleSha: process.argv[3], fallbackSha: process.argv[4] }, verifyRuntime);
    console.log(JSON.stringify({ status: 'success', result }));
  } finally { await pool.end(); }
}

if (require.main === module) main().catch(error => {
  // 不输出SQL、连接选项或PM2原文，错误类型足够定位发布阻断。
  console.error('授权发布检查失败：' + (String(error.code || error.message).match(/^authorization_[a-z_]+$/)?.[0] || 'authorization_deployment_failed'));
  process.exitCode = 1;
});

module.exports = { assertProtocol, assertRouteCoverage, assertGitRelease, assertProcesses, readRelease, readTransition, verifyRuntime };
