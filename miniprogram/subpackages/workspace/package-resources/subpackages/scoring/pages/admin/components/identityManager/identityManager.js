'use strict';
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    activeTab: { type: String, value: '' },
    loadingMap: { type: Object, value: {} },
    dictionaryLoadState: { type: Object, value: {} },
    identityRelationEnabled: { type: Boolean, value: false },
    relationCopy: { type: Object, value: {} },
    localeCopy: { type: Object, value: {} },
    identityNatureFilter: { type: String, value: '' },
    identityNatureOptions: { type: Array, value: [] },
    authorizationEnforced: { type: Boolean, value: false },
    identityForm: { type: Object, value: {} },
    actionCapabilities: { type: Object, value: {} },
    isSuperAdmin: { type: Boolean, value: false },
    user: { type: Object, value: {} },
    identityNatureSelection: { type: Object, value: {} },
    identityActionNotice: { type: String, value: '' },
    identityList: { type: Array, value: [] },
    identityVisibleList: { type: Array, value: [] },
    identityPreview: { type: Object, value: {} },
    identityForceStage: { type: Boolean, value: false },
    identityDescriptionChoice: { type: String, value: '' }
  },
  methods: {
    noop() {},
    retryIdentityList(event) { this.triggerEvent('action', { action: 'retryIdentityList', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    onIdentityNatureFilter(event) { this.triggerEvent('action', { action: 'onIdentityNatureFilter', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    toggleIdentityNature(event) { this.triggerEvent('action', { action: 'toggleIdentityNature', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    onIdentityFieldInput(event) { this.triggerEvent('action', { action: 'onIdentityFieldInput', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    saveIdentity(event) { this.triggerEvent('action', { action: 'saveIdentity', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    startCreateIdentity(event) { this.triggerEvent('action', { action: 'startCreateIdentity', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    editIdentity(event) { this.triggerEvent('action', { action: 'editIdentity', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    deleteIdentity(event) { this.triggerEvent('action', { action: 'deleteIdentity', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    closeIdentityPreview(event) { this.triggerEvent('action', { action: 'closeIdentityPreview', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    chooseIdentityDescription(event) { this.triggerEvent('action', { action: 'chooseIdentityDescription', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); },
    confirmIdentityPreview(event) { this.triggerEvent('action', { action: 'confirmIdentityPreview', dataset: event.currentTarget.dataset, value: event.detail && event.detail.value }); }
  }
});
