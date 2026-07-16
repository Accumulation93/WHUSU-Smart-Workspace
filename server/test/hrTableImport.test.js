const assert = require('assert');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { parseWorkbookTables } = require('../src/utils/excelFile');

const adminUtils = require('../../miniprogram/subpackages/scoring/pages/admin/modules/adminUtils');
const tableFile = require('../../miniprogram/utils/tableFile');

const port = Number(process.env.HR_IMPORT_TEST_DB_PORT || 3362);
const host = process.env.HR_IMPORT_TEST_DB_HOST || '127.0.0.1';
const adminUser = process.env.TEST_DB_ADMIN_USER || 'root';
const adminPassword = process.env.TEST_DB_ADMIN_PASSWORD || '';
const suffix = `${process.pid}_${Date.now()}`;
const database = `redsu_hr_import_test_${suffix}`;
const testUser = `hr_import_${process.pid}`;
const testPassword = `CodexHrImport_${suffix}`;
const orgId = 'org-test-44';

function buildFixture() {
  const headers = [
    '姓名', '学号', '性别', '录取部门', '职位', '学院',
    '政治面貌\n（下拉选择）', '成绩排名\n（下拉选择）', '具体成绩\n排名比例', '课业不及格情况'
  ];
  const departments = [
    '秘书处', '组织部', '宣传部', '权益部', '文体部', '外联部',
    '学术部', '实践部', '办公室', '社团部', '青年志愿者工作部'
  ];
  const rows = [];
  for (let index = 0; index < 35; index += 1) {
    rows.push([
      `测试成员${String(index + 1).padStart(2, '0')}`,
      index === 34 ? 2026999 : `T2026${String(index + 1).padStart(3, '0')}`,
      index % 2 ? '女' : '男',
      departments[index % departments.length],
      index % 3 ? '部门负责人' : '主要负责人',
      `测试学院${(index % 17) + 1}`,
      '', '', '', ''
    ]);
  }
  return { headers, rows };
}

function buildPayload(headers, rows) {
  const samples = [headers].concat(rows.slice(0, 5));
  const mappingRows = adminUtils.buildCsvColumnMapping(headers, samples, []).rows;
  const basicMapping = {};
  mappingRows.forEach((row) => {
    if (['name', 'studentId', 'department', 'identity', 'workGroup'].includes(row.target)) {
      basicMapping[row.target] = row.columnIndex;
    }
  });
  return { headers, rows, basicMapping, extensionMapping: [], skipInvalid: false, mappingRows };
}

