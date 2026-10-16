Component({
  properties: {
    visible: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    submitting: { type: Boolean, value: false },
    canDirect: { type: Boolean, value: false },
    copy: { type: Object, value: {} },
    orgs: { type: Array, value: [] },
    sourceIndex: { type: Number, value: 0 },
    sourceOrgName: { type: String, value: '' },
    hasToken: { type: Boolean, value: false },
    fieldPlan: { type: Array, value: [] },
    report: { type: Array, value: [] },
    conflicts: { type: Array, value: [] }
  },
  methods: {
    onSourceChange(e) {
      this.triggerEvent('sourcechange', { index: Number(e.detail.value) });
    },
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
      this.triggerEvent('preview');
    },
    onApply() {
      this.triggerEvent('apply');
    },
    onClose() {
      this.triggerEvent('close');
    },
    noop() {}
  }
});
