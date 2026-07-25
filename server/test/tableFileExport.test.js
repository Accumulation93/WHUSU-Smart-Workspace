'use strict';

const assert = require('assert');
const { buildCsvBuffer } = require('../src/core/routes/buildTableFile');

const csv = buildCsvBuffer([
  ['姓名', '备注', '公式'],
  ['张三', '含,逗号', '=1+1'],
  ['李"四', '两行\r\n内容', '@SUM(A1:A2)']
]).toString('utf8');

assert(csv.startsWith('\uFEFF姓名,备注,公式\r\n'), 'CSV 应包含 UTF-8 BOM 和统一换行');
assert(csv.includes('张三,"含,逗号",\'=1+1'), 'CSV 应转义逗号并阻止公式注入');
assert(csv.includes('"李""四","两行\r\n内容",\'@SUM(A1:A2)'), 'CSV 应转义引号和换行');

console.log('统一表格导出 CSV 测试通过');
