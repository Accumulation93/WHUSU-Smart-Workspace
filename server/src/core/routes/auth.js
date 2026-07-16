const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
  const orgMap = new Map();
  const allOrgs = await organizationModel.getAll();

  // 1. user_info 绑定 — 直接关联的组织
  // 必须校验 hr_id 有效（防止空 hr_id 的僵尸记录泄漏组织访问权）
  const userRecords = await userInfoModel.getByOpenidGlobal(openid);
  const validUserRecords = userRecords.filter(r => safeString(r.hr_id));
  // 批量校验 hr_id 确实存在于对应组织的 hr_info 表中
  if (validUserRecords.length > 0) {
    const hrCheckParams = [];
    const hrCheckConds = validUserRecords.map(r => {
      hrCheckParams.push(r.hr_id, r.org_id);
      return '(id = ? AND org_id = ?)';
    }).join(' OR ');
    const [validHrRows] = await pool.query(
      `SELECT id, org_id FROM hr_info WHERE ${hrCheckConds}`,
      hrCheckParams
    );
    const validOrgIds = new Set(validHrRows.map(r => r.org_id));
    for (const r of validUserRecords) {
      if (validOrgIds.has(r.org_id)) {
        orgMap.set(r.org_id, { role: 'user' });
      }
    }
  }

  // 2. hr_info 匹配 — 跨组织身份识别
  // 收集用户在所有组织中的身份标识（学号+姓名），用于跨组织匹配
  const hrIds = userRecords.filter(r => safeString(r.hr_id)).map(r => r.hr_id);
  if (hrIds.length > 0) {
    const placeholders = hrIds.map(() => '?').join(',');
    const [identityRows] = await pool.query(
      `SELECT DISTINCT student_id, name FROM hr_info WHERE id IN (${placeholders})`,
      hrIds
    );

    if (identityRows.length > 0) {
      // 在所有组织中搜索匹配的 hr_info（相同 studentId + name）
      const conditions = identityRows.map(() => '(h.student_id = ? AND h.name = ?)').join(' OR ');
      const params = [];
      identityRows.forEach(r => { params.push(r.student_id, r.name); });
      const orgPlaceholders = allOrgs.map(() => '?').join(',');
      const [hrRows] = await pool.query(
        `SELECT DISTINCT org_id FROM hr_info h WHERE org_id IN (${orgPlaceholders}) AND (${conditions})`,
        [...allOrgs.map(o => o.id), ...params]
      );

      for (const row of hrRows) {
        if (!orgMap.has(row.org_id)) {
          orgMap.set(row.org_id, { role: 'user' });
        }
      }
    }
  }

  // 3. admin_info 绑定（仅管理端调用；普通用户端传 null 跳过）
  if (adminRecords !== null) {
    const adminRecs = adminRecords || await adminInfoModel.getByOpenidAcrossOrgs(openid);
    for (const r of adminRecs) {
      orgMap.set(r.org_id, { role: 'admin' });
    }

    // root_admin 可以看到所有组织
    const isRoot = adminRecs.some(r => r.admin_level === 'root_admin');
    if (isRoot) {
      for (const org of allOrgs) {
        if (!orgMap.has(org.id)) orgMap.set(org.id, { role: 'admin' });
      }
    }
  }

  return allOrgs
    .filter(org => orgMap.has(org.id))
    .map(org => ({ id: org.id, name: org.name, role: orgMap.get(org.id).role }));
}

