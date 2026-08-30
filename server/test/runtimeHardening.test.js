const assert = require('assert');
const { randomUUID } = require('crypto');
const JSZip = require('jszip');
const { normalizeRoutePath, createRateLimiter } = require('../src/middleware/rateLimiter');
const { buildWorkbookBuffer, parseWorkbookTables, decodeWorkbookBase64, LIMITS } = require('../src/utils/excelFile');
const { verifySchemaContract, REQUIRED_COLUMNS, REQUIRED_TABLES, REQUIRED_INDEXES } = require('../src/utils/schemaContract');

async function testExcel() {
  const buffer = await buildWorkbookBuffer('测试/表', [
    ['姓名', '说明\n（可换行）'],
    ['测试成员', '包含,逗号']
  ]);
  const decoded = decodeWorkbookBase64(buffer.toString('base64'));
  const sheets = await parseWorkbookTables(decoded);
  assert.strictEqual(sheets.length, 1);
  assert.strictEqual(sheets[0].name, '测试_表');
  assert.deepStrictEqual(sheets[0].table, [
    ['姓名', '说明\n（可换行）'],
    ['测试成员', '包含,逗号']
  ]);
  assert.throws(() => decodeWorkbookBase64('%%%'), /编码无效/);
  assert(LIMITS.maxFileBytes <= 8 * 1024 * 1024);

  const malformedWorkbook = new JSZip();
  malformedWorkbook.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  malformedWorkbook.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  malformedWorkbook.file('xl/workbook.xml', '<workbook><broken>');
  const malformedBuffer = await malformedWorkbook.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    () => parseWorkbookTables(malformedBuffer),
    (error) => error && error.code === 'invalid_workbook' && /有效的 XLSX/.test(error.message)
  );
}

function testRateLimiter() {
  assert.strictEqual(normalizeRoutePath('/api/items/123?x=1'), '/api/items/:id');
  assert.strictEqual(normalizeRoutePath('/api/items/' + randomUUID()), '/api/items/:id');
  const limiter = createRateLimiter({ windowMs: 60000, defaultMax: 1, loginMax: 1, capacity: 2 });
  const headers = {};
  const req = { path: '/api/example/123', ip: '127.0.0.1' };
  const res = {
    setHeader(name, value) { headers[name] = value; },
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCount = 0;
  limiter(req, res, () => { nextCount += 1; });
  limiter({ path: '/api/example/456', ip: '127.0.0.1' }, res, () => { nextCount += 1; });
  assert.strictEqual(nextCount, 1);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.body.status, 'rate_limited');
}

async function testSchemaContract() {
  const columnRows = REQUIRED_COLUMNS.map(([TABLE_NAME, COLUMN_NAME]) => ({ TABLE_NAME, COLUMN_NAME }));
  const tableRows = REQUIRED_TABLES.map((TABLE_NAME) => ({ TABLE_NAME }));
  const indexRows = REQUIRED_INDEXES.map(([TABLE_NAME, INDEX_NAME]) => ({ TABLE_NAME, INDEX_NAME }));
  let call = 0;
  const inspectedQueries = [];
  const pool = {
    async query(sql) {
      inspectedQueries.push(String(sql || ''));
      call += 1;
      if (call === 1) return [columnRows];
      if (call === 2) return [tableRows];
      if (call === 3) return [indexRows];
      return [[]];
    }
  };
  const result = await verifySchemaContract(pool);
  assert.strictEqual(result.status, 'ok');
  const identityIntegrityQuery = inspectedQueries.find((sql) => sql.includes('verified_accounts_without_login_method')) || '';
  assert(!identityIntegrityQuery.includes('persons_without_membership'),
    '自然人可以暂时不属于任何组织，删除最后一条成员关系后不得阻止服务启动');
  assert(identityIntegrityQuery.includes('account_recovery_credentials'),
    '已验证但未绑定微信的账号必须允许通过有效口令完成首次登录');
  assert(identityIntegrityQuery.includes("c.method = 'passphrase'")
    && identityIntegrityQuery.includes("c.status = 'active'")
    && identityIntegrityQuery.includes('AND c.id IS NULL'),
  '账号完整性检查只能阻止既无微信绑定、也无有效口令的已验证账号');

  call = 0;
  const incompletePool = {
    async query() {
      call += 1;
      if (call === 1) return [columnRows.slice(1)];
      if (call === 2) return [tableRows];
      return [indexRows];
    }
  };
  await assert.rejects(() => verifySchemaContract(incompletePool), /数据库迁移未完成/);
}

async function main() {
  await testExcel();
  testRateLimiter();
  await testSchemaContract();
  console.log('运行时加固测试通过');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
