const { safeString } = require('../../utils/helpers');
const userInfoModel = require('../models/userInfo');
const adminInfoModel = require('../models/adminInfo');
const hrInfoModel = require('../models/hrInfo');

const ACTIVE_ROLES = new Set(['user', 'admin']);

/**
 * 按当前请求明确选择的身份解析业务主体。
 * X-Role 只用于选择身份类型，真正的账号与权限始终重新查询数据库。
 */
async function resolveCurrentActor(req) {
  if (req.authContext && req.authAccount) {
    const context = req.authContext;
    if (context.role === 'admin') {
      const admin = context.legacyAdminId
        ? await adminInfoModel.getByIdGlobal(context.legacyAdminId)
        : null;
      if (!admin) {
        return { ok: false, status: 'forbidden', message: '当前管理员身份已失效' };
      }
      return {
        ok: true,
        actor: {
          type: 'admin',
          id: safeString(admin.id),
          openid: safeString(req.openid),
          personId: safeString(context.personId),
          contextId: safeString(context.contextId),
          adminGrantId: safeString(context.adminGrantId),
          adminLevel: safeString(context.adminLevel),
          name: safeString(context.name),
          profile: admin
        }
      };
    }
    const hrId = safeString(context.legacyHrId);
    if (!hrId) return { ok: false, status: 'forbidden', message: '当前岗位身份已失效' };
    const hr = await hrInfoModel.getById(hrId);
    if (!hr) return { ok: false, status: 'forbidden', message: '当前岗位对应的人事信息不存在' };
    const profile = Object.assign({}, hr, {
      department_id: safeString(context.departmentId),
      identity_id: safeString(context.identityId),
      work_group_id: safeString(context.workGroupId)
    });
    return {
      ok: true,
      actor: {
        type: 'user',
        id: hrId,
        openid: safeString(req.openid),
        personId: safeString(context.personId),
        membershipId: safeString(context.membershipId),
        assignmentId: safeString(context.assignmentId),
        contextId: safeString(context.contextId),
        name: safeString(context.name),
        profile
      }
    };
  }

  const activeRole = safeString(req.headers['x-role']).toLowerCase();
  if (!ACTIVE_ROLES.has(activeRole)) {
    return {
      ok: false,
      status: 'invalid_role',
      message: '当前身份无效，请重新选择身份'
    };
  }

  const openid = safeString(req.openid);
  if (!openid) {
    return { ok: false, status: 'auth_failed', message: '请先登录' };
  }

  if (activeRole === 'admin') {
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) {
      return { ok: false, status: 'forbidden', message: '当前管理员身份已失效' };
    }
    return {
      ok: true,
      actor: {
        type: 'admin',
        id: safeString(admin.id),
        openid,
        adminLevel: safeString(admin.admin_level),
        name: safeString(admin.name),
        profile: admin
      }
    };
  }

  const user = await userInfoModel.getByOpenid(openid);
  const hrId = safeString(user && user.hr_id);
  if (!user || !hrId) {
    return { ok: false, status: 'forbidden', message: '当前普通用户身份已失效' };
  }
  const hr = await hrInfoModel.getById(hrId);
  if (!hr) {
    return { ok: false, status: 'forbidden', message: '绑定的人事信息不存在' };
  }
  return {
    ok: true,
    actor: {
      type: 'user',
      id: hrId,
      openid,
      name: safeString(hr.name),
      userInfoId: safeString(user.id),
      profile: hr
    }
  };
}

module.exports = { resolveCurrentActor, ACTIVE_ROLES };
