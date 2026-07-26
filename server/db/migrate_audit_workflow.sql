-- ============================================================
-- WHUSU Smart Workspace Audit Workflow System - Database Migration
-- Creates all tables for the audit/approval workflow system.
-- All statements are idempotent (IF NOT EXISTS).
-- Date: 2026-06-11
-- ============================================================

-- ============================================================
-- 1. Audit Flow Templates (审核流模板)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_flow_templates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  starter_type VARCHAR(20) NOT NULL DEFAULT 'self',
  starter_identity_id VARCHAR(64) DEFAULT NULL,
  starter_hr_id VARCHAR(64) DEFAULT NULL,
  resubmit_mode VARCHAR(20) NOT NULL DEFAULT 'fresh',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_aft_org (org_id),
  INDEX idx_aft_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. Audit Flow Template Steps (模板步骤定义)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_flow_template_steps (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  template_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  approver_type VARCHAR(20) NOT NULL DEFAULT 'identity',
  approver_identity_id VARCHAR(64) DEFAULT NULL,
  approver_hr_id VARCHAR(64) DEFAULT NULL,
  related_relation VARCHAR(20) DEFAULT NULL,
  action_type VARCHAR(20) NOT NULL DEFAULT 'sign',
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_afts_template (template_id),
  INDEX idx_afts_org (org_id),
  CONSTRAINT fk_afts_template FOREIGN KEY (template_id)
    REFERENCES audit_flow_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Signature Templates (用户签名模板)
-- ============================================================
CREATE TABLE IF NOT EXISTS signature_templates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  hr_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) DEFAULT NULL,
  image_data LONGTEXT,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_st_hr (hr_id),
  INDEX idx_st_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Stamps (电子图片章)
