const localeCopy = require('../../locales/zh-CN/generated/core/routes/admin');
const accountCopy = require('../../locales/zh-CN/core/adminAccount');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const adminInfoModel = require('../models/adminInfo');
const pool = require('../../config/db');
const unifiedIdentityModel = require('../models/unifiedIdentity');
const personIdentityOverviewModel = require('../models/personIdentityOverview');
const adminAccountAuthorization = require('../models/adminAccountAuthorization');
const { resolveRequestAdmin: ensureAdmin } = require('../services/adminRequestContext');
const {
  AdminOrganizationAccessError,
  requireAdminOrganizationPermission
} = require('../services/adminOrganizationAccess');
const {
  ADMIN_LEVELS,
  isSuperAdmin,
  canManageTarget,
  canCreateLevel
} = require('../services/adminAuthorization');

async function getRequestOrganizationId(req) {
  return safeString(req.authContext && req.authContext.organizationId) || getCurrentOrgId();
}

function getAdminLevelLabel(adminLevel) {
  return adminLevel === 'super_admin' ? accountCopy.superAdmin : accountCopy.admin;
}

function getAuthenticationStatusLabel(status) {
  const labels = {
    verified: accountCopy.verified,
    frozen: accountCopy.frozen,
    recovery_required: accountCopy.recoveryRequired,
    pending_verification: accountCopy.pendingVerification
  };
  return labels[status] || localeCopy.copy_5342fa4b24;
}

function hasAccountWrite(req, operator) {
  return isSuperAdmin(operator) || Boolean(req.adminPermissions
    && req.adminPermissions.permissions
    && req.adminPermissions.permissions['system.admin_accounts.write']);
}

function hasAccountRead(req, operator) {
  return hasAccountWrite(req, operator) || Boolean(req.adminPermissions
    && req.adminPermissions.permissions
    && req.adminPermissions.permissions['system.admin_accounts.read']);
}

function creatableLevels(operator, canWrite) {
  if (!canWrite) return [];
  if (isSuperAdmin(operator)) {
    return [
      { value: 'admin', label: localeCopy.copy_fd31650797 },
      { value: 'super_admin', label: localeCopy.copy_ccd219e5f1 }
    ];
  }
  return [{ value: 'admin', label: localeCopy.copy_fd31650797 }];
}

async function createAdminRecord(connection, operator, orgId, body) {
  const selectedPerson = safeString(body.hrId)
    ? await personIdentityOverviewModel.resolvePersonByLegacyHrId(body.hrId, connection)
    : null;
  const name = selectedPerson ? safeString(selectedPerson.name) : safeString(body.name);
  const studentId = selectedPerson ? safeString(selectedPerson.student_id) : safeString(body.studentId);
  const adminLevel = safeString(body.adminLevel || 'admin');
  if (!name || !studentId) return { error: { status: 'invalid_params', message: localeCopy.copy_e6f89839f1 } };
  if (!ADMIN_LEVELS.includes(adminLevel)) return { error: { status: 'invalid_params', message: localeCopy.copy_4c77111c70 } };
  if (!canCreateLevel(operator, adminLevel)) {
    return { error: { status: 'forbidden', message: localeCopy.copy_8e8da364b3 } };
  }

  const targetOrgId = adminLevel === 'super_admin' ? '' : orgId;
  if (await adminInfoModel.studentExists(studentId, targetOrgId, '', connection)) {
    return { error: { status: 'duplicate', message: localeCopy.copy_b744719f4d } };
  }

  const id = generateId();
  await adminInfoModel.create(id, {
    name,
    studentId,
    adminLevel,
    orgId: targetOrgId,
    bindStatus: 'invited'
  }, connection);
  await unifiedIdentityModel.syncLegacyAdminGrant(connection, id);
  return { id };
}

