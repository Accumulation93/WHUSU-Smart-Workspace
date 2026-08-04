'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.Behavior = function(definition) {
  return definition;
};

global.wx = {
  getStorageSync: function(key) {
    if (key === 'activeOrgId') return 'org-1';
    if (key === 'activeOrgName') return '测试组织';
    return '';
  },
  showToast: function() {}
};

const behavior = require('../miniprogram/subpackages/scoring/pages/admin/modules/authPersonnelBehavior');
const context = {
  data: Object.assign({}, behavior.data, {
    canVerifyIdentity: true,
    canRecoverAccounts: true,
    canManageAuthPolicy: true,
    selectedHrMemberIds: [],
    hrProfileRows: []
  }),
  setData: function(patch) {
    Object.keys(patch || {}).forEach((key) => {
      this.data[key] = patch[key];
    });
  }
};
Object.assign(context, behavior.methods);

const governance = new Map([['hr-1', {
  id: 'hr-1',
  hrId: 'hr-1',
  personId: 'person-1',
  accountId: 'account-1',
  organizationId: 'org-1',
  auth: {
    status: 'verified',
    hasBindingHistory: true,
    hasRecoveryCode: false,
    activeSessionCount: 1
  }
}], ['hr-2', {
  id: 'hr-2',
  hrId: 'hr-2',
  personId: 'person-2',
  organizationId: 'org-1',
  auth: {
    status: 'pending_verification',
    hasBindingHistory: false,
    hasActiveInvite: false,
    activeSessionCount: 0
  }
}]]);

const merged = context.mergeHrGovernanceRows([
  { id: 'hr-1', name: '甲', studentId: '001' },
  { id: 'hr-2', name: '乙', studentId: '002' }
], governance);
assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[0].authStatusText, '账号正常');
assert.strictEqual(merged[0].recoveryText, '尚未生成恢复码');
assert.strictEqual(merged[1].verificationText, '尚未生成认证码');
assert.strictEqual(merged[1].canSelectForAuth, true);

context._hrProfileRawRows = merged;
context._hrProfileFilteredRows = merged;
context.data.hrProfileRows = merged;
context.toggleHrMemberSelection({ currentTarget: { dataset: { hrId: 'hr-2' } } });
assert.deepStrictEqual(context.data.selectedHrMemberIds, ['hr-2']);
assert.strictEqual(context.data.hrProfileRows[1].selected, true);

context.patchHrGovernance('person-2', { hasActiveInvite: true });
assert.strictEqual(context.data.hrProfileRows[1].auth.hasActiveInvite, true);
assert.strictEqual(context.data.hrProfileRows[1].verificationText, '认证码有效');

const activeTab = context.initializeAuthPersonnel();
assert.strictEqual(activeTab, 'policy');
assert.deepStrictEqual(context.data.authPersonnelTabs.map((item) => item.key), ['policy']);

console.log('成员资料认证与恢复合并测试通过');

const hrRouteSource = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'src', 'core', 'routes', 'hr.js'),
  'utf8'
);
assert.ok(
  !/JOIN\s+organizations\s+o\s+ON[^\n]*o\.status/i.test(hrRouteSource),
  'organizations 表没有 status 字段，人员治理目录不得引用 o.status'
);

const hrInfoBehavior = require('../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior');

(async function verifyGovernanceFailureIsolation() {
  wx.showToast = function(options) {
    throw new Error('unexpected toast: ' + String(options && options.title || ''));
  };
  const isolated = {
    data: {
      canVerifyIdentity: true,
      canRecoverAccounts: true,
      selectedHrMemberIds: [],
      hrProfileFilters: {
        department: '全部部门',
        identity: '全部身份',
        workGroup: '无',
        status: '全部状态',
        keyword: ''
      },
      departmentList: [],
      workGroupList: []
    },
    setData: function(patch) {
      Object.assign(this.data, patch || {});
    },
    setLoading: function() {},
    callCloud: async function(name) {
      assert.strictEqual(name, 'listHrProfileAdminData');
      return {
        status: 'success',
        template: null,
        rows: [{
          id: 'hr-fallback',
          name: '成员',
          studentId: '001',
          departments: [],
          identities: [],
          workGroups: [],
          assignmentCount: 0,
          auditStatus: 'none',
          auditStatusText: '未提交',
          wxBindStatus: 'unbound'
        }]
      };
    },
    loadHrGovernanceRows: async function() {
      throw new Error('governance unavailable');
    }
  };
  Object.assign(isolated, behavior.methods, hrInfoBehavior.methods);
  isolated.loadHrGovernanceRows = async function() {
    throw new Error('governance unavailable');
  };

  await isolated.loadHrProfileAdminData();
  assert.strictEqual(isolated.data.hrProfileRows.length, 1);
  assert.strictEqual(isolated.data.hrProfileRows[0].id, 'hr-fallback');
  assert.strictEqual(isolated.data.hrGovernanceUnavailable, true);
  console.log('成员资料与账号治理故障隔离测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