// userLogin - 微信登录（普通用户）— 4 层 fallback 智能组织匹配
router.post('/userLogin', async (req, res) => {
  try {
    // Use openid from JWT token if available (already logged in), otherwise exchange code
    let openid = req.openid || '';

    if (!openid) {
      const code = safeString(req.body.code);

      // Exchange code for openid via WeChat API (or use dev fallback)
      openid = ALLOW_DEV_OPENID_LOGIN ? safeString(req.body.openid) : '';
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

    }

    if (!openid) {
      return res.json({ status: 'auth_failed', message: '无法获取用户标识，请重试' });
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

    // ====== 第 4 层：完全找不到 → need_bind ======
    const bindingOrg = systemDefaultOrgId
      ? allOrgs.find((org) => org.id === systemDefaultOrgId)
      : allOrgs[0];
    if (!bindingOrg) {
      return res.json({ status: 'binding_unavailable', token, message: '当前没有可绑定的组织' });
    }
    const bindingContext = await authChallengeModel.create('user_bind', openid, {
      targetOrgId: bindingOrg.id
    });
    return res.json({
      status: 'need_bind',
      token,
      bindingContext,
      bindingOrg: { id: bindingOrg.id, name: bindingOrg.name }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '登录失败' });
  }
});

// adminLogin - 管理员登录（智能组织匹配）
router.post('/adminLogin', async (req, res) => {
  try {
    // Use openid from JWT token if available (already logged in), otherwise exchange code
    let openid = req.openid || '';

    if (!openid) {
      const code = safeString(req.body.code);
      if (!code) {
        return res.json({ status: 'invalid_params', message: '缺少登录凭证code' });
      }

      openid = ALLOW_DEV_OPENID_LOGIN ? safeString(req.body.openid) : '';
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

    }

    if (!openid) {
      return res.json({ status: 'auth_failed', message: '获取openid失败' });
    }

    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    // 获取全局管理员绑定（不受 org 限制）
    const allAdminRecords = await adminInfoModel.getByOpenidAcrossOrgs(openid);

    if (allAdminRecords.length === 0) {
      return res.json({
        status: 'need_bind',
        token,
        message: '未找到管理员账号，请使用邀请码绑定'
      });
    }

    // root_admin 直接登录（默认组织按 system_config 优先级）
    const rootAdmin = allAdminRecords.find(r => r.admin_level === 'root_admin');
    if (rootAdmin) {
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
        user: buildAdminUser(rootAdmin),
        availableOrgs,
        activeOrg: availableOrgs[0] || null
      });
    }

    // 非 root_admin：优先系统默认组织（直接读 system_config）
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
          user: buildAdminUser(matchInDefaultOrg),
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
          user: buildAdminUser(match),
          availableOrgs,
          activeOrg
        });
      }
    }

    // 所有组织都不匹配 → need_bind（管理员不属于任何当前存在的组织）
    return res.json({
      status: 'need_bind',
      token,
      message: '管理员不属于任何当前存在的组织，请使用邀请码绑定'
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '管理员登录失败' });
  }
});

// 构建管理员 user 对象
function buildAdminUser(admin) {
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
    adminLevel: safeString(admin.admin_level)
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
    const role = safeString(req.headers['x-role'] || req.body.role).toLowerCase();

    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });
    if (!orgId || (role !== 'user' && role !== 'admin')) {
      return res.json({ status: 'invalid_params', message: '组织或身份参数无效' });
    }

    const organization = await organizationModel.getById(orgId);
    if (!organization) {
      return res.json({ status: 'not_found', message: '所选组织不存在' });
    }

    let user;
    if (role === 'admin') {
      const adminRecords = await adminInfoModel.getByOpenidAcrossOrgs(openid);
      const rootAdmin = adminRecords.find((item) => item.admin_level === 'root_admin');
      const orgAdmin = adminRecords.find((item) => item.org_id === orgId);
      const activeAdmin = rootAdmin || orgAdmin;
      if (!activeAdmin) {
        return res.json({ status: 'org_access_denied', message: '您不是该组织的管理员' });
      }
      user = buildAdminUser(activeAdmin);
    } else {
      const resolved = await resolveUserInOrganization(openid, orgId);
      if (!resolved) {
        return res.json({ status: 'org_access_denied', message: '该组织中没有匹配的用户身份' });
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
        role: safeString(req.headers['x-role'] || req.body.role),
        organizationId: safeString(req.body.organizationId)
      });
    }
    const message = e && e.code === 'ORG_IDENTITY_CONFLICT'
      ? e.message
      : '组织切换失败，请稍后重试';
    res.json({ status: 'error', message, requestId: req.requestId || '' });
  }
});

