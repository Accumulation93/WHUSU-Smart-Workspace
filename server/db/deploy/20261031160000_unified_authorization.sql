-- 统一授权的兼容结构。默认仅对照计算，不自动改变任何组织的现行权限。
CREATE TABLE IF NOT EXISTS authorization_organizations (
  org_id VARCHAR(64) NOT NULL PRIMARY KEY,
  mode VARCHAR(16) NOT NULL DEFAULT 'shadow',
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  legacy_migrated_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_authorization_mode CHECK (mode IN ('shadow', 'enforced'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_rules (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  policy_json JSON NOT NULL,
  scheme_id VARCHAR(64) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  source_kind VARCHAR(24) NOT NULL DEFAULT 'manual',
  source_ref VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_authorization_source (org_id, source_kind, source_ref),
  KEY idx_authorization_rules_org (org_id, scheme_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_schemes (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  draft_capabilities_json JSON NOT NULL,
  published_version INT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_authorization_schemes_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_scheme_versions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  scheme_id VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL,
  capabilities_json JSON NOT NULL,
  actor_context_id VARCHAR(160) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_authorization_scheme_version (org_id, scheme_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_delegations (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  subjects_json JSON NOT NULL,
  envelope_json JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_authorization_delegations_org (org_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_changes (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  actor_context_id VARCHAR(160) NOT NULL,
  action VARCHAR(32) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_authorization_changes_org (org_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- assignment_kind 的旧值继续有效；新字典键沿用其32字符容量，避免在线改列类型。
CREATE TABLE IF NOT EXISTS assignment_natures (
  id VARCHAR(32) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (org_id, id),
  UNIQUE KEY uk_assignment_nature_name (org_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 各写入在同一事务递增组织版本；目录版本沿用既有消息及角色缓存依赖。
DROP TRIGGER IF EXISTS cv_authorization_rules_i;
CREATE TRIGGER cv_authorization_rules_i AFTER INSERT ON authorization_rules FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_authorization_rules_u;
CREATE TRIGGER cv_authorization_rules_u AFTER UPDATE ON authorization_rules FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_authorization_rules_d;
CREATE TRIGGER cv_authorization_rules_d AFTER DELETE ON authorization_rules FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (OLD.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;

DROP TRIGGER IF EXISTS cv_authorization_schemes_i;
CREATE TRIGGER cv_authorization_schemes_i AFTER INSERT ON authorization_schemes FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_authorization_schemes_u;
CREATE TRIGGER cv_authorization_schemes_u AFTER UPDATE ON authorization_schemes FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_authorization_schemes_d;
CREATE TRIGGER cv_authorization_schemes_d AFTER DELETE ON authorization_schemes FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (OLD.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;

DROP TRIGGER IF EXISTS cv_authorization_delegations_i;
CREATE TRIGGER cv_authorization_delegations_i AFTER INSERT ON authorization_delegations FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_authorization_delegations_u;
CREATE TRIGGER cv_authorization_delegations_u AFTER UPDATE ON authorization_delegations FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_authorization_delegations_d;
CREATE TRIGGER cv_authorization_delegations_d AFTER DELETE ON authorization_delegations FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (OLD.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;

DROP TRIGGER IF EXISTS cv_assignment_natures_i;
CREATE TRIGGER cv_assignment_natures_i AFTER INSERT ON assignment_natures FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_assignment_natures_u;
CREATE TRIGGER cv_assignment_natures_u AFTER UPDATE ON assignment_natures FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_assignment_natures_d;
CREATE TRIGGER cv_assignment_natures_d AFTER DELETE ON assignment_natures FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (OLD.org_id, 1)
  ON DUPLICATE KEY UPDATE revision = revision + 1;

DROP TRIGGER IF EXISTS cv_authorization_organizations_i;
CREATE TRIGGER cv_authorization_organizations_i AFTER INSERT ON authorization_organizations FOR EACH ROW
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (NEW.org_id, 'directory', 1)
  ON DUPLICATE KEY UPDATE version = version + 1;
DROP TRIGGER IF EXISTS cv_authorization_organizations_u;
CREATE TRIGGER cv_authorization_organizations_u AFTER UPDATE ON authorization_organizations FOR EACH ROW
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (NEW.org_id, 'directory', 1)
  ON DUPLICATE KEY UPDATE version = version + 1;
DROP TRIGGER IF EXISTS cv_authorization_organizations_d;
CREATE TRIGGER cv_authorization_organizations_d AFTER DELETE ON authorization_organizations FOR EACH ROW
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (OLD.org_id, 'directory', 1)
  ON DUPLICATE KEY UPDATE version = version + 1;

-- 保留旧性质编号及名称，不把学院对接岗位改成其他含义；重复执行不覆盖管理员改名。
INSERT IGNORE INTO assignment_natures (id, org_id, name)
  SELECT 'staff', id, '本会岗位' FROM organizations;
INSERT IGNORE INTO assignment_natures (id, org_id, name)
  SELECT 'liaison', id, '学院对接岗位' FROM organizations;
INSERT IGNORE INTO assignment_natures (id, org_id, name)
  SELECT 'other', id, '其他岗位' FROM organizations;
