'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = path.resolve(__dirname, '../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js');
const checked = [];
const sandbox = { module: { exports: {} }, Behavior: value => value,
  require(name) {
    if (name === './adminUtils') return { validateProfileField(field) { checked.push(field.id); return ''; } };
    return {};
  }, wx: { showToast() { throw new Error('合法字段保存不应要求姓名或学号'); } } };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
const methods = sandbox.module.exports.methods;
async function run() {
  let saved;
  const host = { data: { authorizationEnforced: true, canManageHrPeople: true, detailCanManagePeople: true,
    detailHrId: 'member', detailWritableFieldIds: ['phone'], detailHrValues: { phone: '123', private: 'hidden', _name: '', _studentId: '' },
    detailHrTemplate: { fields: [{ id: 'phone' }, { id: 'private', required: true }] } },
    async _saveHrPersonProfile(payload) { saved = JSON.parse(JSON.stringify(payload)); },
    setData(patch) { Object.assign(this.data, patch); } };
  await methods.saveHrPersonDetail.call(host);
  assert.deepEqual(saved, { hrId: 'member', profileValues: { phone: '123' } });
  assert.deepEqual(checked, ['phone']);
  methods.onDetailProfileFieldInput.call(host, { currentTarget: { dataset: { field: 'private' } }, detail: { value: 'changed' } });
  assert.equal(host.data.detailHrValues.private, 'hidden');
  saved = null;
  host.data.detailCanManagePeople = false;
  await methods.saveHrPersonDetail.call(host);
  assert.equal(saved, null);
  console.log('人事逐字段授权：仅发送获授列、无需姓名学号、只校验可写列、只读输入拒绝和撤权拒绝通过。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
