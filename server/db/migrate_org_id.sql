-- ============================================================
-- REDSU Scoring System - org_id Migration Script
-- Migrates from per-org history-table architecture to
-- global org_id column architecture.
--
-- IDEMPOTENT: safe to run multiple times.
-- Error handlers skip "already exists" / "not found" errors.
-- ============================================================

DELIMITER //

DROP PROCEDURE IF EXISTS migrate_to_org_id //

CREATE PROCEDURE migrate_to_org_id()
BEGIN
  -- Ignore: 1060 = Duplicate column, 1061 = Duplicate key, 1091 = Can't DROP
  DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;
  DECLARE CONTINUE HANDLER FOR 1061 BEGIN END;
  DECLARE CONTINUE HANDLER FOR 1091 BEGIN END;

  -- ============================================================
  -- Step 1: Add org_id columns
  -- ============================================================
  ALTER TABLE departments ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE identities ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE work_groups ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE hr_info ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE user_info ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE admin_info ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE score_activities ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE score_activities ADD COLUMN is_paused TINYINT(1) NOT NULL DEFAULT 0;
  ALTER TABLE rate_target_rules ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE rate_rule_clauses ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE clause_template_configs ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE score_records ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE score_answers ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE hr_profile_templates ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE hr_profile_template_fields ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE hr_profile_records ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';
  ALTER TABLE hr_profile_record_values ADD COLUMN org_id VARCHAR(64) NOT NULL DEFAULT '';

  ALTER TABLE rate_target_rules ADD COLUMN allow_self_assessment TINYINT(1) NOT NULL DEFAULT 1;
  ALTER TABLE clause_template_configs ADD COLUMN calculation_method VARCHAR(32) NOT NULL DEFAULT 'weighted_average';
  ALTER TABLE clause_template_configs ADD COLUMN trim_high_count INT NOT NULL DEFAULT 0;
  ALTER TABLE clause_template_configs ADD COLUMN trim_low_count INT NOT NULL DEFAULT 0;

  -- ============================================================
  -- Step 2: Create org_id indexes
  -- ============================================================
  CREATE INDEX idx_dep_org ON departments(org_id);
  CREATE INDEX idx_idt_org ON identities(org_id);
  CREATE INDEX idx_wg_org ON work_groups(org_id);
  CREATE INDEX idx_hr_org ON hr_info(org_id);
  CREATE INDEX idx_ui_org ON user_info(org_id);
  CREATE INDEX idx_ai_org ON admin_info(org_id);
  CREATE INDEX idx_sa_org ON score_activities(org_id);
  CREATE INDEX idx_rtr_org ON rate_target_rules(org_id);
  CREATE INDEX idx_rrc_org ON rate_rule_clauses(org_id);
  CREATE INDEX idx_ctc_org ON clause_template_configs(org_id);
  CREATE INDEX idx_sr_org ON score_records(org_id);
  CREATE INDEX idx_sanswer_org ON score_answers(org_id);
  CREATE INDEX idx_hpt_org ON hr_profile_templates(org_id);
  CREATE INDEX idx_hptf_org ON hr_profile_template_fields(org_id);
  CREATE INDEX idx_hpr_org ON hr_profile_records(org_id);
  CREATE INDEX idx_hprv_org ON hr_profile_record_values(org_id);

  -- ============================================================
  -- Step 3: Modify UNIQUE indexes to include org_id
  -- Drop old single-column index, then create composite index.
  -- ============================================================

  -- departments: (name) → (name, org_id)
  ALTER TABLE departments DROP INDEX idx_dept_name;
  CREATE UNIQUE INDEX idx_dept_name ON departments(name, org_id);

  -- identities: (name) → (name, org_id)
  ALTER TABLE identities DROP INDEX idx_ident_name;
  CREATE UNIQUE INDEX idx_ident_name ON identities(name, org_id);

  -- work_groups: (department_id, name) → (department_id, name, org_id)
  ALTER TABLE work_groups DROP INDEX idx_wg_dept_name;
  CREATE UNIQUE INDEX idx_wg_dept_name ON work_groups(department_id, name, org_id);

  -- hr_info: (student_id) → (student_id, org_id)
  ALTER TABLE hr_info DROP INDEX idx_hr_student;
  CREATE UNIQUE INDEX idx_hr_student ON hr_info(student_id, org_id);

  -- user_info: (openid) → (openid, org_id)
  ALTER TABLE user_info DROP INDEX idx_ui_openid;
  CREATE UNIQUE INDEX idx_ui_openid ON user_info(openid, org_id);

  -- admin_info: (student_id) → (student_id, org_id)
  ALTER TABLE admin_info DROP INDEX idx_ai_student;
  CREATE UNIQUE INDEX idx_ai_student ON admin_info(student_id, org_id);

  -- score_activities: (name) → (name, org_id)
  ALTER TABLE score_activities DROP INDEX idx_sa_name;
  CREATE UNIQUE INDEX idx_sa_name ON score_activities(name, org_id);

  -- hr_profile_templates: (template_key) → (template_key, org_id)
  ALTER TABLE hr_profile_templates DROP INDEX idx_hpt_key;
  CREATE UNIQUE INDEX idx_hpt_key ON hr_profile_templates(template_key, org_id);

  -- ============================================================
  -- Step 4: Populate org_id from system_config.current_organization
  -- Only updates rows that still have empty org_id.
  -- ============================================================
  UPDATE departments SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE identities SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE work_groups SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE hr_info SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE user_info SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE admin_info SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE score_activities SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE rate_target_rules SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE rate_rule_clauses SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE clause_template_configs SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE score_records SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE score_answers SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE hr_profile_templates SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE hr_profile_template_fields SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE hr_profile_records SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';
  UPDATE hr_profile_record_values SET org_id = IFNULL((SELECT current_organization FROM system_config WHERE id='default'), '') WHERE org_id = '';

  -- ============================================================
  -- Step 5: Drop history tables (no longer needed)
  -- ============================================================
  DROP TABLE IF EXISTS departments_history;
  DROP TABLE IF EXISTS identities_history;
  DROP TABLE IF EXISTS work_groups_history;
  DROP TABLE IF EXISTS hr_info_history;
  DROP TABLE IF EXISTS user_info_history;
  DROP TABLE IF EXISTS admin_info_history;
  DROP TABLE IF EXISTS score_activities_history;
  DROP TABLE IF EXISTS rate_target_rules_history;
  DROP TABLE IF EXISTS rate_rule_clauses_history;
  DROP TABLE IF EXISTS clause_template_configs_history;
  DROP TABLE IF EXISTS score_records_history;
  DROP TABLE IF EXISTS score_answers_history;
  DROP TABLE IF EXISTS hr_profile_templates_history;
  DROP TABLE IF EXISTS hr_profile_template_fields_history;
  DROP TABLE IF EXISTS hr_profile_records_history;
  DROP TABLE IF EXISTS hr_profile_record_values_history;

  -- Result publication & merit list tables (new in org_id era)
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
    CONSTRAINT fk_rp_activity FOREIGN KEY (activity_id) REFERENCES score_activities(id) ON DELETE CASCADE
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
    CONSTRAINT fk_pvr_publication FOREIGN KEY (publication_id) REFERENCES result_publications(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS pub_view_rule_clauses (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    rule_id VARCHAR(64) NOT NULL,
    scope_type VARCHAR(50) NOT NULL,
    target_identity_id VARCHAR(64) DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 1,
    org_id VARCHAR(64) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pvrc_rule (rule_id),
    INDEX idx_pvrc_org (org_id),
    CONSTRAINT fk_pvrc_rule FOREIGN KEY (rule_id) REFERENCES pub_view_rules(id) ON DELETE CASCADE
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
    CONSTRAINT fk_pmr_publication FOREIGN KEY (publication_id) REFERENCES result_publications(id) ON DELETE CASCADE
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
    CONSTRAINT fk_pmrc_rule FOREIGN KEY (rule_id) REFERENCES pub_merit_rules(id) ON DELETE CASCADE
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
    CONSTRAINT fk_mld_publication FOREIGN KEY (publication_id) REFERENCES result_publications(id) ON DELETE CASCADE,
    CONSTRAINT fk_mld_clause FOREIGN KEY (clause_id) REFERENCES pub_merit_rule_clauses(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- Migration: add clause_id, drop old FK(s), make permission_id nullable
  -- Only applies to legacy tables that still have permission_id column
  BEGIN
    DECLARE has_permission_id INT DEFAULT 0;
    SELECT COUNT(*) INTO has_permission_id FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_list_designations' AND COLUMN_NAME = 'permission_id';

    IF has_permission_id > 0 THEN
      BEGIN
        DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;
        ALTER TABLE merit_list_designations ADD COLUMN clause_id VARCHAR(64) DEFAULT NULL AFTER publication_id;
      END;
      UPDATE merit_list_designations SET clause_id = permission_id WHERE clause_id IS NULL AND permission_id IS NOT NULL;
      -- Drop ALL FK constraints on permission_id (handle both fk_mld_permission and fk_mid_permission)
      BEGIN
        DECLARE done INT DEFAULT 0;
        DECLARE fk_name VARCHAR(128);
        DECLARE fk_cursor CURSOR FOR
          SELECT tc.CONSTRAINT_NAME
          FROM information_schema.TABLE_CONSTRAINTS tc
          JOIN information_schema.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME
          WHERE tc.CONSTRAINT_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'merit_list_designations'
            AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY' AND kcu.COLUMN_NAME = 'permission_id';
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
        OPEN fk_cursor;
        read_loop: LOOP
          FETCH fk_cursor INTO fk_name;
          IF done THEN LEAVE read_loop; END IF;
          SET @drop_sql = CONCAT('ALTER TABLE merit_list_designations DROP FOREIGN KEY ', fk_name);
          PREPARE stmt FROM @drop_sql;
          EXECUTE stmt;
          DEALLOCATE PREPARE stmt;
        END LOOP;
        CLOSE fk_cursor;
      END;
      ALTER TABLE merit_list_designations MODIFY COLUMN permission_id VARCHAR(64) DEFAULT NULL;
    END IF;
  END;

END //

DELIMITER ;

CALL migrate_to_org_id();
DROP PROCEDURE IF EXISTS migrate_to_org_id;
