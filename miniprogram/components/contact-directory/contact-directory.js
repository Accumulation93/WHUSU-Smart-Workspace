'use strict';
const copy = require('../../locales/zh-CN/contactDirectory');
const view = require('../../utils/contactDirectoryView');
const { callFunction, getErrorText, showShortToast } = require('../../utils/api');
const session = require('../../utils/orgSession');
const eventBus = require('../../utils/eventBus');
const dateFormatter = require('../../utils/hrProfileDate');
const { getNavigationBarMetrics } = require('../../utils/navigationBarMetrics');
const dimensions = [
  { key: 'departmentIds', same: 'sameDepartment', label: copy.department, options: 'departments' },
  { key: 'identityCategoryIds', same: 'sameIdentity', label: copy.identity, options: 'identities' },
  { key: 'workGroupIds', same: 'sameWorkGroup', label: copy.workGroup, options: 'workGroups' }
];
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { admin: { type: Boolean, value: false } },
  data: { copy, groups: [], rules: [], selected: [], selectedText: '', query: '', loading: false, busy: false, notice: '', loadFailed: false,
    draft: null, sections: [], fields: [], people: [], pickerVisible: false, pickerValue: [], deleteTargets: null, deleteText: '', typeLabels: [copy.selectPeople, copy.scope, copy.self] },
  lifetimes: {
    attached: function() { this.activate(); },
    detached: function() { this.clearPrivate(); }
  },
  pageLifetimes: {
    hide: function() { this.clearPrivate(); },
    show: function() { if (!this._active) this.activate(); }
  },
  methods: {
    activate: function() {
      this._active = true;
      this._changed = () => { this.clearPrivate(); this.activate(); };
      eventBus.on('org:changed', this._changed);
      this.load();
    },
    clearPrivate: function() {
      if (this._changed) eventBus.off('org:changed', this._changed);
      this._changed = null;
      this._active = false; session.invalidateRequests(this); this._groups = []; this._metadata = null; this._picker = null;
      this.setData({ groups: [], rules: [], selected: [], draft: null, sections: [], fields: [], people: [], pickerVisible: false, pickerValue: [], query: '', busy: false, deleteTargets: null });
      this.triggerEvent('pickerchange', { visible: false });
      this.triggerEvent('busychange', { busy: false });
    },
    current: function(request) { return this._active && session.isRequestCurrent(this, request); },
    load: async function() {
      const request = session.beginRequest(this, 'directory');
      this.setData({ loading: true, notice: '', groups: [] });
      try {
        const result = await callFunction({ name: this.data.admin ? 'getContactDirectoryConfiguration' : 'getContactDirectory', data: {} });
        if (!this.current(request)) return;
        if (result.status !== 'success') throw result;
        if (this.data.admin) {
          this._metadata = result;
          this.setData({ rules: result.rules.map(rule => Object.assign({}, rule, { summary: view.ruleSummary(rule, result, copy) })), people: view.peopleOptions(result.people), selected: [], selectedText: copy.selectedRules.replace('{count}', '0'), loadFailed: false });
        } else {
          this._groups = view.decorateGroups(result.groups, dateFormatter);
          this.setData({ groups: view.filterGroups(this._groups, this.data.query), loadFailed: false });
        }
      } catch (error) { if (this.current(request)) this.setData({ notice: getErrorText(error, copy.loadFailed), loadFailed: true }); }
      finally { if (this.current(request)) this.setData({ loading: false }); }
    },
    search: function(event) { const query = event.detail.value; this.setData({ query, groups: view.filterGroups(this._groups || [], query) }); },
    copyValue: function(event) { wx.setClipboardData({ data: event.currentTarget.dataset.value, success: () => showShortToast(copy.copied) }); },
    callPhone: function(event) { wx.makePhoneCall({ phoneNumber: event.currentTarget.dataset.phone }); },
    locate: function(event) {
      const key = event.currentTarget.dataset.key;
      if (!(this._groups || []).some(group => group.items.some(item => item.key === key))) return;
      this.setData({ query: '', groups: this._groups }, () => this.scrollTo('#contact-' + key));
    },
    toggleRelated: function(event) {
      const group = Number(event.currentTarget.dataset.group), index = Number(event.currentTarget.dataset.index);
      this.setData({ ['groups[' + group + '].items[' + index + '].expanded']: !this.data.groups[group].items[index].expanded });
    },
    scrollTo: function(selector) {
      const query = this.createSelectorQuery();
      query.select(selector).boundingClientRect(); query.selectViewport().scrollOffset();
      query.exec(result => {
        if (this._active && result[0] && result[1]) wx.pageScrollTo({ scrollTop: Math.max(0, result[0].top + result[1].scrollTop - getNavigationBarMetrics().totalHeight), duration: 200 });
      });
    },
    blocked: function() { return this.data.loading || this.data.busy || this.data.loadFailed || Boolean(this.data.deleteTargets); },
    edit: function(event) {
      if (this.blocked()) return;
      const id = event.currentTarget.dataset.id;
      const existing = this.data.rules.find(rule => rule.id === id);
      const draft = existing ? view.payload(existing) : view.blankRule();
      if (event.currentTarget.dataset.copy) { delete draft.id; delete draft.version; }
      this.setData({ draft }, () => { this.refreshEditor(); this.scrollTo('#directory-editor'); });
    },
    refreshEditor: function() {
      const draft = this.data.draft, metadata = this._metadata;
      if (!draft || !metadata) return;
      const peopleById = new Map(this.data.people.map(person => [person.personId, person.name]));
      const departments = new Map(metadata.departments.map(item => [item.id, item.name]));
      const sections = ['audience', 'targets'].map(key => ({ key, title: copy[key], clauses: draft[key].map((clause, index) => ({
        index, type: clause.type, typeIndex: ['people', 'scope', 'self'].indexOf(clause.type),
        labels: key === 'targets' ? this.data.typeLabels : this.data.typeLabels.slice(0, 2),
        selectedText: copy.selected.replace('{count}', String((clause.personIds || []).length)),
        names: (clause.personIds || []).map(id => peopleById.get(id) || copy.unnamed).join('、'),
        dimensions: dimensions.map(dimension => Object.assign({}, dimension, {
          sameLabel: copy[dimension.same], isSame: Boolean(clause[dimension.same]),
          choices: metadata[dimension.options].map(option => ({ id: option.id,
            name: option.name + (option.departmentId ? ' · ' + (departments.get(option.departmentId) || '') : ''),
            selected: (clause[dimension.key] || []).includes(option.id) }))
        }))
      })) }));
      this.setData({ sections, fields: metadata.fields.map(field => Object.assign({}, field, { selected: draft.fieldIds.includes(field.id) })) });
    },
    nameInput: function(event) { this.setData({ 'draft.name': event.detail.value }); },
    enabledChange: function(event) { this.setData({ 'draft.enabled': event.detail.value }); },
    cancel: function() { if (!this.data.busy) this.setData({ draft: null, sections: [], fields: [] }); },
    typeChange: function(event) {
      if (this.blocked()) return;
      const { section, index } = event.currentTarget.dataset;
      this.setData({ ['draft.' + section + '[' + index + ']']: view.blankClause(['people', 'scope', 'self'][Number(event.detail.value)]) }, () => this.refreshEditor());
    },
    addClause: function(event) {
      if (this.blocked()) return;
      const key = event.currentTarget.dataset.section;
      this.setData({ ['draft.' + key]: this.data.draft[key].concat([view.blankClause('scope')]) }, () => this.refreshEditor());
    },
    removeClause: function(event) {
      if (this.blocked()) return;
      const { section, index } = event.currentTarget.dataset;
      if (this.data.draft[section].length < 2) return;
      this.setData({ ['draft.' + section]: this.data.draft[section].filter((item, i) => i !== Number(index)) }, () => this.refreshEditor());
    },
    toggleChoice: function(event) {
      if (this.blocked()) return;
      const { section, index, key, id } = event.currentTarget.dataset;
      const path = section ? 'draft.' + section + '[' + index + '].' + key : 'draft.fieldIds';
      const old = section ? this.data.draft[section][Number(index)][key] : this.data.draft.fieldIds;
      this.setData({ [path]: old.includes(id) ? old.filter(value => value !== id) : old.concat([id]) }, () => this.refreshEditor());
    },
    sameChange: function(event) {
      if (this.blocked()) return;
      const { section, index, same, key } = event.currentTarget.dataset;
      this.setData({ ['draft.' + section + '[' + index + '].' + same]: event.detail.value,
        ['draft.' + section + '[' + index + '].' + key]: [] }, () => this.refreshEditor());
    },
    openPeople: function(event) {
      if (this.blocked()) return;
      this._picker = event.currentTarget.dataset;
      const ids = this.data.draft[this._picker.section][Number(this._picker.index)].personIds;
      this.setData({ pickerVisible: true, pickerValue: ids }); this.triggerEvent('pickerchange', { visible: true });
    },
    closePeople: function() { this._picker = null; this.setData({ pickerVisible: false, pickerValue: [] }); this.triggerEvent('pickerchange', { visible: false }); },
    confirmPeople: function(event) {
      if (!this._picker) return;
      this.setData({ ['draft.' + this._picker.section + '[' + this._picker.index + '].personIds']: event.detail.keys }, () => this.refreshEditor());
      this.closePeople();
    },
    toggleRule: function(event) {
      if (this.blocked()) return;
      const id = event.currentTarget.dataset.id;
      const selected = this.data.selected.includes(id) ? this.data.selected.filter(value => value !== id) : this.data.selected.concat([id]);
      this.setSelection(selected);
    },
    setSelection: function(selected) {
      this.setData({ selected, selectedText: copy.selectedRules.replace('{count}', String(selected.length)),
        rules: this.data.rules.map(rule => Object.assign({}, rule, { selected: selected.includes(rule.id) })) });
    },
    selectAll: function() { if (!this.blocked()) this.setSelection(this.data.rules.map(rule => rule.id)); },
    clearSelection: function() { if (!this.blocked()) this.setSelection([]); },
    save: function() { if (!this.blocked()) this.write('saveContactDirectoryRule', view.payload(this.data.draft)); },
    toggleEnabled: function(event) {
      if (this.blocked()) return;
      const rule = this.data.rules.find(item => item.id === event.currentTarget.dataset.id);
      this.write('batchContactDirectoryRules', { action: rule.enabled ? 'disable' : 'enable', rules: [{ id: rule.id, version: rule.version }] });
    },
    deleteSelected: function() {
      if (this.blocked() || !this.data.selected.length) return;
      const targets = this.data.rules.filter(rule => this.data.selected.includes(rule.id));
      this.setData({ deleteTargets: targets, deleteText: copy.confirmDelete.replace('{count}', String(targets.length)) }, () => this.scrollTo('#directory-delete'));
    },
    cancelDelete: function() { if (!this.data.busy) this.setData({ deleteTargets: null }); },
    confirmDelete: function() {
      if (this.data.busy || !this.data.deleteTargets) return;
      this.write('batchContactDirectoryRules', { action: 'delete', rules: this.data.deleteTargets.map(rule => ({ id: rule.id, version: rule.version })) });
    },
    write: async function(name, data) {
      const request = session.beginRequest(this, 'write');
      this.setData({ busy: true, notice: '' });
      this.triggerEvent('busychange', { busy: true });
      try {
        const result = await callFunction({ name, data });
        if (!this.current(request)) return;
        if (result.status !== 'success') throw result;
        this.setData({ draft: null, sections: [], fields: [], deleteTargets: null });
        await this.load();
      } catch (error) { if (this.current(request)) this.setData({ notice: getErrorText(error, copy.operationFailed) }); }
      finally { if (this.current(request)) { this.setData({ busy: false }); this.triggerEvent('busychange', { busy: false }); } }
    }
  }
});
