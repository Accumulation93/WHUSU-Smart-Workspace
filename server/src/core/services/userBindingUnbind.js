const { safeString } = require('../../utils/helpers');

async function unbindUserAcrossOrganizations(options) {
  const hrId = safeString(options && options.hrId);
  const orgId = safeString(options && options.orgId);
  const connection = options && options.connection;
  const bindingModel = (options && options.bindingModel) || require('../models/userInfo');
  if (!hrId || !orgId || !connection) {
    throw new Error('解绑参数不完整');
  }

  const currentBindings = await bindingModel.lockByHrIdInOrg(hrId, orgId, connection);
  const openids = [...new Set((currentBindings || [])
    .map((item) => safeString(item.openid))
    .filter(Boolean))];
  if (!openids.length) return null;

  const affectedBindings = await bindingModel.lockByOpenidsGlobal(openids, connection);
  const affectedCount = await bindingModel.removeByOpenidsGlobal(openids, connection);
  return {
    openids,
    affectedCount,
    affectedOrganizationIds: [...new Set((affectedBindings || [])
      .map((item) => safeString(item.org_id))
      .filter(Boolean))]
  };
}

module.exports = { unbindUserAcrossOrganizations };
