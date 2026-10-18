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
const normalizedHeader = value => String(value || '').trim().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
function actionLabel(action) {
  if (action.type === 'refresh') return copy.refresh;
  if (action.type === 'source') return format(copy.useSourceRow, [action.value]);
  if (action.type === 'policy') return copy[action.value];
  return copy[{ exclude: 'excludeRelated', mode: action.value === 'new' ? 'newAssignment' : 'personOnly', select: 'selectAssignment',
    dictionary: 'create', edit: 'edit', editGroup: 'editGroup', source: 'useRow', rebase: 'rebase', undo: 'restore' }[action.type]] || copy.save;
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
    this._views = {}; this._completeIssueRows = new Map();
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },
  onShow() {
    this._active = true;
    const state = orgSession.consume(this);
    if (state.changed) this.resetSession();
    this.loadMetadata();
  },
  onHide() { this._active = false; orgSession.invalidateRequests(this); this.setData({ busy: false, pickerVisible: false, contextSwitchGuardVisible: false }); },
  onUnload() { this._active = false; this._destroyed = true; this._completeIssueRows.clear(); orgSession.invalidateRequests(this); this._file = null; this._sourceRows = null; this._decisions = null; this.setData({ pickerVisible: false, contextSwitchGuardVisible: false }); },
  onResize() { this.setData({ navTopPx: getNavigationBarMetrics().totalHeight }); },
  onReachBottom() { if (this.data.hasMore && !this.data.busy) this.loadItems(true); },
  onPageScroll(event) { this._scrollTop = event.scrollTop; },
  resetSession() {
    this._file = null; this._sourceRows = null; this._previewId = ''; this._decisions = { rows: {}, dictionaries: [], sources: {} }; this._selected.clear(); this._views = {}; this._completeIssueRows = new Map(); this._offsets = {};
    this._metadata = null; this._mappingOptions = null;
    this._pendingActions = null; this._pendingScope = null; this._editingRow = null; this._editorClears = {};
    this.setData({ stage: 'file', items: [], categories: [], fields: [], mappings: [], fileSummary: '', editor: null, editorOptions: [], confirmAction: null, requestId: '', completed: false, pickerVisible: false, contextSwitchGuardVisible: false, error: '', canExecute: false });
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
      this._sourceRows = clone(file.rows);
      this._decisions = { rows: {}, dictionaries: [], sources: {} };
      const used = new Set();
      const mappings = file.headers.map((header, index) => {
        const normalized = normalizedHeader(header);
        const aliasKey = BASIC.find(key => (copy.headerAliases[key] || [copy[key]]).some(label => normalizedHeader(label) === normalized));
        let selectedIndex = this._mappingOptions.findIndex(item => item.key && !used.has(item.key)
          && (aliasKey ? item.key === aliasKey : normalizedHeader(item.label) === normalized));
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
      this._views = {}; this._completeIssueRows = new Map();
      this._summary = result.summary;
      this._selected.clear();
      const categories = result.categories.map(item => Object.assign({}, item, { summaryText: format(copy.categoryCount, [item.count]) }));
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
      const personKeys = this.importPersonKeys();
      const items = result.items.map((item, index) => Object.assign({}, item, {
        id: item.id || this.data.view + ':' + (offset + index), index: offset + index, title: item.message || copy[item.type] || (this.data.view === 'rows' ? copy.peopleView : copy.excluded),
        cardTitle: item.category === 'dictionary' && item.categoryTitle ? item.categoryTitle : item.category ? [item.fieldLabel, item.categoryTitle || copy[item.category] || copy.problems].filter(Boolean).join(' · ') : item.name || copy[item.type] || copy.excluded,
        scopeText: format(copy.involvedPeopleRows, [new Set(item.rowNumbers.map(number => personKeys.get(number) || 'row:' + number)).size, item.rowNumbers.length]),
        rowText: format(copy.rowLabel, [item.rowNumbers.join(' / ')]), beforeText: readable(item.before), afterText: readable(item.after),
        showComparison: item.showComparison !== false && Boolean(item.before || item.after),
        selected: this._selected.has(item.id), actions: (item.actions || []).map(action => Object.assign({}, action, { label: actionLabel(action) }))
      }));
      const category = this.data.categories.find(item => item.key === this.data.category);
      const patch = { total: result.total, hasMore: result.hasMore, listTitle: format(copy.currentCategory, [
        ['open', 'resolved'].includes(this.data.view) && category ? category.title : (this.data.viewOptions.find(item => item.key === this.data.view) || {}).label || copy.issueList, result.total]) };
      if (append) items.forEach((item, index) => { patch['items[' + (offset + index) + ']'] = item; });
      else patch.items = items;
      await new Promise(resolve => this.setData(patch, resolve));
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  switchList(patch) {
    if (this.data.busy || this._staleIssue) return;
    const oldKey = this.data.view + ':' + this.data.category;
    this._offsets[oldKey] = this._scrollTop || 0;
    this._views[oldKey] = { items: this.data.items.map(item => Object.assign({}, item, { selected: false })), total: this.data.total, hasMore: this.data.hasMore, listTitle: this.data.listTitle };
    this._selected.clear();
    const key = (patch.view == null ? this.data.view : patch.view) + ':' + (patch.category == null ? this.data.category : patch.category);
    const cached = this._views[key];
    this.setData(Object.assign({ selectedCount: 0, selectedText: '' }, patch, cached || { items: [], hasMore: false }), async () => {
      if (!cached) await this.loadItems(false);
      this.scrollToSection('#import-issue-list');
    });
  },
  scrollToSection(selector) {
    if (!this._active || !wx.createSelectorQuery) return;
    const request = orgSession.beginRequest(this, 'scroll');
    const query = wx.createSelectorQuery();
    query.select(selector).boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec(results => {
      if (!this._active || !orgSession.isRequestCurrent(this, request) || !results[0] || !results[1]) return;
      wx.pageScrollTo({ scrollTop: Math.max(0, results[1].scrollTop + results[0].top - this.data.navTopPx), duration: 200 });
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
    if (action.type === 'editGroup') {
      const values = { department: item.dictionaryDepartment || '', [action.field]: item.after };
      this._editingRow = null;
      this.setData({ editor: { group: true, rowNumbers: action.rowNumbers, field: action.field, fieldLabel: copy[action.field], values,
        name: format(copy.groupRows, [action.rowNumbers.length]) }, editorOptions: this.editorOptions(values).filter(option => option.key === action.field) }, () => this.scrollToSection('#import-row-editor'));
      return;
    }
    if (action.type === 'refresh') return this.preview();
    if (action.type === 'select' || action.type === 'edit') return this.openRow(action.rowNumber, action.type);
    this.askActions([Object.assign({}, action, action.type === 'source' || action.sourceKey ? { affectedRows: item.rowNumbers } : {})], action.label);
  },
  async expandIssue(event) {
    if (this.data.busy || this.data.requestId) return;
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.items[index];
    if (!item) return;
    if (item.expanded && !event.currentTarget.dataset.more) { this.setData({ ['items[' + index + '].expanded']: false }); return; }
    if (item.rows && !event.currentTarget.dataset.more) { this.setData({ ['items[' + index + '].expanded']: true }); return; }
    const request = orgSession.beginRequest(this, 'issueRows');
    this.setData({ busy: true });
    try {
      const offset = event.currentTarget.dataset.more ? (item.rows || []).length : 0;
      const complete = this._completeIssueRows.get(this.issueSelectionKey(item));
      const result = complete ? { items: complete.slice(offset, offset + 40), hasMore: offset + 40 < complete.length }
        : await this.api('getHrImportPreview', { previewId: this._previewId, issueId: item.issueRef == null ? item.id : item.issueRef, rowNumbers: item.rowNumbers, offset });
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      const rows = result.items.map(row => Object.assign({}, row, { title: format(copy.issuePerson, [row.rowNumber, row.name]),
        actions: row.actions.map(action => Object.assign({}, action, { label: actionLabel(action) })) }));
      const patch = { ['items[' + index + '].expanded']: true, ['items[' + index + '].rowsMore']: result.hasMore };
      if (offset) rows.forEach((row, rowIndex) => { patch['items[' + index + '].rows[' + (offset + rowIndex) + ']'] = row; });
      else patch['items[' + index + '].rows'] = rows;
      this.setData(patch);
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  performRowAction(event) {
    if (this.data.busy || this.data.requestId) return;
    const data = event.currentTarget.dataset;
    const item = this.data.items[Number(data.index)];
    const row = item && item.rows && item.rows[Number(data.row)];
    const action = row && row.actions[Number(data.action)];
    if (!action) return;
    if (action.type === 'edit' || action.type === 'select') return this.openRow(action.rowNumber, action.type);
    this.askActions([action], format(copy.singleRowAction, [row.rowNumber, row.name, action.label]));
  },
  toggleIssueRow(event) {
    if (this.data.busy || this.data.requestId) return;
    const index = Number(event.currentTarget.dataset.index); const rowIndex = Number(event.currentTarget.dataset.row);
    const item = this.data.items[index]; const row = item && item.rows && item.rows[rowIndex];
    if (!row) return;
    const rows = this._completeIssueRows.get(this.issueSelectionKey(item)) || item.rows;
    const selected = rows.filter(entry => entry.rowNumber === row.rowNumber ? !row.selected : entry.selected);
    rows.forEach(entry => { if (entry.rowNumber === row.rowNumber) entry.selected = !row.selected; });
    this.updateIssueSelection(index, selected);
  },
  issueSelectionKey(item) { return this._previewId + ':' + (item.issueRef || item.id || (item.rowNumbers || []).join(',')); },
  importPersonKeys() {
    const mapping = this.data.mappings.find(entry => entry.target === 'studentId');
    const identities = new Map();
    if (this._file && mapping) this._file.rows.forEach((cells, position) => {
      const number = this._file.rowNumbers ? this._file.rowNumbers[position] : position + 2;
      const decision = this._decisions.rows[number];
      const value = String(decision && decision.values && decision.values.studentId != null ? decision.values.studentId : cells[mapping.index] || '').trim().toLowerCase();
      identities.set(number, value && value.length <= 32 && !/^#(?:n\/a|value!|ref!|div\/0!|num!|name\?|null!|spill!|calc!)$/i.test(value) ? 'person:' + value : 'row:' + number);
    });
    return identities;
  },
  updateIssueSelection(index, selected) {
    const item = this.data.items[index];
    const numbers = new Set(selected.map(row => row.rowNumber));
    const identities = this.importPersonKeys();
    const people = new Set(selected.map(row => identities.get(row.rowNumber) || 'row:' + row.rowNumber));
    const patch = {};
    (item.rows || []).forEach((entry, position) => { patch['items[' + index + '].rows[' + position + '].selected'] = numbers.has(entry.rowNumber); });
    const options = [{ type: 'dictionary', label: copy.create }, { type: 'keep', label: copy.keep }, { type: 'replace', label: copy.replace },
      { type: 'exclude', label: copy.excludeRelated }, { type: 'undo', label: copy.restore }].filter(option => selected.length && selected.every(entry =>
      entry.actions.some(action => !action.sourceKey && !action.affectedRows && ((option.type === 'keep' || option.type === 'replace')
        ? action.type === 'policy' && action.value === option.type : action.type === option.type))));
    this.setData(Object.assign(patch, {
      ['items[' + index + '].selectedRowCount']: selected.length, ['items[' + index + '].rowBatchOptions']: options,
      ['items[' + index + '].selectedRowText']: format(copy.selectedPeopleRows, [people.size, selected.length]),
      ['items[' + index + '].rowsEditable']: selected.length > 0 && selected.every(entry => entry.actions.some(action => action.type === 'edit')) }));
  },
  async selectIssueRows(event) {
    if (this.data.busy || this.data.requestId) return;
    const index = Number(event.currentTarget.dataset.index); const mode = event.currentTarget.dataset.mode;
    const item = this.data.items[index];
    if (!item || !['all', 'none', 'invert'].includes(mode)) return;
    const key = this.issueSelectionKey(item);
    if (mode === 'none') {
      (this._completeIssueRows.get(key) || []).forEach(row => { row.selected = false; });
      this.updateIssueSelection(index, []); return;
    }
    const request = orgSession.beginRequest(this, 'issueRows');
    this.setData({ busy: true, error: '' });
    try {
      const rows = (this._completeIssueRows.get(key) || item.rows || []).map(row => Object.assign({}, row));
      while (rows.length < item.rowNumbers.length) {
        const result = await this.api('getHrImportPreview', { previewId: this._previewId, issueId: item.issueRef == null ? item.id : item.issueRef, rowNumbers: item.rowNumbers, offset: rows.length });
        if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
        if (!result.items || !result.items.length) throw new Error(copy.errorDetails);
        rows.push(...result.items);
      }
      if (!this._active || !orgSession.isRequestCurrent(this, request)) return;
      const expected = new Set(item.rowNumbers);
      if (rows.length !== expected.size || new Set(rows.map(row => row.rowNumber)).size !== expected.size || rows.some(row => !expected.has(row.rowNumber))) throw new Error(copy.errorDetails);
      rows.forEach(row => { row.selected = mode === 'all' || !row.selected; });
      this._completeIssueRows.set(key, rows);
      this.updateIssueSelection(index, rows.filter(row => row.selected));
    } catch (error) { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ error: error.message }); }
    finally { if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ busy: false }); }
  },
  batchIssueRows(event) {
    if (this.data.busy || this.data.requestId) return;
    const item = this.data.items[Number(event.currentTarget.dataset.index)];
    const rows = item && (this._completeIssueRows.get(this.issueSelectionKey(item)) || item.rows || []).filter(row => row.selected);
    if (!rows || !rows.length) return;
    const type = event.currentTarget.dataset.type;
    if (type === 'edit') {
      const fields = ['department', 'identity', 'workGroup', 'nature'].map(key => ({ key, label: copy[key] }))
        .concat(this.data.fields.filter(field => this.data.mappings.some(mapping => mapping.target === 'profile:' + field.id)).map(field => ({ key: field.id, label: field.label, profile: true })));
      const fieldIndex = Math.max(0, fields.findIndex(field => field.key === item.field));
      const field = fields[fieldIndex];
      const values = { department: item.dictionaryDepartment || '', [field.key]: typeof item.after === 'string' ? item.after : '' };
      this._editingRow = null;
      this.setData({ editor: { group: true, rowNumbers: rows.map(row => row.rowNumber), field: field.key, fieldLabel: field.label, profileField: Boolean(field.profile),
        values, fieldOptions: fields, fieldIndex, name: format(copy.groupRows, [rows.length]) },
        editorOptions: this.editorOptions(values).filter(option => option.key === field.key) }, () => this.scrollToSection('#import-row-editor'));
      return;
    }
    const actions = rows.map(row => row.actions.find(action => !action.sourceKey && !action.affectedRows && ((type === 'keep' || type === 'replace')
      ? action.type === 'policy' && action.value === type : action.type === type)));
    if (actions.some(action => !action)) return;
    this.askActions(actions, actionLabel(actions[0]));
  },
  changeBatchField(event) {
    const index = Number(event.detail.value); const editor = this.data.editor;
    const field = editor && editor.fieldOptions && editor.fieldOptions[index];
    if (!field) return;
    this.setData({ 'editor.fieldIndex': index, 'editor.field': field.key, 'editor.fieldLabel': field.label, 'editor.profileField': Boolean(field.profile), 'editor.error': '',
      ['editor.values.' + field.key]: '', editorOptions: this.editorOptions(Object.assign({}, editor.values, { [field.key]: '' })).filter(option => option.key === field.key) });
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
    const numbers = Array.from(new Set(actions.flatMap(action => action.affectedRows || action.rowNumbers || (action.rowNumber ? [action.rowNumber] : [])))).sort((a, b) => a - b);
    const nameMapping = this.data.mappings.find(mapping => mapping.target === 'name');
    const sourceIndexes = new Map((this._file && this._file.rowNumbers || []).map((number, index) => [number, index]));
    const loadedRows = new Map(this.data.items.flatMap(item => item.rows || []).map(row => [row.rowNumber, row]));
    this._pendingScope = numbers.map(number => {
      const index = this._file && this._file.rowNumbers ? sourceIndexes.get(number) : number - 2;
      const name = this._file && nameMapping && this._file.rows[index] && this._file.rows[index][nameMapping.index];
      const loaded = loadedRows.get(number);
      return format(copy.issuePerson, [number, name || loaded && loaded.name || copy.unnamedPerson]);
    });
    this.setData({ confirmAction: { text: format(copy.confirmAction, [actions.length, label]), exclude: actions.some(item => item.type === 'exclude'),
      scope: this._pendingScope.slice(0, 40), totalRows: numbers.length, scopeTitle: format(copy.affectedRows, [numbers.length]), scopeMore: numbers.length > 40,
      change: Array.from(new Set(actions.map(action => action.type === 'editValues' ? (action.clear ? format(copy.batchClear, [action.fieldLabel]) : format(copy.batchChange, [action.fieldLabel, action.value || copy.empty]))
        : action.fieldLabel && typeof action.displayValue === 'string' && ['dictionary', 'policy'].includes(action.type)
          ? format(copy.operationValue, [action.fieldLabel, action.displayValue || copy.empty]) : '').filter(Boolean))).join('\n') } }, () => this.scrollToSection('#import-confirm-action'));
  },
  moreActionScope() {
    const confirmation = this.data.confirmAction; if (!confirmation || !this._pendingScope) return;
    const offset = confirmation.scope.length; const patch = { 'confirmAction.scopeMore': offset + 40 < this._pendingScope.length };
    this._pendingScope.slice(offset, offset + 40).forEach((value, index) => { patch['confirmAction.scope[' + (offset + index) + ']'] = value; }); this.setData(patch);
  },
  cancelAction() { this._pendingActions = null; this._pendingScope = null; this.setData({ confirmAction: null }); },
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
    if (action.type === 'editValues') rows.forEach(number => {
      const decision = this._decisions.rows[number] || (this._decisions.rows[number] = {});
      const target = action.profileField ? 'profileValues' : 'values';
      decision[target] = Object.assign({}, decision[target], { [action.field]: action.value });
      const policies = decision.policies || (decision.policies = {});
      Object.keys(policies).forEach(key => { if (key === action.field || key.endsWith(':' + action.field)) delete policies[key]; });
      if (action.clear) policies[action.field] = 'clear';
    });
    if (action.type === 'policy') { if (!row.policies) row.policies = {}; row.policies[action.field] = action.value; }
    if (action.type === 'dictionary') rows.forEach(number => {
      const decision = this._decisions.rows[number] || (this._decisions.rows[number] = {});
      decision.dictionaryApprovals = Object.assign({}, decision.dictionaryApprovals, { [action.value]: true });
    });
    if (action.type === 'source') this._decisions.sources[action.key] = action.value;
    if (action.type === 'rebase') row.acceptVersion = action.value;
    if (action.type === 'undo') {
      rows.forEach(number => {
        const decision = this._decisions.rows[number];
        if (action.dictionaryKey) {
          const current = decision || (this._decisions.rows[number] = {});
          current.dictionaryApprovals = Object.assign({}, current.dictionaryApprovals, { [action.dictionaryKey]: false });
          return;
        }
        if (!action.policyKey && !action.version && !action.assignment && !action.sourceKey && this._sourceRows && this._file) {
          const index = this._file.rowNumbers ? this._file.rowNumbers.indexOf(number) : number - 2;
          if (this._sourceRows[index]) this._file.rows[index] = clone(this._sourceRows[index]);
        }
        if (!decision) return;
        if (action.policyKey) {
          const policies = decision.policies || {};
          delete policies[action.policyKey]; delete policies[action.policyKey.split(':').pop()];
        } else if (action.version) delete decision.acceptVersion;
        else if (action.assignment) { delete decision.mode; delete decision.assignmentIds; }
        else if (!action.dictionaryKey && !action.sourceKey) delete this._decisions.rows[number];
      });
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
        this.setData({ editor, editorOptions: this.editorOptions(editor.values) }, () => this.scrollToSection('#import-row-editor'));
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
  editorOptions(values) {
    const metadata = this._metadata || {};
    const row = this._editingRow || {};
    const selected = (row.decision || {}).assignmentIds || [];
    const candidates = (row.candidates || []).filter(item => !selected.length || selected.includes(item.assignmentId));
    const department = values.department || (candidates.length === 1 ? candidates[0].departmentName : '');
    return ['department', 'identity', 'workGroup'].map(key => {
      const options = (metadata[{ department: 'departments', identity: 'identities', workGroup: 'workGroups' }[key]] || [])
        .filter(item => key !== 'workGroup' || item.department === department).map(item => item.name);
      options.unshift(copy.chooseExisting);
      return { key, label: copy[key], options, selectedIndex: Math.max(0, options.indexOf(values[key])) };
    });
  },
  editValue(event) { const field = event.currentTarget.dataset.field; if (this._editorClears) delete this._editorClears[field];
    const values = Object.assign({}, this.data.editor.values, { [field]: event.detail.value });
    const options = this.editorOptions(values).filter(item => !this.data.editor.group || item.key === this.data.editor.field);
    this.setData({ 'editor.values': values, 'editor.error': '', editorOptions: options }); },
  chooseExisting(event) {
    if (Number(event.detail.value) === 0) return;
    const field = event.currentTarget.dataset.field;
    const options = this.data.editorOptions.find(item => item.key === field);
    const value = options && options.options[Number(event.detail.value)];
    if (value != null) this.editValue({ currentTarget: { dataset: { field } }, detail: { value } });
  },
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
    if (editor.group) {
      const value = String(editor.values[editor.field] || '').trim();
      const profile = this.data.fields.find(field => field.id === editor.field);
      const canClear = editor.field === 'workGroup' || editor.profileField && profile && !profile.required;
      if (!value && !canClear) { this.setData({ 'editor.error': format(copy.batchRequired, [editor.fieldLabel]) }); return; }
      const action = { type: 'editValues', rowNumbers: editor.rowNumbers, field: editor.field, fieldLabel: editor.fieldLabel,
        profileField: Boolean(editor.profileField), value, clear: !value };
      this.closeEditor(); this.askActions([action], copy.editSelected); return;
    }
    const row = this._decisions.rows[editor.rowNumber] || {};
    const sourceIndex = this._file.rowNumbers ? this._file.rowNumbers.indexOf(editor.rowNumber) : editor.rowNumber - 2;
    let identityChanged = false;
    ['name', 'studentId'].forEach(key => {
      const mapping = this.data.mappings.find(item => item.target === key);
      if (mapping && this._file.rows[sourceIndex][mapping.index] !== editor.values[key]) {
        this._file.rows[sourceIndex][mapping.index] = editor.values[key] || ''; identityChanged = true;
      }
    });
    if (identityChanged) {
      ['assignmentId', 'assignmentVersion'].forEach(key => {
        const mapping = this.data.mappings.find(item => item.target === key);
        if (mapping) this._file.rows[sourceIndex][mapping.index] = '';
      });
      Object.keys(row).forEach(key => { delete row[key]; });
      const oldStudent = String(this._editingRow.studentId || '').trim().toLowerCase();
      const newStudent = String(editor.values.studentId || '').trim().toLowerCase();
      const assignments = new Set((this._editingRow.candidates || []).map(item => item.assignmentId));
      Object.keys(this._decisions.sources).forEach(key => {
        if (key.startsWith(oldStudent + ':') || key.startsWith(newStudent + ':') || assignments.has(key)) delete this._decisions.sources[key];
      });
    }
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
            items: [Object.assign({}, item, { canExpand: true, issueRef: '', title: item.message, rowText: format(copy.rowLabel, [item.rowNumbers.join(' / ')]), beforeText: copy.empty, afterText: copy.empty,
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
