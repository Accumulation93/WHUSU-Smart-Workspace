'use strict';

Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    candidates: { type: Array, value: [] },
    title: { type: String, value: '' },
    noPositionText: { type: String, value: '' },
    positionPrefix: { type: String, value: '' },
    actionText: { type: String, value: '' }
  },
  methods: {
    selectCandidate(event) {
      this.triggerEvent('select', {
        index: Number(event.currentTarget.dataset.index)
      });
    }
  }
});