-- ============================================================
CREATE TABLE IF NOT EXISTS stamps (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  image_data LONGTEXT,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_stamp_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. Identity-Stamp Assignments (身份→印章授权)
-- ============================================================
CREATE TABLE IF NOT EXISTS identity_stamp_assignments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  stamp_id VARCHAR(64) NOT NULL,
  identity_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_isa_stamp (stamp_id),
  INDEX idx_isa_identity (identity_id),
  INDEX idx_isa_org (org_id),
  UNIQUE INDEX idx_isa_unique (stamp_id, identity_id, org_id),
  CONSTRAINT fk_isa_stamp FOREIGN KEY (stamp_id)
    REFERENCES stamps(id) ON DELETE CASCADE,
  CONSTRAINT fk_isa_identity FOREIGN KEY (identity_id)
    REFERENCES identities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. Audit Submissions (审核提交实例)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_submissions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  submission_number VARCHAR(32) NOT NULL,
  submitted_by VARCHAR(64) NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'template',
  template_id VARCHAR(64) DEFAULT NULL,
  title VARCHAR(200) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  current_step_index INT NOT NULL DEFAULT 0,
  resubmit_mode VARCHAR(20) NOT NULL DEFAULT 'fresh',
  previous_reject_step_index INT DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_as_submitter (submitted_by),
  INDEX idx_as_status (status),
  INDEX idx_as_template (template_id),
  INDEX idx_as_org (org_id),
  UNIQUE INDEX idx_as_number (submission_number, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. Audit Submission Files (提交的附件)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_submission_files (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  submission_id VARCHAR(64) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) DEFAULT NULL,
  file_path VARCHAR(1000) NOT NULL,
  file_size INT DEFAULT NULL,
  file_hash VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_asf_submission (submission_id),
  INDEX idx_asf_org (org_id),
  CONSTRAINT fk_asf_submission FOREIGN KEY (submission_id)
    REFERENCES audit_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. Audit Submission Steps (提交的步骤实例)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_submission_steps (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  submission_id VARCHAR(64) NOT NULL,
  template_step_id VARCHAR(64) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  approver_type VARCHAR(20) NOT NULL DEFAULT 'identity',
  approver_hr_id VARCHAR(64) DEFAULT NULL,
  approver_identity_id VARCHAR(64) DEFAULT NULL,
  scope_type VARCHAR(32) DEFAULT NULL COMMENT 'all | same_department | same_work_group | specific_department | specific_work_group',
  scope_department_id VARCHAR(64) DEFAULT NULL,
  scope_work_group_id VARCHAR(64) DEFAULT NULL,
  action_type VARCHAR(20) NOT NULL DEFAULT 'sign',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  comment TEXT,
  rejection_reason TEXT,
  round INT NOT NULL DEFAULT 1,
  processed_at DATETIME DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ass_step_submission (submission_id),
  INDEX idx_ass_step_approver (approver_hr_id),
  INDEX idx_ass_step_status (status),
  INDEX idx_ass_step_round (round),
  INDEX idx_ass_step_org (org_id),
  CONSTRAINT fk_ass_step_submission FOREIGN KEY (submission_id)
    REFERENCES audit_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. Audit Submission Signatures (签名/章记录 — 哈希链节点)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_submission_signatures (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  submission_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64) NOT NULL,
  file_id VARCHAR(64) NOT NULL,
  signature_type VARCHAR(16) NOT NULL DEFAULT 'signature',
  image_data LONGTEXT,
  position_x DECIMAL(10,4) NOT NULL DEFAULT 0,
  position_y DECIMAL(10,4) NOT NULL DEFAULT 0,
  signature_size DECIMAL(6,3) NOT NULL DEFAULT 1,
  rotation_degrees DECIMAL(7,2) NOT NULL DEFAULT 0,
  signer_hr_id VARCHAR(64) NOT NULL,
  round INT NOT NULL DEFAULT 1,
  previous_signature_hash VARCHAR(64) DEFAULT NULL,
  document_hash_at_signing VARCHAR(64) NOT NULL,
  signature_data_hash VARCHAR(64) NOT NULL,
  signed_at DATETIME NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assin_submission (submission_id),
  INDEX idx_assin_step (step_id),
  INDEX idx_assin_file (file_id),
  INDEX idx_assin_signer (signer_hr_id),
  INDEX idx_assin_round (round),
  INDEX idx_assin_org (org_id),
  CONSTRAINT fk_assin_submission FOREIGN KEY (submission_id)
    REFERENCES audit_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_assin_step FOREIGN KEY (step_id)
    REFERENCES audit_submission_steps(id) ON DELETE CASCADE,
  CONSTRAINT fk_assin_file FOREIGN KEY (file_id)
    REFERENCES audit_submission_files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. Audit Flow Template Step Conditions (步骤审批条件 — multi-condition OR-ed)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_flow_template_step_conditions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  template_step_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  condition_type VARCHAR(20) NOT NULL DEFAULT 'identity_scope' COMMENT 'identity_scope | person',
  -- person type fields
  person_hr_ids TEXT DEFAULT NULL COMMENT 'Comma-separated HR IDs for person-type conditions',
  -- identity_scope type fields
  department_scope VARCHAR(16) DEFAULT 'all' COMMENT 'all | specific | own',
  specific_department_id VARCHAR(64) DEFAULT NULL,
  work_group_scope VARCHAR(16) DEFAULT 'all' COMMENT 'all | specific | own',
  specific_work_group_id VARCHAR(64) DEFAULT NULL,
  identity_scope VARCHAR(16) DEFAULT 'all' COMMENT 'all | specific | own',
  specific_identity_id VARCHAR(64) DEFAULT NULL,
  -- common
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_aftsc_step (template_step_id),
  INDEX idx_aftsc_org (org_id),
  CONSTRAINT fk_aftsc_step FOREIGN KEY (template_step_id)
    REFERENCES audit_flow_template_steps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. Audit Verification Permissions (验签权限)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_verification_permissions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  grantee_hr_id VARCHAR(64) NOT NULL,
  granted_by VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_avp_grantee (grantee_hr_id),
  INDEX idx_avp_org (org_id),
  UNIQUE INDEX idx_avp_unique (grantee_hr_id, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Bonus: Add step_conditions_json column for runtime matching
-- Safe idempotent approach using information_schema check
-- ============================================================
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_submission_steps'
    AND COLUMN_NAME = 'step_conditions_json'
);

SET @add_col_sql = IF(@col_exists = 0,
  'ALTER TABLE audit_submission_steps ADD COLUMN step_conditions_json TEXT DEFAULT NULL COMMENT ''JSON array of approver conditions for runtime resolution''',
  'SELECT ''Column step_conditions_json already exists, skipping'' AS info'
);

PREPARE add_col_stmt FROM @add_col_sql;
EXECUTE add_col_stmt;
DEALLOCATE PREPARE add_col_stmt;

-- ============================================================
-- Bonus: Add starter_conditions_json column to audit_flow_templates
-- ============================================================
SET @starter_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_flow_templates'
    AND COLUMN_NAME = 'starter_conditions_json'
);

SET @add_starter_col_sql = IF(@starter_col_exists = 0,
  'ALTER TABLE audit_flow_templates ADD COLUMN starter_conditions_json TEXT DEFAULT NULL COMMENT ''JSON array of starter conditions for multi-condition OR matching''',
  'SELECT ''Column starter_conditions_json already exists, skipping'' AS info'
);

PREPARE add_starter_col_stmt FROM @add_starter_col_sql;
EXECUTE add_starter_col_stmt;
DEALLOCATE PREPARE add_starter_col_stmt;

-- ============================================================
-- Bonus: Expand specific ID columns to hold comma-separated values for multi-select
-- ============================================================
ALTER TABLE audit_flow_template_step_conditions
  MODIFY COLUMN specific_department_id VARCHAR(1000) DEFAULT NULL,
  MODIFY COLUMN specific_work_group_id VARCHAR(1000) DEFAULT NULL,
  MODIFY COLUMN specific_identity_id VARCHAR(1000) DEFAULT NULL;

-- ============================================================
-- Bonus: Add page column to audit_submission_signatures for PDF page-level positioning
-- ============================================================
SET @page_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_submission_signatures'
    AND COLUMN_NAME = 'page'
);

SET @add_page_col_sql = IF(@page_col_exists = 0,
  'ALTER TABLE audit_submission_signatures ADD COLUMN page INT NOT NULL DEFAULT 1 COMMENT ''Page number (for PDF files)'' AFTER position_y',
  'SELECT ''Column page already exists in audit_submission_signatures, skipping'' AS info'
);

PREPARE add_page_col_stmt FROM @add_page_col_sql;
EXECUTE add_page_col_stmt;
DEALLOCATE PREPARE add_page_col_stmt;
