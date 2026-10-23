-- 通知随业务事实失效，版本与业务写入在同一事务提交。
-- 只新增触发器和索引，在线执行，不删除业务数据。
SET @notice_index_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND INDEX_NAME='idx_notification_target')=0, 'ALTER TABLE notifications ADD INDEX idx_notification_target (org_id,recipient_type,recipient_id,target_type,target_id,type), ALGORITHM=INPLACE, LOCK=NONE', 'SELECT 1');
PREPARE notice_index FROM @notice_index_sql;
EXECUTE notice_index;
DEALLOCATE PREPARE notice_index;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS cv_calendar_events_i AFTER INSERT ON calendar_events FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_events_u AFTER UPDATE ON calendar_events FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_events_d AFTER DELETE ON calendar_events FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (OLD.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_exceptions_i AFTER INSERT ON calendar_exceptions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_exceptions_u AFTER UPDATE ON calendar_exceptions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_exceptions_d AFTER DELETE ON calendar_exceptions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (OLD.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_exits_i AFTER INSERT ON calendar_exits FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_exits_u AFTER UPDATE ON calendar_exits FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_exits_d AFTER DELETE ON calendar_exits FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (OLD.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_occurrence_records_i AFTER INSERT ON calendar_occurrence_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_occurrence_records_u AFTER UPDATE ON calendar_occurrence_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_occurrence_records_d AFTER DELETE ON calendar_occurrence_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (OLD.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_rules_i AFTER INSERT ON calendar_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_rules_u AFTER UPDATE ON calendar_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (NEW.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_calendar_rules_d AFTER DELETE ON calendar_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES (OLD.org_id,'calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_venue_activity_rules_i AFTER INSERT ON venue_activity_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES ('*','calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_venue_activity_rules_u AFTER UPDATE ON venue_activity_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES ('*','calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_venue_activity_rules_d AFTER DELETE ON venue_activity_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES ('*','calendar',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_org_hr_profile_migrations_i AFTER INSERT ON org_hr_profile_migrations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES ('*','profile',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_org_hr_profile_migrations_u AFTER UPDATE ON org_hr_profile_migrations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES ('*','profile',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
CREATE TRIGGER IF NOT EXISTS cv_org_hr_profile_migrations_d AFTER DELETE ON org_hr_profile_migrations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id,domain,version) VALUES ('*','profile',1)
    ON DUPLICATE KEY UPDATE version=version+1;
END$$
DELIMITER ;
