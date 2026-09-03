-- 有效管理员授权是统一身份体系的事实来源；权限覆盖表仍以 legacy_admin_id
-- 关联 admin_info。本迁移为缺失的兼容行恢复索引，避免已授权管理员在权限页消失。

-- 优先复用同组织、同学号的既有兼容行，避免重复管理员记录。
UPDATE admin_grants grant_row
JOIN persons person_row
  ON person_row.id = grant_row.person_id
 AND person_row.status = 'active'
JOIN admin_info candidate
  ON candidate.org_id = grant_row.org_id
 AND candidate.student_id = person_row.student_id
LEFT JOIN admin_info linked
  ON linked.id = grant_row.legacy_admin_id
SET grant_row.legacy_admin_id = candidate.id,
    grant_row.updated_at = grant_row.updated_at
WHERE grant_row.status = 'active'
  AND person_row.student_id IS NOT NULL
  AND person_row.student_id <> ''
  AND linked.id IS NULL;

-- 没有历史主键的授权使用稳定派生主键，重复执行不会产生新行。
UPDATE admin_grants grant_row
LEFT JOIN admin_info linked
  ON linked.id = grant_row.legacy_admin_id
SET grant_row.legacy_admin_id = COALESCE(
      NULLIF(grant_row.legacy_admin_id, ''),
      SHA2(CONCAT('admin-grant-compat:', grant_row.id), 256)
    ),
    grant_row.updated_at = grant_row.updated_at
WHERE grant_row.status = 'active'
  AND linked.id IS NULL;

INSERT INTO admin_info (
  id,
  name,
  student_id,
  admin_level,
  bind_status,
  org_id,
  updated_at
)
SELECT
  grant_row.legacy_admin_id,
  person_row.name,
  NULLIF(person_row.student_id, ''),
  grant_row.admin_level,
  'invited',
  grant_row.org_id,
  UTC_TIMESTAMP()
FROM admin_grants grant_row
JOIN persons person_row
  ON person_row.id = grant_row.person_id
 AND person_row.status = 'active'
LEFT JOIN admin_info linked
  ON linked.id = grant_row.legacy_admin_id
WHERE grant_row.status = 'active'
  AND grant_row.legacy_admin_id IS NOT NULL
  AND grant_row.legacy_admin_id <> ''
  AND linked.id IS NULL;

-- 兼容行只承载旧权限覆盖和旧接口索引，字段值必须跟随有效授权与自然人事实。
UPDATE admin_info admin_row
JOIN admin_grants grant_row
  ON grant_row.legacy_admin_id = admin_row.id
 AND grant_row.status = 'active'
JOIN persons person_row
  ON person_row.id = grant_row.person_id
 AND person_row.status = 'active'
SET admin_row.name = person_row.name,
    admin_row.student_id = NULLIF(person_row.student_id, ''),
    admin_row.admin_level = grant_row.admin_level,
    admin_row.org_id = grant_row.org_id,
    admin_row.updated_at = admin_row.updated_at;
