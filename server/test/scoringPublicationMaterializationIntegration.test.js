'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const mysql = require('mysql2/promise');

test('stored publications are indexed and cannot serve a stale or cross-organization score', { skip: !process.env.DEPLOY_TEST_DB_HOST }, async () => {
  const config = { host: process.env.DEPLOY_TEST_DB_HOST, port: Number(process.env.DEPLOY_TEST_DB_PORT || '3306'),
    user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '' };
  const database = 'whusu_score_mat_' + process.pid;
  const password = randomBytes(18).toString('hex');
  const admin = await mysql.createConnection(config);
  let pool;
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [database, password]);
    await admin.query("GRANT ALL ON ??.* TO ?@'%'", [database, database]);
    await admin.query('USE ??', [database]);
    await admin.query('CREATE TABLE score_activities (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64) NOT NULL)');
    await admin.query('CREATE TABLE result_publications (id VARCHAR(64) PRIMARY KEY, activity_id VARCHAR(64) NOT NULL, org_id VARCHAR(64) NOT NULL, is_published TINYINT, published_at DATETIME)');
    await admin.query('CREATE TABLE cache_domain_versions (org_id VARCHAR(64) NOT NULL, domain VARCHAR(32) NOT NULL, version BIGINT UNSIGNED NOT NULL, PRIMARY KEY(org_id, domain))');
    const migration = readFileSync(path.join(__dirname, '../db/deploy/20261121200000_scoring_publication_materializations.sql'), 'utf8');
    await admin.query(migration);
    await admin.query(migration);
    await admin.query("INSERT INTO score_activities VALUES ('activity','org')");
    await admin.query("INSERT INTO result_publications VALUES ('publication','activity','org',1,UTC_TIMESTAMP())");
    Object.assign(process.env, { DB_HOST: config.host, DB_PORT: String(config.port), DB_USER: database, DB_PASSWORD: password, DB_NAME: database });
    pool = require('../src/config/db');
    const materializations = require('../src/modules/scoring/models/publicationMaterialization');

    const payload = { scores: [['target', { finalScore: 88.125 }]], historicalTargets: [], diagnostics: { reasons: {} } };
    const first = await materializations.getRevision(pool, 'org');
    assert.equal((await materializations.listMissing(10)).length, 1);
    assert.equal(await materializations.save('activity', 'org', first, payload), true);
    assert.deepEqual(await materializations.get('activity', 'org'), payload);
    assert.equal(await materializations.get('activity', 'other-org'), null);
    assert.deepEqual(await materializations.listMissing(10), []);
    const query = pool.query.bind(pool);
    let explanation;
    pool.query = async (sql, params) => {
      if (sql.includes('SELECT m.payload')) [explanation] = await query('EXPLAIN ' + sql, params);
      return query(sql, params);
    };
    await materializations.get('activity', 'org');
    assert.equal(explanation.find(row => row.table === 'm').key, 'PRIMARY');
    pool.query = query;

    await admin.query("INSERT INTO cache_domain_versions VALUES ('org','scoring',1)");
    assert.equal(await materializations.get('activity', 'org'), null);
    assert.equal(await materializations.save('activity', 'org', first, payload), false);
    const next = await materializations.getRevision(pool, 'org');
    assert.equal(await materializations.save('activity', 'org', next, payload), true);
    await admin.query("INSERT INTO cache_domain_versions VALUES ('other-org','scoring',1)");
    assert.deepEqual(await materializations.get('activity', 'org'), payload);
    await admin.query("INSERT INTO cache_domain_versions VALUES ('*','scoring',1)");
    assert.equal(await materializations.get('activity', 'org'), null);
  } finally {
    if (pool) await pool.end();
    try {
      await admin.query('DROP DATABASE IF EXISTS ??', [database]);
      await admin.query("DROP USER IF EXISTS ?@'%'", [database]);
    } finally {
      await admin.end();
    }
  }
});
