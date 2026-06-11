// Behavior: activity tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyActivityForm } = utils;

module.exports = Behavior({
  methods: {
    async loadActivityList() {
      this.setLoading('activities', true);
      try {
        const result = await this.callCloud('listScoreActivities');
        const currentActivity = (result.list || []).find((item) => item.id === (result.currentActivityId || '')) || {};
        this.setData({
          activityList: result.list || [],
          currentActivityId: result.currentActivityId || '',
          currentActivityName: currentActivity.name || ''
        });
      } catch (error) {
        wx.showToast({
          title: '加载评分活动失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('activities', false);
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
          endDate: item.endDate || ''
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
          title: '请填写评分活动名称',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveActivity', true);
      try {
        const result = await this.callCloud('saveScoreActivity', form);
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '保存活动失败',
            icon: 'none'
          });
          return;
        }
  
        this.resetActivityForm();
        await this.loadActivityList();
        wx.showToast({
          title: '评分活动已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存活动失败',
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
        title: '设为当前评分活动',
        content: '确认将这条活动设为当前评分活动吗？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('setCurrentScoreActivity', { id });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '设置失败',
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
              title: '当前活动已切换',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '设置当前活动失败',
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
          wx.showToast({ title: result.message || '操作失败', icon: 'none' });
          return;
        }
        await this.loadActivityList();
        wx.showToast({ title: result.message || '操作成功', icon: 'success' });
      } catch (error) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },

    deleteActivity(e) {
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: '删除评分活动',
        content: '删除后会一并清理该活动下的评分人类别、被评分人规则和评分记录，是否继续？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('deleteScoreActivity', { id });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '删除失败',
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
              title: '评分活动已删除',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '删除评分活动失败',
              icon: 'none'
            });
          }
        }
      });
    }
  }
});
