-- 数据归属与并发一致性迁移。
-- 执行前必须完成数据库备份；重复评分记录会使迁移主动中止。

DELIMITER //
DROP PROCEDURE IF EXISTS migrate_data_integrity//
CREATE PROCEDURE migrate_data_integrity()
BEGIN
  DECLARE duplicate_score_groups INT DEFAULT 0;
  DECLARE duplicate_answer_groups INT DEFAULT 0;
  DECLARE unresolved_bookings INT DEFAULT 0;
  DECLARE unresolved_notifications INT DEFAULT 0;
  DECLARE unresolved_cursors INT DEFAULT 0;

  CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    hr_id VARCHAR(64) NOT NULL,
    org_id VARCHAR(64) NOT NULL DEFAULT '',
    type VARCHAR(32) NOT NULL,
    title VARCHAR(256) NOT NULL,
    description VARCHAR(512),
    category VARCHAR(32) NOT NULL DEFAULT 'audit',
    target_type VARCHAR(32),
    target_id VARCHAR(64),
    target_url VARCHAR(512),
    is_read TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_org_hr (org_id, hr_id),
    INDEX idx_notification_org_unread (org_id, hr_id, is_read),
    INDEX idx_notification_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS audit_read_cursors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hr_id VARCHAR(64) NOT NULL,
    submission_id VARCHAR(64) NOT NULL,
    org_id VARCHAR(64) NOT NULL DEFAULT '',
    last_read_status VARCHAR(32) NOT NULL DEFAULT '',
    last_read_step_index INT NOT NULL DEFAULT -1,
    read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_arc_org_hr_submission (org_id, hr_id, submission_id),
    INDEX idx_arc_org_hr (org_id, hr_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings' AND COLUMN_NAME = 'creator_org_id'
  ) THEN
    ALTER TABLE venue_bookings ADD COLUMN creator_org_id VARCHAR(64) NOT NULL DEFAULT '' AFTER creator_admin_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings' AND COLUMN_NAME = 'approval_org_id'
  ) THEN
    ALTER TABLE venue_bookings ADD COLUMN approval_org_id VARCHAR(64) NOT NULL DEFAULT '' AFTER creator_org_id;
  END IF;

  UPDATE venue_bookings b
  LEFT JOIN hr_info h ON BINARY h.id = BINARY b.user_hr_id
  LEFT JOIN admin_info a ON BINARY a.id = BINARY b.creator_admin_id
  SET b.creator_org_id = COALESCE(NULLIF(b.creator_org_id, ''), NULLIF(h.org_id, ''), NULLIF(a.org_id, ''),
      (SELECT current_organization FROM system_config WHERE id = 'default' LIMIT 1), ''),
      b.approval_org_id = COALESCE(NULLIF(b.approval_org_id, ''), NULLIF(h.org_id, ''), NULLIF(a.org_id, ''),
      (SELECT current_organization FROM system_config WHERE id = 'default' LIMIT 1), '')
  WHERE b.creator_org_id = '' OR b.approval_org_id = '';

  SELECT COUNT(*) INTO unresolved_bookings
  FROM venue_bookings WHERE creator_org_id = '' OR approval_org_id = '';
  IF unresolved_bookings > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '存在无法确定组织归属的场地借用记录，迁移已停止';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings' AND INDEX_NAME = 'idx_vb_creator_org'
  ) THEN
    ALTER TABLE venue_bookings ADD INDEX idx_vb_creator_org (creator_org_id, status, time_start);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venue_bookings' AND INDEX_NAME = 'idx_vb_approval_org'
  ) THEN
    ALTER TABLE venue_bookings ADD INDEX idx_vb_approval_org (approval_org_id, status, time_start);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'org_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '' AFTER hr_id;
  END IF;
  UPDATE notifications n
  LEFT JOIN hr_info h ON BINARY h.id = BINARY n.hr_id
  LEFT JOIN audit_submissions s ON n.target_type = 'submission' AND BINARY s.id = BINARY n.target_id
  LEFT JOIN venue_bookings b ON n.target_type = 'booking' AND BINARY b.id = BINARY n.target_id
  SET n.org_id = COALESCE(NULLIF(n.org_id, ''), NULLIF(s.org_id, ''), NULLIF(b.approval_org_id, ''), NULLIF(h.org_id, ''), '')
  WHERE n.org_id = '';

  SELECT COUNT(*) INTO unresolved_notifications FROM notifications WHERE org_id = '';
  IF unresolved_notifications > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '存在无法确定组织归属的通知记录，迁移已停止';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notification_org_hr'
  ) THEN
    ALTER TABLE notifications ADD INDEX idx_notification_org_hr (org_id, hr_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_read_cursors' AND COLUMN_NAME = 'org_id'
  ) THEN
    ALTER TABLE audit_read_cursors ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '' AFTER submission_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_read_cursors'
      AND COLUMN_NAME = 'hr_id' AND DATA_TYPE <> 'varchar'
  ) THEN
    ALTER TABLE audit_read_cursors MODIFY COLUMN hr_id VARCHAR(64) NOT NULL;
  END IF;
  UPDATE audit_read_cursors c
  JOIN audit_submissions s ON BINARY s.id = BINARY c.submission_id
  SET c.org_id = s.org_id
  WHERE c.org_id = '';

  SELECT COUNT(*) INTO unresolved_cursors FROM audit_read_cursors WHERE org_id = '';
  IF unresolved_cursors > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '存在无法确定组织归属的审核阅读游标，迁移已停止';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_read_cursors' AND INDEX_NAME = 'uk_hr_submission'
  ) THEN
    ALTER TABLE audit_read_cursors DROP INDEX uk_hr_submission;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_read_cursors' AND INDEX_NAME = 'uk_arc_org_hr_submission'
  ) THEN
    ALTER TABLE audit_read_cursors ADD UNIQUE INDEX uk_arc_org_hr_submission (org_id, hr_id, submission_id);
  END IF;

  CREATE TABLE IF NOT EXISTS audit_number_sequences (
    org_id VARCHAR(64) NOT NULL,
    business_date DATE NOT NULL,
    next_value INT NOT NULL DEFAULT 1,
    PRIMARY KEY (org_id, business_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS request_deduplication (
    org_id VARCHAR(64) NOT NULL,
    actor_key VARCHAR(160) NOT NULL,
    operation_type VARCHAR(48) NOT NULL,
    client_request_id VARCHAR(96) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    response_json TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id, actor_key, operation_type, client_request_id),
    INDEX idx_rd_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  SELECT COUNT(*) INTO duplicate_score_groups FROM (
    SELECT 1 FROM score_records
    GROUP BY org_id, activity_id, scorer_id, target_id HAVING COUNT(*) > 1
  ) duplicate_scores;
  IF duplicate_score_groups > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'score_records 存在重复业务记录，迁移已停止';
  END IF;
  SELECT COUNT(*) INTO duplicate_answer_groups FROM (
    SELECT 1 FROM score_answers GROUP BY record_id, question_index HAVING COUNT(*) > 1
  ) duplicate_answers;
  IF duplicate_answer_groups > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'score_answers 存在重复题目记录，迁移已停止';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'score_records' AND INDEX_NAME = 'uk_sr_business'
  ) THEN
    ALTER TABLE score_records ADD UNIQUE INDEX uk_sr_business (org_id, activity_id, scorer_id, target_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'score_answers' AND INDEX_NAME = 'uk_sa_record_question'
  ) THEN
    ALTER TABLE score_answers ADD UNIQUE INDEX uk_sa_record_question (record_id, question_index);
  END IF;

  CREATE TABLE IF NOT EXISTS _shared_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    cache_data LONGTEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    INDEX idx_expires_at (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
END//
CALL migrate_data_integrity()//
DROP PROCEDURE migrate_data_integrity//
DELIMITER ;
