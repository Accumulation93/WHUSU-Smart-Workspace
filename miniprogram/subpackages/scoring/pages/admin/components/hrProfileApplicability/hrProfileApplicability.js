'use strict';

const copy = require('../../../../../../locales/zh-CN/hrProfileApplicability');
const authCopy = require('../../../../../../locales/zh-CN/authorization');
const common = require('../../../../../../locales/zh-CN/common');
const feedback = require('../../../../../../locales/zh-CN/requestFeedback');
const { callFunction, createResultError, getErrorText } = require('../../../../../../utils/api');
const orgSession = require('../../../../../../utils/orgSession');
const dimensions = [
  { key: 'natureId', label: authCopy.nature },
  { key: 'departmentId', label: authCopy.department },
  { key: 'identityCategoryId', label: authCopy.identityCategory },
  { key: 'workGroupId', label: authCopy.workGroup }
];

function cloneRules(rules) {
  return rules.map(rule => {
    const clone = {};
    Object.keys(rule).forEach(key => { clone[key] = rule[key].slice(); });
    return clone;
  });
}

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { snapshotId: { type: String, value: '' }, canEdit: { type: Boolean, value: false } },
  data: { copy, common, dimensions, opened: false, loading: false, saving: false, fields: [], fieldIndex: 0,
    groups: [], groupIndex: -1, dimensionIndex: 0, options: [], dirty: false, reloadRequired: false, notice: '', savedAwaitingRead: false },
  observers: {
    snapshotId() { if (this._active) this.clear(); }
  },
  lifetimes: {
    attached() { this._active = true; },
    detached() { this._active = false; orgSession.invalidateRequests(this); }
  },
  pageLifetimes: {
    hide() { this._active = false; this.clear(); },
    show() { this._active = true; }
  },
  methods: {
    clear() {
      orgSession.invalidateRequests(this);
      this._snapshot = null;
      this._rules = [];
      this.setData({ opened: false, loading: false, saving: false, fields: [], fieldIndex: 0,
        groups: [], groupIndex: -1, dimensionIndex: 0, options: [], dirty: false, reloadRequired: false, notice: '', savedAwaitingRead: false });
    },
    isCurrent(request) { return this._active && orgSession.isRequestCurrent(this, request); },
    canEdit() { return this.properties.canEdit && !this.data.saving && !this.data.loading && !this.data.reloadRequired; },
    canDiscard() {
      if (!this.data.dirty || this.data.savedAwaitingRead) return Promise.resolve(true);
      return new Promise(resolve => wx.showModal({ title: copy.discardTitle, content: copy.discardBody,
        confirmText: copy.discard, cancelText: copy.cancel, success: result => resolve(result.confirm), fail: () => resolve(false) }));
    },
    select(fieldIndex) {
      const field = this._snapshot && this._snapshot.fields[fieldIndex];
      this._rules = field ? cloneRules(field.rules) : [];
      this.setData({ fieldIndex, dimensionIndex: 0 });
      this.render(this._rules.length === 1 ? 0 : -1);
    },
    render(groupIndex) {
      const field = this._snapshot && this._snapshot.fields[this.data.fieldIndex];
      const dimension = dimensions[this.data.dimensionIndex];
      const rule = this._rules[groupIndex];
      const selected = rule && rule[dimension.key] || [];
      const options = this._snapshot && rule ? this._snapshot.dimensions[dimension.key] || [] : [];
      this.setData({ groupIndex,
        groups: this._rules.map((item, index) => ({ index, text: copy.group(index + 1) })),
        options: options.map(item => ({ id: item.id, name: item.name, checked: selected.indexOf(item.id) >= 0 })),
        dirty: Boolean(field && JSON.stringify(this._rules) !== JSON.stringify(field.rules)) });
    },
    async toggle() {
      if (this.data.loading || this.data.saving) return;
      const request = orgSession.beginRequest(this, 'applicabilityDecision');
      if (this.data.opened && !await this.canDiscard()) return;
      if (!this.isCurrent(request)) return;
      if (this.data.opened) { this.clear(); return; }
      this.setData({ opened: true });
      await this.load();
    },
    async load() {
      const request = orgSession.beginRequest(this, 'applicabilityRead');
      this.setData({ loading: true });
      try {
        const result = await callFunction({ name: 'getHrProfileFieldApplicability', data: {} });
        if (!this.isCurrent(request)) return;
        if (result.status === 'missing_template') {
          this._snapshot = null;
          this._rules = [];
          this.setData({ fields: [], groups: [], options: [], notice: copy.noTemplate, reloadRequired: false, savedAwaitingRead: false, dirty: false });
          return;
        }
        if (result.status !== 'success') throw createResultError(result, copy.loadFailed);
        if (!result.snapshotId || (this.properties.snapshotId && result.snapshotId !== this.properties.snapshotId)
          || !Array.isArray(result.fields) || !result.version || !result.dimensions) throw new Error();
        const previous = this._snapshot && this._snapshot.fields[this.data.fieldIndex];
        const index = previous ? result.fields.findIndex(field => field.id === previous.id) : 0;
        this._snapshot = result;
        this.setData({ fields: result.fields.map(field => ({ id: field.id, label: field.label })),
          notice: this.data.savedAwaitingRead ? copy.saved : '', reloadRequired: false, savedAwaitingRead: false });
        this.select(Math.max(0, index));
      } catch (error) {
        if (this.isCurrent(request)) this.setData({ reloadRequired: true,
          notice: this.data.savedAwaitingRead ? copy.savedReadFailed : getErrorText(error, copy.loadFailed) });
      } finally {
        if (this.isCurrent(request)) this.setData({ loading: false });
      }
    },
    async reload() {
      if (this.data.loading || this.data.saving) return;
      const request = orgSession.beginRequest(this, 'applicabilityDecision');
      if (!await this.canDiscard() || !this.isCurrent(request)) return;
      await this.load();
    },
    async discard() {
      if (this.data.loading || this.data.saving) return;
      const request = orgSession.beginRequest(this, 'applicabilityDecision');
      if (!await this.canDiscard() || !this.isCurrent(request)) return;
      this.select(this.data.fieldIndex);
      await this.load();
    },
    async onFieldChange(event) {
      const index = Number(event.detail.value);
      if (this.data.loading || this.data.saving || this.data.reloadRequired || !this.data.fields[index] || index === this.data.fieldIndex) return;
      const request = orgSession.beginRequest(this, 'applicabilityDecision');
      if (!await this.canDiscard() || !this.isCurrent(request)) return;
      this.setData({ notice: '' });
      this.select(index);
    },
    toggleGroup(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!this._rules[index]) return;
      this.setData({ dimensionIndex: 0 });
      this.render(this.data.groupIndex === index ? -1 : index);
    },
    chooseDimension(event) {
      const index = Number(event.detail.value);
      if (!dimensions[index]) return;
      this.setData({ dimensionIndex: index });
      this.render(this.data.groupIndex);
    },
    toggleOption(event) {
      if (!this.canEdit()) return;
      const id = event.currentTarget.dataset.id;
      const rule = this._rules[this.data.groupIndex];
      const key = dimensions[this.data.dimensionIndex].key;
      if (!rule || !this.data.options.some(item => item.id === id)) return;
      const selected = rule[key] || [];
      const next = selected.indexOf(id) >= 0 ? selected.filter(value => value !== id) : selected.concat(id);
      if (next.length) rule[key] = next;
      else delete rule[key];
      this.render(this.data.groupIndex);
    },
    addGroup() {
      if (!this.canEdit() || this._rules.length >= 32) return;
      this._rules.push({});
      this.setData({ dimensionIndex: 0 });
      this.render(this._rules.length - 1);
    },
    removeGroup(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!this.canEdit() || !this._rules[index]) return;
      this._rules.splice(index, 1);
      this.render(-1);
    },
    async save() {
      const field = this._snapshot && this._snapshot.fields[this.data.fieldIndex];
      if (!this.canEdit() || !this.data.dirty || !field) return;
      if (this._rules.some(rule => !Object.keys(rule).length)) { this.setData({ notice: copy.invalidGroup }); return; }
      const request = orgSession.beginRequest(this, 'applicabilityWrite');
      this.setData({ saving: true, notice: '' });
      try {
        const result = await callFunction({ name: 'saveHrProfileFieldApplicability', data: {
          snapshotId: this._snapshot.snapshotId, version: this._snapshot.version,
          fieldIds: [field.id], rules: this._rules, operation: 'replace'
        } });
        if (!this.isCurrent(request)) return;
        if (result.status === 'authorization_conflict' || result.status === 'authorization_stale_reference') {
          this.setData({ reloadRequired: true, notice: feedback.conflict });
          return;
        }
        if (result.status !== 'success') throw createResultError(result, copy.saveFailed);
        this.setData({ savedAwaitingRead: true });
        await this.load();
      } catch (error) {
        if (this.isCurrent(request)) this.setData({ reloadRequired: true, notice: getErrorText(error, copy.saveFailed) });
      } finally {
        if (this.isCurrent(request)) this.setData({ saving: false });
      }
    }
  }
});
