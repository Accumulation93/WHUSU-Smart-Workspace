const localeCopy = require('../../locales/zh-CN/generated/core/services/currentActor');
const { safeString } = require('../../utils/helpers');
const hrInfoModel = require('../models/hrInfo');
const adminInfoModel = require('../models/adminInfo');

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
        return { ok: false, status: 'forbidden', message: localeCopy.copy_8dd829b03b };
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
    if (!hrId) return { ok: false, status: 'forbidden', message: localeCopy.copy_0fbde52b4b };
    const hr = await hrInfoModel.getById(hrId);
    if (!hr) return { ok: false, status: 'forbidden', message: localeCopy.copy_12799b0f7a };
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

  return {
    ok: false,
    status: 'work_context_required',
    message: localeCopy.copy_10d3269bb4
  };
}

module.exports = { resolveCurrentActor, ACTIVE_ROLES };
