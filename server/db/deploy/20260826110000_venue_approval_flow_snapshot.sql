-- 场地借用审批流程不可变快照。
-- 历史在途记录无法证明当前规则与发起时规则一致，因此本迁移只增加字段，不猜测回填。
-- 新版服务会对缺失或损坏快照的流程型在途记录明确失败关闭；已完成历史仅展示既有审批事件快照。

SET @has_flow_snapshot_column = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'venue_bookings'
     AND COLUMN_NAME = 'approval_flow_snapshot_json'
);

SET @add_flow_snapshot_column_sql = IF(
  @has_flow_snapshot_column = 0,
  'ALTER TABLE venue_bookings ADD COLUMN approval_flow_snapshot_json MEDIUMTEXT DEFAULT NULL AFTER approval_flow_state_json',
  'SELECT 1'
);
PREPARE add_flow_snapshot_column_stmt FROM @add_flow_snapshot_column_sql;
EXECUTE add_flow_snapshot_column_stmt;
DEALLOCATE PREPARE add_flow_snapshot_column_stmt;