async function main() {
  const csv = '"姓名","说明\n（可换行）",学院\r\n测试甲,"包含,逗号",测试学院';
  const parsedCsv = tableFile.parseCsvContent(csv);
  assert.deepStrictEqual(parsedCsv.headers, ['姓名', '说明\n（可换行）', '学院']);
  assert.deepStrictEqual(parsedCsv.rows, [['测试甲', '包含,逗号', '测试学院']]);

  const fixture = buildFixture();
  const payload = buildPayload(fixture.headers, fixture.rows);
  assert.strictEqual(payload.mappingRows[3].target, 'department');
  assert.strictEqual(payload.mappingRows[4].target, 'identity');
  assert.strictEqual(payload.mappingRows[5].target, 'ignore');
  assert.strictEqual(payload.mappingRows[5].mappingValues.includes('department'), false);
  assert.deepStrictEqual(payload.basicMapping, { name: 0, studentId: 1, department: 3, identity: 4 });

  let adminConnection;
  let pool;
  try {
    adminConnection = await mysql.createConnection({ host, port, user: adminUser, password: adminPassword, multipleStatements: true });
    await adminConnection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await adminConnection.query(`CREATE USER '${testUser}'@'127.0.0.1' IDENTIFIED BY ?`, [testPassword]);
    await adminConnection.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${testUser}'@'127.0.0.1'`);

    const schemaConnection = await mysql.createConnection({
      host, port, user: testUser, password: testPassword, database, multipleStatements: true
    });
    await schemaConnection.query(`
      CREATE TABLE departments (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL, org_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
        UNIQUE KEY idx_dept_name (name, org_id)
      );
      CREATE TABLE identities (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL, org_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
        UNIQUE KEY idx_ident_name (name, org_id)
      );
      CREATE TABLE work_groups (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL, department_id VARCHAR(64) NOT NULL,
        org_id VARCHAR(64) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
        UNIQUE KEY idx_wg_name (department_id, name, org_id)
      );
      CREATE TABLE hr_info (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL, student_id VARCHAR(32) NOT NULL,
        department_id VARCHAR(64), identity_id VARCHAR(64), work_group_id VARCHAR(64), org_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
        UNIQUE KEY idx_hr_student (student_id, org_id)
      );
      CREATE TABLE hr_profile_templates (
        id VARCHAR(64) PRIMARY KEY, template_key VARCHAR(64) NOT NULL, updated_at DATETIME,
        org_id VARCHAR(64) NOT NULL
      );
      CREATE TABLE hr_profile_template_fields (
        id VARCHAR(64) PRIMARY KEY, template_id VARCHAR(64) NOT NULL, sort_order INT NOT NULL,
        label VARCHAR(200) NOT NULL, type VARCHAR(32) NOT NULL, required TINYINT NOT NULL DEFAULT 0,
        min_length INT, max_length INT, number_rule VARCHAR(32), allow_decimal TINYINT,
        min_digits INT, max_digits INT, min_value DECIMAL(20,4), max_value DECIMAL(20,4),
        options_json TEXT, org_id VARCHAR(64) NOT NULL
      );
      CREATE TABLE hr_profile_records (
        id VARCHAR(64) PRIMARY KEY, hr_id VARCHAR(64) NOT NULL, name VARCHAR(100), openid VARCHAR(128),
        template_key VARCHAR(64), template_updated_at DATETIME, audit_status VARCHAR(16), reviewed_at DATETIME,
        org_id VARCHAR(64) NOT NULL, created_at DATETIME, updated_at DATETIME
      );
      CREATE TABLE hr_profile_record_values (
        id VARCHAR(64) PRIMARY KEY, record_id VARCHAR(64) NOT NULL, is_pending TINYINT NOT NULL,
        field_id VARCHAR(64) NOT NULL, field_value TEXT, org_id VARCHAR(64) NOT NULL
      );
    `);
    await schemaConnection.end();

    process.env.DB_HOST = host;
    process.env.DB_PORT = String(port);
    process.env.DB_USER = testUser;
    process.env.DB_PASSWORD = testPassword;
    process.env.DB_NAME = database;

    const model = require('../src/core/models/hrTableImport');
    pool = require('../src/config/db');
    const preview = await model.previewHrTableImport(payload, orgId);
    assert.strictEqual(preview.status, 'success');
    assert.strictEqual(preview.preview.totalRows, 35);
    assert.strictEqual(preview.preview.validRows, 35);
    assert.strictEqual(preview.preview.invalidRows, 0);
    assert.strictEqual(preview.preview.newDepartments.length, 11);
    assert.strictEqual(preview.preview.newIdentities.length, 2);
    assert.strictEqual(preview.preview.newWorkGroups.length, 0);

    const imported = await model.importHrTable(payload, orgId);
    assert.strictEqual(imported.status, 'success');
    assert.strictEqual(imported.count, 35);

    const [counts] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM hr_info WHERE org_id = ?) AS hr_count,
         (SELECT COUNT(*) FROM departments WHERE org_id = ?) AS department_count,
         (SELECT COUNT(*) FROM identities WHERE org_id = ?) AS identity_count,
         (SELECT COUNT(*) FROM work_groups WHERE org_id = ?) AS work_group_count`,
      [orgId, orgId, orgId, orgId]
    );
    assert.deepStrictEqual(
      [counts[0].hr_count, counts[0].department_count, counts[0].identity_count, counts[0].work_group_count].map(Number),
      [35, 11, 2, 0]
    );

    const updateRows = [fixture.rows[0].slice()];
    updateRows[0][0] = '';
    updateRows[0][3] = '';
    const updated = await model.importHrTable(buildPayload(fixture.headers, updateRows), orgId);
    assert.strictEqual(updated.status, 'success');
    const [preservedRows] = await pool.query(
      `SELECT h.name, d.name AS department_name
       FROM hr_info h LEFT JOIN departments d ON d.id = h.department_id AND d.org_id = h.org_id
       WHERE h.student_id = ? AND h.org_id = ?`,
      [fixture.rows[0][1], orgId]
    );
    assert.strictEqual(preservedRows[0].name, fixture.rows[0][0]);
    assert.strictEqual(preservedRows[0].department_name, fixture.rows[0][3]);

    const invalidRows = [fixture.rows[0].slice()];
    invalidRows[0][1] = 'T2026999';
    invalidRows[0][3] = '';
    const invalidPreview = await model.previewHrTableImport(buildPayload(fixture.headers, invalidRows), orgId);
    assert.strictEqual(invalidPreview.preview.validRows, 0);
    assert.strictEqual(invalidPreview.preview.invalidRows, 1);

    const targetWorkbookPath = process.env.HR_IMPORT_XLSX_PATH;
    if (targetWorkbookPath && fs.existsSync(targetWorkbookPath)) {
      const workbook = await parseWorkbookTables(fs.readFileSync(targetWorkbookPath));
      const sheet = workbook.find((item) => item.name === 'Sheet1');
      assert(sheet, '目标工作簿缺少 Sheet1');
      const table = sheet.table;
      const targetHeaders = table[0].map((value) => String(value == null ? '' : value).trim());
      const targetRows = table.slice(1).filter((row) => row.some((value) => String(value == null ? '' : value).trim()));
      const targetPayload = buildPayload(targetHeaders, targetRows);
      const targetOrgId = 'org-target-workbook';
      const targetPreview = await model.previewHrTableImport(targetPayload, targetOrgId);
      assert.strictEqual(targetPreview.preview.totalRows, 35);
      assert.strictEqual(targetPreview.preview.validRows, 35);
      assert.strictEqual(targetPreview.preview.newDepartments.length, 11);
      assert.strictEqual(targetPreview.preview.newIdentities.length, 2);
      assert.strictEqual(targetPreview.preview.newWorkGroups.length, 0);
      assert.strictEqual(targetPayload.mappingRows[5].target, 'ignore');
      const targetImport = await model.importHrTable(targetPayload, targetOrgId);
      assert.strictEqual(targetImport.count, 35);
      const [targetCounts] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM hr_info WHERE org_id = ?) AS hr_count,
           (SELECT COUNT(*) FROM departments WHERE org_id = ?) AS department_count,
           (SELECT COUNT(*) FROM identities WHERE org_id = ?) AS identity_count,
           (SELECT COUNT(*) FROM work_groups WHERE org_id = ?) AS work_group_count`,
        [targetOrgId, targetOrgId, targetOrgId, targetOrgId]
      );
      assert.deepStrictEqual(
        [targetCounts[0].hr_count, targetCounts[0].department_count, targetCounts[0].identity_count, targetCounts[0].work_group_count].map(Number),
        [35, 11, 2, 0]
      );
    }

    console.log('hrTableImport integration tests passed');
  } finally {
    if (pool) await pool.end();
    if (adminConnection) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
      await adminConnection.query(`DROP USER IF EXISTS '${testUser}'@'127.0.0.1'`);
      await adminConnection.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
