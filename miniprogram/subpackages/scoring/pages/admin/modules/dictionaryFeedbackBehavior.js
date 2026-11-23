'use strict';

const personnelCopy = require('../../../../../locales/zh-CN/adminPersonnel');
const { normalizeUsageItems } = require('./dictionaryFeedbackView');

module.exports = Behavior({
  data: {
    dictionaryLoadState: {
      departments: { status: 'idle', message: '' },
      identities: { status: 'idle', message: '' },
      workGroups: { status: 'idle', message: '' }
    },
    dictionaryUsageDialog: {
      visible: false,
      targetName: '',
      usages: []
    }
  },
  methods: {
    setDictionaryLoadSuccess(key) {
      this.setData({
        [`dictionaryLoadState.${key}`]: { status: 'ready', message: '' }
      });
    },

    setDictionaryLoadFailure(key, message) {
      const fallback = personnelCopy.dictionaryLoadFailed[key] || {};
      this.setData({
        [`dictionaryLoadState.${key}`]: {
          status: 'error',
          message: String(message || fallback.description || '')
        }
      });
    },

    openDictionaryUsageDialog(targetName, usages) {
      const items = normalizeUsageItems(usages);
      if (!items.length) return false;
      this.setData({
        dictionaryUsageDialog: {
          visible: true,
          targetName: String(targetName || ''),
          usages: items
        }
      });
      return true;
    },

    closeDictionaryUsageDialog() {
      this.setData({
        dictionaryUsageDialog: {
          visible: false,
          targetName: '',
          usages: []
        }
      });
    }
  }
});
