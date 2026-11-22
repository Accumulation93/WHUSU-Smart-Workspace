-- 只修复从未发布、未被规则引用、移除特殊权限后仍有权限的旧草稿。保留原稿供审计。
START TRANSACTION;

SELECT org_id FROM authorization_organizations
 WHERE mode = 'enforced' AND EXISTS (
   SELECT 1 FROM authorization_schemes AS scheme
    WHERE scheme.org_id = authorization_organizations.org_id AND scheme.published_version = 0
 )
 ORDER BY org_id FOR UPDATE;

INSERT INTO authorization_changes (id, org_id, actor_context_id, action, target_id, before_json, after_json)
WITH RECURSIVE special_permissions AS (
  SELECT CAST('["system.superAdministrators.create","system.superAdministrators.delete","system.adminAccounts.create","system.adminAccounts.update","system.adminAccounts.delete","system.organizations.create","system.organizations.delete","system.settings.update","auth.policy.update","system.keys.manage","auth.globalAudit.read","auth.persons.merge","auth.persons.delete"]' AS JSON) AS capabilities
), drafts AS (
  SELECT scheme.id, scheme.org_id, scheme.version, scheme.draft_capabilities_json
    FROM authorization_schemes AS scheme
    JOIN authorization_organizations AS flags ON flags.org_id = scheme.org_id AND flags.mode = 'enforced'
   WHERE scheme.published_version = 0 AND JSON_TYPE(scheme.draft_capabilities_json) = 'ARRAY'
     AND NOT EXISTS (SELECT 1 FROM authorization_scheme_versions AS history WHERE history.org_id = scheme.org_id AND history.scheme_id = scheme.id)
     AND NOT EXISTS (SELECT 1 FROM authorization_rules AS rule_row WHERE rule_row.org_id = scheme.org_id AND rule_row.scheme_id = scheme.id)
     AND JSON_OVERLAPS(scheme.draft_capabilities_json, (SELECT capabilities FROM special_permissions))
), repaired AS (
  SELECT id, draft_capabilities_json AS capabilities, CAST(JSON_LENGTH(draft_capabilities_json) AS SIGNED) AS offset_from_start
    FROM drafts
  UNION ALL
  SELECT repaired.id,
         CAST(CASE WHEN JSON_CONTAINS(special_permissions.capabilities,
           JSON_EXTRACT(repaired.capabilities, CONCAT('$[', repaired.offset_from_start - 1, ']')))
           THEN JSON_REMOVE(repaired.capabilities, CONCAT('$[', repaired.offset_from_start - 1, ']'))
           ELSE repaired.capabilities END AS JSON),
         repaired.offset_from_start - 1
    FROM repaired CROSS JOIN special_permissions
   WHERE repaired.offset_from_start > 0
)
SELECT UUID(), draft.org_id, 'migration:20261122222000', 'scheme_draft_repair', draft.id,
       JSON_OBJECT('version', draft.version, 'capabilities', draft.draft_capabilities_json),
       JSON_OBJECT('version', draft.version + 1, 'capabilities', repaired.capabilities)
  FROM drafts AS draft JOIN repaired ON repaired.id = draft.id
 WHERE repaired.offset_from_start = 0 AND JSON_LENGTH(repaired.capabilities) > 0;

UPDATE authorization_schemes AS scheme
JOIN authorization_changes AS change_row ON change_row.org_id = scheme.org_id AND change_row.target_id = scheme.id
   AND change_row.action = 'scheme_draft_repair' AND change_row.actor_context_id = 'migration:20261122222000'
   AND JSON_EXTRACT(change_row.before_json, '$.version') = scheme.version
   AND JSON_EXTRACT(change_row.before_json, '$.capabilities') = scheme.draft_capabilities_json
SET scheme.draft_capabilities_json = JSON_EXTRACT(change_row.after_json, '$.capabilities'),
    scheme.version = scheme.version + 1
WHERE scheme.published_version = 0;

COMMIT;
