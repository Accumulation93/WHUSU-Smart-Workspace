Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    matches: { type: Array, value: [] },
    countText: { type: String, value: '' },
    copy: { type: Object, value: {} },
    numberLabel: { type: String, value: '' }
  },
  methods: {
    onSelect(e) {
      const submissionId = String(e.currentTarget.dataset.submissionId || '');
      if (!submissionId) return;
      this.triggerEvent('select', { submissionId });
    }
  }
});
