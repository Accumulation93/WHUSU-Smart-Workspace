Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { copy: Object, allowed: Boolean, editing: Boolean, busy: Boolean, savedId: String, name: String, notice: String },
  methods: {
    toggle() { if (!this.data.busy) this.triggerEvent('toggle'); },
    input(e) { if (!this.data.busy && !this.data.savedId) this.triggerEvent('namechange', { value: e.detail.value }); },
    save() { if (!this.data.busy && this.data.name) this.triggerEvent('save'); }
  }
});
