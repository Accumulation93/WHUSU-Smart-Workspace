const { callFunction } = require('./api');
const { bindAccess } = require('./authorizationAccessView');
const orgSession = require('./orgSession');
const copy = require('../locales/zh-CN/generated/utils/adminPermissions');

async function readCurrentAuthorizationAccess() {
  const snapshot = orgSession.getSnapshot();
  const result = await callFunction({ name: 'getCurrentAuthorizationAccess', data: {} });
  if (!orgSession.isCurrent(snapshot)) return null;
  if (!result || result.status !== 'success') throw new Error(result && result.message || copy.copy_e52119b17e);
  const access = bindAccess(result, { organizationId: snapshot.orgId, contextId: snapshot.contextId, role: snapshot.role });
  if (!access) throw new Error(copy.copy_e52119b17e);
  return access;
}

module.exports = { readCurrentAuthorizationAccess };
