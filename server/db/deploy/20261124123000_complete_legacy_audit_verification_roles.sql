-- 补录已启用组织中旧迁移未覆盖的验签名单。账本中已处理的资格不得再次授予。
CREATE TEMPORARY TABLE IF NOT EXISTS authorization_legacy_verifier_backfill (
  rule_id VARCHAR(64) NOT NULL PRIMARY KEY,
  role_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  legacy_id VARCHAR(64) NOT NULL,
  member_name VARCHAR(80) NOT NULL,
  policy JSON NOT NULL,
  source JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;

SELECT o.org_id FROM authorization_organizations o
WHERE o.mode='enforced' AND EXISTS (SELECT 1 FROM audit_verification_permissions p WHERE p.org_id=o.org_id)
ORDER BY o.org_id FOR UPDATE;

INSERT INTO authorization_legacy_verifier_backfill (rule_id, role_id, org_id, legacy_id, member_name, policy, source)
WITH candidates AS (
  SELECT p.id, p.org_id, p.grantee_hr_id, p.granted_by, p.created_at, h.name,
         SHA2(CONCAT('legacy-verification:', p.org_id, ':', p.id), 256) COLLATE utf8mb4_unicode_ci AS rule_id
  FROM audit_verification_permissions p
  JOIN authorization_organizations o ON o.org_id=p.org_id AND o.mode='enforced'
  JOIN hr_info h ON h.org_id=p.org_id AND h.id=p.grantee_hr_id
), existing_assignments AS (
  SELECT c.rule_id, JSON_ARRAYAGG(a.id) AS ids
  FROM candidates c
  JOIN organization_memberships m ON m.org_id=c.org_id AND m.legacy_hr_id=c.grantee_hr_id AND m.status='active'
  JOIN membership_assignments a ON a.org_id=m.org_id AND a.membership_id=m.id AND a.status='active'
  GROUP BY c.rule_id
)
SELECT c.rule_id, CONCAT('compat-rule-', LEFT(SHA2(CONCAT(c.org_id, ':', c.rule_id), 256), 48)),
       c.org_id, c.id, LEFT(TRIM(c.name), 80),
       JSON_OBJECT('id', c.rule_id, 'organizationId', c.org_id, 'effect', 'allow',
         'enabled', CAST('true' AS JSON), 'capabilities', JSON_ARRAY('audit.verification.verify'),
         'subjects', JSON_ARRAY(JSON_OBJECT('kind', 'assignments', 'ids',
           IFNULL(a.ids, JSON_ARRAY(CONCAT('compat-verifier-', LEFT(c.rule_id, 48)))))),
         'scopes', JSON_ARRAY(JSON_OBJECT('kind', 'organization')), 'fields', NULL,
         'startsAt', NULL, 'endsAt', NULL),
       JSON_OBJECT('id', c.id, 'granteeHrId', c.grantee_hr_id, 'grantedBy', c.granted_by, 'createdAt', c.created_at)
FROM candidates c LEFT JOIN existing_assignments a ON a.rule_id=c.rule_id
WHERE NOT EXISTS (SELECT 1 FROM authorization_rules r WHERE r.org_id=c.org_id
        AND r.source_kind='legacy_verification' AND r.source_ref=c.id)
  AND NOT EXISTS (SELECT 1 FROM authorization_changes ac WHERE ac.org_id=c.org_id AND ac.target_id=c.rule_id
        AND ac.action='verification_grant_migration');

INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
SELECT role_id, org_id, member_name, JSON_ARRAY('audit.verification.verify'), 1 FROM authorization_legacy_verifier_backfill;

INSERT INTO authorization_scheme_versions (id, org_id, scheme_id, version, capabilities_json, actor_context_id)
SELECT role_id, org_id, role_id, 1, JSON_ARRAY('audit.verification.verify'), 'migration:20261124123000'
FROM authorization_legacy_verifier_backfill;

INSERT INTO authorization_rules (id, org_id, name, policy_json, scheme_id, source_kind, source_ref)
SELECT rule_id, org_id, member_name, policy, role_id, 'legacy_verification', legacy_id
FROM authorization_legacy_verifier_backfill;

INSERT INTO authorization_changes (id, org_id, actor_context_id, action, target_id, before_json, after_json)
SELECT UUID(), org_id, 'migration:20261124123000', 'verification_grant_migration', rule_id, source, policy
FROM authorization_legacy_verifier_backfill;

COMMIT;
DROP TEMPORARY TABLE authorization_legacy_verifier_backfill;
