'use strict';

const assert = require('assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseJsonBody } = require('../src/middleware/jsonBodyLimit');
const { DEFAULT_JSON_BODY_BYTES, LARGE_JSON_BODY_BYTES } = require('../src/config/requestBodyLimits');

async function run() {
  const app = express();
  app.use(parseJsonBody);
  app.use((req, res, next) => { if (req.get('x-test-admin') === 'yes') req.admin = { id: 'fixture' }; next(); });
  app.use('/api', require('../src/core/routes/buildTableFile'));
  app.post('/api/ordinaryForm', (req, res) => res.json({ status: 'success' }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = Array.from({ length: 12 }, (_, i) => ({ key: 'field' + i, label: '资料项目' + i }));
  const rows = Array.from({ length: 800 }, (_, i) => Object.fromEntries(headers.map(h => [h.key, '测试成员资料内容'.repeat(3) + i])));
  // 与成员资料页一致的 headers/rows/format/sheetName 参数，覆盖真实规模和最终文件回读。
  const payload = { headers, rows, sheetName: '成员资料', format: 'xlsx' };
  assert(Buffer.byteLength(JSON.stringify(payload)) > DEFAULT_JSON_BODY_BYTES);
  const post = (route, data, admin = true) => fetch(base + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-admin': admin ? 'yes' : 'no' }, body: JSON.stringify(data)
  });
  try {
    const exported = [];
    const pageModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
      '../../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js'), 'utf8'), {
      module: pageModule, Behavior: value => value,
      require: name => name.endsWith('/tableFile') ? { saveAndShareFile: async (...args) => exported.push(args) }
        : name === './adminUtils' ? { showShortToast: message => { throw new Error(String(message)); } } : {}
    });
    for (const format of ['xlsx', 'csv']) {
      const page = { data: { currentOrganizationName: '测试组织' }, setLoading() {}, setData() {},
        callCloud: async (name, data) => {
          assert.equal(name, 'buildTableFile');
          const response = await post('/api/' + name, data);
          assert.equal(response.status, 200);
          const result = await response.json();
          assert.equal(result.status, 'success');
          return result;
        } };
      await pageModule.exports.methods.exportHrProfileFile.call(page, headers, rows, format);
      assert.equal(exported.length, format === 'xlsx' ? 1 : 2);
      const output = exported[exported.length - 1];
      assert.equal(output[2], format);
      const bytes = Buffer.from(output[0], 'base64');
      if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes);
        const sheet = workbook.worksheets[0];
        assert.equal(sheet.rowCount, 801);
        assert.equal(sheet.columnCount, 12);
        assert.equal(sheet.getCell(801, 12).value, rows[799].field11);
      } else {
        const text = bytes.toString('utf8');
        assert.equal(text.split('\r\n').length, 801);
        assert(text.includes(rows[799].field11));
      }
    }
    assert.equal((await post('/api/buildTableFile', payload, false)).status, 403);
    assert.equal((await post('/api/ordinaryForm', payload)).status, 413);
    assert.equal((await post('/api/buildTableFile', { padding: 'x'.repeat(LARGE_JSON_BODY_BYTES) })).status, 413);
    const invalid = await (await post('/api/buildTableFile', { ...payload, rows: [{ field0: 'x'.repeat(20001) }] })).json();
    assert.notEqual(invalid.status, 'success');
    console.log('表格导出：800行×12列 Excel/CSV真实HTTP与文件回读通过；权限、普通接口及15MiB上限保留');
  } finally { await new Promise(resolve => server.close(resolve)); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
