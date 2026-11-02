-- 组织独立事由使用新表，旧全局表保留用于兼容发布核对，不改历史借用事由文字。
CREATE TABLE IF NOT EXISTS organization_venue_booking_purposes (
  org_id VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  text VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, id),
  UNIQUE KEY uk_org_venue_purpose_text (org_id, text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS venue_purpose_bootstrap (
  id TINYINT NOT NULL PRIMARY KEY,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 首次复制与完成标记同事务；重跑不能复活已经删除的组织选项，也不替新组织自动复制。
START TRANSACTION;
INSERT INTO organization_venue_booking_purposes (org_id, id, text, sort_order, created_at, updated_at)
SELECT o.id, p.id, p.text, p.sort_order, p.created_at, p.updated_at
FROM organizations o CROSS JOIN venue_booking_purposes p
WHERE NOT EXISTS (SELECT 1 FROM venue_purpose_bootstrap WHERE id = 1);
INSERT IGNORE INTO venue_purpose_bootstrap (id) VALUES (1);
COMMIT;

DROP TRIGGER IF EXISTS cv_org_venue_purposes_i;
CREATE TRIGGER cv_org_venue_purposes_i AFTER INSERT ON organization_venue_booking_purposes FOR EACH ROW
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (NEW.org_id, 'venue', 1)
  ON DUPLICATE KEY UPDATE version = version + 1;
DROP TRIGGER IF EXISTS cv_org_venue_purposes_u;
CREATE TRIGGER cv_org_venue_purposes_u AFTER UPDATE ON organization_venue_booking_purposes FOR EACH ROW
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (NEW.org_id, 'venue', 1)
  ON DUPLICATE KEY UPDATE version = version + 1;
DROP TRIGGER IF EXISTS cv_org_venue_purposes_d;
CREATE TRIGGER cv_org_venue_purposes_d AFTER DELETE ON organization_venue_booking_purposes FOR EACH ROW
  INSERT INTO cache_domain_versions (org_id, domain, version) VALUES (OLD.org_id, 'venue', 1)
  ON DUPLICATE KEY UPDATE version = version + 1;
