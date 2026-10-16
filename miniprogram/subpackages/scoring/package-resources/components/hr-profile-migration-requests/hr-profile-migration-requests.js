Component({
  properties: {
    copy: { type: Object, value: {} },
    pendingRequests: { type: Array, value: [] },
    myRequests: { type: Array, value: [] }
  },
  methods: {
    onOpen() {
      this.triggerEvent('open');
    },
    onLoad() {
      this.triggerEvent('load');
    },
    onApprove(e) {
      this.triggerEvent('approve', { id: e.currentTarget.dataset.id });
    },
    onReject(e) {
      this.triggerEvent('reject', { id: e.currentTarget.dataset.id });
    },
    onCancel(e) {
      this.triggerEvent('cancel', { id: e.currentTarget.dataset.id });
    }
  }
});
