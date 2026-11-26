'use strict';

// 仅供历史迁移测试重建旧版两级管理员库；现行 init.sql 只允许超级管理员。
async function allowLegacyAdminFixture(connection) {
  await connection.query(`ALTER TABLE admin_info DROP CHECK chk_admin_level_two_tier,
    ADD CONSTRAINT chk_admin_level_two_tier CHECK (admin_level IN ('super_admin','admin')),
    ALTER COLUMN admin_level SET DEFAULT 'admin'`);
  await connection.query(`ALTER TABLE admin_grants DROP CHECK chk_admin_grant_level,
    ADD CONSTRAINT chk_admin_grant_level CHECK (admin_level IN ('super_admin','admin')),
    ALTER COLUMN admin_level SET DEFAULT 'admin'`);
}

module.exports = { allowLegacyAdminFixture };
