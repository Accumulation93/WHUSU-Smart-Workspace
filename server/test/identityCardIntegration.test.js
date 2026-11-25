'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
async function main() {
  const database = 'identity_card_test_' + process.pid + '_' + Date.now(), username = 'card_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const host = '127.0.0.1', port = 3362;
  const admin = await mysql.createConnection({host,port,user:process.env.TEST_DB_ADMIN_USER || 'root',password:process.env.TEST_DB_ADMIN_PASSWORD || '',multipleStatements:true});
  let pool;
  let server;
  try {
    await admin.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4');
    await admin.query("CREATE USER '" + username + "'@'%' IDENTIFIED BY ?", [password]);
    await admin.query('GRANT ALL PRIVILEGES ON `' + database + "`.* TO '" + username + "'@'%'");
    await admin.query('USE `' + database + '`');
    await admin.query(fs.readFileSync(path.join(__dirname,'../db/init.sql'),'utf8'));
    const migration = fs.readFileSync(path.join(__dirname,'../db/deploy/20261019120000_identity_cards.sql'),'utf8');
    await admin.query(migration); await admin.query(migration);
    const policyMigration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261123120500_identity_card_policy.sql'), 'utf8');
    await admin.query(policyMigration); await admin.query(policyMigration);
    Object.assign(process.env,{DB_HOST:host,DB_PORT:String(port),DB_NAME:database,DB_USER:username,DB_PASSWORD:password,AUTH_IDENTITY_SECRET:crypto.randomBytes(32).toString('hex')});
    pool = require('../src/config/db');
    const model = require('../src/core/models/identityCard'), identity = require('../src/core/models/unifiedIdentity');
    await admin.query("INSERT INTO organizations(id,name) VALUES ('org','测试组织'),('other','其他组织')");
    await admin.query('CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32), version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (org_id,domain))');
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261031160000_unified_authorization.sql'), 'utf8'));
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261111100000_identity_nature_links.sql'), 'utf8'));
    await admin.query("INSERT INTO departments(id,name,org_id) VALUES ('d','部门','org')");
    await admin.query("INSERT INTO identities(id,name,org_id) VALUES ('i','成员','org')");
    await admin.query("INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('person','测试姓名','private-student','private-student')");
    await admin.query("INSERT INTO accounts(id,person_id,status) VALUES ('account','person','verified')");
    await admin.query("INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('hr','测试姓名','private-student','org')");
    await admin.query("INSERT INTO organization_memberships(id,person_id,legacy_hr_id,org_id) VALUES ('member','person','hr','org')");
    await admin.query("INSERT INTO work_groups(id,name,department_id,org_id) VALUES ('g','文秘 · 会务组','d','org')");
    await admin.query("INSERT INTO membership_assignments(id,membership_id,org_id,department_id,identity_id,work_group_id) VALUES ('job','member','org','d','i','g')");
    const actor = (await identity.listContexts('account', admin))[0];
    assert(actor.assignmentId);
    let token;
    const codes = require('../src/core/services/identityCardCode');
    codes.createImage = async value => { token = value; return 'data:image/png;base64,test'; };
    const app = require('express')(); app.use(require('express').json());
    let session;
    app.use((req,res,next) => { if (req.headers['x-test-auth'] === 'yes') { req.authAccount={id:'account',personId:'person'}; req.authContext=actor; req.authSession=session; } next(); });
    app.use('/api',require('../src/core/routes/identityCard'));
    server = await new Promise(resolve => { const listener=app.listen(0,'127.0.0.1',()=>resolve(listener)); });
    const post = (name,body={},authenticated=false) => fetch('http://127.0.0.1:'+server.address().port+'/api/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{'X-Test-Auth':'yes'}:{})},body:JSON.stringify(body)});
    assert.equal((await post('createMyIdentityCardCode')).status,401);
    const created = await (await post('createMyIdentityCardCode',{organizationId:'other',personId:'forged'},true)).json();
    assert(created.valid); assert.equal(token.length,32);
    const png = require('pngjs').PNG.sync.read(Buffer.from(created.verificationImage.split(',')[1], 'base64'));
    const decoded = require('jsqr')(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded.data, 'https://accumulation93.com/web/identity-card/verify?token=' + token);
    const publicResponse = await post('verifyIdentityCard',{token});
    assert.equal(publicResponse.headers.get('cache-control'),'no-store');
    const verified = await publicResponse.json();
    assert.equal(verified.card.name,'测试姓名');
    assert.deepEqual(Object.keys(verified.card).sort(),['name','organization','position','positionFacts','state','stateCode']);
    assert.equal(verified.card.stateCode, 'active');
    assert.deepEqual(Object.keys(verified.card.positionFacts).sort(), ['adminLevel','assignmentLabel','department','hasAssignment','identityCategory','role','workGroup']);
    assert.equal(verified.card.positionFacts.department, '部门');
    assert.equal(verified.card.positionFacts.identityCategory, '成员');
    assert.equal(verified.card.positionFacts.workGroup, '文秘 · 会务组');
    assert.equal(verified.card.positionFacts.hasAssignment, true);
    assert.equal(verified.card.positionFacts.assignmentLabel, actor.assignmentLabel);
    assert.equal(verified.card.positionFacts.role, actor.role);
    assert(!JSON.stringify(verified).includes('private-student'));
    assert.equal((await model.verify('invalid')).valid,false);
    assert.equal((await model.verify('0'.repeat(32))).valid,false);
    assert.equal((await model.mine('account',{...actor,organizationId:'other'})).valid,false);
    const [stored] = await admin.query('SELECT token_hash FROM identity_cards'); assert.notEqual(stored[0].token_hash,token);
    await assert.rejects(model.issue('account',actor,async()=>{throw new Error('network');}),/network/);
    assert.equal((await admin.query('SELECT COUNT(*) AS n FROM identity_cards'))[0][0].n,1);
    await admin.query("UPDATE accounts SET status='frozen' WHERE id='account'");
    assert.equal((await model.verify(token)).valid,false);
    await admin.query("UPDATE accounts SET status='verified' WHERE id='account'");
    await admin.query("UPDATE membership_assignments SET status='inactive' WHERE id='job'");
    assert.equal((await model.verify(token)).valid,false);
    const unassigned = (await identity.listContexts('account', admin)).find(item => !item.assignmentId && item.role === 'user');
    assert(unassigned);
    const unassignedCard = await model.mine('account', unassigned);
    assert.equal(unassignedCard.valid, true);
    for (const field of ['department', 'identityCategory', 'workGroup']) assert.equal(unassignedCard.card.positionFacts[field], '');
    await admin.query("UPDATE membership_assignments SET status='active' WHERE id='job'");

    for (const filename of ['20261102193000_authorization_runtime_transition.sql', '20261122153000_unified_identity_assignment_links.sql',
      '20261122170000_authorization_grant_sources.sql']) {
      await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy', filename), 'utf8'));
    }
    await admin.query("UPDATE authorization_runtime_transition SET phase='enforced', minimum_protocol=3 WHERE id=1");
    await admin.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='org'");
    session = { id: 'card-policy-session' };
    await admin.query(`INSERT INTO auth_sessions (id, account_id, openid_hash, context_id, context_type, context_subject_id,
      organization_id, role, token_version, expires_at) VALUES (?, 'account', '', ?, 'assignment', 'job', 'org', 'user', 1,
      DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR))`, [session.id, actor.contextId]);
    const readPolicy = () => post('getIdentityCardPolicy', {}, true);
    const savePolicy = (expectedVersion, issueEnabled, publicVerificationEnabled) => post('saveIdentityCardPolicy', {
      expectedVersion, issueEnabled, publicVerificationEnabled, organizationId: 'other'
    }, true);
    async function grantPolicy(capabilities, effect = 'allow') {
      const policy = { id: effect === 'allow' ? 'policy-management' : 'policy-read-deny', organizationId: 'org', effect, enabled: true,
        subjects: [{ kind: 'assignments', ids: ['job'] }], capabilities, scopes: [{ kind: 'organization' }], fields: null };
      await admin.query(`INSERT INTO authorization_rules (id, org_id, name, policy_json) VALUES (?, 'org', ?, ?)
        ON DUPLICATE KEY UPDATE policy_json=VALUES(policy_json)`, [policy.id, policy.id, JSON.stringify(policy)]);
    }
    assert.equal((await post('getIdentityCardPolicy')).status, 401);
    assert.equal((await readPolicy()).status, 403);
    await grantPolicy(['identity.cardPolicy.read']);
    assert.deepEqual(await (await readPolicy()).json(), {
      status: 'success', policy: { version: 0, issueEnabled: true, publicVerificationEnabled: true }, canUpdate: false
    });
    assert.equal((await savePolicy(0, false, true)).status, 403);
    await grantPolicy(['identity.cardPolicy.update']);
    assert.deepEqual(await (await readPolicy()).json(), {
      status: 'success', policy: { version: 0, issueEnabled: true, publicVerificationEnabled: true }, canUpdate: true
    });
    await grantPolicy(['identity.cardPolicy.read'], 'deny');
    assert.equal((await readPolicy()).status, 403);
    await admin.query("DELETE FROM authorization_rules WHERE id='policy-read-deny'");
    assert.equal((await savePolicy(0, 'false', true)).status, 400);
    assert.deepEqual((await (await savePolicy(0, false, true)).json()).policy,
      { version: 1, issueEnabled: false, publicVerificationEnabled: true });
    assert.equal((await savePolicy(0, true, true)).status, 409);
    assert.equal((await (await readPolicy()).json()).policy.version, 1);
    const ownCardWithIssuingPaused = await (await post('getMyIdentityCard', {}, true)).json();
    assert.equal(ownCardWithIssuingPaused.valid, true);
    assert.equal(ownCardWithIssuingPaused.codeDisabledByPolicy, true);
    assert.equal((await (await post('createMyIdentityCardCode', {}, true)).json()).valid, false);
    assert.equal((await model.verify(token)).valid, true, '关闭成码不影响此前已签发且未到期的卡');
    assert.equal((await savePolicy(1, true, false)).status, 200);
    assert.equal((await model.verify(token)).valid, false);
    assert.equal((await (await post('createMyIdentityCardCode', {}, true)).json()).valid, false);
    assert.equal((await savePolicy(2, true, true)).status, 200);
    assert.equal((await (await post('getMyIdentityCard', {}, true)).json()).codeDisabledByPolicy, false);
    assert.equal((await model.verify(token)).valid, true);
    const [policyRows] = await admin.query('SELECT org_id FROM identity_card_policies');
    assert.deepEqual(policyRows.map(row => row.org_id), ['org']);
    await admin.query("INSERT INTO authorization_basic_role_exclusions (org_id, capability_key) VALUES ('org', 'identity.cards.verify')");
    assert.equal((await model.verify(token)).valid, true, '退役的中心基础开关不再限制子应用业务');
    await grantPolicy(['identity.cards.verify']);
    assert.equal((await model.verify(token)).valid, true);
    await admin.query(`INSERT INTO authorization_grant_sources (org_id, object_kind, object_id, parent_delegation_id, issuer_assignment_id)
      VALUES ('org', 'rule', 'policy-management', 'revoked-delegation', 'job')`);
    assert.equal((await model.verify(token)).valid, true, '公开核验依据有效工作角色及身份卡自身设置，无需中心授权');
    await admin.query("UPDATE identity_card_policies SET public_verification_enabled=0 WHERE org_id='org'");
    assert.equal((await model.verify(token)).valid, false, '身份卡自身关闭后，中心授权不能越过业务限制');
    await admin.query("UPDATE identity_card_policies SET public_verification_enabled=1 WHERE org_id='org'");
    await admin.query('DELETE FROM authorization_basic_role_exclusions');
    assert.equal((await model.verify(token)).valid, true);
    await admin.query('UPDATE identity_cards SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND)');
    assert.equal((await model.verify(token)).valid,false);
    console.log('PASS 身份卡双次迁移、真实生成参数保存回读、公开列白名单、跨组织、篡改、过期、冻结、岗位撤销和图片失败不写入');
    console.log('PASS 身份卡设置覆盖默认值、独立读写资格、真实HTTP保存回读、版本冲突、成码与核验开关、组织隔离及退役中心开关隔离');
  } finally {
    if (server) await new Promise(resolve=>server.close(resolve));
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS `' + database + '`');
    await admin.query("DROP USER IF EXISTS '" + username + "'@'%'");
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
