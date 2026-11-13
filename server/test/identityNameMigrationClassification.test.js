'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isDestructiveMigration } = require('../scripts/runDeploymentMigrations');
const replacement = 'ALTER TABLE identities ADD UNIQUE INDEX idx_identity_exact_name(org_id,name_exact_key), DROP INDEX idx_ident_name, ALGORITHM=INPLACE, LOCK=NONE';
test('仅已核验的原子唯一索引替换可以在线执行', () => {
  assert.equal(isDestructiveMigration(replacement), false);
  assert.equal(isDestructiveMigration(replacement.replace('LOCK=NONE', 'LOCK=EXCLUSIVE')), true);
  assert.equal(isDestructiveMigration('ALTER TABLE identities DROP INDEX idx_ident_name'), true);
  assert.equal(isDestructiveMigration(replacement + '; DELETE FROM identities'), true);
  assert.equal(isDestructiveMigration('-- @destructive\n' + replacement), true);
  const sql = fs.readFileSync(path.join(__dirname, '../db/deploy/20261111104000_identity_name_exact_key.sql'), 'utf8');
  assert.equal(isDestructiveMigration(sql), false);
});
