-- @destructive
-- 审核已统一逐步重审；旧请求字段忽略，响应 fresh 仅为旧客户端兼容常量。
SET @audit_mode_column = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_flow_templates' AND COLUMN_NAME = 'resubmit_mode');
SET @audit_mode_sql = IF(@audit_mode_column > 0, 'ALTER TABLE audit_flow_templates DROP COLUMN resubmit_mode', 'SELECT 1');
PREPARE audit_mode_stmt FROM @audit_mode_sql;
EXECUTE audit_mode_stmt;
DEALLOCATE PREPARE audit_mode_stmt;
SET @audit_mode_column = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_submissions' AND COLUMN_NAME = 'resubmit_mode');
SET @audit_mode_sql = IF(@audit_mode_column > 0, 'ALTER TABLE audit_submissions DROP COLUMN resubmit_mode', 'SELECT 1');
PREPARE audit_mode_stmt FROM @audit_mode_sql;
EXECUTE audit_mode_stmt;
DEALLOCATE PREPARE audit_mode_stmt;
