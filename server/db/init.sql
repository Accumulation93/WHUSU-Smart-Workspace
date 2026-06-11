-- ============================================================
-- REDSU Scoring System - MySQL Database Schema
-- Converted from WeChat Cloud NoSQL to MySQL Relational
-- Date: 2026-05-01
-- ============================================================

-- ============================================================
-- 1. 基础组织表
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_org_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR(32) NOT NULL PRIMARY KEY DEFAULT 'default',
  timezone INT NOT NULL DEFAULT 8,
  current_organization VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data
INSERT IGNORE INTO system_config (id, timezone) VALUES ('default', 8);

-- ============================================================
-- 2. 组织架构表 (org-scoped)
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dep_org (org_id),
  UNIQUE INDEX idx_dept_name (name, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS identities (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_idt_org (org_id),
  UNIQUE INDEX idx_ident_name (name, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_groups (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  department_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wg_department (department_id),
  INDEX idx_wg_org (org_id),
  UNIQUE INDEX idx_wg_dept_name (department_id, name, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 人事表 (org-scoped)
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_info (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  student_id VARCHAR(32) NOT NULL,
  department_id VARCHAR(64) DEFAULT NULL,
  identity_id VARCHAR(64) DEFAULT NULL,
  work_group_id VARCHAR(64) DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hr_dept (department_id),
  INDEX idx_hr_identity (identity_id),
  INDEX idx_hr_wg (work_group_id),
  INDEX idx_hr_org (org_id),
  UNIQUE INDEX idx_hr_student (student_id, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. 用户绑定表 (org-scoped)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_info (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  openid VARCHAR(128) NOT NULL,
  hr_id VARCHAR(64) DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ui_hr (hr_id),
  INDEX idx_ui_org (org_id),
  UNIQUE INDEX idx_ui_openid (openid, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_info (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  student_id VARCHAR(32) DEFAULT NULL,
  openid VARCHAR(128) DEFAULT NULL,
  admin_level VARCHAR(32) NOT NULL DEFAULT 'super_admin',
  bind_status VARCHAR(16) NOT NULL DEFAULT 'invited',
  invite_code VARCHAR(32) DEFAULT NULL,
  invited_at DATETIME DEFAULT NULL,
  bound_at DATETIME DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ai_openid (openid),
  INDEX idx_ai_level (admin_level),
  INDEX idx_ai_bind (bind_status),
  INDEX idx_ai_org (org_id),
  UNIQUE INDEX idx_ai_student (student_id, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. 评分活动与模板
-- ============================================================

CREATE TABLE IF NOT EXISTS score_activities (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  is_paused TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(64) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sa_current (is_current),
  INDEX idx_sa_org (org_id),
  UNIQUE INDEX idx_sa_name (name, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS score_question_templates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  created_by VARCHAR(64) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_sqt_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 从 templates.questions JSON 拆出，有顺序
CREATE TABLE IF NOT EXISTS score_questions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  template_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  question TEXT,
  score_label TEXT,
  min_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  start_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  max_value DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  step_value DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  INDEX idx_sq_template (template_id),
  CONSTRAINT fk_sq_template FOREIGN KEY (template_id)
    REFERENCES score_question_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. 评分规则（JSON 拆表, org-scoped）
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_target_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  activity_id VARCHAR(64) NOT NULL,
  scorer_department_id VARCHAR(64) NOT NULL,
  scorer_identity_id VARCHAR(64) NOT NULL,
  scorer_key VARCHAR(256) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  allow_self_assessment TINYINT(1) NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rtr_activity (activity_id),
  INDEX idx_rtr_key (scorer_key),
  INDEX idx_rtr_active (is_active),
  INDEX idx_rtr_org (org_id),
  CONSTRAINT fk_rtr_activity FOREIGN KEY (activity_id)
    REFERENCES score_activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 从 rules.clauses JSON 拆出
CREATE TABLE IF NOT EXISTS rate_rule_clauses (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL,
  scope_type VARCHAR(50) NOT NULL,
  target_identity_id VARCHAR(64) DEFAULT NULL,
  require_all_complete TINYINT(1) NOT NULL DEFAULT 0,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  INDEX idx_rrc_rule (rule_id),
  INDEX idx_rrc_org (org_id),
  CONSTRAINT fk_rrc_rule FOREIGN KEY (rule_id)
    REFERENCES rate_target_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 从 clauses[].templateConfigs 拆出，有顺序
CREATE TABLE IF NOT EXISTS clause_template_configs (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  clause_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  template_id VARCHAR(64) NOT NULL,
  weight DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  calculation_method VARCHAR(32) NOT NULL DEFAULT 'weighted_average',
  trim_high_count INT NOT NULL DEFAULT 0,
  trim_low_count INT NOT NULL DEFAULT 0,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  INDEX idx_ctc_clause (clause_id),
  INDEX idx_ctc_template (template_id),
  INDEX idx_ctc_org (org_id),
  CONSTRAINT fk_ctc_clause FOREIGN KEY (clause_id)
    REFERENCES rate_rule_clauses(id) ON DELETE CASCADE,
  CONSTRAINT fk_ctc_template FOREIGN KEY (template_id)
    REFERENCES score_question_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS score_template_order (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  activity_id VARCHAR(64) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  INDEX idx_sto_activity (activity_id),
  INDEX idx_sto_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. 评分记录（JSON 拆表, org-scoped）
-- ============================================================

CREATE TABLE IF NOT EXISTS score_records (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  activity_id VARCHAR(64) NOT NULL,
  rule_id VARCHAR(64) NOT NULL,
  scorer_id VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  template_config_signature TEXT,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  INDEX idx_sr_activity (activity_id),
  INDEX idx_sr_rule (rule_id),
  INDEX idx_sr_scorer (scorer_id),
  INDEX idx_sr_target (target_id),
  INDEX idx_sr_scorer_target (scorer_id, target_id),
  INDEX idx_sr_org (org_id),
  CONSTRAINT fk_sr_activity FOREIGN KEY (activity_id)
    REFERENCES score_activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_rule FOREIGN KEY (rule_id)
    REFERENCES rate_target_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 从 records.answers JSON 拆出，有顺序
CREATE TABLE IF NOT EXISTS score_answers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  record_id VARCHAR(64) NOT NULL,
  question_index INT NOT NULL DEFAULT 1,
  score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  INDEX idx_sa_record (record_id),
  INDEX idx_sa_org (org_id),
  CONSTRAINT fk_sa_record FOREIGN KEY (record_id)
    REFERENCES score_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. 人事扩展资料（JSON 拆表, org-scoped）
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_profile_templates (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  template_key VARCHAR(64) NOT NULL DEFAULT 'default_hr_profile_template',
  description TEXT,
  edit_mode VARCHAR(32) NOT NULL DEFAULT 'direct',
  fields TEXT,
  updated_by VARCHAR(64) DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hpt_org (org_id),
  UNIQUE INDEX idx_hpt_key (template_key, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 从 templates.fields JSON 拆出，有顺序
CREATE TABLE IF NOT EXISTS hr_profile_template_fields (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  template_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  label VARCHAR(200) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'text',
  required TINYINT(1) NOT NULL DEFAULT 0,
  min_length INT DEFAULT NULL,
  max_length INT DEFAULT NULL,
  number_rule VARCHAR(32) DEFAULT 'value_range',
  allow_decimal TINYINT(1) NOT NULL DEFAULT 1,
  min_digits INT DEFAULT NULL,
  max_digits INT DEFAULT NULL,
  min_value DECIMAL(20,4) DEFAULT NULL,
  max_value DECIMAL(20,4) DEFAULT NULL,
  options_json TEXT,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  INDEX idx_hptf_template (template_id),
  INDEX idx_hptf_org (org_id),
  CONSTRAINT fk_hptf_template FOREIGN KEY (template_id)
    REFERENCES hr_profile_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_profile_records (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  hr_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) DEFAULT NULL,
  openid VARCHAR(128) DEFAULT NULL,
  template_key VARCHAR(64) DEFAULT 'default_hr_profile_template',
  template_updated_at DATETIME DEFAULT NULL,
  audit_status VARCHAR(16) NOT NULL DEFAULT 'none',
  rejection_reason TEXT,
  requested_at DATETIME DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hpr_hr (hr_id),
  INDEX idx_hpr_openid (openid),
  INDEX idx_hpr_status (audit_status),
  INDEX idx_hpr_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 从 records.values / pendingValues JSON 拆出
CREATE TABLE IF NOT EXISTS hr_profile_record_values (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  record_id VARCHAR(64) NOT NULL,
  is_pending TINYINT(1) NOT NULL DEFAULT 0,
  field_id VARCHAR(64) NOT NULL,
  field_value TEXT,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  INDEX idx_hprv_record (record_id),
  INDEX idx_hprv_field (field_id),
  INDEX idx_hprv_org (org_id),
  CONSTRAINT fk_hprv_record FOREIGN KEY (record_id)
    REFERENCES hr_profile_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. 结果公示与评优名单

CREATE TABLE IF NOT EXISTS result_publications (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  activity_id VARCHAR(64) NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME DEFAULT NULL,
  published_by VARCHAR(64) DEFAULT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rp_activity (activity_id),
  INDEX idx_rp_org (org_id),
  UNIQUE INDEX idx_rp_activity_org (activity_id, org_id),
  CONSTRAINT fk_rp_activity FOREIGN KEY (activity_id)
    REFERENCES score_activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pub_view_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  publication_id VARCHAR(64) NOT NULL,
  grantee_department_id VARCHAR(64) NOT NULL,
  grantee_identity_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pvr_publication (publication_id),
  INDEX idx_pvr_org (org_id),
  UNIQUE INDEX idx_pvr_pub_dept_ident_org (publication_id, grantee_department_id, grantee_identity_id, org_id),
  CONSTRAINT fk_pvr_publication FOREIGN KEY (publication_id)
    REFERENCES result_publications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pub_grade_bands (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  clause_id VARCHAR(64) NOT NULL,
  min_score DECIMAL(10,2) NOT NULL,
  max_score DECIMAL(10,2) NOT NULL,
  grade_name VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pgb_clause (clause_id),
  INDEX idx_pgb_org (org_id),
  CONSTRAINT fk_pgb_clause FOREIGN KEY (clause_id)
    REFERENCES pub_view_rule_clauses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pub_view_rule_clauses (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL,
  scope_type VARCHAR(50) NOT NULL,
  target_identity_id VARCHAR(64) DEFAULT NULL,
  display_mode VARCHAR(16) NOT NULL DEFAULT 'score',
  sort_order INT NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pvrc_rule (rule_id),
  INDEX idx_pvrc_org (org_id),
  CONSTRAINT fk_pvrc_rule FOREIGN KEY (rule_id)
    REFERENCES pub_view_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pub_merit_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  publication_id VARCHAR(64) NOT NULL,
  grantee_department_id VARCHAR(64) NOT NULL,
  grantee_identity_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pmr_publication (publication_id),
  INDEX idx_pmr_org (org_id),
  UNIQUE INDEX idx_pmr_pub_dept_ident_org (publication_id, grantee_department_id, grantee_identity_id, org_id),
  CONSTRAINT fk_pmr_publication FOREIGN KEY (publication_id)
    REFERENCES result_publications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pub_merit_rule_clauses (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL,
  scope_type VARCHAR(50) NOT NULL DEFAULT 'all_people',
  target_identity_id VARCHAR(64) NOT NULL,
  quota_limit INT NOT NULL DEFAULT 0,
  require_exact_quota TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 1,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pmrc_rule (rule_id),
  INDEX idx_pmrc_org (org_id),
  CONSTRAINT fk_pmrc_rule FOREIGN KEY (rule_id)
    REFERENCES pub_merit_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS merit_list_designations (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  publication_id VARCHAR(64) NOT NULL,
  clause_id VARCHAR(64) NOT NULL,
  target_hr_id VARCHAR(64) NOT NULL,
  designated_by VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mld_publication (publication_id),
  INDEX idx_mld_clause (clause_id),
  INDEX idx_mld_org (org_id),
  UNIQUE INDEX idx_mld_pub_hr (publication_id, target_hr_id, org_id),
  CONSTRAINT fk_mld_publication FOREIGN KEY (publication_id)
    REFERENCES result_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_mld_clause FOREIGN KEY (clause_id)
    REFERENCES pub_merit_rule_clauses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. 审核工作流系统 (org-scoped)
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

CREATE TABLE IF NOT EXISTS audit_submission_signatures (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  submission_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64) NOT NULL,
  file_id VARCHAR(64) NOT NULL,
  signature_type VARCHAR(16) NOT NULL DEFAULT 'signature',
  image_data LONGTEXT,
  position_x DECIMAL(10,4) NOT NULL DEFAULT 0,
  position_y DECIMAL(10,4) NOT NULL DEFAULT 0,
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
