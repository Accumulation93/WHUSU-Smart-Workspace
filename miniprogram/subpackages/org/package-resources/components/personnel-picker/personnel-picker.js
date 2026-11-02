'use strict';

const localeCopy = require('../../locales/zh-CN/personnelPicker');
const model = require('./personnelPickerModel');

Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: { type: Boolean, value: false, observer: function(value) { this._onVisibleChange(value); } },
    title: { type: String, value: '' },
    options: { type: Array, value: [], observer: function() { this._onOptionsChange(); } },
    value: { type: Array, value: [], observer: function() { this._onValueChange(); } },
    selectionLevel: { type: String, value: 'assignment' },
    multiple: { type: Boolean, value: true },
    loading: { type: Boolean, value: false },
    errorText: { type: String, value: '' },
    contextText: { type: String, value: '' },
    confirmLoading: { type: Boolean, value: false }
  },

  data: {
    localeCopy,
    optionCount: 0,
    filteredOptions: [],
    selectedItems: [],
    selectedExpanded: false,
    draftKeys: [],
    departmentOptions: [],
    identityOptions: [],
    workGroupOptions: [],
    departmentIndex: 0,
    identityIndex: 0,
    workGroupIndex: 0,
    department: '',
    identity: '',
    workGroup: '',
    keyword: '',
    selectedHeading: '',
    candidateHeading: '',
    selectedCountText: ''
  },

  lifetimes: {
    detached: function() { clearTimeout(this._searchTimer); }
  },
  pageLifetimes: {
    hide: function() { clearTimeout(this._searchTimer); }
  },
  methods: {
    _onVisibleChange: function(visible) {
      if (visible) this._resetDraft();
      else clearTimeout(this._searchTimer);
    },

    _onOptionsChange: function() {
      if (this.data.visible) this._refreshOptions(this.data.draftKeys);
    },

    _onValueChange: function() {
      if (this.data.visible) this._resetDraft();
    },

    _resetDraft: function() {
      const keys = model.selectedKeys(this.properties.value, this.properties.selectionLevel);
      clearTimeout(this._searchTimer);
      this._refreshOptions(keys, {
        departmentIndex: 0,
        identityIndex: 0,
        workGroupIndex: 0,
        department: '',
        identity: '',
        workGroup: '',
        keyword: '',
        selectedExpanded: false,
        draftKeys: keys
      });
    },

    _refreshOptions: function(keys, changes) {
      const normalized = model.normalizeOptions(this.properties.options, this.properties.selectionLevel).map(function(item) {
        return Object.assign({}, item, {
          _displayName: item.name || localeCopy.unnamed,
          _assignmentText: item.assignmentLabel || localeCopy.assignmentUnavailable
        });
      });
      this._options = normalized;
      this._byKey = new Map();
      this._orderByKey = new Map();
      normalized.forEach((item, index) => { this._byKey.set(item.selectionKey, item); this._orderByKey.set(item.selectionKey, index); });
      const allLabel = localeCopy.all;
      const departmentOptions = [allLabel].concat(model.optionNames(normalized, 'departmentName'));
      const identityOptions = [allLabel].concat(model.optionNames(normalized, 'identityCategoryName'));
      const workGroupOptions = [allLabel].concat(model.optionNames(normalized, 'workGroupName'));
      this._applyView(keys || this.data.draftKeys, Object.assign({
        optionCount: normalized.length,
        departmentOptions,
        identityOptions,
        workGroupOptions,
        selectedHeading: this.properties.selectionLevel === 'person' ? localeCopy.selectedPersonTitle : localeCopy.selectedTitle,
        candidateHeading: this.properties.selectionLevel === 'person' ? localeCopy.candidatePersonTitle : localeCopy.candidateTitle
      }, changes || {}));
    },

    _applyView: function(keys, changes, selectionOnly) {
      const selectedSet = new Set(keys || []);
      const state = Object.assign({}, this.data, changes || {});
      const patch = Object.assign({}, changes || {});
      const filters = {
        department: state.department,
        identity: state.identity,
        workGroup: state.workGroup,
        keyword: state.keyword
      };
      if (selectionOnly && this._visibleIndex) {
        const previous = new Set(this.data.draftKeys || []);
        const changedKeys = new Set((this.data.draftKeys || []).concat(keys || []));
        changedKeys.forEach((key) => {
          if (previous.has(key) === selectedSet.has(key)) return;
          const index = this._visibleIndex.get(key);
          if (index !== undefined) patch['filteredOptions[' + index + ']._selected'] = selectedSet.has(key);
        });
      } else {
        patch.filteredOptions = model.filterOptions(this._options || [], filters).map(item => Object.assign({}, item, { _selected: selectedSet.has(item.selectionKey) }));
        this._visibleIndex = new Map();
        patch.filteredOptions.forEach((item, index) => this._visibleIndex.set(item.selectionKey, index));
      }
      const selected = (keys || []).filter(key => this._byKey && this._byKey.has(key));
      selected.sort((a, b) => this._orderByKey.get(a) - this._orderByKey.get(b));
      this.setData(Object.assign(patch, {
        selectedItems: selected.map(key => Object.assign({}, this._byKey.get(key), { _selected: true })),
        draftKeys: keys || [],
        selectedCountText: localeCopy.selectedCount((keys || []).length)
      }));
    },

    toggleOption: function(event) {
      const key = String(event.currentTarget.dataset.key || '');
      if (!key) return;
      const keys = model.toggleSelection(this.data.draftKeys, key, this.properties.multiple);
      this._applyView(keys, null, true);
    },

    toggleSelectedExpanded: function() {
      this.setData({ selectedExpanded: !this.data.selectedExpanded });
    },

    onDepartmentChange: function(event) {
      const index = Number(event.detail.value) || 0;
      this._applyView(this.data.draftKeys, { departmentIndex: index, department: index ? this.data.departmentOptions[index] : '' });
    },

    onIdentityChange: function(event) {
      const index = Number(event.detail.value) || 0;
      this._applyView(this.data.draftKeys, { identityIndex: index, identity: index ? this.data.identityOptions[index] : '' });
    },

    onWorkGroupChange: function(event) {
      const index = Number(event.detail.value) || 0;
      this._applyView(this.data.draftKeys, { workGroupIndex: index, workGroup: index ? this.data.workGroupOptions[index] : '' });
    },

    onKeywordInput: function(event) {
      const keyword = event.detail.value || '';
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this._searchTimer = null;
        if (this.data.visible) this._applyView(this.data.draftKeys, { keyword });
      }, 120);
    },

    confirmSelection: function() {
      this.triggerEvent('confirm', {
        keys: this.data.draftKeys.slice(),
        items: this.data.selectedItems.map(function(item) {
          const copy = Object.assign({}, item);
          delete copy._selected;
          delete copy._displayName;
          delete copy._assignmentText;
          return copy;
        })
      });
    },

    cancelSelection: function() {
      this.triggerEvent('cancel');
    },

    retry: function() {
      this.triggerEvent('retry');
    },

    noop: function() {}
  }
});
