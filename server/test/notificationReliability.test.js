const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const messageDataSource = fs.readFileSync(
  path.join(root, 'src/modules/audit/models/messageData.js'),
  'utf8'
);
const workerSource = fs.readFileSync(path.join(root, 'notificationWorker.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(root, 'backup.js'), 'utf8');
const outboxServiceSource = fs.readFileSync(
  path.join(root, 'src/modules/audit/services/notificationOutboxService.js'),
  'utf8'
);
const outboxModelSource = fs.readFileSync(
  path.join(root, 'src/modules/audit/models/notificationOutbox.js'),
  'utf8'
);
const migrationSource = fs.readFileSync(
  path.join(root, 'db/deploy/20260728143000_shared_audit_uploads.sql'),
  'utf8'
);

assert.match(messageDataSource, /SELECT h\.id, h\.name/);
assert.doesNotMatch(messageDataSource, /SELECT ui\.hr_id, h\.name/);
assert.match(outboxServiceSource, /createForRecipient\(job, 'user', user\.id/);
assert.doesNotMatch(outboxServiceSource, /createForRecipient\(job, 'user', user\.hr_id/);
assert.match(workerSource, /新的考核评分任务/);
assert.match(workerSource, /考核评分即将截止/);
assert.match(workerSource, /cleanupDead\(90\)/);
assert.match(workerSource, /cleanupOld\(pool, \{ retentionDays: 90/);
assert.match(workerSource, /cleanupAuditTemp/);
assert.match(outboxModelSource, /status = 'processing'[\s\S]*attempts >= 8[\s\S]*INTERVAL 10 MINUTE/);
assert.match(backupSource, /pipeline\(mysqldump\.stdout, gzip, outStream\)/);
assert.match(backupSource, /'--protocol=TCP'/);
assert.match(backupSource, /\.uploads\.tar\.gz/);
assert.match(backupSource, /fs\.renameSync\(temporaryFile, outFile\)/);
assert.match(migrationSource, /status = 'dead'/);
assert.match(migrationSource, /idx_notification_recipient_page/);

const adminScript = require('../scripts/notificationOutboxAdmin');
assert.deepStrictEqual(adminScript.parseArgs(['node', 'script', 'status']), {
  command: 'status',
  id: ''
});
assert.deepStrictEqual(adminScript.parseArgs(['node', 'script', 'retry', '--id', 'job-1']), {
  command: 'retry',
  id: 'job-1'
});
assert.throws(
  () => adminScript.parseArgs(['node', 'script', 'retry', '--id', '../bad']),
  /合法/
);

console.log('通知投递、死信、维护与备份可靠性测试通过');
