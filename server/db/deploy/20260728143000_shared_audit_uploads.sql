-- Filesystem migration is executed by migrateAuditUploads.js after the
-- deployment snapshot. This ledger entry makes that one-time recovery part of
-- the atomic deployment workflow.
SELECT 'shared_audit_uploads_v1' AS migration_marker;

UPDATE notification_outbox
   SET status = 'dead',
       processed_at = COALESCE(processed_at, updated_at)
 WHERE status = 'failed'
   AND attempts >= 8;

SET @notification_page_index_exists := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'notifications'
     AND INDEX_NAME = 'idx_notification_recipient_page'
);
SET @notification_page_index_sql := IF(
  @notification_page_index_exists = 0,
  'ALTER TABLE notifications ADD INDEX idx_notification_recipient_page (org_id, recipient_type, recipient_id, created_at, id)',
  'SELECT 1'
);
PREPARE notification_page_index_stmt FROM @notification_page_index_sql;
EXECUTE notification_page_index_stmt;
DEALLOCATE PREPARE notification_page_index_stmt;
