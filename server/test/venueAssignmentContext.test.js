const assert = require('assert');
const Module = require('module');

const assignmentRows = [
  {
    assignment_id: 'assignment-leader', membership_id: 'membership-1', org_id: 'org-1',
    assignment_kind: 'staff', department_id: 'department-1', identity_id: 'identity-leader',
    work_group_id: 'group-1', person_id: 'person-1', legacy_hr_id: 'hr-1',
    person_name: '测试成员', student_id: '20260001', department_name: '办公室',
    identity_name: '部门负责人', work_group_name: '综合组'
  },
  {
    assignment_id: 'assignment-member', membership_id: 'membership-1', org_id: 'org-1',
    assignment_kind: 'staff', department_id: 'department-1', identity_id: 'identity-member',
    work_group_id: 'group-1', person_id: 'person-1', legacy_hr_id: 'hr-1',
    person_name: '测试成员', student_id: '20260001', department_name: '办公室',
    identity_name: '委员', work_group_name: '综合组'
  }
];

const pool = {
  async query(sql, params) {
    if (sql.indexOf('FROM membership_assignments ma') >= 0) {
      if (sql.indexOf('WHERE ma.id = ?') >= 0) {
        return [[assignmentRows.find(function(row) { return row.assignment_id === params[0]; })].filter(Boolean)];
      }
      if (sql.indexOf('WHERE om.legacy_hr_id = ?') >= 0) {
        return [assignmentRows.filter(function(row) {
          return row.legacy_hr_id === params[0] && (!params[1] || row.org_id === params[1]);
        })];
      }
      if (sql.indexOf('WHERE ma.org_id = ?') >= 0) {
        return [assignmentRows.filter(function(row) { return row.org_id === params[0]; })];
      }
    }
    throw new Error('未预期的 SQL: ' + sql);
  }
};

const unifiedIdentityModel = {
  async listContexts() {
    return [{
      role: 'user', contextId: 'ctx-leader', assignmentId: 'assignment-leader',
      membershipId: 'membership-1', personId: 'person-1', legacyHrId: 'hr-1',
      organizationId: 'org-1', departmentId: 'department-1', identityId: 'identity-leader',
      workGroupId: 'group-1', name: '测试成员', department: '办公室', identity: '部门负责人',
      workGroup: '综合组', identityName: '部门负责人 · 办公室 · 综合组'
    }, {
      role: 'admin', contextId: 'ctx-admin-org-2', adminGrantId: 'grant-2', legacyAdminId: 'admin-2',
      personId: 'person-1', organizationId: 'org-2', name: '测试成员', adminLevel: 'org_admin'
    }, {
      role: 'user', identityType: 'membership', contextId: 'ctx-membership', assignmentId: '',
      membershipId: 'membership-1', personId: 'person-1', legacyHrId: 'hr-1',
      organizationId: 'org-1', name: '测试成员'
    }];
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return pool;
  if (request === '../../../core/models/unifiedIdentity') return unifiedIdentityModel;
  return originalLoad.call(this, request, parent, isMain);
};
const contextService = require('../src/modules/venue/services/venueAssignmentContext');
Module._load = originalLoad;

(async function run() {
  const current = await contextService.resolveCurrentActorAssignment({
    type: 'user', id: 'hr-1', personId: 'person-1', assignmentId: 'assignment-leader'
  }, 'org-1');
  assert.strictEqual(current.assignmentId, 'assignment-leader');
  assert.strictEqual(current.identityCategoryId, 'identity-leader');
  const membershipOnly = await contextService.resolveCurrentActorAssignment({
    type: 'user', id: 'hr-1', personId: 'person-1', contextId: 'ctx-membership', assignmentId: ''
  }, 'org-1');
  assert.strictEqual(membershipOnly, null, '无岗位成员上下文不得自动回退到任意岗位');

  const immutable = await contextService.resolveBookingApplicantAssignment({
    id: 'booking-new', user_hr_id: 'hr-1', creator_person_id: 'person-1',
    creator_assignment_id: 'assignment-leader', creator_org_id: 'org-1',
    creator_context_snapshot: JSON.stringify({
      contextId: 'ctx-leader', assignmentId: 'assignment-leader', personId: 'person-1',
      legacyHrId: 'hr-1', organizationId: 'org-1', departmentId: 'department-original',
      identityCategoryId: 'identity-original', departmentName: '原部门', identityCategoryName: '原身份'
    })
  });
  assert.strictEqual(immutable.source, 'snapshot');
  assert.strictEqual(immutable.departmentId, 'department-original', '历史读取不得被岗位当前值覆盖');

  const partialSnapshot = await contextService.resolveBookingApplicantAssignment({
    id: 'booking-partial', user_hr_id: 'hr-1', creator_assignment_id: 'assignment-leader',
    creator_org_id: 'org-1', creator_context_snapshot: JSON.stringify({
      assignmentId: 'assignment-leader', organizationId: 'org-1', departmentName: '历史部门名'
    })
  });
  assert.strictEqual(partialSnapshot.departmentName, '历史部门名', '旧快照已有的展示值必须优先于当前岗位字典');
  assert.strictEqual(partialSnapshot.departmentId, 'department-1', '旧快照缺失的规则字段可从岗位记录兼容补齐');
  assert.strictEqual(partialSnapshot.historicalSnapshotComplete, false, '不完整快照不得伪装成完整历史岗位展示');

  const legacy = await contextService.resolveBookingApplicantAssignment({
    id: 'booking-old', user_hr_id: 'hr-old', creator_org_id: 'org-1'
  });
  assert.strictEqual(legacy, null, '无岗位引用的旧借用不得回读当前 hr_info');

  const candidates = await contextService.listApproverCandidates('org-1');
  assert.strictEqual(candidates.length, 2, '同一人员的每个岗位都必须作为独立候选项');
  assert.deepStrictEqual(
    candidates.map(function(candidate) { return candidate.assignmentId; }).sort(),
    ['assignment-leader', 'assignment-member']
  );
  assert.strictEqual(candidates[0].id, candidates[0].assignmentId, '候选项主键必须是岗位 ID');

  assert.strictEqual(contextService.actorMatchesDesignation({
    id: 'hr-1', personId: 'person-1', assignmentId: 'assignment-leader'
  }, {
    legacyHrId: 'hr-1', personId: 'person-1', assignmentId: 'assignment-leader'
  }), true);
  assert.strictEqual(contextService.actorMatchesDesignation({
    id: 'hr-1', personId: 'person-1', assignmentId: 'assignment-member'
  }, {
    legacyHrId: 'hr-1', personId: 'person-1', assignmentId: 'assignment-leader'
  }), false, '同一自然人的其他岗位不得命中指定岗位');

  const actors = await contextService.listAccountWorkActors('account-1');
  assert.strictEqual(actors.length, 3);
  assert.strictEqual(actors[0].assignmentId, 'assignment-leader');
  assert.strictEqual(actors[1].organizationId, 'org-2');
  assert.strictEqual(actors[2].assignment, null);

  console.log('场地岗位上下文、不可变快照与候选聚合测试通过');
})().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
