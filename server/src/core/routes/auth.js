const localeCopy = require('../../locales/zh-CN/generated/core/routes/auth');
const retiredCopy = require('../../locales/zh-CN/generated/core/routes/admin');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { nowMysqlUtc } = require('../../utils/dateTime');
const { getCurrentOrgId } = require('../../utils/orgContext');
const userInfoModel = require('../models/userInfo');
const adminInfoModel = require('../models/adminInfo');
const hrInfoModel = require('../models/hrInfo');
const organizationModel = require('../models/organization');
const pool = require('../../config/db');
const { clearOrgAccessCache } = require('../../middleware/orgContext');
const { loadEffectivePermissions } = require('../services/adminPermissions');
const { listAvailableOrganizations } = require('../services/accessibleOrganizations');

// 构建用户 profile（跨组织 — 使用指定 orgId 查询关联表）
async function buildUserProfileCrossOrg(hrRecord, orgId) {
  const [deptRows] = hrRecord.department_id
    ? await pool.query('SELECT name FROM departments WHERE id = ? AND org_id = ?', [hrRecord.department_id, orgId])
    : [[null]];
  const [identRows] = hrRecord.identity_id
    ? await pool.query('SELECT name FROM identities WHERE id = ? AND org_id = ?', [hrRecord.identity_id, orgId])
    : [[null]];
  const [wgRows] = hrRecord.work_group_id
    ? await pool.query('SELECT name FROM work_groups WHERE id = ? AND org_id = ?', [hrRecord.work_group_id, orgId])
    : [[null]];
  return {
    id: safeString(hrRecord.id),
    hrId: safeString(hrRecord.id),
    name: safeString(hrRecord.name),
    studentId: safeString(hrRecord.student_id),
    departmentId: safeString(hrRecord.department_id),
    department: (deptRows && deptRows[0]) ? safeString(deptRows[0].name) : '',
    identityId: safeString(hrRecord.identity_id),
    identity: (identRows && identRows[0]) ? safeString(identRows[0].name) : '',
    workGroupId: safeString(hrRecord.work_group_id),
    workGroup: (wgRows && wgRows[0]) ? safeString(wgRows[0].name) : ''
  };
}

// 直接读取系统默认组织（不受 ALS/X-Active-Org 影响）
async function getSystemDefaultOrgId() {
  const [rows] = await pool.query(
    "SELECT current_organization FROM system_config WHERE id = 'default'"
  );
  return (rows && rows.length && rows[0].current_organization) || '';
}

// 构建用户可用的组织列表（user_info + hr_info 匹配 + admin_info 去重，标注角色）
async function buildAvailableOrgs(openid, adminRecords) {
  return listAvailableOrganizations(openid, adminRecords === null ? 'user' : 'admin');
}

// 旧普通用户登录协议无法绑定服务端工作上下文，统一要求客户端升级。
router.post('/userLogin', (req, res) => {
  return res.status(426).json({
    status: 'client_upgrade_required',
    message: localeCopy.copy_bfb0d21b30
  });
});

// 旧管理员登录协议同样不得签发仅含 openid 的令牌。
router.post('/adminLogin', (req, res) => {
  return res.status(426).json({
    status: 'client_upgrade_required',
    message: localeCopy.copy_bfb0d21b30
  });
});

// 构建管理员 user 对象
async function buildAdminUser(admin, orgId) {
  const effective = await loadEffectivePermissions(admin, orgId || admin.org_id || '');
  return {
    id: safeString(admin.id),
    hrId: safeString(admin.id),
    name: safeString(admin.name),
    studentId: safeString(admin.student_id),
    departmentId: '',
    department: '',
    identityId: '',
    identity: '',
    workGroupId: '',
    workGroup: '',
    adminLevel: safeString(admin.admin_level),
    permissions: effective.permissions,
    permissionKeys: effective.keys,
    canAccessPermissionSystem: effective.canAccessPermissionSystem
  };
}

async function resolveUserInOrganization(openid, orgId) {
  const existing = await userInfoModel.getByOpenidInOrg(openid, orgId);
  if (existing && safeString(existing.hr_id)) {
    const existingHr = await hrInfoModel.getByIdInOrg(existing.hr_id, orgId);
    if (existingHr) {
      return { binding: existing, hr: existingHr };
    }
  }

  const globalBindings = await userInfoModel.getByOpenidGlobal(openid);
  let matchedHr = null;
  for (const binding of globalBindings) {
    if (!safeString(binding.hr_id) || binding.org_id === orgId) continue;
    const sourceHr = await hrInfoModel.getByIdInOrg(binding.hr_id, binding.org_id);
    if (!sourceHr || !safeString(sourceHr.student_id)) continue;
    const targetHr = await hrInfoModel.getByStudentIdInOrg(sourceHr.student_id, orgId);
    if (targetHr && safeString(targetHr.name) === safeString(sourceHr.name)) {
      matchedHr = targetHr;
      break;
    }
  }

  if (!matchedHr) return null;

  const conflict = await userInfoModel.getByHrIdInOrg(matchedHr.id, openid, orgId);
  if (conflict) {
    const error = new Error(localeCopy.copy_e9125ff384);
    error.code = 'ORG_IDENTITY_CONFLICT';
    throw error;
  }

  if (existing) {
    const nowUtc = nowMysqlUtc();
    await userInfoModel.updateInOrg(existing.id, matchedHr.id, nowUtc, orgId);
    return { binding: Object.assign({}, existing, { hr_id: matchedHr.id }), hr: matchedHr };
  }

  const bindingId = generateId();
  await userInfoModel.createInOrg(bindingId, openid, matchedHr.id, orgId);
  return { binding: { id: bindingId, openid, hr_id: matchedHr.id, org_id: orgId }, hr: matchedHr };
}

