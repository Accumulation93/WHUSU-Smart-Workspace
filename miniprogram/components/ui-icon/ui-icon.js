'use strict';

const ICON_NAMES = new Set([
  'bell', 'calendar', 'check', 'chevron-right', 'clock', 'edit', 'file',
  'grid', 'home', 'list', 'plus', 'search', 'shield', 'signature', 'trash',
  'user', 'venue', 'x'
]);

Component({
  properties: {
    name: {
      type: String,
      value: 'home'
    },
    tone: {
      type: String,
      value: 'primary'
    },
    size: {
      type: Number,
      value: 32
    },
    sizeRole: {
      type: String,
      value: ''
    },
    ariaLabel: {
      type: String,
      value: ''
    }
  },

  data: {
    src: '/assets/icons/home.svg'
  },

  observers: {
    name(name) {
      const safeName = ICON_NAMES.has(name) ? name : 'home';
      this.setData({ src: `/assets/icons/${safeName}.svg` });
    }
  }
});
