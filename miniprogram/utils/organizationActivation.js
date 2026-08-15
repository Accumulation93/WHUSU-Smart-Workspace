const localeCopy = require('../locales/zh-CN/generated/utils/organizationActivation');
const { callFunction } = require('./api');
const eventBus = require('./eventBus');
const orgSession = require('./orgSession');
const authContext = require('./authContext');

const STORAGE_KEY = 'roleProfiles';

function saveRoleProfile(role, user) {
  if (!role || !user) return;
  const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
  // 组织内角色资料必须整体替换，不能把上一组织的权限或身份字段带入新组织。
  roleProfiles[role] = Object.assign({}, user);
  wx.setStorageSync(STORAGE_KEY, roleProfiles);
}

async function activateOrganization(organizationId) {
  const role = wx.getStorageSync('activeRole') === 'admin' ? 'admin' : 'user';
  if (wx.getStorageSync('activeContextId')) {
    const activated = await authContext.activateOrganizationContext(organizationId, role);
    return {
      activeOrg: {
        id: activated.context.organizationId,
        name: activated.context.organizationName
      },
      role: activated.context.role,
      user: activated.user,
      version: activated.version,
      context: activated.context
    };
  }
  const result = await callFunction({
    name: 'activateOrganization',
    data: { organizationId, role }
  });
  if (result.status !== 'success' || !result.activeOrg) {
    const error = new Error(result.message || localeCopy.copy_53d5e0a0c8);
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
