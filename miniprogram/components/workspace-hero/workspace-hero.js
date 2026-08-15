const localeCopy = require('../../locales/zh-CN/generated/components/workspace-hero/workspace-hero');
const eventBus = require('../../utils/eventBus');
const { navigateToTrustedRoute } = require('../../utils/trustedNavigation');

function getIdentityName(profile, role) {
  if (!profile) return '';
  if (role === 'admin') {
    return profile.adminLevel === 'super_admin' ? localeCopy.copy_ccd219e5f1 : localeCopy.copy_c01a9aef59;
  }
  return profile.identity || '';
}

function getProfile() {
  const role = String(wx.getStorageSync('activeRole') || '');
  const profiles = wx.getStorageSync('roleProfiles') || {};
  const account = wx.getStorageSync('accountProfile') || {};
  const profile = profiles[role] || {};
  return {
    role: role,
    name: profile.name || account.name || '',
    identityName: getIdentityName(profile, role),
    department: profile.department || '',
    workGroup: profile.workGroup || '',
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
      const detailParts = [];
      if (profile.department) detailParts.push(profile.department);
      if (profile.workGroup) detailParts.push(profile.workGroup);
      this.setData({
        personName: profile.name,
        identityName: profile.identityName || localeCopy.copy_0c1ba11af0,
        identityDetail: detailParts.join(' · '),
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
