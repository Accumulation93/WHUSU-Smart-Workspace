-- 将原有业务关系入口转成正式的角色和分配。旧排除项只供回退版本读取。
CREATE TABLE IF NOT EXISTS authorization_relationship_role_assignments (
  org_id VARCHAR(64) NOT NULL PRIMARY KEY,
  scheme_id VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_authorization_relationship_role (scheme_id),
  CONSTRAINT chk_authorization_relationship_enabled CHECK (enabled IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS cv_authorization_relationship_roles_i;
CREATE TRIGGER cv_authorization_relationship_roles_i AFTER INSERT ON authorization_relationship_role_assignments FOR EACH ROW
  INSERT INTO authorization_organizations (org_id, revision) VALUES (NEW.org_id, 1)
    ON DUPLICATE KEY UPDATE revision = revision + 1;
DROP TRIGGER IF EXISTS cv_authorization_relationship_roles_u;
CREATE TRIGGER cv_authorization_relationship_roles_u AFTER UPDATE ON authorization_relationship_role_assignments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id IN (OLD.org_id, NEW.org_id);
DROP TRIGGER IF EXISTS cv_authorization_relationship_roles_d;
CREATE TRIGGER cv_authorization_relationship_roles_d AFTER DELETE ON authorization_relationship_role_assignments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = OLD.org_id;

DROP TEMPORARY TABLE IF EXISTS pending_relationship_roles;
CREATE TEMPORARY TABLE pending_relationship_roles (
  org_id VARCHAR(64) PRIMARY KEY, scheme_id VARCHAR(64) NOT NULL, name VARCHAR(80) NOT NULL, capabilities JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;
SELECT id FROM organizations ORDER BY id FOR SHARE;
SELECT org_id FROM authorization_organizations ORDER BY org_id FOR UPDATE;

INSERT INTO pending_relationship_roles (org_id, scheme_id, name, capabilities)
WITH RECURSIVE existing_names AS (
  SELECT DISTINCT org_id, name FROM authorization_schemes
), names AS (
  SELECT o.id AS org_id, 1 AS suffix, CAST('成员基础权限' AS CHAR(80) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS name
  FROM organizations o LEFT JOIN authorization_relationship_role_assignments a ON a.org_id = o.id
  WHERE a.org_id IS NULL
  UNION ALL
  SELECT n.org_id, n.suffix + 1, CONCAT('成员基础权限（', n.suffix + 1, '）')
  FROM names n JOIN existing_names s ON s.org_id = n.org_id AND s.name = n.name
), defaults AS (
  SELECT caps.capability_key FROM JSON_TABLE(JSON_ARRAY(
    'audit.submissions.approve', 'audit.submissions.cancel', 'audit.submissions.create', 'audit.submissions.read',
    'audit.submissions.update', 'calendar.events.cancel', 'calendar.events.create', 'calendar.events.read',
    'calendar.events.update', 'contacts.entries.read', 'identity.cards.create', 'identity.cards.read', 'identity.cards.verify',
    'notifications.items.delete', 'notifications.items.read', 'scoring.currentActivity.read', 'scoring.latestPublishedActivity.read',
    'scoring.meritSelections.read', 'scoring.meritSelections.update', 'scoring.participation.create', 'scoring.participation.read',
    'scoring.participation.update', 'scoring.publishedResults.read', 'venue.approvalHistory.read', 'venue.bookingParticipants.read',
    'venue.bookingParticipants.update', 'venue.bookings.approve', 'venue.bookings.cancel', 'venue.bookings.create',
    'venue.bookings.read', 'venue.bookings.update', 'venue.purposes.read', 'venue.resources.read', 'venue.schedule.read'
  ), '$[*]' COLUMNS (capability_key VARCHAR(96) PATH '$')) caps
)
SELECT n.org_id, CONCAT('member-role-', LEFT(SHA2(n.org_id, 256), 48)), n.name,
  COALESCE((SELECT JSON_ARRAYAGG(d.capability_key) FROM defaults d
    WHERE NOT EXISTS (SELECT 1 FROM authorization_basic_role_exclusions e
      WHERE e.org_id = n.org_id AND e.capability_key = d.capability_key)), JSON_ARRAY())
FROM names n WHERE NOT EXISTS (SELECT 1 FROM existing_names s WHERE s.org_id = n.org_id AND s.name = n.name);

INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
  SELECT scheme_id, org_id, name, capabilities, 1 FROM pending_relationship_roles;
INSERT INTO authorization_scheme_versions (id, org_id, scheme_id, version, capabilities_json, actor_context_id)
  SELECT scheme_id, org_id, scheme_id, 1, capabilities, 'migration:20261124131000' FROM pending_relationship_roles;
INSERT INTO authorization_relationship_role_assignments (org_id, scheme_id)
  SELECT org_id, scheme_id FROM pending_relationship_roles;
COMMIT;

DROP TEMPORARY TABLE pending_relationship_roles;
