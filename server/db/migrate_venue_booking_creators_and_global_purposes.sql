-- 场地借用创建者与全局事由迁移（幂等）
SET @creator_type_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings' AND COLUMN_NAME = 'creator_type');
SET @sql = IF(@creator_type_exists = 0, "ALTER TABLE venue_bookings ADD COLUMN creator_type VARCHAR(16) NOT NULL DEFAULT 'user' AFTER user_hr_id", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @creator_admin_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings' AND COLUMN_NAME = 'creator_admin_id');
SET @sql = IF(@creator_admin_exists = 0, 'ALTER TABLE venue_bookings ADD COLUMN creator_admin_id VARCHAR(64) NULL AFTER creator_type', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE venue_bookings MODIFY COLUMN user_hr_id VARCHAR(64) NULL;
UPDATE venue_bookings SET creator_type = 'user' WHERE creator_type IS NULL OR creator_type = '';

SET @creator_admin_index = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings' AND INDEX_NAME = 'idx_vb_creator_admin');
SET @sql = IF(@creator_admin_index = 0, 'ALTER TABLE venue_bookings ADD INDEX idx_vb_creator_admin (creator_admin_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DELETE newer FROM venue_booking_purposes newer
JOIN venue_booking_purposes older ON TRIM(newer.text) = TRIM(older.text)
  AND (newer.created_at > older.created_at OR (newer.created_at = older.created_at AND newer.id > older.id));
UPDATE venue_booking_purposes SET text = TRIM(text);

SET @purpose_org_index = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_booking_purposes' AND INDEX_NAME = 'idx_vbp_org');
SET @sql = IF(@purpose_org_index > 0, 'ALTER TABLE venue_booking_purposes DROP INDEX idx_vbp_org', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @purpose_org_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_booking_purposes' AND COLUMN_NAME = 'org_id');
SET @sql = IF(@purpose_org_exists > 0, 'ALTER TABLE venue_booking_purposes DROP COLUMN org_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @purpose_text_index = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_booking_purposes' AND INDEX_NAME = 'uk_vbp_text');
SET @sql = IF(@purpose_text_index = 0, 'ALTER TABLE venue_booking_purposes ADD UNIQUE INDEX uk_vbp_text (text)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @purpose_order := 0;
UPDATE venue_booking_purposes SET sort_order = (@purpose_order := @purpose_order + 1) ORDER BY created_at, id;
