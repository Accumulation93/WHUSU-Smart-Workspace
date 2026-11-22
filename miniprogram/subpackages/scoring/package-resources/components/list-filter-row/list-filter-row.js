Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    label: String,
    range: Array,
    rangeKey: String,
    value: Number,
    multiple: Boolean
  },
  observers: {
    'range, rangeKey, multiple'(range, rangeKey, multiple) {
      this.setData({ options: (range || []).map((item, index) => ({
        index,
        label: rangeKey ? item[rangeKey] : item,
        selected: multiple && item.selected === true
      })) });
    }
  },
  data: { options: [] },
  methods: {
    choose(event) {
      const value = Number(event.currentTarget.dataset.index);
      if (this.data.multiple) {
        const values = this.data.range.filter((item, index) => index === value ? !item.selected : item.selected);
        this.triggerEvent('change', { value: values.map(item => item.value) });
        return;
      }
      if (value !== this.data.value) this.triggerEvent('change', { value: String(value) });
    }
  }
});
