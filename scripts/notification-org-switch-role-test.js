'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const activationSource = fs.readFileSync(
  path.join(root, 'miniprogram', 'utils', 'organizationActivation.js'),
  'utf8'
);
const adminSource = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'scoring', 'pages', 'admin', 'admin.js'),
  'utf8'
);

assert(
  /authContext\.activateOrganizationContext\(organizationId, role\)/.test(activationSource)
    && !/roleProfiles|getStorageSync|commitContext/.test(activationSource),
  '切换组织必须复用统一上下文激活，禁止维护平行角色缓存'
);
assert(
  /onUnload\(\)\s*\{[\s\S]*?eventBus\.off\('org:changed'/.test(adminSource),
  '管理页卸载时必须移除组织切换监听'
);
assert(
  /_onOrgChanged\(event\)\s*\{[\s\S]*?!this\._pageVisible[\s\S]*?event\.role\s*!==\s*'admin'/.test(adminSource),
  '隐藏的管理页及普通用户身份不得响应管理员组织切换'
);
assert(
  /activeRole\s*!==\s*'admin'/.test(adminSource),
  '管理页加载数据前必须校验当前会话仍为管理员身份'
);

console.log('通知切换组织角色隔离测试通过');
