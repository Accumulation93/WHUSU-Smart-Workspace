'use strict';
const ui = require('../../../../locales/zh-CN/authorization');
const presentation = require('../../utils/authorizationPresentation');
Component({
  properties: {
    value: { type: Object, value: {}, observer: 'refresh' },
    directory: { type: Object, value: {}, observer: 'refresh' },
    relative: { type: Boolean, value: false }, disabled: { type: Boolean, value: false }
  },
  data: { ui, groups: [], expanded: {}, natureMissing: true },
  lifetimes: { attached: function() { this.refresh(); } },
  methods: {
    refresh: function() {
      const indexes = presentation.makeIndexes(this.properties.directory || {});
      const nature = this.properties.value.natureId;
      const natureMissing = nature !== 'same' && !(Array.isArray(nature) && nature.length);
      const identities = (this.properties.directory.dimensions || {}).identityCategoryId || [];
      const labels = { natureId: ui.nature, departmentId: ui.department, identityCategoryId: ui.identityCategory, workGroupId: ui.workGroup };
      this.setData({ natureMissing, groups: Object.keys(labels).map(key => {
        const selected = this.properties.value[key];
        const items = [];
        indexes.dimensions[key].forEach((name, id) => {
          const chosen = Array.isArray(selected) && selected.includes(id);
          const identity = key === 'identityCategoryId' ? identities.find(item => item.id === id) : null;
          const allowed = key !== 'identityCategoryId' || !natureMissing && identity && Array.isArray(identity.natureIds)
            && identity.natureIds.some(value => nature === 'same' || nature.includes(value));
          if (allowed || chosen) items.push({ id, name, selected: chosen, incompatible: !allowed });
        });
        return { key, label: labels[key], same: selected === 'same', blocked: key === 'identityCategoryId' && natureMissing,
          incompatible: items.some(item => item.selected && item.incompatible),
          summary: selected === 'same' ? ui.sameAsViewer : ui.selectionCount((selected || []).length), items };
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
      if (key === 'identityCategoryId' && this.data.natureMissing && !(Array.isArray(previous) && previous.includes(id))) return;
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
