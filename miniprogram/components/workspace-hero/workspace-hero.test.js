'use strict';

const assert = require('assert');

const storage = {
  activeRole: 'user',
  activeContextId: 'context-user',
  activeOrgName: '武汉大学学生会',
  accountProfile: { name: '成员甲' },
  roleProfiles: {
    user: {
      name: '成员甲',
      identity: '主席团成员',
      assignmentLabel: '主席团成员 · 主席团'
    }
  },
  authWorkContexts: [{
    contextId: 'context-user',
    role: 'user',
    name: '主席团成员 · 主席团',
    assignmentLabel: '主席团成员 · 主席团'
  }]
};

global.wx = {
  getStorageSync(key) { return storage[key]; },
  pageScrollTo() {}
};

let definition;
global.Component = function(componentDefinition) {
  definition = componentDefinition;
};

require('./workspace-hero');
assert(definition && definition.methods && definition.methods.refresh, 'workspace hero 必须注册 refresh');

function refresh() {
  let patch;
  definition.methods.refresh.call({
    setData(value) { patch = value; }
  });
  return patch;
}

const userView = refresh();
assert.strictEqual(userView.identityName, '主席团成员 · 主席团');
assert.strictEqual(userView.identityDetail, '', '岗位标签已经包含岗位三要素，不得重复显示部门与职能组');

storage.activeRole = 'admin';
storage.activeContextId = 'context-admin';
storage.roleProfiles.admin = { name: '管理员甲', adminLevel: 'admin' };
storage.authWorkContexts = [{
  contextId: 'context-admin',
  role: 'admin',
  name: '人事管理工作上下文'
}];

const adminView = refresh();
assert.strictEqual(adminView.identityName, '人事管理工作上下文');

const localeCopy = require('../../locales/zh-CN/generated/components/workspace-hero/workspace-hero');
assert.strictEqual(localeCopy.copy_0c1ba11af0, '工作上下文加载中');

delete global.Component;
delete global.wx;

console.log('共享工作上下文 Hero 展示测试通过');
