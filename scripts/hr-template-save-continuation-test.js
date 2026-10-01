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
  const scrolls = [];
  const leaveGuards = [];
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
    wx: {
      showLoading() {},
      hideLoading() {},
      showToast() {},
      showModal(value) { modals.push(value); },
      pageScrollTo(value) { scrolls.push(value); },
      getSystemInfoSync() { return { windowHeight: 700 }; },
      enableAlertBeforeUnload(value) { leaveGuards.push(value); },
      disableAlertBeforeUnload() { leaveGuards.push('off'); }
    },
    require(name) {
      if (name.endsWith('/orgSession')) return orgSession;
      if (name.includes('/locales/') || name === './adminUtils' || name === './hrTemplateSwitchDraft'
        || name.endsWith('/utils/hrFieldMatching')) return localRequire(name);
      if (name.endsWith('/utils/tableFile')) {
        return {
          chooseTableFile: () => Promise.resolve(options.tableFile || null),
          buildCsv: () => '',
          buildExcelXml: () => '',
          saveAndShareFile: () => Promise.resolve({ success: true })
        };
      }
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
  return { page, calls, modals, scrolls, leaveGuards, switchContext() { context = 'org-b'; } };
}

function turn() { return new Promise(resolve => setImmediate(resolve)); }
/** 沙箱里的数组来自另一个 Realm，比较前转成本 Realm 的普通值。 */
const plain = (value) => JSON.parse(JSON.stringify(value));

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
  assert.deepEqual(plain(f.page.data.hrTemplateExpandedFieldIds), [], '打开模板时字段默认全部收起');
  assert.equal(f.page.data.hrProfileTemplateForm.editModeIndex, 1, '填写方式选择器必须按已保存枚举下标定位');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].typeIndex, 2);
  assert.equal(f.page.data.hrProfileTemplateForm.editModeHint, '成员提交后由管理员审核通过才生效', '填写方式要带一句说明');
  f.page.toggleHrTemplateFieldEditor({ currentTarget: { dataset: { fieldId: 'field-a' } } });
  assert.deepEqual(plain(f.page.data.hrTemplateExpandedFieldIds), ['field-a']);
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].expanded, true);
  f.page.toggleHrTemplateFieldEditor({ currentTarget: { dataset: { fieldId: 'field-a' } } });
  assert.deepEqual(plain(f.page.data.hrTemplateExpandedFieldIds), []);
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
  const editorWxml = fs.readFileSync(path.join(path.dirname(file),
    '../components/hrTemplateEditor/hrTemplateEditor.wxml'), 'utf8');
  const adminJson = fs.readFileSync(path.join(path.dirname(file), '../admin.json'), 'utf8');
  assert(wxml.includes('<hr-template-editor'), '编辑器必须作为独立组件引入，避免页面模板超限');
  assert(!wxml.includes('hr-template-inline-editor'), '内联模板必须移除');
  assert(adminJson.includes('"hr-template-editor"'));
  assert(editorWxml.includes('value="{{item.typeIndex || 0}}"'));
  assert(editorWxml.includes('hr-template-options-textarea'));
  assert(editorWxml.includes('bindlongpress="onHandleLongPress"'));
  assert(wxml.includes('hrTemplateCopy.viewEditAction'));
  assert(wxml.includes('hr-snapshot-fields hr-template-preview-fields'));
  assert(!wxml.includes('class="hr-template-field-summary"'));
  assert(!wxml.includes('class="inner-scroll large-scroll" scroll-y lower-threshold="80" bindscrolltolower="loadMoreScoreResults">\n            <view class="question-card"'));
  f = fixture();
  await f.page.saveHrProfileTemplate();
  assert.equal(f.modals[0].title, '模板已保存');
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

  // 顺序调整：上移/下移与拖动落位都要反映到提交顺序。
  f = fixture();
  f.page.data.hrProfileTemplateForm = { id: 'template-a', name: 'fixture', description: '', editMode: 'direct',
    fields: [
      { id: 'f1', label: '第一个', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' },
      { id: 'f2', label: '第二个', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' },
      { id: 'f3', label: '第三个', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' }
    ] };
  f.page.moveHrProfileField({ currentTarget: { dataset: { index: 2, dir: -1 } } });
  assert.deepEqual(plain(f.page.data.hrProfileTemplateForm.fields).map(item => item.label), ['第一个', '第三个', '第二个']);
  assert.equal(f.scrolls[f.scrolls.length - 1].selector, '#hr-template-field-f3', '调整后要停在同一个字段上');
  f.page.applyHrFieldDrop({ fromIndex: 0, toIndex: 2, fieldId: 'f1' });
  assert.deepEqual(plain(f.page.data.hrProfileTemplateForm.fields).map(item => item.id), ['f3', 'f2', 'f1']);
  f.page.moveHrProfileField({ currentTarget: { dataset: { index: 0, dir: -1 } } });
  assert.deepEqual(plain(f.page.data.hrProfileTemplateForm.fields).map(item => item.id), ['f3', 'f2', 'f1'], '第一项上移无效');
  f.page.toggleHrTemplateFieldEditor({ currentTarget: { dataset: { fieldId: 'f2' } } });
  f.page.toggleHrTemplateFieldEditor({ currentTarget: { dataset: { fieldId: 'f1' } } });
  assert.deepEqual(plain(f.page.data.hrTemplateExpandedFieldIds), ['f2', 'f1'], '允许多个字段同时展开');
  f.page.moveHrProfileField({ currentTarget: { dataset: { index: 2, dir: -1 } } });
  assert.deepEqual(plain(f.page.data.hrTemplateExpandedFieldIds), ['f2', 'f1'], '排序后展开状态仍跟着字段');
  await f.page.saveHrProfileTemplate();
  assert.deepEqual(plain(f.calls[0].data.fields).map(item => item.id), ['f3', 'f1', 'f2'], '提交顺序就是界面上看到的顺序');

  // 未保存提醒、放弃确认与删除确认。
  f = fixture();
  f.page.cancelHrProfileTemplateEditor();
  assert.equal(f.modals.length, 0, '没有改动时取消不打扰');
  assert.equal(f.page.data.showHrTemplateEditor, false);

  f = fixture();
  f.page.onHrProfileTemplateInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '改过的名字' } });
  assert.equal(f.page.data.hrTemplateDirty, true);
  assert.equal(f.leaveGuards[f.leaveGuards.length - 1].message, '模板还有未保存的修改', '有改动时离开要提醒');
  f.page.cancelHrProfileTemplateEditor();
  assert.equal(f.modals[0].content, '有未保存的修改，放弃后无法恢复。确定放弃吗？');
  assert.equal(f.page.data.showHrTemplateEditor, true, '未确认前不能关掉编辑器');
  f.modals[0].success({ confirm: true });
  assert.equal(f.page.data.showHrTemplateEditor, false);
  assert.equal(f.leaveGuards[f.leaveGuards.length - 1], 'off');

  f = fixture();
  f.page.data.hrProfileTemplateForm = { id: '', name: 'fixture', description: '', editMode: 'direct', fields: [
    { id: 'd1', label: '待删除', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' },
    { id: 'd2', label: '保留', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' }
  ] };
  f.page.removeHrProfileField({ currentTarget: { dataset: { index: 0 } } });
  assert(f.modals[0].content.includes('待删除'), '删除确认要写明是哪一项');
  assert.equal(f.page.data.hrProfileTemplateForm.fields.length, 2);
  f.modals[0].success({ confirm: true });
  assert.deepEqual(plain(f.page.data.hrProfileTemplateForm.fields).map(item => item.id), ['d2']);

  // 选项：一行一个、忽略空行、折叠只显示前两条、重复项可一键清理、可删单条。
  f = fixture();
  f.page.data.hrProfileTemplateForm = { id: '', name: 'fixture', description: '', editMode: 'direct', fields: [
    { id: 's1', label: '序列项', type: 'sequence', optionsText: '一\n二\n三\n\n二', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' }
  ] };
  f.page.applyHrTemplateFields(f.page.data.hrProfileTemplateForm.fields);
  let seq = f.page.data.hrProfileTemplateForm.fields[0];
  assert.deepEqual(plain(seq.optionsList), ['一', '二', '三', '二'], '空行自动忽略');
  assert.equal(seq.optionsCountText, '已填 4 项');
  assert.equal(seq.optionsSummary, '一、二 等共 4 项', '折叠行只显示前两条');
  assert.equal(seq.optionsDuplicateText, '有重复选项：二');
  f.page.dedupeHrProfileOptions({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsText, '一\n二\n三');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsDuplicateText, '');
  f.page.removeHrProfileOption({ currentTarget: { dataset: { index: 0, optionIndex: 1 } } });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsText, '一\n三');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsSummary, '一、三');

  // 选项框高度：5 行起步、12 行封顶；卡片默认只列前 6 条，可展开全部。
  const optionField = (id, optionsText) => ({ id, label: '序列项', type: 'sequence', optionsText,
    minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' });
  f = fixture();
  f.page.data.hrProfileTemplateForm = { id: '', name: 'fixture', description: '', editMode: 'direct', fields: [
    optionField('s1', ''),
    optionField('s2', '一'),
    optionField('s3', '一\n二\n三\n四\n五\n六\n七'),
    optionField('s4', Array.from({ length: 20 }, (_, i) => '选项' + (i + 1)).join('\n'))
  ] };
  f.page.applyHrTemplateFields(f.page.data.hrProfileTemplateForm.fields);
  let seqFields = f.page.data.hrProfileTemplateForm.fields;
  assert.deepEqual(plain(seqFields).map(item => item.optionsRows), [5, 1, 7, 12],
    '空字段留 5 行，有内容就贴合内容，最多 12 行');
  assert.equal(seqFields[2].optionsHiddenCount, 1, '超过 6 条默认只列前 6 条');
  assert.deepEqual(plain(seqFields[2].optionsViewList).map(item => item.text),
    ['一', '二', '三', '四', '五', '六']);
  assert.equal(plain(seqFields[2].optionsViewList).map(item => item.first).join(','),
    'true,false,false,false,false,false');
  assert.equal(seqFields[2].optionsViewList[5].last, false, '收起时第 6 条不是真正末项，仍可下移');
  assert.equal(seqFields[3].optionsExpandText, '展开全部（共 20 项）');
  f.page.toggleHrProfileOptionsExpand({ index: 2 });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[2].optionsExpanded, true);
  assert.equal(f.page.data.hrProfileTemplateForm.fields[2].optionsHiddenCount, 0);
  assert.equal(f.page.data.hrProfileTemplateForm.fields[2].optionsViewList.length, 7);
  assert.equal(f.page.data.hrProfileTemplateForm.fields[2].optionsViewList[6].last, true);
  f.page.toggleHrProfileOptionsExpand({ index: 2 });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[2].optionsHiddenCount, 1);

  // 选项顺序：按钮与拖动都只改行顺序，算改动，并决定保存顺序。
  f = fixture();
  f.page.data.hrProfileTemplateForm = { id: '', name: 'fixture', description: '', editMode: 'direct', fields: [
    optionField('o1', '甲\n乙\n丙') ] };
  f.page.applyHrTemplateFields(f.page.data.hrProfileTemplateForm.fields);
  f.page.markHrTemplateBaseline();
  assert.equal(f.page.data.hrTemplateDirty, false);
  f.page.moveHrProfileOption({ index: 0, optionIndex: 2, dir: -1 });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsText, '甲\n丙\n乙');
  assert.equal(f.page.data.hrTemplateDirty, true, '调整选项顺序属于改动');
  f.page.moveHrProfileOption({ index: 0, optionIndex: 0, dir: -1 });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsText, '甲\n丙\n乙', '第一项不能再上移');
  f.page.moveHrProfileOption({ index: 0, optionIndex: 2, dir: 1 });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsText, '甲\n丙\n乙', '最后一项不能再下移');
  f.page.applyHrOptionDrop({ index: 0, fromIndex: 0, toIndex: 2 });
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].optionsText, '丙\n乙\n甲');
  await f.page.saveHrProfileTemplate();
  assert.equal(f.calls[0].data.fields[0].options.join(','), '丙,乙,甲', '保存顺序就是界面上的顺序');

  // 表格导入：按列名认类型，标识类按文本，号码/日期/数字都要认出来。
  f = fixture({ tableFile: {
    headers: ['姓名', '学号', '联系电话', '邮箱', '出生日期', '人数', '编号', 'F1'],
    rows: [['张三', '2021302111001', '13800000000', 'a@b.com', '2004-08-31', '3', 'A-01', '12'],
      ['李四', '2021302111002', '13900000000', 'c@d.com', '2004-09-01', '5', 'A-02', '15']]
  } });
  await f.page.importTableFields();
  await turn();
  const importModal = f.modals[f.modals.length - 1];
  assert(importModal.content.includes('按列名识别'), '导入确认框要说明识别结果');
  importModal.success({ confirm: true });
  const importedTypes = plain(f.page.data.hrProfileTemplateForm.fields).map(item => item.type);
  assert.deepEqual(importedTypes, ['text', 'text', 'phone', 'email', 'date', 'number', 'text', 'number'],
    '学号与编号按文本，电话/邮箱/日期/人数按识别结果，纯数字列按数字');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[2].typeLabel, utils.PROFILE_FIELD_TYPE_OPTIONS
    .find(item => item.value === 'phone').label);

  // 保存前就地校验：错误要指名到字段并滚过去。
  f = fixture();
  f.page.data.hrProfileTemplateForm = { id: '', name: '', description: '', editMode: 'direct', fields: [
    { id: 'v1', label: '', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' }
  ] };
  await f.page.saveHrProfileTemplate();
  assert.equal(f.calls.length, 0, '本地就能发现的问题不应该打扰服务端');
  assert.equal(f.page.data.hrTemplateFormError, '请填写模板名称');
  assert.equal(f.scrolls[f.scrolls.length - 1].selector, '.hr-template-editor', '模板名出错要回到编辑器顶部');
  f.page.data.hrProfileTemplateForm.name = 'fixture';
  await f.page.saveHrProfileTemplate();
  assert.equal(f.page.data.hrTemplateFormError, '有 1 处需要修改，已定位到第一处');
  assert.equal(f.page.data.hrTemplateErrorCount, 1);
  assert.equal(f.page.data.hrProfileTemplateForm.fields[0].errorText, '请填写资料项名称');
  assert.equal(f.scrolls[f.scrolls.length - 1].selector, '#hr-template-field-v1');

  f = fixture();
  f.page.data.hrProfileTemplateForm = { id: '', name: 'fixture', description: '', editMode: 'direct', fields: [
    { id: 'v1', label: '重复名', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' },
    { id: 'v2', label: '重复名', type: 'text', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' },
    { id: 'v3', label: '长度反了', type: 'text', optionsText: '', minLength: '10', maxLength: '5', minDigits: '', maxDigits: '', minValue: '', maxValue: '' },
    { id: 'v4', label: '数字写了字', type: 'text', optionsText: '', minLength: 'abc', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' },
    { id: 'v5', label: '空序列', type: 'sequence', optionsText: '', minLength: '', maxLength: '', minDigits: '', maxDigits: '', minValue: '', maxValue: '' }
  ] };
  await f.page.saveHrProfileTemplate();
  assert.equal(f.calls.length, 0);
  assert.equal(f.page.data.hrTemplateErrorCount, 4);
  assert.equal(f.page.data.hrProfileTemplateForm.fields[1].errorText, '和前面的「重复名」重名');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[2].errorText, '最小长度不能大于最大长度');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[3].errorText, '这里要填数字，留空表示不限');
  assert.equal(f.page.data.hrProfileTemplateForm.fields[4].errorText, '序列至少要有一个选项');
  assert.equal(f.scrolls[f.scrolls.length - 1].selector, '#hr-template-field-v2', '滚到第一处问题');

  console.log('人事模板编辑：顺序调整、多字段展开、未保存提醒、删除确认、选项预览、导入识别、就地校验、保存后续通过');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
