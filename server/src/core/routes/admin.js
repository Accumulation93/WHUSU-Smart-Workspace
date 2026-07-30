const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const adminInfoModel = require('../models/adminInfo');
const userInfoModel = require('../models/userInfo');
const pool = require('../../config/db');
const unifiedIdentityModel = require('../models/unifiedIdentity');
const personIdentityOverviewModel = require('../models/personIdentityOverview');
const {
  AdminOrganizationAccessError,
  requireAdminOrganizationPermission
} = require('../services/adminOrganizationAccess');
const {
  ADMIN_LEVELS,
  isSuperAdmin,
  canManageTarget,
  canCreateLevel,
  canDeleteTarget
} = require('../services/adminAuthorization');

async function ensureAdmin(req) {
  return req.admin || adminInfoModel.getByOpenid(req.openid);
}

function getAdminLevelLabel(adminLevel) {
  return adminLevel === 'super_admin' ? '超级管理员' : '普通管理员';
}

function getAuthenticationStatusLabel(status) {
  const labels = {
    verified: '已认证',
    frozen: '已冻结',
    recovery_required: '待恢复',
    pending_verification: '待认证'
  };
  return labels[status] || '待认证';
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
      { value: 'admin', label: '普通管理员' },
      { value: 'super_admin', label: '超级管理员' }
    ];
  }
  return [{ value: 'admin', label: '普通管理员' }];
}

async function createAdminRecord(connection, operator, orgId, body) {
  const selectedPerson = safeString(body.hrId)
    ? await personIdentityOverviewModel.resolvePersonByLegacyHrId(body.hrId, connection)
    : null;
  const name = selectedPerson ? safeString(selectedPerson.name) : safeString(body.name);
  const studentId = selectedPerson ? safeString(selectedPerson.student_id) : safeString(body.studentId);
  const adminLevel = safeString(body.adminLevel || 'admin');
  if (!name || !studentId) return { error: { status: 'invalid_params', message: '请填写姓名和学号' } };
  if (!ADMIN_LEVELS.includes(adminLevel)) return { error: { status: 'invalid_params', message: '请选择管理员类别' } };
  if (!canCreateLevel(operator, adminLevel)) {
    return { error: { status: 'forbidden', message: '请选择可管理的管理员类别' } };
  }

  const targetOrgId = adminLevel === 'super_admin' ? '' : orgId;
  if (await adminInfoModel.studentExists(studentId, targetOrgId, '', connection)) {
    return { error: { status: 'duplicate', message: '该学号已存在' } };
  }

  const id = generateId();
  await adminInfoModel.create(id, {
    name,
    studentId,
    adminLevel,
    orgId: targetOrgId,
    bindStatus: 'invited',
    inviteCode: null,
    invitedAt: null,
    inviteExpiresAt: null
  }, connection);
  await unifiedIdentityModel.syncLegacyAdminGrant(connection, id);
  return { id };
}

router.post('/listAdmins', async (req, res) => {
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountRead(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '请使用可查看管理员的身份' });
    }
    const orgId = await getCurrentOrgId();
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
    req.logger.error('List admins failed', { error: error.message });
    res.status(500).json({ status: 'error', message: '请稍后刷新管理员' });
  }
});

