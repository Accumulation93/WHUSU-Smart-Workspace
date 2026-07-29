const { callFunction, showShortToast, getErrorText } = require('../../utils/api');
const orgSession = require('../../utils/orgSession');
const authContext = require('../../utils/authContext');

function selectedOrganizationName(organizations, index) {
  const item = organizations[Number(index) || 0];
  return item ? item.name : '';
}

Page({
  data: {
    loading: false,
    sheetClass: 'sheet',
    stage: 'login',
    organizations: [],
    organizationIndex: 0,
    organizationName: '',
    name: '',
    studentId: '',
    claimId: '',
    recoveryRequestId: '',
    verificationCode: '',
    recoveryMethod: 'recovery_code',
    recoveryMethodIndex: 0,
    recoveryMethodLabel: '账号恢复码',
    recoveryMethods: [],
    recoveryMethodValues: [],
    recoveryCredential: '',
    rotatedRecoveryCode: '',
    claimAvailable: true,
    authNotice: ''
  },

  onLoad() {
    this._loginSubmitting = false;
    const authNotice = String(wx.getStorageSync('authLoginNotice') || '');
    if (authNotice) {
      wx.removeStorageSync('authLoginNotice');
      this.setData({ authNotice: authNotice });
    }
  },

  onName(e) {
    this.setData({ name: String(e.detail.value || '').trim() });
  },

  onStudentId(e) {
    this.setData({ studentId: String(e.detail.value || '').trim() });
  },

  onVerificationCode(e) {
    this.setData({ verificationCode: String(e.detail.value || '').trim().toUpperCase() });
  },

  onRecoveryCredential(e) {
    this.setData({ recoveryCredential: String(e.detail.value || '') });
  },

  onOrganizationChange(e) {
    const index = Number(e.detail.value || 0);
    this.setData({
      organizationIndex: index,
      organizationName: selectedOrganizationName(this.data.organizations, index)
    });
  },

  onRecoveryMethodChange(e) {
    const selected = (this.data.recoveryMethodValues || [])[Number(e.detail.value || 0)] || 'recovery_code';
    this.setData({
      recoveryMethod: selected,
      recoveryMethodIndex: Number(e.detail.value || 0),
      recoveryMethodLabel: selected === 'passphrase' ? '恢复口令' : '账号恢复码',
      recoveryCredential: ''
    });
  },

  closeSheet() {
    if (this.data.loading) return;
    this.setData({
      sheetClass: 'sheet',
      stage: 'login',
      name: '',
      studentId: '',
      claimId: '',
      recoveryRequestId: '',
      verificationCode: '',
      recoveryCredential: ''
    });
  },

  onLogin() {
    if (this._loginSubmitting || this.data.loading) return;
    this._loginSubmitting = true;
    this.setData({ loading: true, authNotice: '' });
    wx.login({
      success: async (loginResult) => {
        try {
          const result = await callFunction({
            name: 'auth/wechat/session',
            data: {
              code: loginResult.code,
              preferredOrganizationId: wx.getStorageSync('lastOrganizationId') || '',
              preferredIdentityId: wx.getStorageSync('lastIdentityId') || ''
            }
          });
          this.handleWechatSession(result);
        } catch (error) {
          const message = getErrorText(error, '请重新微信登录');
          if (message) showShortToast(message);
        } finally {
          this._loginSubmitting = false;
          this.setData({ loading: false });
        }
      },
      fail: () => {
        this._loginSubmitting = false;
        this.setData({ loading: false });
        showShortToast('请重新微信登录');
      }
    });
  },

  handleWechatSession(result) {
    if (!result || !result.status) {
      showShortToast('请重新微信登录');
      return;
    }
    if (result.status === 'login_success') {
      try {
        authContext.applyAuthenticatedResult(result);
        wx.redirectTo({ url: '/pages/portal/portal' });
      } catch (_) {
        showShortToast('请重新微信登录');
      }
      return;
    }
    if (result.status !== 'need_claim' || !result.bootstrapToken) {
      showShortToast(result.message || '暂时无法登录');
      return;
    }
    const organizations = Array.isArray(result.organizations) ? result.organizations : [];
    const recoveryMethods = [];
    const recoveryMethodValues = [];
    if (result.recoveryMethods && result.recoveryMethods.recoveryCode) {
      recoveryMethods.push('账号恢复码');
      recoveryMethodValues.push('recovery_code');
    }
    if (result.recoveryMethods && result.recoveryMethods.passphrase) {
      recoveryMethods.push('恢复口令');
      recoveryMethodValues.push('passphrase');
    }
    orgSession.commitContext({
      token: result.bootstrapToken,
      contextId: '',
      role: '',
      orgId: '',
      orgName: ''
    });
    this.setData({
      stage: 'claim',
      sheetClass: 'sheet sheet-show',
      organizations: organizations,
      organizationIndex: 0,
      organizationName: selectedOrganizationName(organizations, 0),
      claimAvailable: result.claimAvailable !== false,
      recoveryMethods,
      recoveryMethodValues,
      recoveryMethod: recoveryMethodValues[0] || '',
      recoveryMethodIndex: 0,
      recoveryMethodLabel: recoveryMethods[0] || ''
    });
  },

  switchToRecovery() {
    this.setData({
      stage: 'recovery',
      claimId: '',
      verificationCode: '',
      recoveryCredential: ''
    });
  },

  switchToClaim() {
    this.setData({
      stage: 'claim',
      recoveryRequestId: '',
      recoveryCredential: ''
    });
  },

  async submitClaim() {
    if (this.data.loading) return;
    const organization = this.data.organizations[this.data.organizationIndex];
    if (!organization || !this.data.name || !this.data.studentId) {
      showShortToast('请填写组织、姓名和学号');
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await callFunction({
        name: 'auth/claims',
        data: {
          organizationId: organization.id,
          name: this.data.name,
          studentId: this.data.studentId
        }
      });
      if (!result || result.status !== 'accepted' || !result.claimId) {
        showShortToast((result && result.message) || '未提交，请重试');
        return;
      }
      this.setData({
        stage: 'verify',
        claimId: result.claimId,
        verificationCode: ''
      });
    } catch (error) {
      const message = getErrorText(error, '未提交，请重试');
      if (message) showShortToast(message);
    } finally {
      this.setData({ loading: false });
    }
  },

  async verifyClaim() {
    if (this.data.loading) return;
    if (!this.data.claimId || !this.data.verificationCode) {
      showShortToast('请输入个人认证码');
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await callFunction({
        name: 'auth/claims/verify',
        data: {
          claimId: this.data.claimId,
          verificationCode: this.data.verificationCode
        }
      });
      if (!result || result.status !== 'login_success') {
        showShortToast((result && result.message) || '请检查认证码');
        return;
      }
      authContext.applyAuthenticatedResult(result);
      wx.redirectTo({ url: '/pages/portal/portal' });
    } catch (error) {
      const message = getErrorText(error, '请检查认证码');
      if (message) showShortToast(message);
    } finally {
      this.setData({ loading: false });
    }
  },

  async startRecovery() {
    if (this.data.loading) return;
    const organization = this.data.organizations[this.data.organizationIndex];
    if (!organization || !this.data.name || !this.data.studentId) {
      showShortToast('请填写组织、姓名和学号');
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await callFunction({
        name: 'auth/recovery/start',
        data: {
          organizationId: organization.id,
          name: this.data.name,
          studentId: this.data.studentId
        }
      });
      if (!result || result.status !== 'accepted' || !result.recoveryRequestId) {
        showShortToast((result && result.message) || '未提交，请重试');
        return;
      }
      this.setData({
        stage: this.data.recoveryMethodValues.length ? 'recoveryVerify' : 'recoveryPending',
        recoveryRequestId: result.recoveryRequestId,
        recoveryCredential: ''
      });
    } catch (error) {
      const message = getErrorText(error, '未提交，请重试');
      if (message) showShortToast(message);
    } finally {
      this.setData({ loading: false });
    }
  },

  async completeRecovery() {
    if (this.data.loading) return;
    if (!this.data.recoveryCredential) {
      showShortToast('请输入恢复码或恢复口令');
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await callFunction({
        name: 'auth/recovery/complete',
        data: {
          recoveryRequestId: this.data.recoveryRequestId,
          method: this.data.recoveryMethod,
          credential: this.data.recoveryCredential
        }
      });
      if (!result || result.status !== 'login_success') {
        showShortToast((result && result.message) || '请检查恢复信息');
        return;
      }
      authContext.applyAuthenticatedResult(result);
      if (result.recoveryCode) {
        this.setData({
          stage: 'recoveryRotated',
          rotatedRecoveryCode: result.recoveryCode,
          recoveryCredential: ''
        });
      } else {
        wx.redirectTo({ url: '/pages/portal/portal' });
      }
    } catch (error) {
      const message = getErrorText(error, '请检查恢复信息');
      if (message) showShortToast(message);
    } finally {
      this.setData({ loading: false });
    }
  },

  copyRotatedRecoveryCode() {
    if (!this.data.rotatedRecoveryCode) return;
    wx.setClipboardData({ data: this.data.rotatedRecoveryCode });
  },

  finishRecoveredLogin() {
    wx.redirectTo({ url: '/pages/portal/portal' });
  }
});
