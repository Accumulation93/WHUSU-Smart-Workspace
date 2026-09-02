const { callFunction, showShortToast, getErrorText } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const authContext = require('../../../../utils/authContext');
const { login: copy } = require('../../../../locales/zh-CN/main');
const { getPasswordRequiredMessage } = require('./loginValidation');

const WECHAT_LOGIN_TIMEOUT_MS = 10000;
const PORTAL_NAVIGATION_TIMEOUT_MS = 8000;
const PORTAL_ROUTE = '/subpackages/main/pages/portal/portal';

function selectedOrganizationName(organizations, index) {
  const item = organizations[Number(index) || 0];
  return item ? item.name : '';
}

function requestWechatLoginCode() {
  return new Promise(function(resolve, reject) {
    let settled = false;
    const timer = setTimeout(function() {
      if (settled) return;
      settled = true;
      reject(new Error(copy.messages.loginUnavailable));
    }, WECHAT_LOGIN_TIMEOUT_MS);
    const finish = function(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    wx.login({
      success(result) {
        if (result && result.code) finish(resolve, result.code);
        else finish(reject, new Error(copy.messages.relogin));
      },
      fail() {
        finish(reject, new Error(copy.messages.relogin));
      }
    });
  });
}

Page({
  data: {
    copy: copy.view,
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
    recoveryMethodLabel: copy.messages.recoveryCode,
    recoveryMethods: [],
    recoveryMethodValues: [],
    recoveryCredential: '',
    rotatedRecoveryCode: '',
    claimAvailable: true,
    authNotice: '',
    passwordStudentId: '',
    password: ''
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: copy.navigationTitle });
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
      rotatedRecoveryCode: ''
    });

    let settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      if (this._portalNavigationTimer) {
        clearTimeout(this._portalNavigationTimer);
        this._portalNavigationTimer = null;
      }
      this._portalNavigating = false;
      if (!success) showShortToast(copy.messages.pageOpenFailed);
    };
    this._portalNavigationTimer = setTimeout(() => {
      finish(false);
    }, PORTAL_NAVIGATION_TIMEOUT_MS);

    // 登录成功后直接重建页面栈。路由不得依赖隐藏根节点后的 setData 渲染回调，
    // OpenHarmony 真机可能在根节点不可见后不再执行该回调，导致会话已建立却停在登录页。
    wx.reLaunch({
      url: PORTAL_ROUTE,
      success: () => finish(true),
      fail: () => finish(false)
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
    const validationMessage = getPasswordRequiredMessage(
      this.data.passwordStudentId,
      this.data.password,
      copy.messages
    );
    if (validationMessage) {
      showShortToast(validationMessage);
      return;
    }
    this.setData({ loading: true });
    try {
      const code = await requestWechatLoginCode();
      const result = await callFunction({
        name: 'auth/password/session',
        data: {
          studentId: this.data.passwordStudentId,
          passphrase: this.data.password,
          code,
        }
      });
      if (!result || result.status !== 'login_success') throw new Error(copy.messages.loginInvalid);
      authContext.applyAuthenticatedResult(result);
      this.openPortal();
    } catch (error) {
      showShortToast(getErrorText(error, copy.messages.loginInvalid));
    } finally {
      this.setData({ loading: false });
    }
  },

  onShow() {
    if (!this._portalNavigationTimer) this._portalNavigating = false;
  },

  onUnload() {
    if (this._portalNavigationTimer) {
      clearTimeout(this._portalNavigationTimer);
      this._portalNavigationTimer = null;
    }
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
      recoveryMethodLabel: selected === 'passphrase' ? copy.messages.recoveryPassphrase : copy.messages.recoveryCode,
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

  async onLogin() {
    if (this._loginSubmitting || this.data.loading) return;
    this._loginSubmitting = true;
    this.setData({ loading: true, authNotice: '' });
    try {
      const code = await requestWechatLoginCode();
      const result = await callFunction({
        name: 'auth/wechat/session',
        data: {
          code
        }
      });
      // 服务端返回后立即结束按钮忙碌态；完整登录状态同步提交后直接进入门户，
      // 不等待旧版鸿蒙基础库中不可靠的异步存储回调。
      this.setData({ loading: false });
      this.handleWechatSession(result);
    } catch (error) {
      const message = getErrorText(error, copy.messages.relogin);
      if (message) showShortToast(message);
    } finally {
      this._loginSubmitting = false;
      this.setData({ loading: false });
    }
  },

  handleWechatSession(result) {
    if (!result || !result.status) {
      showShortToast(copy.messages.relogin);
      return;
    }
    if (result.status === 'login_success') {
      try {
        authContext.applyAuthenticatedResult(result);
        this.openPortal();
      } catch (_) {
        showShortToast(copy.messages.relogin);
      }
      return;
    }
    if (result.status !== 'need_claim' || !result.bootstrapToken) {
      showShortToast(result.message || copy.messages.loginUnavailable);
      return;
    }
    const organizations = Array.isArray(result.organizations) ? result.organizations : [];
    const recoveryMethods = [];
    const recoveryMethodValues = [];
    if (result.recoveryMethods && result.recoveryMethods.recoveryCode) {
      recoveryMethods.push(copy.messages.recoveryCode);
      recoveryMethodValues.push('recovery_code');
    }
    if (result.recoveryMethods && result.recoveryMethods.passphrase) {
      recoveryMethods.push(copy.messages.recoveryPassphrase);
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
      showShortToast(copy.messages.profileRequired);
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
        showShortToast((result && result.message) || copy.messages.submitFailed);
        return;
      }
      this.setData({
        stage: 'verify',
        claimId: result.claimId,
        verificationCode: ''
      });
    } catch (error) {
      const message = getErrorText(error, copy.messages.submitFailed);
      if (message) showShortToast(message);
    } finally {
      this.setData({ loading: false });
    }
  },

  async verifyClaim() {
    if (this.data.loading) return;
    if (!this.data.claimId || !this.data.verificationCode) {
      showShortToast(copy.messages.verificationRequired);
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
        showShortToast((result && result.message) || copy.messages.verificationInvalid);
        return;
      }
      authContext.applyAuthenticatedResult(result);
      this.openPortal();
    } catch (error) {
      const message = getErrorText(error, copy.messages.verificationInvalid);
      if (message) showShortToast(message);
    } finally {
      this.setData({ loading: false });
    }
  },

  async startRecovery() {
    if (this.data.loading) return;
    const organization = this.data.organizations[this.data.organizationIndex];
    if (!organization || !this.data.name || !this.data.studentId) {
      showShortToast(copy.messages.profileRequired);
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
        showShortToast((result && result.message) || copy.messages.submitFailed);
        return;
      }
      this.setData({
        stage: this.data.recoveryMethodValues.length ? 'recoveryVerify' : 'recoveryPending',
        recoveryRequestId: result.recoveryRequestId,
        recoveryCredential: ''
      });
    } catch (error) {
      const message = getErrorText(error, copy.messages.submitFailed);
      if (message) showShortToast(message);
    } finally {
      this.setData({ loading: false });
    }
  },

  async completeRecovery() {
    if (this.data.loading) return;
    if (!this.data.recoveryCredential) {
      showShortToast(copy.messages.recoveryRequired);
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
        showShortToast((result && result.message) || copy.messages.recoveryInvalid);
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
      const message = getErrorText(error, copy.messages.recoveryInvalid);
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
