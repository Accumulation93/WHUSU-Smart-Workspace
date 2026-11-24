-- 原角色及发布版本保留供历史查询。只合并职责和历史能力一致的角色，不更改分配范围。
CREATE TABLE IF NOT EXISTS authorization_role_merges (
  org_id VARCHAR(64) NOT NULL,
  old_role_id VARCHAR(64) NOT NULL,
  retained_role_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (org_id, old_role_id),
  CONSTRAINT chk_authorization_role_merge CHECK (old_role_id <> retained_role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TEMPORARY TABLE IF NOT EXISTS authorization_role_merge_candidates (
  org_id VARCHAR(64) NOT NULL,
  old_role_id VARCHAR(64) NOT NULL,
  retained_role_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (org_id, old_role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TEMPORARY TABLE IF NOT EXISTS authorization_role_rename_candidates (
  org_id VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  previous_name VARCHAR(80) NOT NULL,
  distinct_name VARCHAR(80) NOT NULL,
  PRIMARY KEY (org_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;
SELECT org_id FROM authorization_organizations ORDER BY org_id FOR UPDATE;

INSERT INTO authorization_role_merge_candidates (org_id, old_role_id, retained_role_id)
WITH eligible AS (
  SELECT s.org_id, s.id, s.name, s.draft_capabilities_json, s.published_version, live.capabilities_json
  FROM authorization_schemes s
  JOIN authorization_scheme_versions live
    ON live.org_id = s.org_id AND live.scheme_id = s.id AND live.version = s.published_version
  WHERE NOT EXISTS (SELECT 1 FROM authorization_role_merges m WHERE m.org_id = s.org_id AND m.old_role_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM authorization_rules r WHERE r.org_id = s.org_id AND r.scheme_id = s.id
      AND (r.source_kind = 'legacy_verification'
        OR NOT COALESCE(JSON_CONTAINS(r.policy_json, live.capabilities_json, '$.capabilities')
          AND JSON_CONTAINS(live.capabilities_json, JSON_EXTRACT(r.policy_json, '$.capabilities')), FALSE)))
    AND NOT EXISTS (SELECT 1 FROM authorization_rules r WHERE r.org_id = s.org_id
      AND JSON_SEARCH(r.policy_json, 'one', s.id, NULL, '$.scopes[*].ids[*]') IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM authorization_delegations d WHERE d.org_id = s.org_id
      AND JSON_SEARCH(d.envelope_json, 'one', s.id, NULL, '$.scopes[*].ids[*]') IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM organization_config_shares c
      WHERE c.source_org_id = s.org_id AND c.kind = 'authorization.schemes' AND c.source_record_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM organization_config_copy_drafts c
      WHERE c.org_id = s.org_id AND c.kind = 'authorization.schemes' AND c.result_id = s.id)
), equivalent AS (
  SELECT old.org_id, old.id AS old_role_id, MIN(keep.id) AS retained_role_id
  FROM eligible old JOIN eligible keep
    ON keep.org_id = old.org_id AND keep.name = old.name AND keep.id < old.id
    AND keep.published_version = old.published_version
    AND JSON_CONTAINS(keep.capabilities_json, old.capabilities_json)
    AND JSON_CONTAINS(old.capabilities_json, keep.capabilities_json)
    AND JSON_CONTAINS(keep.draft_capabilities_json, old.draft_capabilities_json)
    AND JSON_CONTAINS(old.draft_capabilities_json, keep.draft_capabilities_json)
  WHERE NOT EXISTS (
    SELECT 1 FROM authorization_scheme_versions a
    LEFT JOIN authorization_scheme_versions b ON b.org_id = keep.org_id AND b.scheme_id = keep.id AND b.version = a.version
    WHERE a.org_id = old.org_id AND a.scheme_id = old.id
      AND (b.id IS NULL OR NOT JSON_CONTAINS(a.capabilities_json, b.capabilities_json)
        OR NOT JSON_CONTAINS(b.capabilities_json, a.capabilities_json))
  ) AND NOT EXISTS (
    SELECT 1 FROM authorization_scheme_versions b
    LEFT JOIN authorization_scheme_versions a ON a.org_id = old.org_id AND a.scheme_id = old.id AND a.version = b.version
    WHERE b.org_id = keep.org_id AND b.scheme_id = keep.id AND a.id IS NULL
  )
  GROUP BY old.org_id, old.id
)
SELECT org_id, old_role_id, retained_role_id FROM equivalent;

INSERT INTO authorization_role_merges (org_id, old_role_id, retained_role_id)
SELECT org_id, old_role_id, retained_role_id FROM authorization_role_merge_candidates;

INSERT INTO authorization_changes (id, org_id, actor_context_id, action, target_id, before_json, after_json)
SELECT UUID(), org_id, 'migration:20261124130000', 'scheme_merge', old_role_id,
  JSON_OBJECT('schemeId', old_role_id), JSON_OBJECT('schemeId', retained_role_id)
FROM authorization_role_merge_candidates;

UPDATE authorization_rules r
JOIN authorization_role_merge_candidates m ON m.org_id = r.org_id AND m.old_role_id = r.scheme_id
SET r.scheme_id = m.retained_role_id, r.updated_at = r.updated_at;

-- 有差异的权限角色仍然独立。仅从能够核实的差异能力提取职责，名称冲突时追加编号。
INSERT INTO authorization_role_rename_candidates (org_id, id, previous_name, distinct_name)
WITH roles AS (
  SELECT s.org_id, s.id, s.name, COALESCE(live.capabilities_json, s.draft_capabilities_json) AS capabilities_json,
    COUNT(*) OVER (PARTITION BY s.org_id, s.name) AS same_name,
    COUNT(*) OVER (PARTITION BY s.org_id) AS org_size,
    ROW_NUMBER() OVER (PARTITION BY s.org_id ORDER BY s.name, s.id) AS ordinal
  FROM authorization_schemes s
  LEFT JOIN authorization_scheme_versions live
    ON live.org_id = s.org_id AND live.scheme_id = s.id AND live.version = s.published_version
  WHERE NOT EXISTS (SELECT 1 FROM authorization_role_merges m WHERE m.org_id = s.org_id AND m.old_role_id = s.id)
), duties AS (
  SELECT 1 AS preference, 'scoring.publications.create' AS capability, '新增考核公示' AS duty
  UNION ALL SELECT 2, 'scoring.results.revoke', '撤销已提交评分'
  UNION ALL SELECT 3, 'scoring.results.export', '导出评分结果'
  UNION ALL SELECT 4, 'scoring.results.read', '查看评分结果'
  UNION ALL SELECT 5, 'scoring.tasks.read', '查看评分任务'
  UNION ALL SELECT 6, 'audit.verification.verify', '文件验签'
  UNION ALL SELECT 7, 'hr.people.update', '修改成员资料'
  UNION ALL SELECT 8, 'hr.people.read', '查看成员资料'
  UNION ALL SELECT 9, 'hr.profileTemplates.update', '配置补充资料模板'
), preferences AS (
  SELECT r.*, (SELECT d.duty FROM duties d
    WHERE JSON_CONTAINS(r.capabilities_json, JSON_QUOTE(d.capability))
      AND EXISTS (SELECT 1 FROM roles other WHERE other.org_id = r.org_id AND other.name = r.name AND other.id <> r.id
        AND NOT JSON_CONTAINS(other.capabilities_json, JSON_QUOTE(d.capability)))
    ORDER BY d.preference LIMIT 1) AS duty
  FROM roles r WHERE r.same_name > 1
), names AS (
  SELECT p.*, CASE WHEN p.duty IS NULL THEN p.name
    ELSE CONCAT(LEFT(p.name, 78 - CHAR_LENGTH(p.duty)), '（', p.duty, '）') END COLLATE utf8mb4_unicode_ci AS qualified_name
  FROM preferences p
), primary_names AS (
  SELECT n.*, COUNT(*) OVER (PARTITION BY n.org_id, n.qualified_name) AS qualified_count
  FROM names n
), variants AS (
  SELECT n.org_id, n.id, n.name, n.qualified_name AS candidate, 0 AS preference
  FROM primary_names n WHERE n.duty IS NOT NULL AND n.qualified_count = 1
  UNION ALL
  SELECT n.org_id, n.id, n.name, CONCAT(LEFT(n.qualified_name, 80 - CHAR_LENGTH(s.suffix)), s.suffix), s.preference
  FROM primary_names n JOIN (
    SELECT n.org_id, n.id, r.ordinal AS preference, CONCAT('（', n.ordinal + 1 + (r.ordinal - 1) * n.org_size, '）') AS suffix
    FROM primary_names n JOIN roles r ON r.org_id = n.org_id
  ) s ON s.org_id = n.org_id AND s.id = n.id
), available AS (
  SELECT v.*, ROW_NUMBER() OVER (PARTITION BY v.org_id, v.id ORDER BY v.preference) AS chosen
  FROM variants v WHERE NOT EXISTS (SELECT 1 FROM roles r
    WHERE r.org_id = v.org_id AND r.name = v.candidate COLLATE utf8mb4_unicode_ci)
)
SELECT org_id, id, name, candidate FROM available WHERE chosen = 1;

INSERT INTO authorization_changes (id, org_id, actor_context_id, action, target_id, before_json, after_json)
SELECT UUID(), org_id, 'migration:20261124130000', 'scheme_rename', id,
  JSON_OBJECT('name', previous_name), JSON_OBJECT('name', distinct_name)
FROM authorization_role_rename_candidates;

UPDATE authorization_schemes s
JOIN authorization_role_rename_candidates n ON n.org_id = s.org_id AND n.id = s.id
SET s.name = n.distinct_name, s.version = s.version + 1;

COMMIT;
DROP TEMPORARY TABLE authorization_role_merge_candidates;
DROP TEMPORARY TABLE authorization_role_rename_candidates;
