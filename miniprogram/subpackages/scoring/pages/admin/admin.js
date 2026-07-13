const { callFunction } = require('../../../../utils/api');
const { chooseTableFile, buildCsv, buildExcelXml, saveAndShareFile } = require('../../../../utils/tableFile');
const eventBus = require('../../../../utils/eventBus');
const orgSession = require('../../../../utils/orgSession');
const utils = require('./modules/adminUtils');
const { STORAGE_KEY, TAB_LIST, TIMEZONE_OPTIONS, RULE_SCOPE_OPTIONS, VIEW_SCOPE_OPTIONS, VIEW_SCOPE_LABEL_MAP, RULE_SCOPE_LABEL_MAP, PROFILE_EDIT_MODE_OPTIONS, PROFILE_FIELD_TYPE_OPTIONS, NUMBER_RULE_OPTIONS, emptyActivityForm, emptyTemplateForm, emptyRuleForm, emptyHrForm, emptyDepartmentForm, emptyWorkGroupForm, emptyIdentityForm, emptyAdminForm, emptyHrProfileTemplateForm, emptyRuleFilters, emptyHrProfileFilters, emptyHrProfileFilterOptions, emptyResultFilters, buildRuleListItem, buildRuleFilterOptions, filterRuleList, getScopeLabel, normalizeRuleFilters, createSelectedRuleIdMap, markSelectedRules, getProgressColor, buildProgressFillStyle, toNumber, clampNumber, formatScoreFixed3, applyHrProfileFilters } = utils;

const sharedApi = require('./modules/sharedApi');
const activityBehavior = require('./modules/activityBehavior');
const templateBehavior = require('./modules/templateBehavior');
const ruleBehavior = require('./modules/ruleBehavior');
const resultBehavior = require('./modules/resultBehavior');
const hrInfoBehavior = require('./modules/hrInfoBehavior');
const departmentBehavior = require('./modules/departmentBehavior');
const workGroupBehavior = require('./modules/workGroupBehavior');
const identityBehavior = require('./modules/identityBehavior');
const adminManagementBehavior = require('./modules/adminManagementBehavior');
const settingsBehavior = require('./modules/settingsBehavior');
const publicationBehavior = require('./modules/publicationBehavior');
const auditBehavior = require('./modules/auditBehavior');

