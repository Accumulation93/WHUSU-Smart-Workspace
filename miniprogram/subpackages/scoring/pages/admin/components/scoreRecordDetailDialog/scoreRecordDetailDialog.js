Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: Boolean,
    localeCopy: Object,
    recordDetail: Object,
    canRevoke: Boolean
  },

  methods: {
    emitClose() {
      this.triggerEvent('close');
    },

    emitRevoke(e) {
      this.triggerEvent('revoke', { id: e.currentTarget.dataset.id });
    },

    emitToggleScoreLabel(e) {
      this.triggerEvent('togglescorelabel', {
        templateIndex: e.currentTarget.dataset.templateIndex,
        questionIndex: e.currentTarget.dataset.questionIndex
      });
    },

    noop() {}
  }
});
