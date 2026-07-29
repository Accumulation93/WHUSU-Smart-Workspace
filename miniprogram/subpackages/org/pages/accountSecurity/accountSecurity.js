const { callFunction, showShortToast, getErrorText, formatAuditTime } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');

function decorateSessions(sessions) {
  return (sessions || []).map(function(item) {
    return Object.assign({}, item, {
      roleLabel: item.role === 'admin' ? '管理身份' : '普通岗位',
      lastSeenText: formatAuditTime(String(item.lastSeenAt || '')),
      createdText: formatAuditTime(String(item.createdAt || ''))
    });
  });
}

Page({
  data: {
    loading: true,
    account: null,
    sessions: [],
    allowRecoveryCode: false,
    allowPassphrase: false,
    passphraseMinLength: 12,
    passphrase: '',
    recoveryCode: '',
    savingCredential: false,
    revokingSessionId: ''
  },

  onShow() {
    if (orgSession.consume(this)) orgSession.invalidateRequests(this);
    this.loadSecurity();
  },

  async loadSecurity() {
    const request = orgSession.beginRequest(this, 'accountSecurity');
    this.setData({ loading: true });
    try {
      const result = await callFunction({ name: 'auth/security', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (!result || result.status !== 'success') {
        showShortToast((result && result.message) || '安全信息加载失败');
        return;
      }
      const policy = result.policy || {};
      this.setData({
        account: result.account || null,
        sessions: decorateSessions(result.sessions),
        allowRecoveryCode: Boolean(policy.allowRecoveryCode),
        allowPassphrase: Boolean(policy.allowPassphrase),
        passphraseMinLength: Number(policy.passphraseMinLength || 12)
      });
    } catch (error) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      showShortToast(getErrorText(error, '安全信息加载失败'));
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  onPassphraseInput(e) {
    this.setData({ passphrase: String(e.detail.value || '') });
  },

  async rotateRecoveryCode() {
    if (this.data.savingCredential) return;
    this.setData({ savingCredential: true });
    try {
      const result = await callFunction({
        name: 'auth/security/recovery-credential',
        data: { method: 'recovery_code' }
      });
      if (!result || result.status !== 'success' || !result.recoveryCode) {
        showShortToast((result && result.message) || '恢复码生成失败');
        return;
      }
      this.setData({ recoveryCode: result.recoveryCode });
    } catch (error) {
      showShortToast(getErrorText(error, '恢复码生成失败'));
    } finally {
      this.setData({ savingCredential: false });
    }
  },

  copyRecoveryCode() {
    if (!this.data.recoveryCode) return;
    wx.setClipboardData({ data: this.data.recoveryCode });
  },

  hideRecoveryCode() {
    this.setData({ recoveryCode: '' });
  },

  async savePassphrase() {
    if (this.data.savingCredential) return;
    if (this.data.passphrase.length < this.data.passphraseMinLength) {
      showShortToast('恢复口令长度不足');
      return;
    }
    this.setData({ savingCredential: true });
    try {
      const result = await callFunction({
        name: 'auth/security/recovery-credential',
        data: { method: 'passphrase', value: this.data.passphrase }
      });
      if (!result || result.status !== 'success') {
        showShortToast((result && result.message) || '恢复口令保存失败');
        return;
      }
      this.setData({ passphrase: '' });
      showShortToast('恢复口令已更新', 'success');
    } catch (error) {
      showShortToast(getErrorText(error, '恢复口令保存失败'));
    } finally {
      this.setData({ savingCredential: false });
    }
  },

  async revokeSession(e) {
    const sessionId = e.currentTarget.dataset.id;
    if (!sessionId || this.data.revokingSessionId) return;
    this.setData({ revokingSessionId: sessionId });
    try {
      const result = await callFunction({
        name: 'auth/security/sessions/revoke',
        data: { sessionId: sessionId }
      });
      if (!result || (result.status !== 'success' && result.status !== 'not_found')) {
        showShortToast((result && result.message) || '设备撤销失败');
        return;
      }
      await this.loadSecurity();
      showShortToast('设备会话已撤销', 'success');
    } catch (error) {
      showShortToast(getErrorText(error, '设备撤销失败'));
    } finally {
      this.setData({ revokingSessionId: '' });
    }
  }
});