Page({
  behaviors: [
    sharedApi,
    activityBehavior,
    templateBehavior,
    ruleBehavior,
    resultBehavior,
    hrInfoBehavior,
    departmentBehavior,
    workGroupBehavior,
    identityBehavior,
    adminManagementBehavior,
    settingsBehavior,
    publicationBehavior,
    auditBehavior,
  ],
  data: {
    user: null,
    hasPermission: false,
    isSuperAdmin: false,
    canManageAdmins: false,
    isRootAdmin: false,
    activeTab: utils.TAB_LIST[0],
    visibleTabs: utils.TAB_LIST,
    subAppLabel: '',
    loadingMap: {},
    organizationList: [],
    currentOrganizationId: null,
    currentOrganizationName: '',
    orgFormVisible: false,
    orgFormData: { name: '' },
    scopeOptions: utils.RULE_SCOPE_OPTIONS,
    profileEditModeOptions: utils.PROFILE_EDIT_MODE_OPTIONS,
    profileFieldTypeOptions: utils.PROFILE_FIELD_TYPE_OPTIONS,
    numberRuleOptions: utils.NUMBER_RULE_OPTIONS,
    adminLevelOptions: ['普通管理员', '超级管理员'],
    adminCandidateKeyword: '',
    adminCandidateList: [],
    activityForm: emptyActivityForm(),
    activityList: [],
    currentActivityId: '',
    currentActivityName: '',
    templateForm: emptyTemplateForm(),
    templateList: [],
    ruleForm: emptyRuleForm(),
    draggingClauseTemplateIndex: -1,
    dragActive: false,
    draggingQuestionIndex: -1,
    dragInsertIndex: -1,
    dragGhostTop: 0,
    dragGhostLeft: 0,
    dragGhostWidth: 0,
    dragGhostVisible: false,
    dragTemplateInsertIndex: -1,
    dragTemplateGhostTop: 0,
    dragTemplateGhostLeft: 0,
    dragTemplateGhostWidth: 0,
    dragTemplateGhostVisible: false,
    templateConfigScrollTop: 0,
    clauseTemplateInlineEditIndex: -1,
    expandedQuestionIndex: -1,
    questionFocusIndex: -1,
    templateQuestionScrollInto: '',
    templateQuestionScrollTop: 0,
    questionInputValues: {},
    questionValidationErrors: {},
    // Template CSV import
    showTemplateCsvDialog: false,
    templateCsvHeaders: [],
    templateCsvSamples: [],
    templateCsvMapping: {},
    templateCsvFullRows: [],
    templateCsvReplaceMode: true,
    templateCsvImportRows: [],
    templateCsvImportMappingLabels: [],
    ruleList: [],
    ruleListView: [],
    selectedRuleIds: [],
    selectedRuleIdMap: {},
    visibleRuleAllSelected: false,
    ruleFilters: emptyRuleFilters(),
    ruleFilterOptions: {
      departments: ['全部'],
      identities: ['全部']
    },
    resultFilters: emptyResultFilters(),
    resultFilterOptions: {
      departments: ['全部'],
      identities: ['全部'],
      workGroups: ['全部']
    },
    resultViewOptions: [
      { value: 'overview', label: '明细查看' },
      { value: 'completion', label: '完成率看板' }
    ],
    resultViewLabel: '明细查看',
    resultSortOptions: [
      { value: 'score_desc', label: '按分数从高到低' },
      { value: 'name_asc', label: '按姓名首字母' },
      { value: 'department_asc', label: '按所属部门' },
      { value: 'workGroup_asc', label: '按职能组' }
    ],
    resultSortLabel: '按分数从高到低',
    resultPagination: {
      overview: { page: 0, pageSize: 0, hasMore: true, total: 0 },
      calculation: { page: 0, pageSize: 0, hasMore: true, total: 0 },
      detail: { page: 0, pageSize: 0, hasMore: true, total: 0 },
      completion: { page: 0, pageSize: 0, hasMore: true, total: 0 },
      records: { page: 0, pageSize: 0, hasMore: true, total: 0 }
    },
    // ── Overview result (loaded all at once, cached server‑side) ──

    scoreResultsRaw: {
      overviewRows: [],
      calculationRows: [],
      detailRows: [],
      recordRows: [],
      scorerCompletionRows: [],
      completionBoards: {
        departments: []
      },
      stats: {}
    },
    scoreResultsView: {
      overviewRows: [],
      calculationRows: [],
      detailRows: [],
      recordRows: [],
      scorerCompletionRows: [],
      completionBoards: {
        departments: [],
        identities: [],
        workGroups: []
      }
    },
    selectedResultTarget: null,
    targetRecordRows: [],
    targetRecordLoading: false,
    recordDetailPopupVisible: false,
    recordDetail: null,
    expandedScoreLabelMap: {},
    selectedCompletionDepartment: '',
    departmentScorerRows: [],
    departmentScorerLoading: false,
    scorerTargetPopupVisible: false,
    scorerTargetPopupTitle: '',
    scorerTargetPopupLoading: false,
    scorerTargetPopupRows: [],
    hrProfileTemplateForm: emptyHrProfileTemplateForm(),
    hrProfileFilters: emptyHrProfileFilters(),
    hrProfileFilterOptions: emptyHrProfileFilterOptions(),
    hrProfileRawRows: [],
    hrProfileRows: [],
    _hrInfoKeywordInput: '',
    _hrInfoKeywordTimer: null,
    showHrPersonDetail: false,
    detailHrId: '',
    detailHrProfile: null,
    detailHrTemplate: null,
    detailHrValues: {},
    detailWorkGroupOptions: [],
    detailDepartmentValue: 0,
    detailIdentityValue: 0,
    detailWorkGroupValue: 0,
    detailFieldValues: {},
    detailHrPendingValues: {},
    detailHrAuditStatus: '',
    detailHrAuditStatusText: '',
    detailHrRejectionReason: '',
    detailHrHasPending: false,
    loadingDetailHr: false,
    savingDetailHr: false,
    showAddEditForm: false,
    showTemplateConfig: false,
    hrForm: emptyHrForm(),
    hrList: [],
    adminForm: emptyAdminForm(),
    adminLevelIndex: 0,
    adminList: [],
    latestInviteCode: '',
    csvName: '',
    showCsvMappingDialog: false,
    csvImportRows: [],
    csvImportContent: '',
    csvImportFileName: '',
    csvImportSamples: [],
    csvImportMappingLabels: [],
    csvImportMappingValues: [],
    csvImportLoading: false,
    csvImportSkipInvalid: false,
    showValidationErrors: false,
    validationErrors: [],
    validationErrorCards: [],
    validationErrorSummary: '',
    departmentForm: emptyDepartmentForm(),
    departmentList: [],
    workGroupForm: emptyWorkGroupForm(),
    workGroupList: [],
    identityForm: emptyIdentityForm(),
    identityList: [],
    departmentOptions: [],
    identityOptions: [],
    workGroupOptions: [],
    timezoneOptions: utils.TIMEZONE_OPTIONS,
    timezoneIndex: 20,
    systemConfig: { timezone: 8 },
    // ─── Publication management ───
    publicationsLoading: false,
    pubBatchRunning: false,
    publicationList: [],
    publicationForm: { id: '', activityId: '', activityName: '', isPublished: false },

    // View rule category form (mirrors ruleForm pattern)
    pubViewRuleForm: { id: '', publicationId: '', granteeDepartmentId: '', granteeDepartment: '', granteeIdentityId: '', granteeIdentity: '', isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'own_results', clauseScopeLabel: '仅查看自己的评分结果', clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseDisplayMode: 'score', clauseGradeBands: [], clauses: [] },
    pubViewRuleList: [], pubViewRuleListView: [],
    pubViewRuleFilters: { department: '全部', identity: '全部' },
    pubViewRuleFilterOptions: { departments: ['全部'], identities: ['全部'] },
    pubViewRuleSelectedIds: {},
    pubViewRuleAllSelected: false,

    // Merit rule category form (mirrors ruleForm pattern + quota fields)
    pubMeritRuleForm: { id: '', publicationId: '', granteeDepartmentId: '', granteeDepartment: '', granteeIdentityId: '', granteeIdentity: '', isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'all_people', clauseScopeLabel: '全部成员', clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseQuotaLimit: 0, clauseRequireExactQuota: false, clauses: [] },
    pubMeritRuleList: [], pubMeritRuleListView: [],
    pubMeritRuleFilters: { department: '全部', identity: '全部' },
    pubMeritRuleFilterOptions: { departments: ['全部'], identities: ['全部'] },
    pubMeritRuleSelectedIds: {},
    pubMeritRuleAllSelected: false,

    // Designation picker (now uses clauseId)
    designationList: [],
    showDesignationPicker: false,
    designationPickerClauseId: '',
    designationPickerPubId: '',
    designationPickerHrList: [],
    designationPickerFilteredList: [],
    designationPickerSelectedIds: [],
    designationPickerSelectedList: [],
    desigFilterDept: '全部', desigFilterIdent: '全部',
    desigFilterDeptOptions: ['全部'], desigFilterIdentOptions: ['全部'],
    desigSearchKeyword: '',
    viewScopeOptions: utils.VIEW_SCOPE_OPTIONS,
    viewScopeLabelMap: utils.VIEW_SCOPE_LABEL_MAP,
    displayModeOptions: [
      { value: 'score', label: '分数模式' },
      { value: 'grade', label: '等第模式' }
    ],
    // Grade band expand/collapse (Feature 4)
    expandedGradeBandIndex: -1,
    gradeBandColorMap: { '优秀': '#f59e0b', '良好': '#10b981', '合格': '#3b82f6', '不合格': '#ef4444' },

    // Merit list summary (Feature 5)
    meritSummaryGroups: [],
    meritSummaryFilteredGroups: [],
    meritSummaryFilterDept: '全部',
    meritSummaryFilterIdent: '全部',
    meritSummaryFilterWg: '全部',
    meritSummaryDeptOptions: ['全部'],
    meritSummaryIdentOptions: ['全部'],
    meritSummaryWgOptions: ['全部'],
    expandedMeritSummaryClauseId: ''
  },

  onLoad(options) {
    this._subApp = (options && options.subApp) || 'scoring';
    this.applySubAppFilter();
  },

  onShow() {
    const organizationChanged = orgSession.hasChanged(this);
    const preservedTab = this.data.activeTab;
    if (organizationChanged) {
      this._bootstrapKey = '';
      this._bootstrapComplete = false;
      this._bootstrapPromise = null;
      this.setData({
        activeTab: preservedTab,
        resultFilters: emptyResultFilters(),
        resultSearchText: '',
        resultPage: 1,
        recordDetailPopupVisible: false,
        scorerTargetPopupVisible: false,
        showAddEditForm: false,
        showHrPersonDetail: false
      });
    }
    // 刷新组织名称（从 storage 读取）
    const activeOrgName = wx.getStorageSync('activeOrgName') || '';
    if (activeOrgName && activeOrgName !== this.data.currentOrganizationName) {
      this.setData({ currentOrganizationName: activeOrgName });
    }
    // 监听组织切换事件（匹配 portal 页模式）
    if (!this._boundOnOrgChanged) {
      this._boundOnOrgChanged = this._onOrgChanged.bind(this);
      eventBus.on('org:changed', this._boundOnOrgChanged);
    }
    this.bootstrapPage().then(() => {
      if (organizationChanged) this._refreshActiveOrganizationTab(preservedTab);
    });
  },

  onHide() {
    // 页面隐藏时移除监听，避免重复注册
    if (this._boundOnOrgChanged) {
      eventBus.off('org:changed', this._boundOnOrgChanged);
      this._boundOnOrgChanged = null;
    }
  },

  _onOrgChanged() {
    // 组织切换后刷新页面数据
    const activeOrgName = wx.getStorageSync('activeOrgName') || '';
    this.setData({ currentOrganizationName: activeOrgName });
    this._bootstrapKey = '';
    this._bootstrapComplete = false;
    this.bootstrapPage().then(() => this._refreshActiveOrganizationTab(this.data.activeTab));
  },

  _refreshActiveOrganizationTab(tab) {
    const loaders = {
      results: () => this.loadScoreResults({ nocache: true }),
      hrInfo: () => Promise.all([this.loadHrList(), this.loadHrProfileAdminData()]),
      departments: () => this.loadDepartmentList(),
      workGroups: () => this.loadWorkGroupList(),
      identities: () => this.loadIdentityList(),
      rules: () => this.loadRuleList(),
      activities: () => this.loadActivityList(),
      templates: () => this.loadTemplateList(),
      admins: () => this.loadAdminList(),
      settings: () => Promise.all([this.loadSystemConfig(), this.loadOrganizations()]),
      publications: () => this.data.currentActivityId ? this.loadPublicationData(this.data.currentActivityId) : Promise.resolve()
    };
    if (loaders[tab]) return loaders[tab]();
    return Promise.resolve();
  },

  onOrgTap() {
    const hasUnsavedWork = !!(
      this.data.showAddEditForm || this.data.showCsvMappingDialog ||
      this.data.orgFormVisible || this.data.auditTemplateStepEditorVisible ||
      this.data.auditStepConditionEditorVisible || this.data.auditStarterConditionEditorVisible ||
      (this.data.ruleForm && (this.data.ruleForm.isRuleClauseEditorVisible || this.data.ruleForm.isTemplateConfigEditorVisible))
    );
    if (hasUnsavedWork) {
      wx.showModal({ title: '存在未保存内容', content: '请先保存或放弃当前编辑，再切换组织。', showCancel: false });
      return;
    }
    wx.navigateTo({ url: '/subpackages/org/pages/switch/switch' });
  },

  applySubAppFilter() {
    const subApp = this._subApp || 'scoring';
    const SUB_APP_ADMIN_TABS = {
      scoring: ['activities', 'templates', 'rules', 'results', 'publications'],
      hr: ['hrInfo', 'departments', 'workGroups', 'identities'],
      system: ['admins', 'settings'],
      audit: ['auditTemplates', 'auditStamps', 'auditSubmissions', 'auditVerification']
    };
    this._visibleTabs = SUB_APP_ADMIN_TABS[subApp] || SUB_APP_ADMIN_TABS.scoring;
    const SUB_APP_LABELS = { scoring: '考核评分', hr: '人事信息', system: '系统配置', audit: '审核管理' };
    this._subAppLabel = SUB_APP_LABELS[subApp] || '';
    this.setData({
      visibleTabs: this._visibleTabs,
      subAppLabel: this._subAppLabel,
      activeTab: this._visibleTabs[0]
    });
  },

  async bootstrapPage() {
    const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
    const adminProfile = roleProfiles.admin;
    const isSuperAdmin = !!adminProfile && adminProfile.adminLevel === 'super_admin';
    const isRootAdmin = !!adminProfile && adminProfile.adminLevel === 'root_admin';

    if (!adminProfile) {
      this.setData({
        user: null,
        hasPermission: false,
        isSuperAdmin: false,
        isRootAdmin: false,
        canManageAdmins: false
      });
      return;
    }

    const canManageAdmins = isSuperAdmin || isRootAdmin;
    const activeOrgId = wx.getStorageSync('activeOrgId') || '';
    const bootstrapKey = [this._subApp || 'scoring', activeOrgId, adminProfile.id || ''].join('::');

    if (this._bootstrapKey === bootstrapKey && (this._bootstrapComplete || this._bootstrapPromise)) {
      return this._bootstrapPromise;
    }
    this._bootstrapKey = bootstrapKey;
    this._bootstrapComplete = false;

    // 读取当前活跃组织名称
    const activeOrgName = wx.getStorageSync('activeOrgName') || '';

    this.setData({
      user: adminProfile,
      hasPermission: true,
      isSuperAdmin,
      isRootAdmin,
      canManageAdmins,
      currentOrganizationName: activeOrgName || this.data.currentOrganizationName,
      resultViewOptions: [
        { value: 'overview', label: '明细查看' },
        { value: 'completion', label: '完成率看板' }
      ],
      resultViewLabel: '明细查看',
      resultSortOptions: [
        { value: 'score_desc', label: '按分数从高到低' },
        { value: 'name_asc', label: '按姓名首字母' },
        { value: 'department_asc', label: '按所属部门' },
        { value: 'workGroup_asc', label: '按职能组' }
      ],
      resultSortLabel: '按分数从高到低',
      adminLevelOptions: isRootAdmin
        ? ['普通管理员', '超级管理员', '至高权限管理员']
        : ['普通管理员', '超级管理员']
    });

    const loadSubApp = async () => {
      if (this._subApp === 'audit') {
        await Promise.all([
          this.loadDepartmentList(),
          this.loadIdentityList(),
          this.loadHrList()
        ]);
        await this.loadWorkGroupList();
        await Promise.all([
          this.loadAuditFlowTemplates(),
          this.loadStamps(),
          this.loadAuditSubmissions(),
          this.loadVerificationPermissions()
        ]);
        return;
      }

      if (this._subApp === 'hr') {
        await Promise.all([this.loadDepartmentList(), this.loadIdentityList()]);
        await this.loadWorkGroupList();
        if (!this._csvImportActive && !this.data.showCsvMappingDialog) {
          await Promise.all([this.loadHrList(), this.loadHrProfileAdminData()]);
        }
        this.updateHrFormOptions();
        return;
      }

      if (this._subApp === 'system') {
        await Promise.all([
          this.loadAdminList(),
          this.loadHrList(),
          this.loadSystemConfig(),
          this.loadOrganizations()
        ]);
        return;
      }

      await Promise.all([
        this.loadActivityList(),
        this.loadTemplateList(),
        this.loadDepartmentList(),
        this.loadIdentityList()
      ]);
      await this.loadWorkGroupList();
      await this.loadRuleList();
    };

    this._bootstrapPromise = loadSubApp()
      .finally(() => {
        if (this._bootstrapKey === bootstrapKey) {
          this._bootstrapComplete = true;
          this._bootstrapPromise = null;
        }
      });
    return this._bootstrapPromise;
  },

  setLoading(key, value) {
    this.setData({
      loadingMap: {
        ...this.data.loadingMap,
        [key]: value
      }
    });
  },

  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (TAB_LIST.indexOf(tab) === -1) {
      return;
    }
    if (this._visibleTabs && this._visibleTabs.indexOf(tab) === -1) {
      return;
    }
    this.setData({ activeTab: tab });
    if (tab === 'results') {
      if (!this.data.currentActivityId) {
        this.loadActivityList().then(() => {
          if (this.data.currentActivityId) {
            this.loadScoreResults();
          }
        });
      } else {
        this.loadScoreResults();
      }
    }
    if (tab === 'hrInfo') {
      if (!this._csvImportActive && !this.data.showCsvMappingDialog) {
        this.loadHrProfileAdminData();
        this.loadHrList();
      }
      this.updateHrFormOptions();
    }
    if (tab === 'departments') {
      this.loadDepartmentList();
    }
    if (tab === 'workGroups') {
      this.loadWorkGroupList();
    }
    if (tab === 'identities') {
      this.loadIdentityList();
    }
    if (tab === 'rules') {
      this.loadRuleList();
      if (!this.data.departmentList.length) {
        this.loadDepartmentList();
      }
      if (!this.data.identityList.length) {
        this.loadIdentityList();
      }
    }
    if (tab === 'settings') {
      this.loadSystemConfig();
    }
    if (tab === 'publications') {
      if (!this.data.departmentList.length) this.loadDepartmentList();
      if (!this.data.identityList.length) this.loadIdentityList();
      this.setData({ publicationsLoading: true });
      this.loadActivityList().then(async () => {
        const currentActivityId = this.data.currentActivityId;
        if (currentActivityId) {
          if (!this.data.publicationForm.activityId) {
            this.setData({
              'publicationForm.activityId': currentActivityId,
              'publicationForm.activityName': this.data.currentActivityName
            });
          }
          await this.loadPublicationData(currentActivityId);
          if (!this.data.publicationForm.id && currentActivityId) {
            await this.savePublication(true);
          }
          await this.loadMeritListSummary();
        }
        this.setData({ publicationsLoading: false });
      }).catch(() => { this.setData({ publicationsLoading: false }); });
    }
    // ── Audit tabs ──
    if (tab === 'auditTemplates') {
      this.loadAuditFlowTemplates();
    }
    if (tab === 'auditStamps') {
      this.loadStamps();
      if (!this.data.identityList.length) this.loadIdentityList();
    }
    if (tab === 'auditSubmissions') {
      this.loadAuditSubmissions();
    }
    if (tab === 'auditVerification') {
      this.loadVerificationPermissions();
    }
  },

  goPortal() {
    wx.redirectTo({
      url: '/pages/portal/portal'
    });
  },

  wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },

  noop() {},

  async _ensureDepartmentsLoaded() {
    if (this.data.departmentList && this.data.departmentList.length) return;
    const result = await this.callCloud('listDepartments');
    if (result.status === 'success') {
      this.setData({ departmentList: result.departments || [] });
    }
  },

  async _ensureIdentitiesLoaded() {
    if (this.data.identityList && this.data.identityList.length) return;
    const result = await this.callCloud('listIdentities');
    if (result.status === 'success') {
      this.setData({ identityList: result.identities || [] });
    }
  },

  async _ensureWorkGroupsLoaded() {
    if (this.data.workGroupList && this.data.workGroupList.length) return;
    const result = await this.callCloud('listWorkGroups');
    if (result.status === 'success') {
      const items = (result.workGroups || []).map((item) => {
        const department = this.data.departmentList.find(d => (
          d.id === item.departmentId || d.code === item.departmentCode
        ));
        return {
          ...item,
          departmentCode: item.departmentCode || (department ? department.code : ''),
          departmentName: item.departmentName || (department ? department.name : '')
        };
      });
      this.setData({ workGroupList: items });
    }
  },

  updateDetailWorkGroupOptions(deptId) {
    const id = deptId || this.data.detailHrValues._departmentId || (this.data.detailHrProfile || {}).departmentId || '';
    if (!id) {
      this.setData({ detailWorkGroupOptions: ['无'], detailWorkGroupValue: 0 });
      return;
    }
    const idStr = String(id);
    const wgs = this.data.workGroupList
      .filter(w => String(w.departmentId) === idStr)
      .map(w => w.name);
    const options = ['无', ...wgs];
    const wgName = this.data.detailHrValues._workGroupName || '';
    const wgIdx = options.indexOf(wgName);
    this.setData({
      detailWorkGroupOptions: options,
      detailWorkGroupValue: wgIdx >= 0 ? wgIdx : 0
    });
  },

  _ensureDetailFormOptions() {
    this.setData({
      departmentOptions: this.data.departmentList.map(item => item.name),
      identityOptions: this.data.identityList.map(item => item.name)
    });
  },

  _syncDetailPickerValues() {
    const vals = this.data.detailHrValues || {};
    const deptValue = this.data.departmentOptions.indexOf(vals._departmentName);
    const identityValue = this.data.identityOptions.indexOf(vals._identityName);

    const fieldValues = { ...(this.data.detailFieldValues || {}) };
    const template = this.data.detailHrTemplate;
    if (template && template.fields) {
      template.fields.forEach(f => {
        if (f.type === 'sequence' && Array.isArray(f.options)) {
          const idx = f.options.indexOf(vals[f.id]);
          fieldValues[f.id] = idx >= 0 ? idx : 0;
        }
      });
    }

    this.setData({
      detailDepartmentValue: deptValue >= 0 ? deptValue : 0,
      detailIdentityValue: identityValue >= 0 ? identityValue : 0,
      detailFieldValues: fieldValues
    });
  },

  escapeCsvCell(value) {
    let s = String(value == null ? '' : value);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
});
