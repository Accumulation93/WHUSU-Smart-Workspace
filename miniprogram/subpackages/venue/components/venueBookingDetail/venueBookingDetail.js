const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail');
Component({
  properties: {
    booking: {
      type: Object,
      value: {}
    }
  },

  data: {
    localeCopy,
    expandedNodeKey: ''
  },

  methods: {
    toggleFlowNode(e) {
      const key = e.currentTarget.dataset.nodeKey;
      this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key });
    }
  }
});
