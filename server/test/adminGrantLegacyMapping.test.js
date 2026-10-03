'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-grant-legacy-mapping-test-secret';
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'admin-grant-legacy-mapping-identity-secret';
process.env.DB_USER = process.env.DB_USER || 'test-user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-password';
process.env.DB_NAME = process.env.DB_NAME || 'test-db';
const identityModel = require('../src/core/models/unifiedIdentity');

// 小程序新建管理员时先写兼容行 admin_info，再同步授权行。若该自然人在同一组织
// 已有授权，插入会撞 (person_id, org_id) 唯一键走 ON DUPLICATE KEY UPDATE，
// 旧实现没有回写 legacy_admin_id，导致新建的兼容行永远没有映射，下一次重启被
// 启动期数据完整性校验拦住（曾造成全站停服）。这里锁住修复后的行为。
async function run() {
  const executed = [];
  const connection = {
    query: async (sql, params) => {
      executed.push({ sql, params });
      if (/FROM admin_info\s+WHERE id = \?/.test(sql)) {
        return [[{ id: 'legacy-new', student_id: '2024302101020', name: '侯天召', org_id: '', admin_level: 'super_admin' }]];
      }
      if (/FROM persons p/.test(sql)) return [[{ id: 'person-1' }]];
      if (/FROM admin_grants WHERE legacy_admin_id/.test(sql)) return [[]];
      if (/FROM accounts a/.test(sql)) return [[]];
      return [{ affectedRows: 1 }];
    }
  };

  const adminId = 'legacy-59798af443084d4ee26a82f2a216e7dc6df10164608bec8261f0db4a4425ddf7';
  const result = await identityModel.syncLegacyAdminGrant(connection, adminId);

  const upsert = executed.find((item) => /INSERT INTO admin_grants/.test(item.sql));
  assert(upsert, '同步兼容行时必须写入授权行');
  assert(/ON DUPLICATE KEY UPDATE[\s\S]*?legacy_admin_id = VALUES\(legacy_admin_id\)/.test(upsert.sql),
    '授权行撞 (person_id, org_id) 唯一键时必须同步回写 legacy_admin_id，否则兼容行会永远没有映射');
  assert.strictEqual(upsert.params[4], 'legacy-new',
    '授权行必须指向本次新建的兼容行主键（而不是保留旧的派生主键）');
  assert.ok(result, '同步应返回成功结果');

  const contractSource = fs.readFileSync(path.join(ROOT, 'src/utils/schemaContract.js'), 'utf8');
  assert(/SET grant_row\.legacy_admin_id = legacy_row\.id/.test(contractSource),
    '启动校验必须就地补齐兼容行映射');
  const throwBlock = contractSource.match(/if \(Number\(identityIntegrity\.verified_accounts_without_login_method\)[\s\S]*?throw error;/);
  assert(throwBlock && !/unmapped_admin_records/.test(throwBlock[0]),
    '兼容行缺少映射属于展示层一致性问题，不能作为拒绝启动的条件（否则一条数据行会让全站停服）');

  const migrationName = fs.readdirSync(path.join(ROOT, 'db/deploy'))
    .filter((name) => /_admin_grant_legacy_link\.sql$/.test(name));
  assert.strictEqual(migrationName.length, 1, '必须存在且只存在一个兼容行映射修复迁移');
  const migrationSql = fs.readFileSync(path.join(ROOT, 'db/deploy', migrationName[0]), 'utf8');
  assert(/UPDATE admin_info legacy_row/.test(migrationSql)
    && /JOIN admin_grants grant_row/.test(migrationSql)
    && /SET grant_row\.legacy_admin_id = legacy_row\.id/.test(migrationSql)
    && /WHERE linked\.id IS NULL/.test(migrationSql),
  '迁移必须为没有映射的兼容行补齐授权行映射，且只处理未配对的记录');

  console.log('兼容管理员行与授权行映射修复测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
