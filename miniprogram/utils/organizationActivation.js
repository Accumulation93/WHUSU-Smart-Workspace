const { callFunction } = require('./api');
const eventBus = require('./eventBus');
const orgSession = require('./orgSession');

const STORAGE_KEY = 'roleProfiles';

function saveRoleProfile(role, user) {
  if (!role || !user) return;
  const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
  roleProfiles[role] = Object.assign({}, roleProfiles[role] || {}, user);
  wx.setStorageSync(STORAGE_KEY, roleProfiles);
}

async function activateOrganization(organizationId) {
  const role = wx.getStorageSync('activeRole') === 'admin' ? 'admin' : 'user';
  const result = await callFunction({
    name: 'activateOrganization',
    data: { organizationId, role }
  });
  if (result.status !== 'success' || !result.activeOrg) {
    const error = new Error(result.message || '组织切换失败');
    error.status = result.status || 'error';
    throw error;
  }

  saveRoleProfile(role, result.user);
  const activeOrg = result.activeOrg;
  const contextResult = orgSession.commitContext({
    orgId: activeOrg.id,
    orgName: activeOrg.name,
    role
  });
  eventBus.emit('org:changed', {
    orgId: activeOrg.id,
    orgName: activeOrg.name,
    role,
    orgVersion: contextResult.version,
    user: result.user || null
  });
  return {
    activeOrg,
    role,
    user: result.user || null,
    version: contextResult.version
  };
}

module.exports = { activateOrganization, saveRoleProfile };
