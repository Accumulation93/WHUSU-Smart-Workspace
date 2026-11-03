'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js');

function load(callFunction) {
  let active = true;
  const sandbox = { module: { exports: {} }, Behavior: value => value, console,
    require(name) {
      if (name.endsWith('/utils/api')) return { callFunction, showShortToast() {}, getErrorText: () => '' };
      if (name.endsWith('/utils/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => active, getSnapshot: () => ({ orgId: 'org-a' }) };
      return require(path.resolve(path.dirname(filename), name));
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  const behavior = sandbox.module.exports;
  const page = { data: { ...behavior.data }, setData(patch) { Object.assign(this.data, patch); }, ...behavior.methods };
  return { page, hide() { active = false; } };
}

test('批次中断保留已生成凭据，缺少返回项与网络异常明确为待确认', async () => {
  let calls = 0;
  const { page } = load(async ({ data }) => {
    calls++;
    if (calls === 2) throw new Error('backend_private_message');
    return { status: 'success', issued: data.claimIds.slice(0, 49).map(claimId => ({ claimId, verificationCode: 'test-code' })) };
  });
  const ids = Array.from({ length: 51 }, (_, index) => 'claim-' + index);
  page._hrProfileRawRows = ids.map((id, index) => ({ name: 'member-' + index, auth: { pendingClaimId: id } }));
  const result = await page.runBatchedAuthAction({ name: 'admin/auth/claims', action: 'issue_codes', idField: 'claimIds', ids, batchSize: 50 });
  assert.equal(result.completedIds.length, 49);
  assert.equal(result.results[0].issued.length, 49);
  assert.equal(page.data.authBatchOutcome.rows.filter(row => row.state === 'unknown').length, 2);
  assert.equal(page.data.authBatchOutcome.rows.find(row => row.key.endsWith('claim-50')).name, 'member-50');
  assert.equal(JSON.stringify(page.data.authBatchOutcome).includes('test-code'), false);
  assert.equal(JSON.stringify(page.data.authBatchOutcome).includes('backend_private_message'), false);
});

test('明确拒绝保留人员结果；角色失效后不再发起后续批次或写入结果', async () => {
  let calls = 0;
  const fixture = load(async () => {
    calls++;
    if (calls === 2) fixture.hide();
    return { status: 'forbidden', message: 'backend_private_message' };
  });
  fixture.page._authAccountsRaw = [{ accountId: 'a', name: 'member-a' }];
  await assert.rejects(fixture.page.runBatchedAuthAction({ name: 'admin/auth/recoveries', action: 'revoke_codes', idField: 'accountIds', ids: ['a', 'b', 'c'], batchSize: 1 }), error => error.silent === true);
  assert.equal(calls, 2);
  assert.equal(fixture.page.data.authBatchOutcome.rows.length, 1);
  assert.equal(fixture.page.data.authBatchOutcome.rows[0].state, 'rejected');
});

test('成员混合认证操作后半失败仍显示前半已生成码，切角色则整次停止', async () => {
  let calls = 0;
  const fixture = load(async () => {
    calls++;
    if (calls === 2) throw new Error('network_failed');
    return { status: 'success', issued: [{ claimId: 'claim-a', verificationCode: 'test-code' }] };
  });
  const rows = [{ id: 'hr-a', personId: 'person-a', name: 'member-a', canIssueVerification: true, auth: { pendingClaimId: 'claim-a' } },
    { id: 'hr-b', personId: 'person-b', name: 'member-b', canIssueVerification: true, auth: {} }];
  fixture.page._hrProfileRawRows = rows;
  fixture.page.getSelectedHrGovernanceRows = () => rows;
  fixture.page.patchHrGovernanceBatch = () => {};
  fixture.page.refreshHrMemberSelection = () => {};
  await fixture.page.issueSelectedHrVerificationCodes();
  assert.equal(fixture.page.data.authIssuedCodes.length, 1);
  assert.equal(fixture.page.data.showAuthCodeDialog, true);
  assert.equal(fixture.page.data.authBatchOutcome.rows.find(row => row.name === 'member-b').state, 'unknown');

  let staleCalls = 0;
  const stale = load(async () => { staleCalls++; stale.hide(); return { status: 'success', issued: [{ claimId: 'claim-a', verificationCode: 'secret-test-code' }] }; });
  stale.page.getSelectedHrGovernanceRows = () => rows;
  stale.page.patchHrGovernanceBatch = () => { throw new Error('stale UI update'); };
  await stale.page.issueSelectedHrVerificationCodes();
  assert.equal(staleCalls, 1);
  assert.equal(stale.page.data.showAuthCodeDialog, false);
  assert.equal(stale.page.data.authIssuedCodes.length, 0);
});
