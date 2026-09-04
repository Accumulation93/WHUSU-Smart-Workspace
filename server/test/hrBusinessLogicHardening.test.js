'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-business-hardening-test-secret';
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'hr-business-hardening-identity-secret';
process.env.DB_USER = process.env.DB_USER || 'hr-business-hardening-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'hr-business-hardening-test';

const domainPolicy = require('../src/core/services/hrDomainPolicy');
const unifiedIdentity = require('../src/core/models/unifiedIdentity');
const pool = require('../src/config/db');
const hrTableImport = require('../src/core/models/hrTableImport');

const hrRouteSource = fs.readFileSync(path.resolve(__dirname, '../src/core/routes/hr.js'), 'utf8');
const profileRouteSource = fs.readFileSync(path.resolve(__dirname, '../src/core/routes/hrProfile.js'), 'utf8');
const governanceSource = fs.readFileSync(path.resolve(__dirname, '../src/core/models/personGovernance.js'), 'utf8');
const hrInfoSource = fs.readFileSync(path.resolve(__dirname, '../src/core/models/hrInfo.js'), 'utf8');
const importSource = fs.readFileSync(path.resolve(__dirname, '../src/core/models/hrTableImport.js'), 'utf8');

function routeSegment(source, routeName) {
  const start = source.indexOf(`router.post('/${routeName}'`);
  assert.notEqual(start, -1, `缺少路由 ${routeName}`);
  const next = source.indexOf('\nrouter.post(', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('岗位性质只接受明确枚举且非法值不得静默回落', async () => {
  assert.equal(domainPolicy.normalizeAssignmentNature('staff'), 'staff');
  assert.equal(domainPolicy.normalizeAssignmentNature(' liaison '), 'liaison');
  assert.equal(domainPolicy.normalizeAssignmentNature('unknown'), '');
  assert.equal(domainPolicy.normalizeAssignmentNature(''), '');

  await assert.rejects(
    unifiedIdentity.saveMembershipAssignment({
      organizationId: 'org-1',
      legacyHrId: 'hr-1',
      assignmentKind: 'unknown',
      departmentId: 'department-1',
      identityId: 'identity-1'
    }),
    (error) => error && error.code === 'assignment_nature_invalid'
  );
});

test('人事资料字符限制按 Unicode 字符而不是 UTF-16 单元计算', () => {
  assert.equal(domainPolicy.countUserCharacters('武汉大学'), 4);
  assert.equal(domainPolicy.countUserCharacters('A😀B'), 3);
  assert.equal(domainPolicy.countUserCharacters('𠀀'), 1);
});

test('全局人员纠错仍需校验目标组织权限和来源成员关系', () => {
  ['previewPersonIdentityCorrection', 'applyPersonIdentityCorrection', 'mergePersons'].forEach((routeName) => {
    const source = routeSegment(hrRouteSource, routeName);
    assert.match(source, /requireAdminOrganizationPermission\(req, organizationId|requireAdminOrganizationPermission\(req, orgId/);
    assert.match(source, /auth\.accounts\.global_manage/);
  });
  assert.match(governanceSource, /WHERE person_id = \? AND org_id = \?/);
  assert.match(governanceSource, /sourceMembershipsInOrganization/);
});

test('人事资料接口不把数据库异常原文返回给用户', () => {
  assert.doesNotMatch(profileRouteSource, /message:\s*safeString\(e\.message\)/);
  assert.match(profileRouteSource, /personnelCopy\.hrProfileOperationFailed/);
});

test('新增和导入不得把已离开成员伪装成成功写入', () => {
  const saveRoute = routeSegment(hrRouteSource, 'saveHrInfo');
  assert.match(saveRoute, /getByStudentIdIncludingFormer/);
  assert.match(saveRoute, /member_reactivation_required/);
  assert.match(hrInfoSource, /getByStudentIdIncludingFormer/);
  assert.match(importSource, /membership_status/);
  assert.match(importSource, /formerMemberImportRequiresReactivation/);
});

test('表格导入把已离开成员列为不可导入记录', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    const text = String(sql);
    if (text.indexOf('FROM departments') >= 0) return [[{ id: 'department-1', name: '办公室' }]];
    if (text.indexOf('FROM identities') >= 0) return [[{ id: 'identity-1', name: '成员' }]];
    if (text.indexOf('FROM work_groups') >= 0) return [[]];
    if (text.indexOf('FROM hr_info h') >= 0) {
      return [[{
        id: 'hr-left',
        name: '离任成员',
        student_id: '20260001',
        department_id: 'department-1',
        identity_id: 'identity-1',
        work_group_id: '',
        membership_status: 'left'
      }]];
    }
    throw new Error(`unexpected query: ${text}`);
  };
  try {
    const prepared = await hrTableImport.prepareHrTableImport({
      headers: ['姓名', '学号', '部门', '身份类别'],
      rows: [['离任成员', '20260001', '办公室', '成员']],
      basicMapping: { name: 0, studentId: 1, department: 2, identity: 3 },
      extensionMapping: []
    }, 'org-1');
    assert.equal(prepared.parsedRows.length, 0);
    assert.equal(prepared.validationErrors.length, 1);
    assert.match(prepared.validationErrors[0].errors[0].error, /重新加入/);
  } finally {
    pool.query = originalQuery;
  }
});