router.post('/listAdmins', async (req, res) => {
  try {
    if (req.unifiedAuthorization?.reference) {
      const result = await pool.withTransaction(async connection => {
        const access = await adminAccountAuthorization.list(connection, req.unifiedAuthorization.reference);
        const canCreate = access.decision('create', null, ['name', 'adminLevel']).allowed;
        const authenticationStates = await unifiedIdentityModel.listLegacyAdminAuthenticationStates(access.rows.map(row => row.id), connection);
        const list = access.rows.map(row => {
          const permitted = access.decision('read', row);
          const fields = access.session.project({ name: row.name, adminLevel: row.admin_level }, permitted);
          const manageable = canManageTarget(access.admin, row, access.actor.organizationId);
          const canEdit = manageable && access.decision('update', row, ['name']).allowed;
          const canDelete = manageable && access.decision('delete', row).allowed;
          const authenticationStatus = authenticationStates[row.id] || 'pending_verification';
          return { id: row.id, ...fields,
            adminLevelLabel: fields.adminLevel ? getAdminLevelLabel(fields.adminLevel) : '',
            canManage: canEdit || canDelete, canEdit, canDelete, authenticationStatus,
            authenticationStatusLabel: getAuthenticationStatusLabel(authenticationStatus) };
        });
        const levels = creatableLevels(access.admin, canCreate);
        return { list, canRead: true, canWrite: canCreate || list.some(row => row.canManage),
          canManage: canCreate || list.some(row => row.canManage), canCreate, creatableLevels: levels,
          manageableLevel: levels.length === 1 ? levels[0].value : '' };
      });
      return res.json({ status: 'success', ...result });
    }
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountRead(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    }
    const orgId = await getRequestOrganizationId(req);
    const canWrite = hasAccountWrite(req, operator);
    const rows = await adminInfoModel.listVisible(operator, orgId);
    const authenticationStates = await unifiedIdentityModel.listLegacyAdminAuthenticationStates(
      rows.map((item) => item.id)
    );
    const list = rows.map((item) => {
      const canManage = canWrite && canManageTarget(operator, item, orgId);
      const authenticationStatus = authenticationStates[item.id] || 'pending_verification';
      return {
        id: item.id,
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        adminLevel: item.admin_level,
        adminLevelLabel: getAdminLevelLabel(item.admin_level),
        canManage,
        canEdit: canManage,
        canDelete: canManage,
        authenticationStatus,
        authenticationStatusLabel: getAuthenticationStatusLabel(authenticationStatus)
      };
    });
    const levels = creatableLevels(operator, canWrite);
    res.json({
      status: 'success',
      list,
      canRead: true,
      canWrite,
      canManage: canWrite,
      creatableLevels: levels,
      manageableLevel: levels.length === 1 ? levels[0].value : ''
    });
  } catch (error) {
    if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    req.logger.error('List admins failed', { error: error.message });
    res.status(500).json({ status: 'error', message: localeCopy.copy_6026566679 });
  }
});

router.post('/getAdminAccountCandidates', async (req, res) => {
  try {
    const reference = req.unifiedAuthorization?.reference;
    if (!reference) return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    const list = await pool.withTransaction(connection => adminAccountAuthorization.candidates(connection, reference));
    return res.json({ status: 'success', list });
  } catch (error) {
    if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    return res.status(500).json({ status: 'error', message: localeCopy.copy_6026566679 });
  }
});

