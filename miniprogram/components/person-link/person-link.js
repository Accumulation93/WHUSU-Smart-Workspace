const links = require('../../utils/personLinks');
const session = require('../../utils/orgSession');
Component({
  properties: { name: String, hrId: String, assignmentId: String, personId: String, reference: String },
  data: { available: false },
  observers: { 'hrId, assignmentId, personId, reference': function() { if (this._visible) this.refresh(); } },
  lifetimes: { attached() { this._visible = true; this.refresh(); }, detached() { this.clear(); } },
  pageLifetimes: { show() { this._visible = true; this.refresh(); }, hide() { this.clear(); } },
  methods: {
    clear() { this._visible = false; this._generation = (this._generation || 0) + 1; this._target = null; this.setData({ available: false }); },
    async refresh() {
      const generation = this._generation = (this._generation || 0) + 1;
      this._target = null; this.setData({ available: false });
      const data = this.properties;
      const ref = data.reference ? { kind: 'reference', id: data.reference } : data.assignmentId ? { kind: 'assignment', id: data.assignmentId } : data.hrId ? { kind: 'hr', id: data.hrId } : data.personId ? { kind: 'person', id: data.personId } : null;
      if (!ref) return;
      this._scope = session.getSnapshot();
      const target = await links.resolve(ref);
      if (!this._visible || generation !== this._generation || !session.isCurrent(this._scope)) return;
      this._target = target; this.setData({ available: Boolean(target) });
    },
    async open() {
      if (!this._target || !session.isCurrent(this._scope)) return;
      // 离开原业务前再次读取权限，目标页面仍独立授权。
      await this.refresh();
      if (this._visible && this._target) links.open(this._target);
    }
  }
});
