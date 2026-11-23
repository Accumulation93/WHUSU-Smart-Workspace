'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const mysql = require('mysql2/promise');

test('本人补充资料合并本组织有效岗位，真实保存回读且保留失权字段', async () => {
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = `self_profile_applicability_${process.pid}_${Date.now()}`;
  const username = `sp_applicable_${process.pid}`;
  const password = randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({ host: '127.0.0.1', port,
    user: process.env.TEST_DB_ADMIN_USER || 'root', password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  let listener;
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await admin.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await admin.query('USE ??', [database]);
    const readSql = file => readFileSync(path.join(__dirname, '../db', file), 'utf8');
    await admin.query(readSql('init.sql'));
    await admin.query(`CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32), version BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (org_id, domain))`);
    await admin.query(readSql('deploy/20261031160000_unified_authorization.sql'));
    await admin.query(readSql('deploy/20261111100000_identity_nature_links.sql'));
    const applicability = readSql('deploy/20261123091000_hr_profile_field_applicability.sql');
    await admin.query(applicability);
    await admin.query(applicability);
    await admin.query(`INSERT INTO organizations(id,name) VALUES ('org-main','组织甲'),('org-other','组织乙');
      INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('person-a','甲','A01','A01'),('person-b','乙','B01','B01');
      INSERT INTO accounts(id,person_id) VALUES ('account-a','person-a'),('account-b','person-b');
      INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('hr-a','甲','A01','org-main'),('hr-b','乙','B01','org-main'),('hr-other','甲','A01','org-other');
      INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES
        ('member-a','person-a','org-main','hr-a'),('member-b','person-b','org-main','hr-b'),('member-other','person-a','org-other','hr-other');
      INSERT INTO departments(id,name,org_id) VALUES ('dep-b','部门乙','org-main'),('dep-c','部门丙','org-main'),('dep-other','外部部门','org-other');
      INSERT INTO identities(id,name,org_id) VALUES ('identity-b','身份乙','org-main'),('identity-c','身份丙','org-main'),('identity-other','其他身份','org-other');
      INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES
        ('job-b','member-a','org-main','staff','dep-b','identity-b'),('job-c','member-a','org-main','staff','dep-c','identity-c'),
        ('job-other','member-other','org-other','staff','dep-other','identity-other');
      INSERT INTO org_hr_profile_template_snapshots(id,org_id,edit_mode) VALUES ('snapshot','org-main','direct');
      INSERT INTO org_hr_profile_template_snapshot_fields(id,snapshot_id,sort_order,label,applicability_json) VALUES
        ('phone','snapshot',1,'联系电话',JSON_ARRAY(JSON_OBJECT('departmentId',JSON_ARRAY('dep-b','dep-c')))),
        ('email','snapshot',2,'邮箱',JSON_ARRAY(JSON_OBJECT('departmentId',JSON_ARRAY('dep-b')))),
        ('qq','snapshot',3,'QQ号',JSON_ARRAY(JSON_OBJECT('departmentId',JSON_ARRAY('dep-c')))),
        ('combined','snapshot',4,'混合岗位条件',JSON_ARRAY(JSON_OBJECT('departmentId',JSON_ARRAY('dep-b'),'identityCategoryId',JSON_ARRAY('identity-c')))),
        ('external','snapshot',5,'跨组织测试',JSON_ARRAY(JSON_OBJECT('departmentId',JSON_ARRAY('dep-other'))))`);
    Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    process.env.AUTH_IDENTITY_SECRET ||= randomBytes(48).toString('hex');
    process.env.JWT_SECRET ||= randomBytes(48).toString('hex');
    pool = require('../src/config/db');
    const { orgStorage } = require('../src/utils/orgContext');
    const app = express();
    app.use(express.json());
    let managementPermission = false;
    let context = { role: 'user', personId: 'person-a', organizationId: 'org-main', contextId: 'context-b',
      membershipId: 'member-a', legacyHrId: 'hr-a', assignmentId: 'job-b' };
    app.use((req, res, next) => {
      req.authContext = context;
      req.authAccount = { id: context.personId === 'person-a' ? 'account-a' : 'account-b', personId: context.personId };
      if (managementPermission) {
        req.admin = { id: 'admin-fixture' };
        req.adminPermissions = { permissions: { 'hr.profile_templates.select': true } };
      }
      req.logger = { error: (...args) => console.error(...args) };
      orgStorage.run(context.organizationId, next);
    });
    app.use('/api', require('../src/core/routes/hrProfile'));
    listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    async function call(endpoint, body = {}) {
      const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/${endpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      return { code: response.status, data: await response.json() };
    }
    const initial = await call('getUserHrProfile');
    assert.equal(initial.data.status, 'success');
    assert.deepEqual(initial.data.template.fields.map(field => field.id), ['phone', 'email', 'qq']);
    context = { ...context, contextId: 'context-c', assignmentId: 'job-c' };
    assert.deepEqual((await call('getUserHrProfile')).data.template.fields.map(field => field.id), ['phone', 'email', 'qq']);
    const submitted = { phone: '123456', email: 'a@example.test', qq: '321' };
    assert.equal((await call('submitUserHrProfile', { values: submitted })).data.status, 'success');
    assert.deepEqual((await call('getUserHrProfile')).data.values, submitted);
    await admin.query("UPDATE org_hr_profile_template_snapshots SET edit_mode='audit' WHERE id='snapshot'");
    assert.equal((await call('submitUserHrProfile', { values: { ...submitted, qq: 'new-pending' } })).data.status, 'success');

    await admin.query("UPDATE membership_assignments SET status='inactive' WHERE id='job-c'");
    await admin.query("UPDATE org_hr_profile_template_snapshots SET edit_mode='direct' WHERE id='snapshot'");
    context = { ...context, contextId: 'context-b', assignmentId: 'job-b' };
    assert.equal((await call('submitUserHrProfile', { values: { ...submitted, phone: 'blocked' } })).code, 403);
    assert.equal((await call('getUserHrProfile')).data.values.phone, submitted.phone);
    assert.equal((await call('submitUserHrProfile', { values: { phone: 'approved-direct', email: 'a@example.test' } })).data.status, 'success');
    const checked = await call('getUserHrProfile');
    assert.deepEqual(checked.data.values, { phone: 'approved-direct', email: 'a@example.test' });
    assert.equal(checked.data.reviewStatus, 'pending');
    const [untouched] = await admin.query("SELECT is_pending,field_value FROM hr_profile_record_values WHERE org_id='org-main' AND field_id='qq' ORDER BY is_pending");
    assert.deepEqual(untouched.map(row => [row.is_pending, row.field_value]), [[0, '321'], [1, 'new-pending']]);

    context = { ...context, contextId: 'context-no-job', personId: 'person-b', membershipId: 'member-b', legacyHrId: 'hr-b', assignmentId: '' };
    const empty = await call('getUserHrProfile');
    assert.equal(empty.data.profile.id, 'hr-b');
    assert.equal(empty.data.profileFieldsNotApplicable, true);
    assert.deepEqual(empty.data.template.fields, []);
    assert.equal((await call('submitUserHrProfile', { values: { phone: 'not-allowed' } })).code, 403);
    const [[unwritten]] = await admin.query("SELECT COUNT(*) AS total FROM hr_profile_records WHERE hr_id='hr-b'");
    assert.equal(unwritten.total, 0);

    assert.equal((await call('getHrProfileFieldApplicability')).code, 403);
    managementPermission = true;
    const configuration = (await call('getHrProfileFieldApplicability')).data;
    assert.equal(configuration.status, 'success');
    const change = { snapshotId: configuration.snapshotId, version: configuration.version,
      fieldIds: ['phone'], rules: [{ departmentId: ['dep-b'] }, { identityCategoryId: ['identity-c'] }], operation: 'replace' };
    assert.equal((await call('saveHrProfileFieldApplicability', change)).data.status, 'success');
    const reloaded = (await call('getHrProfileFieldApplicability')).data;
    assert.notEqual(reloaded.version, configuration.version);
    assert.deepEqual(reloaded.fields.find(field => field.id === 'phone').rules, change.rules);
    assert.deepEqual(reloaded.fields.find(field => field.id === 'email').rules, configuration.fields.find(field => field.id === 'email').rules);
    assert.equal((await call('saveHrProfileFieldApplicability', { ...change, rules: [] })).data.status, 'authorization_conflict');
    assert.equal((await call('saveHrProfileFieldApplicability', { ...change, version: reloaded.version, rules: [] })).data.status, 'success');
    assert.deepEqual((await call('getHrProfileFieldApplicability')).data.fields.find(field => field.id === 'phone').rules, []);
    managementPermission = false;
    assert.deepEqual((await call('getUserHrProfile')).data.template.fields.map(field => field.id), ['phone']);
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.query("DROP USER IF EXISTS ?@'%'", [username]);
    await admin.end();
  }
});
