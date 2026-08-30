'use strict';

const assert = require('node:assert/strict');

process.env.DB_USER = process.env.DB_USER || 'assignment_dictionary_integrity_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'assignment_dictionary_integrity_test';

const pool = require('../src/config/db');
const integrityModel = require('../src/core/models/assignmentDictionaryIntegrity');
const integrityService = require('../src/core/services/assignmentDictionaryIntegrity');

function assignment(overrides) {
  return Object.assign({
    id: 'assignment-default',
    membership_id: 'membership-default',
    org_id: 'org-1',
    status: 'active',
    department_id: 'department-1',
    identity_id: 'identity-1',
    work_group_id: 'work-group-1',
    department_org_id: 'org-1',
    identity_org_id: 'org-1',
    work_group_org_id: 'org-1',
    work_group_department_id: 'department-1'
  }, overrides || {});
}

async function testModelScopesAllAssignmentStatusesToOrganization() {
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push({ sql: String(sql), params });
    return [[assignment({ status: 'revoked' })]];
  };
  try {
    const rows = await integrityModel.listOrganizationAssignments('org-1');
    assert.strictEqual(rows.length, 1);
    assert.match(queries[0].sql, /FROM membership_assignments assignment_row/);
    assert.doesNotMatch(queries[0].sql, /hr_info/);
    assert.match(queries[0].sql, /WHERE assignment_row\.org_id = \?/);
    assert.doesNotMatch(queries[0].sql, /assignment_row\.status = 'active'/);
    assert.deepStrictEqual(queries[0].params, ['org-1']);
  } finally {
    pool.query = originalQuery;
  }
}

function testCurrentAndHistoricalAssignmentsAreChecked() {
  const stats = integrityService.analyzeAssignments([
    assignment({ id: 'current' }),
    assignment({
      id: 'historical',
      membership_id: 'membership-2',
      status: 'revoked',
      department_id: 'department-history',
      identity_id: 'identity-history',
      work_group_id: '',
      department_org_id: 'org-1',
      identity_org_id: 'org-1',
      work_group_org_id: null,
      work_group_department_id: null
    })
  ], 'org-1');

  assert.strictEqual(stats.checkedMembers, 2);
  assert.strictEqual(stats.checkedAssignments, 2);
  assert.strictEqual(stats.currentAssignments, 1);
  assert.strictEqual(stats.historicalAssignments, 1);
  assert.strictEqual(stats.referencedDepartments, 2);
  assert.strictEqual(stats.referencedIdentities, 2);
  assert.strictEqual(stats.referencedWorkGroups, 1);
  assert.strictEqual(stats.missingDepartments, 0);
  assert.strictEqual(stats.missingIdentities, 0);
  assert.strictEqual(stats.missingWorkGroups, 0);
}

function testMissingAndCrossOrganizationReferencesFailIntegrity() {
  const stats = integrityService.analyzeAssignments([
    assignment({
      id: 'missing-required',
      department_id: '',
      identity_id: '',
      work_group_id: ''
    }),
    assignment({
      id: 'foreign',
      membership_id: 'membership-2',
      department_id: 'department-foreign',
      identity_id: 'identity-foreign',
      work_group_id: 'work-group-foreign',
      department_org_id: 'org-2',
      identity_org_id: 'org-2',
      work_group_org_id: 'org-2',
      work_group_department_id: 'department-foreign'
    }),
    assignment({
      id: 'missing-dictionary',
      membership_id: 'membership-3',
      department_id: 'department-gone',
      identity_id: 'identity-gone',
      work_group_id: 'work-group-gone',
      department_org_id: null,
      identity_org_id: null,
      work_group_org_id: null,
      work_group_department_id: null
    })
  ], 'org-1');

  assert.strictEqual(stats.missingDepartments, 3);
  assert.strictEqual(stats.missingIdentities, 3);
  assert.strictEqual(stats.missingWorkGroups, 2);
  assert.strictEqual(stats.crossOrganizationDepartments, 1);
  assert.strictEqual(stats.crossOrganizationIdentities, 1);
  assert.strictEqual(stats.crossOrganizationWorkGroups, 1);
}

function testWorkGroupMustBelongToAssignmentDepartment() {
  const stats = integrityService.analyzeAssignments([
    assignment({ work_group_department_id: 'department-2' }),
    assignment({
      id: 'historical-mismatch',
      membership_id: 'membership-2',
      status: 'revoked',
      work_group_department_id: 'department-3'
    })
  ], 'org-1');
  assert.strictEqual(stats.wrongDepartmentWorkGroups, 2);
}

(async () => {
  await testModelScopesAllAssignmentStatusesToOrganization();
  testCurrentAndHistoricalAssignmentsAreChecked();
  testMissingAndCrossOrganizationReferencesFailIntegrity();
  testWorkGroupMustBelongToAssignmentDepartment();
  console.log('岗位字典当前/历史事实源与组织归属完整性测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
