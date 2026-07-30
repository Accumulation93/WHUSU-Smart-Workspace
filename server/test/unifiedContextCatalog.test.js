const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = 'unified-context-catalog-test-secret';
process.env.WECHAT_APPID = 'test-app';
process.env.WECHAT_SECRET = 'test-secret';

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../middleware/auth') {
    return { JWT_SECRET: process.env.JWT_SECRET };
  }
  if (request === '../models/unifiedIdentity') {
    return { SESSION_MINUTES: 30 };
  }
  if (request === '../models/adminInfo') return {};
  if (request === './adminPermissions') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const unifiedAuth = require('../src/core/services/unifiedAuth');
Module._load = originalLoad;

const contexts = [
  {
    contextId: 'ctx-assignment-a',
    authIdentityId: 'idn-assignment-a',
    identityScope: 'organization',
    identityType: 'assignment',
    identityName: '主席团成员',
    organizationId: 'org-a',
    organizationName: '组织甲',
    role: 'user',
    department: '主席团',
    identity: '主席团成员',
    workGroup: ''
  },
  {
    contextId: 'ctx-assignment-b',
    authIdentityId: 'idn-assignment-b',
    identityScope: 'organization',
    identityType: 'assignment',
    identityName: '学院对接人员',
    organizationId: 'org-b',
    organizationName: '组织乙',
    role: 'user',
    department: '办公室',
    identity: '学院对接人员',
    workGroup: ''
  },
  {
    contextId: 'ctx-admin-a',
    authIdentityId: 'idn-admin-a',
    identityScope: 'organization',
    identityType: 'admin',
    identityName: '管理员',
    organizationId: 'org-a',
    organizationName: '组织甲',
    role: 'admin',
    adminLevel: 'admin'
  },
  {
    contextId: 'ctx-super-a',
    authIdentityId: 'idn-super',
    identityScope: 'global',
    identityType: 'admin',
    identityName: '超级管理员',
    organizationId: 'org-a',
    organizationName: '组织甲',
    role: 'admin',
    adminLevel: 'super_admin'
  },
  {
    contextId: 'ctx-super-b',
    authIdentityId: 'idn-super',
    identityScope: 'global',
    identityType: 'admin',
    identityName: '超级管理员',
    organizationId: 'org-b',
    organizationName: '组织乙',
    role: 'admin',
    adminLevel: 'super_admin'
  }
];

const catalog = unifiedAuth.buildContextCatalog(contexts, contexts[4]);
assert.strictEqual(catalog.organizations.length, 2);
assert.strictEqual(catalog.identities.length, 4);
assert.deepStrictEqual(catalog.selection, {
  organizationId: 'org-b',
  identityId: 'idn-super',
  contextId: 'ctx-super-b'
});

const globalIdentities = catalog.identities.filter((item) => item.scope === 'global');
assert.strictEqual(globalIdentities.length, 1);
assert.strictEqual(globalIdentities[0].identityId, 'idn-super');
assert.strictEqual(globalIdentities[0].organizationId, null);
assert.strictEqual(globalIdentities[0].isCurrent, true);
assert.strictEqual(globalIdentities[0].detail, '可管理全部组织');

const organizationAdmin = catalog.identities.find((item) => item.identityId === 'idn-admin-a');
assert.strictEqual(organizationAdmin.scope, 'organization');
assert.strictEqual(organizationAdmin.organizationId, 'org-a');
assert.strictEqual(Object.prototype.hasOwnProperty.call(catalog.identities[0], 'isPrimary'), false);

console.log('组织与身份目录去重、作用域和当前选择测试通过');
