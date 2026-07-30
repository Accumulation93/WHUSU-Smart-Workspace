'use strict';

const assert = require('assert');
const Module = require('module');

const queryCalls = [];
const pool = {
  async query(sql, params) {
    queryCalls.push({ sql, params });
    if (sql.includes('JOIN persons p')) {
      return [[{ id: 'person-1', name: '测试成员', student_id: '20260001' }]];
    }
    if (sql.includes('FROM organizations o')) {
      return [[
        {
          membership_id: 'membership-1',
          org_id: 'org-member',
          legacy_hr_id: 'hr-1',
          organization_name: '成员组织'
        },
        {
          membership_id: null,
          org_id: 'org-admin-only',
          legacy_hr_id: null,
          organization_name: '仅管理身份组织'
        }
      ]];
    }
    if (sql.includes('JOIN membership_assignments ma')) return [[]];
    if (sql.includes('FROM admin_grants ag')) {
      return [[{
        id: 'grant-1',
        person_id: 'person-1',
        org_id: 'org-admin-only',
        admin_level: 'admin',
        legacy_admin_id: 'admin-1'
      }]];
    }
    if (sql.includes('FROM departments')) return [[]];
    if (sql.includes('FROM identities')) return [[]];
    if (sql.includes('FROM work_groups')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../config/db') return pool;
  return originalLoad.call(this, request, parent, isMain);
};
const personIdentityOverview = require('../src/core/models/personIdentityOverview');
Module._load = originalLoad;

(async () => {
  const result = await personIdentityOverview.listPersonIdentityData(
    'hr-1',
    ['org-member', 'org-admin-only'],
    ['org-member']
  );
  assert.strictEqual(result.person.id, 'person-1');
  assert.deepStrictEqual(
    result.memberships.map((item) => item.org_id),
    ['org-member', 'org-admin-only'],
    '仅有管理身份、没有普通岗位的组织也必须显示'
  );
  assert.strictEqual(result.grants[0].org_id, 'org-admin-only');
  const organizationQuery = queryCalls.find((item) => item.sql.includes('FROM organizations o'));
  assert(organizationQuery.sql.includes('EXISTS'), '组织列表必须合并管理身份所属组织');
  assert.deepStrictEqual(
    organizationQuery.params,
    ['person-1', 'org-member', 'org-admin-only', 'person-1']
  );
  console.log('人员跨组织岗位与管理身份汇总测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
