-- 统一消息中心、通知 Outbox 与显式场地审批模式迁移。
-- 执行前必须完成完整数据库备份；旧待审批通知会先归档再删除。

DELIMITER //
DROP PROCEDURE IF EXISTS migrate_message_center//
CREATE PROCEDURE migrate_message_center()
BEGIN
  DECLARE unsafe_audit_steps INT DEFAULT 0;

  SELECT COUNT(*) INTO unsafe_audit_steps
    FROM audit_submission_steps s
    JOIN audit_submissions sub ON sub.id = s.submission_id AND sub.org_id = s.org_id
   WHERE s.status = 'pending' AND sub.status = 'in_progress'
     AND s.sort_order = sub.current_step_index
     AND (s.approver_hr_id IS NULL OR s.approver_hr_id = '')
     AND (s.approver_identity_id IS NULL OR s.approver_identity_id = '')
     AND (s.step_conditions_json IS NULL OR s.step_conditions_json = '' OR s.step_conditions_json = '[]')
     AND NOT EXISTS (
       SELECT 1 FROM audit_flow_template_step_conditions c
        WHERE c.template_step_id = s.template_step_id AND c.org_id = s.org_id
     );
  IF unsafe_audit_steps > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '存在进行中的无条件审核步骤，消息中心迁移已停止';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'recipient_type'
  ) THEN
    ALTER TABLE notifications ADD COLUMN recipient_type VARCHAR(16) NOT NULL DEFAULT 'user' AFTER hr_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'recipient_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN recipient_id VARCHAR(64) NOT NULL DEFAULT '' AFTER recipient_type;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'event_key'
  ) THEN
    ALTER TABLE notifications ADD COLUMN event_key VARCHAR(255) DEFAULT NULL AFTER recipient_id;
  END IF;

  ALTER TABLE notifications MODIFY COLUMN hr_id VARCHAR(64) NULL;
  UPDATE notifications SET recipient_type = 'user', recipient_id = hr_id
   WHERE recipient_id = '' AND hr_id IS NOT NULL AND hr_id <> '';

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notification_recipient_unread'
  ) THEN
    ALTER TABLE notifications ADD INDEX idx_notification_recipient_unread
      (org_id, recipient_type, recipient_id, is_read, created_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'uk_notification_event'
  ) THEN
    ALTER TABLE notifications ADD UNIQUE INDEX uk_notification_event (org_id, event_key);
  END IF;

  CREATE TABLE IF NOT EXISTS notification_pending_approval_archive LIKE notifications;
  INSERT IGNORE INTO notification_pending_approval_archive
    SELECT * FROM notifications WHERE type = 'pending_approval';
  DELETE FROM notifications WHERE type = 'pending_approval';

  CREATE TABLE IF NOT EXISTS notification_outbox (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    org_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(48) NOT NULL,
    event_key VARCHAR(255) NOT NULL,
    recipient_type VARCHAR(16) DEFAULT NULL,
    recipient_id VARCHAR(64) DEFAULT NULL,
    payload_json JSON NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME DEFAULT NULL,
    last_error VARCHAR(500) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_notification_outbox_event (org_id, event_key),
    INDEX idx_notification_outbox_claim (status, available_at, attempts),
    INDEX idx_notification_outbox_done (status, processed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_approval_flow_steps' AND COLUMN_NAME = 'approval_mode'
  ) THEN
    ALTER TABLE venue_approval_flow_steps ADD COLUMN approval_mode VARCHAR(16) NOT NULL DEFAULT 'hr_rule' AFTER name;
  END IF;
  UPDATE venue_approval_flow_steps step
     SET approval_mode = IF(EXISTS(
       SELECT 1 FROM venue_approval_flow_step_rules rule
        WHERE rule.step_id = step.id AND rule.org_id = step.org_id
     ), 'hr_rule', 'admin_any');
END//
CALL migrate_message_center()//
DROP PROCEDURE migrate_message_center//
DELIMITER ;
