'use strict';

Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    headerCloseText: { type: String, value: '' },
    description: { type: String, value: '' },
    targetLabel: { type: String, value: '' },
    targetName: { type: String, value: '' },
    usages: { type: Array, value: [] },
    closeText: { type: String, value: '' }
  },
  methods: {
    noop() {},
    emitClose() {
      this.triggerEvent('close');
    }
  }
});
