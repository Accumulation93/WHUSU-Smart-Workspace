'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const copy = require('../../shared/locales/zh-CN/hrProfileMigration');

test('迁移阻断报告不能因携带检查令牌或关闭报告而提交，修改后须重新检查', async () => {
  let definition, blocked = true;
  const calls = [];
  const imports = {
    '../../../package-resources/utils/hrValueValidation': require('../../shared/hrValueValidation'),
    '../../../package-resources/locales/zh-CN/hrValueValidation': require('../../shared/locales/zh-CN/hrValueValidation'),
    '../../../../../utils/orgSession': { beginRequest: () => ({}), isRequestCurrent: () => true },
    '../../../../../locales/zh-CN/hrProfileMigration': copy,
    '../../../package-resources/subpackages/scoring/pages/admin/modules/adminUtils': { showShortToast() {}, getErrorText: (_error, fallback) => fallback },
    '../../../package-resources/utils/hrProfileDate': { formatDateTextOnly: value => value }
  };
  const source = fs.readFileSync(path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/hrProfileMigrationBehavior.js'), 'utf8');
  vm.runInNewContext(source, { module: { exports: {} }, Behavior: value => { definition = value; return value; }, require: name => { assert(imports[name], name); return imports[name]; } });
  const page = Object.assign({}, definition.methods, { data: {
    canRequestProfileMigration: true, canExecuteProfileMigration: true, canDirectCrossOrgMigration: true,
    crossOrgMigrationSourceOrgId: 'source', crossOrgMigrationSelectedMembers: [{ personId: 'person' }],
    crossOrgMigrationFieldPlan: [{ sourceFieldId: 'field', targetTemplateFieldId: 'target', action: 'copy' }]
  } });
  page.setData = changes => Object.assign(page.data, changes);
  page.callCloud = async (name, data) => {
    calls.push({ name, data });
    if (name === 'previewCrossOrgMigration') return { status: blocked ? 'mapping_blocked' : 'success', switchToken: 'token', blockers: blocked ? [{ error: 'invalid' }] : [], conflicts: [] };
    return { status: 'success' };
  };
  page.loadCrossOrgMigrationRequests = () => {};
  await page.previewCrossOrgMigration();
  assert.equal(page.data.crossOrgMigrationToken, '');
  await page.applyCrossOrgMigration();
  page.closeCrossOrgMigrationReport();
  await page.applyCrossOrgMigration();
  assert.equal(calls.filter(item => item.name === 'applyCrossOrgMigration').length, 0);
  blocked = false;
  await page.previewCrossOrgMigration();
  await page.applyCrossOrgMigration();
  const saved = calls.find(item => item.name === 'applyCrossOrgMigration');
  assert(saved);
  assert.equal(saved.data.switchToken, 'token');
  assert.equal(saved.data.sourceOrgId, 'source');
  assert.deepEqual(Array.from(saved.data.personIds), ['person']);
});
