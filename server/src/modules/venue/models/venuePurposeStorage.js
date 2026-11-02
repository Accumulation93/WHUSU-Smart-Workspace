'use strict';

const pool = require('../../../config/db');
const { authorizationError } = require('../../../core/services/authorizationError');

async function phase(connection, exclusive = false) {
  const [rows] = await connection.query('SELECT phase, compatible_sha FROM venue_purpose_storage_transition WHERE id = 1'
    + (exclusive ? ' FOR UPDATE' : ' FOR SHARE'));
  if (rows.length !== 1 || !['legacy', 'organization'].includes(rows[0].phase)) {
    throw authorizationError('venue_purpose_storage_unavailable');
  }
  return rows[0];
}

async function usingStorage(operation) {
  return pool.withTransaction(async connection => {
    const state = await phase(connection);
    return operation(connection, state.phase === 'organization');
  });
}

async function requireOrganizationStorage(connection) {
  if ((await phase(connection)).phase !== 'organization') {
    throw authorizationError('venue_purpose_storage_not_activated');
  }
}

// 仅供发布协调器调用，不注册HTTP接口。验证器须核对所有服务进程与兼容回退版本。
async function activate(compatibleSha, verifyDeployment) {
  if (typeof compatibleSha !== 'string' || !/^[a-f0-9]{40}$/.test(compatibleSha)
    || typeof verifyDeployment !== 'function') throw authorizationError('venue_purpose_deployment_required');
  return pool.withTransaction(connection => activateInTransaction(connection, compatibleSha, verifyDeployment));
}

async function activateInTransaction(connection, compatibleSha, verifyDeployment) {
    const state = await phase(connection, true);
    if (state.phase === 'organization') return { changed: false, compatibleSha: state.compatible_sha };
    if (await verifyDeployment(compatibleSha) !== true) throw authorizationError('venue_purpose_deployment_not_ready');
    // 锁定当前组织和旧数据。兼容进程的所有读写均持有上面的共享锁，切换不能穿插写入。
    const [organizations] = await connection.query('SELECT id FROM organizations ORDER BY id FOR SHARE');
    const [purposes] = await connection.query('SELECT id, text, sort_order, created_at, updated_at FROM venue_booking_purposes ORDER BY id FOR UPDATE');
    // 这些行仅为旧迁移的预备副本，兼容阶段禁止组织副本写入及跨组织复制。
    for (const organization of organizations) {
      await connection.query('DELETE FROM organization_venue_booking_purposes WHERE org_id=?', [organization.id]);
    }
    await connection.query(`INSERT INTO organization_venue_booking_purposes
      (org_id, id, text, sort_order, created_at, updated_at)
      SELECT o.id, p.id, p.text, p.sort_order, p.created_at, p.updated_at
      FROM organizations o CROSS JOIN venue_booking_purposes p`);
    await connection.query(`UPDATE venue_purpose_storage_transition
      SET phase = 'organization', compatible_sha = ?, activated_at = UTC_TIMESTAMP(3) WHERE id = 1`, [compatibleSha]);
    return { changed: true, compatibleSha, organizationCount: organizations.length, purposeCount: purposes.length };
}

module.exports = { usingStorage, requireOrganizationStorage, activate, activateInTransaction,
  lockForActivation: connection => phase(connection, true) };