router.post('/saveAdmin', async (req, res) => {
  let connection;
  try {
    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const requestedLevel = safeString(req.body.adminLevel || 'admin');
    const currentOrgId = await getCurrentOrgId();
    const requestedOrgId = safeString(req.body.organizationId) || currentOrgId;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (id) {
      if (!name || !studentId) {
        await connection.rollback();
        return res.json({ status: 'invalid_params', message: '请填写姓名和学号' });
      }
      const target = await adminInfoModel.getByIdGlobal(id, connection, true);
      if (!target) {
        await connection.rollback();
        return res.json({ status: 'not_found', message: '请刷新管理员列表' });
      }
      const targetOrgId = target.admin_level === 'super_admin' ? requestedOrgId : safeString(target.org_id);
      const access = await requireAdminOrganizationPermission(
        req,
        targetOrgId,
        ['system.admin_accounts.write'],
        connection
      );
      const operator = access.admin;
      if (!canManageTarget(operator, target, targetOrgId)) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: '请选择可管理的管理员' });
      }
      if (requestedLevel !== target.admin_level) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: '如需更改管理员类别，请删除后重新添加' });
      }
      if (await adminInfoModel.studentExists(studentId, target.org_id, id, connection)) {
        await connection.rollback();
        return res.json({ status: 'duplicate', message: '该学号已存在' });
      }
      await adminInfoModel.updateProfile(connection, target, { name, studentId });
      await unifiedIdentityModel.syncLegacyAdminGrant(connection, target.id);
      await connection.commit();
      return res.json({ status: 'success', message: '管理员已更新' });
    }

    const access = await requireAdminOrganizationPermission(
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
      message: '管理员身份已添加，本人完成身份认证后即可使用'
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Save admin failed', { error: error.message });
    res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : '未保存，请重试'
    });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/deleteAdmin', async (req, res) => {
  let connection;
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择管理员' });
    const currentOrgId = await getCurrentOrgId();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const target = await adminInfoModel.getByIdGlobal(id, connection, true);
    if (!target) {
      await connection.rollback();
      return res.json({ status: 'not_found', message: '请刷新管理员列表' });
    }
    const orgId = target.admin_level === 'super_admin'
      ? (safeString(req.body.organizationId) || currentOrgId)
      : safeString(target.org_id);
    const access = await requireAdminOrganizationPermission(
      req,
      orgId,
      ['system.admin_accounts.write'],
      connection
    );
    const operator = access.admin;
    if (!canManageTarget(operator, target, orgId)) {
      await connection.rollback();
      return res.json({ status: 'forbidden', message: '请选择可管理的管理员' });
    }
    if (target.admin_level === 'super_admin') {
      const superAdmins = await adminInfoModel.lockSuperAdmins(connection);
      const activeSuperAdminCount = superAdmins.filter((item) => item.bind_status === 'active').length;
      if (!canDeleteTarget(operator, target, orgId, activeSuperAdminCount)) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: '请先添加另一名超级管理员' });
      }
    }
    await unifiedIdentityModel.revokeLegacyAdminGrant(connection, target.id);
    await adminInfoModel.removeExact(connection, target);
    await connection.commit();
    res.json({ status: 'success', message: '管理员已删除' });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Delete admin failed', { error: error.message });
    res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : '未删除，请重试'
    });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/createAdminInvite', async (req, res) => {
  return res.status(410).json({
    status: 'legacy_auth_disabled',
    message: '请在账号认证中添加管理员身份'
  });
});

router.post('/generateAdminInviteCode', async (req, res) => {
  return res.status(410).json({
    status: 'legacy_auth_disabled',
    message: '请使用微信登录和身份认证'
  });
});

router.post('/bootstrapRootAdmin', async (req, res) => {
  res.status(404).json({ status: 'not_found', message: '此功能已停用' });
});

router.post('/bootstrapSuperAdmin', async (req, res) => {
  res.status(404).json({ status: 'not_found', message: '请在管理员管理中创建超级管理员' });
});

router.post('/adminUnbindUser', async (req, res) => {
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountWrite(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '请使用可管理管理员的身份' });
    }
    const userId = safeString(req.body.userId);
    if (!userId) return res.json({ status: 'invalid_params', message: '请重新选择成员' });
    const targetUser = await userInfoModel.getById(userId);
    if (!targetUser) return res.json({ status: 'not_found', message: '请刷新成员列表' });
    if (req.authSession && targetUser.hr_id) {
      const orgId = await getCurrentOrgId();
      const unifiedResult = await pool.withTransaction((connection) => (
        unifiedIdentityModel.resetAccountByLegacyHr(
          connection,
          targetUser.hr_id,
          orgId,
          {
            personId: req.authAccount && req.authAccount.personId,
            contextId: req.authContext && req.authContext.contextId
          },
          'administrator_account_reset'
        )
      ));
      if (unifiedResult) {
        return res.json({
          status: 'success',
          message: '账号已等待恢复，原微信和其他设备已退出',
          recoveryRequired: true
        });
      }
    }
    const targetAdmin = await adminInfoModel.getByOpenidAny(safeString(targetUser.openid));
    if (targetAdmin) {
      const orgId = await getCurrentOrgId();
      if (!canManageTarget(operator, targetAdmin, orgId)) {
        return res.json({ status: 'forbidden', message: '请先添加另一名超级管理员' });
      }
    }
    await userInfoModel.remove(userId);
    res.json({ status: 'success', message: '已解除微信绑定' });
  } catch (error) {
    res.json({ status: 'error', message: safeString(error.message) });
  }
});

router.post('/exportAdmins', async (req, res) => {
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountRead(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '请使用可查看管理员的身份' });
    }
    const data = await adminInfoModel.getAll(operator);
    const csvRows = ['姓名,学号,管理员级别,绑定状态'];
    data.forEach((item) => {
      csvRows.push([item.name, item.student_id, getAdminLevelLabel(item.admin_level), item.bind_status].join(','));
    });
    res.json({ status: 'success', csvContent: csvRows.join('\n') });
  } catch (error) {
    res.json({ status: 'error', message: safeString(error.message) });
  }
});

module.exports = router;
