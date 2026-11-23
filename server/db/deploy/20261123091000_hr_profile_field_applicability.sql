-- NULL 表示全员适用。范围只存在于当前组织的模板快照字段。
SET @profile_applicability_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields' AND COLUMN_NAME = 'applicability_json');
SET @profile_applicability_sql = IF(@profile_applicability_exists = 0,
  'ALTER TABLE org_hr_profile_template_snapshot_fields ADD COLUMN applicability_json JSON NULL, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE profile_applicability_stmt FROM @profile_applicability_sql;
EXECUTE profile_applicability_stmt;
DEALLOCATE PREPARE profile_applicability_stmt;
