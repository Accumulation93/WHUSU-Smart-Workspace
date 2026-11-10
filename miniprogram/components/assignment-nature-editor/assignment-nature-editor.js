const ui = require('../../locales/zh-CN/assignmentNatures');
const { callFunction, getErrorText } = require('../../utils/api');
const session = require('../../utils/orgSession');
const eventBus = require('../../utils/eventBus');
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { copyId: { type: String, value: '' } },
  data: { ui, rows: [], draft: { name: '' }, canCreate: false, ready: false, loading: false, busy: false, failed: false, saved: false, notice: '' },
  lifetimes: { attached() { this.activate(); }, detached() { this.stop(); } },
  pageLifetimes: { hide() { this.stop(); }, show() { if (!this._visible) this.activate(); } },
  methods: {
    activate() { this._visible = true; this._changed = () => { this.stop(); this.activate(); }; eventBus.on('org:changed', this._changed); eventBus.on('auth:contextChanged', this._changed); eventBus.on('auth:selectionChanged', this._changed); this.load(); },
    stop() { this._visible = false; if (this._changed) { eventBus.off('org:changed', this._changed); eventBus.off('auth:contextChanged', this._changed); eventBus.off('auth:selectionChanged', this._changed); this._changed = null; } session.invalidateRequests(this); this.setData({ rows: [], draft: { name: '' }, ready: false, busy: false, saved: false, canCreate: false, notice: '', failed: false, loading: false }); this.triggerEvent('busychange', { busy: false }); },
    current(request) { return this._visible && session.isRequestCurrent(this, request); },
    reset() { if (!this.data.busy && !this.data.saved) this.setData({ draft: { name: '' } }); },
    name(e) { this.setData({ 'draft.name': e.detail.value }); },
    description(e) { this.setData({ 'draft.description': e.detail.value }); },
    edit(e) { if (this.data.busy || this.data.loading || this.data.failed || this.data.saved) return; const row = this.data.rows.find(item => item.id === e.currentTarget.dataset.id); if (row && row.canUpdate) this.setData({ draft: { id: row.id, name: row.name, description: row.description || '', version: Number(row.version) } }); },
    async load() {
      const request = session.beginRequest(this, 'nature'); this.setData({ loading: true, failed: false, notice: '' });
      try { const result = await callFunction({ name: 'listAssignmentNatures', data: {} }); if (!this.current(request)) return; if (result.status !== 'success') throw result;
        this.setData({ rows: result.list, canCreate: result.canCreate === true, ready: true, loading: false });
        if (this.data.saved) this.setData({ draft: { name: '' }, saved: false });
        if (this.data.copyId && !this._copyConsumed) { this._copyConsumed = true; this.edit({ currentTarget: { dataset: { id: this.data.copyId } } }); }
      } catch (error) { if (this.current(request)) this.setData({ failed: true, notice: getErrorText(error, ui.loadFailed) }); }
      finally { if (this.current(request)) this.setData({ loading: false }); }
    },
    async write(name, data) {
      if (this.data.busy || this.data.loading || this.data.failed || this.data.saved) return;
      const request = session.beginRequest(this, 'natureWrite'); this.setData({ busy: true, notice: '' }); this.triggerEvent('busychange', { busy: true });
      try { const result = await callFunction({ name, data }); if (!this.current(request)) return; if (result.status !== 'success') throw result; this.setData({ saved: true }); await this.load(); }
      catch (error) { if (this.current(request)) { const code = error.status || error.code; this.setData({ notice: code === 'assignment_nature_in_use' ? ui.inUse : code === 'assignment_nature_legacy_required' ? ui.deleteFailed : code === 'assignment_nature_description_invalid' ? ui.descriptionTooLong : getErrorText(error, name === 'saveAssignmentNature' ? ui.saveFailed : ui.deleteFailed) }); } }
      finally { if (this.current(request)) { this.setData({ busy: false }); this.triggerEvent('busychange', { busy: false }); } }
    },
    save() { if (this.data.draft.id ? !this.data.rows.some(row => row.id === this.data.draft.id && row.canUpdate) : !this.data.canCreate) return; if (!this.data.draft.name.trim()) { this.setData({ notice: ui.nameRequired }); return; } if (Array.from(this.data.draft.description || '').length > 2000) { this.setData({ notice: ui.descriptionTooLong }); return; } return this.write('saveAssignmentNature', Object.assign({ description: '' }, this.data.draft)); },
    remove(e) { if (this.data.busy || this.data.loading || this.data.failed || this.data.saved) return; const row = this.data.rows.find(item => item.id === e.currentTarget.dataset.id); if (!row || !row.canDelete) return; const request = session.beginRequest(this, 'natureConfirm'); const target = { id: row.id, version: Number(row.version) }; wx.showModal({ title: ui.removeTitle, content: ui.removeConfirm(row.name), confirmText: ui.remove, cancelText: ui.cancel, success: result => { if (result.confirm && this.current(request)) this.write('deleteAssignmentNature', target); } }); }
  }
});