router.post('/saveAdmin', async (req, res) => {
  let connection;
  try {
    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const requestedLevel = safeString(req.body.adminLevel || 'admin');
    const currentOrgId = await getRequestOrganizationId(req);
    const requestedOrgId = safeString(req.body.organizationId) || currentOrgId;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const authorization = req.unifiedAuthorization?.reference
      ? await adminAccountAuthorization.begin(connection, req.unifiedAuthorization.reference) : null;
    if (authorization && requestedOrgId !== authorization.actor.organizationId) {
      throw new AdminOrganizationAccessError('permission_denied', localeCopy.copy_c3b3ead170, 403);
    }

    if (id) {
      if (!name || (!authorization && !studentId)) {
        await connection.rollback();
        return res.json({ status: 'invalid_params', message: localeCopy.copy_e6f89839f1 });
      }
      const target = await adminInfoModel.getByIdGlobal(id, connection, true);
      if (!target) {
        await connection.rollback();
        return res.json({ status: 'not_found', message: localeCopy.copy_1d64e33c49 });
      }
      const targetOrgId = target.admin_level === 'super_admin' ? requestedOrgId : safeString(target.org_id);
      if (authorization) authorization.requireAction('update', target, ['name']);
      if (authorization && studentId && studentId !== target.student_id) {
        throw new AdminOrganizationAccessError('permission_denied', localeCopy.copy_c3b3ead170, 403);
      }
      const effectiveStudentId = authorization ? target.student_id : studentId;
      const access = authorization || await requireAdminOrganizationPermission(
        req,
        targetOrgId,
        ['system.admin_accounts.write'],
        connection
      );
      const operator = access.admin;
      if (!canManageTarget(operator, target, targetOrgId)) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: localeCopy.copy_1cf137dd0d });
      }
      if (requestedLevel !== target.admin_level) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: localeCopy.copy_da9247f4bc });
      }
      if (await adminInfoModel.studentExists(effectiveStudentId, target.org_id, id, connection)) {
        await connection.rollback();
        return res.json({ status: 'duplicate', message: localeCopy.copy_b744719f4d });
      }
      await adminInfoModel.updateProfile(connection, target, { name, studentId: effectiveStudentId });
      await unifiedIdentityModel.syncLegacyAdminGrant(connection, target.id);
      await connection.commit();
      return res.json({ status: 'success', message: localeCopy.copy_feaecc6da6 });
    }

    if (authorization) {
      authorization.requireAction('create', null, ['name', 'adminLevel']);
      if (req.body.hrId) await adminAccountAuthorization.validateCandidate(connection, requestedOrgId, safeString(req.body.hrId));
    }
    const access = authorization || await requireAdminOrganizationPermission(
      req,
      requestedOrgId,
      ['system.admin_accounts.write'],
      connection
    );
    const created = await createAdminRecord(connection, access.admin, requestedOrgId, req.body);
    if (created.error) {
      await connection.rollback();
      return res.json(created.error);
    }
    await connection.commit();
    return res.json({
      status: 'success',
      id: created.id,
      message: localeCopy.copy_8ca10bee8b
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Save admin failed', { error: error.message });
    res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : localeCopy.copy_215e3c57da
    });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/deleteAdmin', async (req, res) => {
  let connection;
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_97111cbe62 });
    const currentOrgId = await getRequestOrganizationId(req);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const authorization = req.unifiedAuthorization?.reference
      ? await adminAccountAuthorization.begin(connection, req.unifiedAuthorization.reference) : null;
    const target = await adminInfoModel.getByIdGlobal(id, connection, true);
    if (!target) {
      await connection.rollback();
      return res.json({ status: 'not_found', message: localeCopy.copy_1d64e33c49 });
    }
    const orgId = target.admin_level === 'super_admin'
      ? (safeString(req.body.organizationId) || currentOrgId)
      : safeString(target.org_id);
    if (authorization) {
      if (orgId !== authorization.actor.organizationId) throw new AdminOrganizationAccessError('permission_denied', localeCopy.copy_c3b3ead170, 403);
      authorization.requireAction('delete', target);
    }
    const access = authorization || await requireAdminOrganizationPermission(
      req,
      orgId,
      ['system.admin_accounts.write'],
      connection
    );
    const operator = access.admin;
    if (!canManageTarget(operator, target, orgId)) {
      await connection.rollback();
      return res.json({ status: 'forbidden', message: localeCopy.copy_1cf137dd0d });
    }
    // 最后有效超级管理员保护由统一授权模型事务复核，不再按微信绑定人数判断。
    await unifiedIdentityModel.revokeLegacyAdminGrant(connection, target.id);
    await adminInfoModel.removeExact(connection, target);
    await connection.commit();
    res.json({ status: 'success', message: localeCopy.copy_ab0b962d3e });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Delete admin failed', { error: error.message });
    res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : localeCopy.copy_076bb5d383
    });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/createAdminInvite', async (req, res) => {
  return res.status(410).json({
    status: 'legacy_auth_disabled',
    message: localeCopy.copy_bfdbc88a74
  });
});

router.post('/generateAdminInviteCode', async (req, res) => {
  return res.status(410).json({
    status: 'legacy_auth_disabled',
    message: localeCopy.copy_bfa41dd7b3
  });
});

router.post('/bootstrapRootAdmin', async (req, res) => {
  res.status(404).json({ status: 'not_found', message: localeCopy.copy_0429e2ed3a });
});

router.post('/bootstrapSuperAdmin', async (req, res) => {
  res.status(404).json({ status: 'not_found', message: localeCopy.copy_3391cecb3d });
});

router.post('/adminUnbindUser', (req, res) => {
  return res.status(410).json({
    status: 'legacy_api_retired',
    message: localeCopy.copy_0429e2ed3a
  });
});

router.post('/exportAdmins', async (req, res) => {
  try {
    if (req.unifiedAuthorization?.reference) {
      const data = await pool.withTransaction(async connection => {
        const access = await adminAccountAuthorization.list(connection, req.unifiedAuthorization.reference, 'export');
        return access.rows.map(row => access.session.project({ name: row.name,
          adminLevel: getAdminLevelLabel(row.admin_level) }, access.decision('export', row)));
      });
      const escapeCell = value => '"' + String(value || '').replace(/"/g, '""') + '"';
      const rows = [require('../../locales/zh-CN/authorization').adminExportColumns,
        ...data.map(row => [row.name, row.adminLevel])];
      return res.json({ status: 'success', csvContent: rows.map(row => row.map(escapeCell).join(',')).join('\n') });
    }
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountRead(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    }
    const orgId = await getRequestOrganizationId(req);
    const data = await adminInfoModel.listVisible(operator, orgId);
    const csvRows = ['姓名,学号,管理员级别,绑定状态'];
    data.forEach((item) => {
      csvRows.push([item.name, item.student_id, getAdminLevelLabel(item.admin_level), item.bind_status].join(','));
    });
    res.json({ status: 'success', csvContent: csvRows.join('\n') });
  } catch (error) {
    if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_c3b3ead170 });
    res.json({ status: 'error', message: safeString(error.message) });
  }
});

module.exports = router;
