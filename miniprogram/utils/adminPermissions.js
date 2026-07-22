const { callFunction } = require('./api');

const STORAGE_KEY = 'roleProfiles';

const TAB_PERMISSION_MAP = {
  activities: ['scoring.activities'],
  templates: ['scoring.templates'],
  rules: ['scoring.rules'],
  results: ['scoring.results'],
  publications: ['scoring.publications'],
  hrInfo: ['hr.people', 'hr.import', 'hr.profile_review', 'hr.profile_templates.manage', 'hr.profile_templates.select'],
  departments: ['hr.departments'],
  workGroups: ['hr.work_groups'],
  identities: ['hr.identities'],
  admins: ['system.admin_accounts.read', 'system.admin_accounts.write'],
  settings: ['system.settings', 'system.organizations'],
  auditTemplates: ['audit.templates'],
  auditStamps: ['audit.stamps'],
  auditSubmissions: ['audit.submissions'],
  auditVerification: ['audit.verification']
};

const VENUE_TAB_PERMISSION_MAP = {
  venue: ['venue.resources'],
  bookings: ['venue.bookings', 'venue.approvals'],
  purposes: ['venue.purposes']
};

const PORTAL_PERMISSION_MAP = {
  scoring: ['scoring.activities', 'scoring.templates', 'scoring.rules', 'scoring.results', 'scoring.publications'],
  hr: ['hr.people', 'hr.import', 'hr.profile_review', 'hr.profile_templates.manage', 'hr.profile_templates.select', 'hr.departments', 'hr.work_groups', 'hr.identities'],
  system: ['system.admin_accounts.read', 'system.admin_accounts.write', 'system.settings', 'system.organizations'],
  audit: ['audit.templates', 'audit.stamps', 'audit.submissions', 'audit.verification'],
  venue: ['venue.resources', 'venue.bookings', 'venue.approvals', 'venue.purposes']
};

function getAdminProfile() {
  const profiles = wx.getStorageSync(STORAGE_KEY) || {};
  return profiles.admin || null;
}

function hasAny(profile, keys) {
  if (!profile) return false;
  if (profile.adminLevel === 'super_admin') return true;
  const permissions = profile.permissions;
  // 普通管理员权限状态缺失时默认拒绝，等待服务端刷新后再开放入口。
  if (!permissions || typeof permissions !== 'object') return false;
  return (keys || []).some(function(key) { return permissions[key] === true; });
}

function canAccessPermissionSystem(profile) {
  if (!profile) return false;
  if (profile.adminLevel === 'super_admin') return true;
  return profile.adminLevel === 'admin'
    && Boolean(profile.canAccessPermissionSystem
      || (profile.permissions && profile.permissions['permissions.manage_regular_admins']));
}

function savePermissionState(result) {
  const profiles = wx.getStorageSync(STORAGE_KEY) || {};
  if (!profiles.admin) return null;
  profiles.admin = Object.assign({}, profiles.admin, {
    adminLevel: result.adminLevel || profiles.admin.adminLevel,
    permissions: result.permissions || {},
    permissionKeys: result.permissionKeys || [],
    canAccessPermissionSystem: Boolean(result.canAccessPermissionSystem)
  });
  wx.setStorageSync(STORAGE_KEY, profiles);
  return profiles.admin;
}

async function refreshMyPermissions() {
  const result = await callFunction({ name: 'getMyAdminPermissions', data: {} });
  if (result.status !== 'success') {
    const error = new Error(result.message || '读取管理员权限失败');
    error.status = result.status;
    throw error;
  }
  return savePermissionState(result);
}

function filterTabs(tabs, profile, map) {
  const permissionMap = map || TAB_PERMISSION_MAP;
  return (tabs || []).filter(function(tab) {
    return hasAny(profile, permissionMap[tab] || []);
  });
}

function filterPortalCards(cards, profile) {
  return (cards || []).filter(function(card) {
    if (card.key === 'permissions') return canAccessPermissionSystem(profile);
    return hasAny(profile, PORTAL_PERMISSION_MAP[card.key] || []);
  });
}

module.exports = {
  TAB_PERMISSION_MAP,
  VENUE_TAB_PERMISSION_MAP,
  PORTAL_PERMISSION_MAP,
  getAdminProfile,
  hasAny,
  canAccessPermissionSystem,
  refreshMyPermissions,
  filterTabs,
  filterPortalCards
};
