const copy = require('../../package-resources/locales/zh-CN/hrImport');
const { format } = require('../../package-resources/locales/runtime');
const { callFunction } = require('../../../../utils/api');
const { chooseTableFile, saveAndShareFile } = require('../../package-resources/utils/tableFile');
const orgSession = require('../../../../utils/orgSession');
const eventBus = require('../../../../utils/eventBus');
const messageQueries = require('../../../../utils/messageQueries');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');

const BASIC = ['name', 'studentId', 'nature', 'department', 'identity', 'workGroup', 'assignmentId', 'assignmentVersion'];
const NATURES = ['', 'staff', 'liaison', 'other'];
const clone = value => JSON.parse(JSON.stringify(value));
function actionLabel(action) {
  if (action.type === 'refresh') return copy.refresh;
  if (action.type === 'source') return format(copy.useSourceRow, [action.value]);
  if (action.type === 'policy') return copy[action.value];
  return copy[{ exclude: 'excludeRelated', mode: action.value === 'new' ? 'newAssignment' : 'personOnly', select: 'selectAssignment',
    dictionary: 'create', edit: 'edit', source: 'useRow', rebase: 'rebase', undo: 'restore' }[action.type]] || copy.save;
}
function readable(value) {
  if (typeof value === 'string') return value || copy.empty;
  if (Array.isArray(value)) return value.map(item => format(copy.rowLabel, [item.rowNumber]) + ' ' + (item.value || copy.empty)).join('\n');
  return copy.empty;
}

