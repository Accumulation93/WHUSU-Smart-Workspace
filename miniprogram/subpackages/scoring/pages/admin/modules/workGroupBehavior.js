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
          throw new Error(result.message || '加载工作分工列表失败');
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
        console.error('加载工作分工列表失败:', error);
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
          title: '请填写工作分工名称',
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
            title: result.message || '保存工作分工失败',
            icon: 'none'
          });
          return;
        }
  
        this.setData({ workGroupForm: emptyWorkGroupForm() });
        await this.loadWorkGroupList();
        this.updateWorkGroupOptions();
        wx.showToast({
          title: '工作分工信息已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存工作分工失败',
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
          title: '删除工作分工',
          content: '确认删除这个工作分工吗？',
          confirmText: '确认删除',
          cancelText: '取消',
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
            title: result.message || '删除工作分工失败',
            icon: 'none'
          });
          return;
        }
  
        await this.loadWorkGroupList();
        this.updateWorkGroupOptions();
        wx.showToast({
          title: '工作分工已删除',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '删除工作分工失败',
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
        this.setData({ workGroupOptions: ['无'] });
        return;
      }
  
      const departmentObj = this.data.departmentList.find(d => d.id === departmentId || d.name === department);
      if (!departmentObj) {
        this.setData({ workGroupOptions: ['无'] });
        return;
      }
  
      const deptIdStr = String(departmentObj.id);
      const workGroupOptions = ['无', ...this.data.workGroupList
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
