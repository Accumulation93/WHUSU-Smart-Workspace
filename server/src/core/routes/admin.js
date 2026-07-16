const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const adminInfoModel = require('../models/adminInfo');
const userInfoModel = require('../models/userInfo');
const pool = require('../../config/db');
const {
  DIRECT_MANAGED_LEVEL,
  createInviteCredential,
  canManageTarget,
  canCreateLevel
} = require('../services/adminAuthorization');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

function getAdminLevelLabel(adminLevel) {
  if (adminLevel === 'root_admin') return '至高权限管理员';
  if (adminLevel === 'super_admin') return '超级管理员';
  return '普通管理员';
}

function getBindStatusLabel(bindStatus) {
  if (bindStatus === 'active') return '已绑定';
  return '已邀请';
}

// listAdmins
router.post('/listAdmins', async (req, res) => {
  try {
    const openid = req.openid;
    const operator = await ensureAdmin(openid);
    if (!operator) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    const operatorLevel = operator.admin_level || 'admin';
    const orgId = await getCurrentOrgId();
    const [rows] = await pool.query(
      "SELECT * FROM admin_info WHERE org_id = ? OR admin_level = 'root_admin' ORDER BY admin_level, name",
      [orgId]
    );

    const list = (rows || []).map((item) => {
      const adminLevel = item.admin_level || 'admin';
      return {
        id: item.id,
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        adminLevel,
        adminLevelLabel: getAdminLevelLabel(adminLevel),
        inviteCode: '',
        canManage: canManageTarget(operator, item, orgId),
        bindStatus: safeString(item.bind_status),
        bindStatusLabel: getBindStatusLabel(safeString(item.bind_status))
      };
    });

    res.json({
      status: 'success',
      list,
      canManage: Boolean(DIRECT_MANAGED_LEVEL[operatorLevel]),
      manageableLevel: DIRECT_MANAGED_LEVEL[operatorLevel] || ''
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveAdmin
router.post('/saveAdmin', async (req, res) => {
  try {
    const openid = req.openid;
    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const adminLevel = safeString(req.body.adminLevel || 'super_admin');

    const operator = await ensureAdmin(openid);
    if (!operator) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    if (!name || !studentId) return res.json({ status: 'invalid_params', message: '请填写姓名和学号' });
    if (!['admin', 'super_admin'].includes(adminLevel)) return res.json({ status: 'invalid_params', message: '无效的管理员级别' });
    const orgId = await getCurrentOrgId();

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (id) {
      // Load target to verify it exists
      const [targetRows] = await pool.query('SELECT * FROM admin_info WHERE id = ?', [id]);
      const targetDoc = targetRows[0] || null;
      if (!targetDoc) return res.json({ status: 'not_found', message: '管理员不存在' });
      if (!canManageTarget(operator, targetDoc, orgId) || adminLevel !== targetDoc.admin_level) {
        return res.json({ status: 'forbidden', message: '只能管理当前组织的直接下级管理员' });
      }
      const [existingRows] = await pool.query(
        'SELECT id FROM admin_info WHERE student_id = ? AND org_id = ? AND id != ? LIMIT 1',
        [studentId, orgId, id]
      );
      if (existingRows.length) return res.json({ status: 'duplicate', message: '该学号已存在' });
      await pool.query(
        'UPDATE admin_info SET name = ?, student_id = ?, updated_at = ? WHERE id = ? AND org_id = ? AND admin_level = ?',
        [name, studentId, nowUtc, id, orgId, targetDoc.admin_level]
      );
      res.json({ status: 'success', message: '管理员更新成功' });
    } else {
      if (!canCreateLevel(operator, adminLevel)) {
        return res.json({ status: 'forbidden', message: '只能创建直接下级管理员' });
      }
      const [existingRows] = await pool.query('SELECT id FROM admin_info WHERE student_id = ? AND org_id = ? LIMIT 1', [studentId, orgId]);
      if (existingRows.length) return res.json({ status: 'duplicate', message: '该学号已存在' });
      const newId = generateId();
      const invite = createInviteCredential();
      await adminInfoModel.create(newId, {
        name, studentId, adminLevel, bindStatus: 'invited',
        inviteCodeHash: invite.inviteCodeHash,
        invitedAt: invite.invitedAt,
        inviteExpiresAt: invite.inviteExpiresAt
      });
      res.json({
        status: 'success',
        id: newId,
        inviteCode: invite.inviteCode,
        expiresAt: invite.inviteExpiresAt.toISOString(),
        message: '管理员创建成功'
      });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteAdmin
router.post('/deleteAdmin', async (req, res) => {
  try {
    const openid = req.openid;
    const operator = await ensureAdmin(openid);
    if (!operator) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供管理员ID' });

    const admin = await adminInfoModel.getById(id);
    if (!admin) return res.json({ status: 'not_found', message: '管理员不存在' });

    const orgId = await getCurrentOrgId();
    if (!canManageTarget(operator, admin, orgId)) {
      return res.json({ status: 'forbidden', message: '只能删除当前组织的直接下级管理员' });
    }

    await adminInfoModel.remove(id);
    res.json({ status: 'success', message: '管理员已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// createAdminInvite
router.post('/createAdminInvite', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const adminLevel = safeString(req.body.adminLevel || 'super_admin');

    if (!name || !studentId) {
      return res.json({ status: 'invalid_params', message: '请提供姓名和学号' });
    }
    if (!['admin', 'super_admin'].includes(adminLevel)) {
      return res.json({ status: 'invalid_params', message: '无效的管理员级别' });
    }

    if (!canCreateLevel(admin, adminLevel)) {
      return res.json({ status: 'forbidden', message: '只能邀请直接下级管理员' });
    }

    const orgId = await getCurrentOrgId();
    const [dupRows] = await pool.query('SELECT id FROM admin_info WHERE student_id = ? AND org_id = ?', [studentId, orgId]);
    if (dupRows.length) return res.json({ status: 'duplicate', message: '该学号已存在' });

    const invite = createInviteCredential();
    const id = generateId();
    await adminInfoModel.create(id, {
      name, studentId, adminLevel, bindStatus: 'invited',
      inviteCodeHash: invite.inviteCodeHash,
      invitedAt: invite.invitedAt,
      inviteExpiresAt: invite.inviteExpiresAt
    });

    res.json({
      status: 'success',
      inviteCode: invite.inviteCode,
      expiresAt: invite.inviteExpiresAt.toISOString(),
      adminId: id,
      message: '邀请链接创建成功'
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// generateAdminInviteCode
router.post('/generateAdminInviteCode', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const adminId = safeString(req.body.adminId);
    const target = await adminInfoModel.getById(adminId);
    if (!target) return res.json({ status: 'not_found', message: '管理员不存在' });
    const orgId = await getCurrentOrgId();
    if (!canManageTarget(admin, target, orgId)) {
      return res.json({ status: 'forbidden', message: '只能管理当前组织的直接下级管理员' });
    }
    if (target.bind_status === 'active' || safeString(target.openid)) {
      return res.json({ status: 'invalid_operation', message: '已绑定账号不能重新生成邀请码' });
    }
    const invite = createInviteCredential();
    await pool.query(
      `UPDATE admin_info
          SET invite_code = NULL, invite_code_hash = ?, invited_at = ?, invite_expires_at = ?,
              invite_consumed_at = NULL, updated_at = NOW()
        WHERE id = ? AND org_id = ? AND admin_level = ?`,
      [invite.inviteCodeHash, invite.invitedAt, invite.inviteExpiresAt, adminId, orgId, target.admin_level]
    );

    res.json({ status: 'success', inviteCode: invite.inviteCode, expiresAt: invite.inviteExpiresAt.toISOString() });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// bootstrapRootAdmin - 初始化至高权限管理员
router.post('/bootstrapRootAdmin', async (req, res) => {
  res.status(404).json({ status: 'not_found', message: '该接口已停用，请使用服务器本地初始化脚本' });
});

// bootstrapSuperAdmin - 初始化超级管理员
router.post('/bootstrapSuperAdmin', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin || admin.admin_level !== 'root_admin') {
      return res.json({ status: 'forbidden', message: '仅至高权限管理员可操作' });
    }

    const orgId = await getCurrentOrgId();
    const id = generateId();
    const invite = createInviteCredential();

    await adminInfoModel.create(id, {
      name: safeString(req.body.name || 'Super Admin'),
      studentId: safeString(req.body.studentId || ''),
      adminLevel: 'super_admin',
      bindStatus: 'invited',
      inviteCodeHash: invite.inviteCodeHash,
      invitedAt: invite.invitedAt,
      inviteExpiresAt: invite.inviteExpiresAt
    });

    res.json({ status: 'success', id, inviteCode: invite.inviteCode, expiresAt: invite.inviteExpiresAt.toISOString(), organizationId: orgId, message: '超级管理员初始化成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// adminUnbindUser — 管理员解绑用户微信（含权限层级）
router.post('/adminUnbindUser', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const userId = safeString(req.body.userId);
    if (!userId) return res.json({ status: 'invalid_params', message: '请提供用户ID' });

    // 查找目标用户的绑定信息
    const targetUser = await userInfoModel.getById(userId);
    if (!targetUser) return res.json({ status: 'not_found', message: '用户绑定记录不存在' });

    // 检查被解绑者是否是管理员，以及操作者的管理级别
    const targetOpenid = safeString(targetUser.openid);
    const targetAdmin = await adminInfoModel.getByOpenidAny(targetOpenid);
    if (targetAdmin) {
      if (admin.admin_level === 'root_admin') {
        // root_admin 可以解绑任何人
      } else if (admin.admin_level === 'super_admin') {
        // super_admin 只能解绑 admin 和普通用户，不能解绑 super_admin 或 root_admin
        if (targetAdmin.admin_level === 'super_admin' || targetAdmin.admin_level === 'root_admin') {
          return res.json({ status: 'forbidden', message: '权限不足：无法解绑同级或上级管理员' });
        }
      } else {
        // admin 无解绑权限
        return res.json({ status: 'forbidden', message: '权限不足：仅超级管理员及以上可解绑微信' });
      }
    }

    await userInfoModel.remove(userId);
    res.json({ status: 'success', message: '用户解绑成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// exportAdmins
router.post('/exportAdmins', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const data = await adminInfoModel.getAll();
    const csvRows = ['姓名,学号,管理员级别,绑定状态'];
    data.forEach(item => {
      csvRows.push([item.name, item.student_id, item.admin_level, item.bind_status].join(','));
    });

    res.json({ status: 'success', csvContent: csvRows.join('\n') });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
