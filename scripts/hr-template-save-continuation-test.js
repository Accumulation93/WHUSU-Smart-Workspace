'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.join(__dirname, '../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js');
const localRequire = require('node:module').createRequire(file);

function fixture(options = {}) {
  let definition;
  let context = 'org-a';
  const calls = [];
  const modals = [];
  const orgSession = {
    beginRequest(page, channel) {
      page._sequences = page._sequences || {};
      const sequence = (page._sequences[channel] || 0) + 1;
      page._sequences[channel] = sequence;
      return { channel, sequence, context };
    },
    isRequestCurrent(page, request) {
      return request.context === context && page._sequences[request.channel] === request.sequence;
    }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: { exports: {} },
    Behavior(value) { definition = value; return value; },
    wx: { showLoading() {}, hideLoading() {}, showToast() {}, showModal(value) { modals.push(value); } },
    require(name) {
      if (name.endsWith('/orgSession')) return orgSession;
      if (name.includes('/locales/') || name === './adminUtils' || name === './hrTemplateSwitchDraft') return localRequire(name);
      return {};
    }
  }, { filename: file });
  const page = Object.assign({
    _pageVisible: true,
    data: { loadingMap: {}, canManageHrProfileTemplates: true, canSelectHrProfileTemplate: options.mayApply !== false,
      showHrTemplateEditor: true,
      hrProfileTemplateForm: { id: 'template-a', name: 'fixture', description: '', editMode: 'direct',
        fields: [{ label: 'fixture-field', type: 'sequence', optionsText: 'one\ntwo', minLength: '', maxLength: '',
          minDigits: '', maxDigits: '', minValue: '', maxValue: '' }] } },
    setData(patch, callback) {
      this._setDataCount = (this._setDataCount || 0) + 1;
      Object.keys(patch).forEach(key => {
        const segments = key.split('.');
        let target = this.data;
        segments.slice(0, -1).forEach(part => { target = target[part]; });
        target[segments[segments.length - 1]] = patch[key];
      });
      if (callback) callback();
    },
    setLoading(name, value) { this.setData({ loadingMap: Object.assign({}, this.data.loadingMap, { [name]: value }) }); },
    async callCloud(name, data) {
      calls.push({ name, data });
      if (name === 'saveHrProfileTemplateDefinition') {
        if (options.save) return options.save();
        return { status: 'success', id: 'template-a' };
      }
      if (name === 'listHrProfileTemplates') return { status: 'success', list: [], activeSnapshot: null,
        canManage: true, canSelect: options.mayApply !== false };
      if (name === 'getHrProfileTemplateSwitchContext') {
        if (options.loadSwitch) return options.loadSwitch();
        return { status: 'success', targetTemplate: { id: 'template-a', fields: [] }, sourceFields: [] };
      }
      throw new Error('意外的持久化请求：' + name);
    }
  }, definition.methods);
  return { page, calls, modals, switchContext() { context = 'org-b'; } };
}

function turn() { return new Promise(resolve => setImmediate(resolve)); }