// listMyOrganizations — 返回当前用户有绑定的所有组织（普通用户端）
router.post('/listMyOrganizations', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });

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
    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });

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
    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });
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
      return res.json({ status: 'conflict', message: '人事信息已变化，请重新登录确认' });
    }
    const [sourceBindings] = await conn.query(
      'SELECT id FROM user_info WHERE openid = ? AND hr_id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [openid, sourceHr.id, payload.sourceOrgId]
    );
    if (!sourceBindings.length) {
      await conn.rollback();
      return res.json({ status: 'conflict', message: '原组织绑定已变化，请重新登录' });
    }
    const [conflicts] = await conn.query(
      'SELECT id FROM user_info WHERE hr_id = ? AND openid != ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [targetHr.id, openid, payload.targetOrgId]
    );
    if (conflicts.length) {
      await conn.rollback();
      return res.json({ status: 'already_bound', message: '该人事信息已被其他微信绑定' });
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
      return res.json({ status: 'challenge_expired', message: '绑定验证已使用，请重新登录' });
    }
    await conn.commit();
    const targetOrganization = await organizationModel.getById(payload.targetOrgId);
    res.json({
      status: 'success',
      message: '绑定成功',
      activeOrg: { id: payload.targetOrgId, name: targetOrganization ? targetOrganization.name : '' },
      user: await buildUserProfileCrossOrg(targetHr, payload.targetOrgId),
      availableOrgs: await buildAvailableOrgs(openid, null)
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    req.logger.error('confirmAutoBind failed', { error: e.message });
    res.json({ status: 'error', message: '绑定失败，请稍后重试', requestId: req.requestId || '' });
  } finally {
    conn.release();
  }
});

// bindUserInfo - 普通用户绑定人事信息
router.post('/bindUserInfo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = req.openid;
    const studentId = safeString(req.body.studentId);
    const name = safeString(req.body.name);

    if (!openid) {
      return res.json({ status: 'auth_failed', message: '请先登录' });
    }
    if (!studentId || !name) {
      return res.json({ status: 'invalid_params', message: '请提供学号和姓名' });
    }

    await conn.beginTransaction();
    const challenge = await authChallengeModel.lock(conn, req.body.bindingContext, 'user_bind', openid);
    if (challenge.status !== 'success') {
      await conn.rollback();
      return res.json(challenge);
    }
    const targetOrgId = safeString(challenge.payload.targetOrgId);
    const [orgRows] = await conn.query('SELECT id FROM organizations WHERE id = ? LIMIT 1', [targetOrgId]);
    if (!orgRows.length) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '绑定组织不存在' });
    }
    const [hrRows] = await conn.query(
      'SELECT * FROM hr_info WHERE student_id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [studentId, targetOrgId]
    );
    const hrRecord = hrRows[0];
    if (!hrRecord) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '未找到匹配的人事信息，请联系管理员' });
    }

    if (safeString(hrRecord.name) !== name) {
      await conn.rollback();
      return res.json({ status: 'name_mismatch', message: '姓名与人事信息不匹配' });
    }

    // Check if this hr_id is already bound to another WeChat account
    const [conflicts] = await conn.query(
      'SELECT id FROM user_info WHERE hr_id = ? AND openid != ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [hrRecord.id, openid, targetOrgId]
    );
    if (conflicts.length) {
      await conn.rollback();
      return res.json({ status: 'already_bound', message: '该人事信息已被其他微信绑定' });
    }

    const [userRows] = await conn.query(
      'SELECT id FROM user_info WHERE openid = ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [openid, targetOrgId]
    );
    if (userRows.length) {
      await conn.query('UPDATE user_info SET hr_id = ?, updated_at = NOW() WHERE id = ? AND org_id = ?', [hrRecord.id, userRows[0].id, targetOrgId]);
    } else {
      const id = generateId();
      await conn.query('INSERT INTO user_info (id, openid, hr_id, org_id) VALUES (?, ?, ?, ?)', [id, openid, hrRecord.id, targetOrgId]);
    }
    if (!await authChallengeModel.consume(conn, challenge.id)) {
      await conn.rollback();
      return res.json({ status: 'challenge_expired', message: '绑定验证已使用，请重新登录' });
    }
    await conn.commit();

    res.json({
      status: 'success',
      message: '绑定成功',
      hrInfo: {
        id: hrRecord.id,
        name: hrRecord.name,
        studentId: hrRecord.student_id
      },
      activeOrg: { id: targetOrgId }
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    req.logger.error('bindUserInfo failed', { error: e.message });
    res.json({ status: 'error', message: '绑定失败，请稍后重试', requestId: req.requestId || '' });
  } finally {
    conn.release();
  }
});

