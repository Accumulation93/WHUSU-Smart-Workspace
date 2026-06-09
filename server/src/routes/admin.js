const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../utils/helpers');
const { getCurrentOrgId } = require('../utils/orgContext');
const adminInfoModel = require('../models/adminInfo');
const userInfoModel = require('../models/userInfo');
const pool = require('../config/db');

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
    let rows;
    if (operatorLevel === 'root_admin') {
      const [result] = await pool.query('SELECT * FROM admin_info ORDER BY admin_level, name');
      rows = result;
    } else if (operatorLevel === 'super_admin') {
      const [result] = await pool.query(
        "SELECT * FROM admin_info WHERE (admin_level IN ('super_admin', 'admin') AND org_id = ?) OR admin_level = 'root_admin' ORDER BY admin_level, name",
        [orgId]
      );
      rows = result;
    } else {
      const [result] = await pool.query(
        "SELECT * FROM admin_info WHERE (admin_level = 'admin' AND org_id = ?) OR admin_level = 'root_admin' ORDER BY admin_level, name",
        [orgId]
      );
      rows = result;
    }

    const list = (rows || []).map((item) => {
      const adminLevel = item.admin_level || 'admin';
      return {
        id: item.id,
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        adminLevel,
        adminLevelLabel: getAdminLevelLabel(adminLevel),
        inviteCode: safeString(item.invite_code),
        bindStatus: safeString(item.bind_status),
        bindStatusLabel: getBindStatusLabel(safeString(item.bind_status))
      };
    });

    res.json({
      status: 'success',
      list,
      canManage: operatorLevel === 'root_admin' || operatorLevel === 'super_admin'
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
    const inviteCode = safeString(req.body.inviteCode).toUpperCase();

    const operator = await ensureAdmin(openid);
    if (!operator) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    const operatorLevel = operator.admin_level || 'admin';
    if (!name || !studentId) return res.json({ status: 'invalid_params', message: '请填写姓名和学号' });
    if (!['admin', 'super_admin', 'root_admin'].includes(adminLevel)) return res.json({ status: 'invalid_params', message: '无效的管理员级别' });

    if (operatorLevel !== 'root_admin' && adminLevel === 'root_admin') {
      return res.json({ status: 'forbidden', message: '仅至高权限管理员可添加至高权限管理员' });
    }

    // Check invite code uniqueness
    if (inviteCode) {
      const [inviteRows] = await pool.query('SELECT id FROM admin_info WHERE invite_code = ?', [inviteCode]);
      const conflict = inviteRows.find((r) => String(r.id) !== id);
      if (conflict) return res.json({ status: 'duplicate_invite_code', message: '邀请码已被使用' });
    }

    // Check student_id uniqueness (root_admin checked globally, others within org)
    const orgId = adminLevel === 'root_admin' ? '' : await getCurrentOrgId();
    if (adminLevel === 'root_admin') {
      const [existingRows] = await pool.query('SELECT id FROM admin_info WHERE student_id = ?', [studentId]);
      const conflict = existingRows.find((r) => String(r.id) !== id);
      if (conflict) return res.json({ status: 'duplicate', message: '该学号已存在' });
    } else {
      const [existingRows] = await pool.query('SELECT id FROM admin_info WHERE student_id = ? AND org_id = ?', [studentId, orgId]);
      const conflict = existingRows.find((r) => String(r.id) !== id);
      if (conflict) return res.json({ status: 'duplicate', message: '该学号已存在' });
    }

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (id) {
      // Load target to verify it exists
      const [targetRows] = await pool.query('SELECT * FROM admin_info WHERE id = ?', [id]);
      const targetDoc = targetRows[0] || null;
      if (!targetDoc) return res.json({ status: 'not_found', message: '管理员不存在' });

      if (targetDoc.admin_level === 'root_admin' && adminLevel !== 'root_admin') {
        const [rootRows] = await pool.query("SELECT COUNT(*) as cnt FROM admin_info WHERE admin_level = 'root_admin'");
        if (rootRows[0].cnt <= 1) return res.json({ status: 'invalid_operation', message: '不能降级唯一的至高权限管理员' });
      }

      // For root_admin, use raw query to set org_id = ''
      if (adminLevel === 'root_admin') {
        await pool.query(
          'UPDATE admin_info SET name = ?, student_id = ?, admin_level = ?, org_id = ?, updated_at = ?' +
          (inviteCode ? ', invite_code = ?, invited_at = ?' : '') + ' WHERE id = ?',
          inviteCode
            ? [name, studentId, adminLevel, orgId, nowUtc, inviteCode, nowUtc, id]
            : [name, studentId, adminLevel, orgId, nowUtc, id]
        );
      } else {
        const updateData = { name, student_id: studentId, admin_level: adminLevel, org_id: orgId, updated_at: nowUtc };
        if (inviteCode) { updateData.invite_code = inviteCode; updateData.invited_at = nowUtc; }
        await adminInfoModel.update(id, updateData);
      }
      res.json({ status: 'success', message: '管理员更新成功' });
    } else {
      const newId = generateId();
      await adminInfoModel.create(newId, {
        name, studentId, adminLevel, bindStatus: 'invited',
        inviteCode: inviteCode || null,
        invitedAt: inviteCode ? nowUtc : null
      });
      res.json({ status: 'success', id: newId, message: '管理员创建成功' });
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
    if (!operator || operator.admin_level !== 'root_admin') {
      return res.json({ status: 'forbidden', message: '只有至高权限管理员可以删除管理员' });
    }

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供管理员ID' });

    const admin = await adminInfoModel.getById(id);
    if (!admin) return res.json({ status: 'not_found', message: '管理员不存在' });

    if (admin.admin_level === 'root_admin') {
      const rootAdmins = await adminInfoModel.getByAdminLevel('root_admin');
      if (rootAdmins.length <= 1) {
        return res.json({ status: 'invalid_operation', message: '不能删除唯一的至高权限管理员' });
      }
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
    if (!['admin', 'super_admin', 'root_admin'].includes(adminLevel)) {
      return res.json({ status: 'invalid_params', message: '无效的管理员级别' });
    }

    const operatorLevel = admin.admin_level || 'admin';
    if (operatorLevel !== 'root_admin' && adminLevel === 'root_admin') {
      return res.json({ status: 'forbidden', message: '仅至高权限管理员可添加至高权限管理员' });
    }

    // Check student_id uniqueness (root_admin global, others within org)
    if (adminLevel === 'root_admin') {
      const [dupRows] = await pool.query('SELECT id FROM admin_info WHERE student_id = ?', [studentId]);
      if (dupRows.length) return res.json({ status: 'duplicate', message: '该学号已存在' });
    } else {
      const orgId = await getCurrentOrgId();
      const [dupRows] = await pool.query('SELECT id FROM admin_info WHERE student_id = ? AND org_id = ?', [studentId, orgId]);
      if (dupRows.length) return res.json({ status: 'duplicate', message: '该学号已存在' });
    }

    // Generate invite code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) inviteCode += chars[Math.floor(Math.random() * chars.length)];

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const id = generateId();
    await adminInfoModel.create(id, {
      name, studentId, adminLevel, bindStatus: 'invited',
      inviteCode, invitedAt: nowUtc
    });

    res.json({
      status: 'success',
      inviteCode,
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

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) inviteCode += chars[Math.floor(Math.random() * chars.length)];

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await adminInfoModel.update(adminId, { inviteCode, invitedAt: nowUtc, bindStatus: 'invited', updatedAt: nowUtc });

    res.json({ status: 'success', inviteCode });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// bootstrapRootAdmin - 初始化至高权限管理员
router.post('/bootstrapRootAdmin', async (req, res) => {
  try {
    const existing = await adminInfoModel.getRootAdmin();
    if (existing) {
      return res.json({ status: 'already_exists', message: '至高权限管理员已存在' });
    }

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const id = generateId();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) inviteCode += chars[Math.floor(Math.random() * chars.length)];

    await pool.query(
      'INSERT INTO admin_info (id, name, student_id, admin_level, invite_code, bind_status, openid, invited_at, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, safeString(req.body.name || 'Root Admin'), safeString(req.body.studentId || '0000000000000'), 'root_admin', inviteCode, 'invited', '', nowUtc, '']
    );

    res.json({ status: 'success', id, inviteCode, message: '至高权限管理员初始化成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// bootstrapSuperAdmin - 初始化超级管理员
router.post('/bootstrapSuperAdmin', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin || admin.admin_level !== 'root_admin') {
      return res.json({ status: 'forbidden', message: '仅至高权限管理员可操作' });
    }

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const id = generateId();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) inviteCode += chars[Math.floor(Math.random() * chars.length)];

    await adminInfoModel.create(id, {
      name: safeString(req.body.name || 'Super Admin'),
      studentId: safeString(req.body.studentId || ''),
      adminLevel: 'super_admin',
      bindStatus: 'invited',
      inviteCode,
      invitedAt: nowUtc
    });

    res.json({ status: 'success', id, inviteCode, message: '超级管理员初始化成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// adminUnbindUser
router.post('/adminUnbindUser', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const userId = safeString(req.body.userId);
    if (!userId) return res.json({ status: 'invalid_params', message: '请提供用户ID' });

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
    const csvRows = ['姓名,学号,管理员级别,绑定状态,OpenID'];
    data.forEach(item => {
      csvRows.push([item.name, item.student_id, item.admin_level, item.bind_status, item.openid || ''].join(','));
    });

    res.json({ status: 'success', csvContent: csvRows.join('\n') });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
