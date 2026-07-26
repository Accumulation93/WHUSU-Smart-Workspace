-- 将第四十三届学生会已配置的樱顶大会议室审批流程恢复到第四十四届学生会。
-- 场地资源为全局数据，但审批主体按组织隔离，因此不能直接复制旧组织 ID；
-- 本迁移按部门、工作分工和身份的稳定名称映射到第四十四届对应记录。
-- 若第四十四届已经存在流程则不覆盖，重复执行也不会产生重复数据。

START TRANSACTION;

SET @source_org_id = (
  SELECT CAST(id AS BINARY) FROM organizations
   WHERE name = '武汉大学第四十三届学生会'
   LIMIT 1
);
SET @target_org_id = (
  SELECT CAST(id AS BINARY) FROM organizations
   WHERE name = '武汉大学第四十四届学生会'
   LIMIT 1
);
SET @venue_id = (
  SELECT CAST(id AS BINARY) FROM venues
   WHERE name = '樱顶大会议室'
   LIMIT 1
);
SET @source_flow_id = (
  SELECT CAST(id AS BINARY) FROM venue_approval_flows
   WHERE org_id = @source_org_id
     AND venue_id = @venue_id
     AND is_active = 1
   LIMIT 1
);
SET @existing_target_flow_id = (
  SELECT CAST(id AS BINARY) FROM venue_approval_flows
   WHERE org_id = @target_org_id
     AND venue_id = @venue_id
   LIMIT 1
);
SET @target_flow_id = CAST(COALESCE(
  @existing_target_flow_id,
  SHA2(CONCAT('venue-flow:', @target_org_id, ':', @venue_id), 256)
) AS BINARY);

CREATE TEMPORARY TABLE _venue_flow_migration_assertions (
  label VARCHAR(80) NOT NULL PRIMARY KEY,
  ok TINYINT NOT NULL,
  CHECK (ok = 1)
) ENGINE=InnoDB;

INSERT INTO _venue_flow_migration_assertions (label, ok) VALUES
  ('source organization exists', @source_org_id IS NOT NULL),
  ('target organization exists', @target_org_id IS NOT NULL),
  ('venue exists', @venue_id IS NOT NULL),
  ('source approval flow exists', @source_flow_id IS NOT NULL);

INSERT IGNORE INTO venue_approval_flows
  (id, venue_id, name, org_id, is_active)
SELECT
  @target_flow_id,
  source.venue_id,
  source.name,
  @target_org_id,
  source.is_active
FROM venue_approval_flows source
WHERE source.id = @source_flow_id
  AND @existing_target_flow_id IS NULL;

INSERT IGNORE INTO venue_approval_flow_steps
  (id, flow_id, sort_order, name, approval_mode, org_id)
SELECT
  SHA2(CONCAT('venue-flow-step:', @target_org_id, ':', source.id), 256),
  @target_flow_id,
  source.sort_order,
  source.name,
  source.approval_mode,
  @target_org_id
FROM venue_approval_flow_steps source
WHERE source.flow_id = @source_flow_id
  AND source.org_id = @source_org_id
  AND @existing_target_flow_id IS NULL;

INSERT IGNORE INTO venue_approval_flow_step_rules
  (id, step_id, sort_order,
   department_scope, specific_department_id,
   work_group_scope, specific_work_group_id,
   identity_scope, specific_identity_id,
   org_id)
SELECT
  SHA2(CONCAT('venue-flow-rule:', @target_org_id, ':', source.id), 256),
  SHA2(CONCAT('venue-flow-step:', @target_org_id, ':', source_step.id), 256),
  source.sort_order,
  source.department_scope,
  CASE WHEN source.department_scope = 'specific' THEN department_map.mapped_ids ELSE NULL END,
  source.work_group_scope,
  CASE WHEN source.work_group_scope = 'specific' THEN work_group_map.mapped_ids ELSE NULL END,
  source.identity_scope,
  CASE WHEN source.identity_scope = 'specific' THEN identity_map.mapped_ids ELSE NULL END,
  @target_org_id
FROM venue_approval_flow_step_rules source
JOIN venue_approval_flow_steps source_step
  ON source_step.id = source.step_id
 AND source_step.flow_id = @source_flow_id
 AND source_step.org_id = @source_org_id
