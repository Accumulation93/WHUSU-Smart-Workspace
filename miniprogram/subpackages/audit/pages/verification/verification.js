const { callFunction } = require('../../../../../utils/api');
const { getErrorText, showShortToast } = require('../../../scoring/pages/admin/modules/adminUtils');

Page({
  data: {
    submissionNumber: '',
    loading: false,
    result: null
  },

  onInputNumber(e) {
    this.setData({ submissionNumber: e.detail.value });
  },

  async verify() {
    const number = this.data.submissionNumber.trim();
    if (!number) { showShortToast('请输入提交编号'); return; }

    this.setData({ loading: true, result: null });
    try {
      const res = await callFunction({ name: 'verifySignatureChain', data: { submissionNumber: number } });
      if (res.status === 'success') {
        this.setData({ result: res });
      } else if (res.status === 'forbidden') {
        showShortToast('没有验签权限');
      } else {
        showShortToast(res.message || '验证失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '验证失败'));
    } finally {
      this.setData({ loading: false });
    }
  }
});
