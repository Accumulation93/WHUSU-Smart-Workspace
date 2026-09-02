'use strict';

const ICON_NAMES = [
  'bell', 'calendar', 'check', 'chevron-right', 'clock', 'edit', 'file',
  'grid', 'home', 'list', 'plus', 'search', 'shield', 'signature', 'trash',
  'user', 'venue', 'x'
];

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
    name: function(name) {
      const safeName = ICON_NAMES.indexOf(name) >= 0 ? name : 'home';
      this.setData({ src: `/assets/icons/${safeName}.svg` });
    }
  }
});
