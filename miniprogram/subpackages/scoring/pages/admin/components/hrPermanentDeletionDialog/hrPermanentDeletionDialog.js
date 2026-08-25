Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: Boolean,
    localeCopy: Object,
    scope: String,
    personName: String,
    studentId: String,
    preview: Object,
    result: Object,
    blockers: Array,
    cleanup: Array,
    affectedRules: Array,
    cleanupAccepted: Boolean,
    confirmation: String,
    loading: Boolean
  },

  methods: {
    emitClose() {
      this.triggerEvent('close');
    },

    emitConfirmationInput(e) {
      this.triggerEvent('confirmationinput', { value: e.detail.value });
    },

    emitCleanupAcceptance(e) {
      this.triggerEvent('cleanupacceptance', {
        accepted: Array.isArray(e.detail.value) && e.detail.value.includes('accepted')
      });
    },

    emitConfirm() {
      this.triggerEvent('confirm');
    },

    noop() {}
  }
});
