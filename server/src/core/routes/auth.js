const localeCopy = require('../../locales/zh-CN/generated/core/routes/auth');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../middleware/auth');
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const userInfoModel = require('../models/userInfo');
const adminInfoModel = require('../models/adminInfo');
const hrInfoModel = require('../models/hrInfo');
const organizationModel = require('../models/organization');
const authChallengeModel = require('../models/authChallenge');
const pool = require('../../config/db');
const { clearOrgAccessCache } = require('../../middleware/orgContext');
const { loadEffectivePermissions } = require('../services/adminPermissions');
const { listAvailableOrganizations } = require('../services/accessibleOrganizations');

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;
if (!WECHAT_APPID || !WECHAT_SECRET) {
  throw new Error('WECHAT_APPID and WECHAT_SECRET environment variables are required');
}

const ALLOW_DEV_OPENID_LOGIN = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_OPENID_LOGIN === '1';

// 构建用户 profile（当前组织内）
async function buildUserProfile(hrRecord) {
  const departmentModel = require('../models/department');
  const identityModel = require('../models/identity');
  const workGroupModel = require('../models/workGroup');
  const [deptRecord, identRecord, wgRecord] = await Promise.all([
    hrRecord.department_id ? departmentModel.getById(safeString(hrRecord.department_id)) : null,
    hrRecord.identity_id ? identityModel.getById(safeString(hrRecord.identity_id)) : null,
    hrRecord.work_group_id ? workGroupModel.getById(safeString(hrRecord.work_group_id)) : null
  ]);
  return {
    id: safeString(hrRecord.id),
    hrId: safeString(hrRecord.id),
    name: safeString(hrRecord.name),
    studentId: safeString(hrRecord.student_id),
    departmentId: safeString(hrRecord.department_id),
    department: deptRecord ? safeString(deptRecord.name) : '',
    identityId: safeString(hrRecord.identity_id),
    identity: identRecord ? safeString(identRecord.name) : '',
    workGroupId: safeString(hrRecord.work_group_id),
    workGroup: wgRecord ? safeString(wgRecord.name) : ''
  };
}

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

// userLogin - 微信登录（普通用户）— 4 层 fallback 智能组织匹配
router.post('/userLogin', async (req, res) => {
  try {
    const code = safeString(req.body.code);
    let openid = ALLOW_DEV_OPENID_LOGIN ? safeString(req.body.openid) : '';
    if (!openid && code) {
      try {
        const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
          params: { appid: WECHAT_APPID, secret: WECHAT_SECRET, js_code: code, grant_type: 'authorization_code' },
          timeout: 3000
        });
        if (wxRes.data && wxRes.data.openid) {
          openid = safeString(wxRes.data.openid);
        }
      } catch (e) {
        req.logger.warn('WeChat API failed in userLogin', { error: e.message });
      }
    }

    if (!openid) {
      return res.json({ status: 'auth_failed', message: localeCopy.copy_b10d64a68c });
    }

    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    const systemDefaultOrgId = await getSystemDefaultOrgId();

    // ====== 第 1 层：系统默认组织（最高优先级，直接读 system_config，不受 X-Active-Org 影响） ======
    if (systemDefaultOrgId) {
      const userRecord = await userInfoModel.getByOpenidInOrg(openid, systemDefaultOrgId);
      if (userRecord && safeString(userRecord.hr_id)) {
        const hrRecord = await hrInfoModel.getByIdInOrg(userRecord.hr_id, systemDefaultOrgId);
        if (hrRecord) {
          const availableOrgs = await buildAvailableOrgs(openid, null);
          const activeOrg = availableOrgs.find((org) => org.id === systemDefaultOrgId) || null;
          return res.json({
            status: 'login_success',
            token,
            user: await buildUserProfileCrossOrg(hrRecord, systemDefaultOrgId),
            availableOrgs,
            activeOrg
          });
        }
      }
    }

    // ====== 第 2 层：全组织扫描（按 created_at DESC，跳过系统默认） ======
    const allOrgs = await organizationModel.getAll();
    for (const org of allOrgs) {
      if (org.id === systemDefaultOrgId) continue; // 第 1 层已检查
      const record = await userInfoModel.getByOpenidInOrg(openid, org.id);
      if (record && safeString(record.hr_id)) {
        const hrRecord = await hrInfoModel.getByIdInOrg(record.hr_id, org.id);
        if (hrRecord) {
          const availableOrgs = await buildAvailableOrgs(openid, null);
          const activeOrg = availableOrgs.find((item) => item.id === org.id) || null;
          return res.json({
            status: 'login_success',
            token,
            user: await buildUserProfileCrossOrg(hrRecord, org.id),
            availableOrgs,
            activeOrg
          });
        }
      }
    }

    // ====== 第 3 层：跨组织自动绑定检测（目标：系统默认组织） ======
    const globalRecords = await userInfoModel.getByOpenidGlobal(openid);
    if (globalRecords.length > 0) {
      for (const record of globalRecords) {
        if (!safeString(record.hr_id)) continue;
        const sourceOrgId = record.org_id;
        const sourceHr = await hrInfoModel.getByIdInOrg(record.hr_id, sourceOrgId);
        if (!sourceHr) continue;

        const studentId = safeString(sourceHr.student_id);
        const name = safeString(sourceHr.name);
        if (!studentId || !name) continue;

        // 检查系统默认组织中是否有相同学号+姓名的人事记录
        if (!systemDefaultOrgId || systemDefaultOrgId === sourceOrgId) continue;

        const targetHr = await hrInfoModel.getByStudentIdInOrg(studentId, systemDefaultOrgId);
        if (targetHr && safeString(targetHr.name) === name) {
          const sourceOrgName = (allOrgs.find(o => o.id === sourceOrgId) || {}).name || sourceOrgId;
          const targetOrgName = (allOrgs.find(o => o.id === systemDefaultOrgId) || {}).name || systemDefaultOrgId;
          const autoBindChallenge = await authChallengeModel.create('auto_bind', openid, {
            sourceOrgId,
            sourceHrId: sourceHr.id,
            targetOrgId: systemDefaultOrgId,
            targetHrId: targetHr.id,
            name,
            studentId
          });
          return res.json({
            status: 'auto_bind_available',
            token,
            autoBindChallenge,
            sourceOrg: { id: sourceOrgId, name: sourceOrgName },
            targetOrg: { id: systemDefaultOrgId, name: targetOrgName },
            sourceUser: {
              id: sourceHr.id,
              hrId: sourceHr.id,
              name: sourceHr.name,
              studentId: sourceHr.student_id
            },
            candidateHrInfo: {
              name: targetHr.name,
              studentId: targetHr.student_id
            },
            availableOrgs: await buildAvailableOrgs(openid, null)
          });
        }
      }
    }

    // 老版本只允许已有绑定继续登录；新认领必须使用统一认证，避免恢复姓名学号直绑。
    return res.status(426).json({
      status: 'client_upgrade_required',
      message: localeCopy.copy_bfb0d21b30
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '请重新微信登录' });
  }
});

