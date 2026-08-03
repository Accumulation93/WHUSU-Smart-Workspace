const { callFunction, showShortToast, getErrorText, formatAuditTime } = require('../../../../../utils/api');
const authContext = require('../../../../../utils/authContext');
const orgSession = require('../../../../../utils/orgSession');

const DIRECTORY_LIMIT = 2000;

function splitPolicyDateTime(value) {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const pad = function(number) { return String(number).padStart(2, '0'); };
  return {
    date: [parsed.getFullYear(), pad(parsed.getMonth() + 1), pad(parsed.getDate())].join('-'),
    time: [pad(parsed.getHours()), pad(parsed.getMinutes())].join(':')
  };
}

function combinePolicyDateTime(date, time) {
  if (!date) return '';
  return date + ' ' + (time || '00:00') + ':00';
}

function decorateClaim(item) {
  return Object.assign({}, item, {
    selected: false,
    createdText: formatAuditTime(String(item.createdAt || '')),
    expiresText: formatAuditTime(String(item.expiresAt || ''))
  });
}

function decorateAccount(item) {
  const labels = {
    verified: '正常',
    frozen: '已冻结',
    recovery_required: '待恢复'
  };
  return Object.assign({}, item, {
    selected: false,
    statusLabel: labels[item.accountStatus] || '正常'
  });
}

function matchesKeyword(item, keyword) {
  if (!keyword) return true;
  const text = [item.name, item.studentId, item.organizationName,
    item.requestedOrganizationName, item.departmentName, item.identityName,
    item.workGroupName].filter(Boolean).join(' ').toLowerCase();
  return text.indexOf(keyword.toLowerCase()) >= 0;
}

