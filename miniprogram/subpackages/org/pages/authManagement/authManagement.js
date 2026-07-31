const { callFunction, showShortToast, getErrorText, formatAuditTime } = require('../../../../utils/api');
const authContext = require('../../../../utils/authContext');
const orgSession = require('../../../../utils/orgSession');

const AUTH_EVENT_LABELS = {
  wechat_session_created: '微信登录',
  auth_context_activated: '切换身份',
  identity_claim_started: '提交身份认证',
  identity_code_issued: '生成个人认证码',
  identity_claim_verified: '完成身份认证',
  auth_policy_updated: '更新认证设置',
  recovery_credential_configured: '更新恢复方式',
  account_recovery_started: '申请更换微信',
  account_wechat_recovered: '完成更换微信',
  account_frozen: '冻结账号',
  account_unfrozen: '解除账号冻结',
  membership_assignment_created: '新增岗位',
  membership_assignment_updated: '更新岗位',
  membership_assignment_revoked: '删除岗位',
  account_binding_reset: '重置微信绑定'
};

function hasPermission(context, key) {
  const permissions = context && Array.isArray(context.permissions) ? context.permissions : [];
  return permissions.indexOf('*') >= 0 || permissions.indexOf(key) >= 0;
}

function formatRows(rows) {
  return (rows || []).map(function(item) {
    return Object.assign({}, item, {
      createdText: formatAuditTime(String(item.createdAt || '')),
      expiresText: formatAuditTime(String(item.expiresAt || ''))
    });
  });
}

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