// adminLogin - 管理员登录（智能组织匹配）
router.post('/adminLogin', async (req, res) => {
  try {
    const code = safeString(req.body.code);
    if (!code && !ALLOW_DEV_OPENID_LOGIN) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_b10d64a68c });
    }

    let openid = ALLOW_DEV_OPENID_LOGIN ? safeString(req.body.openid) : '';
    if (!openid && code) {
      try {
        const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
          params: { appid: WECHAT_APPID, secret: WECHAT_SECRET, js_code: code, grant_type: 'authorization_code' },
          timeout: 3000
        });
        if (wxRes.data && wxRes.data.openid) {
          openid = safeString(wxRes.data.openid);
        }
      } catch (e) {
        req.logger.warn('WeChat API failed in adminLogin', { error: e.message });
      }
    }

    if (!openid) {
      return res.json({ status: 'auth_failed', message: localeCopy.copy_b10d64a68c });
    }

    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    // 获取全局管理员绑定（不受 org 限制）
    const allAdminRecords = await adminInfoModel.getByOpenidAcrossOrgs(openid);

    if (allAdminRecords.length === 0) {
      return res.status(426).json({
        status: 'client_upgrade_required',
        message: localeCopy.copy_bfb0d21b30
      });
    }

    // 全局超级管理员直接登录（默认组织按 system_config 优先级）
    const superAdmin = allAdminRecords.find(r => r.admin_level === 'super_admin' && r.org_id === '');
    if (superAdmin) {
      const availableOrgs = await buildAvailableOrgs(openid, allAdminRecords);
      // system_config 组织排在第一位，确保前端默认选中
      const systemDefaultOrgId = await getSystemDefaultOrgId();
      if (systemDefaultOrgId) {
        availableOrgs.sort((a, b) => {
          if (a.id === systemDefaultOrgId) return -1;
          if (b.id === systemDefaultOrgId) return 1;
          return 0;
        });
      }
      return res.json({
        status: 'login_success',
        token,
        user: await buildAdminUser(superAdmin, availableOrgs[0] ? availableOrgs[0].id : ''),
        availableOrgs,
        activeOrg: availableOrgs[0] || null
      });
    }

    // 普通管理员优先匹配系统默认组织（直接读 system_config）
    const systemDefaultOrgId = await getSystemDefaultOrgId();
    if (systemDefaultOrgId) {
      const matchInDefaultOrg = allAdminRecords.find(r => r.org_id === systemDefaultOrgId);
      if (matchInDefaultOrg) {
        const availableOrgs = await buildAvailableOrgs(openid, allAdminRecords);
        // system_config 组织排在第一位
        if (systemDefaultOrgId) {
          availableOrgs.sort((a, b) => {
            if (a.id === systemDefaultOrgId) return -1;
            if (b.id === systemDefaultOrgId) return 1;
            return 0;
          });
        }
        return res.json({
          status: 'login_success',
          token,
          user: await buildAdminUser(matchInDefaultOrg, systemDefaultOrgId),
          availableOrgs,
          activeOrg: availableOrgs[0] || null
        });
      }
    }

    // 系统默认不匹配 → 扫描其他组织（按 created_at DESC）
    const allOrgs = await organizationModel.getAll();
    for (const org of allOrgs) {
      if (org.id === systemDefaultOrgId) continue;
      const match = allAdminRecords.find(r => r.org_id === org.id);
      if (match) {
        const availableOrgs = await buildAvailableOrgs(openid, allAdminRecords);
        const activeOrg = availableOrgs.find((item) => item.id === org.id) || null;
        return res.json({
          status: 'login_success',
          token,
          user: await buildAdminUser(match, org.id),
          availableOrgs,
          activeOrg
        });
      }
    }

    // 老版本只兼容已经绑定且组织仍有效的管理员。
    return res.status(426).json({
      status: 'client_upgrade_required',
      message: localeCopy.copy_6a1287aed6
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '请重新微信登录' });
  }
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
    const error = new Error('该组织中的人事身份已绑定其他微信');
    error.code = 'ORG_IDENTITY_CONFLICT';
    throw error;
  }

  if (existing) {
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
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
      const adminRecords = await adminInfoModel.getByOpenidAcrossOrgs(openid);
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
    const adminRecords = await adminInfoModel.getByOpenidAcrossOrgs(openid);
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

// confirmAutoBind — 用户确认后，在目标组织创建 user_info 绑定
router.post('/confirmAutoBind', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'auth_failed', message: localeCopy.copy_c22a252e97 });
    await conn.beginTransaction();
    const challenge = await authChallengeModel.lock(conn, req.body.autoBindChallenge, 'auto_bind', openid);
    if (challenge.status !== 'success') {
      await conn.rollback();
      return res.json(challenge);
    }
    const payload = challenge.payload;
    const [sourceRows] = await conn.query(
      'SELECT id, name, student_id FROM hr_info WHERE id = ? AND org_id = ? FOR UPDATE',
      [payload.sourceHrId, payload.sourceOrgId]
    );
    const [targetRows] = await conn.query(
      'SELECT id, name, student_id FROM hr_info WHERE id = ? AND org_id = ? FOR UPDATE',
      [payload.targetHrId, payload.targetOrgId]
    );
    const sourceHr = sourceRows[0];
    const targetHr = targetRows[0];
    if (!sourceHr || !targetHr || safeString(sourceHr.name) !== safeString(targetHr.name) || safeString(sourceHr.student_id) !== safeString(targetHr.student_id)) {
      await conn.rollback();
      return res.json({ status: 'conflict', message: localeCopy.copy_d0ec43dfe5 });
    }
    const [sourceBindings] = await conn.query(
      'SELECT id FROM user_info WHERE openid = ? AND hr_id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [openid, sourceHr.id, payload.sourceOrgId]
    );
    if (!sourceBindings.length) {
      await conn.rollback();
      return res.json({ status: 'conflict', message: localeCopy.copy_fe40320d45 });
    }
    const [conflicts] = await conn.query(
      'SELECT id FROM user_info WHERE hr_id = ? AND openid != ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [targetHr.id, openid, payload.targetOrgId]
    );
    if (conflicts.length) {
      await conn.rollback();
      return res.json({ status: 'already_bound', message: localeCopy.copy_09ac775d8a });
    }
    const [existingRows] = await conn.query(
      'SELECT id FROM user_info WHERE openid = ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [openid, payload.targetOrgId]
    );
    if (existingRows.length) {
      await conn.query('UPDATE user_info SET hr_id = ?, updated_at = NOW() WHERE id = ? AND org_id = ?', [targetHr.id, existingRows[0].id, payload.targetOrgId]);
    } else {
      await conn.query('INSERT INTO user_info (id, openid, hr_id, org_id) VALUES (?, ?, ?, ?)', [generateId(), openid, targetHr.id, payload.targetOrgId]);
    }
    if (!await authChallengeModel.consume(conn, challenge.id)) {
      await conn.rollback();
      return res.json({ status: 'challenge_expired', message: localeCopy.copy_b10d64a68c });
    }
    await conn.commit();
    const targetOrganization = await organizationModel.getById(payload.targetOrgId);
    res.json({
      status: 'success',
      message: localeCopy.copy_428c455ba9,
      activeOrg: { id: payload.targetOrgId, name: targetOrganization ? targetOrganization.name : '' },
      user: await buildUserProfileCrossOrg(targetHr, payload.targetOrgId),
      availableOrgs: await buildAvailableOrgs(openid, null)
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* 忽略回滚异常 */ }
    req.logger.error('confirmAutoBind failed', { error: e.message });
    res.json({ status: 'error', message: localeCopy.copy_13e7aea070, requestId: req.requestId || '' });
  } finally {
    conn.release();
  }
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
