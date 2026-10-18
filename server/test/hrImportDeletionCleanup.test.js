'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const model = require('../src/core/models/hrMemberDeletion');

(async () => {
  const database = 'hr_import_cleanup_' + process.pid + '_' + Date.now();
  const connection = await mysql.createConnection({ host: process.env.HR_IMPORT_TEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.HR_IMPORT_TEST_DB_PORT || 3362), user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  try {
    await connection.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4');
    await connection.query('USE `' + database + '`');
    await connection.query(await fs.readFile(path.join(__dirname, '../db/deploy/20261009220000_hr_import_v2.sql'), 'utf8'));
    const input = student => ({ basicMapping: { name: 0, studentId: 1 }, rows: [['无关姓名', student]], decisions: { rows: { 2: { exclude: true } } } });
    async function add(id, org, actor, data, plan = {}, result = null) {
      await connection.query(`INSERT INTO hr_import_previews (id,org_id,actor_person_id,actor_context_id,input_json,plan_json,context_hash,result_json,created_at,expires_at)
        VALUES (?,?,?,'context',?,?,'hash',?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY))`,
      [id, org, actor, JSON.stringify(data), JSON.stringify(plan), result ? JSON.stringify(result) : null]);
    }
    await add('actor-a', 'a', 'target', input('other'));
    await add('actor-b', 'b', 'target', input('other'));
    await add('student-a', 'a', 'other', input('  Stu-001  '));
    await add('student-b', 'b', 'other', input('stu-001'));
    await add('person-a', 'a', 'other', input('other'), { people: [{ existing: { personId: 'target' } }] });
    await add('result-a', 'a', 'other', input('other'), {}, { saved: [{ personId: 'target' }] });
    await add('keep-a', 'a', 'other', { basicMapping: { name: 0, studentId: 1 }, rows: [['stu-001', 'other']] }, { description: 'target' });
    await add('keep-b', 'b', 'other', input('stu-001-extra'));
    const target = { personId: 'target', studentId: 'stu-001', organizationId: 'a' };
    await connection.beginTransaction();
    assert.equal(await model.cleanupHrImportPreviews(connection, target), 4);
    await connection.rollback();
    assert.equal((await connection.query('SELECT COUNT(*) AS n FROM hr_import_previews'))[0][0].n, 8);
    await connection.beginTransaction();
    assert.equal(await model.cleanupHrImportPreviews(connection, target), 4);
    await connection.commit();
    assert.deepEqual((await connection.query('SELECT id FROM hr_import_previews ORDER BY id'))[0].map(row => row.id), ['actor-b', 'keep-a', 'keep-b', 'student-b']);
    await connection.beginTransaction();
    assert.equal(await model.cleanupHrImportPreviews(connection, { ...target, organizationId: '' }), 2);
    await connection.commit();
    assert.deepEqual((await connection.query('SELECT id FROM hr_import_previews ORDER BY id'))[0].map(row => row.id), ['keep-a', 'keep-b']);
    assert.equal(await model.cleanupHrImportPreviews(connection, { ...target, organizationId: '' }), 0);
    console.log('导入计划清理：8类精确匹配、排除行、组织边界、全局删除、回滚、重复执行通过');
  } finally {
    await connection.query('DROP DATABASE IF EXISTS `' + database + '`');
    await connection.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
