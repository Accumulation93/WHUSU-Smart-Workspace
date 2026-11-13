-- 身份类别适用性质独立存储；保留已有编号、岗位状态和历史记录。
CREATE TABLE IF NOT EXISTS identity_nature_rollouts (
  org_id VARCHAR(64) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 0,
  enabled_at DATETIME(3) NULL,
  PRIMARY KEY (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO identity_nature_rollouts(org_id) SELECT id FROM organizations;
CREATE TABLE IF NOT EXISTS identity_nature_states (
  org_id VARCHAR(64) NOT NULL,
  identity_id VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (org_id, identity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS identity_nature_links (
  org_id VARCHAR(64) NOT NULL,
  identity_id VARCHAR(64) NOT NULL,
  nature_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (org_id, identity_id, nature_id),
  KEY idx_identity_nature_reverse (org_id, nature_id, identity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- 只为尚未初始化的身份回填；重跑不得恢复管理员已经解除的关联。
INSERT IGNORE INTO identity_nature_links (org_id, identity_id, nature_id)
SELECT DISTINCT i.org_id, i.id, a.assignment_kind
FROM identities i JOIN membership_assignments a ON a.org_id=i.org_id COLLATE utf8mb4_unicode_ci AND a.identity_id=i.id COLLATE utf8mb4_unicode_ci
JOIN assignment_natures n ON n.org_id=i.org_id COLLATE utf8mb4_unicode_ci AND n.id=a.assignment_kind COLLATE utf8mb4_unicode_ci
LEFT JOIN identity_nature_states s ON s.org_id=i.org_id COLLATE utf8mb4_unicode_ci AND s.identity_id=i.id COLLATE utf8mb4_unicode_ci
WHERE s.identity_id IS NULL;
-- 用户逐项确认的唯一无岗位引用身份，不按名称推断其他组织。
INSERT IGNORE INTO identity_nature_links (org_id, identity_id, nature_id)
SELECT i.org_id,i.id,n.id FROM identities i
JOIN assignment_natures n ON n.org_id=i.org_id COLLATE utf8mb4_unicode_ci AND n.id='staff'
LEFT JOIN identity_nature_states s ON s.org_id=i.org_id COLLATE utf8mb4_unicode_ci AND s.identity_id=i.id COLLATE utf8mb4_unicode_ci
WHERE i.id='e763de6d8c1c024b2b0577a20101af58d62e241d83b93c1aa46e54767bf1008c' AND s.identity_id IS NULL;
INSERT IGNORE INTO identity_nature_states (org_id,identity_id) SELECT org_id,id FROM identities;
DROP TRIGGER IF EXISTS cv_identity_nature_links_i;
CREATE TRIGGER cv_identity_nature_links_i AFTER INSERT ON identity_nature_links FOR EACH ROW
  INSERT INTO authorization_organizations (org_id,revision) VALUES (NEW.org_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
DROP TRIGGER IF EXISTS cv_identity_nature_links_u;
CREATE TRIGGER cv_identity_nature_links_u AFTER UPDATE ON identity_nature_links FOR EACH ROW
  INSERT INTO authorization_organizations (org_id,revision) VALUES (NEW.org_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
DROP TRIGGER IF EXISTS cv_identity_nature_links_d;
CREATE TRIGGER cv_identity_nature_links_d AFTER DELETE ON identity_nature_links FOR EACH ROW
  INSERT INTO authorization_organizations (org_id,revision) VALUES (OLD.org_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
