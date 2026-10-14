'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const path = require('node:path');
const REF = 'refs/notes/local-ci';
const MAX_AGE = 24 * 60 * 60 * 1000;
function git(root, args, options = {}) {
  return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options }).trim();
}
function policy(root, sha) {
  const files = ['scripts/ci/checks.json', 'scripts/ci/run.js', 'scripts/ci/proof.js', 'scripts/ci/local.js',
    '.github/workflows/ci.yml', 'web/playwright.config.js'];
  return crypto.createHash('sha256').update(files.map(file => git(root, ['show', sha + ':' + file])).join('\n')).digest('hex');
}
function verify(proof, expected, keys, now = Date.now()) {
  if (!proof || !proof.payload || typeof proof.signature !== 'string') return false;
  const p = proof.payload, key = keys[p.device];
  return Boolean(key && p.version === 1 && p.status === 'success' && p.sha === expected.sha && p.tree === expected.tree
    && p.policy === expected.policy && Number.isFinite(p.completedAt) && p.completedAt <= now + 60000
    && now - p.completedAt <= MAX_AGE && crypto.verify(null, Buffer.from(JSON.stringify(p)), key, Buffer.from(proof.signature, 'base64')));
}
function expected(root, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('必须使用完整提交号');
  return { sha, tree: git(root, ['rev-parse', sha + '^{tree}']), policy: policy(root, sha) };
}
function readVerified(root, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) return null;
  try {
    const keys = JSON.parse(git(root, ['show', sha + ':scripts/ci/trusted-devices.json']));
    const proof = JSON.parse(git(root, ['notes', '--ref=' + REF, 'show', sha], { stdio: ['pipe', 'pipe', 'ignore'] }));
    return verify(proof, expected(root, sha), keys) ? proof : null;
  } catch (_) { return null; }
}
if (require.main === module) {
  const root = path.resolve(__dirname, '../..'), sha = process.env.GITHUB_SHA || git(root, ['rev-parse', 'HEAD']);
  const local = process.env.FORCE_REMOTE !== 'true' && process.env.GITHUB_EVENT_NAME !== 'pull_request' && Boolean(readVerified(root, sha));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'local=' + local + '\n');
  console.log(local ? '采用本机完整验证结果，提交与签名匹配' : '执行远端完整 CI');
}
module.exports = { REF, git, policy, verify, expected, readVerified };
