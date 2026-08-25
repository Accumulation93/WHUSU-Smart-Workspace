const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = require('../src/config/db');
const submissionFileModel = require('../src/modules/audit/models/auditSubmissionFile');

async function main() {
  const apply = process.argv.includes('--apply');
  const before = await submissionFileModel.inspectSigningKeyMigrationState();
  if (!apply) {
    process.stdout.write(JSON.stringify({ mode: 'check', ...before }) + '\n');
    if (before.plaintext || before.malformedOrMetadataMismatch) process.exitCode = 2;
    return;
  }

  if (before.malformedOrMetadataMismatch) {
    throw new Error('存在损坏密文或版本元数据不一致，禁止自动迁移');
  }

  let migrated = 0;
  let metadataRepaired = 0;
  while (true) {
    const batch = await submissionFileModel.migrateLegacySigningKeys({ limit: 100 });
    migrated += batch.migrated;
    metadataRepaired += batch.metadataRepaired;
    if (!batch.remainingPossible || batch.scanned === 0) break;
  }

  const after = await submissionFileModel.inspectSigningKeyMigrationState();
  process.stdout.write(JSON.stringify({
    mode: 'apply',
    migrated,
    metadataRepaired,
    remainingPlaintext: after.plaintext,
    remainingInvalid: after.malformedOrMetadataMismatch
  }) + '\n');
  if (after.plaintext || after.malformedOrMetadataMismatch) process.exitCode = 2;
}

main()
  .catch((error) => {
    process.stderr.write('[audit-signing-key-migration] ' + error.message + '\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
