const localeCopy = require('../../locales/zh-CN/generated/components/workspace-hero/workspace-hero');
const eventBus = require('../../utils/eventBus');
const { navigateToTrustedRoute } = require('../../utils/trustedNavigation');

function getActiveWorkContext() {
  const activeContextId = String(wx.getStorageSync('activeContextId') || '');
  const workContexts = wx.getStorageSync('authWorkContexts');
  if (!activeContextId || !Array.isArray(workContexts)) return {};
  return workContexts.find(function(item) {
    return String(item && item.contextId || '') === activeContextId;
  }) || {};
}

function getWorkContextName(profile, role, workContext) {
  if (!profile) return '';
  const context = workContext || {};
  if (role === 'admin') {
    return context.name
      || (profile.adminLevel === 'super_admin' ? localeCopy.copy_ccd219e5f1 : localeCopy.copy_c01a9aef59);
  }
  return profile.assignmentLabel || context.assignmentLabel || context.name || '';
}

function getProfile() {
  const role = String(wx.getStorageSync('activeRole') || '');
  const profiles = wx.getStorageSync('roleProfiles') || {};
  const account = wx.getStorageSync('accountProfile') || {};
  const profile = profiles[role] || {};
  const workContext = getActiveWorkContext();
  return {
    role: role,
    name: profile.name || account.name || '',
    workContextName: getWorkContextName(profile, role, workContext),
    organizationName: String(wx.getStorageSync('activeOrgName') || '')
  };
}

Component({
  properties: {
    appName: {
      type: String,
      value: localeCopy.copy_0cb5ae8471
    },
    pageName: {
      type: String,
      value: ''
    },
    tone: {
      type: String,
      value: 'blue'
    }
  },

  data: {
    localeCopy,
    personName: '',
    identityName: '',
    identityDetail: '',
    organizationName: '',
    signedIn: false
  },

  lifetimes: {
    attached: function () {
      this._refreshBound = this.refresh.bind(this);
      eventBus.on('auth:selectionChanged', this._refreshBound);
      eventBus.on('auth:contextChanged', this._refreshBound);
      eventBus.on('org:changed', this._refreshBound);
      this.refresh();
    },

    detached: function () {
      if (!this._refreshBound) return;
      eventBus.off('auth:selectionChanged', this._refreshBound);
      eventBus.off('auth:contextChanged', this._refreshBound);
      eventBus.off('org:changed', this._refreshBound);
      this._refreshBound = null;
    }
  },

  pageLifetimes: {
    show: function () {
      this.refresh();
    }
  },

  methods: {
    refresh: function () {
      const profile = getProfile();
      this.setData({
        personName: profile.name,
        identityName: profile.workContextName || localeCopy.copy_0c1ba11af0,
        identityDetail: '',
        organizationName: profile.organizationName || localeCopy.copy_6d7a32c169,
        signedIn: Boolean(profile.name)
      });
    },

    onSwitchTap: function () {
      const pages = getCurrentPages();
      const current = pages.length ? pages[pages.length - 1] : null;
      if (current && current.route === 'subpackages/org/pages/identitySwitch/identitySwitch') {
        wx.pageScrollTo({ scrollTop: 0, duration: 220 });
        return;
      }
      navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
    }
  }
});
