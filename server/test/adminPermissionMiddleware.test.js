const assert = require('assert');
const Module = require('module');

let activeAdmin = null;
let effective = null;
const mocks = {
  '../core/models/adminInfo': {
    async getByOpenid() { return activeAdmin; }
  },
  '../utils/orgContext': {
    async getCurrentOrgId() { return 'org-44'; }
  },
  '../core/services/adminPermissions': {
    ROUTE_RULES: new Map([
      ['/saveScoreActivity', { anyOf: ['scoring.activities'], allowUserRole: false }],
      ['/listHrInfo', { anyOf: ['hr.people', 'scoring.publications'], allowUserRole: false }],
      ['/listHrGovernance', { anyOf: [
        'auth.identity.verify', 'auth.accounts.recover', 'auth.accounts.global_manage'
      ], allowUserRole: false }],
      ['/getCurrentScoreActivity', { anyOf: ['scoring.activities'], allowUserRole: true }],
      ['/listPendingVenueApprovals', { anyOf: ['venue.approvals'], allowUserRole: true }],
      ['/listVenueApprovalHistory', { anyOf: ['venue.approvals'], allowUserRole: true }],
      ['/getVenueApprovalHistoryDetail', { anyOf: ['venue.approvals'], allowUserRole: true }],
      ['/approveVenueBookingStep', { anyOf: ['venue.approvals'], allowUserRole: true }],
      ['/saveVenueApprovalWholeFlow', { anyOf: ['venue.approvals'], allowUserRole: false }]
    ]),
    async loadEffectivePermissions() { return effective; },
    hasAnyPermission(value, keys) {
      return Boolean(value && (value.isSuper || keys.some((key) => value.permissions[key])));
    }
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const { adminPermissionMiddleware } = require('../src/middleware/adminPermission');
Module._load = originalLoad;

async function invoke(path, role) {
  let payload = null;
  let nextCalled = false;
  const req = {
    path,
    openid: 'openid-test',
    get(name) { return name === 'X-Role' ? role : ''; },
    logger: { error() {} }
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  await adminPermissionMiddleware(req, res, () => { nextCalled = true; });
  return { payload, nextCalled, statusCode: res.statusCode };
}

(async () => {
  activeAdmin = { id: 'admin-1', admin_level: 'admin', org_id: 'org-44' };
  effective = { isSuper: false, permissions: { 'scoring.activities': false } };
  const denied = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(denied.nextCalled, false);
  assert.strictEqual(denied.statusCode, 403);
  assert.strictEqual(denied.payload.status, 'permission_denied');

  effective = { isSuper: false, permissions: { 'scoring.activities': true } };
  const allowed = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(allowed.nextCalled, true);

  effective = { isSuper: false, permissions: { 'auth.policy.manage': true } };
  const policyHrDirectoryDenied = await invoke('/api/listHrInfo', 'admin');
  const policyGovernanceDenied = await invoke('/api/listHrGovernance', 'admin');
  assert.strictEqual(policyHrDirectoryDenied.nextCalled, false);
  assert.strictEqual(policyHrDirectoryDenied.statusCode, 403);
  assert.strictEqual(policyGovernanceDenied.nextCalled, false);
  assert.strictEqual(policyGovernanceDenied.statusCode, 403);

  effective = { isSuper: false, permissions: { 'auth.identity.verify': true } };
  assert.strictEqual((await invoke('/api/listHrGovernance', 'admin')).nextCalled, true);
  assert.strictEqual((await invoke('/api/listHrInfo', 'admin')).nextCalled, false);

  effective = { isSuper: false, permissions: { 'hr.people': true } };
  assert.strictEqual((await invoke('/api/listHrInfo', 'admin')).nextCalled, true);
  assert.strictEqual((await invoke('/api/listHrGovernance', 'admin')).nextCalled, false);

  effective = { isSuper: false, permissions: { 'scoring.publications': true } };
  assert.strictEqual((await invoke('/api/listHrInfo', 'admin')).nextCalled, true);
  assert.strictEqual((await invoke('/api/listHrGovernance', 'admin')).nextCalled, false);

  effective = { isSuper: true, permissions: {} };
  const superAllowed = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(superAllowed.nextCalled, true);

  effective = { isSuper: false, permissions: {} };
  const userDenied = await invoke('/api/saveScoreActivity', 'user');
  assert.strictEqual(userDenied.nextCalled, false);
  assert.strictEqual(userDenied.statusCode, 403);
  assert.strictEqual(userDenied.payload.status, 'admin_role_required');
  const missingRoleDenied = await invoke('/api/saveScoreActivity', '');
  assert.strictEqual(missingRoleDenied.nextCalled, false);
  assert.strictEqual(missingRoleDenied.payload.status, 'admin_role_required');
  const sharedUserAllowed = await invoke('/api/getCurrentScoreActivity', 'user');
  assert.strictEqual(sharedUserAllowed.nextCalled, true);
  const venueListUserAllowed = await invoke('/api/listPendingVenueApprovals', 'user');
  assert.strictEqual(venueListUserAllowed.nextCalled, true);
  const venueHistoryUserAllowed = await invoke('/api/listVenueApprovalHistory', 'user');
  assert.strictEqual(venueHistoryUserAllowed.nextCalled, true);
  const venueApprovalUserAllowed = await invoke('/api/approveVenueBookingStep', 'user');
  assert.strictEqual(venueApprovalUserAllowed.nextCalled, true);
  const venueFlowUserDenied = await invoke('/api/saveVenueApprovalWholeFlow', 'user');
  assert.strictEqual(venueFlowUserDenied.nextCalled, false);
  assert.strictEqual(venueFlowUserDenied.payload.status, 'admin_role_required');
  const unknownBypass = await invoke('/api/notMapped', 'admin');
  assert.strictEqual(unknownBypass.nextCalled, true);

  activeAdmin = null;
  const invalidAdmin = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(invalidAdmin.statusCode, 403);
  assert.strictEqual(invalidAdmin.payload.status, 'forbidden');
  console.log('管理员权限中间件路由与拒绝测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
