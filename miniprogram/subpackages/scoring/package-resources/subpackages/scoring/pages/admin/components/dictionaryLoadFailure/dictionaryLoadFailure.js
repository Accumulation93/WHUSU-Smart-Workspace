'use strict';

Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    message: { type: String, value: '' },
    retryText: { type: String, value: '' }
  },
  methods: {
    emitRetry() {
      this.triggerEvent('retry');
    }
  }
});
