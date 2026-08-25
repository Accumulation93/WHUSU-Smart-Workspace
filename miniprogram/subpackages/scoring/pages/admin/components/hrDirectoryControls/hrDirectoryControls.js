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
    canRevokeRecovery: Boolean
  },

  methods: {
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
