'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../../miniprogram/subpackages/workspace/package-resources/subpackages/scoring/pages/admin/modules/hrProfileMigrationBehavior.js');
const requirePageModule = createRequire(filename);

test('迁移阻断报告不能因携带检查令牌或关闭报告而提交，修改后须重新检查', async () => {
  let definition, blocked = true;
  const calls = [];
  const imports = {
    '../../../../../../../../utils/orgSession': { beginRequest: () => ({}), isRequestCurrent: () => true },
    './adminUtils': { showShortToast() {}, getErrorText: (_error, fallback) => fallback }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: { exports: {} },
    Behavior: value => { definition = value; return value; },
    require: name => imports[name] || requirePageModule(name)
  }, { filename });
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
