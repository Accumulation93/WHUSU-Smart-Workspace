const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/workGroupBehavior');
// Behavior: workGroup tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyWorkGroupForm } = utils;
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    async loadWorkGroupList() {
      const request = orgSession.beginRequest(this, 'workGroupList');
      this.setLoading('workGroups', true);
      try {
        const result = await this.callCloud('listWorkGroups');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          throw new Error(result.message || localeCopy.copy_5778bc8da0);
        }
        const workGroups = (result.workGroups || []).map((item) => {
          const department = this.data.departmentList.find(d => (
            d.id === item.departmentId || d.code === item.departmentCode
          ));
          return {
            ...item,
            departmentCode: item.departmentCode || (department ? department.code : ''),
            departmentName: item.departmentName || (department ? department.name : '')
          };
        });
        this.setData({
          workGroupList: workGroups
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        console.error(localeCopy.copy_7093ebdf5f, error);
        // 不再显示错误提示，因为空数据库是正常情况
        this.setData({
          workGroupList: []
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('workGroups', false);
      }
    },

    onWorkGroupFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const rawValue = e.detail.value;
      const value = field === 'description' ? rawValue : rawValue.trim();
      this.setData({
        workGroupForm: {
          ...this.data.workGroupForm,
          [field]: value
        }
      });
    },

    onWorkGroupDepartmentChange(e) {
      const index = Number(e.detail.value);
      const department = this.data.departmentList[index];
      if (!department) {
        return;
      }
  
      this.setData({
        workGroupForm: {
          ...this.data.workGroupForm,
          departmentId: department.id,
          departmentCode: department.code,
          departmentName: department.name
        }
      });
    },

    startCreateWorkGroup() {
      this.setData({
        workGroupForm: emptyWorkGroupForm(),
        activeTab: 'workGroups'
      });
    },

    editWorkGroup(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.workGroupList[index];
      if (!item) {
        return;
      }
  
      this.setData({
        workGroupForm: {
          id: item.id,
          name: item.name,
          departmentId: item.departmentId,
          departmentCode: item.departmentCode,
          departmentName: item.departmentName,
          description: item.description || ''
        },
        activeTab: 'workGroups'
      });
    },

    async saveWorkGroup() {
      const form = this.data.workGroupForm;
      if (!form.name) {
        wx.showToast({
          title: localeCopy.copy_ce1f5597c6,
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveWorkGroup', true);
      try {
        const result = await this.callCloud('saveWorkGroup', {
          id: form.id,
          name: form.name,
          departmentId: form.departmentId,
          departmentCode: form.departmentCode,
          description: form.description
        });
  
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_215e3c57da,
            icon: 'none'
          });
          return;
        }
  
        this.setData({ workGroupForm: emptyWorkGroupForm() });
        await this.loadWorkGroupList();
        this.updateWorkGroupOptions();
        wx.showToast({
          title: localeCopy.copy_4fdb08add2,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_215e3c57da,
          icon: 'none'
        });
      } finally {
        this.setLoading('saveWorkGroup', false);
      }
    },

    async deleteWorkGroup(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) {
        return;
      }
  
      const confirm = await new Promise((resolve) => {
        wx.showModal({
          title: localeCopy.copy_2bc5d4cf83,
          content: localeCopy.copy_e9870f418c,
          confirmText: localeCopy.copy_7f31eec657,
          cancelText: localeCopy.copy_4b213fd88a,
          success: (res) => resolve(!!res.confirm),
          fail: () => resolve(false)
        });
      });
  
      if (!confirm) {
        return;
      }
  
      try {
        const result = await this.callCloud('deleteWorkGroup', { id });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_076bb5d383,
            icon: 'none'
          });
          return;
        }
  
        await this.loadWorkGroupList();
        this.updateWorkGroupOptions();
        wx.showToast({
          title: localeCopy.copy_1d828c61a6,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_076bb5d383,
          icon: 'none'
        });
      }
    },

    updateHrFormOptions() {
      const departmentOptions = this.data.departmentList.map(item => item.name);
      const identityOptions = this.data.identityList.map(item => item.name);
      
      this.setData({
        departmentOptions,
        identityOptions
      });
      
      this.updateWorkGroupOptions();
    },

    updateWorkGroupOptions() {
      const { departmentId, department } = this.data.hrForm;
      if (!departmentId && !department) {
        this.setData({ workGroupOptions: [localeCopy.copy_54e953f1bb] });
        return;
      }
  
      const departmentObj = this.data.departmentList.find(d => d.id === departmentId || d.name === department);
      if (!departmentObj) {
        this.setData({ workGroupOptions: [localeCopy.copy_54e953f1bb] });
        return;
      }
  
      const deptIdStr = String(departmentObj.id);
      const workGroupOptions = [localeCopy.copy_54e953f1bb, ...this.data.workGroupList
        .filter(wg => String(wg.departmentId) === deptIdStr)
        .map(wg => wg.name)];
  
      this.setData({ workGroupOptions });
    },

    onHrDepartmentChange(e) {
      const index = Number(e.detail.value);
      const department = this.data.departmentOptions[index];
      const departmentObj = this.data.departmentList[index] || {};
      
      this.setData({
        hrForm: {
          ...this.data.hrForm,
          departmentId: departmentObj.id || '',
          department,
          workGroupId: '',
          workGroup: ''
        }
      });
      
      this.updateWorkGroupOptions();
    },

    onHrIdentityChange(e) {
      const index = Number(e.detail.value);
      const identity = this.data.identityOptions[index];
      const identityObj = this.data.identityList[index] || {};
      
      this.setData({
        hrForm: {
          ...this.data.hrForm,
          identityId: identityObj.id || '',
          identity
        }
      });
    },

    onHrWorkGroupChange(e) {
      const index = Number(e.detail.value);
      if (index === 0) {
        this.setData({
          hrForm: {
            ...this.data.hrForm,
            workGroupId: '',
            workGroup: ''
          }
        });
        return;
      }
  
      const workGroup = this.data.workGroupOptions[index];
      const departmentObj = this.data.departmentList.find(d => d.id === this.data.hrForm.departmentId || d.name === this.data.hrForm.department) || {};
      const deptIdStr = String(departmentObj.id);
      const filteredList = this.data.workGroupList.filter(wg => String(wg.departmentId) === deptIdStr);
      const workGroupObj = filteredList[index - 1] || {};
  
      this.setData({
        hrForm: {
          ...this.data.hrForm,
          workGroupId: workGroupObj.id || '',
          workGroup
        }
      });
    }
  }
});
