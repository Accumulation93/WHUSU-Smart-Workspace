'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { REF, git, expected, readVerified } = require('./proof');
const root = path.resolve(__dirname, '../..');
const deviceHome = path.join(os.homedir(), '.whusu-local-ci');
const configPath = path.join(deviceHome, 'device.json');
function exec(command, args, cwd = root, options = {}) {
  return cp.execFileSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, ...options });
}
function install() {
  let existing = '';
  try { existing = git(root, ['config', '--get', 'core.hooksPath'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (_) { /* 未配置时继续安装。 */ }
  if (existing && existing !== '.githooks') throw new Error('已有自定义 Git hook，需先合并，不能覆盖');
  fs.mkdirSync(deviceHome, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(configPath)) {
    const pair = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(path.join(deviceHome, 'signing-key.pem'), pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
    const device = crypto.randomBytes(12).toString('hex');
    fs.writeFileSync(configPath, JSON.stringify({ device, dbPort: 3362, browser: 'chrome' }, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(deviceHome, 'public-key.pem'), pair.publicKey.export({ type: 'spki', format: 'pem' }));
  }
  if (process.platform === 'win32') exec('icacls.exe', [deviceHome, '/inheritance:r', '/grant:r', process.env.USERDOMAIN + '\\' + process.env.USERNAME + ':(OI)(CI)F']);
  const config = JSON.parse(fs.readFileSync(configPath));
  const publicPath = path.join(root, 'scripts/ci/trusted-devices.json');
  const keys = fs.existsSync(publicPath) ? JSON.parse(fs.readFileSync(publicPath)) : {};
  keys[config.device] = fs.readFileSync(path.join(deviceHome, 'public-key.pem'), 'utf8');
  fs.writeFileSync(publicPath, JSON.stringify(keys, null, 2) + '\n');
  git(root, ['config', '--local', 'core.hooksPath', '.githooks']);
  console.log('本机已启用推送前验证，私钥只保存在当前用户目录');
}
function validate(sha) {
  if (readVerified(root, sha)) { console.log('复用同一提交 24 小时内的本机验证'); return; }
  const config = JSON.parse(fs.readFileSync(configPath));
  const keys = JSON.parse(git(root, ['show', sha + ':scripts/ci/trusted-devices.json']));
  if (!keys[config.device]) throw new Error('当前设备公钥未登记在目标提交');
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-ci-'));
  console.log('仅验证目标提交，未提交改动不会进入检查：' + sha);
  // 独立克隆避免用户脏工作区、正在开发的文件和旧构建产物污染证明。
  exec('git', ['-c', 'core.autocrlf=false', 'clone', '--shared', '--no-checkout', root, checkout]);
  exec('git', ['-c', 'core.autocrlf=false', 'checkout', '--detach', sha], checkout);
  const env = { ...process.env, TZ: 'UTC', PLAYWRIGHT_CHANNEL: config.browser || 'chrome', PLAYWRIGHT_PORT: '4187',
    PLAYWRIGHT_REUSE: '0', DEPLOY_TEST_DB_HOST: '127.0.0.1', SECURITY_TEST_DB_HOST: '127.0.0.1', HR_IMPORT_TEST_DB_HOST: '127.0.0.1',
    DEPLOY_TEST_DB_PORT: String(config.dbPort), SECURITY_TEST_DB_PORT: String(config.dbPort), HR_IMPORT_TEST_DB_PORT: String(config.dbPort),
    DEPLOY_TEST_DB_USER: 'root', TEST_DB_USER_HOST: '%' };
  delete env.SIGNING_FRONTEND_PARAMETERS;
  const npm = process.platform === 'win32' ? process.execPath : 'npm';
  const prefix = process.platform === 'win32' ? [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')] : [];
  for (const directory of ['server', 'web']) exec(npm, [...prefix, 'ci', '--no-audit', '--no-fund'], path.join(checkout, directory), { env });
  exec(process.execPath, ['scripts/ci/run.js'], checkout, { env });
  if (git(checkout, ['rev-parse', 'HEAD']) !== sha || git(checkout, ['status', '--porcelain', '--untracked-files=no'])) throw new Error('验证源码发生变化');
  const payload = { version: 1, ...expected(root, sha), device: config.device, status: 'success', completedAt: Date.now() };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), fs.readFileSync(path.join(deviceHome, 'signing-key.pem'))).toString('base64');
  git(root, ['notes', '--ref=' + REF, 'add', '-f', '-F', '-', sha], { input: JSON.stringify({ payload, signature }) });
  console.log('完整验证通过并生成提交证明。独立检查目录：' + checkout);
}
async function main() {
  if (process.argv[2] === 'install') return install();
  if (process.argv[2] === 'verify') return validate(process.argv[3] || git(root, ['rev-parse', 'HEAD']));
  if (process.argv[2] !== 'pre-push') throw new Error('用法：local.js install | verify [SHA] | pre-push REMOTE');
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const targets = input.trim().split('\n').map(line => line.trim().split(/\s+/))
    .filter(parts => ['refs/heads/main', 'refs/heads/feature/audit'].includes(parts[2]) && !/^0+$/.test(parts[1]));
  if (!targets.length) return;
  if (process.env.WHUSU_CI_MODE === 'remote') { console.log('已明确选择远端 CI'); return; }
  for (const target of targets) validate(target[1]);
  // 先推证明，再推分支；证明缺失、冲突或推送失败时阻止分支推送。
  exec('git', ['push', process.argv[3], REF + ':' + REF]);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
