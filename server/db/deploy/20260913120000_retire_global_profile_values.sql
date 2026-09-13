-- 退役全局补充资料合并：展示统一以组织内为准后，全局值不再写入或读取。
-- 归档由部署流程在迁移前执行 archiveGlobalProfileValues.js，并校验行数与 SHA256。
DROP TABLE IF EXISTS person_profile_value_history;
DROP TABLE IF EXISTS person_profile_values;
