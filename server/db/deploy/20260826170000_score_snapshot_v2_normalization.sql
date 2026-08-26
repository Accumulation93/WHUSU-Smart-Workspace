-- @destructive 评分历史快照统一为固定 v2 字段结构；部署脚本会先备份，再由证明性 Node 迁移执行逐条规范化。
CREATE TABLE IF NOT EXISTS score_snapshot_normalization_audits (
  snapshot_version TINYINT UNSIGNED NOT NULL,
  total_record_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  normalized_record_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  evidence_fingerprint CHAR(64) NOT NULL,
  normalized_at DATETIME(3) NOT NULL,
  PRIMARY KEY (snapshot_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO absolute_time_source_registry
  (table_name, column_name, source_type, migration_action, evidence, primary_key_json, user_visible)
VALUES (
  'score_snapshot_normalization_audits',
  'normalized_at',
  'post_cutover_native_utc',
  'preserve',
  '规范化脚本在 UTC 数据库会话中使用 UTC_TIMESTAMP(3) 写入，仅用于内部迁移审计',
  JSON_ARRAY('snapshot_version'),
  0
)
ON DUPLICATE KEY UPDATE
  source_type = VALUES(source_type),
  migration_action = VALUES(migration_action),
  evidence = VALUES(evidence),
  primary_key_json = VALUES(primary_key_json),
  user_visible = VALUES(user_visible);
