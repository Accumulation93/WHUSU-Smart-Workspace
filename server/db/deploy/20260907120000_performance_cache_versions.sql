-- 派生缓存版本与业务写入由 InnoDB 触发器在同一事务提交；回滚不会推进版本。
-- 父表也登记失效，覆盖 MySQL 外键级联不执行子表触发器的行为。
CREATE TABLE IF NOT EXISTS cache_domain_versions (
  org_id VARCHAR(64) NOT NULL,
  domain VARCHAR(32) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (org_id, domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
DROP TRIGGER IF EXISTS cv_persons_i$$
CREATE TRIGGER cv_persons_i AFTER INSERT ON persons FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_persons_u$$
CREATE TRIGGER cv_persons_u AFTER UPDATE ON persons FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_persons_d$$
CREATE TRIGGER cv_persons_d AFTER DELETE ON persons FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_accounts_i$$
CREATE TRIGGER cv_accounts_i AFTER INSERT ON accounts FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_accounts_u$$
CREATE TRIGGER cv_accounts_u AFTER UPDATE ON accounts FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_accounts_d$$
CREATE TRIGGER cv_accounts_d AFTER DELETE ON accounts FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_organizations_i$$
CREATE TRIGGER cv_organizations_i AFTER INSERT ON organizations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_organizations_u$$
CREATE TRIGGER cv_organizations_u AFTER UPDATE ON organizations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_organizations_d$$
CREATE TRIGGER cv_organizations_d AFTER DELETE ON organizations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_system_config_i$$
CREATE TRIGGER cv_system_config_i AFTER INSERT ON system_config FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_system_config_u$$
CREATE TRIGGER cv_system_config_u AFTER UPDATE ON system_config FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_system_config_d$$
CREATE TRIGGER cv_system_config_d AFTER DELETE ON system_config FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_admin_grants_i$$
CREATE TRIGGER cv_admin_grants_i AFTER INSERT ON admin_grants FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_admin_grants_u$$
CREATE TRIGGER cv_admin_grants_u AFTER UPDATE ON admin_grants FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_admin_grants_d$$
CREATE TRIGGER cv_admin_grants_d AFTER DELETE ON admin_grants FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_hr_info_i$$
CREATE TRIGGER cv_hr_info_i AFTER INSERT ON hr_info FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_hr_info_u$$
CREATE TRIGGER cv_hr_info_u AFTER UPDATE ON hr_info FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_hr_info_d$$
CREATE TRIGGER cv_hr_info_d AFTER DELETE ON hr_info FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_organization_memberships_i$$
CREATE TRIGGER cv_organization_memberships_i AFTER INSERT ON organization_memberships FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_organization_memberships_u$$
CREATE TRIGGER cv_organization_memberships_u AFTER UPDATE ON organization_memberships FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_organization_memberships_d$$
CREATE TRIGGER cv_organization_memberships_d AFTER DELETE ON organization_memberships FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_membership_assignments_i$$
CREATE TRIGGER cv_membership_assignments_i AFTER INSERT ON membership_assignments FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_membership_assignments_u$$
CREATE TRIGGER cv_membership_assignments_u AFTER UPDATE ON membership_assignments FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_membership_assignments_d$$
CREATE TRIGGER cv_membership_assignments_d AFTER DELETE ON membership_assignments FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_departments_i$$
CREATE TRIGGER cv_departments_i AFTER INSERT ON departments FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_departments_u$$
CREATE TRIGGER cv_departments_u AFTER UPDATE ON departments FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_departments_d$$
CREATE TRIGGER cv_departments_d AFTER DELETE ON departments FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_identities_i$$
CREATE TRIGGER cv_identities_i AFTER INSERT ON identities FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_identities_u$$
CREATE TRIGGER cv_identities_u AFTER UPDATE ON identities FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_identities_d$$
CREATE TRIGGER cv_identities_d AFTER DELETE ON identities FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_work_groups_i$$
CREATE TRIGGER cv_work_groups_i AFTER INSERT ON work_groups FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_work_groups_u$$
CREATE TRIGGER cv_work_groups_u AFTER UPDATE ON work_groups FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_work_groups_d$$
CREATE TRIGGER cv_work_groups_d AFTER DELETE ON work_groups FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_admin_info_i$$
CREATE TRIGGER cv_admin_info_i AFTER INSERT ON admin_info FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_admin_info_u$$
CREATE TRIGGER cv_admin_info_u AFTER UPDATE ON admin_info FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_admin_info_d$$
CREATE TRIGGER cv_admin_info_d AFTER DELETE ON admin_info FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_admin_permission_overrides_i$$
CREATE TRIGGER cv_admin_permission_overrides_i AFTER INSERT ON admin_permission_overrides FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_admin_permission_overrides_u$$
CREATE TRIGGER cv_admin_permission_overrides_u AFTER UPDATE ON admin_permission_overrides FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_admin_permission_overrides_d$$
CREATE TRIGGER cv_admin_permission_overrides_d AFTER DELETE ON admin_permission_overrides FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'directory', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_activities_i$$
CREATE TRIGGER cv_score_activities_i AFTER INSERT ON score_activities FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_activities_u$$
CREATE TRIGGER cv_score_activities_u AFTER UPDATE ON score_activities FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_score_activities_d$$
CREATE TRIGGER cv_score_activities_d AFTER DELETE ON score_activities FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_rate_target_rules_i$$
CREATE TRIGGER cv_rate_target_rules_i AFTER INSERT ON rate_target_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_rate_target_rules_u$$
CREATE TRIGGER cv_rate_target_rules_u AFTER UPDATE ON rate_target_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_rate_target_rules_d$$
CREATE TRIGGER cv_rate_target_rules_d AFTER DELETE ON rate_target_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_rate_rule_clauses_i$$
CREATE TRIGGER cv_rate_rule_clauses_i AFTER INSERT ON rate_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_rate_rule_clauses_u$$
CREATE TRIGGER cv_rate_rule_clauses_u AFTER UPDATE ON rate_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_rate_rule_clauses_d$$
CREATE TRIGGER cv_rate_rule_clauses_d AFTER DELETE ON rate_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_clause_template_configs_i$$
CREATE TRIGGER cv_clause_template_configs_i AFTER INSERT ON clause_template_configs FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_clause_template_configs_u$$
CREATE TRIGGER cv_clause_template_configs_u AFTER UPDATE ON clause_template_configs FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_clause_template_configs_d$$
CREATE TRIGGER cv_clause_template_configs_d AFTER DELETE ON clause_template_configs FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_records_i$$
CREATE TRIGGER cv_score_records_i AFTER INSERT ON score_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_records_u$$
CREATE TRIGGER cv_score_records_u AFTER UPDATE ON score_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_score_records_d$$
CREATE TRIGGER cv_score_records_d AFTER DELETE ON score_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_answers_i$$
CREATE TRIGGER cv_score_answers_i AFTER INSERT ON score_answers FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_answers_u$$
CREATE TRIGGER cv_score_answers_u AFTER UPDATE ON score_answers FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_score_answers_d$$
CREATE TRIGGER cv_score_answers_d AFTER DELETE ON score_answers FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_question_templates_i$$
CREATE TRIGGER cv_score_question_templates_i AFTER INSERT ON score_question_templates FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_question_templates_u$$
CREATE TRIGGER cv_score_question_templates_u AFTER UPDATE ON score_question_templates FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_score_question_templates_d$$
CREATE TRIGGER cv_score_question_templates_d AFTER DELETE ON score_question_templates FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_questions_i$$
CREATE TRIGGER cv_score_questions_i AFTER INSERT ON score_questions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_question_templates WHERE id = NEW.template_id), ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_questions_u$$
CREATE TRIGGER cv_score_questions_u AFTER UPDATE ON score_questions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_question_templates WHERE id = NEW.template_id), ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (COALESCE((SELECT org_id FROM score_question_templates WHERE id = OLD.template_id), '') <=> COALESCE((SELECT org_id FROM score_question_templates WHERE id = NEW.template_id), '')) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_question_templates WHERE id = OLD.template_id), ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_score_questions_d$$
CREATE TRIGGER cv_score_questions_d AFTER DELETE ON score_questions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_question_templates WHERE id = OLD.template_id), ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_template_order_i$$
CREATE TRIGGER cv_score_template_order_i AFTER INSERT ON score_template_order FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_activities WHERE id = NEW.activity_id), ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_score_template_order_u$$
CREATE TRIGGER cv_score_template_order_u AFTER UPDATE ON score_template_order FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_activities WHERE id = NEW.activity_id), ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (COALESCE((SELECT org_id FROM score_activities WHERE id = OLD.activity_id), '') <=> COALESCE((SELECT org_id FROM score_activities WHERE id = NEW.activity_id), '')) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_activities WHERE id = OLD.activity_id), ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_score_template_order_d$$
CREATE TRIGGER cv_score_template_order_d AFTER DELETE ON score_template_order FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE((SELECT org_id FROM score_activities WHERE id = OLD.activity_id), ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_result_publications_i$$
CREATE TRIGGER cv_result_publications_i AFTER INSERT ON result_publications FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_result_publications_u$$
CREATE TRIGGER cv_result_publications_u AFTER UPDATE ON result_publications FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_result_publications_d$$
CREATE TRIGGER cv_result_publications_d AFTER DELETE ON result_publications FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_view_rules_i$$
CREATE TRIGGER cv_pub_view_rules_i AFTER INSERT ON pub_view_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_view_rules_u$$
CREATE TRIGGER cv_pub_view_rules_u AFTER UPDATE ON pub_view_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_pub_view_rules_d$$
CREATE TRIGGER cv_pub_view_rules_d AFTER DELETE ON pub_view_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_view_rule_clauses_i$$
CREATE TRIGGER cv_pub_view_rule_clauses_i AFTER INSERT ON pub_view_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_view_rule_clauses_u$$
CREATE TRIGGER cv_pub_view_rule_clauses_u AFTER UPDATE ON pub_view_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_pub_view_rule_clauses_d$$
CREATE TRIGGER cv_pub_view_rule_clauses_d AFTER DELETE ON pub_view_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_grade_bands_i$$
CREATE TRIGGER cv_pub_grade_bands_i AFTER INSERT ON pub_grade_bands FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_grade_bands_u$$
CREATE TRIGGER cv_pub_grade_bands_u AFTER UPDATE ON pub_grade_bands FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_pub_grade_bands_d$$
CREATE TRIGGER cv_pub_grade_bands_d AFTER DELETE ON pub_grade_bands FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_merit_rules_i$$
CREATE TRIGGER cv_pub_merit_rules_i AFTER INSERT ON pub_merit_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_merit_rules_u$$
CREATE TRIGGER cv_pub_merit_rules_u AFTER UPDATE ON pub_merit_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_pub_merit_rules_d$$
CREATE TRIGGER cv_pub_merit_rules_d AFTER DELETE ON pub_merit_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_merit_rule_clauses_i$$
CREATE TRIGGER cv_pub_merit_rule_clauses_i AFTER INSERT ON pub_merit_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_pub_merit_rule_clauses_u$$
CREATE TRIGGER cv_pub_merit_rule_clauses_u AFTER UPDATE ON pub_merit_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_pub_merit_rule_clauses_d$$
CREATE TRIGGER cv_pub_merit_rule_clauses_d AFTER DELETE ON pub_merit_rule_clauses FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_merit_list_designations_i$$
CREATE TRIGGER cv_merit_list_designations_i AFTER INSERT ON merit_list_designations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_merit_list_designations_u$$
CREATE TRIGGER cv_merit_list_designations_u AFTER UPDATE ON merit_list_designations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_merit_list_designations_d$$
CREATE TRIGGER cv_merit_list_designations_d AFTER DELETE ON merit_list_designations FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'scoring', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_audit_submissions_i$$
CREATE TRIGGER cv_audit_submissions_i AFTER INSERT ON audit_submissions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'audit', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_audit_submissions_u$$
CREATE TRIGGER cv_audit_submissions_u AFTER UPDATE ON audit_submissions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'audit', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'audit', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_audit_submissions_d$$
CREATE TRIGGER cv_audit_submissions_d AFTER DELETE ON audit_submissions FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'audit', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_audit_submission_steps_i$$
CREATE TRIGGER cv_audit_submission_steps_i AFTER INSERT ON audit_submission_steps FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'audit', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_audit_submission_steps_u$$
CREATE TRIGGER cv_audit_submission_steps_u AFTER UPDATE ON audit_submission_steps FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'audit', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'audit', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_audit_submission_steps_d$$
CREATE TRIGGER cv_audit_submission_steps_d AFTER DELETE ON audit_submission_steps FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'audit', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_venue_bookings_i$$
CREATE TRIGGER cv_venue_bookings_i AFTER INSERT ON venue_bookings FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.approval_org_id, ''), 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_venue_bookings_u$$
CREATE TRIGGER cv_venue_bookings_u AFTER UPDATE ON venue_bookings FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.approval_org_id, ''), 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.approval_org_id <=> NEW.approval_org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.approval_org_id, ''), 'venue', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_venue_bookings_d$$
CREATE TRIGGER cv_venue_bookings_d AFTER DELETE ON venue_bookings FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.approval_org_id, ''), 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_venue_booking_rules_i$$
CREATE TRIGGER cv_venue_booking_rules_i AFTER INSERT ON venue_booking_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_venue_booking_rules_u$$
CREATE TRIGGER cv_venue_booking_rules_u AFTER UPDATE ON venue_booking_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'venue', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_venue_booking_rules_d$$
CREATE TRIGGER cv_venue_booking_rules_d AFTER DELETE ON venue_booking_rules FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_venues_i$$
CREATE TRIGGER cv_venues_i AFTER INSERT ON venues FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_venues_u$$
CREATE TRIGGER cv_venues_u AFTER UPDATE ON venues FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_venues_d$$
CREATE TRIGGER cv_venues_d AFTER DELETE ON venues FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES ('*', 'venue', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_hr_profile_records_i$$
CREATE TRIGGER cv_hr_profile_records_i AFTER INSERT ON hr_profile_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'profile', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_hr_profile_records_u$$
CREATE TRIGGER cv_hr_profile_records_u AFTER UPDATE ON hr_profile_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'profile', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'profile', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_hr_profile_records_d$$
CREATE TRIGGER cv_hr_profile_records_d AFTER DELETE ON hr_profile_records FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'profile', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_notifications_i$$
CREATE TRIGGER cv_notifications_i AFTER INSERT ON notifications FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'notification', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP TRIGGER IF EXISTS cv_notifications_u$$
CREATE TRIGGER cv_notifications_u AFTER UPDATE ON notifications FOR EACH ROW
BEGIN
  IF NOT (BINARY OLD.id <=> BINARY NEW.id)
    OR NOT (BINARY OLD.org_id <=> BINARY NEW.org_id)
    OR NOT (BINARY OLD.recipient_type <=> BINARY NEW.recipient_type)
    OR NOT (BINARY OLD.recipient_id <=> BINARY NEW.recipient_id)
    OR NOT (BINARY OLD.type <=> BINARY NEW.type)
    OR NOT (BINARY OLD.title <=> BINARY NEW.title)
    OR NOT (BINARY OLD.description <=> BINARY NEW.description)
    OR NOT (BINARY OLD.category <=> BINARY NEW.category)
    OR NOT (BINARY OLD.target_type <=> BINARY NEW.target_type)
    OR NOT (BINARY OLD.target_id <=> BINARY NEW.target_id)
    OR NOT (BINARY OLD.target_url <=> BINARY NEW.target_url)
    OR NOT (OLD.is_read <=> NEW.is_read)
    OR NOT (OLD.created_at <=> NEW.created_at) THEN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(NEW.org_id, ''), 'notification', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
  IF NOT (OLD.org_id <=> NEW.org_id) THEN
    INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'notification', 1)
      ON DUPLICATE KEY UPDATE version = version + 1;
  END IF;
  END IF;
END$$
DROP TRIGGER IF EXISTS cv_notifications_d$$
CREATE TRIGGER cv_notifications_d AFTER DELETE ON notifications FOR EACH ROW
BEGIN
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (COALESCE(OLD.org_id, ''), 'notification', 1)
    ON DUPLICATE KEY UPDATE version = version + 1;
END$$
DROP PROCEDURE IF EXISTS add_performance_indexes$$
CREATE PROCEDURE add_performance_indexes()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'score_records' AND index_name = 'idx_sr_task_assignment') THEN
    ALTER TABLE score_records ADD INDEX idx_sr_task_assignment (org_id, activity_id, scorer_assignment_id, target_assignment_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'audit_submission_steps' AND index_name = 'idx_ass_current_round') THEN
    ALTER TABLE audit_submission_steps ADD INDEX idx_ass_current_round (org_id, submission_id, sort_order, round);
  END IF;
END$$
CALL add_performance_indexes()$$
DROP PROCEDURE add_performance_indexes$$
DELIMITER ;
