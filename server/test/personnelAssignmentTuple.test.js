'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

process.env.DB_USER = process.env.DB_USER || 'personnel_assignment_tuple_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'personnel_assignment_tuple_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'personnel-assignment-tuple-secret';
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'personnel-assignment-tuple-identity-secret';

const pool = require('../src/config/db');
const unifiedIdentity = require('../src/core/models/unifiedIdentity');

test('未知岗位性质不得静默降级为本会岗位', async () => {
  const originalWithTransaction = pool.withTransaction;
  const queries = [];
  pool.withTransaction = async callback => callback({ query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('organization_dictionary_locks')) return [[]];
    if (sql.includes('FROM assignment_natures')) return [[]];
    throw new Error('unexpected query: ' + sql);
  } });
  try {
    await assert.rejects(
    unifiedIdentity.saveMembershipAssignment({
      organizationId: 'org-1',
      legacyHrId: 'hr-1',
      assignmentKind: 'unexpected',
      departmentId: 'department-1',
      identityId: 'identity-1'
    }),
    (error) => error && error.code === 'assignment_nature_invalid'
    );
    assert.deepEqual(queries.find(item => item.sql.includes('FROM assignment_natures')).params, ['org-1', 'unexpected']);
    assert(!queries.some(item => item.sql.includes('membership_assignments')));
  } finally { pool.withTransaction = originalWithTransaction; }
});

test('同一成员关系内完全相同的在职岗位元组不得重复创建', async () => {
  const originalWithTransaction = pool.withTransaction;
  const executedSql = [];
  pool.withTransaction = async (callback) => callback({
    async query(sql) {
      const source = String(sql);
      executedSql.push(source);
      if (source.includes('organization_dictionary_locks')) return [[]];
      if (source.includes('FROM assignment_natures')) return [[{ id: 'staff', name: '本会岗位' }]];
      if (source.includes('FROM organization_memberships')) {
        return [[{ id: 'membership-1', person_id: 'person-1' }]];
      }
      if (source.includes('SELECT 1 FROM departments')) return [[{ exists: 1 }]];
      if (source.includes('SELECT 1 FROM identities')) return [[{ exists: 1 }]];
      if (source.includes('FROM membership_assignments') && source.includes('COALESCE(work_group_id')) {
        return [[{ id: 'assignment-existing' }]];
      }
      throw new Error('unexpected query: ' + source);
    }
  });

  try {
    await assert.rejects(
      unifiedIdentity.saveMembershipAssignment({
        organizationId: 'org-1',
        legacyHrId: 'hr-1',
        assignmentKind: 'staff',
        departmentId: 'department-1',
        identityId: 'identity-1',
        workGroupId: ''
      }),
      (error) => error && error.code === 'duplicate_assignment' && error.httpStatus === 409
    );
    assert.equal(executedSql.some((sql) => /INSERT INTO membership_assignments/.test(sql)), false);
  } finally {
    pool.withTransaction = originalWithTransaction;
  }
});
