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

function decorateGovernanceRow(item, selected) {
  const hasGovernance = Boolean(item && item.auth);
  const auth = Object.assign({}, item && item.auth || {});
  const bindStatus = String(item && item.wxBindStatus || '');
  let accountState = 'unbound';
  let accountStateText = '未绑定';
  let accountStateClass = 'unbound-chip';
  if (auth.status === 'frozen') {
    accountState = 'frozen';
    accountStateText = '冻结中';
    accountStateClass = 'frozen-chip';
  } else if (auth.status === 'recovery_required') {
    accountState = 'recovery_required';
    accountStateText = '待恢复';
    accountStateClass = 'pending-chip';
  } else if (bindStatus === 'bound') {
    accountState = 'bound';
    accountStateText = '已绑定';
    accountStateClass = 'current-chip';
  } else if (bindStatus === 'pending_activation' || auth.hasActiveBinding) {
    accountState = 'pending_activation';
    accountStateText = '待激活';
    accountStateClass = 'activation-chip';
  }
  const verificationText = auth.hasActiveClaimCode || auth.hasActiveInvite
    ? '认证码有效'
    : auth.hasPendingClaim
      ? '待生成认证码'
      : auth.hasBindingHistory
        ? '已完成认证'
        : '尚未生成认证码';
  const recoveryText = auth.hasRecoveryCode
    ? '恢复码有效'
    : item && item.accountId
      ? '尚未生成恢复码'
      : '认证后可设置恢复码';
  return Object.assign({}, item, {
    auth,
    governanceAvailable: hasGovernance,
    selected: Boolean(selected),
    accountState,
    accountStateText,
    accountStateClass,
    verificationText,
    recoveryText,
    showVerificationStatus: accountState === 'unbound',
    canIssueVerification: Boolean(hasGovernance && (auth.hasPendingClaim || !auth.hasBindingHistory)),
    canRevokeVerification: Boolean(hasGovernance && (auth.hasActiveClaimCode || auth.hasActiveInvite)),
    canIssueRecovery: Boolean(hasGovernance && item && item.accountId && auth.status !== 'frozen'),
    canRevokeRecovery: Boolean(hasGovernance && item && item.accountId && auth.hasRecoveryCode && auth.status !== 'frozen'),
    canUnbindWechat: Boolean(hasGovernance && item && item.personId && (bindStatus === 'bound' || auth.hasActiveBinding)),
    canSelectForAuth: Boolean(hasGovernance && (
      (auth.hasPendingClaim || !auth.hasBindingHistory)
      || (item && item.accountId && auth.status !== 'frozen')
    ))
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
    selectedHrMemberIds: [],
    hrMemberSelectionCount: 0,
    hrFilteredSelectableCount: 0,
    hrCanSelectAll: false,
    hrCanInvertSelection: false,
    hrCanClearSelection: false,
    hrCanIssueVerification: false,
    hrCanRevokeVerification: false,
    hrCanIssueRecovery: false,
    hrCanRevokeRecovery: false,
    authPolicy: null,
    authPolicyLoading: false,
    authPolicyLoadFailed: false,
    authIssuedCodes: [],
    showAuthCodeDialog: false,
    showAuthRecoveryDialog: false,
    pendingAuthRecovery: null,
    authMemberConfirmVisible: false,
    authMemberConfirmAction: '',
    authMemberConfirmTitle: '',
    authMemberConfirmMessage: '',
    authMemberConfirmPersonId: '',
    authMemberConfirmHrId: '',
    authMemberConfirmName: '',
    authMemberConfirmFrozen: false,
    authMemberConfirmSessionId: '',
    authMemberConfirmActionLabel: '',
    detailHrSecurity: null,
    detailHrPassphraseInput: '',
    showDetailPassphraseForm: false
  },

  methods: {
    initializeAuthPersonnel() {
      const tabs = [];
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
      return currentTab;
    },

    async loadHrGovernanceRows() {
      if (!this.data.canVerifyIdentity && !this.data.canRecoverAccounts) return new Map();
      const organizationId = wx.getStorageSync('activeOrgId') || '';
      const result = await callFunction({ name: 'listHrGovernance', data: { organizationId } });
      if (result.status !== 'success') throw new Error(result.message || '请稍后重试');
      const selected = new Set(this.data.selectedHrMemberIds || []);
      const rows = (result.rows || []).map((item) => decorateGovernanceRow(item, selected.has(String(item.hrId || item.id || ''))));
      this._hrGovernanceRows = rows;
      this._hrGovernanceByHrId = new Map(rows.map((item) => [String(item.hrId || item.id || ''), item]));
      return this._hrGovernanceByHrId;
    },

    mergeHrGovernanceRows(profileRows, governanceByHrId) {
      const selected = new Set(this.data.selectedHrMemberIds || []);
      return (profileRows || []).map((row) => {
        const governance = governanceByHrId && governanceByHrId.get(String(row.id || ''));
        if (!governance) return this.applyHrGovernancePermissions(
          decorateGovernanceRow(row, selected.has(String(row.id || '')))
        );
        return this.applyHrGovernancePermissions(decorateGovernanceRow(Object.assign({}, row, governance, {
          id: row.id,
          hrId: row.id,
          name: row.name,
          studentId: row.studentId
        }), selected.has(String(row.id || ''))));
      });
    },

    applyHrGovernancePermissions(row) {
      const canSelect = Boolean(row && (
        (this.data.canVerifyIdentity && (row.canIssueVerification || row.canRevokeVerification))
        || (this.data.canRecoverAccounts && (row.canIssueRecovery || row.canRevokeRecovery))
      ));
      return Object.assign({}, row, { canSelectForAuth: canSelect });
    },

    buildHrMemberActionState(rows, selectedIds) {
      const visibleRows = Array.isArray(rows) ? rows : [];
      const selectableIds = new Set(visibleRows
        .filter((item) => item.canSelectForAuth)
        .map((item) => String(item.id || ''))
        .filter(Boolean));
      const selected = Array.from(new Set((selectedIds || this.data.selectedHrMemberIds || [])
        .map(String)
        .filter((id) => selectableIds.has(id))));
      const selectedSet = new Set(selected);
      const selectedRows = visibleRows.filter((item) => selectedSet.has(String(item.id || '')));
      return {
        selectedHrMemberIds: selected,
        hrMemberSelectionCount: selected.length,
        hrFilteredSelectableCount: selectableIds.size,
        hrCanSelectAll: selectableIds.size > 0 && selected.length < selectableIds.size,
        hrCanInvertSelection: selectableIds.size > 0,
        hrCanClearSelection: selected.length > 0,
        hrCanIssueVerification: selectedRows.some((item) => item.canIssueVerification),
        hrCanRevokeVerification: selectedRows.some((item) => item.canRevokeVerification),
        hrCanIssueRecovery: selectedRows.some((item) => item.canIssueRecovery),
        hrCanRevokeRecovery: selectedRows.some((item) => item.canRevokeRecovery)
      };
    },

    getHrGovernanceRow(hrId) {
      const target = String(hrId || this.data.detailHrId || '');
      if (!target) return null;
      return (this._hrProfileRawRows || []).find((item) => String(item.id || '') === target) || null;
    },

    toggleHrMemberSelection(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      if (!hrId) return;
      const row = this.getHrGovernanceRow(hrId);
      if (!row || !row.canSelectForAuth) return;
      const selected = new Set(this.data.selectedHrMemberIds || []);
      if (selected.has(hrId)) selected.delete(hrId); else selected.add(hrId);
      this.setData({ selectedHrMemberIds: Array.from(selected) });
      this.refreshHrMemberSelection();
    },

    selectAllFilteredHrMembers() {
      const ids = (this._hrProfileFilteredRows || [])
        .filter((item) => item.canSelectForAuth)
        .map((item) => String(item.id || ''))
        .filter(Boolean);
      this.setData({ selectedHrMemberIds: ids });
      this.refreshHrMemberSelection();
    },

    invertFilteredHrMembers() {
      const selected = new Set(this.data.selectedHrMemberIds || []);
      const ids = (this._hrProfileFilteredRows || [])
        .filter((item) => item.canSelectForAuth)
        .map((item) => String(item.id || ''))
        .filter(Boolean)
        .filter((id) => !selected.has(id));
      this.setData({ selectedHrMemberIds: ids });
      this.refreshHrMemberSelection();
    },

    clearHrMemberSelection() {
      this.setData({ selectedHrMemberIds: [] });
      this.refreshHrMemberSelection();
    },

    refreshHrMemberSelection() {
      const actionState = this.buildHrMemberActionState(
        this._hrProfileFilteredRows || [],
        this.data.selectedHrMemberIds || []
      );
      const selected = new Set(actionState.selectedHrMemberIds);
      const apply = (row) => Object.assign({}, row, { selected: selected.has(String(row.id || '')) });
      this._hrProfileRawRows = (this._hrProfileRawRows || []).map(apply);
      this._hrProfileFilteredRows = (this._hrProfileFilteredRows || []).map(apply);
      this.setData(Object.assign({}, actionState, {
        hrProfileRows: (this.data.hrProfileRows || []).map(apply)
      }));
    },

    getSelectedHrGovernanceRows() {
      const selected = new Set(this.data.selectedHrMemberIds || []);
      return (this._hrProfileFilteredRows || []).filter((item) => selected.has(String(item.id || '')));
    },

    patchHrGovernance(personId, patch, rowPatch) {
      this.patchHrGovernanceBatch([{ personId, patch, rowPatch }]);
    },

    patchHrGovernanceBatch(entries) {
      const patchByPerson = new Map();
      (entries || []).forEach((entry) => {
        const personId = String(entry && entry.personId || '');
        if (!personId) return;
        const previous = patchByPerson.get(personId) || { patch: {}, rowPatch: {} };
        patchByPerson.set(personId, {
          patch: Object.assign({}, previous.patch, entry.patch || {}),
          rowPatch: Object.assign({}, previous.rowPatch, entry.rowPatch || {})
        });
      });
      if (!patchByPerson.size) return;
      const apply = (row) => {
        const target = patchByPerson.get(String(row.personId || ''));
        if (!target) return row;
        return this.applyHrGovernancePermissions(decorateGovernanceRow(Object.assign({}, row, target.rowPatch, {
          auth: Object.assign({}, row.auth || {}, target.patch)
        }), row.selected));
      };
      this._hrProfileRawRows = (this._hrProfileRawRows || []).map(apply);
      this._hrProfileFilteredRows = (this._hrProfileFilteredRows || []).map(apply);
      const actionState = this.buildHrMemberActionState(
        this._hrProfileFilteredRows,
        this.data.selectedHrMemberIds || []
      );
      const detail = this.data.detailHrGovernance;
      const updates = Object.assign({}, actionState, {
        hrProfileRows: (this.data.hrProfileRows || []).map(apply)
      });
      if (detail && patchByPerson.has(String(detail.personId || ''))) {
        updates.detailHrGovernance = apply(detail);
      }
      this.setData(updates);
    },

    async issueHrMemberVerificationCode(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      const row = (this._hrProfileRawRows || []).find((item) => String(item.id || '') === hrId);
      if (!row || !row.personId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'member-verify-' + hrId });
      try {
        let issued;
        if (row.auth && row.auth.pendingClaimId) {
          const result = await callFunction({ name: 'admin/auth/claims', data: {
            action: 'issue_code', claimId: row.auth.pendingClaimId
          } });
          if (result.status !== 'success' || !result.verificationCode) throw new Error(result.message || '未生成，请重试');
          issued = { key: row.auth.pendingClaimId, personName: row.name, code: result.verificationCode };
          this.patchHrGovernance(row.personId, { hasActiveClaimCode: true });
        } else {
          const result = await callFunction({ name: 'admin/auth/claims', data: {
            action: 'issue_invites', personIds: [row.personId], organizationId: row.organizationId || wx.getStorageSync('activeOrgId') || ''
          } });
          const item = result.status === 'success' && result.issued && result.issued[0];
          if (!item || !item.code) throw new Error(result.message || '未生成，请重试');
          issued = { key: item.inviteId || row.personId, personName: row.name, code: item.code };
          this.patchHrGovernance(row.personId, { hasActiveInvite: true });
        }
        this.setData({ authIssuedCodes: [issued], showAuthCodeDialog: true });
      } catch (error) {
        showShortToast(getErrorText(error, '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async issueSelectedHrVerificationCodes() {
      const rows = this.getSelectedHrGovernanceRows().filter((item) => item.canIssueVerification);
      if (!rows.length || this.data.authActionLoadingKey) return;
      const claimRows = rows.filter((item) => item.auth && item.auth.pendingClaimId);
      const inviteRows = rows.filter((item) => item.personId && item.auth && !item.auth.pendingClaimId && !item.auth.hasBindingHistory);
      if (!claimRows.length && !inviteRows.length) return showShortToast('所选成员无需生成认证码');
      this.setData({ authActionLoadingKey: 'member-verify-batch' });
      try {
        const issued = [];
        const patches = [];
        if (claimRows.length) {
          const names = new Map(claimRows.map((item) => [item.auth.pendingClaimId, item]));
          const result = await runBatchedAuthAction({
            name: 'admin/auth/claims', action: 'issue_codes', idField: 'claimIds',
            ids: claimRows.map((item) => item.auth.pendingClaimId), batchSize: 50,
            failureMessage: '部分认证码未生成'
          });
          flattenIssued(result).forEach((item) => {
            const row = names.get(item.claimId);
            if (row) {
              issued.push({ key: item.claimId, personName: row.name, code: item.verificationCode });
              patches.push({ personId: row.personId, patch: { hasActiveClaimCode: true } });
            }
          });
        }
        if (inviteRows.length) {
          const result = await runBatchedAuthAction({
            name: 'admin/auth/claims', action: 'issue_invites', idField: 'personIds',
            ids: inviteRows.map((item) => item.personId), batchSize: 100,
            failureMessage: '部分认证码未生成',
            extraData: { organizationId: wx.getStorageSync('activeOrgId') || '' }
          });
          const rowsByPerson = new Map(inviteRows.map((item) => [String(item.personId), item]));
          flattenIssued(result).forEach((item) => {
            const row = rowsByPerson.get(String(item.personId));
            if (row) {
              issued.push({ key: item.inviteId || item.personId, personName: row.name, code: item.code });
              patches.push({ personId: row.personId, patch: { hasActiveInvite: true } });
            }
          });
        }
        if (!issued.length) throw new Error('未生成，请重试');
        this.patchHrGovernanceBatch(patches);
        this.setData({ authIssuedCodes: issued, showAuthCodeDialog: true, selectedHrMemberIds: [] });
        this.refreshHrMemberSelection();
      } catch (error) {
        showShortToast(getErrorText(error, '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async revokeHrMemberVerificationCode(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      const row = (this._hrProfileRawRows || []).find((item) => String(item.id || '') === hrId);
      if (!row || !row.personId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'member-verify-revoke-' + hrId });
      try {
        const isClaimCode = Boolean(row.auth && row.auth.pendingClaimId && row.auth.hasActiveClaimCode);
        const result = await callFunction({ name: 'admin/auth/claims', data: isClaimCode ? {
          action: 'revoke_codes', claimIds: [row.auth.pendingClaimId]
        } : {
          action: 'revoke_invites', personIds: [row.personId], organizationId: row.organizationId || wx.getStorageSync('activeOrgId') || ''
        } });
        if (result.status !== 'success') throw new Error(result.message || '未撤销，请重试');
        this.patchHrGovernance(row.personId, isClaimCode
          ? { hasActiveClaimCode: false }
          : { hasActiveInvite: false });
        showShortToast('认证码已撤销', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未撤销，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async revokeSelectedHrVerificationCodes() {
      const rows = this.getSelectedHrGovernanceRows().filter((item) => item.canRevokeVerification);
      if (!rows.length || this.data.authActionLoadingKey) return showShortToast('所选成员暂无可撤销的认证码');
      this.setData({ authActionLoadingKey: 'member-verify-revoke-batch' });
      try {
        const claimRows = rows.filter((item) => item.auth && item.auth.pendingClaimId && item.auth.hasActiveClaimCode);
        const inviteRows = rows.filter((item) => item.personId && item.auth && item.auth.hasActiveInvite);
        const results = [];
        const patches = [];
        if (claimRows.length) {
          const result = await runBatchedAuthAction({
            name: 'admin/auth/claims', action: 'revoke_codes', idField: 'claimIds',
            ids: claimRows.map((item) => item.auth.pendingClaimId), batchSize: 50,
            failureMessage: '部分认证码未撤销'
          });
          results.push(result);
          const byClaim = new Map(claimRows.map((item) => [String(item.auth.pendingClaimId), item]));
          result.completedIds.forEach((claimId) => {
            const row = byClaim.get(String(claimId));
            if (row) patches.push({ personId: row.personId, patch: { hasActiveClaimCode: false } });
          });
        }
        if (inviteRows.length) {
          const result = await runBatchedAuthAction({
            name: 'admin/auth/claims', action: 'revoke_invites', idField: 'personIds',
            ids: inviteRows.map((item) => item.personId), batchSize: 100,
            failureMessage: '部分认证码未撤销',
            extraData: { organizationId: wx.getStorageSync('activeOrgId') || '' }
          });
          results.push(result);
          const byPerson = new Map(inviteRows.map((item) => [String(item.personId), item]));
          result.completedIds.forEach((personId) => {
            const row = byPerson.get(String(personId));
            if (row) patches.push({ personId: row.personId, patch: { hasActiveInvite: false } });
          });
        }
        this.patchHrGovernanceBatch(patches);
        const failureCount = results.reduce((sum, result) => sum + result.failures.length, 0);
        this.setData({ selectedHrMemberIds: [] });
        this.refreshHrMemberSelection();
        showShortToast(failureCount ? '部分认证码未撤销' : '认证码已撤销', failureCount ? 'none' : 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未撤销，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async issueHrMemberRecoveryCode(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      const row = (this._hrProfileRawRows || []).find((item) => String(item.id || '') === hrId);
      if (!row || !row.accountId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'member-recovery-' + hrId });
      try {
        const result = await callFunction({ name: 'admin/auth/recoveries', data: {
          action: 'issue_codes', accountIds: [row.accountId], organizationId: row.organizationId || wx.getStorageSync('activeOrgId') || ''
        } });
        const item = result.status === 'success' && result.issued && result.issued[0];
        if (!item || !item.code) throw new Error(result.message || '未生成，请重试');
        this.patchHrGovernance(row.personId, { hasRecoveryCode: true });
        this.setData({ authIssuedCodes: [{ key: row.accountId, personName: row.name, code: item.code }], showAuthCodeDialog: true });
      } catch (error) {
        showShortToast(getErrorText(error, '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async changeSelectedHrRecoveryCodes(revoke) {
      const rows = this.getSelectedHrGovernanceRows().filter((item) => (
        revoke ? item.canRevokeRecovery : item.canIssueRecovery
      ));
      if (!rows.length || this.data.authActionLoadingKey) return showShortToast('所选成员暂无可用账号');
      this.setData({ authActionLoadingKey: revoke ? 'member-recovery-revoke' : 'member-recovery-batch' });
      try {
        const result = await runBatchedAuthAction({
          name: 'admin/auth/recoveries', action: revoke ? 'revoke_codes' : 'issue_codes', idField: 'accountIds',
          ids: rows.map((item) => item.accountId), batchSize: 100,
          failureMessage: revoke ? '部分恢复码未撤销' : '部分恢复码未生成',
          extraData: { organizationId: wx.getStorageSync('activeOrgId') || '' }
        });
        const byAccount = new Map(rows.map((item) => [String(item.accountId), item]));
        const patches = [];
        if (revoke) {
          result.completedIds.forEach((id) => {
            const row = byAccount.get(String(id));
            if (row) patches.push({ personId: row.personId, patch: { hasRecoveryCode: false } });
          });
          showShortToast(result.failures.length ? '部分恢复码未撤销' : '恢复码已撤销', result.failures.length ? 'none' : 'success');
        } else {
          const issued = flattenIssued(result).map((item) => {
            const row = byAccount.get(String(item.accountId));
            if (row) patches.push({ personId: row.personId, patch: { hasRecoveryCode: true } });
            return { key: item.accountId, personName: item.name || row && row.name || '成员', code: item.code };
          });
          if (!issued.length) throw new Error('未生成，请重试');
          this.setData({ authIssuedCodes: issued, showAuthCodeDialog: true });
        }
        this.patchHrGovernanceBatch(patches);
        this.setData({ selectedHrMemberIds: [] });
        this.refreshHrMemberSelection();
      } catch (error) {
        showShortToast(getErrorText(error, revoke ? '未撤销，请重试' : '未生成，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    issueSelectedHrRecoveryCodes() {
      return this.changeSelectedHrRecoveryCodes(false);
    },

    revokeSelectedHrRecoveryCodes() {
      return this.changeSelectedHrRecoveryCodes(true);
    },

    async revokeHrMemberRecoveryCode(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      const row = (this._hrProfileRawRows || []).find((item) => String(item.id || '') === hrId);
      if (!row || !row.accountId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'member-recovery-revoke-' + hrId });
      try {
        const result = await callFunction({ name: 'admin/auth/recoveries', data: {
          action: 'revoke_codes',
          accountIds: [row.accountId],
          organizationId: row.organizationId || wx.getStorageSync('activeOrgId') || ''
        } });
        if (result.status !== 'success') throw new Error(result.message || '未撤销，请重试');
        this.patchHrGovernance(row.personId, { hasRecoveryCode: false });
        showShortToast('恢复码已撤销', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未撤销，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
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

    async loadAuthPersonnel(force, tabOverride) {
      const tab = tabOverride || this.data.activeAuthPersonnelTab;
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
      const governanceResult = await callFunction({ name: 'listHrGovernance', data: { organizationId } });
      const results = await Promise.all([
        callFunction({ name: 'admin/auth/claims', data: {
          action: 'list', limit: DIRECTORY_LIMIT, organizationId
        } })
      ]);
      if (results[0].status !== 'success' || governanceResult.status !== 'success') {
        throw new Error(results[0].message || '请稍后重试');
      }
      this._authPendingClaimsRaw = (results[0].list || []).map(decorateClaim);
      this._authEligiblePeopleRaw = uniquePeople((governanceResult.rows || [])
        .filter((item) => item.auth && !item.auth.hasBindingHistory)
        .map((item) => Object.assign({}, item, {
          hasActiveInvite: Boolean(item.auth.hasActiveInvite),
          selected: false
        })));
      this.setData({
        authPendingClaimTotal: this._authPendingClaimsRaw.length,
        authEligiblePeopleTotal: this._authEligiblePeopleRaw.length,
        selectedAuthClaimIds: [],
        selectedAuthEligiblePersonIds: []
      });
    },

    async loadAuthAccounts() {
      const organizationId = this.data.authScopeOrganizationId;
      const governanceResult = await callFunction({ name: 'listHrGovernance', data: { organizationId } });
      const results = await Promise.all([
        callFunction({ name: 'admin/auth/recoveries', data: {
          action: 'list', limit: DIRECTORY_LIMIT, organizationId
        } }),
        callFunction({ name: 'admin/auth/accounts', data: {
          action: 'list', limit: DIRECTORY_LIMIT, organizationId
        } })
      ]);
      if (results[0].status !== 'success' || results[1].status !== 'success' || governanceResult.status !== 'success') {
        throw new Error(results[0].message || results[1].message || '请稍后重试');
      }
      this._authRecoveryRequestsRaw = (results[0].list || []).map(decorateClaim);
      const legacyByPerson = new Map((results[1].list || []).map((item) => [String(item.personId || ''), item]));
      this._authAccountsRaw = (governanceResult.rows || []).filter((item) => item.accountId).map((item) => {
        const legacy = legacyByPerson.get(String(item.personId || '')) || {};
        const auth = item.auth || {};
        return decorateAccount(Object.assign({}, legacy, item, {
          accountId: item.accountId || legacy.accountId,
          accountStatus: auth.status || legacy.accountStatus,
          hasRecoveryCode: Boolean(auth.hasRecoveryCode),
          activeSessionCount: Number(auth.activeSessionCount || legacy.activeSessionCount || 0),
          hasPendingClaim: Boolean(auth.hasPendingClaim || legacy.hasPendingClaim),
          hasActiveInvite: Boolean(auth.hasActiveInvite || legacy.hasActiveInvite)
        }));
      });
      this.setData({
        authRecoveryRequestTotal: this._authRecoveryRequestsRaw.length,
        authAccountTotal: this._authAccountsRaw.length,
        selectedAuthAccountIds: []
      });
    },

    async loadAuthPolicy() {
      if (this.data.authPolicyLoading) return;
      this.setData({ authPolicyLoading: true, authPolicyLoadFailed: false });
      try {
        const result = await callFunction({ name: 'admin/auth/policy', data: { action: 'get' } });
        if (result.status !== 'success') throw new Error(result.message || '请稍后重试');
        this.setData({ authPolicy: mapPolicy(result.policy), authPolicyLoadFailed: false });
      } catch (error) {
        this.setData({ authPolicyLoadFailed: true });
        throw error;
      } finally {
        this.setData({ authPolicyLoading: false });
      }
    },

    retryAuthPolicy() {
      this.loadAuthPolicy().catch(() => {
        showShortToast('认证设置暂时无法加载');
      });
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
      const pending = (this._authRecoveryRequestsRaw || []).find((item) => item.id === id)
        || (() => {
          const row = (this._hrProfileRawRows || []).find((item) => item.auth && item.auth.pendingRecoveryId === id);
          return row ? Object.assign({}, row, { id }) : null;
        })();
      if (pending) this.setData({ showAuthRecoveryDialog: true, pendingAuthRecovery: pending });
    },

    closeAuthRecoveryDialog() {
      if (this.data.authActionLoadingKey) return;
      this.setData({ showAuthRecoveryDialog: false, pendingAuthRecovery: null });
    },

    async loadDetailHrSecurity(personId) {
      if (!personId || this.data.authActionLoadingKey) return;
      try {
        const result = await callFunction({ name: 'admin/auth/security', data: { personId } });
        if (!result || result.status !== 'success') {
          this.setData({ detailHrSecurity: null });
          return;
        }
        const sessions = (result.sessions || []).map(function(item) {
          return Object.assign({}, item, {
            lastSeenText: item.lastSeenAt ? formatAuditTime(item.lastSeenAt) : '最近使用时间未知'
          });
        });
        this.setData({
          detailHrSecurity: {
            account: result.account || null,
            bindingStatus: result.bindingStatus || '',
            passphraseSet: Boolean(result.passphraseSet),
            sessions
          }
        });
      } catch (error) {
        this.setData({ detailHrSecurity: null });
      }
    },

    toggleDetailPassphraseForm() {
      this.setData({
        showDetailPassphraseForm: !this.data.showDetailPassphraseForm,
        detailHrPassphraseInput: ''
      });
    },

    onDetailPassphraseInput(e) {
      this.setData({ detailHrPassphraseInput: String(e.detail.value || '') });
    },

    async saveDetailMemberPassphrase() {
      const security = this.data.detailHrSecurity;
      const value = this.data.detailHrPassphraseInput;
      const personId = String(this.data.detailHrGovernance && this.data.detailHrGovernance.personId || '');
      if (!security || !personId || this.data.authActionLoadingKey) return;
      if (!value) {
        showShortToast('请输入新口令');
        return;
      }
      this.setData({ authActionLoadingKey: 'member-passphrase-save' });
      try {
        const result = await callFunction({ name: 'admin/auth/security/passphrase', data: { personId, value } });
        if (!result || result.status !== 'success') {
          throw new Error((result && result.message) || '未保存，请重试');
        }
        this.setData({
          showDetailPassphraseForm: false,
          detailHrPassphraseInput: '',
          'detailHrSecurity.passphraseSet': true
        });
        showShortToast('口令已更新', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '未保存，请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    requestMemberDeviceRevoke(e) {
      const sessionId = String(e.currentTarget.dataset.sessionId || '');
      const security = this.data.detailHrSecurity;
      const row = this.getHrGovernanceRow(this.data.detailHrId);
      if (!sessionId || !security || !row || this.data.authActionLoadingKey) return;
      const session = (security.sessions || []).find(function(item) { return item.id === sessionId; });
      this.setData({
        authMemberConfirmVisible: true,
        authMemberConfirmAction: 'device-revoke',
        authMemberConfirmActionLabel: '退出',
        authMemberConfirmTitle: '退出设备',
        authMemberConfirmMessage: '将退出该成员的登录设备：' + String(session && session.deviceLabel || '该设备'),
        authMemberConfirmPersonId: String(row.personId || ''),
        authMemberConfirmHrId: String(this.data.detailHrId || ''),
        authMemberConfirmName: String(row.name || '该成员'),
        authMemberConfirmSessionId: sessionId,
        authMemberConfirmFrozen: false
      });
    },

    requestMemberPassphraseClear() {
      const row = this.getHrGovernanceRow(this.data.detailHrId);
      if (!row || !this.data.detailHrSecurity || this.data.authActionLoadingKey) return;
      this.setData({
        authMemberConfirmVisible: true,
        authMemberConfirmAction: 'passphrase-clear',
        authMemberConfirmActionLabel: '清除',
        authMemberConfirmTitle: '清除登录口令',
        authMemberConfirmMessage: '清除后，该成员需要重新设置口令才能使用口令登录。',
        authMemberConfirmPersonId: String(row.personId || ''),
        authMemberConfirmHrId: String(this.data.detailHrId || ''),
        authMemberConfirmName: String(row.name || '该成员'),
        authMemberConfirmSessionId: '',
        authMemberConfirmFrozen: false
      });
    },

    async revokeMemberDevice(sessionId) {
      const row = this.getHrGovernanceRow(this.data.detailHrId);
      const personId = String(row && row.personId || '');
      if (!sessionId || !personId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'member-device-revoke' });
      try {
        const result = await callFunction({
          name: 'admin/auth/security/sessions/revoke',
          data: { personId, sessionId }
        });
        if (!result || result.status !== 'success') {
          throw new Error((result && result.message) || '请重试');
        }
        this.setData({
          'detailHrSecurity.sessions': (this.data.detailHrSecurity.sessions || []).filter(function(item) { return item.id !== sessionId; }),
          'detailHrGovernance.auth.activeSessionCount': Math.max(Number(this.data.detailHrGovernance.auth.activeSessionCount || 0) - 1, 0)
        });
        showShortToast('该设备已退出', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    async clearMemberPassphrase() {
      const row = this.getHrGovernanceRow(this.data.detailHrId);
      const personId = String(row && row.personId || '');
      if (!personId || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'member-passphrase-clear' });
      try {
        const result = await callFunction({ name: 'admin/auth/security/passphrase/revoke', data: { personId } });
        if (!result || result.status !== 'success') {
          throw new Error((result && result.message) || '请重试');
        }
        this.setData({ 'detailHrSecurity.passphraseSet': false });
        showShortToast('登录口令已清除', 'success');
      } catch (error) {
        showShortToast(getErrorText(error, '请重试'));
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    requestAuthAccountFreeze(e) {
      const personId = String(e.currentTarget.dataset.id || '');
      const frozen = e.currentTarget.dataset.frozen === true
        || e.currentTarget.dataset.frozen === 'true';
      if (!personId || this.data.authActionLoadingKey) return;
      if (frozen) {
        this.toggleAuthAccountFrozen(e);
        return;
      }
      const row = this.getHrGovernanceRow(e.currentTarget.dataset.hrId);
      this.setData({
        authMemberConfirmVisible: true,
        authMemberConfirmAction: 'freeze',
        authMemberConfirmActionLabel: '冻结',
        authMemberConfirmTitle: '冻结账号',
        authMemberConfirmMessage: '冻结后，该成员将无法继续使用工作台。',
        authMemberConfirmPersonId: personId,
        authMemberConfirmHrId: String(e.currentTarget.dataset.hrId || ''),
        authMemberConfirmName: String(row && row.name || '该成员'),
        authMemberConfirmFrozen: false
      });
    },

    requestHrWechatUnbind(e) {
      const hrId = String(e.currentTarget.dataset.hrId || this.data.detailHrId || '');
      const row = this.getHrGovernanceRow(hrId);
      if (!row || !row.canUnbindWechat || this.data.authActionLoadingKey) return;
      this.setData({
        authMemberConfirmVisible: true,
        authMemberConfirmAction: 'unbind',
        authMemberConfirmActionLabel: '解绑',
        authMemberConfirmTitle: '解绑微信',
        authMemberConfirmMessage: '解绑后，原微信和已登录设备将退出，该成员需重新恢复账号。',
        authMemberConfirmPersonId: String(row.personId || ''),
        authMemberConfirmHrId: hrId,
        authMemberConfirmName: String(row.name || '该成员'),
        authMemberConfirmFrozen: false
      });
    },

    closeAuthMemberConfirm() {
      if (this.data.authActionLoadingKey) return;
      this.setData({
        authMemberConfirmVisible: false,
        authMemberConfirmAction: '',
        authMemberConfirmActionLabel: '',
        authMemberConfirmTitle: '',
        authMemberConfirmMessage: '',
        authMemberConfirmPersonId: '',
        authMemberConfirmHrId: '',
        authMemberConfirmName: '',
        authMemberConfirmFrozen: false,
        authMemberConfirmSessionId: ''
      });
    },

    confirmAuthMemberAction() {
      const action = this.data.authMemberConfirmAction;
      const personId = this.data.authMemberConfirmPersonId;
      const hrId = this.data.authMemberConfirmHrId;
      if (!action || this.data.authActionLoadingKey) return;
      this.setData({ authMemberConfirmVisible: false });
      if (action === 'freeze') {
        this.toggleAuthAccountFrozen({
          currentTarget: { dataset: { id: personId, hrId, frozen: false } }
        });
      } else if (action === 'unbind') {
        this.unbindHrWechat({ currentTarget: { dataset: { hrId } } });
      } else if (action === 'device-revoke') {
        this.revokeMemberDevice(this.data.authMemberConfirmSessionId);
      } else if (action === 'passphrase-clear') {
        this.clearMemberPassphrase();
      }
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
        this.patchHrGovernance(pending.personId, {
          pendingRecoveryId: '',
          status: 'verified',
          hasActiveBinding: true,
          activeSessionCount: 0
        }, { wxBindStatus: 'bound' });
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
        this.patchHrGovernance(personId, nextStatus === 'frozen'
          ? { status: nextStatus, activeSessionCount: 0 }
          : { status: nextStatus });
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
      const value = String(e.detail.value || '');
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
