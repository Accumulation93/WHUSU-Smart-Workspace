SET @template_designation_column_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_flow_template_steps'
     AND COLUMN_NAME = 'allow_approver_designation'
);
SET @add_template_designation_column_sql := IF(
  @template_designation_column_exists = 0,
  'ALTER TABLE audit_flow_template_steps ADD COLUMN allow_approver_designation TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''允许进入本步骤前指定审批人'' AFTER action_type',
  'SELECT 1'
);
PREPARE add_template_designation_column_stmt FROM @add_template_designation_column_sql;
EXECUTE add_template_designation_column_stmt;
DEALLOCATE PREPARE add_template_designation_column_stmt;

SET @submission_designation_column_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_submission_steps'
     AND COLUMN_NAME = 'allow_approver_designation'
);
SET @add_submission_designation_column_sql := IF(
  @submission_designation_column_exists = 0,
  'ALTER TABLE audit_submission_steps ADD COLUMN allow_approver_designation TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''允许进入本步骤前指定审批人'' AFTER action_type',
  'SELECT 1'
);
PREPARE add_submission_designation_column_stmt FROM @add_submission_designation_column_sql;
EXECUTE add_submission_designation_column_stmt;
DEALLOCATE PREPARE add_submission_designation_column_stmt;

ALTER TABLE audit_flow_template_steps
  ALTER COLUMN allow_approver_designation SET DEFAULT 0;

ALTER TABLE audit_submission_steps
  ALTER COLUMN allow_approver_designation SET DEFAULT 0;
