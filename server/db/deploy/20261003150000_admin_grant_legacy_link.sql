-- 修复“兼容管理员行没有授权映射”的历史数据。
--
-- 成因：小程序新建管理员时先写入兼容行 admin_info，再调 syncLegacyAdminGrant；
-- 当该自然人在同一组织已有授权行时，授权插入会撞 (person_id, org_id) 唯一键，
-- 旧的 upsert 没有回写 legacy_admin_id，于是新建的兼容行永远没有映射，
-- 下一次重启会被启动期数据完整性校验拦住。
--
-- 应用层已修正 upsert（现有授权会同步指向最新兼容行），本迁移负责把存量中仍然
-- 可配对的兼容行补齐映射。可安全重试：只为没有映射的兼容行补写，已配对的跳过。

UPDATE admin_info legacy_row
  JOIN persons p
    ON p.normalized_student_id = LOWER(TRIM(legacy_row.student_id))
   AND p.name = TRIM(legacy_row.name)
   AND p.status = 'active'
  JOIN admin_grants grant_row
    ON grant_row.person_id = p.id
   AND grant_row.org_id = legacy_row.org_id
   AND grant_row.admin_level = legacy_row.admin_level
   AND grant_row.status = 'active'
  LEFT JOIN admin_info linked ON linked.id = grant_row.legacy_admin_id
   SET grant_row.legacy_admin_id = legacy_row.id,
       grant_row.updated_at = NOW()
 WHERE linked.id IS NULL
   AND legacy_row.student_id IS NOT NULL
   AND legacy_row.student_id <> '';
