// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

// 明确列出入口动作，不按字符串前缀自动纳入后续新增能力。
const MANAGEMENT_RESOURCES = Object.freeze({
  activities: ['scoring.activities'], templates: ['scoring.templates'], rules: ['scoring.rules'],
  results: ['scoring.results', 'scoring.tasks'], publications: ['scoring.publications'],
  hrInfo: ['hr.people', 'hr.import', 'hr.profileReview', 'hr.profileMigration', 'hr.directoryRules', 'auth.identity', 'auth.recovery', 'auth.accounts', 'auth.policy'],
  hrTemplates: ['hr.profileTemplates', 'hr.profileSelection'], departments: ['hr.departments'], workGroups: ['hr.workGroups'],
  identities: ['hr.identities'], admins: ['system.adminAccounts'], settings: ['system.settings', 'system.organizations'],
  auditTemplates: ['audit.templates'], auditStamps: ['audit.stamps'], auditSubmissions: ['audit.submissions'], auditVerification: ['audit.verification'],
  venue: ['venue.resources', 'venue.approvals', 'venue.bookingRules', 'venue.bookingWindows', 'venue.openRules', 'venue.activityRules'],
  bookings: ['venue.bookings'], purposes: ['venue.purposes']
});
const MANAGEMENT_ACTIONS = Object.freeze({
  'scoring.activities': ['read', 'create', 'update', 'delete'], 'scoring.templates': ['read', 'create', 'update', 'delete'],
  'scoring.rules': ['read', 'create', 'update', 'delete'], 'scoring.results': ['read', 'export', 'revoke'],
  'scoring.tasks': ['read', 'export'],
  'scoring.publications': ['read', 'create', 'update', 'delete'],
  'hr.people': ['read', 'create', 'update', 'delete'], 'hr.import': ['read'], 'hr.profileReview': ['read'],
  'hr.directoryRules': ['read', 'create', 'update', 'delete'], 'auth.identity': ['read', 'verify'], 'auth.recovery': ['read', 'update'],
  'auth.accounts': ['read', 'update'], 'auth.policy': ['read', 'update'], 'hr.profileTemplates': ['read', 'create', 'update', 'delete'],
  'hr.profileSelection': ['read', 'update'], 'hr.departments': ['read', 'create', 'update', 'delete'],
  'hr.profileMigration': ['read', 'request', 'approve', 'execute'],
  'hr.workGroups': ['read', 'create', 'update', 'delete'], 'hr.identities': ['read', 'create', 'update', 'delete'],
  'system.adminAccounts': ['read', 'create', 'update', 'delete'], 'system.settings': ['read', 'update'],
  'system.organizations': ['read', 'create', 'update', 'delete'], 'audit.templates': ['read', 'create', 'update', 'delete'],
  'audit.stamps': ['read', 'create', 'update', 'delete'], 'audit.submissions': ['read', 'delete'], 'audit.verification': ['read', 'configure', 'verify'],
  'venue.resources': ['read', 'create', 'update', 'delete'], 'venue.approvals': ['read', 'create', 'update', 'delete'],
  'venue.bookingRules': ['read', 'create', 'update', 'delete'], 'venue.bookingWindows': ['read', 'create'],
  'venue.openRules': ['read', 'create', 'update', 'delete'], 'venue.activityRules': ['read', 'create', 'update', 'delete'],
  'venue.bookings': ['read', 'create', 'update', 'cancel', 'delete'],
  'venue.purposes': ['read', 'create', 'update', 'delete']
});

function managementTabAllowed(access, tab) {
  if (tab === 'pending') return hasCapability(access, 'venue.bookings.approve', true);
  if (!Object.prototype.hasOwnProperty.call(MANAGEMENT_RESOURCES, tab)) return false;
  return MANAGEMENT_RESOURCES[tab].some(resource => MANAGEMENT_ACTIONS[resource]
    .some(action => hasCapability(access, resource + '.' + action, true)));
}

// 仅控制入口显示，不替代服务端逐条记录和字段判断。
function bindAccess(result, context) {
  if (!result || !context || !context.organizationId || !context.contextId || !['user', 'admin'].includes(context.role)
    || !['shadow', 'enforced'].includes(result.mode)
    || result.organizationId !== context.organizationId || result.contextId !== context.contextId
    || result.role !== context.role || !Array.isArray(result.capabilities)
    || !Array.isArray(result.grantedCapabilities)
    || !result.capabilities.every(value => typeof value === 'string')
    || !result.grantedCapabilities.every(value => typeof value === 'string' && result.capabilities.includes(value))) return null;
  return { mode: result.mode, revision: result.revision, organizationId: result.organizationId,
    contextId: result.contextId, role: result.role, capabilities: result.capabilities.slice(),
    grantedCapabilities: result.grantedCapabilities.slice() };
}

function hasCapability(access, capability, management) {
  if (!access || access.mode !== 'enforced' || typeof capability !== 'string') return false;
  const keys = management ? access.grantedCapabilities : access.capabilities;
  return Array.isArray(keys) && keys.includes(capability);
}

const sharedModule = Object.freeze({ bindAccess, hasCapability, managementTabAllowed });

export { bindAccess, hasCapability, managementTabAllowed };
export default sharedModule;