Page({
  data: {
    copy, navigationTitle: copy.navigationTitle, navTopPx: 0, busy: false, error: '', stage: 'file', fileSummary: '',
    mappings: [], mappingOptions: [], natureOptions: NATURES.map(key => key ? copy[key] : copy.chooseNature), natureIndex: 0,
    fields: [], categories: [], category: '', view: 'open', items: [], hasMore: false, total: 0,
    summaryText: '', executionText: '', canExecute: false, selectedCount: 0, selectedText: '', batchOptions: [],
    pickerVisible: false, pickerOptions: [], pickerValue: [], pickerContext: '', contextSwitchGuardVisible: false,
    editor: null, confirmAction: null, requestId: '', completed: false, includeProfile: false,
    viewOptions: [{ key: 'open', label: copy.problems }, { key: 'resolved', label: copy.resolved }, { key: 'changes', label: copy.changes }, { key: 'rows', label: copy.peopleView }, { key: 'excluded', label: copy.excluded }]
  },
  onLoad() {
    this._active = true;
    this._decisions = { rows: {}, dictionaries: [], sources: {} };
    this._selected = new Set();
    this._offsets = {};
    this._views = {};
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },
  onShow() {
    this._active = true;
    const state = orgSession.consume(this);
    if (state.changed) this.resetSession();
    this.loadMetadata();
  },
  onHide() { this._active = false; orgSession.invalidateRequests(this); this.setData({ busy: false, pickerVisible: false, contextSwitchGuardVisible: false }); },
  onUnload() { this._active = false; this._destroyed = true; orgSession.invalidateRequests(this); this._file = null; this._decisions = null; this.setData({ pickerVisible: false, contextSwitchGuardVisible: false }); },
  onResize() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onReachBottom() { if (this.data.hasMore && !this.data.busy) this.loadItems(true); },
  onPageScroll(event) { this._scrollTop = event.scrollTop; },
  resetSession() {
    this._file = null; this._previewId = ''; this._decisions = { rows: {}, dictionaries: [], sources: {} }; this._selected.clear(); this._views = {}; this._offsets = {};
    this._metadata = null; this._mappingOptions = null;
    this.setData({ stage: 'file', items: [], categories: [], fields: [], mappings: [], fileSummary: '', editor: null, requestId: '', completed: false, pickerVisible: false, contextSwitchGuardVisible: false, error: '', canExecute: false });
  },
  restart() { if (this.data.completed) this.resetSession(); },
  async api(name, data) {
    const result = await callFunction({ name, data: data || {} });
    if (result.status !== 'success') { const error = new Error(result.message || copy.errorDetails); error.code = result.status; error.issues = result.issues; throw error; }
    return result;
  },
  async loadMetadata() {
    const request = orgSession.beginRequest(this, 'metadata');
    try {
      const result = await this.api('getHrImportMetadata');
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      this._metadata = result;
      this._mappingOptions = [{ key: '', label: copy.ignore }].concat(BASIC.map(key => ({ key, label: copy[key] })), result.fields.map(field => ({ key: 'profile:' + field.id, label: field.label })));
      this.setData({ mappingOptions: this._mappingOptions, fields: result.fields });
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
  },
  async chooseFile() {
    if (this.data.busy || this.data.requestId) return;
    if (!this._mappingOptions) { await this.loadMetadata(); if (!this._mappingOptions) return; }
    const request = orgSession.beginRequest(this, 'file');
    this.setData({ busy: true, error: '' });
    try {
      const file = await chooseTableFile((name, data) => this.api(name, data));
      // 微信文件选择可能暂时隐藏页面；返回后只接受原账号及工作角色的结果。
      if (this._destroyed || !orgSession.isCurrent(request.snapshot) || !file) return;
      if (!file.rows.length) throw new Error(copy.emptyFile);
      this._file = file; this._previewId = '';
      this._decisions = { rows: {}, dictionaries: [], sources: {} };
      const used = new Set();
      const mappings = file.headers.map((header, index) => {
        let selectedIndex = this._mappingOptions.findIndex(item => item.key && item.label === header && !used.has(item.key));
        if (selectedIndex < 0) selectedIndex = 0;
        if (selectedIndex) used.add(this._mappingOptions[selectedIndex].key);
        return { index, header, label: format(copy.columnSummary, [index + 1, header]), selectedIndex, target: this._mappingOptions[selectedIndex].key, targetLabel: this._mappingOptions[selectedIndex].label };
      });
      this._pendingActions = null; this._editorClears = {};
      this.setData({ stage: 'mapping', mappings, fileSummary: format(copy.fileSummary, [file.fileName, file.rows.length]), completed: false, editor: null, confirmAction: null });
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
    finally { if (!this._destroyed && orgSession.isCurrent(request.snapshot)) this.setData({ busy: false }); }
  },
  onMappingChange(event) {
    if (this.data.busy) return;
    const index = Number(event.currentTarget.dataset.index);
    const selectedIndex = Number(event.detail.value);
    const choice = this._mappingOptions[selectedIndex];
    this.setData({ ['mappings[' + index + '].selectedIndex']: selectedIndex, ['mappings[' + index + '].target']: choice.key, ['mappings[' + index + '].targetLabel']: choice.label });
  },
  onNatureChange(event) { this.setData({ natureIndex: Number(event.detail.value) }); },
  onIncludeProfile(event) { this.setData({ includeProfile: Boolean(event.detail.value) }); },
  payload() {
    const basicMapping = {}; const extensionMapping = [];
    const targets = this.data.mappings.filter(item => item.target).map(item => item.target);
    if (new Set(targets).size !== targets.length) throw new Error(copy.invalidMapping);
    this.data.mappings.forEach(item => {
      if (item.target.indexOf('profile:') === 0) extensionMapping.push({ fieldId: item.target.slice(8), columnIndex: item.index });
      else if (item.target) basicMapping[item.target] = item.index;
    });
    return { schemaVersion: 2, headers: this._file.headers, rows: this._file.rows, rowNumbers: this._file.rowNumbers, basicMapping, extensionMapping,
      defaultNature: NATURES[this.data.natureIndex], decisions: this._decisions, previousPreviewId: this._previewId || '' };
  },
  async preview() {
    if (this.data.busy || !this._file || this.data.requestId) return;
    const request = orgSession.beginRequest(this, 'preview');
    this.setData({ busy: true, error: '', canExecute: false });
    let accepted = false;
    try {
      const result = await this.api('previewHrTableImport', this.payload());
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      this._previewId = result.previewId;
      this._staleIssue = false;
      if (result.decisions) this._decisions = result.decisions;
      this._views = {};
      this._summary = result.summary;
      this._selected.clear();
      const categories = result.categories.map(item => Object.assign({}, item, { summaryText: format(copy.groupSummary, [item.count, item.rowCount, item.resolved]) }));
      const current = categories.find(item => item.key === this.data.category);
      const category = current ? current.key : (categories.find(item => item.count) || categories[0] || {}).key || '';
      const summary = result.summary;
      this.setData({ stage: 'review', categories, category, canExecute: summary.canExecute, selectedCount: 0, selectedText: '',
        summaryText: format(copy.summary, [summary.problemCount, summary.problemRowCount, summary.resolvedCount]),
        executionText: format(copy.executionSummary, [summary.newMembers, summary.newAssignments, summary.updatedAssignments, summary.profileValues, summary.newDictionaries, summary.excludedRows]) });
      accepted = true;
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
    if (accepted) await this.loadItems(false);
  },
  async loadItems(append) {
    if (!this._previewId || this.data.busy || this._staleIssue) return;
    const request = orgSession.beginRequest(this, 'items');
    const offset = append ? this.data.items.length : 0;
    this.setData({ busy: true });
    try {
      const result = await this.api('getHrImportPreview', { previewId: this._previewId, category: this.data.category, view: this.data.view, offset });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      const items = result.items.map((item, index) => Object.assign({}, item, {
        id: item.id || this.data.view + ':' + (offset + index), index: offset + index, title: item.message || copy[item.type] || (this.data.view === 'rows' ? copy.peopleView : copy.excluded),
        rowText: format(copy.rowLabel, [item.rowNumbers.join(' / ')]), beforeText: readable(item.before), afterText: readable(item.after),
        selected: this._selected.has(item.id), actions: (item.actions || []).map(action => Object.assign({}, action, { label: actionLabel(action) }))
      }));
      const patch = { total: result.total, hasMore: result.hasMore };
      if (append) items.forEach((item, index) => { patch['items[' + (offset + index) + ']'] = item; });
      else patch.items = items;
      this.setData(patch);
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  switchList(patch) {
    if (this.data.busy || this._staleIssue) return;
    const oldKey = this.data.view + ':' + this.data.category;
    this._offsets[oldKey] = this._scrollTop || 0;
    this._views[oldKey] = { items: this.data.items.map(item => Object.assign({}, item, { selected: false })), total: this.data.total, hasMore: this.data.hasMore };
    this._selected.clear();
    const key = (patch.view || this.data.view) + ':' + (patch.category || this.data.category);
    const cached = this._views[key];
    this.setData(Object.assign({ selectedCount: 0, selectedText: '' }, patch, cached || { items: [], hasMore: false }), async () => {
      if (!cached) await this.loadItems(false);
      if (this._active) wx.pageScrollTo({ scrollTop: this._offsets[key] || 0, duration: 0 });
    });
  },
  changeCategory(event) { this.switchList({ category: event.currentTarget.dataset.key }); },
  changeView(event) { this.switchList({ view: event.currentTarget.dataset.key }); },
  toggleProblem(event) {
    if (this.data.busy) return;
    const index = Number(event.currentTarget.dataset.index); const item = this.data.items[index];
    if (!item || !item.blocking) return;
    if (this._selected.has(item.id)) this._selected.delete(item.id); else this._selected.add(item.id);
    const selectedItems = this.data.items.filter(entry => this._selected.has(entry.id));
    const batchOptions = [
      { type: 'keep', label: copy.batchKeep }, { type: 'replace', label: copy.batchReplace },
      { type: 'dictionary', label: copy.batchCreate }, { type: 'exclude', label: copy.batchExclude }
    ].filter(option => selectedItems.some(entry => entry.actions.some(action => option.type === 'keep' || option.type === 'replace'
      ? action.type === 'policy' && action.value === option.type : action.type === option.type)));
    this.setData({ ['items[' + index + '].selected']: this._selected.has(item.id), selectedCount: this._selected.size,
      selectedText: format(copy.selectedSummary, [this._selected.size]), batchOptions, canBatchNature: selectedItems.some(entry => entry.category === 'incomplete') });
  },
  async performAction(event) {
    if (this.data.busy) return;
    const item = this.data.items[Number(event.currentTarget.dataset.index)];
    const action = item && item.actions[Number(event.currentTarget.dataset.action)];
    if (!action) return;
    if (action.type === 'refresh') return this.preview();
    if (action.type === 'select' || action.type === 'edit') return this.openRow(action.rowNumber, action.type);
    this.askActions([action], action.label);
  },
  batchAction(event) {
    if (this.data.busy) return;
    const type = event.currentTarget.dataset.type;
    const actions = [];
    this.data.items.filter(item => this._selected.has(item.id)).forEach(item => {
      if (type === 'nature' && item.category === 'incomplete' && NATURES[this.data.natureIndex]) {
        item.rowNumbers.forEach(rowNumber => actions.push({ type: 'nature', rowNumber, value: NATURES[this.data.natureIndex] })); return;
      }
      const found = item.actions.find(action => (type === 'keep' || type === 'replace') ? action.type === 'policy' && action.value === type : action.type === type);
      if (found) actions.push(found);
    });
    if (actions.length) this.askActions(actions, copy[{ keep: 'batchKeep', replace: 'batchReplace', dictionary: 'batchCreate', exclude: 'batchExclude', nature: 'batchNature' }[type]]);
  },
  askActions(actions, label) {
    this._pendingActions = clone(actions);
    this.setData({ confirmAction: { text: format(copy.confirmAction, [actions.length, label]), exclude: actions.some(item => item.type === 'exclude') } }, () => wx.pageScrollTo({ selector: '#import-confirm-action', duration: 200 }));
  },
  cancelAction() { this._pendingActions = null; this.setData({ confirmAction: null }); },
  confirmAction() {
    if (this.data.busy || !this._pendingActions) return;
    this._pendingActions.forEach(action => this.applyAction(action));
    this.cancelAction(); this.preview();
  },
  applyAction(action) {
    const rows = action.rowNumbers || (action.rowNumber ? [action.rowNumber] : []);
    const row = action.rowNumber ? (this._decisions.rows[action.rowNumber] || (this._decisions.rows[action.rowNumber] = {})) : null;
    if (action.type === 'exclude') rows.forEach(number => { this._decisions.rows[number] = Object.assign({}, this._decisions.rows[number], { exclude: true }); });
    if (action.type === 'mode') row.mode = action.value;
    if (action.type === 'nature') row.values = Object.assign({}, row.values, { nature: action.value });
    if (action.type === 'policy') { if (!row.policies) row.policies = {}; row.policies[action.field] = action.value; }
    if (action.type === 'dictionary' && !this._decisions.dictionaries.includes(action.value)) this._decisions.dictionaries.push(action.value);
    if (action.type === 'source') this._decisions.sources[action.key] = action.value;
    if (action.type === 'rebase') row.acceptVersion = action.value;
    if (action.type === 'undo') {
      rows.forEach(number => {
        const decision = this._decisions.rows[number];
        if (!decision) return;
        if (action.policyKey) {
          const policies = decision.policies || {};
          delete policies[action.policyKey]; delete policies[action.policyKey.split(':').pop()];
        } else if (action.version) delete decision.acceptVersion;
        else if (action.assignment) { delete decision.mode; delete decision.assignmentIds; }
        else if (!action.dictionaryKey && !action.sourceKey) delete this._decisions.rows[number];
      });
      if (action.dictionaryKey) this._decisions.dictionaries = this._decisions.dictionaries.filter(key => key !== action.dictionaryKey);
      if (action.sourceKey) delete this._decisions.sources[action.sourceKey];
    }
  },
  async openRow(rowNumber, mode) {
    const request = orgSession.beginRequest(this, 'row');
    this.setData({ busy: true });
    try {
      const result = await this.api('getHrImportPreview', { previewId: this._previewId, rowNumber });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      this._editingRow = result.row;
      if (mode === 'select') this.setData({ pickerVisible: true, pickerOptions: result.row.candidates, pickerValue: result.row.decision.assignmentIds || [], pickerContext: result.row.name });
      else {
        const editor = { rowNumber, name: result.row.name, values: Object.assign({}, result.row.values, result.row.decision.values || {}),
          natureIndex: Math.max(0, NATURES.indexOf(result.row.decision.values && result.row.decision.values.nature || result.row.values.nature)), profile: [] };
        this.data.mappings.filter(item => item.target.indexOf('profile:') === 0).forEach(item => {
          const id = item.target.slice(8); const field = this.data.fields.find(entry => entry.id === id);
          const sourceIndex = this._file.rowNumbers ? this._file.rowNumbers.indexOf(rowNumber) : rowNumber - 2;
          editor.profile.push({ id, label: field.label, required: field.required, value: (result.row.decision.profileValues || {})[id] == null ? this._file.rows[sourceIndex][item.index] : result.row.decision.profileValues[id] });
        });
        this._editorClears = {};
        this.setData({ editor }, () => wx.pageScrollTo({ selector: '#import-row-editor', duration: 200 }));
      }
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  closePicker() { this.setData({ pickerVisible: false }); },
  confirmPicker(event) {
    const number = this._editingRow.rowNumber;
    const row = this._decisions.rows[number] || {};
    row.mode = 'update'; row.assignmentIds = event.detail.keys;
    this._decisions.rows[number] = row;
    this.setData({ pickerVisible: false }); this.preview();
  },
  editValue(event) { const field = event.currentTarget.dataset.field; if (this._editorClears) delete this._editorClears[field]; this.setData({ ['editor.values.' + field]: event.detail.value }); },
  editProfile(event) { const index = Number(event.currentTarget.dataset.index); if (this._editorClears) delete this._editorClears[this.data.editor.profile[index].id]; this.setData({ ['editor.profile[' + index + '].value']: event.detail.value }); },
  editNature(event) { const index = Number(event.detail.value); this.setData({ 'editor.natureIndex': index, 'editor.values.nature': NATURES[index] }); },
  clearValue(event) {
    const field = event.currentTarget.dataset.field;
    this._editorClears = Object.assign({}, this._editorClears, { [field]: true });
    this.setData({ 'editor.clearNotice': copy.clear + ' ' + (copy[field] || (this.data.fields.find(item => item.id === field) || {}).label) });
  },
  closeEditor() { this._editorClears = {}; this.setData({ editor: null }); },
  saveEditor() {
    const editor = this.data.editor; if (!editor || this.data.busy) return;
    const row = this._decisions.rows[editor.rowNumber] || {};
    row.values = Object.fromEntries(['nature', 'department', 'identity', 'workGroup'].map(key => [key, editor.values[key] || '']));
    row.profileValues = Object.fromEntries(editor.profile.map(item => [item.id, item.value]));
    row.policies = row.policies || {};
    Object.keys(this._editorClears || {}).forEach(key => { row.policies[key] = 'clear'; });
    this._decisions.rows[editor.rowNumber] = row;
    this.closeEditor(); this.preview();
  },
  goMapping() { if (!this.data.busy && !this.data.requestId) this.setData({ stage: 'mapping' }); },
  goConfirm() { if (this.data.canExecute && !this.data.busy && !this.data.editor && !this.data.confirmAction) { this.setData({ stage: 'confirm', view: 'changes' }); this.loadItems(false); } },
  backReview() { if (!this.data.busy && !this.data.requestId) this.setData({ stage: 'review' }); },
  async execute() {
    if (this.data.busy || !this._previewId || this.data.completed) return;
    if (this.data.requestId) {
      await this.queryResult();
      if (this.data.completed || this._lastExecutionError !== 'import_not_found') return;
    }
    const requestId = this.data.requestId || 'imp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    this.setData({ requestId });
    await this.submitExecution('importHrTable', { schemaVersion: 2, previewId: this._previewId, requestId });
  },
  async queryResult() { if (!this.data.busy && this.data.requestId) await this.submitExecution('getHrImportResult', { requestId: this.data.requestId }); },
  async submitExecution(name, data) {
    const request = orgSession.beginRequest(this, 'execute'); this.setData({ busy: true, error: '' });
    this._lastExecutionError = '';
    try {
      const result = await this.api(name, data);
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      this.setData({ stage: 'result', completed: true, error: '', resultText: copy.success });
      messageQueries.invalidate();
      eventBus.emit('hr:changed', { reason: 'import' });
    } catch (error) {
      if (this._active && orgSession.isRequestCurrent(this, request)) {
        this._lastExecutionError = error.code || 'unknown';
        const stale = ['import_stale', 'import_problems', 'import_expired', 'permission_denied'].includes(error.code);
        const patch = { error: error.message, stage: stale ? 'review' : 'confirm', canExecute: false, requestId: stale ? '' : this.data.requestId };
        if (error.code === 'import_stale' && error.issues && error.issues.length) {
          this._staleIssue = true; this._views = {}; this._selected.clear();
          const item = error.issues[0];
          Object.assign(patch, { view: 'open', category: 'stale', hasMore: false, total: 1, selectedCount: 0,
            categories: [{ key: 'stale', title: copy.stale, count: 1, summaryText: format(copy.groupSummary, [1, item.rowNumbers.length, 0]) }],
            summaryText: format(copy.summary, [1, item.rowNumbers.length, 0]),
            items: [Object.assign({}, item, { title: item.message, rowText: format(copy.rowLabel, [item.rowNumbers.join(' / ')]), beforeText: copy.empty, afterText: copy.empty,
              actions: item.actions.map(action => Object.assign({}, action, { label: actionLabel(action) })) })] });
        }
        this.setData(patch);
      }
    } finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  async exportFile(event) {
    if (this.data.busy) return;
    const issues = event.currentTarget.dataset.type === 'issues';
    const request = orgSession.beginRequest(this, 'export'); this.setData({ busy: true, error: '' });
    try {
      const result = await this.api(issues ? 'exportHrImportIssues' : 'exportHrAssignmentTable', { previewId: this._previewId, includeProfile: this.data.includeProfile, format: 'xlsx' });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      const name = issues ? copy.issueFile : copy.maintenanceFile;
      await saveAndShareFile(result.fileBase64, name, 'xlsx');
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message || copy.exportFailed }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  }
});