LEFT JOIN (
  SELECT
    rule.id AS rule_id,
    GROUP_CONCAT(target_department.id
      ORDER BY FIND_IN_SET(source_department.id, rule.specific_department_id)
      SEPARATOR ',') AS mapped_ids
  FROM venue_approval_flow_step_rules rule
  JOIN departments source_department
    ON source_department.org_id = @source_org_id
   AND FIND_IN_SET(source_department.id, rule.specific_department_id) > 0
  JOIN departments target_department
    ON target_department.org_id = @target_org_id
   AND target_department.name = source_department.name
  WHERE rule.org_id = @source_org_id
    AND rule.department_scope = 'specific'
  GROUP BY rule.id
) department_map ON department_map.rule_id = source.id
LEFT JOIN (
  SELECT
    rule.id AS rule_id,
    GROUP_CONCAT(target_work_group.id
      ORDER BY FIND_IN_SET(source_work_group.id, rule.specific_work_group_id)
      SEPARATOR ',') AS mapped_ids
  FROM venue_approval_flow_step_rules rule
  JOIN work_groups source_work_group
    ON source_work_group.org_id = @source_org_id
   AND FIND_IN_SET(source_work_group.id, rule.specific_work_group_id) > 0
  JOIN departments source_department
    ON source_department.id = source_work_group.department_id
   AND source_department.org_id = @source_org_id
  JOIN departments target_department
    ON target_department.org_id = @target_org_id
   AND target_department.name = source_department.name
  JOIN work_groups target_work_group
    ON target_work_group.org_id = @target_org_id
   AND target_work_group.department_id = target_department.id
   AND target_work_group.name = source_work_group.name
  WHERE rule.org_id = @source_org_id
    AND rule.work_group_scope = 'specific'
  GROUP BY rule.id
) work_group_map ON work_group_map.rule_id = source.id
LEFT JOIN (
  SELECT
    rule.id AS rule_id,
    GROUP_CONCAT(target_identity.id
      ORDER BY FIND_IN_SET(source_identity.id, rule.specific_identity_id)
      SEPARATOR ',') AS mapped_ids
  FROM venue_approval_flow_step_rules rule
  JOIN identities source_identity
    ON source_identity.org_id = @source_org_id
   AND FIND_IN_SET(source_identity.id, rule.specific_identity_id) > 0
  JOIN identities target_identity
    ON target_identity.org_id = @target_org_id
   AND target_identity.name = source_identity.name
  WHERE rule.org_id = @source_org_id
    AND rule.identity_scope = 'specific'
  GROUP BY rule.id
) identity_map ON identity_map.rule_id = source.id
WHERE source.org_id = @source_org_id
  AND @existing_target_flow_id IS NULL;

INSERT INTO _venue_flow_migration_assertions (label, ok)
SELECT
  'target flow exists',
  EXISTS (
    SELECT 1 FROM venue_approval_flows
     WHERE id = @target_flow_id
       AND venue_id = @venue_id
       AND org_id = @target_org_id
       AND is_active = 1
  );

INSERT INTO _venue_flow_migration_assertions (label, ok)
SELECT
  'all steps copied',
  @existing_target_flow_id IS NOT NULL
  OR
  (SELECT COUNT(*) FROM venue_approval_flow_steps
    WHERE flow_id = @target_flow_id AND org_id = @target_org_id)
  =
  (SELECT COUNT(*) FROM venue_approval_flow_steps
    WHERE flow_id = @source_flow_id AND org_id = @source_org_id);

INSERT INTO _venue_flow_migration_assertions (label, ok)
SELECT
  'all rules copied',
  @existing_target_flow_id IS NOT NULL
  OR
  (SELECT COUNT(*) FROM venue_approval_flow_step_rules
    WHERE org_id = @target_org_id
      AND step_id IN (
        SELECT id FROM venue_approval_flow_steps
         WHERE flow_id = @target_flow_id AND org_id = @target_org_id
      ))
  =
  (SELECT COUNT(*) FROM venue_approval_flow_step_rules
    WHERE org_id = @source_org_id
      AND step_id IN (
        SELECT id FROM venue_approval_flow_steps
         WHERE flow_id = @source_flow_id AND org_id = @source_org_id
      ));

INSERT INTO _venue_flow_migration_assertions (label, ok)
SELECT
  'specific scopes retain at least one mapped subject',
  @existing_target_flow_id IS NOT NULL
  OR NOT EXISTS (
    SELECT 1
      FROM venue_approval_flow_step_rules rule_row
      JOIN venue_approval_flow_steps step_row ON step_row.id = rule_row.step_id
     WHERE step_row.flow_id = @target_flow_id
       AND rule_row.org_id = @target_org_id
       AND (
         (rule_row.department_scope = 'specific' AND COALESCE(rule_row.specific_department_id, '') = '')
         OR (rule_row.work_group_scope = 'specific' AND COALESCE(rule_row.specific_work_group_id, '') = '')
         OR (rule_row.identity_scope = 'specific' AND COALESCE(rule_row.specific_identity_id, '') = '')
       )
  );

DROP TEMPORARY TABLE _venue_flow_migration_assertions;
COMMIT;
