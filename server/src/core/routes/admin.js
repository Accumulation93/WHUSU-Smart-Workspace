const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const adminInfoModel = require('../models/adminInfo');
const userInfoModel = require('../models/userInfo');
const pool = require('../../config/db');
const {
  ADMIN_LEVELS,
  createInviteCredential,
  isSuperAdmin,
  canViewTarget,
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

function getBindStatusLabel(bindStatus) {
  return bindStatus === 'active' ? '已绑定' : '已邀请';
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
  const name = safeString(body.name);
  const studentId = safeString(body.studentId);
  const adminLevel = safeString(body.adminLevel || 'admin');
  if (!name || !studentId) return { error: { status: 'invalid_params', message: '请填写姓名和学号' } };
  if (!ADMIN_LEVELS.includes(adminLevel)) return { error: { status: 'invalid_params', message: '无效的管理员级别' } };
  if (!canCreateLevel(operator, adminLevel)) {
    return { error: { status: 'forbidden', message: '不能创建该类别管理员' } };
  }

  const targetOrgId = adminLevel === 'super_admin' ? '' : orgId;
  if (await adminInfoModel.studentExists(studentId, targetOrgId, '', connection)) {
    return { error: { status: 'duplicate', message: '该学号已存在' } };
  }

  const id = generateId();
  const invite = createInviteCredential();
  await adminInfoModel.create(id, {
    name,
    studentId,
    adminLevel,
    orgId: targetOrgId,
    bindStatus: 'invited',
    inviteCode: invite.inviteCode,
    invitedAt: invite.invitedAt,
    inviteExpiresAt: invite.inviteExpiresAt
  }, connection);
  return { id, invite };
}

router.post('/listAdmins', async (req, res) => {
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountRead(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '没有管理员读取权限' });
    }
    const orgId = await getCurrentOrgId();
    const canWrite = hasAccountWrite(req, operator);
    const rows = await adminInfoModel.listVisible(operator, orgId);
    const list = rows.map((item) => {
      const canManage = canWrite && canManageTarget(operator, item, orgId);
      const canAccessInvite = canWrite && canViewTarget(operator, item, orgId);
      return {
        id: item.id,
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        adminLevel: item.admin_level,
        adminLevelLabel: getAdminLevelLabel(item.admin_level),
        inviteCode: canAccessInvite ? safeString(item.invite_code) : '',
        inviteExpiresAt: canAccessInvite && item.invite_expires_at ? item.invite_expires_at : null,
        canViewInviteCode: canAccessInvite,
        canCopyInviteCode: canAccessInvite && Boolean(safeString(item.invite_code)),
        canManage,
        canEdit: canManage,
        canDelete: canManage,
        canRegenerateInvite: canAccessInvite,
        bindStatus: safeString(item.bind_status),
        bindStatusLabel: getBindStatusLabel(safeString(item.bind_status))
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
    res.json({ status: 'error', message: safeString(error.message) });
  }
});

router.post('/saveAdmin', async (req, res) => {
  let connection;
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountWrite(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '没有管理员写入权限' });
    }
    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const requestedLevel = safeString(req.body.adminLevel || 'admin');
    const orgId = await getCurrentOrgId();
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
        return res.json({ status: 'not_found', message: '管理员不存在' });
      }
      if (!canManageTarget(operator, target, orgId)) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: '不能修改该管理员' });
      }
      if (requestedLevel !== target.admin_level) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: '管理员类别创建后不可修改' });
      }
      if (await adminInfoModel.studentExists(studentId, target.org_id, id, connection)) {
        await connection.rollback();
        return res.json({ status: 'duplicate', message: '该学号已存在' });
      }
      await adminInfoModel.updateProfile(connection, target, { name, studentId });
      await connection.commit();
      return res.json({ status: 'success', message: '管理员更新成功' });
    }

    const created = await createAdminRecord(connection, operator, orgId, req.body);
    if (created.error) {
      await connection.rollback();
      return res.json(created.error);
    }
    await connection.commit();
    return res.json({
      status: 'success',
      id: created.id,
      inviteCode: created.invite.inviteCode,
      expiresAt: created.invite.inviteExpiresAt.toISOString(),
      message: '管理员创建成功'
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    res.json({ status: 'error', message: safeString(error.message) });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/deleteAdmin', async (req, res) => {
  let connection;
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountWrite(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '没有管理员写入权限' });
    }
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供管理员ID' });
    const orgId = await getCurrentOrgId();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const target = await adminInfoModel.getByIdGlobal(id, connection, true);
    if (!target) {
      await connection.rollback();
      return res.json({ status: 'not_found', message: '管理员不存在' });
    }
    if (!canManageTarget(operator, target, orgId)) {
      await connection.rollback();
      return res.json({ status: 'forbidden', message: '不能删除自己、上级或其他组织管理员' });
    }
    if (target.admin_level === 'super_admin') {
      const superAdmins = await adminInfoModel.lockSuperAdmins(connection);
      const activeSuperAdminCount = superAdmins.filter((item) => item.bind_status === 'active').length;
      if (!canDeleteTarget(operator, target, orgId, activeSuperAdminCount)) {
        await connection.rollback();
        return res.json({ status: 'forbidden', message: '系统必须保留一名有效超级管理员' });
      }
    }
    await adminInfoModel.removeExact(connection, target);
    await connection.commit();
    res.json({ status: 'success', message: '管理员已删除' });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    res.json({ status: 'error', message: safeString(error.message) });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/createAdminInvite', async (req, res) => {
  let connection;
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountWrite(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '没有管理员写入权限' });
    }
    const orgId = await getCurrentOrgId();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const created = await createAdminRecord(connection, operator, orgId, req.body);
    if (created.error) {
      await connection.rollback();
      return res.json(created.error);
    }
    await connection.commit();
    res.json({
      status: 'success',
      inviteCode: created.invite.inviteCode,
      expiresAt: created.invite.inviteExpiresAt.toISOString(),
      adminId: created.id,
      message: '邀请链接创建成功'
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    res.json({ status: 'error', message: safeString(error.message) });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/generateAdminInviteCode', async (req, res) => {
  let connection;
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountWrite(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '没有管理员写入权限' });
    }
    const orgId = await getCurrentOrgId();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const target = await adminInfoModel.getByIdGlobal(safeString(req.body.adminId), connection, true);
    if (!target) {
      await connection.rollback();
      return res.json({ status: 'not_found', message: '管理员不存在' });
    }
    if (!canViewTarget(operator, target, orgId)) {
      await connection.rollback();
      return res.json({ status: 'forbidden', message: '不能管理该管理员邀请码' });
    }
    const invite = createInviteCredential();
    await adminInfoModel.updateInvite(connection, target, invite);
    await connection.commit();
    res.json({ status: 'success', inviteCode: invite.inviteCode, expiresAt: invite.inviteExpiresAt.toISOString() });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    res.json({ status: 'error', message: safeString(error.message) });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/bootstrapRootAdmin', async (req, res) => {
  res.status(404).json({ status: 'not_found', message: '该接口已停用，请使用服务器本地超级管理员初始化脚本' });
});

