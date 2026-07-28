const { callFunction, showShortToast, getErrorText } = require('../../utils/api');
const STORAGE_KEY = 'roleProfiles';
const orgSession = require('../../utils/orgSession');
const DEVICE_OPENID_KEY = 'deviceOpenid';

function getDeviceOpenid() {
  let id = wx.getStorageSync(DEVICE_OPENID_KEY);
  if (!id) {
    id = 'DEV_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    wx.setStorageSync(DEVICE_OPENID_KEY, id);
  }
  return id;
}

const ROLE_MAP = {
  user: {
    key: 'user',
    badge: '普通用户',
    loginFunction: 'userLogin',
    bindFunction: 'bindUserInfo',
    title: '普通用户登录',
    subtitle: '首次使用需补充资料',
    loginButtonText: '普通用户登录',
    bindTitle: '补充普通用户信息',
    bindButtonText: '确认提交'
  },
  admin: {
    key: 'admin',
    badge: '管理员',
    loginFunction: 'adminLogin',
    bindFunction: 'bindAdminInfo',
    title: '管理员登录',
    subtitle: '首次使用需邀请码',
    loginButtonText: '管理员登录',
    bindTitle: '补充管理员信息',
    bindButtonText: '确认提交'
  }
};

function normalizeProfile(user) {
  return {
    id: user.id || user.hrId || '',
    hrId: user.hrId || '',
    name: user.name || '',
    studentId: user.studentId || '',
    departmentId: user.departmentId || '',
    department: user.department || '',
    identityId: user.identityId || '',
    identity: user.identity || '',
    workGroupId: user.workGroupId || '',
    workGroup: user.workGroup || '',
    adminLevel: user.adminLevel || '',
    permissions: user.permissions || {},
    permissionKeys: user.permissionKeys || [],
    canAccessPermissionSystem: Boolean(user.canAccessPermissionSystem)
  };
}

function saveAvailableOrganizations(role, organizations) {
  const list = Array.isArray(organizations) ? organizations : [];
  wx.setStorageSync('availableOrgs', list);
  wx.setStorageSync('availableOrgs:' + role, list);
}

