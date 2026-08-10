Component({
  properties: {
    booking: {
      type: Object,
      value: {}
    }
  },

  data: {
    expandedNodeKey: ''
  },

  methods: {
    toggleFlowNode(e) {
      const key = e.currentTarget.dataset.nodeKey;
      this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key });
    }
  }
});
