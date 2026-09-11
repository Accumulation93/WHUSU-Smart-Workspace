const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// 模拟持久层，运行真实保存与读取函数；禁止把模板定义保存伪装成组织资料已应用。
async function main() {
  let fields = [];
  let sequence = 0;
  const template = { id: 'template', name: '资料', edit_mode: 'direct' };
  const writes = [];
  const connection = { query: async (sql, args = []) => {
    if (/^(INSERT|UPDATE|DELETE)/.test(sql)) writes.push(sql);
    if (sql.startsWith('SELECT id FROM hr_profile_templates WHERE name')) return [[]];
    if (sql.startsWith('SELECT id FROM hr_profile_templates WHERE id')) return [[{ id: template.id }]];
    if (sql.startsWith('UPDATE hr_profile_templates SET')) {
      Object.assign(template, { name: args[0], description: args[1], edit_mode: args[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM hr_profile_template_fields')) { fields = []; return [{}]; }
    if (sql.startsWith('INSERT INTO hr_profile_template_fields')) {
      const keys = ['id', 'template_id', 'sort_order', 'label', 'type', 'required', 'min_length', 'max_length',
        'number_rule', 'allow_decimal', 'min_digits', 'max_digits', 'min_value', 'max_value', 'options_json'];
      fields.push(Object.fromEntries(keys.map((key, index) => [key, args[index]])));
      return [{}];
    }
    if (sql === 'SELECT * FROM hr_profile_templates ORDER BY name') return [[template]];
    if (sql.startsWith('SELECT * FROM hr_profile_template_fields ORDER BY')) return [fields];
    if (sql.startsWith('SELECT * FROM org_hr_profile_template_snapshots')) {
      assert.equal(args[0], 'org-self');
      return [[{ id: 'snapshot', org_id: 'org-self', edit_mode: 'direct' }]];
    }
    if (sql.startsWith('SELECT * FROM org_hr_profile_template_snapshot_fields')) {
      assert.equal(args[0], 'snapshot');
      return [[{ id: 'old-field', label: '资料项', type: 'text' }]];
    }
    throw new Error('未预期的 SQL：' + sql);
  } };
  const dependencies = {
    '../../locales/zh-CN/generated/core/services/hrProfileTemplateLibrary': require('../src/locales/zh-CN/generated/core/services/hrProfileTemplateLibrary'),
    '../../locales/runtime': require('../src/locales/runtime'),
    crypto: require('node:crypto'),
    '../../config/db': Object.assign({ withTransaction: callback => callback(connection) }, connection),
    '../../middleware/auth': { JWT_SECRET: 'isolated-template-save-test' },
    '../../utils/helpers': Object.assign({}, require('../src/utils/helpers'), { generateId: () => 'field-' + (++sequence) }),
    '../../utils/orgContext': { getCurrentOrgId: () => 'org-self' },
    './hrProfileFieldSuggestions': require('../src/core/services/hrProfileFieldSuggestions')
  };
  const sandbox = { module: { exports: {} }, require: key => {
    assert(Object.prototype.hasOwnProperty.call(dependencies, key), '未模拟依赖：' + key);
    return dependencies[key];
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/core/services/hrProfileTemplateLibrary.js'), 'utf8'), sandbox);
  const library = sandbox.module.exports;
  for (const type of ['number', 'sequence']) {
    const result = await library.saveDefinition({ id: 'template', name: '资料', editMode: 'direct',
      fields: [{ label: '资料项', type, options: type === 'sequence' ? ['甲', '乙'] : [] }] }, { id: 'operator' });
    assert.equal(result.status, 'success');
    const saved = (await library.listTemplates())[0].fields[0];
    assert.equal(saved.type, type);
    if (type === 'sequence') assert.equal(JSON.stringify(saved.options), '["甲","乙"]');
    const active = await library.getActiveSnapshot('org-self');
    assert.equal(active.fields[0].type, 'text', '定义保存不得暗中改写任何组织现有资料类型');
  }
  assert(writes.every(sql => !sql.includes('org_hr_profile_template')));
  assert(library._test.validateMappedValue({ type: 'number', allow_decimal: false }, '非数字'));
  assert(library._test.validateMappedValue({ type: 'sequence', options_json: '["甲","乙"]' }, '丙'));
  console.log('模板保存回读通过：数字/序列与选项持久化、组织隔离、不兼容旧值阻断');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
