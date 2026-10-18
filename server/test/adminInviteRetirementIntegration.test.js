'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const express = require('express');

if (!process.env.DEPLOY_TEST_DB_HOST) throw new Error('需要显式配置隔离数据库');
const configuration = { host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '' };
const database = 'whusu_invite_retire_' + process.pid + '_' + Date.now();
const user = 'invite_retire_' + process.pid;
const password = crypto.randomBytes(32).toString('hex');

(async () => {
  const admin = await mysql.createConnection(configuration);
  let pool, server;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`CREATE USER '${user}'@'%' IDENTIFIED BY ?`, [password]);
    await admin.query(`GRANT ALL ON \`${database}\`.* TO '${user}'@'%'`);
    const fixture = await mysql.createConnection({ ...configuration, database, multipleStatements: true });
    try {
      await fixture.query(await fs.readFile(path.resolve(__dirname, '../db/init.sql'), 'utf8'));
      await fixture.query('ALTER TABLE admin_info DROP COLUMN invite_code, DROP COLUMN invited_at, DROP COLUMN invite_expires_at, DROP COLUMN invite_consumed_at');
      await fixture.query('ALTER TABLE auth_sessions DROP COLUMN openid_hash');
    } finally { await fixture.end(); }
    Object.assign(process.env, { DB_HOST: configuration.host, DB_PORT: String(configuration.port),
      DB_USER: user, DB_PASSWORD: password, DB_NAME: database,
      AUTH_IDENTITY_SECRET: crypto.randomBytes(32).toString('hex') });
    pool = require('../src/config/db');
    await pool.query("INSERT INTO organizations (id,name) VALUES ('org','隔离组织'),('other','其他组织')");
    await pool.query("INSERT INTO persons (id,name,student_id,normalized_student_id) VALUES ('operator','管理员','OP','op')");
    await pool.query("INSERT INTO accounts (id,person_id,status) VALUES ('account','operator','verified')");
    await pool.query("INSERT INTO admin_info (id,name,admin_level,org_id) VALUES ('operator-admin','管理员','super_admin','')");
    await pool.query("INSERT INTO admin_grants (id,person_id,org_id,admin_level,legacy_admin_id) VALUES ('grant','operator','','super_admin','operator-admin')");
    const identity = require('../src/core/models/unifiedIdentity');
    const identityCrypto = require('../src/core/services/identityCrypto');
    const passwordSession = await identity.createSession({ id: 'account' }, { organizationId: 'org' }, {}, { temporary: true, openidHash: 'ignored' });
    assert.equal((await identity.loadSession(passwordSession.id)).session.binding_mode, 'temporary');
    await assert.rejects(identity.createSession({ id: 'account' }, {}, {}, {}), error => error.code === 'binding_missing');
    await pool.query("INSERT INTO account_wechat_bindings (id,account_id,app_id,openid_hash,openid_ciphertext,status,active_account_id) VALUES ('binding','account',?,?,?,'active','account')",
      [identity.APP_ID || 'whusu-smart-workspace', identityCrypto.hmac('isolated-openid'), identityCrypto.encryptOpenid('isolated-openid')]);
    const boundSession = await identity.createSession({ id: 'account' }, { organizationId: 'org' }, {}, {});
    const loaded = await identity.loadSession(boundSession.id);
    assert.equal(loaded.session.binding_mode, 'bound'); assert.equal('openid_hash' in loaded.session, false);
    await pool.query("UPDATE accounts SET token_version = token_version + 1 WHERE id = 'account'");
    assert.equal(await identity.loadSession(boundSession.id), null);
    assert.equal(await identity.loadSession(passwordSession.id), null);
    // 第一阶段兼容发布：旧列已获得默认值，但新服务端不再向它写入。
    await pool.query('ALTER TABLE auth_sessions ADD COLUMN openid_hash CHAR(64) NOT NULL');
    const migrationSql = await fs.readFile(path.resolve(__dirname, '../db/deploy/20261018120000_auth_session_legacy_hash_default.sql'), 'utf8');
    async function runDefaultMigrationTwice() {
      const connection = await mysql.createConnection({ ...configuration, database, multipleStatements: true });
      try { await connection.query(migrationSql); await connection.query(migrationSql); }
      finally { await connection.end(); }
    }
    await runDefaultMigrationTwice();
    const compatible = await identity.createSession({ id: 'account' }, { organizationId: 'org' }, {}, { temporary: true });
    assert.equal((await identity.loadSession(compatible.id)).session.openid_hash, '');
    const compatibleBound = await identity.createSession({ id: 'account' }, { organizationId: 'org' }, {}, {});
    assert.equal((await identity.loadSession(compatibleBound.id)).session.openid_hash, '');
    await pool.query('ALTER TABLE auth_sessions DROP COLUMN openid_hash');
    await runDefaultMigrationTwice();
    assert((await identity.loadSession(compatible.id)).session);
    assert((await identity.loadSession(compatibleBound.id)).session);
    const app = express(); app.use(express.json());
    let actorEnabled = true;
    app.use((req, res, next) => {
      req.logger = { error() {} };
      req.authAccount = actorEnabled ? { id: 'account', personId: 'operator' } : null;
      req.authContext = { role: 'admin', personId: 'operator', adminGrantId: 'grant', adminLevel: 'super_admin',
        legacyAdminId: 'operator-admin', organizationId: 'org', contextId: 'context' };
      require('../src/utils/orgContext').orgStorage.run('org', next);
    });
    app.use(require('../src/core/routes/admin'));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    async function post(body) {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/saveAdmin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return { code: response.status, body: await response.json() };
    }
    const variants = [{}, { inviteCode: 'OLD123', invitedAt: '2020-01-01', inviteExpiresAt: '2030-01-01', inviteConsumedAt: null },
      { invite_code: 'OLD456', invited_at: 'invalid', invite_expires_at: {}, invite_consumed_at: [] },
      { inviteCode: {}, invitedAt: [], inviteExpiresAt: false, inviteConsumedAt: 123 }];
    for (let i = 0; i < variants.length; i++) {
      await pool.query('INSERT INTO persons (id,name,student_id,normalized_student_id) VALUES (?,?,?,?)',
        ['target-' + i, '成员' + i, 'T' + i, 't' + i]);
      await pool.query('INSERT INTO organization_memberships (id,person_id,org_id,legacy_hr_id) VALUES (?,?,?,?)',
        ['membership-' + i, 'target-' + i, 'org', 'hr-' + i]);
      const parameters = { name: '成员' + i, studentId: 'T' + i, adminLevel: 'admin', organizationId: 'org', ...variants[i] };
      const created = await post(parameters);
      assert.equal(created.body.status, 'success', JSON.stringify(created));
      const [rows] = await pool.query('SELECT * FROM admin_info WHERE id = ?', [created.body.id]);
      assert.equal(rows.length, 1); assert.equal(rows[0].name, parameters.name);
      for (const key of ['invite_code', 'invited_at', 'invite_expires_at', 'invite_consumed_at']) assert.equal(key in rows[0], false);
      assert.equal((await post({ ...parameters, id: created.body.id })).body.status, 'success');
      const [grants] = await pool.query('SELECT person_id FROM admin_grants WHERE legacy_admin_id = ?', [created.body.id]);
      assert.equal(grants[0].person_id, 'target-' + i);
    }
    const [before] = await pool.query('SELECT COUNT(*) AS count FROM admin_info');
    assert.notEqual((await post({ name: '没有人事记录', studentId: 'missing', adminLevel: 'admin', organizationId: 'org', inviteCode: 'ignored' })).body.status, 'success');
    const [after] = await pool.query('SELECT COUNT(*) AS count FROM admin_info'); assert.equal(after[0].count, before[0].count);
    actorEnabled = false;
    assert.equal((await post({ name: '成员0', studentId: 'T0', adminLevel: 'admin', inviteCode: 'ignored' })).code, 403);
    console.log('管理员邀请码列实际删除后：4类新旧请求创建、编辑、回读、授权关联、失败回滚及未认证拒绝通过；会话旧摘要列删除后口令/微信会话创建、读取、撤销与旧schema默认值兼容通过');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(`DROP USER IF EXISTS '${user}'@'%'`);
    await admin.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
