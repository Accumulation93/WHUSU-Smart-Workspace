const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const base = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules');
const utils = require(path.join(base, 'adminUtils'));
const pageCopy = require('../../shared/locales/zh-CN/generated/subpackages/scoring/pages/admin/admin');
const exportCopy = require('../../shared/locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/templateBehavior');
let definition;
vm.runInNewContext(fs.readFileSync(path.join(base, 'templateBehavior.js'), 'utf8'), {
  module: { exports: {} }, Behavior(value) { definition = value; return value; },
  require(name) {
    if (name === './adminUtils') return utils;
    if (name.includes('/locales/')) return require(path.resolve(base, name));
    return {};
  }
});
const fields = utils.TEMPLATE_CSV_FIELDS;
assert.strictEqual(fields.find(item => item.key === 'startValue').label, '起始分');
assert.strictEqual(fields.find(item => item.key === 'minValue').label, '最低分');
assert.strictEqual(pageCopy.copy_6cc2ee6bc8, '起始分');
assert.strictEqual(exportCopy.copy_4366ed3bb6, '起始分');
const headers = fields.map(item => item.label);
const mapping = definition.methods._buildTemplateCsvMapping(headers);
assert.deepStrictEqual(Object.values(mapping), fields.map(item => item.key));
const data = { templateCsvMapping: mapping, templateCsvFullRows: [['问题内容','分值说明','1','3','12','0.25']], templateCsvReplaceMode: true, templateForm: { questions: [] } };
const page = { data, _flushQuestionInputs() {}, setData(patch) { Object.assign(data, patch); } };
const oldWx = global.wx;
// 使用真实 Behavior 方法的宿主上下文，确认导出列回导时不会丢失起始分。
const source = fs.readFileSync(path.join(base, 'templateBehavior.js'), 'utf8');
vm.runInNewContext(source, { module: { exports: {} }, Behavior(value) { definition = value; return value; }, wx: { showToast() {} },
  require(name) { if (name === './adminUtils') return utils; if (name.includes('/locales/')) return require(path.resolve(base, name)); return {}; }
});
definition.methods.confirmTemplateCsvImport.call(page);
assert.strictEqual(data.templateForm.questions[0].minValue, '1');
assert.strictEqual(data.templateForm.questions[0].startValue, '3');
assert.strictEqual(data.templateForm.questions[0].maxValue, '12');
assert.strictEqual(global.wx, oldWx);
console.log('评分问题起始分：共享标签、原生列映射及实际导入回写通过');
