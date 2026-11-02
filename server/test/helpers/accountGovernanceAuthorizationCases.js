'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function accountGovernanceAuthorizationCases(db) {
  process.env.WECHAT_APPID = process.env.WECHAT_APPID || 'isolated-governance-test';
  process.env.WECHAT_SECRET = process.env.WECHAT_SECRET || 'isolated-test-not-a-real-secret';
  // 使用前一管理身份用例的隔离账号，验证真实路由和事务保存，不访问生产。
  const policy = { id: 'admin-policy', organizationId: 'admin-auth', effect: 'allow', enabled: true, subjects: [{ kind: 'adminGrants', ids: ['admin-grant'] }],
    capabilities: ['auth.identity.read', 'auth.identity.verify', 'auth.policy.read', 'auth.policy.update'],
    scopes: [{ kind: 'organization' }], fields: null };
  await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify(policy), 'admin-policy']);
  await db.query(`INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('governance-other-hr','新增管理身份','ADMIN-B','other');
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('governance-other','admin-target','other','governance-other-hr');
    INSERT INTO identity_claim_requests(id,person_id,requested_org_id,openid_hash,expires_at) VALUES
      ('governance-claim','admin-target','admin-auth','',UTC_TIMESTAMP()+INTERVAL 1 DAY),
      ('governance-other-claim','admin-target','other','',UTC_TIMESTAMP()+INTERVAL 1 DAY)`);
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.authAccount = { id: 'admin-account', personId: 'admin-actor' };
    req.authSession = { id: 'admin-session' };
    req.authContext = { personId: 'admin-actor', contextId: 'admin-context', organizationId: 'admin-auth', role: 'admin',
      adminGrantId: 'admin-grant', adminLevel: 'admin' };
    req.logger = { error: (...args) => console.error(...args) }; next();
  });
  app.use('/api', require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use('/api', require('../../src/core/routes/unifiedAuth'));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  async function call(name, body) {
    const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/admin/auth/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return { code: response.status, data: await response.json() };
  }
  try {
    const listed = await call('claims', { action: 'list' });
    assert.equal(listed.code, 200);
    assert.deepEqual(listed.data.list.map(row => row.claimId || row.id), ['governance-claim']);
    assert.equal((await call('claims', { action: 'list', organizationId: 'other' })).code, 403);
    assert.equal((await call('claims', { action: 'issue_code', claimId: 'governance-other-claim' })).code, 403);
    const issued = await call('claims', { action: 'issue_code', claimId: 'governance-claim' });
    assert.equal(issued.data.status, 'success');
    assert.equal((await db.query("SELECT id FROM identity_verification_tokens WHERE claim_request_id='governance-claim' AND status='active'"))[0].length, 1);
    assert.equal((await call('claims', { action: 'revoke_codes', claimIds: ['governance-claim', 'governance-other-claim'] })).code, 403);
    assert.equal((await db.query("SELECT id FROM identity_verification_tokens WHERE claim_request_id='governance-claim' AND status='active'"))[0].length, 1);
    assert.equal((await call('claims', { action: 'revoke_codes', claimIds: ['governance-claim'] })).data.status, 'success');
    assert.equal((await db.query("SELECT id FROM identity_verification_tokens WHERE claim_request_id='governance-claim' AND status='active'"))[0].length, 0);
    const saved = await call('policy', { initialClaimEnabled: false, allowRecoveryCode: true, allowPassphrase: true });
    assert.equal(saved.data.status, 'success');
    assert.equal((await call('policy', { action: 'get' })).data.policy.allow_passphrase, 1);
    assert.equal((await db.query("SELECT allow_passphrase FROM auth_policy WHERE id='default'"))[0][0].allow_passphrase, 1);
    await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify({ ...policy, capabilities: ['auth.identity.read'] }), 'admin-policy']);
    assert.equal((await call('claims', { action: 'issue_code', claimId: 'governance-claim' })).code, 403);
    assert.equal((await call('policy', { allowPassphrase: false })).code, 403);
    assert.equal((await db.query("SELECT allow_passphrase FROM auth_policy WHERE id='default'"))[0][0].allow_passphrase, 1);
    assert.equal((await call('security/passphrase', { personId: 'admin-target', value: 'test-credential-only' })).code, 403);
    await db.query("UPDATE admin_grants SET admin_level='super_admin',org_id='' WHERE id='admin-grant'");
    await db.query("UPDATE admin_info SET admin_level='super_admin',org_id='' WHERE id='admin-legacy'");
    const initialized = await call('security/passphrase', { personId: 'admin-target', value: 'isolated-passphrase-2048' });
    assert.equal(initialized.data.status, 'success');
    assert.equal((await call('security', { personId: 'admin-target' })).data.passphraseSet, true);
    const accountId = initialized.data.accountId;
    assert.equal((await db.query("SELECT id FROM account_recovery_credentials WHERE account_id=? AND method='passphrase' AND status='active'", [accountId]))[0].length, 1);
    await db.query("UPDATE admin_grants SET admin_level='admin',org_id='admin-auth' WHERE id='admin-grant'");
    await db.query("UPDATE admin_info SET admin_level='admin',org_id='admin-auth' WHERE id='admin-legacy'");
    await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify({ ...policy,
      capabilities: ['auth.accounts.read', 'auth.accounts.update', 'auth.recovery.update', 'auth.identity.read', 'auth.identity.verify'],
      scopes: [{ kind: 'organization' }] }), 'admin-policy']);
    // 旧权限允许获授权普通管理员治理账号；新模式保留能力，但仍限制当前组织。
    assert.equal((await call('accounts', { action: 'freeze', personId: 'admin-target' })).data.status, 'success');
    assert.equal((await db.query('SELECT status FROM accounts WHERE id=?', [accountId]))[0][0].status, 'frozen');
    assert.equal((await call('accounts', { action: 'unfreeze', personId: 'admin-target' })).data.status, 'success');
    assert.equal((await call('security/passphrase/revoke', { personId: 'admin-target' })).data.status, 'success');
    assert.equal((await call('security', { personId: 'admin-target' })).data.passphraseSet, false);
    assert.equal((await call('claims', { action: 'list', organizationId: 'other' })).code, 403);
    assert.equal((await call('claims', { action: 'issue_code', claimId: 'governance-other-claim' })).code, 403);
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }
};
