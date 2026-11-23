-- 历史授权转换只补充角色引用，不更新授权的判定数据、期限、来源或业务版本。
CREATE TEMPORARY TABLE IF NOT EXISTS authorization_role_backfill_rows (
  rule_id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  role_id VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;

-- 与授权编辑事务使用同一组织锁。尚在旧权限对照阶段的组织在切换事务中转换。
SELECT org_id FROM authorization_organizations WHERE mode = 'enforced' ORDER BY org_id FOR UPDATE;

INSERT INTO authorization_role_backfill_rows (rule_id, org_id, role_id)
SELECT r.id, r.org_id, CONCAT('compat-rule-', LEFT(SHA2(CONCAT(r.org_id, ':', r.id), 256), 48))
FROM authorization_rules r JOIN authorization_organizations o ON o.org_id = r.org_id AND o.mode = 'enforced'
WHERE r.scheme_id IS NULL;

INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
SELECT b.role_id, r.org_id, r.name, JSON_EXTRACT(r.policy_json, '$.capabilities'), 1
FROM authorization_role_backfill_rows b JOIN authorization_rules r ON r.org_id = b.org_id AND r.id = b.rule_id
ON DUPLICATE KEY UPDATE id = authorization_schemes.id;

INSERT INTO authorization_scheme_versions (id, org_id, scheme_id, version, capabilities_json, actor_context_id)
SELECT s.id, s.org_id, s.id, 1, JSON_EXTRACT(r.policy_json, '$.capabilities'), 'migration:20261123120000'
FROM authorization_role_backfill_rows b JOIN authorization_rules r ON r.org_id = b.org_id AND r.id = b.rule_id
JOIN authorization_schemes s ON s.org_id = b.org_id AND s.id = b.role_id
ON DUPLICATE KEY UPDATE id = authorization_scheme_versions.id;

UPDATE authorization_rules r
JOIN authorization_role_backfill_rows b ON b.org_id = r.org_id AND b.rule_id = r.id
JOIN authorization_schemes s ON s.org_id = b.org_id AND s.id = b.role_id
JOIN authorization_scheme_versions v ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version
SET r.scheme_id = s.id, r.updated_at = r.updated_at
WHERE r.scheme_id IS NULL AND v.capabilities_json = JSON_EXTRACT(r.policy_json, '$.capabilities');

COMMIT;
DROP TEMPORARY TABLE authorization_role_backfill_rows;
