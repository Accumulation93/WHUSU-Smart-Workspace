'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const presentation = require('../../utils/authorizationPresentation');
Component({
  properties: {
    value: { type: Object, value: {}, observer: 'refresh' },
    directory: { type: Object, value: {}, observer: 'refresh' },
    relative: { type: Boolean, value: false }, disabled: { type: Boolean, value: false }
  },
  data: { ui, groups: [], expanded: {} },
  lifetimes: { attached: function() { this.refresh(); } },
  methods: {
    refresh: function() {
      const indexes = presentation.makeIndexes(this.properties.directory || {});
      const labels = { natureId: ui.nature, departmentId: ui.department, identityCategoryId: ui.identityCategory, workGroupId: ui.workGroup };
      this.setData({ groups: Object.keys(labels).map(key => {
        const selected = this.properties.value[key];
        const items = [];
        indexes.dimensions[key].forEach((name, id) => items.push({ id, name, selected: Array.isArray(selected) && selected.includes(id) }));
        return { key, label: labels[key], same: selected === 'same', summary: selected === 'same' ? ui.sameAsViewer : ui.selectionCount((selected || []).length), items };
      }) });
    },
    expand: function(event) {
      const key = event.currentTarget.dataset.key;
      this.setData({ expanded: Object.assign({}, this.data.expanded, { [key]: !this.data.expanded[key] }) });
    },
    choose: function(event) {
      if (this.properties.disabled) return;
      const key = event.currentTarget.dataset.key;
      const id = event.currentTarget.dataset.id;
      const previous = this.properties.value[key];
      const value = Object.assign({}, this.properties.value);
      if (event.currentTarget.dataset.same) {
        if (!this.properties.relative) return;
        if (previous === 'same') delete value[key]; else value[key] = 'same';
      } else {
        const values = Array.isArray(previous) ? previous : [];
        const next = values.includes(id) ? values.filter(item => item !== id) : values.concat(id);
        if (next.length) value[key] = next; else delete value[key];
      }
      this.triggerEvent('change', { value });
    }
  }
});
