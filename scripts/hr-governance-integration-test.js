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

// 整卡批量选择与查看详情必须分流，不能一次点击同时触发两种动作。
const cardActions = [];
const cardContext = { data: { canVerifyIdentity: true },
  toggleHrMemberSelection() { cardActions.push('select'); },
  openHrPersonDetail() { cardActions.push('detail'); } };
behavior.methods.onHrMemberCardTap.call(cardContext, {});
cardContext.data.canVerifyIdentity = false;
behavior.methods.onHrMemberCardTap.call(cardContext, {});
assert.deepStrictEqual(cardActions, ['select', 'detail']);

const governance = new Map([['hr-1', {
  id: 'hr-1',
  hrId: 'hr-1',
  personId: 'person-1',
  accountId: 'account-1',
  organizationId: 'org-1',
  wxBindStatus: 'bound',
  auth: {
    status: 'verified',
    hasBindingHistory: true,
    hasActiveBinding: true,
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
assert.strictEqual(merged[0].accountStateText, '正常');
assert.strictEqual(merged[0].recoveryText, '尚未生成恢复码');
assert.strictEqual(merged[1].verificationText, '尚未生成认证码');
assert.strictEqual(merged[1].canSelectForAuth, true);
assert.strictEqual(merged[1].showVerificationStatus, true);

const priorityRows = context.mergeHrGovernanceRows([
  { id: 'frozen', wxBindStatus: 'bound' },
  { id: 'bound', wxBindStatus: 'bound' },
  { id: 'activation', wxBindStatus: 'pending_activation' },
  { id: 'unbound', wxBindStatus: 'unbound' }
], new Map([
  ['frozen', { id: 'frozen', personId: 'p-frozen', auth: { status: 'frozen', hasBindingHistory: true } }],
  ['bound', { id: 'bound', personId: 'p-bound', auth: { status: 'verified', hasBindingHistory: true } }],
  ['activation', { id: 'activation', personId: 'p-activation', auth: { status: 'verified', hasBindingHistory: true } }],
  ['unbound', { id: 'unbound', personId: 'p-unbound', auth: { status: 'pending_verification', hasBindingHistory: false } }]
]));
assert.deepStrictEqual(priorityRows.map((item) => item.accountStateText), [
  '冻结中', '正常', '正常', '未创建账号'
]);
const independentRows = context.mergeHrGovernanceRows([
  { id: 'password' }, { id: 'wechat' }, { id: 'recovery' }, { id: 'pending' }, { id: 'missing' }
], new Map([
  ['password', { id: 'password', accountId: 'a-password', auth: { status: 'verified', hasPassphrase: true, hasActiveBinding: false } }],
  ['wechat', { id: 'wechat', accountId: 'a-wechat', auth: { status: 'verified', hasActiveBinding: true } }],
  ['recovery', { id: 'recovery', accountId: 'a-recovery', wxBindStatus: 'bound', auth: { status: 'recovery_required', hasActiveBinding: true } }],
  ['pending', { id: 'pending', accountId: 'a-pending', auth: { status: 'pending_verification' } }]
]));
assert.deepStrictEqual(independentRows.map(item => item.accountState), [
  'verified', 'verified', 'recovery_required', 'pending_verification', 'unknown'
]);
assert.strictEqual(independentRows[0].accountStateText, independentRows[1].accountStateText);
assert.strictEqual(independentRows[0].canIssueVerification, false, '口令已认证人员不应重新要求身份认证');
assert.strictEqual(independentRows[0].wxBindStatus, 'unbound', '正常账号不等于已绑定微信');
assert.strictEqual(independentRows[1].wxBindStatus, 'bound');
assert.strictEqual(independentRows[4].accountStateText, '账号状态暂时不可用', '未取得状态不能伪装成无账号');
const directoryUtils = require('../miniprogram/subpackages/scoring/pages/admin/modules/adminUtils');
const normalFilter = directoryUtils.emptyHrProfileFilters();
normalFilter.accountStates = ['verified'];
assert.deepStrictEqual(directoryUtils.applyHrProfileFilters(independentRows, normalFilter).map(item => item.id), ['password', 'wechat']);
context.data.canVerifyIdentity = false;
const recoveryOnlyRows = context.mergeHrGovernanceRows([
  { id: 'hr-1', name: '甲', studentId: '001' },
  { id: 'hr-2', name: '乙', studentId: '002' }
], governance);
assert.strictEqual(recoveryOnlyRows[0].canSelectForAuth, false);
assert.strictEqual(recoveryOnlyRows[1].canSelectForAuth, false);
assert.strictEqual(recoveryOnlyRows[0].canIssueRecovery, true);
context.data.canGlobalAccountManage = false;
const organizationAdminRows = context.mergeHrGovernanceRows([
  { id: 'hr-1', name: '甲', studentId: '001' }
], governance);
assert.strictEqual(organizationAdminRows[0].canSelectForAuth, false);
context.data.canGlobalAccountManage = true;
const globalAccountRows = context.mergeHrGovernanceRows([
  { id: 'hr-1', name: '甲', studentId: '001' }
], governance);
assert.strictEqual(globalAccountRows[0].canSelectForAuth, true);
context.data.canVerifyIdentity = true;

const interactiveRows = context.mergeHrGovernanceRows([
  { id: 'hr-1', name: '甲', studentId: '001' },
  { id: 'hr-2', name: '乙', studentId: '002' }
], governance);
context._hrProfileRawRows = interactiveRows;
context._hrProfileFilteredRows = interactiveRows;
context.data.hrProfileRows = interactiveRows;
context.toggleHrMemberSelection({ currentTarget: { dataset: { hrId: 'hr-2' } } });
assert.deepStrictEqual(context.data.selectedHrMemberIds, ['hr-2']);
assert.strictEqual(context.data.hrProfileRows[1].selected, true);

context.patchHrGovernance('person-2', { hasActiveInvite: true });
assert.strictEqual(context.data.hrProfileRows[1].auth.hasActiveInvite, true);
assert.strictEqual(context.data.hrProfileRows[1].verificationText, '认证码有效');
assert.strictEqual(context.data.hrProfileRows[1].canRevokeVerification, true);

context.invertFilteredHrMembers();
assert.deepStrictEqual(context.data.selectedHrMemberIds, ['hr-1']);
context.clearHrMemberSelection();
assert.deepStrictEqual(context.data.selectedHrMemberIds, []);

console.log('成员资料认证与恢复合并测试通过');

const hrRouteSource = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'src', 'core', 'routes', 'hr.js'),
  'utf8'
);
assert.ok(
  !/JOIN\s+organizations\s+o\s+ON[^\n]*o\.status/i.test(hrRouteSource),
  'organizations 表没有 status 字段，人员治理目录不得引用 o.status'
);

const authRouteSource = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'src', 'core', 'routes', 'unifiedAuth.js'),
  'utf8'
);
const claimsRouteStart = authRouteSource.indexOf("router.post('/admin/auth/claims'");
const recoveriesRouteStart = authRouteSource.indexOf("router.get('/admin/auth/recoveries'");
const verificationRevokeAction = authRouteSource.indexOf("action === 'revoke_codes'", claimsRouteStart);
const verificationRevokeCall = authRouteSource.indexOf('revokeVerificationCodes', claimsRouteStart);
assert.ok(claimsRouteStart >= 0
    && verificationRevokeAction > claimsRouteStart
    && verificationRevokeCall > verificationRevokeAction
    && verificationRevokeCall < recoveriesRouteStart,
  '管理员必须能通过既有认证接口撤销待认领申请的认证码');

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

  // 认证码有效期：默认 48 小时、管理端可在 1–7 天之间手动设置，且每个发码入口
  // 都必须带上该设置（漏传会静默回落到默认值，属于难发现的回归）。
  const authBehaviorSource = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js'),
    'utf8'
  );
  // 只统计认证码入口（admin/auth/claims）；恢复码走 admin/auth/recoveries，是长期
  // 凭证、不带有效期，不能要求它传 expiresInHours。逐行回溯判断归属，避免正则
  // 跨行匹配把两种入口混在一起。
  const issueActions = authBehaviorSource.split(/\r?\n/).filter((line, index, lines) => {
    if (!/action: 'issue_(?:code|codes|invites)'/.test(line)) return false;
    for (let back = index; back >= Math.max(0, index - 4); back -= 1) {
      if (/admin\/auth\/claims/.test(lines[back])) return true;
      if (/admin\/auth\/recoveries/.test(lines[back])) return false;
    }
    return false;
  }).length;
  const validityPassed = (authBehaviorSource.match(/expiresInHours: this\.data\.verificationCodeHours/g) || []).length;
  assert(issueActions > 0 && issueActions === validityPassed,
    '每个认证码发码入口都必须带 expiresInHours，当前 ' + issueActions + ' 个入口只有 ' + validityPassed + ' 个带有效期');

  const adminPageSource = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin/admin.js'),
    'utf8'
  );
  assert(/VERIFICATION_CODE_VALIDITY_DAYS = \[1, 2, 3, 4, 5, 6, 7\]/.test(adminPageSource)
    && /DEFAULT_VERIFICATION_CODE_VALIDITY_INDEX = 1;/.test(adminPageSource)
    && /verificationCodeHours: VERIFICATION_CODE_VALIDITY_DAYS\[DEFAULT_VERIFICATION_CODE_VALIDITY_INDEX\] \* 24/.test(adminPageSource)
    && /onVerificationCodeValidityChange\(e\)\s*\{[\s\S]*?verificationCodeHours: VERIFICATION_CODE_VALIDITY_DAYS\[index\] \* 24/.test(adminPageSource),
  '管理端必须提供 1–7 天的认证码有效期选择，并默认 2 天（48 小时）');
  const directoryControlsSource = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin/components/hrDirectoryControls/hrDirectoryControls.wxml'),
    'utf8'
  );
  assert(/range="\{\{codeValidityOptions\}\}"[\s\S]{0,80}?bindchange="emitCodeValidityChange"/.test(directoryControlsSource),
    '成员目录工具区必须提供认证码有效期选择器');

  const serverModelSource = fs.readFileSync(
    path.join(__dirname, '../server/src/core/models/unifiedIdentity.js'),
    'utf8'
  );
  assert(/const DEFAULT_VERIFICATION_HOURS = 48;/.test(serverModelSource)
    && /const MAX_VERIFICATION_HOURS = 168;/.test(serverModelSource)
    && /Math\.min\(Math\.max\(Math\.round\(parsed\), MIN_VERIFICATION_HOURS\), MAX_VERIFICATION_HOURS\)/.test(serverModelSource),
  '服务端认证码有效期默认必须为 48 小时并限制在 1–168 小时');
  const serverRouteSource = fs.readFileSync(
    path.join(__dirname, '../server/src/core/routes/unifiedAuth.js'),
    'utf8'
  );
  const hoursMetadataUsed = (serverRouteSource.match(/metadataWithHours\(req\)/g) || []).length;
  assert(hoursMetadataUsed >= 3,
    '发码接口必须把管理端提交的有效期传给模型层（issue_invites / issue_code / issue_codes）');

  const migrationFile = fs.readdirSync(path.join(__dirname, '../server/db/deploy'))
    .filter((name) => /_verification_code_ttl_48h\.sql$/.test(name));
  assert.strictEqual(migrationFile.length, 1, '必须存在且只存在一个认证码 48 小时迁移');
  const migrationSql = fs.readFileSync(
    path.join(__dirname, '../server/db/deploy', migrationFile[0]),
    'utf8'
  );
  ['identity_verification_invites', 'identity_verification_tokens'].forEach((table) => {
    assert(new RegExp('UPDATE ' + table + '[\\s\\S]*?INTERVAL 48 HOUR').test(migrationSql),
      '迁移必须把 ' + table + ' 的有效期顺延为 48 小时');
  });
  assert((migrationSql.match(/WHERE status = 'active'/g) || []).length === 2
    && (migrationSql.match(/expires_at < DATE_ADD\(NOW\(\), INTERVAL 48 HOUR\)/g) || []).length === 2,
  '迁移只能顺延仍在使用中的认证码，且必须可安全重试');

  console.log('认证码有效期默认值与手动设置测试通过');

  // 强行删除：只在存在业务历史且用户勾选“已知晓会保留记录并匿名化引用”时才放行；
  // 两条安全红线由服务端始终拦截，前端不得提供任何绕过入口。
  const deletionDialogSource = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin/components/hrPermanentDeletionDialog/hrPermanentDeletionDialog.wxml'),
    'utf8'
  );
  assert(/bindchange="emitForceAcceptance"/.test(deletionDialogSource)
    && /canForce && !preview\.eligible/.test(deletionDialogSource)
    && /hrDeletionForceConfirm/.test(deletionDialogSource)
    && /result\.forced \? localeCopy\.hrDeletionForcedDone/.test(deletionDialogSource),
  '永久删除弹窗必须提供强行删除勾选、按钮文案与强制执行结果提示');
  const deletionBehaviorSource = fs.readFileSync(
    path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js'),
    'utf8'
  );
  assert(/const forced = !preview\.eligible && Boolean\(this\.data\.hrPermanentDeletionCanForce\)/.test(deletionBehaviorSource)
    && /if \(forced && !this\.data\.hrPermanentDeletionForceAccepted\) return;/.test(deletionBehaviorSource)
    && /force: forced,/.test(deletionBehaviorSource),
  '强行删除必须由勾选门控并把 force 传给服务端');
  assert(!/hrPermanentDeletionForceAccepted: true/.test(deletionBehaviorSource)
    && !/hrPermanentDeletionCanForce: true/.test(deletionBehaviorSource),
  '强行删除的勾选与可强删标记不得被前端预置为 true，必须由服务端预检与用户操作决定');
  console.log('强行删除入口与脱敏展示契约测试通过');
  console.log('成员资料与账号治理故障隔离测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
