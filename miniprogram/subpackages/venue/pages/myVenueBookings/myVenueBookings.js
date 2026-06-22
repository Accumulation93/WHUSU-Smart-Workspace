const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    bookings: [],
    loading: false,
    statusLabels: { pending: '待审核', approved: '已通过', rejected: '已驳回', cancelled: '已取消' }
  },

  onShow() {
    this.loadBookings();
  },

  async loadBookings() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listMyVenueBookings', data: {} });
      if (res.status === 'success') this.setData({ bookings: res.bookings || [] });
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  async cancelBooking(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '确认取消', content: '确定取消此次借用吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const res = await callFunction({ name: 'cancelVenueBooking', data: { id } });
          if (res.status === 'success') { showShortToast('已取消'); that.loadBookings(); }
          else showShortToast(res.message);
        } catch (e) { showShortToast(getErrorText(e, '取消失败')); }
      }
    });
  }
});
