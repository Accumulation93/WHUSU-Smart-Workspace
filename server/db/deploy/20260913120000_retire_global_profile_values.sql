-- 退役全局补充资料合并：展示统一以组织内为准后，全局值不再写入或读取。
-- 归档由部署流程在迁移前执行 archiveGlobalProfileValues.js，并校验行数与 SHA256。
-- 先清理 UTC 逐记录核对账本与来源目录，避免删表后校验脚本查询已退役表。
DELETE FROM absolute_time_record_reviews
 WHERE table_name IN ('person_profile_values', 'person_profile_value_history');
DELETE FROM absolute_time_source_registry
 WHERE table_name IN ('person_profile_values', 'person_profile_value_history');
-- 清理没有来源目录归属的孤立核对记录，避免删表后计数口径与受管字段不一致。
DELETE review_row FROM absolute_time_record_reviews review_row
  LEFT JOIN absolute_time_source_registry registry_row
    ON registry_row.table_name = review_row.table_name
   AND registry_row.column_name = review_row.column_name
 WHERE review_row.migration_key = '20260823190000'
   AND registry_row.table_name IS NULL;
DROP TABLE IF EXISTS person_profile_value_history;
DROP TABLE IF EXISTS person_profile_values;
