-- 为旧名单的现有岗位建立统一授权。旧行只用于旧客户端查询及回退，在首次修改统一规则时解除关联。
CREATE TEMPORARY TABLE IF NOT EXISTS authorization_verification_migration_orgs (
  org_id VARCHAR(64) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;

SELECT org_id FROM authorization_organizations
 WHERE mode = 'enforced' AND EXISTS (
   SELECT 1 FROM audit_verification_permissions AS permission
    WHERE permission.org_id = authorization_organizations.org_id
 )
 ORDER BY org_id FOR UPDATE;

-- 写入规则的触发器会更新组织版本，写入语句从临时表读取组织。
INSERT INTO authorization_verification_migration_orgs (org_id)
SELECT org_id FROM authorization_organizations WHERE mode = 'enforced';

INSERT INTO authorization_rules (id, org_id, name, policy_json, source_kind, source_ref)
WITH targets AS (
  SELECT SHA2(CONCAT('legacy-verification:', permission.org_id, ':', permission.id), 256) AS rule_id,
         permission.id AS legacy_id, permission.org_id, member.name,
         JSON_ARRAYAGG(assignment.id) AS assignment_ids
    FROM audit_verification_permissions AS permission
    JOIN authorization_verification_migration_orgs AS settings ON settings.org_id = permission.org_id
    JOIN hr_info AS member ON member.id = permission.grantee_hr_id AND member.org_id = permission.org_id
    JOIN organization_memberships AS membership ON membership.org_id = permission.org_id
       AND membership.legacy_hr_id = member.id AND membership.status = 'active'
    JOIN membership_assignments AS assignment ON assignment.membership_id = membership.id
       AND assignment.org_id = membership.org_id AND assignment.status = 'active'
   GROUP BY permission.org_id, permission.id, member.name
)
SELECT targets.rule_id, targets.org_id, LEFT(TRIM(targets.name), 80),
       JSON_OBJECT('id', targets.rule_id, 'organizationId', targets.org_id, 'effect', 'allow',
         'enabled', CAST('true' AS JSON), 'capabilities', JSON_ARRAY('audit.verification.verify'),
         'subjects', JSON_ARRAY(JSON_OBJECT('kind', 'assignments', 'ids', targets.assignment_ids)),
         'scopes', JSON_ARRAY(JSON_OBJECT('kind', 'organization')), 'fields', NULL,
         'startsAt', NULL, 'endsAt', NULL),
       'legacy_verification', targets.legacy_id
  FROM targets
 WHERE NOT EXISTS (SELECT 1 FROM authorization_rules AS rule_row
    WHERE rule_row.org_id = targets.org_id AND rule_row.source_kind = 'legacy_verification' AND rule_row.source_ref = targets.legacy_id)
   AND NOT EXISTS (SELECT 1 FROM authorization_changes AS change_row
    WHERE change_row.org_id = targets.org_id AND change_row.target_id = targets.rule_id COLLATE utf8mb4_unicode_ci
      AND change_row.action = 'verification_grant_migration');

INSERT INTO authorization_changes (id, org_id, actor_context_id, action, target_id, before_json, after_json)
SELECT UUID(), rule_row.org_id, 'migration:20261123090000', 'verification_grant_migration', rule_row.id,
       JSON_OBJECT('id', permission.id, 'granteeHrId', permission.grantee_hr_id,
         'grantedBy', permission.granted_by, 'createdAt', permission.created_at), rule_row.policy_json
  FROM authorization_rules AS rule_row
  JOIN audit_verification_permissions AS permission ON permission.org_id = rule_row.org_id AND permission.id = rule_row.source_ref
 WHERE rule_row.source_kind = 'legacy_verification'
   AND NOT EXISTS (SELECT 1 FROM authorization_changes AS change_row
    WHERE change_row.org_id = rule_row.org_id AND change_row.target_id = rule_row.id
      AND change_row.action = 'verification_grant_migration');

COMMIT;
DROP TEMPORARY TABLE authorization_verification_migration_orgs;