router.post('/bootstrapSuperAdmin', async (req, res) => {
  res.status(404).json({ status: 'not_found', message: '该接口已停用，请在管理员管理中创建超级管理员' });
});

router.post('/adminUnbindUser', async (req, res) => {
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountWrite(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '没有管理员写入权限' });
    }
    const userId = safeString(req.body.userId);
    if (!userId) return res.json({ status: 'invalid_params', message: '请提供用户ID' });
    const targetUser = await userInfoModel.getById(userId);
    if (!targetUser) return res.json({ status: 'not_found', message: '用户绑定记录不存在' });
    const targetAdmin = await adminInfoModel.getByOpenidAny(safeString(targetUser.openid));
    if (targetAdmin) {
      const orgId = await getCurrentOrgId();
      if (!canManageTarget(operator, targetAdmin, orgId)) {
        return res.json({ status: 'forbidden', message: '不能解绑该管理员' });
      }
    }
    await userInfoModel.remove(userId);
    res.json({ status: 'success', message: '用户解绑成功' });
  } catch (error) {
    res.json({ status: 'error', message: safeString(error.message) });
  }
});

router.post('/exportAdmins', async (req, res) => {
  try {
    const operator = await ensureAdmin(req);
    if (!operator || !hasAccountRead(req, operator)) {
      return res.status(403).json({ status: 'permission_denied', message: '没有管理员读取权限' });
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
