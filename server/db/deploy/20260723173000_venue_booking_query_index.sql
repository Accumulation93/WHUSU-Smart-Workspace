SET @venue_status_time_index_exists = (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'venue_bookings'
     AND INDEX_NAME = 'idx_vb_venue_status_time'
);

SET @venue_status_time_index_sql = IF(
  @venue_status_time_index_exists = 0,
  'ALTER TABLE venue_bookings ADD INDEX idx_vb_venue_status_time (venue_id, status, time_start)',
  'SELECT 1'
);
PREPARE venue_status_time_index_statement FROM @venue_status_time_index_sql;
EXECUTE venue_status_time_index_statement;
DEALLOCATE PREPARE venue_status_time_index_statement;
