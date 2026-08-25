'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(root, 'backup.js'), 'utf8');
const initSource = fs.readFileSync(path.join(root, 'db/init.sql'), 'utf8');
const migrationSource = fs.readFileSync(
  path.join(root, 'db/deploy/20260825233000_server_security_hardening.sql'),
  'utf8'
);
const auditTempUploadModelSource = fs.readFileSync(
  path.join(root, 'src/core/models/auditTempUpload.js'),
  'utf8'
);

const memoryLimiter = indexSource.indexOf('app.use(createRateLimiter({');
const sharedIpLimiter = indexSource.indexOf('policies: SHARED_IP_RATE_POLICIES');
const healthRoute = indexSource.indexOf("app.get('/api/health'");
const publicBodyParser = indexSource.indexOf(
  'PUBLIC_BODY_ROUTES.has(req.path) ? parseJsonBody(req, res, next) : next()'
);
const authentication = indexSource.indexOf('app.use(authMiddleware);');
const sharedAccountLimiter = indexSource.indexOf('policies: SHARED_ACCOUNT_RATE_POLICIES');
const protectedBodyParser = indexSource.indexOf(
  'PUBLIC_BODY_ROUTES.has(req.path) ? next() : parseJsonBody(req, res, next)'
);

assert(memoryLimiter >= 0 && memoryLimiter < sharedIpLimiter, '普通路由先走进程内快速限流');
assert(sharedIpLimiter < healthRoute, 'health/ping 必须位于共享限流之后');
assert(publicBodyParser < authentication, '公开登录入口必须在认证前解析受限请求体');
assert(authentication < sharedAccountLimiter, '上传账号共享限流必须在 JWT 会话校验之后');
assert(sharedAccountLimiter < protectedBodyParser, '受保护大请求必须先认证和按账号限流再解析');
assert.strictEqual(indexSource.trimStart().startsWith('process.umask(0o077);'), true, '服务进程必须先设置 umask 077');
assert.strictEqual(backupSource.includes('process.umask(0o077);'), true, '备份进程必须设置 umask 077');
assert.match(backupSource, /fs\.mkdirSync\(dir, \{ recursive: true, mode: 0o700 \}\)/);
assert.match(backupSource, /fs\.createWriteStream\(temporaryFile, \{ mode: 0o600 \}\)/);
assert.match(backupSource, /fs\.chmodSync\(filePath, 0o600\)/);
assert(indexSource.includes("'/api/health': { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: 30 }"));
assert(indexSource.includes("'/api/uploadAuditFile': { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: 20 }"));
assert(indexSource.includes("'/api/parseTableFile': { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: 6 }"));
assert(indexSource.includes("'/api/verifyAuditFile': { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: 8 }"));
assert(indexSource.includes("'/api/verifyFileSignature': { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: 4 }"));
assert(indexSource.includes("'/api/verifySignatureChain': { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: 4 }"));
assert.match(indexSource, /const HEALTH_CACHE_MS = 2000/);
assert.match(indexSource, /if \(!healthCheckPromise\)/);
assert.match(indexSource, /healthCache\.expiresAt <= now/);

for (const source of [initSource, migrationSource]) {
  assert.match(source, /CREATE TABLE IF NOT EXISTS security_rate_limit_buckets/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS audit_temp_uploads/);
  assert.match(source, /owner_hash CHAR\(64\)/);
  const auditTempTable = source.match(
    /CREATE TABLE IF NOT EXISTS audit_temp_uploads \([\s\S]*?\n\) ENGINE=InnoDB/
  );
  assert.ok(auditTempTable, '必须定义 audit_temp_uploads');
  assert.match(auditTempTable[0], /\borganization_id VARCHAR\(64\) NOT NULL/);
  assert.doesNotMatch(auditTempTable[0], /\borg_id\b/);
  assert.doesNotMatch(source, /audit_temp_uploads[\s\S]{0,500}\bopenid\b/i);
}
assert.match(auditTempUploadModelSource, /\borganization_id\b/);
assert.doesNotMatch(auditTempUploadModelSource, /\borg_id\b/);
assert.match(initSource, /passphrase_min_length INT NOT NULL DEFAULT 12/);
assert.match(migrationSource, /passphrase_min_length = 12/);
assert.match(migrationSource, /MODIFY COLUMN passphrase_min_length INT NOT NULL DEFAULT 12/);
assert.match(migrationSource, /SET @server_security_previous_time_zone := @@SESSION\.time_zone/);
assert.match(migrationSource, /SET SESSION time_zone = '\+00:00'/);
assert.match(migrationSource, /SET SESSION time_zone = @server_security_previous_time_zone/);

console.log('认证解析顺序、健康共享限流与安全迁移契约测试通过');
