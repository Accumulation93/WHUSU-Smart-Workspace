-- 补充资料字段新增「填写说明」：管理员在模板编辑里逐字段填写，随模板保存入库。
-- 纯文本、可多行、上限 200 字；存量字段留空，成员端继续只显示自动规则提醒。
DROP PROCEDURE IF EXISTS add_hr_profile_field_hint;

DELIMITER $$
CREATE PROCEDURE add_hr_profile_field_hint()
BEGIN
  DECLARE column_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'hr_profile_template_fields'
     AND COLUMN_NAME = 'hint';
  IF column_exists = 0 THEN
    ALTER TABLE hr_profile_template_fields ADD COLUMN hint VARCHAR(200) DEFAULT NULL AFTER options_json;
  END IF;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields'
     AND COLUMN_NAME = 'hint';
  IF column_exists = 0 THEN
    ALTER TABLE org_hr_profile_template_snapshot_fields ADD COLUMN hint VARCHAR(200) DEFAULT NULL AFTER options_json;
  END IF;
END$$
DELIMITER ;

CALL add_hr_profile_field_hint();
DROP PROCEDURE add_hr_profile_field_hint;