// activateOrganization — 显式验证并激活用户选择的组织，禁止静默回退到系统默认组织
router.post('/activateOrganization', async (req, res) => {
  try {
    const openid = req.openid;
    const orgId = safeString(req.body.organizationId);
    const role = safeString(req.headers['x-role']).toLowerCase();

    if (!openid) return res.json({ status: 'auth_failed', message: localeCopy.copy_c22a252e97 });
    if (!orgId || (role !== 'user' && role !== 'admin')) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_80a283f3f0 });
    }

    const organization = await organizationModel.getById(orgId);
    if (!organization) {
      return res.json({ status: 'not_found', message: localeCopy.copy_cc9e4b8129 });
    }

    let user;
    if (role === 'admin') {
      const adminRecords = await adminInfoModel.getAuthorizedByOpenidAcrossOrgs(openid);
      const superAdmin = adminRecords.find((item) => item.admin_level === 'super_admin' && item.org_id === '');
      const orgAdmin = adminRecords.find((item) => item.org_id === orgId);
      const activeAdmin = superAdmin || orgAdmin;
      if (!activeAdmin) {
        return res.json({ status: 'org_access_denied', message: localeCopy.copy_6fc6c45b56 });
      }
      user = await buildAdminUser(activeAdmin, orgId);
    } else {
      const resolved = await resolveUserInOrganization(openid, orgId);
      if (!resolved) {
        return res.json({ status: 'org_access_denied', message: localeCopy.copy_10d3269bb4 });
      }
      user = await buildUserProfileCrossOrg(resolved.hr, orgId);
    }

    clearOrgAccessCache(openid, orgId, role);

    res.json({
      status: 'success',
      activeOrg: { id: organization.id, name: organization.name },
      user
    });
  } catch (e) {
    if (req.logger) {
      req.logger.error('activateOrganization failed', {
        error: e.message,
        stack: e.stack,
        role: safeString(req.headers['x-role']),
        organizationId: safeString(req.body.organizationId)
      });
    }
    const message = e && e.code === 'ORG_IDENTITY_CONFLICT'
      ? e.message
      : localeCopy.copy_53d5e0a0c8;
    res.json({ status: 'error', message, requestId: req.requestId || '' });
  }
});

// listMyOrganizations — 返回当前用户有绑定的所有组织（普通用户端）
router.post('/listMyOrganizations', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'auth_failed', message: localeCopy.copy_c22a252e97 });

    const availableOrgs = await buildAvailableOrgs(openid, null);
    res.json({ status: 'success', organizations: availableOrgs });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listMyOrganizations — 管理端专用，只查 admin_info
router.post('/admin/listMyOrganizations', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'auth_failed', message: localeCopy.copy_c22a252e97 });

    // 获取管理员绑定记录
    const adminRecords = await adminInfoModel.getAuthorizedByOpenidAcrossOrgs(openid);
    const availableOrgs = await buildAvailableOrgs(openid, adminRecords);

    // system_config 组织排在第一位
    const systemDefaultOrgId = await getSystemDefaultOrgId();
    if (systemDefaultOrgId) {
      availableOrgs.sort((a, b) => {
        if (a.id === systemDefaultOrgId) return -1;
        if (b.id === systemDefaultOrgId) return 1;
        return 0;
      });
    }

    res.json({ status: 'success', organizations: availableOrgs });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// 旧自动绑定确认协议已由统一账号认证取代；保留路径只为旧客户端明确失败。
router.post('/confirmAutoBind', (req, res) => {
  return res.status(410).json({
    status: 'legacy_api_retired',
    message: retiredCopy.copy_0429e2ed3a
  });
});

// bindUserInfo - 普通用户绑定人事信息
router.post('/bindUserInfo', async (req, res) => {
  return res.status(426).json({
    status: 'client_upgrade_required',
    message: localeCopy.copy_bfb0d21b30
  });
});

// bindAdminInfo - 管理员绑定（通过邀请码）
router.post('/bindAdminInfo', async (req, res) => {
  return res.status(426).json({
    status: 'client_upgrade_required',
    message: localeCopy.copy_58b32c9011
  });
});

// 统一账号上线后禁止客户端直接解绑。换绑和人工恢复必须经过统一认证流程，
// 老版本调用同样拒绝，避免通过旧会话绕过会话撤销与安全审计。
router.post('/unbindRole', async (req, res) => {
  return res.status(410).json({
    status: 'recovery_required',
    message: localeCopy.copy_7d3da3e6c7
  });
});

module.exports = router;
