'use strict';

// 旧版本同时存在 mysql2 时区转换、SQL NOW/CURRENT_TIMESTAMP 和手工 Date 写入。
// 在没有逐记录证明时，字段名或表名只能证明“这是绝对时间候选”，不能证明应统一平移。
const NON_USER_VISIBLE_TABLES = new Set([
  'schema_migrations',
  'organization_dictionary_locks',
  'request_deduplication',
  '_shared_cache',
  'identity_migration_guards',
  'personnel_migration_audit',
  'absolute_time_source_registry',
  'absolute_time_record_reviews',
  'absolute_time_migration_audit',
  'absolute_time_cutovers'
]);

// 这些表在旧版本中同时存在手工 UTC 字符串和 mysql2 +08:00/数据库墙上时间写入。
// 表内历史记录来源无法仅凭字段判断，必须逐记录核对，禁止整列平移。
const MIXED_SOURCE_TABLES = new Set([
  'departments',
  'identities',
  'work_groups',
  'hr_info',
  'user_info',
  'system_config',
  'score_activities',
  'score_question_templates',
  'rate_target_rules',
  'score_records',
  'hr_profile_records',
  'person_profile_values',
  'person_profile_value_history',
  'result_publications',
  'pub_view_rules',
  'pub_view_rule_clauses',
  'pub_merit_rules',
  'pub_merit_rule_clauses'
]);

const ABSOLUTE_COLUMN_PATTERN = /(?:^|_)(?:created|updated|processed|signed|expires|approved|rejected|reviewed|submitted|completed|deleted|joined|left|revoked|bound|verified|consumed|read|published|requested|required|available|checked|touched|invited|selected|seen|locked|used|start|starts|end|ends)(?:_at|_until)?$/;

function isAbsoluteColumnName(columnName) {
  return columnName === 'time_start' || columnName === 'time_end' || ABSOLUTE_COLUMN_PATTERN.test(columnName);
}

function hasDatabaseWallClockDefault(column) {
  return /CURRENT_TIMESTAMP/i.test(String(column && column.columnDefault || ''));
}

function classifyColumn(tableName, columnName, column) {
  if (isAbsoluteColumnName(columnName)) {
    if (!MIXED_SOURCE_TABLES.has(tableName) && hasDatabaseWallClockDefault(column)) {
      return {
        sourceType: 'legacy_wall_utc_plus_8',
        migrationAction: 'shift_minus_480',
        evidence: '旧连接固定 +08:00，且字段由数据库 CURRENT_TIMESTAMP 生成；整列减 480 分钟转为 UTC'
      };
    }
    return {
      sourceType: 'legacy_unverified',
      migrationAction: 'record_review',
      evidence: '未取得逐记录写入来源证明；保持原值并建立逐记录待核对记录'
    };
  }
  return {
    sourceType: 'unclassified',
    migrationAction: 'block_release',
    evidence: '未登记绝对时间语义或逐记录写入来源'
  };
}

function isUserVisibleTable(tableName) {
  return !NON_USER_VISIBLE_TABLES.has(tableName);
}

module.exports = {
  NON_USER_VISIBLE_TABLES,
  MIXED_SOURCE_TABLES,
  ABSOLUTE_COLUMN_PATTERN,
  isAbsoluteColumnName,
  hasDatabaseWallClockDefault,
  classifyColumn,
  isUserVisibleTable
};
