const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/identityBehavior');
// Behavior: identity tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyIdentityForm } = utils;
const orgSession = require('../../../../../../../../utils/orgSession');
const personnelCopy = require('../../../../../locales/zh-CN/adminPersonnel');
const { createResultError, getErrorText } = require('../../../../../../../../utils/api');
const relationCopy = require('../../../../../../../../locales/zh-CN/identityNatureRelations');

module.exports = Behavior({
  data: { relationCopy, identityRelationEnabled:false,identityNatureOptions: [], identityNatureSelection: {}, identityNatureFilter: '', identityVisibleList: [], identityActionNotice: '', identityPreview: null, identityDescriptionChoice: '', identityForceStage: false },
  methods: {
    onIdentityManagerAction(event) {
      const detail = event.detail || {};
      const allowed = ['retryIdentityList', 'onIdentityNatureFilter', 'toggleIdentityNature', 'onIdentityFieldInput', 'saveIdentity', 'startCreateIdentity', 'editIdentity', 'deleteIdentity', 'closeIdentityPreview', 'chooseIdentityDescription', 'confirmIdentityPreview'];
      if (allowed.indexOf(detail.action) < 0) return;
      return this[detail.action]({ currentTarget: { dataset: detail.dataset || {} }, detail: { value: detail.value } });
    },
    _identityNatureNames(ids) { return (ids || []).map(id => (this.data.identityNatureOptions || []).find(item => item.id === id)).filter(Boolean).map(item => item.name).join(' · '); },
    _refreshIdentityRows() {
      const filter = this.data.identityNatureFilter;
      const source = this.data.authorizationEnforced ? this.data.managedIdentityList : this.data.identityList;
      this.setData({ identityVisibleList: (source || []).map((row, index) => Object.assign({}, row, { sourceIndex: index, natureText: this._identityNatureNames(row.natureIds) || relationCopy.pending })).filter(row => !filter || (filter === 'pending' ? !(row.natureIds || []).length : (row.natureIds || []).indexOf(filter) >= 0)) });
    },
    onIdentityNatureFilter(e) { this.setData({ identityNatureFilter: e.currentTarget.dataset.id || '' }); this._refreshIdentityRows(); },
    toggleIdentityNature(e) {
      if (this.data.loadingMap.saveIdentity) return;
      const id = e.currentTarget.dataset.id;
      const selected = (this.data.identityForm.natureIds || []).slice();
      const index = selected.indexOf(id);
      if (index >= 0) selected.splice(index, 1); else selected.push(id);
      this.setData({ 'identityForm.natureIds': selected, identityNatureSelection: selected.reduce((result, value) => { result[value] = true; return result; }, {}), identityActionNotice: '' });
    },
    async loadIdentityList() {
      const management = this.data.authorizationEnforced && this.data.activeTab === 'identities';
      const request = orgSession.beginRequest(this, 'identityList');
      this.setLoading('identities', true);
      try {
        const result = management ? await this.callCloud('listAuthorizedDictionary', { kind: 'identity' }) : await this.callCloud('listIdentities');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          throw createResultError(result, personnelCopy.dictionaryLoadFailed.identities.description);
        }
        this.setData({
          [management ? 'managedIdentityList' : 'identityList']: management ? result.list || [] : result.identities || []
        });
        if (this.data.activeTab === 'identities') this.setData({ identityNatureOptions: result.natureOptions || [],identityRelationEnabled:result.relationEnabled===true,identityNatureFilter:result.relationEnabled===true?this.data.identityNatureFilter:'' });
        this._refreshIdentityRows();
        this.setDictionaryLoadSuccess('identities');
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        this.setDictionaryLoadFailure(
          'identities',
          personnelCopy.dictionaryLoadFailed.identities.description
        );
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('identities', false);
      }
    },

    retryIdentityList() {
      return this.loadIdentityList();
    },

    onIdentityFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const rawValue = e.detail.value;
      const value = field === 'description' ? rawValue : rawValue.trim();
      this.setData({
        identityForm: {
          ...this.data.identityForm,
          [field]: value
        }
      });
    },

    startCreateIdentity() {
      if(!this.data.identityRelationEnabled)return;
      this.setData({
        identityForm: emptyIdentityForm(),
        identityNatureSelection: {}, identityActionNotice: '', identityPreview: null,
        activeTab: 'identities'
      });
    },

    editIdentity(e) {
      if(!this.data.identityRelationEnabled)return;
      const index = Number(e.currentTarget.dataset.index);
      const item = (this.data.authorizationEnforced ? this.data.managedIdentityList || [] : this.data.identityList)[index];
      if (this.data.authorizationEnforced && (!item || !item.canUpdate)) return;
      if (!item) {
        return;
      }

      this.setData({
        identityForm: {
          id: item.id,
          name: item.name,
          description: item.description || '', natureIds: (item.natureIds || []).slice(), version: item.version
        },
        identityNatureSelection: (item.natureIds || []).reduce((result, id) => { result[id] = true; return result; }, {}), identityActionNotice: '',
        activeTab: 'identities'
      });
    },

    async saveIdentity() {
      if(!this.data.identityRelationEnabled){this.setData({identityActionNotice:relationCopy.configurationNotEnabled});return;}
      const form = this.data.identityForm;
      if (this.data.loadingMap.saveIdentity) return;
      if (!form.id && !(form.natureIds || []).length) { this.setData({ identityActionNotice: relationCopy.selectNatureRequired }); return; }
      if (!form.name) {
        wx.showToast({
          title: localeCopy.copy_f5b2fb24f1,
          icon: 'none'
        });
        return;
      }

      this.setLoading('saveIdentity', true);
      const request = orgSession.beginRequest(this, 'identitySave');
      try {
        const result = await this.callCloud('saveIdentity', {
          id: form.id,
          name: form.name,
          description: form.description, natureIds: form.natureIds, version: form.version, preview: true
        });
        if (!orgSession.isRequestCurrent(this, request)) return;

        if (result.status !== 'success') {
          wx.showToast({
            title: getErrorText(createResultError(result, localeCopy.copy_215e3c57da)),
            icon: 'none'
          });
          return;
        }

        if (!result.preview) throw new Error();
        this._identityPendingPayload = { id: form.id, name: form.name, description: form.description, natureIds: form.natureIds.slice(), version: form.version };
        const preview = result.preview;
        preview.usages = (preview.usages || []).map(item => Object.assign({}, item, {
          hiddenText: item.hiddenCount > 0 ? relationCopy.hiddenDetailCount(item.hiddenCount) : '',
          kind: item.kind === 'audit_history' ? 'approvals' : item.kind === 'stamp_bindings' ? 'stamps' : item.kind === 'copy_drafts' ? 'copyDrafts' : item.kind
        }));
        this.setData({ identityPreview: Object.assign({}, preview, { name: form.name, natureText: this._identityNatureNames(preview.natureIds), addedText: this._identityNatureNames(preview.addedNatureIds), mergeText: relationCopy.mergeHelp(form.name), forceText: relationCopy.forceHelp(this._identityNatureNames(preview.removedNatureIds), form.name), usages: (preview.usages || []).map(item => Object.assign({}, item, { label: ({ positions: relationCopy.affectedPositions, assignments: relationCopy.affectedPositions, approvals: relationCopy.affectedApprovals, stamps: relationCopy.affectedStamps, copyDrafts: relationCopy.affectedCopyDrafts })[item.kind] || personnelCopy.dictionaryUsageCategories[item.kind] || relationCopy.affectedRules })) }), identityDescriptionChoice: '', identityForceStage: false, identityActionNotice: '' });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request)) return;
        wx.showToast({
          title: getErrorText(error),
          icon: 'none'
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('saveIdentity', false);
      }
    },
    closeIdentityPreview() { if (this.data.loadingMap.saveIdentity) return; this._identityPendingPayload = null; this.setData({ identityPreview: null, identityActionNotice: '' }); },
    chooseIdentityDescription(e) { if (!this.data.loadingMap.saveIdentity) this.setData({ identityDescriptionChoice: e.currentTarget.dataset.choice }); },
    async confirmIdentityPreview() {
      const preview = this.data.identityPreview;
      if (!preview || !this._identityPendingPayload || this.data.loadingMap.saveIdentity) return;
      if (preview.descriptionConflict && !this.data.identityDescriptionChoice) { this.setData({ identityActionNotice: relationCopy.chooseDescription }); return; }
      if ((preview.removedNatureIds || []).length && (preview.usages || []).some(item => Number(item.count) > 0) && !this.data.identityForceStage) { this.setData({ identityForceStage: true }); return; }
      const request = orgSession.beginRequest(this, 'identitySave');
      this.setLoading('saveIdentity', true);
      try {
        const result = await this.callCloud('saveIdentity', Object.assign({}, this._identityPendingPayload, { impactToken: preview.impactToken, mergeVersion: preview.version, descriptionChoice: this.data.identityDescriptionChoice, forceDetach: this.data.identityForceStage }));
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') throw createResultError(result);
        this._identityPendingPayload = null;
        this.setData({ identityForm: emptyIdentityForm(), identityNatureSelection: {}, identityPreview: null, identityActionNotice: '' });
        await this.loadIdentityList();
        if (orgSession.isRequestCurrent(this, request)) wx.showToast({ title: relationCopy.saved, icon: 'success' });
      } catch (error) { if (orgSession.isRequestCurrent(this, request)) this.setData({ identityActionNotice: getErrorText(error) }); }
      finally { if (orgSession.isRequestCurrent(this, request)) this.setLoading('saveIdentity', false); }
    },

    async deleteIdentity(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) {
        return;
      }
      const target = ((this.data.authorizationEnforced ? this.data.managedIdentityList : this.data.identityList) || []).find((item) => String(item.id) === String(id));
      if (this.data.authorizationEnforced && (!target || !target.canDelete)) return;

      const confirm = await new Promise((resolve) => {
        wx.showModal({
          title: localeCopy.copy_9167d1395d,
          content: [target && target.name, localeCopy.copy_30267845ce].filter(Boolean).join('\n\n'),
          confirmText: localeCopy.copy_7f31eec657,
          cancelText: localeCopy.copy_4b213fd88a,
          success: (res) => resolve(!!res.confirm),
          fail: () => resolve(false)
        });
      });

      if (!confirm) {
        return;
      }

      try {
        const result = await this.callCloud('deleteIdentity', { id });
        if (result.status !== 'success') {
          if (result.status === 'in_use' && this.openDictionaryUsageDialog(
            target && target.name,
            result.usages
          )) return;
          wx.showToast({
            title: getErrorText(createResultError(result, localeCopy.copy_076bb5d383)),
            icon: 'none'
          });
          return;
        }

        await this.loadIdentityList();
        this.updateHrFormOptions();
        wx.showToast({
          title: localeCopy.copy_e000ed06dd,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: getErrorText(error),
          icon: 'none'
        });
      }
    }
  }
});
