Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: Boolean,
    localeCopy: Object,
    canBrowseHrInfo: Boolean,
    loadingMap: Object,
    filterOptions: Object,
    searchFieldIndex: Number,
    sortIndex: Number,
    keyword: String,
    advancedVisible: Boolean,
    activeFilterChips: Array,
    canVerifyIdentity: Boolean,
    canGlobalAccountManage: Boolean,
    governanceUnavailable: Boolean,
    authActionLoadingKey: String,
    selectionCount: Number,
    canSelectAll: Boolean,
    canInvertSelection: Boolean,
    canClearSelection: Boolean,
    canIssueVerification: Boolean,
    canRevokeVerification: Boolean,
    canIssueRecovery: Boolean,
    canRevokeRecovery: Boolean,
    // 认证码有效期选项（天）与当前选中项，由页面统一持有，批次与单人发码共用。
    codeValidityOptions: Array,
    codeValidityIndex: Number
  },

  methods: {
    emitCodeValidityChange(e) {
      this.triggerEvent('codevaliditychange', { value: e.detail.value });
    },

    emitExport() {
      this.triggerEvent('export');
    },

    emitSearchFieldChange(e) {
      this.triggerEvent('searchfieldchange', { value: e.detail.value });
    },

    emitKeywordInput(e) {
      this.triggerEvent('keywordinput', { value: e.detail.value });
    },

    emitSortChange(e) {
      this.triggerEvent('sortchange', { value: e.detail.value });
    },

    emitToggleFilters() {
      this.triggerEvent('togglefilters');
    },

    emitFilterGroupChange(e) {
      this.triggerEvent('filtergroupchange', {
        field: String(e.currentTarget.dataset.field || ''),
        value: e.detail.value || []
      });
    },

    emitClearChip(e) {
      this.triggerEvent('clearchip', {
        category: String(e.currentTarget.dataset.category || ''),
        value: String(e.currentTarget.dataset.value || '')
      });
    },

    emitReset() {
      this.triggerEvent('reset');
    },

    emitSelectAll() {
      this.triggerEvent('selectall');
    },

    emitInvertSelection() {
      this.triggerEvent('invertselection');
    },

    emitClearSelection() {
      this.triggerEvent('clearselection');
    },

    emitIssueVerification() {
      this.triggerEvent('issueverification');
    },

    emitRevokeVerification() {
      this.triggerEvent('revokeverification');
    },

    emitIssueRecovery() {
      this.triggerEvent('issuerecovery');
    },

    emitRevokeRecovery() {
      this.triggerEvent('revokerecovery');
    }
  }
});
