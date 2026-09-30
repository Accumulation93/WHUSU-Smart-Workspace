Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    cards: { type: Array, value: [] },
    title: { type: String, value: '' },
    hint: { type: String, value: '' },
    valuePrefix: { type: String, value: '' }
  }
});