Page({
  data: {
    tabs: [],
    activeTab: '',
    loading: false,
    claims: [],
    recoveries: [],
    accounts: [],
    auditEvents: [],
    policy: null,
    issuedCode: '',
    issuedPersonName: '',
    issuedCodes: [],
    selectedClaimIds: [],
    showCodeDialog: false,
    showRecoveryDialog: false,
    pendingRecovery: null,
    actionLoading: false,
    showGlobalScopeNotice: false,
    currentOrganizationName: ''
  },

  configureTabs() {
    const contextId = wx.getStorageSync('activeContextId') || '';
    const context = authContext.getContexts().find(function(item) {
      return item.contextId === contextId;
    }) || null;
    const tabs = [];
    if (hasPermission(context, 'auth.identity.verify')) tabs.push({ key: 'claims', label: '身份认证' });
    if (hasPermission(context, 'auth.accounts.recover')) {
      tabs.push({ key: 'recoveries', label: '账号恢复' });
      tabs.push({ key: 'accounts', label: '账号管理' });
    }
    if (hasPermission(context, 'auth.policy.manage')) tabs.push({ key: 'policy', label: '认证设置' });
    if (hasPermission(context, 'auth.accounts.audit')) tabs.push({ key: 'audit', label: '操作记录' });
    const activeTab = tabs.some(function(item) {
      return item.key === this.data.activeTab;
    }, this) ? this.data.activeTab : (tabs[0] ? tabs[0].key : '');
    this.setData({
      tabs: tabs,
      activeTab: activeTab,
      showGlobalScopeNotice: Boolean(
        context
        && context.adminLevel === 'super_admin'
        && context.identityScope === 'global'
      ),
      currentOrganizationName: wx.getStorageSync('activeOrgName') || ''
    });
  },

  onLoad() {
    this.configureTabs();
  },

  onShow() {
    if (orgSession.consume(this)) {
      orgSession.invalidateRequests(this);
      this.configureTabs();
    }
    if (this.data.activeTab) this.loadActiveTab();
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData({ activeTab: key });
    this.loadActiveTab();
  },

  async loadActiveTab() {
    if (this.data.loading) return;
    const request = orgSession.beginRequest(this, 'authManagement');
    this.setData({ loading: true });
    try {
      if (this.data.activeTab === 'claims') {
        const result = await callFunction({
          name: 'admin/auth/claims',
          data: { action: 'list' }
        });
        if (result.status !== 'success') throw new Error(result.message || '请稍后刷新');
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          claims: formatRows(result.list).map(function(item) {
            return Object.assign({}, item, { selected: false });
          }),
          selectedClaimIds: []
        });
      } else if (this.data.activeTab === 'recoveries') {
        const result = await callFunction({
          name: 'admin/auth/recoveries',
          data: { action: 'list' }
        });
        if (result.status !== 'success') throw new Error(result.message || '请稍后刷新');
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({ recoveries: formatRows(result.list) });
      } else if (this.data.activeTab === 'accounts') {
        const result = await callFunction({
          name: 'admin/auth/accounts',
          data: { action: 'list', limit: 200 }
        });
        if (result.status !== 'success') throw new Error(result.message || '请稍后刷新');
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          accounts: (result.list || []).map(function(item) {
            const labels = {
              verified: '正常',
              frozen: '已冻结',
              recovery_required: '待恢复'
            };
            return Object.assign({}, item, {
              statusLabel: labels[item.accountStatus] || item.accountStatus
            });
          })
        });
      } else if (this.data.activeTab === 'policy') {
        const result = await callFunction({
          name: 'admin/auth/policy',
          data: { action: 'get' }
        });
        if (result.status !== 'success') throw new Error(result.message || '请稍后刷新');
        if (!orgSession.isRequestCurrent(this, request)) return;
        const policy = result.policy || {};
        const starts = splitPolicyDateTime(policy.claim_starts_at);
        const ends = splitPolicyDateTime(policy.claim_ends_at);
        this.setData({
          policy: {
            initialClaimEnabled: Boolean(policy.initial_claim_enabled),
            allowRecoveryCode: Boolean(policy.allow_recovery_code),
            allowPassphrase: Boolean(policy.allow_passphrase),
            passphraseMinLength: Number(policy.passphrase_min_length || 12),
            claimStartsDate: starts.date,
            claimStartsTime: starts.time,
            claimEndsDate: ends.date,
            claimEndsTime: ends.time
          }
        });
      } else if (this.data.activeTab === 'audit') {
        const result = await callFunction({
          name: 'admin/auth/audit',
          data: { limit: 80 }
        });
        if (result.status !== 'success') throw new Error(result.message || '请稍后刷新');
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          auditEvents: (result.list || []).map(function(item) {
            return Object.assign({}, item, {
              createdText: formatAuditTime(String(item.createdAt || '')),
              eventTypeLabel: AUTH_EVENT_LABELS[item.eventType] || '安全操作'
            });
          })
        });
      }
    } catch (error) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      showShortToast(getErrorText(error, '请稍后刷新'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  async issueCode(e) {
    if (this.data.actionLoading) return;
    const claimId = e.currentTarget.dataset.id;
    const personName = e.currentTarget.dataset.name || '';
    this.setData({ actionLoading: true });
    try {
      const result = await callFunction({
        name: 'admin/auth/claims',
        data: { action: 'issue_code', claimId: claimId }
      });
      if (result.status !== 'success' || !result.verificationCode) {
        throw new Error(result.message || '未生成，请重试');
      }
      this.setData({
        issuedCode: result.verificationCode,
        issuedPersonName: personName,
        issuedCodes: [{
          claimId: claimId,
          personName: personName,
          verificationCode: result.verificationCode
        }],
        showCodeDialog: true
      });
      await this.loadActiveTab();
    } catch (error) {
      showShortToast(getErrorText(error, '未生成，请重试'));
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  copyIssuedCode() {
    const issuedCodes = this.data.issuedCodes || [];
    if (!issuedCodes.length) return;
    const content = issuedCodes.map(function(item) {
      return item.personName + '：' + item.verificationCode;
    }).join('\n');
    wx.setClipboardData({ data: content });
  },

  toggleClaimSelection(e) {
    const claimId = e.currentTarget.dataset.id;
    if (!claimId || this.data.actionLoading) return;
    const selected = new Set(this.data.selectedClaimIds || []);
    if (selected.has(claimId)) selected.delete(claimId);
    else selected.add(claimId);
    const selectedClaimIds = Array.from(selected);
    this.setData({
      selectedClaimIds: selectedClaimIds,
      claims: this.data.claims.map(function(item) {
        return Object.assign({}, item, { selected: selected.has(item.id) });
      })
    });
  },

  selectAllClaims() {
    if (this.data.actionLoading) return;
    const selectedClaimIds = this.data.claims.map(function(item) { return item.id; });
    this.setData({
      selectedClaimIds: selectedClaimIds,
      claims: this.data.claims.map(function(item) {
        return Object.assign({}, item, { selected: true });
      })
    });
  },

  clearClaimSelection() {
    if (this.data.actionLoading) return;
    this.setData({
      selectedClaimIds: [],
      claims: this.data.claims.map(function(item) {
        return Object.assign({}, item, { selected: false });
      })
    });
  },

  async issueSelectedCodes() {
    const claimIds = this.data.selectedClaimIds || [];
    if (!claimIds.length || this.data.actionLoading) return;
    const claimNames = {};
    this.data.claims.forEach(function(item) {
      claimNames[item.id] = item.name;
    });
    this.setData({ actionLoading: true });
    try {
      const result = await callFunction({
        name: 'admin/auth/claims',
        data: { action: 'issue_codes', claimIds: claimIds }
      });
      if (result.status !== 'success' || !Array.isArray(result.issued)
        || result.issued.length !== claimIds.length) {
        throw new Error(result.message || '未生成，请重试');
      }
      const issuedCodes = result.issued.map(function(item) {
        return {
          claimId: item.claimId,
          personName: claimNames[item.claimId] || '待认证人员',
          verificationCode: item.verificationCode
        };
      });
      this.setData({
        issuedCode: issuedCodes[0] ? issuedCodes[0].verificationCode : '',
        issuedPersonName: '',
        issuedCodes: issuedCodes,
        showCodeDialog: true
      });
      await this.loadActiveTab();
    } catch (error) {
      showShortToast(getErrorText(error, '未生成，请重试'));
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  closeCodeDialog() {
    this.setData({
      showCodeDialog: false,
      issuedCode: '',
      issuedPersonName: '',
      issuedCodes: [],
      selectedClaimIds: []
    });
  },

  openRecoveryDialog(e) {
    const id = e.currentTarget.dataset.id;
    const pending = this.data.recoveries.find(function(item) { return item.id === id; });
    if (!pending) return;
    this.setData({ showRecoveryDialog: true, pendingRecovery: pending });
  },

  closeRecoveryDialog() {
    if (this.data.actionLoading) return;
    this.setData({ showRecoveryDialog: false, pendingRecovery: null });
  },

  async approveRecovery() {
    const pending = this.data.pendingRecovery;
    if (!pending || this.data.actionLoading) return;
    this.setData({ actionLoading: true });
    try {
      const result = await callFunction({
        name: 'admin/auth/recoveries',
        data: { action: 'approve', recoveryRequestId: pending.id }
      });
      if (result.status !== 'success') throw new Error(result.message || '未通过，请重试');
      this.setData({ showRecoveryDialog: false, pendingRecovery: null });
      await this.loadActiveTab();
      showShortToast('账号恢复已完成', 'success');
    } catch (error) {
      showShortToast(getErrorText(error, '未通过，请重试'));
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  async toggleAccountFrozen(e) {
    if (this.data.actionLoading) return;
    const personId = e.currentTarget.dataset.id;
    const rawFrozen = e.currentTarget.dataset.frozen;
    const frozen = rawFrozen === true || rawFrozen === 'true';
    this.setData({ actionLoading: true });
    try {
      const result = await callFunction({
        name: 'admin/auth/accounts',
        data: {
          action: frozen ? 'unfreeze' : 'freeze',
          personId: personId
        }
      });
      if (result.status !== 'success') throw new Error(result.message || '未更新，请重试');
      showShortToast(result.message || '账号状态已更新', 'success');
      await this.loadActiveTab();
    } catch (error) {
      showShortToast(getErrorText(error, '未更新，请重试'));
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  onPolicySwitch(e) {
    const field = e.currentTarget.dataset.field;
    if (!field || !this.data.policy) return;
    const policy = Object.assign({}, this.data.policy);
    policy[field] = Boolean(e.detail.value);
    this.setData({ policy: policy });
  },

  onMinLengthInput(e) {
    const policy = Object.assign({}, this.data.policy);
    policy.passphraseMinLength = Number(e.detail.value || 12);
    this.setData({ policy: policy });
  },

  onPolicyDateChange(e) {
    const field = e.currentTarget.dataset.field;
    if (!field || !this.data.policy) return;
    const policy = Object.assign({}, this.data.policy);
    policy[field] = String(e.detail.value || '');
    this.setData({ policy: policy });
  },

  onPolicyTimeChange(e) {
    this.onPolicyDateChange(e);
  },

  clearPolicyTime(e) {
    const prefix = e.currentTarget.dataset.prefix;
    if (!prefix || !this.data.policy) return;
    const policy = Object.assign({}, this.data.policy);
    policy[prefix + 'Date'] = '';
    policy[prefix + 'Time'] = '';
    this.setData({ policy: policy });
  },

  async savePolicy() {
    if (!this.data.policy || this.data.actionLoading) return;
    this.setData({ actionLoading: true });
    try {
      const result = await callFunction({
        name: 'admin/auth/policy',
        data: Object.assign({}, this.data.policy, {
          claimStartsAt: combinePolicyDateTime(
            this.data.policy.claimStartsDate,
            this.data.policy.claimStartsTime
          ),
          claimEndsAt: combinePolicyDateTime(
            this.data.policy.claimEndsDate,
            this.data.policy.claimEndsTime
          )
        })
      });
      if (result.status !== 'success') throw new Error(result.message || '未保存，请重试');
      showShortToast('已保存', 'success');
      await this.loadActiveTab();
    } catch (error) {
      showShortToast(getErrorText(error, '未保存，请重试'));
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  noop() {}
});
