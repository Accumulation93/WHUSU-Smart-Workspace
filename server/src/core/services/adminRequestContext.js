const { safeString } = require('../../utils/helpers');
const adminInfoModel = require('../models/adminInfo');

/**
 * 从认证中间件已验证的统一会话解析当前管理员。
 * legacy admin_info 只补充兼容字段，不再决定当前组织或管理员级别。
 */
async function resolveCurrentAdmin(req) {
  const context = req && req.authContext;
  if (!context || !req.authAccount || safeString(context.role) !== 'admin') return null;

  const adminLevel = safeString(context.adminLevel);
  const organizationId = safeString(context.organizationId);
  if (!['admin', 'super_admin'].includes(adminLevel) || !organizationId) return null;

  const legacyAdminId = safeString(context.legacyAdminId);
  const legacy = legacyAdminId
    ? await adminInfoModel.getByIdGlobal(legacyAdminId)
    : null;

  return Object.assign({}, legacy || {}, {
    id: legacyAdminId || safeString(context.adminGrantId),
    admin_grant_id: safeString(context.adminGrantId),
    admin_level: adminLevel,
    org_id: adminLevel === 'super_admin' ? '' : organizationId,
    person_id: safeString(context.personId),
    context_id: safeString(context.contextId),
    openid: safeString(req.openid),
    name: safeString(context.name || (legacy && legacy.name)),
    student_id: safeString(context.studentId || (legacy && legacy.student_id))
  });
}

module.exports = { resolveCurrentAdmin };
