'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

const initSql = read('../db/init.sql');
const scoreMigration = read('../db/deploy/20260825234500_score_calculation_context_snapshot.sql');
const scoreNormalizationMigration = read('../db/deploy/20260826170000_score_snapshot_v2_normalization.sql');
const fileMigration = read('../db/deploy/20260825235000_audit_file_revisions.sql');

assert(/CREATE TABLE IF NOT EXISTS score_records[\s\S]*calculation_context_snapshot JSON DEFAULT NULL/i.test(initSql),
  'fresh schema 必须包含评分计算上下文快照列');
assert(/CREATE TABLE IF NOT EXISTS score_snapshot_normalization_audits/i.test(initSql),
  'fresh schema 必须包含评分快照 v2 规范化审计表');
assert(scoreNormalizationMigration.includes('post_cutover_native_utc')
  && scoreNormalizationMigration.includes('score_snapshot_normalization_audits'),
'评分快照规范化迁移必须登记其 UTC 内部审计时间来源');
assert(/CREATE TABLE IF NOT EXISTS audit_submission_files[\s\S]*revision_round INT NOT NULL DEFAULT 1[\s\S]*is_current TINYINT\(1\) NOT NULL DEFAULT 1/i.test(initSql),
  'fresh schema 必须包含审核附件修订轮次与当前标记');
assert(initSql.includes('idx_asf_current_revision'), 'fresh schema 必须包含当前附件修订索引');
assert(scoreMigration.includes('information_schema.COLUMNS')
  && !/UPDATE\s+score_records/i.test(scoreMigration),
  '评分迁移必须幂等加列且不得用当前规则回填旧评分');
assert(fileMigration.includes('information_schema.COLUMNS')
  && fileMigration.includes('information_schema.STATISTICS'),
  '附件迁移必须幂等检查列和索引');
assert(!/DELETE\s+FROM\s+audit_submission_files/i.test(fileMigration),
  '附件修订迁移不得物理删除历史附件');

console.log('fresh schema 与历史证据迁移一致性测试通过');
