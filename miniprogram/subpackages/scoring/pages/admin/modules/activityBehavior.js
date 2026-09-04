const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/activityBehavior');
// Behavior: activity tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const orgSession = require('../../../../../utils/orgSession');
const { emptyActivityForm } = utils;

module.exports = Behavior({
  methods: {
    async loadActivityList() {
      const request = orgSession.beginRequest(this, 'adminActivities');
      this.setLoading('activities', true);
      try {
        const result = await this.callCloud('listScoreActivities');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (!result || result.status !== 'success') {
          const error = new Error(result && result.message ? result.message : localeCopy.copy_8b63ce8619);
          error.status = result && result.status ? result.status : 'error';
          throw error;
        }
        const currentActivity = (result.list || []).find((item) => item.id === (result.currentActivityId || '')) || {};
        this.setData({
          activityList: result.list || [],
          currentActivityId: result.currentActivityId || '',
          currentActivityName: currentActivity.name || ''
        });
        if (!currentActivity.id && typeof this.clearScoreResultsState === 'function') {
          this.clearScoreResultsState();
        }
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        this.setData({ activityList: [], currentActivityId: '', currentActivityName: '' });
        if (typeof this.clearScoreResultsState === 'function') this.clearScoreResultsState();
        wx.showToast({
          title: localeCopy.copy_8b63ce8619,
          icon: 'none'
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('activities', false);
      }
    },

    onActivityFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const rawValue = e.detail.value;
      const value = field === 'description' ? rawValue : rawValue.trim();
      this.setData({
        activityForm: {
          ...this.data.activityForm,
          [field]: value
        }
      });
    },

    onActivityDateChange(e) {
      const { field } = e.currentTarget.dataset;
      const value = e.detail.value;
      this.setData({
        activityForm: {
          ...this.data.activityForm,
          [field]: value
        }
      });
    },

    onActivityGranularityChange(e) {
      const options = this.data.participantGranularityOptions || [];
      const index = Math.max(0, Number(e.detail.value) || 0);
      const selected = options[index] || options[0] || { value: 'assignment' };
      this.setData({
        activityForm: {
          ...this.data.activityForm,
          participantGranularity: selected.value,
          participantGranularityIndex: index
        }
      });
    },

    resetActivityForm() {
      this.setData({
        activityForm: emptyActivityForm()
      });
    },

    editActivity(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.activityList[index];
      if (!item) {
        return;
      }
  
      this.setData({
        activityForm: {
          id: item.id,
          name: item.name,
          description: item.description || '',
          startDate: item.startDate || '',
          endDate: item.endDate || '',
          participantGranularity: 'assignment',
          participantGranularityIndex: 0
        },
        activeTab: 'activities'
      });
    },

    startCreateActivity() {
      this.resetActivityForm();
      this.setData({ activeTab: 'activities' });
    },

    async saveActivity() {
      const form = this.data.activityForm;
      if (!form.name) {
        wx.showToast({
          title: localeCopy.copy_e394895492,
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveActivity', true);
      try {
        const result = await this.callCloud('saveScoreActivity', form);
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_215e3c57da,
            icon: 'none'
          });
          return;
        }
  
        this.resetActivityForm();
        await this.loadActivityList();
        wx.showToast({
          title: localeCopy.copy_111cdb08d2,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_215e3c57da,
          icon: 'none'
        });
      } finally {
        this.setLoading('saveActivity', false);
      }
    },

    setCurrentActivity(e) {
      const { id } = e.currentTarget.dataset;
      if (!id || id === this.data.currentActivityId) {
        return;
      }
  
      wx.showModal({
        title: localeCopy.copy_55a98e5fa5,
        content: localeCopy.copy_02d6607d13,
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('setCurrentScoreActivity', { id });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || localeCopy.copy_78ad9dc82c,
                icon: 'none'
              });
              return;
            }
  
            await this.loadActivityList();
            await this.loadRuleList();
            if (this.data.activeTab === 'results') {
              await this.loadScoreResults();
            }
          } catch (error) {
            wx.showToast({
              title: localeCopy.copy_78ad9dc82c,
              icon: 'none'
            });
          }
        }
      });
    },

    async toggleActivityPause(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
  
      try {
        const result = await this.callCloud('toggleActivityPause', { id });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_0531ed9e78, icon: 'none' });
          return;
        }
        await this.loadActivityList();
        wx.showToast({ title: result.message || localeCopy.copy_2220286f1c, icon: 'success' });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_0531ed9e78, icon: 'none' });
      }
    },

    deleteActivity(e) {
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: localeCopy.copy_8dbc945bf2,
        content: localeCopy.copy_1d38f8a471,
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('deleteScoreActivity', { id });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || localeCopy.copy_076bb5d383,
                icon: 'none'
              });
              return;
            }
  
            await this.loadActivityList();
            await this.loadRuleList();
            if (this.data.activeTab === 'results') {
              await this.loadScoreResults();
            }
            wx.showToast({
              title: localeCopy.copy_2e234dd2db,
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: localeCopy.copy_076bb5d383,
              icon: 'none'
            });
          }
        }
      });
    }
  }
});
