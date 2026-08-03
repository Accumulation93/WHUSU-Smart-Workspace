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
    authNotice: '',
    passwordStudentId: '',
    password: '',
    leavingPortal: false
  },

  onLoad() {
    this._loginSubmitting = false;
    this._portalNavigating = false;
    const authNotice = String(wx.getStorageSync('authLoginNotice') || '');
    if (authNotice) {
      wx.removeStorageSync('authLoginNotice');
      this.setData({ authNotice: authNotice });
    }
  },

  openPortal() {
    if (this._portalNavigating) return;
    this._portalNavigating = true;
    this.setData({
      sheetClass: 'sheet',
      stage: 'login',
      name: '',
      studentId: '',
      claimId: '',
      recoveryRequestId: '',
      verificationCode: '',
      recoveryCredential: '',
      rotatedRecoveryCode: '',
      leavingPortal: true
    }, () => {
      const navigate = () => {
        wx.redirectTo({
          url: '/pages/portal/portal',
          success: () => {
            this._portalNavigating = false;
          },
          fail: () => {
            this._portalNavigating = false;
            this.setData({ leavingPortal: false });
            showShortToast('页面未打开，请重试');
          }
        });
      };
      if (typeof wx.nextTick === 'function') wx.nextTick(navigate);
      else navigate();
    });
  },

  onName(e) {
    this.setData({ name: String(e.detail.value || '').trim() });
  },

  onStudentId(e) {
    this.setData({ studentId: String(e.detail.value || '').trim() });
  },

  onPasswordStudentId(e) {
    this.setData({ passwordStudentId: String(e.detail.value || '').trim() });
  },

  onPasswordInput(e) {
    this.setData({ password: String(e.detail.value || '') });
  },

  openPasswordLogin() {
    this.setData({ sheetClass: 'sheet sheet-show', stage: 'password', passwordStudentId: '', password: '' });
  },

  async onPasswordLogin() {
    if (this.data.loading) return;
    if (!this.data.passwordStudentId || !this.data.password) {
      showShortToast('请输入学号和口令');
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await callFunction({
        name: 'auth/password/session',
        data: {
          studentId: this.data.passwordStudentId,
          passphrase: this.data.password,
          preferredOrganizationId: wx.getStorageSync('lastOrganizationId') || '',
          preferredIdentityId: wx.getStorageSync('lastIdentityId') || ''
        }
      });
      if (!result || result.status !== 'login_success') throw new Error('登录信息不正确');
      authContext.applyAuthenticatedResult(result);
      this.openPortal();
    } catch (error) {
      showShortToast(getErrorText(error, '登录信息不正确'));
    } finally {
      this.setData({ loading: false });
    }
  },

  onShow() {
    this._portalNavigating = false;
    if (this.data.leavingPortal) this.setData({ leavingPortal: false });
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
        this.openPortal();
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
      const organization = this.data.organizations[this.data.organizationIndex];
      try {
        const inviteResult = await callFunction({
          name: 'auth/claims/redeem',
          data: {
            organizationId: organization && organization.id,
            name: this.data.name,
            studentId: this.data.studentId,
            code: this.data.verificationCode
          }
        });
        if (inviteResult && inviteResult.status === 'login_success') {
          authContext.applyAuthenticatedResult(inviteResult);
          this.openPortal();
          return;
        }
      } catch (_) {
        // 普通认领申请继续使用原有的申请码流程。
      }
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
      this.openPortal();
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
        this.openPortal();
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
    this.openPortal();
  }
});
