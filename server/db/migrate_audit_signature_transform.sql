-- Add free-transform metadata for audit signatures/stamps.
-- Safe to run repeatedly.

SET @schema_name = DATABASE();

SET @has_signature_size = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'audit_submission_signatures'
    AND COLUMN_NAME = 'signature_size'
);
SET @sql = IF(
  @has_signature_size = 0,
  'ALTER TABLE audit_submission_signatures ADD COLUMN signature_size DECIMAL(6,3) NOT NULL DEFAULT 1 COMMENT ''Signature/stamp scale multiplier'' AFTER position_y',
  'SELECT ''Column signature_size already exists, skipping'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_rotation_degrees = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'audit_submission_signatures'
    AND COLUMN_NAME = 'rotation_degrees'
);
SET @sql = IF(
  @has_rotation_degrees = 0,
  'ALTER TABLE audit_submission_signatures ADD COLUMN rotation_degrees DECIMAL(7,2) NOT NULL DEFAULT 0 COMMENT ''Signature/stamp rotation in degrees'' AFTER signature_size',
  'SELECT ''Column rotation_degrees already exists, skipping'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
