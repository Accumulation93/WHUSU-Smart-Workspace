-- 旧 UTC 迁移曾仅凭 CURRENT_TIMESTAMP 默认值把部分用户可见列判定为整列墙上时间。
-- 应用也可能显式写入同一列，无法逐记录证明来源，因此本迁移只撤销“已证明”结论、
-- 建立逐记录核对要求；不再二次移动现有值，避免用另一种猜测覆盖历史事实。
-- 迁移账本、迁移前备份及行级因果关系已经共同证明的字段保留原 UTC 归一化结论。
SET @time_reclass_previous_time_zone = @@SESSION.time_zone;
SET SESSION time_zone = '+00:00';

INSERT INTO absolute_time_migration_audit
  (id, migration_key, table_name, column_name, source_type,
   normalization_status, affected_rows, detail_json)
SELECT CONCAT('time_reclass_', SUBSTRING(SHA2(CONCAT(registry.table_name, ':', registry.column_name), 256), 1, 51)),
       '20260826093000', registry.table_name, registry.column_name,
       'legacy_unverified', 'reclassified_review_required',
       COALESCE(previous_audit.affected_rows, registry.snapshot_non_null_count, 0),
       JSON_OBJECT(
         'reason', 'column_default_does_not_prove_per_record_source',
         'previousSourceType', registry.source_type,
         'previousMigrationAction', registry.migration_action,
         'dataMovedByThisMigration', FALSE
       )
  FROM absolute_time_source_registry registry
  LEFT JOIN absolute_time_migration_audit previous_audit
    ON previous_audit.migration_key = '20260823190000'
   AND previous_audit.table_name = registry.table_name
   AND previous_audit.column_name = registry.column_name
 WHERE registry.user_visible = 1
   AND registry.migration_action = 'shift_minus_480'
   AND NOT (
     (registry.table_name = 'accounts' AND registry.column_name IN ('created_at', 'updated_at'))
     OR (registry.table_name = 'persons' AND registry.column_name IN ('created_at', 'updated_at'))
     OR (registry.table_name = 'organization_memberships' AND registry.column_name IN ('created_at', 'updated_at'))
     OR (registry.table_name = 'membership_assignments' AND registry.column_name IN ('created_at', 'updated_at'))
     OR (registry.table_name = 'hr_profile_record_values' AND registry.column_name = 'updated_at')
   )
ON DUPLICATE KEY UPDATE
  source_type = VALUES(source_type),
  normalization_status = VALUES(normalization_status),
  affected_rows = VALUES(affected_rows),
  detail_json = VALUES(detail_json),
  updated_at = CURRENT_TIMESTAMP(3);

UPDATE absolute_time_source_registry
   SET source_type = 'legacy_unverified',
       migration_action = 'record_review',
       evidence = '列默认值不能证明逐记录来源；保留当前值并进入逐记录历史时区核对',
       updated_at = CURRENT_TIMESTAMP(3)
 WHERE user_visible = 1
   AND migration_action = 'shift_minus_480'
   AND NOT (
     (table_name = 'accounts' AND column_name IN ('created_at', 'updated_at'))
     OR (table_name = 'persons' AND column_name IN ('created_at', 'updated_at'))
     OR (table_name = 'organization_memberships' AND column_name IN ('created_at', 'updated_at'))
     OR (table_name = 'membership_assignments' AND column_name IN ('created_at', 'updated_at'))
     OR (table_name = 'hr_profile_record_values' AND column_name = 'updated_at')
   );

UPDATE absolute_time_cutovers
   SET status = 'review_pending',
       verified_at = NULL,
       detail_json = JSON_SET(
         COALESCE(detail_json, JSON_OBJECT()),
         '$.reclassificationMigration', '20260826093000',
         '$.reclassificationReason', 'column_default_does_not_prove_per_record_source'
       ),
       updated_at = CURRENT_TIMESTAMP(3)
 WHERE migration_key = '20260823190000';

SET SESSION time_zone = @time_reclass_previous_time_zone;