function uniquePeople(rows) {
  const seen = new Set();
  return (rows || []).filter(function(item) {
    const id = String(item.personId || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function splitIntoBatches(ids, size) {
  const rows = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  const batches = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

async function runBatchedAuthAction(options) {
  const batches = splitIntoBatches(options.ids, options.batchSize);
  const results = [];
  const completedIds = [];
  const failures = [];
  for (let index = 0; index < batches.length; index += 1) {
    const batchIds = batches[index];
    try {
      const data = Object.assign({}, options.extraData || {}, {
        action: options.action,
        [options.idField]: batchIds
      });
      const result = await callFunction({ name: options.name, data });
      if (result.status !== 'success') throw new Error(result.message || options.failureMessage);
      results.push(result);
      completedIds.push.apply(completedIds, batchIds);
    } catch (error) {
      failures.push(error);
    }
  }
  if (!results.length && failures.length) throw failures[0];
  return { results, completedIds, failures };
}

function flattenIssued(batchResult) {
  return (batchResult.results || []).reduce(function(rows, result) {
    return rows.concat(result.issued || []);
  }, []);
}

function mapPolicy(policy) {
  const source = policy || {};
  const starts = splitPolicyDateTime(source.claim_starts_at || source.claimStartsAt);
  const ends = splitPolicyDateTime(source.claim_ends_at || source.claimEndsAt);
  return {
    initialClaimEnabled: Boolean(source.initial_claim_enabled !== undefined
      ? source.initial_claim_enabled : source.initialClaimEnabled),
    allowRecoveryCode: Boolean(source.allow_recovery_code !== undefined
      ? source.allow_recovery_code : source.allowRecoveryCode),
    allowPassphrase: Boolean(source.allow_passphrase !== undefined
      ? source.allow_passphrase : source.allowPassphrase),
    passphraseMinLength: Number(source.passphrase_min_length || source.passphraseMinLength || 12),
    claimStartsDate: starts.date,
    claimStartsTime: starts.time,
    claimEndsDate: ends.date,
    claimEndsTime: ends.time
  };
}

module.exports = Behavior({
  data: {
    authPersonnelTabs: [],
    activeAuthPersonnelTab: '',
    authPersonnelLoading: false,
    authPersonnelLoaded: {},
    authActionLoadingKey: '',
    authSearch: '',
    authScopeOrganizationId: '',
    authScopeOrganizationName: '',
    authScopeOptions: [],
    authPendingClaims: [],
    authEligiblePeople: [],
    authRecoveryRequests: [],
    authAccounts: [],
    authPendingClaimTotal: 0,
    authEligiblePeopleTotal: 0,
    authRecoveryRequestTotal: 0,
    authAccountTotal: 0,
    selectedAuthClaimIds: [],
    selectedAuthEligiblePersonIds: [],
    selectedAuthAccountIds: [],
    authPolicy: null,
    authIssuedCodes: [],
    showAuthCodeDialog: false,
    showAuthRecoveryDialog: false,
    pendingAuthRecovery: null
  },

  methods: {
    initializeAuthPersonnel() {
      const tabs = [];
      if (this.data.canVerifyIdentity) tabs.push({ key: 'onboarding', label: '人员认证' });
      if (this.data.canRecoverAccounts) tabs.push({ key: 'accounts', label: '账号与恢复' });
      if (this.data.canManageAuthPolicy) tabs.push({ key: 'policy', label: '认证设置' });
      const organizations = authContext.getOrganizations();
      const activeOrgId = wx.getStorageSync('activeOrgId') || '';
      const activeOrgName = wx.getStorageSync('activeOrgName') || '';
      const scopeOptions = this.data.isSuperAdmin
        ? [{ id: '', name: '全部组织' }].concat(organizations)
        : [{ id: activeOrgId, name: activeOrgName || '当前组织' }];
      const currentTab = tabs.some((item) => item.key === this.data.activeAuthPersonnelTab)
        ? this.data.activeAuthPersonnelTab
        : (tabs[0] ? tabs[0].key : '');
      const currentScope = scopeOptions.find((item) => item.id === this.data.authScopeOrganizationId)
        || scopeOptions.find((item) => item.id === activeOrgId)
        || scopeOptions[0]
        || { id: activeOrgId, name: activeOrgName };
      this.setData({
        authPersonnelTabs: tabs,
        activeAuthPersonnelTab: currentTab,
        authScopeOptions: scopeOptions,
        authScopeOrganizationId: currentScope.id || '',
        authScopeOrganizationName: currentScope.name || '',
        authPersonnelLoaded: {}
      });
    },

    switchAuthPersonnelTab(e) {
      const key = String(e.currentTarget.dataset.key || '');
      if (!key || key === this.data.activeAuthPersonnelTab) return;
      this.setData({ activeAuthPersonnelTab: key, authSearch: '' });
      this.loadAuthPersonnel();
    },

    onAuthScopeChange(e) {
      const option = this.data.authScopeOptions[Number(e.detail.value || 0)];
      if (!option || option.id === this.data.authScopeOrganizationId) return;
      this._authPendingClaimsRaw = [];
      this._authEligiblePeopleRaw = [];
      this._authRecoveryRequestsRaw = [];
      this._authAccountsRaw = [];
      this.setData({
        authScopeOrganizationId: option.id || '',
        authScopeOrganizationName: option.name || '',
        authPersonnelLoaded: {},
        authSearch: '',
        authPendingClaimTotal: 0,
        authEligiblePeopleTotal: 0,
        authRecoveryRequestTotal: 0,
        authAccountTotal: 0,
        selectedAuthClaimIds: [],
        selectedAuthEligiblePersonIds: [],
        selectedAuthAccountIds: []
      });
      this.loadAuthPersonnel(true);
    },

    onAuthSearchInput(e) {
      const authSearch = String(e.detail.value || '').trim();
      this.setData({ authSearch });
      this.applyAuthPersonnelFilter(authSearch);
    },

    clearAuthSearch() {
      this.setData({ authSearch: '' });
      this.applyAuthPersonnelFilter('');
    },

    applyAuthPersonnelFilter(keyword) {
      const selectedClaims = new Set(this.data.selectedAuthClaimIds || []);
      const selectedEligible = new Set(this.data.selectedAuthEligiblePersonIds || []);
      const selectedAccounts = new Set(this.data.selectedAuthAccountIds || []);
      this.setData({
        authPendingClaims: (this._authPendingClaimsRaw || []).filter((item) => matchesKeyword(item, keyword))
          .map((item) => Object.assign({}, item, { selected: selectedClaims.has(item.id) })),
        authEligiblePeople: (this._authEligiblePeopleRaw || []).filter((item) => matchesKeyword(item, keyword))
          .map((item) => Object.assign({}, item, { selected: selectedEligible.has(item.personId) })),
        authRecoveryRequests: (this._authRecoveryRequestsRaw || []).filter((item) => matchesKeyword(item, keyword)),
        authAccounts: (this._authAccountsRaw || []).filter((item) => matchesKeyword(item, keyword))
          .map((item) => Object.assign({}, item, { selected: selectedAccounts.has(item.accountId) }))
      });
    },

    async loadAuthPersonnel(force) {
      const tab = this.data.activeAuthPersonnelTab;
      if (!tab || this.data.authPersonnelLoading) return;
      if (!force && this.data.authPersonnelLoaded[tab]) {
        this.applyAuthPersonnelFilter(this.data.authSearch);
        return;
      }
      const request = orgSession.beginRequest(this, 'authPersonnel-' + tab);
      this.setData({ authPersonnelLoading: true });
      try {
        if (tab === 'onboarding') await this.loadAuthOnboarding();
        if (tab === 'accounts') await this.loadAuthAccounts();
        if (tab === 'policy') await this.loadAuthPolicy();
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          authPersonnelLoaded: Object.assign({}, this.data.authPersonnelLoaded, { [tab]: true })
        });
        this.applyAuthPersonnelFilter(this.data.authSearch);
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request)) return;
        showShortToast(getErrorText(error, '请稍后重试'));
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setData({ authPersonnelLoading: false });
      }
    },

    async loadAuthOnboarding() {
      const organizationId = this.data.authScopeOrganizationId;
      const results = await Promise.all([
        callFunction({ name: 'admin/auth/claims', data: {
          action: 'list', limit: DIRECTORY_LIMIT, organizationId
        } }),
        callFunction({ name: 'admin/auth/claims', data: {
          action: 'eligible', limit: DIRECTORY_LIMIT, organizationId
        } })
      ]);
      if (results[0].status !== 'success' || results[1].status !== 'success') {
        throw new Error(results[0].message || results[1].message || '请稍后重试');
      }
      this._authPendingClaimsRaw = (results[0].list || []).map(decorateClaim);
      this._authEligiblePeopleRaw = uniquePeople(results[1].list).map(function(item) {
        return Object.assign({}, item, { selected: false });
      });
      this.setData({
        authPendingClaimTotal: this._authPendingClaimsRaw.length,
        authEligiblePeopleTotal: this._authEligiblePeopleRaw.length,
        selectedAuthClaimIds: [],
        selectedAuthEligiblePersonIds: []
      });
    },

    async loadAuthAccounts() {
      const organizationId = this.data.authScopeOrganizationId;
      const results = await Promise.all([
        callFunction({ name: 'admin/auth/recoveries', data: {
          action: 'list', limit: DIRECTORY_LIMIT, organizationId
        } }),
        callFunction({ name: 'admin/auth/accounts', data: {
          action: 'list', limit: DIRECTORY_LIMIT, organizationId
        } })
      ]);
      if (results[0].status !== 'success' || results[1].status !== 'success') {
        throw new Error(results[0].message || results[1].message || '请稍后重试');
      }
      this._authRecoveryRequestsRaw = (results[0].list || []).map(decorateClaim);
      this._authAccountsRaw = (results[1].list || []).map(decorateAccount);
      this.setData({
        authRecoveryRequestTotal: this._authRecoveryRequestsRaw.length,
        authAccountTotal: this._authAccountsRaw.length,
        selectedAuthAccountIds: []
      });
    },

    async loadAuthPolicy() {
      const result = await callFunction({ name: 'admin/auth/policy', data: { action: 'get' } });
      if (result.status !== 'success') throw new Error(result.message || '请稍后重试');
      this.setData({ authPolicy: mapPolicy(result.policy) });
    },

    toggleAuthClaimSelection(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const selected = new Set(this.data.selectedAuthClaimIds || []);
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      this.setData({ selectedAuthClaimIds: Array.from(selected) });
      this.applyAuthPersonnelFilter(this.data.authSearch);
    },

    toggleAuthEligibleSelection(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const selected = new Set(this.data.selectedAuthEligiblePersonIds || []);
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      this.setData({ selectedAuthEligiblePersonIds: Array.from(selected) });
      this.applyAuthPersonnelFilter(this.data.authSearch);
    },

    toggleAuthAccountSelection(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const selected = new Set(this.data.selectedAuthAccountIds || []);
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      this.setData({ selectedAuthAccountIds: Array.from(selected) });
      this.applyAuthPersonnelFilter(this.data.authSearch);
    },

    selectAllVisibleAuthClaims() {
      this.setData({ selectedAuthClaimIds: this.data.authPendingClaims.map((item) => item.id) });
      this.applyAuthPersonnelFilter(this.data.authSearch);
    },

    selectAllVisibleAuthEligible() {
      this.setData({ selectedAuthEligiblePersonIds: this.data.authEligiblePeople.map((item) => item.personId) });
      this.applyAuthPersonnelFilter(this.data.authSearch);
    },

    selectAllVisibleAuthAccounts() {
      const accountIds = this.data.authAccounts
        .filter((item) => item.accountStatus !== 'frozen')
        .map((item) => item.accountId);
      this.setData({ selectedAuthAccountIds: accountIds });
      this.applyAuthPersonnelFilter(this.data.authSearch);
    },

    clearAuthSelection() {
      this.setData({
        selectedAuthClaimIds: [],
        selectedAuthEligiblePersonIds: [],
        selectedAuthAccountIds: []
      });
      this.applyAuthPersonnelFilter(this.data.authSearch);
    },

    async issueAuthClaimCode(e) {
      const claimId = String(e.currentTarget.dataset.id || '');
      const name = String(e.currentTarget.dataset.name || '');
      if (!claimId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'claim-' + claimId });
      try {
        const result = await callFunction({ name: 'admin/auth/claims', data: {
          action: 'issue_code', claimId
        } });
        if (result.status !== 'success' || !result.verificationCode) {
          throw new Error(result.message || '未生成，请重试');
        }
        this._authPendingClaimsRaw = (this._authPendingClaimsRaw || []).map((item) =>
          item.id === claimId ? Object.assign({}, item, { hasActiveCode: true }) : item);
        this.setData({
          authIssuedCodes: [{ key: claimId, personName: name, code: result.verificationCode }],
          showAuthCodeDialog: true
        });
        this.applyAuthPersonnelFilter(this.data.authSearch);
      } catch (error) {
        showShortToast(getErrorText(error, '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async issueSelectedAuthClaimCodes() {
      const ids = this.data.selectedAuthClaimIds || [];
      if (!ids.length || this.data.authActionLoadingKey) return;
      const names = {};
      (this._authPendingClaimsRaw || []).forEach((item) => { names[item.id] = item.name; });
      this.setData({ authActionLoadingKey: 'claim-batch' });
      try {
        const batchResult = await runBatchedAuthAction({
          name: 'admin/auth/claims', action: 'issue_codes', idField: 'claimIds',
          ids, batchSize: 50, failureMessage: '未生成，请重试'
        });
        const issued = flattenIssued(batchResult).map((item) => ({
          key: item.claimId,
          personName: names[item.claimId] || '待认证人员',
          code: item.verificationCode
        }));
        const selected = new Set(issued.map((item) => item.key));
        this._authPendingClaimsRaw = (this._authPendingClaimsRaw || []).map((item) =>
          selected.has(item.id) ? Object.assign({}, item, { hasActiveCode: true }) : item);
        this.setData({ authIssuedCodes: issued, showAuthCodeDialog: true, selectedAuthClaimIds: [] });
        this.applyAuthPersonnelFilter(this.data.authSearch);
        if (batchResult.failures.length) showShortToast('部分人员未生成，请重试');
      } catch (error) {
        showShortToast(getErrorText(error, '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async issueSelectedInitialCodes() {
      const ids = this.data.selectedAuthEligiblePersonIds || [];
      if (!ids.length || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'invite-batch' });
      try {
        const batchResult = await runBatchedAuthAction({
          name: 'admin/auth/claims', action: 'issue_invites', idField: 'personIds',
          ids, batchSize: 100, failureMessage: '未生成，请重试',
          extraData: { organizationId: this.data.authScopeOrganizationId }
        });
        const issued = flattenIssued(batchResult).map((item) => ({
          key: item.inviteId || item.personId,
          personId: item.personId,
          personName: item.name,
          code: item.code
        }));
        const selected = new Set(issued.map((item) => item.personId));
        this._authEligiblePeopleRaw = (this._authEligiblePeopleRaw || []).map((item) =>
          selected.has(item.personId) ? Object.assign({}, item, { hasActiveInvite: true }) : item);
        this.setData({ authIssuedCodes: issued, showAuthCodeDialog: true, selectedAuthEligiblePersonIds: [] });
        this.applyAuthPersonnelFilter(this.data.authSearch);
        if (batchResult.failures.length) showShortToast('部分人员未生成，请重试');
      } catch (error) {
        showShortToast(getErrorText(error, '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async revokeSelectedInitialCodes() {
      const ids = this.data.selectedAuthEligiblePersonIds || [];
      if (!ids.length || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'invite-revoke' });
      try {
        const batchResult = await runBatchedAuthAction({
          name: 'admin/auth/claims', action: 'revoke_invites', idField: 'personIds',
          ids, batchSize: 100, failureMessage: '未撤销，请重试',
          extraData: { organizationId: this.data.authScopeOrganizationId }
        });
        const selected = new Set(batchResult.completedIds);
        this._authEligiblePeopleRaw = (this._authEligiblePeopleRaw || []).map((item) =>
          selected.has(item.personId) ? Object.assign({}, item, { hasActiveInvite: false }) : item);
        this.setData({ selectedAuthEligiblePersonIds: [] });
        this.applyAuthPersonnelFilter(this.data.authSearch);
        showShortToast(batchResult.failures.length ? '部分人员未撤销，请重试' : '已撤销',
          batchResult.failures.length ? 'none' : 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未撤销，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    openAuthRecoveryDialog(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const pending = (this._authRecoveryRequestsRaw || []).find((item) => item.id === id);
      if (pending) this.setData({ showAuthRecoveryDialog: true, pendingAuthRecovery: pending });
    },

    closeAuthRecoveryDialog() {
      if (this.data.authActionLoadingKey) return;
      this.setData({ showAuthRecoveryDialog: false, pendingAuthRecovery: null });
    },

    async approveAuthRecovery() {
      const pending = this.data.pendingAuthRecovery;
      if (!pending || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'recovery-' + pending.id });
      try {
        const result = await callFunction({ name: 'admin/auth/recoveries', data: {
          action: 'approve', recoveryRequestId: pending.id
        } });
        if (result.status !== 'success') throw new Error(result.message || '未完成，请重试');
        this._authRecoveryRequestsRaw = (this._authRecoveryRequestsRaw || [])
          .filter((item) => item.id !== pending.id);
        this.setData({ showAuthRecoveryDialog: false, pendingAuthRecovery: null });
        this.applyAuthPersonnelFilter(this.data.authSearch);
        showShortToast('已完成恢复', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未完成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async toggleAuthAccountFrozen(e) {
      const personId = String(e.currentTarget.dataset.id || '');
      const frozen = e.currentTarget.dataset.frozen === true
        || e.currentTarget.dataset.frozen === 'true';
      if (!personId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'freeze-' + personId });
      try {
        const result = await callFunction({ name: 'admin/auth/accounts', data: {
          action: frozen ? 'unfreeze' : 'freeze', personId
        } });
        if (result.status !== 'success') throw new Error(result.message || '未更新，请重试');
        const nextStatus = result.accountStatus || (frozen ? 'verified' : 'frozen');
        const rawIndex = (this._authAccountsRaw || []).findIndex((item) => item.personId === personId);
        const currentRow = rawIndex >= 0 ? this._authAccountsRaw[rawIndex] : null;
        const nextRow = currentRow ? decorateAccount(Object.assign({}, currentRow, {
          accountStatus: nextStatus
        })) : null;
        if (rawIndex >= 0 && nextRow) this._authAccountsRaw[rawIndex] = nextRow;
        const visibleIndex = (this.data.authAccounts || []).findIndex((item) => item.personId === personId);
        const updates = {};
        if (visibleIndex >= 0 && nextRow) updates['authAccounts[' + visibleIndex + ']'] = nextRow;
        if (nextStatus === 'frozen') {
          updates.selectedAuthAccountIds = (this.data.selectedAuthAccountIds || [])
            .filter((accountId) => accountId !== (currentRow && currentRow.accountId));
        }
        if (Object.keys(updates).length) this.setData(updates);
        showShortToast(frozen ? '已解除冻结' : '账号已冻结', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未更新，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async issueSelectedRecoveryCodes() {
      const ids = this.data.selectedAuthAccountIds || [];
      if (!ids.length || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'recovery-code' });
      try {
        const batchResult = await runBatchedAuthAction({
          name: 'admin/auth/recoveries', action: 'issue_codes', idField: 'accountIds',
          ids, batchSize: 100, failureMessage: '未生成，请重试',
          extraData: { organizationId: this.data.authScopeOrganizationId }
        });
        const issued = flattenIssued(batchResult).map((item) => ({
          key: item.accountId,
          personName: item.name,
          code: item.code
        }));
        const selected = new Set(issued.map((item) => item.key));
        this._authAccountsRaw = (this._authAccountsRaw || []).map((item) =>
          selected.has(item.accountId) ? Object.assign({}, item, { hasRecoveryCode: true }) : item);
        this.setData({ authIssuedCodes: issued, showAuthCodeDialog: true, selectedAuthAccountIds: [] });
        this.applyAuthPersonnelFilter(this.data.authSearch);
        if (batchResult.failures.length) showShortToast('部分人员未生成，请重试');
      } catch (error) {
        showShortToast(getErrorText(error, '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async revokeSelectedRecoveryCodes() {
      const ids = this.data.selectedAuthAccountIds || [];
      if (!ids.length || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'recovery-code-revoke' });
      try {
        const batchResult = await runBatchedAuthAction({
          name: 'admin/auth/recoveries', action: 'revoke_codes', idField: 'accountIds',
          ids, batchSize: 100, failureMessage: '未撤销，请重试',
          extraData: { organizationId: this.data.authScopeOrganizationId }
        });
        const selected = new Set(batchResult.completedIds);
        this._authAccountsRaw = (this._authAccountsRaw || []).map((item) =>
          selected.has(item.accountId) ? Object.assign({}, item, { hasRecoveryCode: false }) : item);
        this.setData({ selectedAuthAccountIds: [] });
        this.applyAuthPersonnelFilter(this.data.authSearch);
        showShortToast(batchResult.failures.length ? '部分人员未撤销，请重试' : '已撤销',
          batchResult.failures.length ? 'none' : 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未撤销，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    copyAuthIssuedCodes() {
      const content = (this.data.authIssuedCodes || [])
        .map((item) => item.personName + '：' + item.code).join('\n');
      if (content) wx.setClipboardData({ data: content });
    },

    closeAuthCodeDialog() {
      this.setData({ showAuthCodeDialog: false, authIssuedCodes: [] });
    },

    onAuthPolicySwitch(e) {
      const field = String(e.currentTarget.dataset.field || '');
      if (!field || !this.data.authPolicy) return;
      const authPolicy = Object.assign({}, this.data.authPolicy, { [field]: Boolean(e.detail.value) });
      this.setData({ authPolicy });
    },

    onAuthPolicyValue(e) {
      const field = String(e.currentTarget.dataset.field || '');
      if (!field || !this.data.authPolicy) return;
      const value = field === 'passphraseMinLength'
        ? Number(e.detail.value || 12)
        : String(e.detail.value || '');
      this.setData({ authPolicy: Object.assign({}, this.data.authPolicy, { [field]: value }) });
    },

    clearAuthPolicyDate(e) {
      const prefix = String(e.currentTarget.dataset.prefix || '');
      if (!prefix || !this.data.authPolicy) return;
      const authPolicy = Object.assign({}, this.data.authPolicy);
      authPolicy[prefix + 'Date'] = '';
      authPolicy[prefix + 'Time'] = '';
      this.setData({ authPolicy });
    },

    async saveAuthPolicy() {
      const policy = this.data.authPolicy;
      if (!policy || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'policy-save' });
      try {
        const result = await callFunction({ name: 'admin/auth/policy', data: Object.assign({}, policy, {
          claimStartsAt: combinePolicyDateTime(policy.claimStartsDate, policy.claimStartsTime),
          claimEndsAt: combinePolicyDateTime(policy.claimEndsDate, policy.claimEndsTime)
        }) });
        if (result.status !== 'success') throw new Error(result.message || '未保存，请重试');
        this.setData({ authPolicy: mapPolicy(result.policy || policy) });
        showShortToast('已保存', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未保存，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    }
  }
});
