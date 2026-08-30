const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/departmentBehavior');
// Behavior: department tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyDepartmentForm } = utils;
const orgSession = require('../../../../../utils/orgSession');
const personnelCopy = require('../../../../../locales/zh-CN/adminPersonnel');

module.exports = Behavior({
  methods: {
    async loadDepartmentList() {
      const request = orgSession.beginRequest(this, 'departmentList');
      this.setLoading('departments', true);
      try {
        const result = await this.callCloud('listDepartments');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          const failure = new Error('department_list_failed');
          failure.userMessage = result.message || personnelCopy.dictionaryLoadFailed.departments.description;
          throw failure;
        }
        this.setData({
          departmentList: result.departments || []
        });
        this.setDictionaryLoadSuccess('departments');
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        console.error(localeCopy.copy_59591bcd20, error);
        this.setDictionaryLoadFailure(
          'departments',
          error && error.userMessage || personnelCopy.dictionaryLoadFailed.departments.description
        );
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('departments', false);
      }
    },

    retryDepartmentList() {
      return this.loadDepartmentList();
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
          title: localeCopy.copy_2531b7527d,
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
            title: result.message || localeCopy.copy_215e3c57da,
            icon: 'none'
          });
          return;
        }
  
        this.setData({ departmentForm: emptyDepartmentForm() });
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        this.updateHrFormOptions();
        wx.showToast({
          title: localeCopy.copy_89017791b3,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_215e3c57da,
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
      const target = (this.data.departmentList || []).find((item) => String(item.id) === String(id));
  
      const confirm = await new Promise((resolve) => {
        wx.showModal({
          title: localeCopy.copy_21cc5de126,
          content: localeCopy.copy_8fe7c4c171,
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
        const result = await this.callCloud('deleteDepartment', { id });
        if (result.status !== 'success') {
          if (result.status === 'in_use' && this.openDictionaryUsageDialog(
            target && target.name,
            result.usages
          )) return;
          wx.showToast({
            title: result.message || localeCopy.copy_076bb5d383,
            icon: 'none'
          });
          return;
        }
  
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        this.updateHrFormOptions();
        wx.showToast({
          title: localeCopy.copy_e7dcd6f241,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_076bb5d383,
          icon: 'none'
        });
      }
    }
  }
});
