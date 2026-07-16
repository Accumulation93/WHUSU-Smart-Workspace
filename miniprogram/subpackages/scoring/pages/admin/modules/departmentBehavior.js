// Behavior: department tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyDepartmentForm } = utils;
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    async loadDepartmentList() {
      const request = orgSession.beginRequest(this, 'departmentList');
      this.setLoading('departments', true);
      try {
        const result = await this.callCloud('listDepartments');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          throw new Error(result.message || '加载部门列表失败');
        }
        this.setData({
          departmentList: result.departments || []
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        console.error('加载部门列表失败:', error);
        // 不再显示错误提示，因为空数据库是正常情况
        this.setData({
          departmentList: []
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('departments', false);
      }
    },

    onDepartmentFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const rawValue = e.detail.value;
      const value = field === 'description' ? rawValue : rawValue.trim();
      this.setData({
        departmentForm: {
          ...this.data.departmentForm,
          [field]: value
        }
      });
    },

    startCreateDepartment() {
      this.setData({
        departmentForm: emptyDepartmentForm(),
        activeTab: 'departments'
      });
    },

    editDepartment(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.departmentList[index];
      if (!item) {
        return;
      }
  
      this.setData({
        departmentForm: {
          id: item.id,
          name: item.name,
          description: item.description || ''
        },
        activeTab: 'departments'
      });
    },

    async saveDepartment() {
      const form = this.data.departmentForm;
      if (!form.name) {
        wx.showToast({
          title: '请填写部门名称',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveDepartment', true);
      try {
        const result = await this.callCloud('saveDepartment', {
          id: form.id,
          name: form.name,
          description: form.description
        });
  
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '保存部门失败',
            icon: 'none'
          });
          return;
        }
  
        this.setData({ departmentForm: emptyDepartmentForm() });
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        this.updateHrFormOptions();
        wx.showToast({
          title: '部门信息已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存部门失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('saveDepartment', false);
      }
    },

    async deleteDepartment(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) {
        return;
      }
  
      const confirm = await new Promise((resolve) => {
        wx.showModal({
          title: '删除部门',
          content: '确认删除这个部门吗？',
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
        const result = await this.callCloud('deleteDepartment', { id });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '删除部门失败',
            icon: 'none'
          });
          return;
        }
  
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        this.updateHrFormOptions();
        wx.showToast({
          title: '部门已删除',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '删除部门失败',
          icon: 'none'
        });
      }
    }
  }
});
