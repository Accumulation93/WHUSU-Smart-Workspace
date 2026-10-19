-- 自然人对同一业务通知的永久隐藏；不删除投递回执，不影响其他收件人。
CREATE TABLE IF NOT EXISTS notification_dismissals (
  org_id VARCHAR(64) NOT NULL,
  person_id VARCHAR(64) NOT NULL,
  event_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  deleted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (org_id, person_id, event_hash),
  KEY idx_notification_dismissal_person (person_id),
  CONSTRAINT fk_notification_dismissal_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_dismissal_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
DROP TRIGGER IF EXISTS cv_notification_dismissals_i$$
CREATE TRIGGER cv_notification_dismissals_i AFTER INSERT ON notification_dismissals FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (NEW.org_id, 'notification', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_notification_dismissals_u$$
CREATE TRIGGER cv_notification_dismissals_u AFTER UPDATE ON notification_dismissals FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (NEW.org_id, 'notification', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (OLD.org_id, 'notification', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_notification_dismissals_d$$
CREATE TRIGGER cv_notification_dismissals_d AFTER DELETE ON notification_dismissals FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (OLD.org_id, 'notification', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DELIMITER ;
