const assert = require('assert');
const {
  REASONS,
  evaluateVenueApprovalStep
} = require('../src/modules/venue/services/venueApprovalPolicy');

const chairman = {
  id: 'hr-chairman',
  department_id: 'department-chairman',
  work_group_id: '',
  identity_id: 'identity-chairman'
};
const applicant = { ...chairman };
const hrRule = {
  department_scope: 'same',
  specific_department_id: null,
  work_group_scope: 'all',
  specific_work_group_id: null,
  identity_scope: 'specific',
  specific_identity_id: 'identity-leader,identity-chairman'
};
const hrStep = {
  id: 'step-1',
  name: '部门负责人审批',
  approval_mode: 'hr_rule',
  rules: [hrRule]
};
const adminStep = {
  id: 'step-admin',
  name: '管理员审批',
  approval_mode: 'admin_any',
  rules: []
};

function booking(overrides) {
  return {
    approval_flow_id: 'flow-1',
    approval_current_step: 0,
    approval_total_steps: 1,
    approval_snapshots_json: null,
    user_hr_id: chairman.id,
    ...overrides
  };
}

function userActor(profile = chairman) {
  return {
    type: 'user',
    id: profile.id,
    name: '陈逸凡',
    profile
  };
}

const selfApproval = evaluateVenueApprovalStep({
  booking: booking(),
  actor: userActor(),
  steps: [hrStep],
  applicantHrInfo: applicant
});
assert.strictEqual(selfApproval.ok, true, '满足规则的申请人本人应当可以审批');

const dualRoleAdmin = evaluateVenueApprovalStep({
  booking: booking(),
  actor: { type: 'admin', id: 'admin-1', name: '陈逸凡', profile: { id: 'admin-1' } },
  steps: [hrStep],
  applicantHrInfo: applicant
});
assert.strictEqual(dualRoleAdmin.ok, false);
assert.strictEqual(dualRoleAdmin.reason, REASONS.USER_ROLE_REQUIRED);

const adminApproval = evaluateVenueApprovalStep({
  booking: booking(),
  actor: { type: 'admin', id: 'admin-1', profile: { id: 'admin-1' } },
  steps: [adminStep],
  applicantHrInfo: applicant
});
assert.strictEqual(adminApproval.ok, true);

const userCannotApproveAdminStep = evaluateVenueApprovalStep({
  booking: booking(),
  actor: userActor(),
  steps: [adminStep],
  applicantHrInfo: applicant
});
assert.strictEqual(userCannotApproveAdminStep.ok, false);
assert.strictEqual(userCannotApproveAdminStep.reason, REASONS.ADMIN_REQUIRED);

const mismatchedIdentity = evaluateVenueApprovalStep({
  booking: booking(),
  actor: userActor({ ...chairman, identity_id: 'identity-member' }),
  steps: [hrStep],
  applicantHrInfo: applicant
});
assert.strictEqual(mismatchedIdentity.ok, false);
assert.strictEqual(mismatchedIdentity.reason, REASONS.RULE_MISMATCH);

const alreadyApproved = evaluateVenueApprovalStep({
  booking: booking({
    approval_snapshots_json: JSON.stringify([{ approverHrId: chairman.id }])
  }),
  actor: userActor(),
  steps: [hrStep],
  applicantHrInfo: applicant
});
assert.strictEqual(alreadyApproved.ok, false);
assert.strictEqual(alreadyApproved.reason, REASONS.ALREADY_APPROVED);

const invalidBinding = evaluateVenueApprovalStep({
  booking: booking(),
  actor: { type: 'user', id: chairman.id, profile: null },
  steps: [hrStep],
  applicantHrInfo: applicant
});
assert.strictEqual(invalidBinding.ok, false);
assert.strictEqual(invalidBinding.reason, REASONS.INVALID_HR);

console.log('场地审批身份边界与规则授权测试通过');
