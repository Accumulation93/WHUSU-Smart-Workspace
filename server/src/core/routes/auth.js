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
const pool = require('../../config/db');

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

// 构建用户可用的组织列表（user_info + admin_info 去重，标注角色）
async function buildAvailableOrgs(openid, adminRecords) {
  const orgMap = new Map();
  const allOrgs = await organizationModel.getAll();

  // user_info 绑定
  const userRecords = await userInfoModel.getByOpenidGlobal(openid);
  for (const r of userRecords) {
    orgMap.set(r.org_id, { role: 'user' });
  }

  // admin_info 绑定
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
      return res.json({ status: 'need_bind', message: '无法获取用户标识' });
    }

    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    // ====== 第 1 层：当前 org 上下文查找（来自 X-Active-Org 或系统默认） ======
    const userRecord = await userInfoModel.getByOpenid(openid);
    if (userRecord && safeString(userRecord.hr_id)) {
      const hrRecord = await hrInfoModel.getById(userRecord.hr_id);
      if (hrRecord) {
        return res.json({
          status: 'login_success',
          token,
          user: await buildUserProfile(hrRecord),
          availableOrgs: await buildAvailableOrgs(openid, null)
        });
      }
    }

    // ====== 第 2 层：全组织扫描（按 created_at DESC） ======
    const allOrgs = await organizationModel.getAll();
    for (const org of allOrgs) {
      const record = await userInfoModel.getByOpenidInOrg(openid, org.id);
      if (record && safeString(record.hr_id)) {
        const hrRecord = await hrInfoModel.getByIdInOrg(record.hr_id, org.id);
        if (hrRecord) {
          return res.json({
            status: 'login_success',
            token,
            user: await buildUserProfileCrossOrg(hrRecord, org.id),
            availableOrgs: await buildAvailableOrgs(openid, null)
          });
        }
      }
    }

    // ====== 第 3 层：跨组织自动绑定检测 ======
    const globalRecords = await userInfoModel.getByOpenidGlobal(openid);
    if (globalRecords.length > 0) {
      // 找到任意一条有效绑定，提取 studentId 和 name
      for (const record of globalRecords) {
        if (!safeString(record.hr_id)) continue;
        const sourceOrgId = record.org_id;
        const sourceHr = await hrInfoModel.getByIdInOrg(record.hr_id, sourceOrgId);
        if (!sourceHr) continue;

        const studentId = safeString(sourceHr.student_id);
        const name = safeString(sourceHr.name);
        if (!studentId || !name) continue;

        // 检查系统默认组织中是否有相同学号+姓名的人事记录
        const defaultOrgId = await getCurrentOrgId();
        if (defaultOrgId === sourceOrgId) continue; // 同一组织，跳过

        const targetHr = await hrInfoModel.getByStudentIdInOrg(studentId, defaultOrgId);
        if (targetHr && safeString(targetHr.name) === name) {
          // 匹配！返回 auto_bind_available 状态，由前端弹窗确认
          const sourceOrgName = (allOrgs.find(o => o.id === sourceOrgId) || {}).name || sourceOrgId;
          const targetOrgName = (allOrgs.find(o => o.id === defaultOrgId) || {}).name || defaultOrgId;
          return res.json({
            status: 'auto_bind_available',
            token,
            sourceOrg: { id: sourceOrgId, name: sourceOrgName },
            targetOrg: { id: defaultOrgId, name: targetOrgName },
            candidateHrInfo: {
              id: targetHr.id,
              name: targetHr.name,
              studentId: targetHr.student_id
            },
            availableOrgs: await buildAvailableOrgs(openid, null)
          });
        }
      }
    }

    // ====== 第 4 层：完全找不到 → need_bind ======
    return res.json({ status: 'need_bind', token });
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

    // root_admin 直接登录
    const rootAdmin = allAdminRecords.find(r => r.admin_level === 'root_admin');
    if (rootAdmin) {
      const availableOrgs = await buildAvailableOrgs(openid, allAdminRecords);
      return res.json({
        status: 'login_success',
        token,
        user: buildAdminUser(rootAdmin),
        availableOrgs
      });
    }

    // 非 root_admin：优先匹配当前 org（来自 ALS 或系统默认）
    const currentOrgId = await getCurrentOrgId();
    const matchInCurrentOrg = allAdminRecords.find(r => r.org_id === currentOrgId);
    if (matchInCurrentOrg) {
      const availableOrgs = await buildAvailableOrgs(openid, allAdminRecords);
      return res.json({
        status: 'login_success',
        token,
        user: buildAdminUser(matchInCurrentOrg),
        availableOrgs
      });
    }

    // 当前 org 不匹配 → 扫描其他组织（按 created_at DESC）
    const allOrgs = await organizationModel.getAll();
    for (const org of allOrgs) {
      if (org.id === currentOrgId) continue;
      const match = allAdminRecords.find(r => r.org_id === org.id);
      if (match) {
        return res.json({
          status: 'login_success',
          token,
          user: buildAdminUser(match),
          availableOrgs: await buildAvailableOrgs(openid, allAdminRecords)
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

// listMyOrganizations — 返回当前用户有绑定的所有组织
router.post('/listMyOrganizations', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });

    const adminRecords = await adminInfoModel.getByOpenidAcrossOrgs(openid);
    const availableOrgs = await buildAvailableOrgs(openid, adminRecords);
    res.json({ status: 'success', organizations: availableOrgs });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// confirmAutoBind — 用户确认后，在目标组织创建 user_info 绑定
router.post('/confirmAutoBind', async (req, res) => {
  try {
    const openid = req.openid;
    const targetOrgId = safeString(req.body.targetOrgId);
    const hrId = safeString(req.body.hrId);

    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });
    if (!targetOrgId || !hrId) return res.json({ status: 'invalid_params', message: '参数不完整' });

    // 验证 hr 记录在目标组织中确实存在
    const hrRecord = await hrInfoModel.getByIdInOrg(hrId, targetOrgId);
    if (!hrRecord) {
      return res.json({ status: 'not_found', message: '目标组织中未找到该人事信息' });
    }

    // 检查是否已在目标组织绑定
    const existing = await userInfoModel.getByOpenidInOrg(openid, targetOrgId);
    if (existing) {
      // 已绑定，只需更新 hr_id
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await userInfoModel.update(existing.id, hrId, nowUtc);
    } else {
      const id = generateId();
      await userInfoModel.createInOrg(id, openid, hrId, targetOrgId);
    }

    res.json({ status: 'success', message: '绑定成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '绑定失败' });
  }
});

// bindUserInfo - 普通用户绑定人事信息
router.post('/bindUserInfo', async (req, res) => {
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

    // Find HR record by studentId and name
    const hrRecord = await hrInfoModel.getByStudentId(studentId);
    if (!hrRecord) {
      return res.json({ status: 'not_found', message: '未找到匹配的人事信息，请联系管理员' });
    }

    if (safeString(hrRecord.name) !== name) {
      return res.json({ status: 'name_mismatch', message: '姓名与人事信息不匹配' });
    }

    // Check if this hr_id is already bound to another WeChat account
    const conflict = await userInfoModel.getByHrId(hrRecord.id, openid);
    if (conflict) {
      return res.json({ status: 'already_bound', message: '该人事信息已被其他微信绑定' });
    }

    // Create or update user_info binding
    let user = await userInfoModel.getByOpenid(openid);
    if (user) {
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await userInfoModel.update(user.id, hrRecord.id, nowUtc);
    } else {
      const id = generateId();
      await userInfoModel.create(id, openid, hrRecord.id);
      user = { id, hr_id: hrRecord.id };
    }

    res.json({
      status: 'success',
      message: '绑定成功',
      hrInfo: {
        id: hrRecord.id,
        name: hrRecord.name,
        studentId: hrRecord.student_id
      }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '绑定失败' });
  }
});

// bindAdminInfo - 管理员绑定（通过邀请码）
router.post('/bindAdminInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const inviteCode = safeString(req.body.inviteCode);

    if (!openid) {
      return res.json({ status: 'auth_failed', message: '请先登录' });
    }
    if (!inviteCode) {
      return res.json({ status: 'invalid_params', message: '请提供邀请码' });
    }

    const admin = await adminInfoModel.getByInviteCode(inviteCode);
    if (!admin) {
      return res.json({ status: 'invalid_code', message: '邀请码无效' });
    }

    // Only reject if admin already has a different openid bound
    const boundOpenid = safeString(admin.openid);
    if (boundOpenid && boundOpenid !== openid) {
      return res.json({ status: 'already_bound', message: '该邀请码已被使用' });
    }

    // Bind openid
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await adminInfoModel.update(admin.id, {
      openid,
      bindStatus: 'active',
      boundAt: nowUtc,
      updatedAt: nowUtc
    });

    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      status: 'success',
      message: '管理员绑定成功',
      token,
      adminLevel: admin.admin_level
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '绑定失败' });
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