Page({
  data: {
    activeRole: 'user',
    roleTitle: ROLE_MAP.user.title,
    roleSubtitle: ROLE_MAP.user.subtitle,
    roleBadge: ROLE_MAP.user.badge,
    loginButtonText: ROLE_MAP.user.loginButtonText,
    bindTitle: ROLE_MAP.user.bindTitle,
    bindButtonText: ROLE_MAP.user.bindButtonText,
    showInviteCode: false,
    sheetClass: 'sheet',
    showBind: false,
    loading: false,
    name: '',
    studentId: '',
    inviteCode: '',
    bindingContext: '',
    bindingOrgName: ''
  },

  onLoad() {
    this.syncRoleCopy(this.data.activeRole);
  },

  onShow() {
    // Always default to user tab on login page — prevents regular users
    // from accidentally landing on admin tab due to a stored active role.
    if (this.data.activeRole !== 'user') {
      this.syncRoleCopy('user');
    }
  },

  syncRoleCopy(role) {
    const currentRole = ROLE_MAP[role] ? role : 'user';
    const config = ROLE_MAP[currentRole];

    this.setData({
      activeRole: currentRole,
      roleTitle: config.title,
      roleSubtitle: config.subtitle,
      roleBadge: config.badge,
      loginButtonText: config.loginButtonText,
      bindTitle: config.bindTitle,
      bindButtonText: config.bindButtonText,
      showInviteCode: currentRole === 'admin',
      sheetClass: 'sheet',
      showBind: false,
      name: '',
      studentId: '',
      inviteCode: '',
      bindingContext: '',
      bindingOrgName: ''
    });
  },

  switchRole(e) {
    const { role } = e.currentTarget.dataset;
    if (!role || role === this.data.activeRole || !ROLE_MAP[role]) {
      return;
    }

    this.syncRoleCopy(role);
  },

  onName(e) {
    this.setData({ name: e.detail.value.trim() });
  },

  onStudentId(e) {
    this.setData({ studentId: e.detail.value.trim() });
  },

  onInviteCode(e) {
    this.setData({ inviteCode: e.detail.value.trim().toUpperCase() });
  },

  closeBind() {
    this.setData({
      showBind: false,
      sheetClass: 'sheet',
      name: '',
      studentId: '',
      inviteCode: '',
      bindingContext: '',
      bindingOrgName: ''
    });
  },

  onLogin() {
    if (this._loginSubmitting || this.data.loading) {
      return;
    }

    const config = ROLE_MAP[this.data.activeRole];

    this._loginSubmitting = true;
    this.setData({ loading: true });

    wx.login({
      success: (loginRes) => {
        callFunction({
          name: config.loginFunction,
          data: { code: loginRes.code, deviceOpenid: getDeviceOpenid() },
          success: (res) => {
            this.handleLoginResult(config.key, res.result);
          },
          fail: () => {
            wx.showToast({
              title: '登录失败',
              icon: 'error'
            });
          },
          complete: () => {
            this._loginSubmitting = false;
            this.setData({ loading: false });
          }
        });
      },
      fail: () => {
        this._loginSubmitting = false;
        this.setData({ loading: false });
        wx.showToast({
          title: '微信登录失败',
          icon: 'error'
        });
      }
    });
  },

  handleLoginResult(role, result) {
    if (!result || !result.status) {
      wx.showToast({
        title: '登录异常',
        icon: 'error'
      });
      return;
    }

    if (result.status === 'need_bind' || result.status === 'auto_bind_available') {
      if (!result.token) {
        wx.showToast({
          title: '登录凭证异常',
          icon: 'none'
        });
        return;
      }
      // Binding is an authenticated continuation of login. Persist the JWT
      // before opening the sheet/modal so bind requests cannot be sent without it.
      orgSession.commitContext({
        token: result.token,
        role,
        orgId: '',
        orgName: ''
      });
    }

    if (result.status === 'login_success') {
      this.saveProfile(role, result.user);
      // 保存组织信息 — 后端决定默认组织（activeOrg 优先于 availableOrgs[0]）
      let defaultOrg = null;
      if (result.availableOrgs && result.availableOrgs.length > 0) {
        saveAvailableOrganizations(role, result.availableOrgs);
        // 使用后端返回的 activeOrg，确保与系统默认组织一致
        defaultOrg = result.activeOrg || result.availableOrgs[0];
      }
      orgSession.commitContext({
        token: result.token || '',
        role,
        orgId: defaultOrg ? defaultOrg.id : '',
        orgName: defaultOrg ? defaultOrg.name : ''
      });
      wx.showToast({ title: '登录成功', icon: 'success' });
      wx.redirectTo({ url: '/pages/portal/portal' });
      return;
    }

    if (result.status === 'auto_bind_available') {
      const sourceName = result.sourceOrg ? result.sourceOrg.name : '其他组织';
      const targetName = result.targetOrg ? result.targetOrg.name : '当前组织';
      wx.showModal({
        title: '检测到已有绑定',
        content: '检测到您在「' + sourceName + '」已有绑定记录，是否同步到「' + targetName + '」？',
        confirmText: '确认同步',
        cancelText: '暂不同步',
        success: async (modalRes) => {
          if (modalRes.confirm) {
            await this.confirmAutoBind(result);
          } else {
            // 用户拒绝自动绑定 — 使用原组织信息直接进入
            saveAvailableOrganizations(role, result.availableOrgs || []);
            const fallbackOrg = result.availableOrgs && result.availableOrgs[0]
              ? result.availableOrgs[0]
              : null;
            orgSession.commitContext({
              token: result.token || '',
              role,
              orgId: fallbackOrg ? fallbackOrg.id : '',
              orgName: fallbackOrg ? fallbackOrg.name : ''
            });
            if (result.sourceUser) {
              this.saveProfile(role, result.sourceUser);
            }
            wx.redirectTo({ url: '/pages/portal/portal' });
          }
        }
      });
      return;
    }

    if (result.status === 'need_bind') {
      this.setData({
        showBind: true,
        sheetClass: 'sheet sheet-show',
        bindingContext: result.bindingContext || '',
        bindingOrgName: result.bindingOrg ? result.bindingOrg.name : ''
      });
      return;
    }

    wx.showToast({
      title: result.message || '暂时无法登录',
      icon: 'none'
    });
  },

  async onBind() {
    if (this._bindSubmitting || this.data.loading) {
      return;
    }

    const { name, studentId, inviteCode, activeRole } = this.data;

    if (!name || !studentId) {
      wx.showToast({
        title: '请填姓名和学号',
        icon: 'none'
      });
      return;
    }

    if (activeRole === 'admin' && !inviteCode) {
      wx.showToast({
        title: '请输入邀请码',
        icon: 'none'
      });
      return;
    }

    const config = ROLE_MAP[activeRole];
    const payload = {
      name,
      studentId
    };

    if (activeRole === 'admin') {
      payload.inviteCode = inviteCode;
    } else {
      payload.bindingContext = this.data.bindingContext;
    }

    this._bindSubmitting = true;
    this.setData({ loading: true });

    try {
      let result;
      try {
        result = await callFunction({
          name: config.bindFunction,
          data: payload
        });
      } catch (error) {
        if (!error || error.status !== 'auth_failed') throw error;
        const refreshed = await this.refreshLoginState(activeRole);
        if (!refreshed || refreshed.status !== 'need_bind' || !refreshed.token) {
          if (refreshed && refreshed.status) {
            this.handleLoginResult(activeRole, refreshed);
            return;
          }
          throw error;
        }
        if (activeRole === 'user') {
          payload.bindingContext = refreshed.bindingContext || '';
        }
        result = await callFunction({
          name: config.bindFunction,
          data: payload
        });
      }

      // 普通用户填写资料可能超过五分钟。挑战过期时重新验证微信身份，
      // 获取新的单次绑定上下文并仅自动重试一次，避免降低服务端安全时限。
      if (activeRole === 'user' && result && result.status === 'challenge_expired') {
        const refreshed = await this.refreshUserLoginState();
        if (refreshed && refreshed.status === 'need_bind' && refreshed.bindingContext) {
          payload.bindingContext = refreshed.bindingContext;
          result = await callFunction({
            name: config.bindFunction,
            data: payload
          });
        } else {
          result = refreshed || result;
        }
      }

      this.handleBindResult(activeRole, result);
    } catch (error) {
      const message = getErrorText(error, '提交失败');
      if (message) showShortToast(message);
    } finally {
      this._bindSubmitting = false;
      this.setData({ loading: false });
    }
  },

  refreshLoginState(role) {
    const currentRole = ROLE_MAP[role] ? role : 'user';
    return new Promise((resolve) => {
      wx.login({
        success: async (loginRes) => {
          try {
            const result = await callFunction({
              name: ROLE_MAP[currentRole].loginFunction,
              data: { code: loginRes.code, deviceOpenid: getDeviceOpenid() }
            });
            if (result && (result.status === 'need_bind' || result.status === 'auto_bind_available')) {
              if (!result.token) {
                resolve({ status: 'auth_failed', message: '登录凭证异常，请重试' });
                return;
              }
              orgSession.commitContext({
                token: result.token,
                role: currentRole,
                orgId: '',
                orgName: ''
              });
            }
            if (currentRole === 'user' && result && result.status === 'need_bind' && result.bindingContext) {
              this.setData({
                bindingContext: result.bindingContext,
                bindingOrgName: result.bindingOrg ? result.bindingOrg.name : this.data.bindingOrgName
              });
            }
            resolve(result);
          } catch (_) {
            resolve({ status: 'error', message: '刷新绑定验证失败，请重试' });
          }
        },
        fail: () => {
          resolve({ status: 'auth_failed', message: '微信登录失败，请重试' });
        }
      });
    });
  },

  refreshUserLoginState() {
    return this.refreshLoginState('user');
  },

  handleBindResult(role, result) {
    if (!result || !result.status) {
      wx.showToast({
        title: '提交异常',
        icon: 'error'
      });
      return;
    }

    if (result.token) orgSession.commitContext({ token: result.token });

    if (result.status === 'success') {
      this.setData({ showBind: false, sheetClass: 'sheet', loading: false });
      wx.showToast({ title: result.message || '绑定成功', icon: 'success' });
      this.onLogin();
      return;
    }

    if (result.status === 'invalid_params') {
      wx.showToast({
        title: '请补全信息',
        icon: 'none'
      });
      return;
    }

    wx.showToast({
      title: result.message || '信息不匹配',
      icon: 'none'
    });
  },

  async confirmAutoBind(result) {
    try {
      let loginState = result;
      let res = await callFunction({
        name: 'confirmAutoBind',
        data: {
          autoBindChallenge: loginState.autoBindChallenge
        }
      });

      if (res.status === 'challenge_expired') {
        const refreshed = await this.refreshUserLoginState();
        if (refreshed && refreshed.status === 'auto_bind_available' && refreshed.autoBindChallenge) {
          loginState = refreshed;
          res = await callFunction({
            name: 'confirmAutoBind',
            data: {
              autoBindChallenge: loginState.autoBindChallenge
            }
          });
        } else if (refreshed && (refreshed.status === 'login_success' || refreshed.status === 'need_bind')) {
          this.handleLoginResult('user', refreshed);
          return;
        } else {
          showShortToast((refreshed && refreshed.message) || res.message || '同步失败');
          return;
        }
      }

      if (res.status === 'success') {
        showShortToast('同步成功');
        // 绑定成功 → 使用系统默认组织重新进入
        const activeOrg = res.activeOrg || loginState.targetOrg;
        orgSession.commitContext({
          token: loginState.token || '',
          role: this.data.activeRole,
          orgId: activeOrg.id,
          orgName: activeOrg.name || loginState.targetOrg.name
        });
        saveAvailableOrganizations(this.data.activeRole, res.availableOrgs || loginState.availableOrgs || []);
        if (res.user) {
          this.saveProfile(this.data.activeRole, res.user);
        }
        wx.redirectTo({ url: '/pages/portal/portal' });
      } else {
        showShortToast(res.message || '同步失败');
      }
    } catch (_) {
      showShortToast('同步请求失败');
    }
  },

  saveProfile(role, user) {
    const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
    roleProfiles[role] = normalizeProfile(user);
    wx.setStorageSync(STORAGE_KEY, roleProfiles);
  }
});
