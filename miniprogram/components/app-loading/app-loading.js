const copy = require('../../locales/zh-CN/common');

Component({
  options: { styleIsolation: 'isolated', virtualHost: true },
  properties: {
    active: { type: Boolean, value: true },
    text: { type: String, value: '' },
    compact: { type: Boolean, value: false },
    toast: { type: Boolean, value: false }
  },
  data: { copy }
});