async function main() {
  let f = fixture();
  const utils = localRequire('./adminUtils');
  for (let index = 0; index < utils.PROFILE_FIELD_TYPE_OPTIONS.length; index += 1) {
    const option = utils.PROFILE_FIELD_TYPE_OPTIONS[index];
    const normalized = utils.normalizeHrProfileFieldForForm({ id: 'field', label: '测试字段', type: option.value, options: ['一', '二'] });
    assert.equal(normalized.typeLabel, option.label);
    assert.equal(normalized.typeIndex, index, '重新打开选择器必须定位已保存类型，不能回落文本');
  }
  f.page.data.showHrTemplateEditor = false;
  f.page.data.hrProfileTemplateList = [{ id: 'template-a', name: 'fixture', editMode: 'audit', fields: [
    { id: 'field-a', label: '测试字段', type: 'sequence', options: ['一', '二'] }
  ] }];
  f.page.editHrProfileTemplate({ currentTarget: { dataset: { id: 'template-a', index: 0 } } });
  assert.equal(f.page.data.hrTemplateExpandedField, 0);
  assert.equal(f.page.data.hrProfileTemplateForm.editModeIndex, 1, '填写方式选择器必须按已保存枚举下标定位');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].typeIndex, 2);
  f.page.toggleHrTemplateFieldEditor({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(f.page.data.hrTemplateExpandedField, -1);
  f.page.onHrProfileFieldTypeChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: 1 } });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].type, 'number');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].typeIndex, 1);
  f.page.onHrProfileEditModeChange({ detail: { value: 2 } });
  assert.equal(f.page.data.hrProfileTemplateForm.editMode, 'readonly');
  assert.equal(f.page.data.hrProfileTemplateForm.editModeIndex, 2);
  f.page.cancelHrProfileTemplateEditor();
  assert.equal(f.calls.length, 0, '展开、收起、编辑和取消均不得持久化');
  assert.equal(f.page.data.hrProfileTemplateList[0].fields[0].type, 'sequence', '草稿不得污染库中预览');
  const wxml = fs.readFileSync(path.join(path.dirname(file), '../admin.wxml'), 'utf8');
  assert(wxml.includes('value="{{item.typeIndex || 0}}"'));
  assert(wxml.includes('template name="hr-template-inline-editor"'));
  assert(!wxml.includes('class="inner-scroll large-scroll" scroll-y lower-threshold="80" bindscrolltolower="loadMoreScoreResults">\n            <view class="question-card"'));
  f = fixture();
  await f.page.saveHrProfileTemplate();
  assert.equal(f.modals[0].title, '模板库已保存');
  assert.equal(f.modals[0].showCancel, true);
  assert.equal(f.calls[0].data.fields[0].type, 'sequence');
  assert.equal(f.calls[0].data.fields[0].options.join(','), 'one,two');
  f.modals[0].success({ confirm: true });
  await turn();
  assert.equal(f.calls[f.calls.length - 1].name, 'getHrProfileTemplateSwitchContext');
  assert.equal(f.page.data.hrTemplateSwitchVisible, true);
  assert.ok(f.calls.every(call => !call.name.startsWith('apply') && !call.name.startsWith('preview')));

  f = fixture();
  await f.page.saveHrProfileTemplate();
  f.modals[0].success({ confirm: false });
  assert.equal(f.calls.length, 2);
  assert.equal(f.page.data.showHrTemplateEditor, false);

  f = fixture({ mayApply: false });
  await f.page.saveHrProfileTemplate();
  assert.equal(f.modals[0].showCancel, false);
  f.modals[0].success({ confirm: true });
  assert.equal(f.calls.length, 2);

  f = fixture({ save: async () => ({ status: 'invalid_params', message: '请选择完整的序列选项' }) });
  const draft = f.page.data.hrProfileTemplateForm;
  await f.page.saveHrProfileTemplate();
  assert.equal(f.modals[0].content, '请选择完整的序列选项');
  assert.equal(f.page.data.hrProfileTemplateForm, draft);
  assert.equal(f.page.data.showHrTemplateEditor, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.page.data.loadingMap.saveProfileTemplate, false);

  f = fixture({ save: async () => { throw new Error('internal-driver-detail'); } });
  await f.page.saveHrProfileTemplate();
  assert.ok(!f.modals[0].content.includes('internal-driver-detail'));
  assert.equal(f.page.data.showHrTemplateEditor, true);

  let finishSave;
  f = fixture({ save: () => new Promise(resolve => { finishSave = resolve; }) });
  const saving = f.page.saveHrProfileTemplate();
  await f.page.saveHrProfileTemplate();
  assert.equal(f.calls.length, 1);
  f.page._pageVisible = false;
  f.page.data.loadingMap.unrelatedWork = true;
  const beforeCancel = f.page._setDataCount;
  f.page.cancelHrTemplateSaveContinuation();
  assert.equal(f.page._setDataCount, beforeCancel + 1, '取消仅提交一次视图更新');
  assert.equal(f.page.data.loadingMap.unrelatedWork, true);
  assert.equal(f.page.data.loadingMap.hrProfileTemplates, false);
  assert.equal(f.page.data.loadingMap.hrTemplateSwitch, false);
  f.page._pageVisible = true;
  finishSave({ status: 'success', id: 'template-a' });
  await saving;
  assert.equal(f.modals.length, 0);
  assert.equal(f.page.data.showHrTemplateEditor, true);
  assert.equal(f.page.data.loadingMap.saveProfileTemplate, false);

  f = fixture();
  await f.page.saveHrProfileTemplate();
  f.switchContext();
  f.modals[0].success({ confirm: true });
  assert.equal(f.calls.length, 2);

  f = fixture();
  await f.page.saveHrProfileTemplate();
  f.page.data.canSelectHrProfileTemplate = false;
  f.modals[0].success({ confirm: true });
  assert.equal(f.calls.length, 2);

  let finishSwitch;
  f = fixture({ loadSwitch: () => new Promise(resolve => { finishSwitch = resolve; }) });
  await f.page.saveHrProfileTemplate();
  f.modals[0].success({ confirm: true });
  await turn();
  f.page._pageVisible = false;
  f.page.cancelHrTemplateSaveContinuation();
  f.page._pageVisible = true;
  finishSwitch({ status: 'success', targetTemplate: { id: 'template-a', fields: [] }, sourceFields: [] });
  await turn();
  assert.notEqual(f.page.data.hrTemplateSwitchVisible, true);
  console.log('人事模板保存后续流程：真实参数、明确确认、取消、权限、失败草稿、离页/换组织/迟到回调通过');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
