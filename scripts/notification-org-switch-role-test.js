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
  path.join(root, 'miniprogram', 'subpackages', 'scoring', 'pages', 'admin', 'adminWorkbenchBehavior.js'),
  'utf8'
);

assert(
  /authContext\.activateOrganizationContext\(organizationId, role\)/.test(activationSource)
    && !/roleProfiles|getStorageSync|commitContext/.test(activationSource),
  '切换组织必须复用统一上下文激活，禁止维护平行角色缓存'
);
assert(
  /workbenchUnload\(\)\s*\{[\s\S]*?eventBus\.off\('org:changed'/.test(adminSource),
  '管理页卸载时必须移除组织切换监听'
);
assert(
  /_onOrgChanged\(event\)\s*\{[\s\S]*?!this\._pageVisible[\s\S]*?\['user', 'admin'\]\.indexOf\(event\.role\) < 0[\s\S]*?this\.workbenchShow\(\)/.test(adminSource),
  '隐藏页和无效角色不得响应切换；已授权普通岗位通过共享入口重新判权'
);
assert(
  /activeRole\s*!==\s*'admin'/.test(adminSource),
  '管理页加载数据前必须校验当前会话仍为管理员身份'
);

console.log('通知切换组织角色隔离测试通过');
