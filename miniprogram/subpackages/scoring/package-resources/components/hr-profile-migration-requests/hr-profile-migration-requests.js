Component({
  properties: {
    copy: { type: Object, value: {} },
    canRequest: { type: Boolean, value: false },
    canApprove: { type: Boolean, value: false },
    pendingRequests: { type: Array, value: [] },
    myRequests: { type: Array, value: [] }
  },
  methods: {
    onOpen() {
      if (!this.data.canRequest) return;
      this.triggerEvent('open');
    },
    onLoad() {
      this.triggerEvent('load');
    },
    onApprove(e) {
      if (!this.data.canApprove) return;
      this.triggerEvent('approve', { id: e.currentTarget.dataset.id });
    },
    onReject(e) {
      if (!this.data.canApprove) return;
      this.triggerEvent('reject', { id: e.currentTarget.dataset.id });
    },
    onCancel(e) {
      if (!this.data.canRequest) return;
      this.triggerEvent('cancel', { id: e.currentTarget.dataset.id });
    }
  }
});
