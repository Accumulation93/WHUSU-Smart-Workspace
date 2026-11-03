'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || require('node:crypto').randomBytes(32).toString('hex');
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || require('node:crypto').randomBytes(32).toString('hex');
const library = require('../src/core/services/hrProfileTemplateLibrary');
const valid = {label:'学院',type:'text',options:[]};

test('模板问题使用提交顺序定位，不依赖资料项名称出现在提示中', async () => {
  const issue = library._test.validateDefinitionIssue('资料', 'direct', [valid, {label:'',type:'text',options:[]}]);
  assert.equal(issue.fieldIndex, 1); assert.equal(issue.reasonCode, 'field_name_required');
  assert.equal(library._test.validateDefinition('资料', 'direct', [valid, {label:'',type:'text',options:[]}]), issue.message);
  const duplicate = library._test.validateDefinitionIssue('资料','direct',[valid,valid]);
  assert.equal(duplicate.fieldIndex, 1); assert.equal(duplicate.reasonCode,'field_name_duplicate');
  const emptyOptions = await library.saveDefinition({name:'资料',fields:[valid,{label:'学历',type:'sequence',options:[' ','']} ]},{});
  assert.equal(emptyOptions.code, 'hr_template_definition_invalid');
  assert.deepEqual(emptyOptions.validationIssue,{reasonCode:'field_options_required',fieldIndex:1});
  assert.equal(Object.hasOwn(emptyOptions.validationIssue, 'message'),false);
});

test('模板级错误没有虚构行号，数字和说明长度只返回既有约束事实', () => {
  assert.equal(library._test.validateDefinitionIssue('', 'direct', []).fieldIndex, undefined);
  const longHint = library._test.validateDefinitionIssue('资料','direct',[{...valid,hint:'字'.repeat(201)}]);
  assert.equal(longHint.reasonCode,'field_hint_too_long'); assert.equal(longHint.limit,200);
  const length = library._test.validateDefinitionIssue('资料','direct',[{...valid,minLength:NaN}]);
  assert.equal(length.reasonCode,'field_length_invalid'); assert.equal(length.bound,'min');
  const value = library._test.validateDefinitionIssue('资料','direct',[{...valid,maxValue:Infinity}]);
  assert.equal(value.reasonCode,'field_value_invalid'); assert.equal(value.bound,'max');
  assert.equal(library._test.validateDefinitionIssue('资料','direct',[valid]), null);
});
