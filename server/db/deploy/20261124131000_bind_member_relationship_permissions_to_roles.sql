-- 将原有业务关系入口转成正式的角色和分配，旧排除项供回退版本读写。
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

CREATE FUNCTION IF NOT EXISTS authorization_default_member_capabilities() RETURNS JSON DETERMINISTIC NO SQL
  RETURN JSON_ARRAY(
    'audit.submissions.approve', 'audit.submissions.cancel', 'audit.submissions.create', 'audit.submissions.read',
    'audit.submissions.update', 'calendar.events.cancel', 'calendar.events.create', 'calendar.events.read',
    'calendar.events.update', 'contacts.entries.read', 'identity.cards.create', 'identity.cards.read', 'identity.cards.verify',
    'notifications.items.delete', 'notifications.items.read', 'scoring.currentActivity.read', 'scoring.latestPublishedActivity.read',
    'scoring.meritSelections.read', 'scoring.meritSelections.update', 'scoring.participation.create', 'scoring.participation.read',
    'scoring.participation.update', 'scoring.publishedResults.read', 'venue.approvalHistory.read', 'venue.bookingParticipants.read',
    'venue.bookingParticipants.update', 'venue.bookings.approve', 'venue.bookings.cancel', 'venue.bookings.create',
    'venue.bookings.read', 'venue.bookings.update', 'venue.purposes.read', 'venue.resources.read', 'venue.schedule.read'
  );

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS authorization_initialize_member_role AFTER INSERT ON organizations FOR EACH ROW
BEGIN
  DECLARE role_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE capabilities JSON;
  SET role_id = CONCAT('member-role-', LEFT(SHA2(NEW.id, 256), 48));
  SET capabilities = authorization_default_member_capabilities();
  INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
    VALUES (role_id, NEW.id, '成员基础权限', capabilities, 1);
  INSERT INTO authorization_scheme_versions (id, org_id, scheme_id, version, capabilities_json, actor_context_id)
    VALUES (role_id, NEW.id, role_id, 1, capabilities, 'system:organization_init');
  INSERT INTO authorization_relationship_role_assignments (org_id, scheme_id) VALUES (NEW.id, role_id);
END$$

-- 旧进程在同一事务先写排除项，再追加这条授权变更。仅镜像这一种事件，保留操作者和无关草稿。
CREATE TRIGGER IF NOT EXISTS authorization_mirror_legacy_basic_toggle AFTER INSERT ON authorization_changes FOR EACH ROW
BEGIN
  DECLARE role_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE live_version INT UNSIGNED;
  DECLARE live JSON;
  DECLARE draft JSON;
  DECLARE enabled BOOLEAN;
  IF NEW.action = 'basic_permission_toggle'
    AND JSON_TYPE(JSON_EXTRACT(NEW.after_json, '$.enabled')) = 'BOOLEAN'
    AND JSON_CONTAINS(authorization_default_member_capabilities(), JSON_QUOTE(NEW.target_id)) THEN
    SET enabled = JSON_UNQUOTE(JSON_EXTRACT(NEW.after_json, '$.enabled')) = 'true';
    SELECT s.id, s.published_version, v.capabilities_json, s.draft_capabilities_json
      INTO role_id, live_version, live, draft
      FROM authorization_relationship_role_assignments b
      JOIN authorization_schemes s ON s.org_id = b.org_id AND s.id = b.scheme_id
      JOIN authorization_scheme_versions v
        ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version
      WHERE b.org_id = NEW.org_id AND b.enabled = 1 FOR UPDATE;
    IF role_id IS NOT NULL AND JSON_CONTAINS(live, JSON_QUOTE(NEW.target_id)) <> enabled THEN
      IF enabled THEN
        SET live = JSON_ARRAY_APPEND(live, '$', NEW.target_id);
        IF NOT JSON_CONTAINS(draft, JSON_QUOTE(NEW.target_id)) THEN
          SET draft = JSON_ARRAY_APPEND(draft, '$', NEW.target_id);
        END IF;
      ELSE
        SET live = JSON_REMOVE(live, JSON_UNQUOTE(JSON_SEARCH(live, 'one', NEW.target_id)));
        IF JSON_CONTAINS(draft, JSON_QUOTE(NEW.target_id)) THEN
          SET draft = JSON_REMOVE(draft, JSON_UNQUOTE(JSON_SEARCH(draft, 'one', NEW.target_id)));
        END IF;
      END IF;
      INSERT INTO authorization_scheme_versions (id, org_id, scheme_id, version, capabilities_json, actor_context_id)
        VALUES (UUID(), NEW.org_id, role_id, live_version + 1, live, NEW.actor_context_id);
      UPDATE authorization_schemes SET published_version = live_version + 1,
        draft_capabilities_json = draft, version = version + 1 WHERE org_id = NEW.org_id AND id = role_id;
    END IF;
  END IF;
END$$
DELIMITER ;

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
  SELECT caps.capability_key COLLATE utf8mb4_unicode_ci AS capability_key FROM JSON_TABLE(authorization_default_member_capabilities(),
    '$[*]' COLUMNS (capability_key VARCHAR(96) PATH '$')) caps
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
