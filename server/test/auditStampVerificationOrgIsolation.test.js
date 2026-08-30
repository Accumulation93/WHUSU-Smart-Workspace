'use strict';

const assert = require('assert');
const Module = require('module');

function loadWithMocks(modulePath, mocks) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(resolved);
  } finally {
    Module._load = originalLoad;
  }
}

(async () => {
  const assignmentQueries = [];
  let assignmentMode = 'success';
  const assignmentConnection = {
    async query(sql, params) {
      assignmentQueries.push({ sql, params });
      if (sql.includes('FROM identities')) {
        return [assignmentMode === 'identity_missing' ? [] : [{ id: 'identity-current' }]];
      }
      if (sql.includes('SELECT id FROM stamps')) {
        return [assignmentMode === 'stamp_missing'
          ? [{ id: 'stamp-current' }]
          : [{ id: 'stamp-current' }, { id: 'stamp-second' }]];
      }
      return [{ affectedRows: 1 }];
    }
  };
  const assignmentPool = {
    async query(sql, params) {
      assignmentQueries.push({ sql, params });
      return [[]];
    },
    async withTransaction(callback) {
      return callback(assignmentConnection);
    }
  };
  const assignmentModel = loadWithMocks('../src/modules/audit/models/identityStampAssignment', {
    '../../../config/db': assignmentPool,
    '../../../utils/orgContext': { async getCurrentOrgId() { return 'org-current'; } }
  });

  await assignmentModel.getAllGrouped();
  const groupedQuery = assignmentQueries.pop();
  assert(groupedQuery.sql.includes('s.org_id = isa.org_id'), '印章列表不得连接到其他组织的印章');
  assert(groupedQuery.sql.includes('i.org_id = isa.org_id'), '印章授权列表不得连接到其他组织的身份类别');
  assert.deepStrictEqual(groupedQuery.params, ['org-current']);

  await assignmentModel.getByIdentityId('identity-current');
  const identityStampQuery = assignmentQueries.pop();
  assert(identityStampQuery.sql.includes('s.org_id = isa.org_id'),
    '普通用户读取可用印章时不得连接到其他组织的印章');
  assert(identityStampQuery.sql.includes('i.org_id = isa.org_id'),
    '普通用户读取可用印章时必须复核身份类别所属组织');
  assert.deepStrictEqual(identityStampQuery.params, ['identity-current', 'org-current']);

  assignmentMode = 'identity_missing';
  assignmentQueries.length = 0;
  let result = await assignmentModel.replaceForIdentity('identity-foreign', ['stamp-current']);
  assert.strictEqual(result.status, 'identity_not_found');
  assert(!assignmentQueries.some((item) => item.sql.includes('DELETE FROM identity_stamp_assignments')),
    '目标身份类别不属于当前组织时不得改写授权');

  assignmentMode = 'stamp_missing';
  assignmentQueries.length = 0;
  result = await assignmentModel.replaceForIdentity(
    'identity-current',
    ['stamp-current', 'stamp-foreign']
  );
  assert.strictEqual(result.status, 'stamp_not_found');
  assert(!assignmentQueries.some((item) => item.sql.includes('DELETE FROM identity_stamp_assignments')),
    '任一印章不属于当前组织时不得先删除原授权');

  assignmentMode = 'success';
  assignmentQueries.length = 0;
  result = await assignmentModel.replaceForIdentity(
    'identity-current',
    ['stamp-current', 'stamp-second']
  );
  assert.strictEqual(result.status, 'success');
  const assignmentWrites = assignmentQueries.filter((item) => (
    item.sql.includes('DELETE FROM identity_stamp_assignments')
      || item.sql.includes('INSERT INTO identity_stamp_assignments')
  ));
  assert.strictEqual(assignmentWrites.length, 3);
  assignmentWrites.forEach((item) => {
    assert.strictEqual(item.params[item.params.length - 1], 'org-current');
  });

  const permissionQueries = [];
  let permissionMode = 'success';
  const permissionConnection = {
    async query(sql, params) {
      permissionQueries.push({ sql, params });
      if (sql.includes('FROM hr_info h')) {
        return [permissionMode === 'grantee_missing' ? [] : [{ id: 'hr-current' }]];
      }
      if (sql.includes('SELECT id FROM audit_verification_permissions')) {
        return [permissionMode === 'duplicate' ? [{ id: 'permission-existing' }] : []];
      }
      return [{ affectedRows: 1 }];
    }
  };
  const permissionPool = {
    async query(sql, params) {
      permissionQueries.push({ sql, params });
      if (sql.includes('COUNT(*) AS cnt')) return [[{ cnt: 1 }]];
      if (sql.includes('DELETE FROM audit_verification_permissions')) return [{ affectedRows: 1 }];
      return [[]];
    },
    async withTransaction(callback) {
      return callback(permissionConnection);
    }
  };
  const permissionModel = loadWithMocks('../src/modules/audit/models/verificationPermission', {
    '../../../config/db': permissionPool,
    '../../../utils/orgContext': { async getCurrentOrgId() { return 'org-current'; } }
  });

  await permissionModel.getAll();
  let query = permissionQueries.pop();
  assert(query.sql.includes('h.org_id = p.org_id'), '验签授权名单不得读取其他组织人员');
  assert(query.sql.includes("om.status = 'active'"), '验签授权名单只展示当前组织在职成员');
  assert.deepStrictEqual(query.params, ['org-current']);

  await permissionModel.checkPermission('hr-current');
  query = permissionQueries.pop();
  assert(query.sql.includes('p.org_id = ?'), '验签权限判断必须限制当前组织');
  assert(query.sql.includes("om.status = 'active'"), '已离开成员的历史授权不得继续生效');
  assert.deepStrictEqual(query.params, ['hr-current', 'org-current']);

  permissionMode = 'grantee_missing';
  permissionQueries.length = 0;
  result = await permissionModel.create('permission-new', {
    granteeHrId: 'hr-foreign',
    grantedBy: 'admin-current'
  });
  assert.strictEqual(result.status, 'grantee_not_found');
  assert(!permissionQueries.some((item) => item.sql.includes('INSERT INTO audit_verification_permissions')),
    '跨组织人员不得获得当前组织验签权限');

  permissionMode = 'duplicate';
  result = await permissionModel.create('permission-new', {
    granteeHrId: 'hr-current',
    grantedBy: 'admin-current'
  });
  assert.strictEqual(result.status, 'duplicate');

  permissionMode = 'success';
  permissionQueries.length = 0;
  result = await permissionModel.create('permission-new', {
    granteeHrId: 'hr-current',
    grantedBy: 'admin-current'
  });
  assert.strictEqual(result.status, 'success');
  const permissionInsert = permissionQueries.find((item) => (
    item.sql.includes('INSERT INTO audit_verification_permissions')
  ));
  assert(permissionInsert);
  assert.strictEqual(permissionInsert.params[3], 'org-current');

  console.log('审核印章授权与验签权限组织隔离测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
