'use strict';

// 本机与远端复用同一检查清单，任一失败都不会生成成功证明。
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { git } = require('./proof');
const checks = require('./checks.json');
const root = path.resolve(__dirname, '../..');
function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, args, { cwd, env: process.env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(command + ' ' + args.join(' ') + ' 退出码 ' + code)));
  });
}
function npm(args, cwd) {
  if (process.platform === 'win32') return run(process.execPath, [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args], cwd);
  return run('npm', args, cwd);
}
async function codeChecks() {
  const files = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  for (const file of files.filter(file => file.endsWith('.js'))) await run(process.execPath, ['--check', file]);
  for (const args of [...checks.static, ...checks.tests]) await run(process.execPath, args);
  for (const file of files.filter(file => /^miniprogram\/.*\.test\.js$/.test(file) || /^server\/test\/[^/]+\.test\.js$/.test(file))) await run(process.execPath, [file]);
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  for (const file of ['deployProduction.sh', 'deployEntrypoint.sh', 'setupCollabSession.sh']) await run(bash, ['-n', 'server/scripts/' + file]);
  await run(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-Command', "[scriptblock]::Create((Get-Content -Raw 'scripts/remote-collab.ps1')) | Out-Null"]);
  await run(process.execPath, ['scripts/dependency-audit.js', '--self-test']);
  await run(process.execPath, ['scripts/dependency-audit.js']);
  await run('git', ['diff', '--check']);
}
async function browserChecks() {
  await npm(['run', 'build'], path.join(root, 'web'));
  const vite = await import(pathToFileURL(path.join(root, 'web/node_modules/vite/dist/node/index.js')).href);
  const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
  const server = await vite.preview({ root: path.join(root, 'web'), configFile: path.join(root, 'web/vite.config.js'),
    preview: { host: '127.0.0.1', port, strictPort: true } });
  process.env.PLAYWRIGHT_REUSE = '1';
  try {
    await run(process.execPath, ['scripts/parity-audit.mjs', 'http://127.0.0.1:' + port + '/web'], path.join(root, 'web'));
    await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--workers=2'], path.join(root, 'web'));
  } finally {
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
}
async function main() {
  if (!process.env.DEPLOY_TEST_DB_HOST || !process.env.SECURITY_TEST_DB_HOST) throw new Error('必须配置隔离数据库，禁止跳过集成测试');
  const mysql = require(path.join(root, 'server/node_modules/mysql2/promise'));
  const connection = await mysql.createConnection({ host: process.env.DEPLOY_TEST_DB_HOST,
    port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306), user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '' });
  await connection.ping(); await connection.end();
  const results = await Promise.allSettled([codeChecks(), browserChecks()]);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  if (git(root, ['status', '--porcelain', '--untracked-files=no'])) throw new Error('验证过程修改了已跟踪源码，拒绝签发证明');
  console.log('本地/远端共用完整 CI 通过');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run, npm };
