'use strict';

const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');

let session = {
  role: 'user',
  contextId: 'context-user',
  orgName: '武汉大学学生会'
};
let profile = {
  name: '成员甲',
  assignmentLabel: '主席团成员 · 主席团'
};
let workContexts = [{
  contextId: 'context-user',
  role: 'user',
  name: '主席团成员 · 主席团',
  assignmentLabel: '主席团成员 · 主席团'
}];

global.wx = { pageScrollTo() {} };
let definition;
global.Component = function(componentDefinition) { definition = componentDefinition; };

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../utils/orgSession') return { getSnapshot() { return session; } };
  if (request === '../../utils/authContext') {
    return {
      getRuntimeProfile(role) { return role === session.role ? profile : null; },
      getWorkContexts() { return workContexts; }
    };
  }
  if (request === '../../utils/eventBus') return { on() {}, off() {} };
  if (request === '../../utils/trustedNavigation') return { navigateToTrustedRoute() {}, reLaunchTrustedRoute() {} };
  return originalLoad.call(this, request, parent, isMain);
};
require('../miniprogram/components/workspace-hero/workspace-hero');
Module._load = originalLoad;

assert(definition && definition.methods && definition.methods.refresh, 'workspace hero 必须注册 refresh');

function refresh() {
  let patch;
  definition.methods.refresh.call({ setData(value) { patch = value; } });
  return patch;
}

const userView = refresh();
assert.strictEqual(userView.personName, '成员甲');
assert.strictEqual(userView.identityName, '主席团成员 · 主席团');

session = { role: 'admin', contextId: 'context-admin', orgName: '第四十三届学生会' };
profile = { name: '管理员甲', adminLevel: 'super_admin' };
workContexts = [{ contextId: 'context-admin', role: 'admin', name: '超级管理员' }];

const adminView = refresh();
assert.strictEqual(adminView.personName, '管理员甲');
assert.strictEqual(adminView.identityName, '超级管理员');
assert.strictEqual(adminView.organizationName, '第四十三届学生会');

const projectRoot = path.resolve(__dirname, '..');
const workspaceTemplate = fs.readFileSync(
  path.join(projectRoot, 'miniprogram/subpackages/workspace/pages/home/home.wxml'),
  'utf8'
);
const messageTemplate = fs.readFileSync(
  path.join(projectRoot, 'miniprogram/subpackages/message/pages/messageCenter/messageCenter.wxml'),
  'utf8'
);
assert.match(workspaceTemplate, /tone="\{\{isAdminRole \? 'admin' : 'blue'\}\}"/,
  '业务工作台 Hero 必须按当前角色切换主题');
assert.match(messageTemplate, /tone="\{\{isAdminRole \? 'admin' : 'blue'\}\}"/,
  '消息中心 Hero 必须按当前角色切换主题');

delete global.Component;
delete global.wx;

console.log('共享工作角色 Hero 统一会话展示测试通过');
