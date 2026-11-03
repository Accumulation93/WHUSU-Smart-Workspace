const validationCopy = require('../../locales/zh-CN/hrValueValidation');
Component({
  properties: {
    visible: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    submitting: { type: Boolean, value: false },
    canDirect: { type: Boolean, value: false },
    copy: { type: Object, value: {} },
    orgs: { type: Array, value: [] },
    members: { type: Array, value: [] },
    selectedMembers: { type: Array, value: [] },
    sourceIndex: { type: Number, value: 0 },
    sourceOrgName: { type: String, value: '' },
    targetOrgName: { type: String, value: '' },
    hasToken: { type: Boolean, value: false },
    fieldPlan: { type: Array, value: [] },
    report: { type: Array, value: [] },
    conflicts: { type: Array, value: [] }
  },
  data: { memberPickerVisible: false, validationCopy },
  methods: {
    onSourceChange(e) {
      this.triggerEvent('sourcechange', { index: Number(e.detail.value) });
    },
    openMembers() { if (!this.data.loading && this.data.sourceOrgName) this.setData({ memberPickerVisible: true }); },
    closeMembers() { this.setData({ memberPickerVisible: false }); },
    confirmMembers(e) { this.setData({ memberPickerVisible: false }); this.triggerEvent('memberschange', e.detail); },
    onFieldActionChange(e) {
      this.triggerEvent('fieldactionchange', {
        index: Number(e.currentTarget.dataset.index),
        action: e.detail.value
      });
    },
    onTargetChange(e) {
      this.triggerEvent('targetchange', {
        index: Number(e.currentTarget.dataset.index),
        targetIndex: Number(e.detail.value)
      });
    },
    onConflictChange(e) {
      this.triggerEvent('conflictchange', {
        index: Number(e.currentTarget.dataset.index),
        policy: e.detail.value
      });
    },
    onBatchConflict(e) {
      this.triggerEvent('batchconflict', { policy: e.currentTarget.dataset.policy });
    },
    onPreview() {
      if (this.data.loading || this.data.submitting) return;
      this.triggerEvent('preview');
    },
    onApply() {
      if (this.data.loading || this.data.submitting || !this.data.hasToken || this.data.report.length) return;
      this.triggerEvent('apply');
    },
    onBackToEdit() { if (!this.data.loading && !this.data.submitting) this.triggerEvent('backtoedit'); },
    onClose() {
      if (this.data.loading || this.data.submitting) return;
      this.setData({ memberPickerVisible: false });
      this.triggerEvent('close');
    },
    noop() {}
  }
});
