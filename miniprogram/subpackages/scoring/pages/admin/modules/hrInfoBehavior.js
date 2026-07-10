// Behavior: hrInfo tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { PROFILE_EDIT_MODE_OPTIONS, PROFILE_FIELD_TYPE_OPTIONS, NUMBER_RULE_OPTIONS, emptyHrForm, emptyHrProfileTemplateForm, emptyHrProfileFilters, createEmptyProfileField, normalizeHrProfileFieldForForm, applyHrProfileFilters, buildCsvColumnMapping, getFieldTypeLabelForTarget, getFieldTypeDisplayName, showShortToast, buildHrProfileFilterOptions, validateProfileField, buildFieldHint, normalizeEmptyValue, validateCsvValueAgainstField } = utils;
const { chooseTableFile, buildCsv, saveAndShareFile } = require('../../../../../utils/tableFile');

module.exports = Behavior({
  methods: {
    async loadHrList() {
      this.setLoading('hr', true);
      try {
        const result = await this.callCloud('listHrInfo');
        const hrList = result.list || [];
        this.setData({ hrList });
        this.refreshAdminCandidates(this.data.adminCandidateKeyword);
      } catch (error) {
        wx.showToast({
          title: '加载人事成员失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('hr', false);
      }
    },

    async batchMaintainFromHrInfo() {
      this.setLoading('batchMaintain', true);
      try {
        const result = await this.callCloud('batchMaintainFromHrInfo');
        
        if (result.status !== 'success') {
          console.error('批量维护失败:', result.message);
          wx.showToast({
            title: result.message || '批量维护失败',
            icon: 'none'
          });
          return;
        }
  
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        await this.loadIdentityList();
        this.updateHrFormOptions();
        
        const stats = result.stats || {};
        const changedCount = ['departmentsCreated', 'identitiesCreated', 'workGroupsCreated']
          .reduce((sum, key) => sum + Number(stats[key] || 0), 0);
        wx.showToast({
          title: changedCount ? `已补齐${changedCount}项` : '组织字典已完整',
          icon: 'success'
        });
      } catch (error) {
        console.error('批量维护失败:', error);
        wx.showToast({
          title: '批量维护失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('batchMaintain', false);
      }
    },

    async loadHrProfileAdminData() {
      this.setLoading('profile', true);
      try {
        const result = await this.callCloud('listHrProfileAdminData');
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '加载人事信息模板失败',
            icon: 'none'
          });
          return;
        }
  
        const template = result.template || null;
        const rawRows = result.rows || [];
        const hrProfileFilterOptions = buildHrProfileFilterOptions(rawRows);
        // Cascade work group options based on current department filter
        if (this.data.hrProfileFilters.department === '全部部门') {
          hrProfileFilterOptions.workGroups = ['无'];
        } else {
          const dept = this.data.departmentList.find(d => d.name === this.data.hrProfileFilters.department) || {};
          const wgs = this.data.workGroupList
            .filter(w => w.departmentId === dept.id)
            .map(w => w.name);
          hrProfileFilterOptions.workGroups = ['无', ...wgs];
        }
        const hrProfileRows = applyHrProfileFilters(rawRows, this.data.hrProfileFilters);
        this.setData({
          hrProfileTemplateForm: template ? {
            description: template.description || '',
            editMode: template.editMode || PROFILE_EDIT_MODE_OPTIONS[0].value,
            editModeLabel: (PROFILE_EDIT_MODE_OPTIONS.find((item) => item.value === (template.editMode || PROFILE_EDIT_MODE_OPTIONS[0].value)) || PROFILE_EDIT_MODE_OPTIONS[0]).label,
            fields: Array.isArray(template.fields) && template.fields.length
              ? template.fields.map((item) => normalizeHrProfileFieldForForm(item))
              : [createEmptyProfileField()]
          } : emptyHrProfileTemplateForm(),
          hrProfileRawRows: rawRows,
          hrProfileFilterOptions,
          hrProfileRows
        });
      } catch (error) {
        wx.showToast({
          title: '加载人事信息模板失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('profile', false);
      }
    },

    refreshHrProfileRows(nextFilters = this.data.hrProfileFilters, nextRawRows = this.data.hrProfileRawRows) {
      this.setData({
        hrProfileRows: applyHrProfileFilters(nextRawRows, nextFilters)
      });
    },

    onHrProfileFilterChange(e) {
      const field = String(e.currentTarget.dataset.field || '');
      const options = this.data.hrProfileFilterOptions[field] || [];
      const keyMap = {
        departments: 'department',
        identities: 'identity',
        workGroups: 'workGroup',
        statuses: 'status'
      };
      const valueKey = keyMap[field] || 'status';
      const value = options[Number(e.detail.value)] || options[0] || '';
      const nextFilters = {
        ...this.data.hrProfileFilters,
        [valueKey]: value
      };
      const patch = { hrProfileFilters: nextFilters };
  
      // Cascade work group options when department filter changes
      if (field === 'departments') {
        if (value === '全部部门') {
          patch['hrProfileFilterOptions.workGroups'] = ['无'];
          nextFilters.workGroup = '无';
          patch.hrProfileFilters = nextFilters;
        } else {
          const dept = this.data.departmentList.find(d => d.name === value) || {};
          const wgs = this.data.workGroupList
            .filter(w => w.departmentId === dept.id)
            .map(w => w.name);
          patch['hrProfileFilterOptions.workGroups'] = ['无', ...wgs];
          nextFilters.workGroup = '无';
          patch.hrProfileFilters = nextFilters;
        }
      }
  
      this.setData(patch);
      this.refreshHrProfileRows(nextFilters);
    },

    onHrProfileKeywordInput(e) {
      const displayValue = e.detail.value;
      this.setData({ _hrInfoKeywordInput: displayValue });
      if (this.data._hrInfoKeywordTimer) {
        clearTimeout(this.data._hrInfoKeywordTimer);
      }
      this.setData({
        _hrInfoKeywordTimer: setTimeout(() => {
          const nextFilters = {
            ...this.data.hrProfileFilters,
            keyword: displayValue
          };
          this.setData({ hrProfileFilters: nextFilters, _hrInfoKeywordTimer: null });
          this.refreshHrProfileRows(nextFilters);
        }, 300)
      });
    },

    resetHrProfileFilters() {
      const nextFilters = emptyHrProfileFilters();
      this.setData({
        hrProfileFilters: nextFilters,
        'hrProfileFilterOptions.workGroups': ['无'],
        _hrInfoKeywordInput: ''
      });
      this.refreshHrProfileRows(nextFilters);
    },

    async openHrPersonDetail(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      if (!hrId) return;
  
      // Proactively ensure department/identity/workGroup lists are loaded
      const loadPromises = [];
      if (!this.data.departmentList || !this.data.departmentList.length) {
        loadPromises.push(this._ensureDepartmentsLoaded());
      }
      if (!this.data.identityList || !this.data.identityList.length) {
        loadPromises.push(this._ensureIdentitiesLoaded());
      }
      if (!this.data.workGroupList || !this.data.workGroupList.length) {
        loadPromises.push(this._ensureWorkGroupsLoaded());
      }
      if (loadPromises.length) {
        await Promise.all(loadPromises);
      }
  
      this.setData({ showHrPersonDetail: true, detailHrId: hrId, loadingDetailHr: true });
      try {
        const result = await this.callCloud('getHrPersonDetail', { hrId });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '加载失败', icon: 'none' });
          this.setData({ showHrPersonDetail: false, loadingDetailHr: false });
          return;
        }
        const vals = {};
        const profile = result.profile || {};
        if (profile.name) vals._name = profile.name;
        if (profile.studentId) vals._studentId = profile.studentId;
        if (profile.departmentId) vals._departmentId = profile.departmentId;
        if (profile.department) vals._departmentName = profile.department;
        if (profile.identityId) vals._identityId = profile.identityId;
        if (profile.identity) vals._identityName = profile.identity;
        if (profile.workGroupId) vals._workGroupId = profile.workGroupId;
        if (profile.workGroup) vals._workGroupName = profile.workGroup;
        if (result.values) {
          Object.keys(result.values).forEach(k => { vals[k] = result.values[k]; });
        }
        const detailHrTemplate = result.template ? {
          ...result.template,
          fields: Array.isArray(result.template.fields)
            ? result.template.fields.map((f) => {
                const field = {
                  id: f.id || '',
                  label: f.label || '',
                  type: f.type || 'text',
                  required: f.required === true,
                  options: Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split('\n').filter(Boolean) : []),
                  minLength: f.minLength,
                  maxLength: f.maxLength,
                  numberRule: f.numberRule || '',
                  allowDecimal: f.allowDecimal !== false,
                  minDigits: f.minDigits,
                  maxDigits: f.maxDigits,
                  minValue: f.minValue,
                  maxValue: f.maxValue
                };
                field.hintText = buildFieldHint(field);
                return field;
              })
            : []
        } : null;
        this.setData({
          detailHrProfile: profile,
          detailHrTemplate,
          detailHrValues: vals,
          detailHrPendingValues: result.pendingValues || {},
          detailHrAuditStatus: result.auditStatus || 'none',
          detailHrAuditStatusText: result.auditStatusText || '未提交',
          detailHrRejectionReason: result.rejectionReason || '',
          detailHrHasPending: !!result.hasPending,
          loadingDetailHr: false
        });
        this._ensureDetailFormOptions();
        this.updateDetailWorkGroupOptions();
        this._syncDetailPickerValues();
      } catch (err) {
        wx.showToast({ title: '加载详情失败', icon: 'none' });
        this.setData({ showHrPersonDetail: false, loadingDetailHr: false });
      }
    },

    closeHrPersonDetail() {
      this.setData({
        showHrPersonDetail: false,
        detailWorkGroupOptions: [],
        detailDepartmentValue: 0,
        detailIdentityValue: 0,
        detailWorkGroupValue: 0,
        detailFieldValues: {}
      });
    },

    onDetailBasicFieldInput(e) {
      const field = String(e.currentTarget.dataset.field || '');
      this.setData({ ['detailHrValues.' + field]: e.detail.value });
    },

    onDetailProfileFieldInput(e) {
      const field = String(e.currentTarget.dataset.field || '');
      let value = e.detail.value;
  
      // For sequence pickers, e.detail.value is the numeric index;
      // resolve it to the option text so the display shows the selected text.
      const template = this.data.detailHrTemplate;
      let seqIndex = -1;
      if (template && template.fields) {
        const fieldDef = template.fields.find(function(f) { return String(f.id) === field; });
        if (fieldDef && fieldDef.type === 'sequence' && Array.isArray(fieldDef.options)) {
          const idx = Number(value);
          if (!isNaN(idx) && idx >= 0 && idx < fieldDef.options.length) {
            value = fieldDef.options[idx];
            seqIndex = idx;
          }
        }
      }
  
      const updates = { ['detailHrValues.' + field]: value };
      if (seqIndex >= 0) {
        updates['detailFieldValues.' + field] = seqIndex;
      }
      this.setData(updates);
    },

    onDetailDepartmentChange(e) {
      const index = Number(e.detail.value);
      const dept = this.data.departmentList[index] || {};
      this.setData({
        'detailHrValues._departmentId': dept.id || '',
        'detailHrValues._departmentName': dept.name || '',
        'detailHrValues._workGroupId': '',
        'detailHrValues._workGroupName': '',
        detailDepartmentValue: index
      });
      this.updateDetailWorkGroupOptions(dept.id);
    },

    onDetailIdentityChange(e) {
      const index = Number(e.detail.value);
      const ident = this.data.identityList[index] || {};
      this.setData({
        'detailHrValues._identityId': ident.id || '',
        'detailHrValues._identityName': ident.name || '',
        detailIdentityValue: index
      });
    },

    onDetailWorkGroupChange(e) {
      const index = Number(e.detail.value);
      if (index === 0) {
        this.setData({
          'detailHrValues._workGroupId': '',
          'detailHrValues._workGroupName': '',
          detailWorkGroupValue: 0
        });
        return;
      }
      const deptId = this.data.detailHrValues._departmentId || (this.data.detailHrProfile || {}).departmentId || '';
      const idStr = String(deptId);
      const wgs = this.data.workGroupList.filter(w => String(w.departmentId) === idStr);
      const wg = wgs[index - 1] || {};
      this.setData({
        'detailHrValues._workGroupId': wg.id || '',
        'detailHrValues._workGroupName': wg.name || '',
        detailWorkGroupValue: index
      });
    },

    async saveHrPersonDetail() {
      const vals = this.data.detailHrValues || {};
      const profile = this.data.detailHrProfile || {};
      const hrId = this.data.detailHrId;
      if (!hrId) return;
  
      const name = (vals._name || '').trim();
      const studentId = (vals._studentId || '').trim();
      const departmentId = vals._departmentId || profile.departmentId || '';
      const identityId = vals._identityId || profile.identityId || '';
      const workGroupId = vals._workGroupId || profile.workGroupId || '';
  
      if (!name || !studentId || !departmentId || !identityId) {
        wx.showToast({ title: '请填写完整的姓名、学号、部门和身份', icon: 'none' });
        return;
      }
  
      const profileValues = {};
      Object.keys(vals).forEach(k => {
        if (!k.startsWith('_')) {
          profileValues[k] = vals[k];
        }
      });
  
      const template = this.data.detailHrTemplate;
      if (template && Array.isArray(template.fields)) {
        for (let i = 0; i < template.fields.length; i += 1) {
          const field = template.fields[i];
          const errorMessage = validateProfileField(field, profileValues[field.id]);
          if (errorMessage) {
            wx.showToast({ title: errorMessage, icon: 'none' });
            return;
          }
        }
      }
  
      this.setData({ savingDetailHr: true });
      try {
        const result = await this.callCloud('saveHrPersonFull', {
          hrId, name, studentId, departmentId, identityId, workGroupId, profileValues
        });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '保存失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ showHrPersonDetail: false });
        this.loadHrProfileAdminData();
        this.loadHrList();
      } catch (err) {
        wx.showToast({ title: '保存失败', icon: 'none' });
      } finally {
        this.setData({ savingDetailHr: false });
      }
    },

    async approveDetailHrProfile() {
      const profile = this.data.detailHrProfile || {};
      const studentId = profile.studentId || '';
      if (!studentId) return;
      try {
        const result = await this.callCloud('reviewHrProfileChange', { studentId, action: 'approve' });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '操作失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已通过', icon: 'success' });
        this.closeHrPersonDetail();
        this.loadHrProfileAdminData();
      } catch (err) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },

    async rejectDetailHrProfile() {
      const profile = this.data.detailHrProfile || {};
      const studentId = profile.studentId || '';
      if (!studentId) return;
      try {
        const result = await this.callCloud('reviewHrProfileChange', { studentId, action: 'reject' });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '操作失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已驳回', icon: 'success' });
        this.closeHrPersonDetail();
        this.loadHrProfileAdminData();
      } catch (err) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },

    toggleAddEditForm() {
      this.setData({ showAddEditForm: !this.data.showAddEditForm });
    },

    toggleTemplateConfig() {
      this.setData({ showTemplateConfig: !this.data.showTemplateConfig });
    },

    onHrProfileTemplateInput(e) {
      const { field } = e.currentTarget.dataset;
      const value = e.detail.value;
      this.setData({
        hrProfileTemplateForm: {
          ...this.data.hrProfileTemplateForm,
          [field]: value
        }
      });
    },

    onHrProfileFieldInput(e) {
      const index = Number(e.currentTarget.dataset.index);
      const field = String(e.currentTarget.dataset.field || '');
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        [field]: e.detail.value
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileFieldRequiredChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        required: !!e.detail.value
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileEditModeChange(e) {
      const option = PROFILE_EDIT_MODE_OPTIONS[Number(e.detail.value)] || PROFILE_EDIT_MODE_OPTIONS[0];
      this.setData({
        hrProfileTemplateForm: {
          ...this.data.hrProfileTemplateForm,
          editMode: option.value,
          editModeLabel: option.label
        }
      });
    },

    onHrProfileFieldTypeChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const option = PROFILE_FIELD_TYPE_OPTIONS[Number(e.detail.value)] || PROFILE_FIELD_TYPE_OPTIONS[0];
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        type: option.value,
        typeLabel: option.label
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileNumberRuleChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const option = NUMBER_RULE_OPTIONS[Number(e.detail.value)] || NUMBER_RULE_OPTIONS[0];
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        numberRule: option.value,
        numberRuleLabel: option.label
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileFieldAllowDecimalChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        allowDecimal: !!e.detail.value
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    addHrProfileField() {
      this.setData({
        'hrProfileTemplateForm.fields': [
          ...(this.data.hrProfileTemplateForm.fields || []),
          createEmptyProfileField()
        ]
      });
    },

    importTableFields() {
      this.setLoading('importTemplateFieldsCsv', true);
      const _this = this;
      chooseTableFile(_this.callCloud.bind(_this)).then(function (tableData) {
        if (!tableData) { _this.setLoading('importTemplateFieldsCsv', false); return; }
  
        const headers = tableData.headers;
        if (!headers.length) {
          wx.showToast({ title: '表格文件为空或格式不正确', icon: 'none' });
          _this.setLoading('importTemplateFieldsCsv', false);
          return;
        }
  
        const newFields = headers.map(function (label) {
          return Object.assign({}, createEmptyProfileField(), {
            id: 'profile_field_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            label: label
          });
        });
  
        const existingFields = _this.data.hrProfileTemplateForm.fields || [];
        const headerPreview = headers.length > 5
          ? headers.slice(0, 5).join('、') + ' 等' + headers.length + '个字段'
          : headers.join('、');
  
        wx.showModal({
          title: '导入字段',
          content: '检测到 ' + headers.length + ' 个字段：' + headerPreview + '。是否替换现有字段？（取消则追加到末尾）',
          confirmText: '替换',
          cancelText: '追加',
          success: function (modalRes) {
            const fields = modalRes.confirm ? newFields : existingFields.concat(newFields);
            _this.setData({ 'hrProfileTemplateForm.fields': fields });
            wx.showToast({ title: '已导入 ' + headers.length + ' 个字段', icon: 'success' });
          }
        });
        _this.setLoading('importTemplateFieldsCsv', false);
      }).catch(function () {
        _this.setLoading('importTemplateFieldsCsv', false);
      });
    },

    removeHrProfileField(e) {
      const index = Number(e.currentTarget.dataset.index);
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields.splice(index, 1);
      this.setData({
        'hrProfileTemplateForm.fields': fields.length ? fields : [createEmptyProfileField()]
      });
    },

    async saveHrProfileTemplate() {
      const form = this.data.hrProfileTemplateForm || emptyHrProfileTemplateForm();
      const fields = (form.fields || []).map((item) => ({
        id: item.id,
        label: String(item.label || '').trim(),
        type: item.type,
        required: item.required === true,
        minLength: item.minLength === '' ? null : Number(item.minLength),
        maxLength: item.maxLength === '' ? null : Number(item.maxLength),
        numberRule: item.numberRule || NUMBER_RULE_OPTIONS[0].value,
        allowDecimal: item.allowDecimal !== false,
        minDigits: item.minDigits === '' ? null : Number(item.minDigits),
        maxDigits: item.maxDigits === '' ? null : Number(item.maxDigits),
        minValue: item.minValue === '' ? null : Number(item.minValue),
        maxValue: item.maxValue === '' ? null : Number(item.maxValue),
        options: String(item.optionsText || '')
          .split('\n')
          .map((option) => option.trim())
          .filter(Boolean)
      }));
  
      if (!fields.length || fields.some((item) => !item.label)) {
        wx.showToast({
          title: '请填写完整的字段名称',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveProfileTemplate', true);
      wx.showLoading({
        title: '更新中...',
        mask: true
      });
      try {
        const result = await this.callCloud('saveHrProfileTemplate', {
          description: String(form.description || '').trim(),
          editMode: form.editMode,
          fields
        });
  
        if (result.status !== 'success') {
          showShortToast('更新失败');
          return;
        }
  
        await this.loadHrProfileAdminData();
        showShortToast('已更新', 'success');
      } catch (error) {
        showShortToast('更新失败');
      } finally {
        wx.hideLoading();
        this.setLoading('saveProfileTemplate', false);
      }
    },

    approveHrProfileChange(e) {
      const studentId = String(e.currentTarget.dataset.studentId || '').trim();
      if (!studentId) {
        return;
      }
  
      wx.showModal({
        title: '通过审核',
        content: '确认将待审核的人事信息修改正式生效吗？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('reviewHrProfileChange', {
              studentId,
              action: 'approve'
            });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '审核失败',
                icon: 'none'
              });
              return;
            }
            await this.loadHrProfileAdminData();
            wx.showToast({
              title: '已通过审核',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '审核失败',
              icon: 'none'
            });
          }
        }
      });
    },

    rejectHrProfileChange(e) {
      const studentId = String(e.currentTarget.dataset.studentId || '').trim();
      if (!studentId) {
        return;
      }
  
      wx.showModal({
        title: '驳回修改',
        content: '确认驳回这次待审核的人事信息修改吗？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('reviewHrProfileChange', {
              studentId,
              action: 'reject'
            });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '驳回失败',
                icon: 'none'
              });
              return;
            }
            await this.loadHrProfileAdminData();
            wx.showToast({
              title: '已驳回修改',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '驳回失败',
              icon: 'none'
            });
          }
        }
      });
    },

    onHrFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const value = e.detail.value.trim();
      this.setData({
        hrForm: {
          ...this.data.hrForm,
          [field]: value
        }
      });
    },

    editHr(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.hrList[index];
      if (!item) {
        return;
      }
  
      this.setData({
        hrForm: {
          id: item.id,
          name: item.name,
          studentId: item.studentId,
          departmentId: item.departmentId || '',
          department: item.department,
          identityId: item.identityId || '',
          identity: item.identity,
          workGroupId: item.workGroupId || '',
          workGroup: item.workGroup || ''
        },
        showAddEditForm: true
      });
    },

    resetHrForm() {
      this.setData({
        hrForm: emptyHrForm()
      });
    },

    startCreateHr() {
      this.resetHrForm();
      this.setData({ showAddEditForm: true });
    },

    async saveHr() {
      const { id, name, studentId, departmentId, identityId, workGroupId } = this.data.hrForm;
    
      if (!name || !studentId || !departmentId || !identityId) {
        wx.showToast({
          title: '请填写完整人事信息',
          icon: 'none'
        });
        return;
      }
    
      this.setLoading('saveHr', true);
      try {
        const result = await this.callCloud('saveHrInfo', {
          id,
          name,
          studentId,
          departmentId,
          identityId,
          workGroupId
        });
    
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '保存失败',
            icon: 'none'
          });
          return;
        }
    
        this.resetHrForm();
        await this.loadHrList();
        await this.loadHrProfileAdminData(); // refresh unified list
        wx.showToast({
          title: '人事成员已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存人事成员失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('saveHr', false);
      }
    },

    deleteHr(e) {
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: '删除人事成员',
        content: '删除后会同步清理关联绑定记录，是否继续？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          try {
            await this.callCloud('deleteHrInfo', { id });
            await this.loadHrList();
            await this.loadHrProfileAdminData(); // refresh unified list
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      });
    },

    chooseTable() {
      let self = this;
      self._csvImportActive = true;
  
      chooseTableFile(self.callCloud.bind(self)).then(function (tableData) {
        if (!tableData) { self._csvImportActive = false; return; }
  
        let headers = tableData.headers;
        let rows = tableData.rows;
        let rawContent = tableData.rawContent;
        let fileName = tableData.fileName;
  
        let samples = [headers];
        for (let r = 0; r < Math.min(rows.length, 6); r++) {
          samples.push(rows[r]);
        }
  
        let templateFields = (self.data.hrProfileTemplateForm || {}).fields || [];
        let result = buildCsvColumnMapping(headers, samples, templateFields);
  
        self.setData({
          showCsvMappingDialog: true,
          csvImportRows: result.rows,
          csvImportContent: rawContent,
          csvImportFileName: fileName || '',
          csvImportSamples: samples,
          csvImportMappingLabels: result.labels,
          csvImportMappingValues: result.values
        });
        self._csvImportActive = false;
      }).catch(function (err) {
        console.error('Table file parse error:', err);
        wx.showToast({ title: '读取文件失败: ' + (err.message || '格式错误'), icon: 'none' });
        self._csvImportActive = false;
      });
    },

    parseCsvLine(line) {
      let result = [];
      let current = '';
      let inQuotes = false;
      let text = String(line || '');
      for (let i = 0; i < text.length; i++) {
        let ch = text[i];
        let next = text[i + 1];
        if (ch === '"') {
          if (inQuotes && next === '"') { current += '"'; i++; continue; }
          inQuotes = !inQuotes;
          continue;
        }
        if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      result.push(current.trim());
      return result;
    },

    closeCsvMappingDialog() {
      this._csvImportActive = false;
      this.setData({ showCsvMappingDialog: false });
    },

    toggleCsvSkipInvalid() {
      this.setData({ csvImportSkipInvalid: !this.data.csvImportSkipInvalid });
    },

    buildValidationErrorCards(flatErrors) {
      let cards = [];
      let cardMap = {};
      for (let i = 0; i < flatErrors.length; i++) {
        let e = flatErrors[i];
        let key = e.studentId || '__no_id__';
        if (!cardMap[key]) {
          cardMap[key] = { name: e.name, studentId: e.studentId, errors: [] };
          cards.push(cardMap[key]);
        }
        cardMap[key].errors.push({
          fieldName: e.fieldName,
          fieldType: e.fieldType,
          errorValue: e.errorValue,
          errorReason: e.errorReason
        });
      }
      return cards;
    },

    downloadErrorTable() {
      let self = this;
      let errors = self.data.validationErrors || [];
      if (!errors.length) {
        wx.showToast({ title: '没有错误数据可导出', icon: 'none' });
        return;
      }
      wx.showActionSheet({
        itemList: ['CSV 格式 (.csv)', 'Excel 格式 (.xlsx)'],
        success: function (res) {
          let format = res.tapIndex === 0 ? 'csv' : 'excel';
          let headers = [
            { key: 'name', label: '姓名' },
            { key: 'studentId', label: '学号' },
            { key: 'fieldName', label: '字段名' },
            { key: 'fieldType', label: '字段类型' },
            { key: 'errorValue', label: '错误值' },
            { key: 'errorReason', label: '错误原因' }
          ];
          let rows = errors.map(function (e) {
            return {
              name: e.name || '',
              studentId: e.studentId || '',
              fieldName: e.fieldName || '',
              fieldType: e.fieldType || '',
              errorValue: e.errorValue || '',
              errorReason: e.errorReason || ''
            };
          });
          if (format === 'excel') {
            self.callCloud('buildTableFile', { headers: headers, rows: rows, sheetName: '导入错误清单' }).then(function (result) {
              if (result && result.status === 'success' && result.fileBase64) {
                saveAndShareFile(result.fileBase64, '导入错误明细', 'xlsx');
              } else {
                wx.showToast({ title: '生成Excel失败', icon: 'none' });
              }
            }).catch(function () {
              wx.showToast({ title: '生成Excel失败', icon: 'none' });
            });
          } else {
            saveAndShareFile(buildCsv(headers, rows), '导入错误明细', 'csv');
          }
        }
      });
    },

    closeValidationErrors() {
      this.setData({ showValidationErrors: false });
    },

    onCsvMappingTargetChange(e) {
      let rowIndex = Number(e.currentTarget.dataset.index);
      let values = this.data.csvImportMappingValues || [];
      let labels = this.data.csvImportMappingLabels || [];
      let optionIndex = Number(e.detail.value);
      let targetValue = values[optionIndex];
      if (isNaN(rowIndex) || targetValue === undefined) return;
  
      let newFieldTypeLabel = getFieldTypeLabelForTarget(
        targetValue,
        (this.data.hrProfileTemplateForm || {}).fields || []
      );
  
      let rows = this.data.csvImportRows.slice();
      rows[rowIndex] = {
        header: rows[rowIndex].header,
        target: targetValue,
        fieldTypeLabel: newFieldTypeLabel,
        sampleValue: rows[rowIndex].sampleValue,
        optionIndex: optionIndex,
        optionLabel: labels[optionIndex] || ''
      };
      this.setData({ csvImportRows: rows });
    },

    async confirmCsvMapping() {
      let self = this;
      let rows = self.data.csvImportRows || [];
      let columnMapping = {};
      let extensionFields = {};
  
      // Build field ID → label lookup for extension fields
      let tplFields = (self.data.hrProfileTemplateForm || {}).fields || [];
      let fieldIdToLabel = {};
      for (let j = 0; j < tplFields.length; j++) {
        fieldIdToLabel[tplFields[j].id] = tplFields[j].label;
      }
  
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        if (!row || row.target === 'ignore') continue;
  
        if (row.target === 'name' || row.target === 'studentId' || row.target === 'department'
          || row.target === 'identity' || row.target === 'workGroup') {
          columnMapping[row.target] = row.header;
        } else {
          let label = fieldIdToLabel[row.target];
          if (label) {
            extensionFields[row.header] = label;
          }
        }
      }
  
      // Require all 5 basic fields to be mapped
      let requiredBasicFields = ['name', 'studentId', 'department', 'identity', 'workGroup'];
      let missingBasicFields = [];
      for (let k = 0; k < requiredBasicFields.length; k++) {
        if (!columnMapping[requiredBasicFields[k]]) {
          missingBasicFields.push(requiredBasicFields[k]);
        }
      }
      if (missingBasicFields.length > 0) {
        let fieldNameMap = { name: '姓名', studentId: '学号', department: '所属部门', identity: '身份', workGroup: '工作分工' };
        let missingNames = [];
        for (let k2 = 0; k2 < missingBasicFields.length; k2++) {
          missingNames.push(fieldNameMap[missingBasicFields[k2]] || missingBasicFields[k2]);
        }
        wx.showModal({
          title: '基础字段未映射',
          content: '以下基础字段必须映射到 CSV 列，请完成映射后再导入：\n' + missingNames.join('、'),
          showCancel: false,
          confirmText: '知道了'
        });
        self._csvImportActive = false;
        return;
      }
  
      let skipInvalid = self.data.csvImportSkipInvalid;
  
      // --- Pre-validation (only when NOT skipping invalid fields) ---
      let validationErrors = [];
      let csvLines = self.data.csvImportContent.split(/\r?\n/);
  
      if (!skipInvalid) {
        // Validate ALL data rows against field definitions
        let tplFields = (self.data.hrProfileTemplateForm || {}).fields || [];
  
        // Build index: CSV column index → field definition
        let colFieldMap = [];
        for (let r = 0; r < rows.length; r++) {
          let mappingRow = rows[r];
          if (!mappingRow || mappingRow.target === 'ignore') {
            colFieldMap[r] = null;
            continue;
          }
          if (mappingRow.target === 'name' || mappingRow.target === 'studentId'
            || mappingRow.target === 'department' || mappingRow.target === 'identity'
            || mappingRow.target === 'workGroup') {
            colFieldMap[r] = { type: 'basic', name: mappingRow.target, csvHeader: mappingRow.header };
          } else {
            let found = tplFields.find(function (f) { return f.id === mappingRow.target; });
            colFieldMap[r] = { type: 'ext', csvHeader: mappingRow.header, fieldDef: found || { type: 'text' } };
          }
        }
  
        let studentIdColIndex = -1;
        let nameColIndex = -1;
        for (let c = 0; c < colFieldMap.length; c++) {
          if (colFieldMap[c] && colFieldMap[c].type === 'basic') {
            if (colFieldMap[c].name === 'studentId') studentIdColIndex = c;
            if (colFieldMap[c].name === 'name') nameColIndex = c;
          }
        }
  
        for (let rowIdx = 1; rowIdx < csvLines.length; rowIdx++) {
          let rowCells = self.parseCsvLine(csvLines[rowIdx] || '');
          if (!rowCells.length) continue;
  
          let studentId = normalizeEmptyValue(rowCells[studentIdColIndex]);
          if (!studentId) continue;
  
          let name = normalizeEmptyValue(rowCells[nameColIndex]);
  
          if (!name && nameColIndex >= 0) {
            validationErrors.push({
              rowNumber: rowIdx + 1,
              name: '',
              studentId: studentId,
              fieldName: colFieldMap[nameColIndex].csvHeader,
              fieldType: '基础字段',
              errorValue: '',
              errorReason: '姓名不能为空'
            });
          }
  
          for (let c = 0; c < colFieldMap.length; c++) {
            let map = colFieldMap[c];
            if (!map || map.type !== 'ext') continue;
            let cellValue = normalizeEmptyValue(rowCells[c]);
            let check = validateCsvValueAgainstField(cellValue, map.fieldDef);
            if (!check.ok) {
              validationErrors.push({
                rowNumber: rowIdx + 1,
                name: name,
                studentId: studentId,
                fieldName: map.csvHeader,
                fieldType: check.fieldType || getFieldTypeDisplayName(map.fieldDef),
                errorValue: cellValue,
                errorReason: check.reason
              });
            }
          }
        }
  
        if (validationErrors.length > 0) {
          let errorRecordCount = 0;
          let seenStudentIds = {};
          for (let ei = 0; ei < validationErrors.length; ei++) {
            if (!seenStudentIds[validationErrors[ei].studentId]) {
              seenStudentIds[validationErrors[ei].studentId] = true;
              errorRecordCount++;
            }
          }
          self.setData({
            showValidationErrors: true,
            validationErrors: validationErrors,
            validationErrorCards: self.buildValidationErrorCards(validationErrors),
            validationErrorSummary: '共 ' + errorRecordCount + ' 条记录 ' + validationErrors.length + ' 个错误'
          });
          self._csvImportActive = false;
          return;
        }
      }
  
      // --- Proceed with import ---
      self.setData({ showCsvMappingDialog: false, csvImportLoading: true });
  
      try {
        let startIndex = 1;
        let totalCount = 0;
        let hasMore = true;
        let skipInvalidFlag = skipInvalid;
        let skippedNoStudentIdTotal = 0;
  
        while (hasMore) {
          wx.showLoading({
            title: '正在导入' + (totalCount > 0 ? '（已导入' + totalCount + '条）' : '...'),
            mask: true
          });
  
          let result = await this.callCloud('importHrCsv', {
            csvContent: self.data.csvImportContent,
            startIndex: startIndex,
            batchSize: 100,
            columnMapping: columnMapping,
            extensionFields: extensionFields,
            skipInvalid: skipInvalidFlag
          });
  
          if (result.status === 'validation_errors') {
            // Backend rejected the batch (skipInvalid is off and there are validation errors).
            // Collect errors so they can be displayed after all batches are processed.
            let errors = result.errors || [];
            let flatErrors = [];
            for (let ei = 0; ei < errors.length; ei++) {
              let errRec = errors[ei];
              for (let fi = 0; fi < errRec.errors.length; fi++) {
                let e = errRec.errors[fi];
                flatErrors.push({
                  rowNumber: 0,
                  name: errRec.name || '',
                  studentId: errRec.studentId || '',
                  fieldName: e.field || '',
                  fieldType: e.fieldType || '',
                  errorValue: e.value || '',
                  errorReason: e.error || ''
                });
              }
            }
            validationErrors = validationErrors.concat(flatErrors);
            if (result.skippedNoStudentId) {
              skippedNoStudentIdTotal += Number(result.skippedNoStudentId);
            }
            startIndex = Number(result.nextIndex || startIndex + 100);
            hasMore = result.hasMore !== undefined ? (!!result.hasMore || startIndex < csvLines.length) : (startIndex < csvLines.length);
            if (!hasMore) {
              wx.hideLoading();
            }
            continue;
          }
  
          if (result.status !== 'success') {
            wx.hideLoading();
            wx.showToast({ title: result.message || '导入失败', icon: 'none' });
            self.setData({ csvImportLoading: false });
            self._csvImportActive = false;
            return;
          }
  
          totalCount += Number(result.count || 0);
          if (result.skippedNoStudentId) {
            skippedNoStudentIdTotal += Number(result.skippedNoStudentId);
          }
          startIndex = Number(result.nextIndex || startIndex + 100);
          let successBatchHadRows = Number(result.count || 0) > 0;
          let successFrontendHasMore = startIndex < csvLines.length;
          if (result.hasMore !== undefined) {
            hasMore = !!result.hasMore || (successBatchHadRows && successFrontendHasMore);
          } else {
            hasMore = successFrontendHasMore;
          }
  
          // Collect any skipped-field errors from this batch
          if (result.errors && result.errors.length) {
            let batchFlatErrors = [];
            for (let bei = 0; bei < result.errors.length; bei++) {
              let ber = result.errors[bei];
              for (let bfi = 0; bfi < ber.errors.length; bfi++) {
                let be = ber.errors[bfi];
                batchFlatErrors.push({
                  rowNumber: 0,
                  name: ber.name || '',
                  studentId: ber.studentId || '',
                  fieldName: be.field || '',
                  fieldType: be.fieldType || '',
                  errorValue: be.value || '',
                  errorReason: be.error || ''
                });
              }
            }
            validationErrors = validationErrors.concat(batchFlatErrors);
          }
        }
  
        wx.hideLoading();
        self.setData({ csvImportLoading: false, csvName: self.data.csvImportFileName || '已导入表格' });
        self._csvImportActive = false;
        await self.loadHrList();
        self.loadHrProfileAdminData();
  
        let toastTitle = '导入成功，共 ' + totalCount + ' 条';
        if (skippedNoStudentIdTotal > 0) {
          toastTitle += '，' + skippedNoStudentIdTotal + ' 条因学号为空跳过';
        }
        if (validationErrors.length > 0) {
          let errRecordCount = 0;
          let errSeen = {};
          for (let ie = 0; ie < validationErrors.length; ie++) {
            if (!errSeen[validationErrors[ie].studentId]) {
              errSeen[validationErrors[ie].studentId] = true;
              errRecordCount++;
            }
          }
          if (totalCount > 0) {
            let summary = '已导入 ' + totalCount + ' 条，共 ' + errRecordCount + ' 条记录 ' + validationErrors.length + ' 个字段因格式问题跳过';
            if (skippedNoStudentIdTotal > 0) {
              summary += '，' + skippedNoStudentIdTotal + ' 条因学号为空跳过';
            }
            toastTitle += '（部分字段已跳过）';
            wx.showToast({ title: toastTitle, icon: 'none', duration: 2500 });
          } else {
            let summary = '导入失败，' + errRecordCount + ' 条记录存在 ' + validationErrors.length + ' 个字段格式错误，请修正后重新导入，或开启「字段无效时仍然导入」';
            if (skippedNoStudentIdTotal > 0) {
              summary += '，' + skippedNoStudentIdTotal + ' 条因学号为空跳过';
            }
            toastTitle = '导入失败，' + errRecordCount + ' 条记录存在格式错误';
            if (skippedNoStudentIdTotal > 0) {
              toastTitle += '，' + skippedNoStudentIdTotal + ' 条因学号为空跳过';
            }
            wx.showToast({ title: toastTitle, icon: 'none', duration: 3000 });
          }
          self.setData({
            showValidationErrors: true,
            validationErrors: validationErrors,
            validationErrorCards: self.buildValidationErrorCards(validationErrors),
            validationErrorSummary: summary
          });
        } else {
          wx.showToast({ title: toastTitle, icon: 'success' });
        }
      } catch (error) {
        wx.hideLoading();
        self.setData({ csvImportLoading: false });
        self._csvImportActive = false;
        wx.showToast({ title: 'CSV 导入失败', icon: 'none' });
      }
    }
  }
});
