const { callFunction } = require('../../utils/api');
const STORAGE_KEY = 'roleProfiles';
const ACTIVE_ROLE_KEY = 'activeRole';
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
    subtitle: '授权微信登录后即可进入，首次使用需完善个人资料。',
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
    subtitle: '使用邀请码验证身份后进入管理后台。',
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
    adminLevel: user.adminLevel || ''
  };
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
    inviteCode: ''
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
      inviteCode: ''
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
      inviteCode: ''
    });
  },

  onLogin() {
    if (this.data.loading) {
      return;
    }

    const config = ROLE_MAP[this.data.activeRole];

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
            this.setData({ loading: false });
          }
        });
      },
      fail: () => {
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

    if (result.token) {
      wx.setStorageSync('token', result.token);
    }

    if (result.status === 'login_success') {
      this.saveProfile(role, result.user);
      // 保存组织信息
      if (result.availableOrgs && result.availableOrgs.length > 0) {
        wx.setStorageSync('availableOrgs', result.availableOrgs);
        // 使用系统默认组织作为活跃组织
        const defaultOrgId = wx.getStorageSync('activeOrgId') || '';
        const defaultOrg = result.availableOrgs.find(o => o.id === defaultOrgId);
        if (defaultOrg) {
          wx.setStorageSync('activeOrgName', defaultOrg.name);
        } else if (result.availableOrgs[0]) {
          wx.setStorageSync('activeOrgId', result.availableOrgs[0].id);
          wx.setStorageSync('activeOrgName', result.availableOrgs[0].name);
        }
      }
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      });
      wx.redirectTo({
        url: '/pages/portal/portal'
      });
      return;
    }

    if (result.status === 'auto_bind_available') {
      // 弹窗确认自动绑定
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
            // 用户拒绝自动绑定，尝试以原组织登录
            this.handleLoginResult(role, {
              status: 'login_success',
              token: result.token,
              user: result.candidateHrInfo ? {
                id: result.candidateHrInfo.id,
                hrId: result.candidateHrInfo.id,
                name: result.candidateHrInfo.name,
                studentId: result.candidateHrInfo.studentId
              } : null,
              availableOrgs: result.availableOrgs
            });
          }
        }
      });
      return;
    }

    if (result.status === 'need_bind') {
      this.setData({
        showBind: true,
        sheetClass: 'sheet sheet-show'
      });
      return;
    }

    wx.showToast({
      title: result.message || '暂时无法登录',
      icon: 'none'
    });
  },

  onBind() {
    if (this.data.loading) {
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
    }

    this.setData({ loading: true });

    callFunction({
      name: config.bindFunction,
      data: payload,
      success: (res) => {
        this.handleBindResult(activeRole, res.result);
      },
      fail: () => {
        wx.showToast({
          title: '提交失败',
          icon: 'error'
        });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  handleBindResult(role, result) {
    if (!result || !result.status) {
      wx.showToast({
        title: '提交异常',
        icon: 'error'
      });
      return;
    }

    if (result.token) {
      wx.setStorageSync('token', result.token);
    }

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
      const res = await callFunction({
        name: 'confirmAutoBind',
        data: {
          targetOrgId: result.targetOrg.id,
          hrId: result.candidateHrInfo.id
        }
      });
      if (res.status === 'success') {
        showShortToast('同步成功');
        // 以系统默认组织重新登录
        wx.setStorageSync('activeOrgId', result.targetOrg.id);
        wx.setStorageSync('activeOrgName', result.targetOrg.name);
        this.onLogin();
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
    wx.setStorageSync(ACTIVE_ROLE_KEY, role);
  }
});