// bindAdminInfo - 管理员绑定（通过邀请码）
router.post('/bindAdminInfo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = req.openid;
    const inviteCode = safeString(req.body.inviteCode);

    if (!openid) {
      return res.json({ status: 'auth_failed', message: '请先登录' });
    }
    if (!inviteCode) {
      return res.json({ status: 'invalid_params', message: '请提供邀请码' });
    }

    const inviteCodeHash = crypto.createHash('sha256').update(inviteCode.toUpperCase()).digest('hex');
    await conn.beginTransaction();
    const [adminRows] = await conn.query(
      `SELECT *, (invite_expires_at > NOW()) AS invite_valid FROM admin_info
        WHERE invite_code_hash = ?
          AND bind_status = 'invited'
          AND invite_consumed_at IS NULL
        LIMIT 1 FOR UPDATE`,
      [inviteCodeHash]
    );
    const admin = adminRows[0];
    if (!admin) {
      await conn.rollback();
      return res.json({ status: 'invalid_code', message: '邀请码无效' });
    }
    if (!admin.invite_valid) {
      await conn.rollback();
      return res.json({ status: 'invite_expired', message: '邀请码已过期，请联系管理员重新生成' });
    }

    // Only reject if admin already has a different openid bound
    const boundOpenid = safeString(admin.openid);
    if (boundOpenid && boundOpenid !== openid) {
      await conn.rollback();
      return res.json({ status: 'already_bound', message: '该邀请码已被使用' });
    }

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [updateResult] = await conn.query(
      `UPDATE admin_info
          SET openid = ?, bind_status = 'active', bound_at = ?, updated_at = ?,
              invite_code = NULL, invite_code_hash = NULL, invite_consumed_at = ?, invite_expires_at = NULL
        WHERE id = ? AND invite_code_hash = ? AND bind_status = 'invited' AND invite_consumed_at IS NULL`,
      [openid, nowUtc, nowUtc, nowUtc, admin.id, inviteCodeHash]
    );
    if (updateResult.affectedRows !== 1) {
      await conn.rollback();
      return res.json({ status: 'invite_expired', message: '邀请码已失效，请重新获取' });
    }
    await conn.commit();

    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      status: 'success',
      message: '管理员绑定成功',
      token,
      adminLevel: admin.admin_level,
      activeOrg: admin.org_id ? { id: admin.org_id } : null
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    req.logger.error('bindAdminInfo failed', { error: e.message });
    res.json({ status: 'error', message: '绑定失败，请稍后重试', requestId: req.requestId || '' });
  } finally {
    conn.release();
  }
});

// unbindRole - 解绑角色（用户或管理员）
router.post('/unbindRole', async (req, res) => {
  try {
    const openid = req.openid;
    const role = safeString(req.body.role || 'user');

    if (!openid) {
      return res.json({ status: 'auth_failed', message: '请先登录' });
    }

    if (role === 'admin') {
      const admin = await adminInfoModel.getByOpenid(openid);
      if (admin) {
        const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await adminInfoModel.update(admin.id, { bindStatus: 'invited', openid: '', updatedAt: nowUtc });
      }
    } else {
      const user = await userInfoModel.getByOpenid(openid);
      if (user) {
        await userInfoModel.remove(user.id);
      }
    }

    res.json({ status: 'unbind_success', message: '解绑成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '解绑失败' });
  }
});

module.exports = router;
