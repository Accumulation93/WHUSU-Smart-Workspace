'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function identityCardAuthorizationCases(db) {
  const context = (await require('../../src/core/models/unifiedIdentity').listContexts('dir-account', db))
    .find(item => item.assignmentId === 'dir-assignment');
  assert(context);
  const codes = require('../../src/core/services/identityCardCode');
  const originalImage = codes.createImage;
  const originalVerificationImage = codes.createVerificationImage;
  let token;
  let duringImage = null;
  let imageCalls = 0;
  codes.createImage = async value => {
    imageCalls++;
    token = value;
    if (duringImage) await duringImage();
    return 'data:image/png;base64,test';
  };
  codes.createVerificationImage = async () => 'data:image/png;base64,test';
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers['x-test-auth'] === 'yes') {
      req.authAccount = { id: 'dir-account', personId: 'dir-person' };
      req.authSession = { id: 'venue-review-session' };
      req.authContext = context;
    }
    next();
  });
  app.use('/api', require('../../src/core/routes/identityCard'));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  async function call(name, body = {}, authenticated = true) {
    const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { 'x-test-auth': 'yes' } : {}) },
      body: JSON.stringify(body)
    });
    return response.json();
  }
  async function deny(action) {
    const policy = { id: 'identity-card-deny', organizationId: 'dir-auth', effect: 'deny', enabled: true,
      subjects: [{ kind: 'assignments', ids: ['dir-assignment'] }], capabilities: ['identity.cards.' + action],
      scopes: [{ kind: 'organization' }], fields: null };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('identity-card-deny','dir-auth','限制身份卡',?) ON DUPLICATE KEY UPDATE policy_json=VALUES(policy_json)", [JSON.stringify(policy)]);
  }
  const clear = () => db.query("DELETE FROM authorization_rules WHERE id='identity-card-deny'");
  const count = async () => (await db.query("SELECT COUNT(*) AS total FROM identity_cards WHERE account_id='dir-account'"))[0][0].total;
  try {
    const issued = await call('createMyIdentityCardCode', { personId: 'forged', organizationId: 'other' });
    assert.equal(issued.valid, true, JSON.stringify(issued));
    const firstToken = token;
    assert.equal(await count(), 1);
    const verified = await call('verifyIdentityCard', { token: firstToken }, false);
    assert.equal(verified.valid, true);
    assert.deepEqual(Object.keys(verified.card).sort(), ['name', 'organization', 'position', 'positionFacts', 'state', 'stateCode']);
    assert.deepEqual(Object.keys(verified.card.positionFacts).sort(), ['adminLevel', 'assignmentLabel', 'department', 'hasAssignment', 'identityCategory', 'role', 'workGroup']);
    assert.deepEqual(verified.card.positionFacts, {
      assignmentLabel: context.assignmentLabel || '', role: context.role || '',
      adminLevel: context.adminLevel || '', hasAssignment: Boolean(context.assignmentId),
      department: context.department || '', identityCategory: context.identityCategoryName || '', workGroup: context.workGroup || ''
    });
    assert.equal(verified.card.stateCode, 'active');
    // 公开事实只解释岗位和状态，不能携带账号、人员、岗位编号或学号。
    for (const privateValue of ['dir-account', 'dir-person', 'dir-assignment', context.contextId]) {
      assert.equal(JSON.stringify(verified.card).includes(privateValue), false);
    }
    await deny('read');
    assert.equal((await call('getMyIdentityCard')).valid, false);
    assert.equal((await call('verifyIdentityCard', { token: firstToken }, false)).valid, false);
    assert.equal((await call('createMyIdentityCardCode')).valid, false);
    assert.equal(imageCalls, 1);
    assert.equal(await count(), 1);
    await deny('create');
    assert.equal((await call('getMyIdentityCard')).valid, true);
    assert.equal((await call('verifyIdentityCard', { token: firstToken }, false)).valid, true);
    assert.equal((await call('createMyIdentityCardCode')).valid, false);
    await deny('verify');
    assert.equal((await call('verifyIdentityCard', { token: firstToken }, false)).valid, false);
    await clear();
    duringImage = () => deny('create');
    assert.equal((await call('createMyIdentityCardCode')).valid, false, '成图期间撤权后不能写入或返回图片');
    assert.equal(await count(), 1);
    duringImage = null;
    await clear();
    assert.equal((await call('createMyIdentityCardCode')).valid, true);
    assert.equal(await count(), 2);
    assert.equal((await call('verifyIdentityCard', { token }, false)).valid, true);
  } finally {
    await new Promise(resolve => listener.close(resolve));
    codes.createImage = originalImage;
    codes.createVerificationImage = originalVerificationImage;
    await clear();
  }
};
