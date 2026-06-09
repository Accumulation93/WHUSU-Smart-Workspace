const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { safeString, generateId } = require('../utils/helpers');
const { getCurrentOrgId } = require('../utils/orgContext');
const userInfoModel = require('../models/userInfo');
const adminInfoModel = require('../models/adminInfo');
const hrInfoModel = require('../models/hrInfo');

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;
if (!WECHAT_APPID || !WECHAT_SECRET) {
  throw new Error('WECHAT_APPID and WECHAT_SECRET environment variables are required');
}

// userLogin - 微信登录（普通用户）
router.post('/userLogin', async (req, res) => {
  try {
    // Use openid from JWT token if available (already logged in), otherwise exchange code
    let openid = req.openid || '';

    if (!openid) {
      const code = safeString(req.body.code);

      // Exchange code for openid via WeChat API (or use dev fallback)
      openid = safeString(req.body.openid);
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

    // Look up user_info by openid
    const userRecord = await userInfoModel.getByOpenid(openid);

    if (!userRecord || !safeString(userRecord.hr_id)) {
      const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ status: 'need_bind', token });
    }

    // Get HR info with org names
    const hrRecord = await hrInfoModel.getById(userRecord.hr_id);
    if (!hrRecord) {
      return res.json({ status: 'need_bind', message: '绑定的人事信息不存在，请重新绑定' });
    }

    // Resolve ID → name via JOIN (hr_info only stores IDs, not denormalized names)
    const departmentModel = require('../models/department');
    const identityModel = require('../models/identity');
    const workGroupModel = require('../models/workGroup');
    const [deptRecord, identRecord, wgRecord] = await Promise.all([
      hrRecord.department_id ? departmentModel.getById(safeString(hrRecord.department_id)) : null,
      hrRecord.identity_id ? identityModel.getById(safeString(hrRecord.identity_id)) : null,
      hrRecord.work_group_id ? workGroupModel.getById(safeString(hrRecord.work_group_id)) : null
    ]);

    // Build user profile matching original cloud function format
    const user = {
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

    // Generate JWT
    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      status: 'login_success',
      token,
      user
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '登录失败' });
  }
});

// adminLogin - 管理员登录
router.post('/adminLogin', async (req, res) => {
  try {
    // Use openid from JWT token if available (already logged in), otherwise exchange code
    let openid = req.openid || '';

    if (!openid) {
      const code = safeString(req.body.code);
      if (!code) {
        return res.json({ status: 'invalid_params', message: '缺少登录凭证code' });
      }

      openid = safeString(req.body.openid);
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

    const admin = await adminInfoModel.getByOpenid(openid);

    if (!admin) {
      const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        status: 'need_bind',
        token,
        message: '未找到管理员账号，请使用邀请码绑定'
      });
    }

    // Non-root admins must belong to the current organization
    if (admin.admin_level !== 'root_admin') {
      const orgId = await getCurrentOrgId();
      if (!admin.org_id || admin.org_id !== orgId) {
        const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ status: 'need_bind', token, message: '管理员不属于当前组织' });
      }
    }

    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      status: 'login_success',
      token,
      user: {
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
      }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '管理员登录失败' });
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
