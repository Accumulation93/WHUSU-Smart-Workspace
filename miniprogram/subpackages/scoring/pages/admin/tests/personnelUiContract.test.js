const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const adminRoot = path.resolve(__dirname, '..');
const wxml = fs.readFileSync(path.join(adminRoot, 'admin.wxml'), 'utf8');
const hrBehavior = fs.readFileSync(path.join(adminRoot, 'modules', 'hrInfoBehavior.js'), 'utf8');
const authBehavior = fs.readFileSync(path.join(adminRoot, 'modules', 'authPersonnelBehavior.js'), 'utf8');

test('岗位编辑器不再展示或提交自由文本岗位名称', () => {
  assert.doesNotMatch(wxml, /membershipAssignmentForm\.title|data-field="title"|assignmentItem\.title/);
  const saveStart = hrBehavior.indexOf("callCloud('saveMembershipAssignment'");
  const saveCall = hrBehavior.slice(saveStart, hrBehavior.indexOf('\n        });', saveStart));
  assert.doesNotMatch(saveCall, /\.\.\.form|title\s*:/);
});

test('账号高危控件只由全局账号治理权限控制', () => {
  assert.doesNotMatch(wxml, /canRecoverAccounts/);
  assert.match(wxml, /canGlobalAccountManage && detailHrGovernance\.canIssueRecovery/);
  assert.match(wxml, /canGlobalAccountManage && detailHrGovernance\.personId/);
  assert.match(authBehavior, /async toggleAuthAccountFrozen\(e\) \{\s+if \(!this\.data\.canGlobalAccountManage\) return;/);
  assert.match(hrBehavior, /async unbindHrWechat\(e\) \{\s+if \(!this\.data\.canGlobalAccountManage\) return;/);
});

test('姓名和学号仅由全局账号治理者通过受控纠错修改', () => {
  assert.match(wxml, /disabled="\{\{!canGlobalAccountManage\}\}" data-field="_name"/);
  assert.match(wxml, /disabled="\{\{!canGlobalAccountManage\}\}" data-field="_studentId"/);
  assert.match(hrBehavior, /onDetailBasicFieldInput\(e\) \{\s+if \(!this\.data\.canGlobalAccountManage\) return;/);
  assert.match(hrBehavior, /hasBasicIdentityChange[\s\S]*if \(!this\.data\.canGlobalAccountManage\) return;[\s\S]*previewPersonIdentityCorrection/);
});

test('自然人合并前先保存本次补充资料且失败时中止合并', () => {
  const helperStart = hrBehavior.indexOf('async _saveCorrectionProfileBeforeMerge(preview)');
  const mergeStart = hrBehavior.indexOf('if (preview.mergeRequired)', helperStart);
  const mergeCall = hrBehavior.indexOf("callCloud('mergePersons'", mergeStart);
  assert.ok(helperStart >= 0);
  assert.match(hrBehavior.slice(helperStart, mergeStart), /callCloud\('saveHrPersonFull'/);
  assert.match(hrBehavior.slice(helperStart, mergeStart), /preview && preview\.current/);
  assert.ok(hrBehavior.indexOf('await this._saveCorrectionProfileBeforeMerge(preview)', mergeStart) < mergeCall);
  assert.match(hrBehavior.slice(mergeStart, mergeCall), /if \(!profileSaved\) return;/);
});

test('资料驳回必须通过受控原因弹窗提交非空原因', () => {
  assert.match(wxml, /profileRejectVisible/);
  assert.match(wxml, /bindinput="onProfileRejectReasonInput"/);
  assert.match(hrBehavior, /const reason = String\(this\.data\.profileRejectReason \|\| ''\)\.trim\(\);/);
  assert.match(hrBehavior, /action: 'reject', reason/);
});

test('离开组织与重新加入入口同时存在', () => {
  assert.match(wxml, /data-mode="former"/);
  assert.match(wxml, /catchtap="reactivateHrMembership"/);
  assert.match(hrBehavior, /callCloud\('listFormerHrMembers'/);
  assert.match(hrBehavior, /callCloud\('reactivateHrMembership'/);
});
