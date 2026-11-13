const localeCopy = require('../../../package-resources/locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/publicationBehavior');
const { format: localeFormat } = require('../../../package-resources/locales/runtime');
// Behavior: publication tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('../../../package-resources/subpackages/scoring/pages/admin/modules/adminUtils');
const { saveAndShareFile } = require('../../../package-resources/utils/tableFile');
const orgSession = require('../../../../../utils/orgSession');
const { createResultError, getErrorText } = require('../../../../../utils/api');
const designationCandidateView = require('../../../package-resources/subpackages/scoring/pages/admin/modules/designationCandidateView');
const adminCopy = require('../../../package-resources/locales/zh-CN/generated/subpackages/scoring/pages/admin/admin');
const homeCopy = require('../../../../../locales/zh-CN/home').text;
const natureCopy = require('../../../../../locales/zh-CN/identityNatureRelations');
function natureFields(page, form) {
  const value = form || {}, natures = page.data.publicationNatures || [], identities = page.data.identityList || [];
  const selected = value.natureIds || [], clauseSelected = value.clauseNatureIds || [];
  return Object.assign({}, value, {
    natureIds: selected, clauseNatureIds: clauseSelected,
    natureOptions: natures.map(item => Object.assign({}, item, { selected: selected.indexOf(item.id) >= 0 })),
    clauseNatureOptions: natures.map(item => Object.assign({}, item, { selected: clauseSelected.indexOf(item.id) >= 0 })),
    applicableIdentities: identities.filter(item => (item.natureIds || []).some(id => selected.indexOf(id) >= 0)),
    clauseApplicableIdentities: identities.filter(item => (item.natureIds || []).some(id => clauseSelected.indexOf(id) >= 0))
  });
}
function confirmNatureChange(names) {
  return new Promise(resolve => wx.showModal({ title: natureCopy.legacyScopeChangeTitle,
    content: natureCopy.legacyScopeChangeHelp(names), success: result => resolve(Boolean(result.confirm)), fail: () => resolve(false) }));
}
const meritScopes = [
  { value: 'all_people', aliases: ['all_people', 'identity_only'], label: adminCopy.meritScopeOrganization },
  { value: 'same_department_identity', aliases: ['same_department_identity', 'same_department_all'], label: adminCopy.meritScopeDepartment },
  { value: 'same_work_group_identity', aliases: ['same_work_group_identity', 'same_work_group_all'], label: adminCopy.meritScopeWorkGroup }
];
function meritScopeOptions(current) { return meritScopes.map(item => ({ value: item.aliases.indexOf(current) >= 0 ? current : item.value, label: item.label })); }
function scopeLabel(value, merit) {
  const option = merit ? meritScopes.find(item => item.aliases.indexOf(value) >= 0) : utils.VIEW_SCOPE_OPTIONS.find(item => item.value === value);
  return option ? option.label : (merit ? adminCopy.meritScopeUnknown : homeCopy.publicationGroupUnknown);
}
function presentRules(rows, merit) {
  return (rows || []).map(row => Object.assign({}, row, { clauses: (row.clauses || []).map(clause => Object.assign({}, clause, { scopeLabel: scopeLabel(clause.scopeType, merit), targetIdentity: merit || ['same_department_identity', 'same_work_group_identity'].indexOf(clause.scopeType) >= 0 ? clause.targetIdentity : '' })) }));
}
function confirmReplaceRules(rows, merit) {
  return new Promise(resolve => wx.showModal({
    title: merit ? adminCopy.applySelectedMeritRules : adminCopy.applySelectedViewRules,
    content: [merit ? adminCopy.replaceMeritRuleClausesConfirm : adminCopy.replaceViewRuleClausesConfirm, ...rows.map(row => [row.granteeDepartment, row.granteeIdentity].filter(Boolean).join(' · '))].join('\n'),
    success: result => resolve(Boolean(result.confirm)), fail: () => resolve(false)
  }));
}

function canPublish(page, action) {
  if (['create','update','delete'].indexOf(action) >= 0 && (page.data.publicationLoadFailed || page.data.loadingMap && page.data.loadingMap.publications || !orgSession.isCurrent(page._publicationLoadedSession) || page._publicationLoadedActivity !== String((page.data.publicationForm || {}).activityId || ''))) return false;
  if (page.data.authorizationEnforced) return (page.data.actionCapabilities || {})['scoring.publications.' + action] === true;
  return page.data.isSuperAdmin || (page.data.user && page.data.user.permissions || {})[action === 'delete' ? 'scoring.publications.delete' : 'scoring.publications'] === true;
}

function emptyMeritSummaryState() {
  return {
    meritSummaryGroups: [],
    meritSummaryFilteredGroups: [],
    meritSummaryDeptOptions: [localeCopy.copy_31d4595959],
    meritSummaryIdentOptions: [localeCopy.copy_31d4595959],
    meritSummaryWgOptions: [localeCopy.copy_31d4595959],
    meritSummaryFilterDept: localeCopy.copy_31d4595959,
    meritSummaryFilterIdent: localeCopy.copy_31d4595959,
    meritSummaryFilterWg: localeCopy.copy_31d4595959,
    meritSummaryLoading: false,
    meritSummaryLoaded: false,
    meritSummaryLoadFailed: false,
    expandedMeritSummaryClauseId: ''
  };
}

module.exports = Behavior({
  data: { publicationCopy: localeCopy, publicationNatureCopy: natureCopy, publicationNatures: [], publicationLoadFailed: false, meritScopeOptions: meritScopeOptions('all_people') },
  methods: {
    async togglePublicationNature(e) {
      const name = e.currentTarget.dataset.form, clause = e.currentTarget.dataset.clause === 'true';
      if (['pubViewRuleForm', 'pubMeritRuleForm'].indexOf(name) < 0) return;
      const original = this.data[name], key = clause ? 'clauseNatureIds' : 'natureIds', id = e.currentTarget.dataset.id;
      if (!(this.data.publicationNatures || []).some(item => item.id === id)) return;
      const ids = (original[key] || []).indexOf(id) >= 0 ? original[key].filter(value => value !== id) : [...(original[key] || []), id];
      const field = clause ? 'clauseTargetIdentityId' : 'granteeIdentityId', label = clause ? 'clauseTargetIdentity' : 'granteeIdentity';
      const next = Object.assign({}, original, { [key]: ids });
      const selected = (this.data.identityList || []).find(item => item.id === original[field]);
      if (selected && !(selected.natureIds || []).some(value => ids.indexOf(value) >= 0)) {
        const session = orgSession.getSnapshot();
        const confirmed = await new Promise(resolve => wx.showModal({ title: natureCopy.incompatibleSelectionTitle,
          content: [natureCopy.incompatibleSelectionHelp, selected.name].join('\n'), success: result => resolve(Boolean(result.confirm)), fail: () => resolve(false) }));
        if (!confirmed || !orgSession.isCurrent(session) || this.data[name] !== original) return;
        next[field] = ''; next[label] = '';
      }
      this.setData({ [name]: natureFields(this, next) });
    },
    async confirmPublicationNatures(form) {
      const entries = [form].concat(form.clauses || []);
      if (entries.some(item => !Array.isArray(item.natureIds) || !item.natureIds.length)) {
        wx.showToast({ title: natureCopy.selectNatureRequired, icon: 'none' }); return false;
      }
      const session = orgSession.getSnapshot();
      for (const entry of entries.filter(item => item.legacyNatureScope)) {
        if (!await confirmNatureChange((this.data.publicationNatures || []).filter(item => entry.natureIds.indexOf(item.id) >= 0).map(item => item.name))) return false;
        if (!orgSession.isCurrent(session)) return false;
      }
      return true;
    },
    async confirmPublicationBatchNatures(form, rows) {
      if (!await this.confirmPublicationNatures(form)) return false;
      if (rows.some(row => !row.natureIds)) {
        return confirmNatureChange((this.data.publicationNatures || []).filter(item => form.natureIds.indexOf(item.id) >= 0).map(item => item.name));
      }
      return true;
    },
    retryPublicationData() { return this.loadPublicationData(this.data.publicationForm.activityId); },
    async loadPublicationData(activityId) {
      const request = orgSession.beginRequest(this, 'publicationData');
      const selectedActivityId = String(activityId || '');
      if (!activityId) {
        this.setData({
          publicationLoadFailed: false,
          publicationForm: { id: '', activityId: '', activityName: '', isPublished: false },
          pubViewRuleList: [],
          pubViewRuleListView: [],
          pubMeritRuleList: [],
          pubMeritRuleListView: [],
          designationList: [],
          publicationAssignmentCandidates: [],
          ...emptyMeritSummaryState()
        });
        return;
      }
      if (this._publicationLoadedActivity !== selectedActivityId || !orgSession.isCurrent(this._publicationLoadedSession)) this.setData(Object.assign(emptyMeritSummaryState(), { pubViewRuleList: [], pubViewRuleListView: [], pubMeritRuleList: [], pubMeritRuleListView: [], designationList: [], publicationAssignmentCandidates: [] }));
      this.setLoading('publications', true);
      try {
        const result = await this.callCloud('getResultPublication', { activityId });
        if (!orgSession.isRequestCurrent(this, request)
          || String((this.data.publicationForm && this.data.publicationForm.activityId) || '') !== selectedActivityId) return;
        if (result.status === 'success') {
          this._publicationLoadedActivity = selectedActivityId;
          this._publicationLoadedSession = orgSession.getSnapshot();
          const pub = result.publication;
          if (result.configurationCandidates) this.setData({ departmentList: result.configurationCandidates.departments || [], identityList: result.configurationCandidates.identities || [], publicationNatures: result.configurationCandidates.natures || [] });
          const viewRules = presentRules(result.viewRules, false);
          const meritRules = presentRules(result.meritRules, true);
          this.setData({
            publicationLoadFailed: false,
            publicationForm: pub ? { id: pub.id, activityId: pub.activityId, activityName: this.data.publicationForm.activityName, isPublished: !!pub.isPublished } : { id: '', activityId, activityName: this.data.publicationForm.activityName, isPublished: false },
            pubViewRuleList: viewRules, pubViewRuleListView: viewRules,
            pubMeritRuleList: meritRules, pubMeritRuleListView: meritRules,
            designationList: result.meritListDesignations || [],
            publicationAssignmentCandidates: result.assignmentCandidates || [],
            pubViewRuleSelectedIds: {}, pubViewRuleAllSelected: false,
            pubMeritRuleSelectedIds: {}, pubMeritRuleAllSelected: false
          });
          this.rebuildPubViewRuleFilters(viewRules);
          this.rebuildPubMeritRuleFilters(meritRules);
          this.setData({ pubViewRuleForm: natureFields(this, this.data.pubViewRuleForm), pubMeritRuleForm: natureFields(this, this.data.pubMeritRuleForm) });
          if (pub) await this.loadMeritListSummary(activityId);
        } else {
          this.setData({ publicationLoadFailed: true });
        }
      } catch (e) {
        if (orgSession.isRequestCurrent(this, request) && !(e && e.silent)) {
          this.setData({ publicationLoadFailed: true });
        }
      }
      if (orgSession.isRequestCurrent(this, request)) this.setLoading('publications', false);
    },

    // ─── Merit list summary (Feature 5) ───,

    async loadMeritListSummary(activityIdOverride) {
      const activityId = activityIdOverride || this.data.publicationForm.activityId;
      if (!activityId) return;
      const request = orgSession.beginRequest(this, 'meritListSummary');
      this.setData({
        meritSummaryLoading: true,
        meritSummaryLoaded: false,
        meritSummaryLoadFailed: false
      });
      try {
        const result = await this.callCloud('getMeritListSummary', { activityId });
        if (!orgSession.isRequestCurrent(this, request) || this.data.publicationForm.activityId !== activityId) return;
        if (result.status === 'success') {
          const groups = result.groups || [];
          // Build filter options
          const deptSet = new Set(), identSet = new Set(), wgSet = new Set();
          groups.forEach(g => {
            g.members.forEach(m => {
              if (m.department) deptSet.add(m.department);
              if (m.identity) identSet.add(m.identity);
              if (m.workGroup) wgSet.add(m.workGroup);
            });
          });
          this.setData({
            meritSummaryGroups: groups,
            meritSummaryFilteredGroups: groups,
            meritSummaryDeptOptions: [localeCopy.copy_31d4595959, ...Array.from(deptSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))],
            meritSummaryIdentOptions: [localeCopy.copy_31d4595959, ...Array.from(identSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))],
            meritSummaryWgOptions: [localeCopy.copy_31d4595959, ...Array.from(wgSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))],
            meritSummaryFilterDept: localeCopy.copy_31d4595959, meritSummaryFilterIdent: localeCopy.copy_31d4595959, meritSummaryFilterWg: localeCopy.copy_31d4595959,
            meritSummaryLoaded: true,
            meritSummaryLoadFailed: false
          });
        } else {
          this.setData({ meritSummaryLoadFailed: true });
        }
      } catch (e) {
        if (orgSession.isRequestCurrent(this, request) && !(e && e.silent)) {
          this.setData({ meritSummaryLoadFailed: true });
        }
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setData({ meritSummaryLoading: false });
      }
    },

    applyMeritSummaryFilters() {
      let groups = this.data.meritSummaryGroups || [];
      const deptFilter = this.data.meritSummaryFilterDept;
      const identFilter = this.data.meritSummaryFilterIdent;
      const wgFilter = this.data.meritSummaryFilterWg;
      if (deptFilter !== localeCopy.copy_31d4595959 || identFilter !== localeCopy.copy_31d4595959 || wgFilter !== localeCopy.copy_31d4595959) {
        groups = groups.map(g => ({
          ...g,
          members: g.members.filter(m =>
            (deptFilter === localeCopy.copy_31d4595959 || m.department === deptFilter) &&
            (identFilter === localeCopy.copy_31d4595959 || m.identity === identFilter) &&
            (wgFilter === localeCopy.copy_31d4595959 || m.workGroup === wgFilter)
          )
        })).filter(g => g.members.length > 0);
      }
      this.setData({ meritSummaryFilteredGroups: groups });
    },

    onMeritSummaryFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const options = this.data[field === 'department' ? 'meritSummaryDeptOptions' : (field === 'identity' ? 'meritSummaryIdentOptions' : 'meritSummaryWgOptions')];
      const value = options[Number(e.detail.value)] || localeCopy.copy_31d4595959;
      if (field === 'department') this.setData({ meritSummaryFilterDept: value });
      else if (field === 'identity') this.setData({ meritSummaryFilterIdent: value });
      else this.setData({ meritSummaryFilterWg: value });
      this.applyMeritSummaryFilters();
    },

    toggleMeritSummaryGroup(e) {
      const clauseId = e.currentTarget.dataset.clauseId || '';
      this.setData({ expandedMeritSummaryClauseId: this.data.expandedMeritSummaryClauseId === clauseId ? '' : clauseId });
    },

    async exportMeritListSummary() {
      if (!canPublish(this, 'export')) return;
      const activityId = this.data.publicationForm.activityId;
      if (!activityId) { wx.showToast({ title: localeCopy.copy_c5ed87fa11, icon: 'none' }); return; }
      this.setLoading('exportMeritSummary', true);
      try {
        const result = await this.callCloud('exportMeritListSummary', {
          activityId,
          filterDepartment: this.data.meritSummaryFilterDept === localeCopy.copy_31d4595959 ? '' : this.data.meritSummaryFilterDept,
          filterIdentity: this.data.meritSummaryFilterIdent === localeCopy.copy_31d4595959 ? '' : this.data.meritSummaryFilterIdent,
          filterWorkGroup: this.data.meritSummaryFilterWg === localeCopy.copy_31d4595959 ? '' : this.data.meritSummaryFilterWg
        });
        if (result.status === 'success' && result.fileContent) {
          saveAndShareFile(result.fileContent, result.fileName || localeCopy.copy_08f97574f4, result.extension || 'xlsx');
          wx.showToast({ title: localeFormat(localeCopy.copy_6b2200af27, [result.rowCount || 0]), icon: 'success' });
        } else {
          wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_2b61466286), icon: 'none' });
        }
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_2b61466286), icon: 'none' }); }
      this.setLoading('exportMeritSummary', false);
    },

    // ─── Grade band expand/collapse (Feature 4) ───,

    toggleGradeBandExpand(e) {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      this.setData({ expandedGradeBandIndex: this.data.expandedGradeBandIndex === index ? -1 : index });
    },

    getGradeBandColor(gradeName) {
      const map = this.data.gradeBandColorMap || {};
      if (map[gradeName]) return map[gradeName];
      // Fallback: hash the name to pick a color
      const palette = ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'];
      let hash = 0;
      for (let i = 0; i < gradeName.length; i++) hash = ((hash << 5) - hash) + gradeName.charCodeAt(i);
      return palette[Math.abs(hash) % palette.length];
    },

    // ─── Publication toggle ───,

    async onPublicationActivityChange(e) {
      const idx = parseInt(e.detail.value, 10);
      const activity = this.data.activityList[idx];
      if (activity) {
        const activityId = activity.id || '';
        // 重置整个 publicationForm（含 id），避免残留上一个活动的旧数据
        this.setData({
          publicationForm: { id: '', activityId, activityName: activity.name || '', isPublished: false },
          pubViewRuleList: [],
          pubViewRuleListView: [],
          pubMeritRuleList: [],
          pubMeritRuleListView: [],
          designationList: [],
          publicationAssignmentCandidates: [],
          ...emptyMeritSummaryState()
        });
        // 切换活动只读取现有配置；新配置必须由管理员明确保存。
        await this.loadPublicationData(activityId);
      }
    },

    onPublicationToggle(e) { this.setData({ 'publicationForm.isPublished': !!e.detail.value }); },

    async savePublication() {
      if (!canPublish(this, this.data.publicationForm.id ? 'update' : 'create')) return;
      const form = this.data.publicationForm;
      if (!form.activityId) { wx.showToast({ title: localeCopy.copy_21368b3e76, icon: 'none' }); return; }
      this.setLoading('savePublication', true);
      try {
        const result = await this.callCloud('saveResultPublication', { activityId: form.activityId, isPublished: form.isPublished });
        if (result.status === 'success') {
          wx.showToast({ title: localeCopy.copy_0aacec2714, icon: 'success' });
          this.setData({ 'publicationForm.id': result.publication.id, 'publicationForm.isPublished': !!result.publication.isPublished });
        } else { wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_215e3c57da), icon: 'none' }); }
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_215e3c57da), icon: 'none' }); }
      this.setLoading('savePublication', false);
    },

    // ─── View Rule Filters ───,

    rebuildPubViewRuleFilters(list) {
      const depts = new Set(); const idents = new Set();
      (list || []).forEach(r => { if (r.granteeDepartment) depts.add(r.granteeDepartment); if (r.granteeIdentity) idents.add(r.granteeIdentity); });
      this.setData({
        pubViewRuleFilterOptions: { departments: [localeCopy.copy_31d4595959, ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))], identities: [localeCopy.copy_31d4595959, ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))] },
        pubViewRuleListView: list || []
      });
    },

    rebuildPubMeritRuleFilters(list) {
      const depts = new Set(); const idents = new Set();
      (list || []).forEach(r => { if (r.granteeDepartment) depts.add(r.granteeDepartment); if (r.granteeIdentity) idents.add(r.granteeIdentity); });
      this.setData({
        pubMeritRuleFilterOptions: { departments: [localeCopy.copy_31d4595959, ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))], identities: [localeCopy.copy_31d4595959, ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))] },
        pubMeritRuleListView: list || []
      });
    },

    onPubViewRuleFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const optionKey = field === 'identity' ? 'identities' : 'departments';
      const options = (this.data.pubViewRuleFilterOptions || {})[optionKey] || [localeCopy.copy_31d4595959];
      const value = options[Number(e.detail.value)] || localeCopy.copy_31d4595959;
      const next = { ...this.data.pubViewRuleFilters, [field]: value };
      this.setData({ pubViewRuleFilters: next });
      let list = this.data.pubViewRuleList || [];
      if (next.department && next.department !== localeCopy.copy_31d4595959) list = list.filter(r => r.granteeDepartment === next.department);
      if (next.identity && next.identity !== localeCopy.copy_31d4595959) list = list.filter(r => r.granteeIdentity === next.identity);
      this.setData({ pubViewRuleListView: list, pubViewRuleSelectedIds: {}, pubViewRuleAllSelected: false });
    },

    onPubMeritRuleFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const optionKey = field === 'identity' ? 'identities' : 'departments';
      const options = (this.data.pubMeritRuleFilterOptions || {})[optionKey] || [localeCopy.copy_31d4595959];
      const value = options[Number(e.detail.value)] || localeCopy.copy_31d4595959;
      const next = { ...this.data.pubMeritRuleFilters, [field]: value };
      this.setData({ pubMeritRuleFilters: next });
      let list = this.data.pubMeritRuleList || [];
      if (next.department && next.department !== localeCopy.copy_31d4595959) list = list.filter(r => r.granteeDepartment === next.department);
      if (next.identity && next.identity !== localeCopy.copy_31d4595959) list = list.filter(r => r.granteeIdentity === next.identity);
      this.setData({ pubMeritRuleListView: list, pubMeritRuleSelectedIds: {}, pubMeritRuleAllSelected: false });
    },

    // ─── View Rule Category CRUD ───,

    startNewPubViewRule() {
      this.setData({ pubViewRuleForm: natureFields(this, { id: '', publicationId: this.data.publicationForm.id || '', granteeDepartmentId: '', granteeDepartment: '', granteeIdentityId: '', granteeIdentity: '', isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'own_results', clauseScopeLabel: localeCopy.copy_9a4a6e8793, clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseDisplayMode: 'score', clauseGradeBands: [], clauses: [] }) });
    },

    editPubViewRule(e) {
      if (!canPublish(this, 'update')) return;
      const id = e.currentTarget.dataset.id;
      const rule = this.data.pubViewRuleList.find(r => r.id === id);
      if (!rule) return;
      this.setData({ pubViewRuleForm: natureFields(this, { id: rule.id, natureIds: rule.natureIds || [], legacyNatureScope: !rule.natureIds, publicationId: rule.publicationId, granteeDepartmentId: rule.granteeDepartmentId, granteeDepartment: rule.granteeDepartment, granteeIdentityId: rule.granteeIdentityId, granteeIdentity: rule.granteeIdentity, isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'own_results', clauseScopeLabel: localeCopy.copy_9a4a6e8793, clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseDisplayMode: 'score', clauseGradeBands: [], clauses: (rule.clauses || []).map(c => ({ ...c, natureIds: c.natureIds || [], legacyNatureScope: !c.natureIds, scopeLabel: c.scopeLabel || '', targetIdentityId: c.targetIdentityId || '', targetIdentity: c.targetIdentity || '', displayMode: c.displayMode || 'score', gradeBands: (c.gradeBands || []).map(gb => ({ minScore: gb.minScore, maxScore: gb.maxScore, gradeName: gb.gradeName })) })) }) });
    },

    async savePubViewRule() {
      if (!canPublish(this, this.data.pubViewRuleForm.id ? 'update' : 'create')) return;
      const f = this.data.pubViewRuleForm;
      if (!await this.confirmPublicationNatures(f) || this.data.pubViewRuleForm !== f || !canPublish(this, f.id ? 'update' : 'create')) return;
      if (!f.granteeDepartmentId || !f.granteeIdentityId) { wx.showToast({ title: localeCopy.viewerScopeRequired, icon: 'none' }); return; }
      if (!f.publicationId) { wx.showToast({ title: localeCopy.copy_0dff72de43, icon: 'none' }); return; }
      this.setLoading('savePubViewRule', true);
      try {
        const result = await this.callCloud('savePubViewRule', { id: f.id, natureIds: f.natureIds, publicationId: f.publicationId, granteeDepartmentId: f.granteeDepartmentId, granteeIdentityId: f.granteeIdentityId, clauses: f.clauses.map(c => ({ natureIds: c.natureIds, scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, displayMode: c.displayMode || 'score', gradeBands: c.displayMode === 'grade' ? (c.gradeBands || []) : [] })) });
        if (result.status === 'success') { wx.showToast({ title: localeCopy.copy_0aacec2714, icon: 'success' }); this.startNewPubViewRule(); this.loadPublicationData(this.data.publicationForm.activityId); }
        else { wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_215e3c57da), icon: 'none' }); }
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_215e3c57da), icon: 'none' }); }
      this.setLoading('savePubViewRule', false);
    },

    async deletePubViewRule(e) {
      if (!canPublish(this, 'delete')) return;
      const ruleId = e.currentTarget.dataset.id;
      if (!ruleId) return;
      const that = this;
      wx.showModal({ title: localeCopy.copy_7f31eec657, content: localeCopy.copy_1c746ef3fb, success: async (res) => { if (!res.confirm) return; try { const r = await that.callCloud('deletePubViewRule', { ruleId }); if (r.status === 'success') { wx.showToast({ title: localeCopy.copy_5398fec054, icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } else { wx.showToast({ title: getErrorText(createResultError(r), localeCopy.copy_076bb5d383), icon: 'none' }); } } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_076bb5d383), icon: 'none' }); } } });
    },

    // ─── View Rule Clause Editor ───,

    openPubViewClauseEditor() { this.setData({ pubViewRuleForm: natureFields(this, Object.assign({}, this.data.pubViewRuleForm, { isClauseEditorVisible: true, clauseNatureIds: [], clauseLegacyNatureScope: false, clauseEditingIndex: -1, clauseScopeType: 'own_results', clauseScopeLabel: localeCopy.copy_9a4a6e8793, clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseDisplayMode: 'score', clauseGradeBands: [] })) }); },

    cancelPubViewClauseEdit() { this.setData({ 'pubViewRuleForm.isClauseEditorVisible': false, 'pubViewRuleForm.clauseEditingIndex': -1 }); },

    onPubViewClauseScopeChange(e) { const scope = this.data.viewScopeOptions[parseInt(e.detail.value, 10)]; if (scope) this.setData({ 'pubViewRuleForm.clauseScopeType': scope.value, 'pubViewRuleForm.clauseScopeLabel': scope.label }); },

    onPubViewClauseTargetIdentChange(e) { const ident = this.data.pubViewRuleForm.clauseApplicableIdentities[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubViewRuleForm.clauseTargetIdentityId': ident.id, 'pubViewRuleForm.clauseTargetIdentity': ident.name }); },

    // ─── Per-clause display mode & grade band handlers ───,

    onPubViewClauseDisplayModeChange(e) {
      const mode = this.data.displayModeOptions[parseInt(e.detail.value, 10)];
      if (mode) this.setData({ 'pubViewRuleForm.clauseDisplayMode': mode.value });
    },

    onClauseGradeBandInput(e) {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      const field = e.currentTarget.dataset.field;
      // Keep raw string — don't parseFloat (breaks "01"→"1") or default to 0 (breaks clearing)
      const value = e.detail.value;
      const bands = [...this.data.pubViewRuleForm.clauseGradeBands];
      if (bands[idx]) {
        bands[idx] = { ...bands[idx], [field]: value };
        this.setData({ 'pubViewRuleForm.clauseGradeBands': bands });
      }
    },

    addClauseGradeBand() {
      const bands = [...this.data.pubViewRuleForm.clauseGradeBands];
      bands.push({ minScore: 0, maxScore: 100, gradeName: '' });
      this.setData({ 'pubViewRuleForm.clauseGradeBands': bands });
    },

    removeClauseGradeBand(e) {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      const bands = [...this.data.pubViewRuleForm.clauseGradeBands];
      bands.splice(idx, 1);
      this.setData({ 'pubViewRuleForm.clauseGradeBands': bands });
    },

    generateClauseDefaultGradeBands() {
      this.setData({ 'pubViewRuleForm.clauseGradeBands': [
        { minScore: 0, maxScore: 59.99, gradeName: localeCopy.copy_c5b6490a3f },
        { minScore: 60, maxScore: 69.99, gradeName: localeCopy.copy_6de197a041 },
        { minScore: 70, maxScore: 79.99, gradeName: localeCopy.copy_644ca4567e },
        { minScore: 80, maxScore: 89.99, gradeName: localeCopy.copy_4f5ffea945 },
        { minScore: 90, maxScore: 100, gradeName: localeCopy.copy_56cbab8f45 }
      ] });
    },

    addPubViewClause() {
      const f = this.data.pubViewRuleForm;
      if (!(f.clauseNatureIds || []).length) { wx.showToast({ title: natureCopy.selectNatureRequired, icon: 'none' }); return; }
      const clause = { natureIds: f.clauseNatureIds.slice(), legacyNatureScope: f.clauseLegacyNatureScope, scopeType: f.clauseScopeType, scopeLabel: f.clauseScopeLabel, targetIdentityId: f.clauseTargetIdentityId, targetIdentity: f.clauseTargetIdentity, displayMode: f.clauseDisplayMode || 'score', gradeBands: f.clauseDisplayMode === 'grade' ? (f.clauseGradeBands || []).map(gb => ({ ...gb })) : [] };
      const clauses = [...f.clauses];
      if (f.clauseEditingIndex >= 0) { clauses[f.clauseEditingIndex] = clause; } else { clauses.push(clause); }
      this.setData({ 'pubViewRuleForm.clauses': clauses, 'pubViewRuleForm.isClauseEditorVisible': false, 'pubViewRuleForm.clauseEditingIndex': -1 });
    },

    editPubViewClause(e) {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      const c = this.data.pubViewRuleForm.clauses[idx];
      if (!c) return;
      this.setData({ pubViewRuleForm: natureFields(this, Object.assign({}, this.data.pubViewRuleForm, { isClauseEditorVisible: true, clauseNatureIds: c.natureIds || [], clauseLegacyNatureScope: c.legacyNatureScope, clauseEditingIndex: idx, clauseScopeType: c.scopeType, clauseScopeLabel: c.scopeLabel || '', clauseTargetIdentityId: c.targetIdentityId || '', clauseTargetIdentity: c.targetIdentity || '', clauseDisplayMode: c.displayMode || 'score', clauseGradeBands: (c.gradeBands || []).map(gb => ({ minScore: gb.minScore, maxScore: gb.maxScore, gradeName: gb.gradeName })) })) });
    },

    removePubViewClause(e) { const idx = parseInt(e.currentTarget.dataset.index, 10); const clauses = [...this.data.pubViewRuleForm.clauses]; clauses.splice(idx, 1); this.setData({ 'pubViewRuleForm.clauses': clauses }); },

    onPubViewRuleDeptChange(e) { const dept = this.data.departmentList[parseInt(e.detail.value, 10)]; if (dept) this.setData({ 'pubViewRuleForm.granteeDepartmentId': dept.id, 'pubViewRuleForm.granteeDepartment': dept.name }); },

    onPubViewRuleIdentChange(e) { const ident = this.data.pubViewRuleForm.applicableIdentities[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubViewRuleForm.granteeIdentityId': ident.id, 'pubViewRuleForm.granteeIdentity': ident.name }); },

    // ─── View Rule Category List batch ops ───
    togglePubViewRuleSelection(e) { const id = e.currentTarget.dataset.id; const map = { ...this.data.pubViewRuleSelectedIds }; map[id] = !map[id]; const allSel = this.data.pubViewRuleListView.every(r => map[r.id]); this.setData({ pubViewRuleSelectedIds: map, pubViewRuleAllSelected: allSel }); },
    toggleSelectAllPubViewRules() { const allSel = !this.data.pubViewRuleAllSelected; const map = {}; if (allSel) this.data.pubViewRuleListView.forEach(r => { map[r.id] = true; }); this.setData({ pubViewRuleSelectedIds: map, pubViewRuleAllSelected: allSel }); },
    reverseSelectPubViewRules() { const map = {}; this.data.pubViewRuleListView.forEach(r => { map[r.id] = !this.data.pubViewRuleSelectedIds[r.id]; }); this.setData({ pubViewRuleSelectedIds: map, pubViewRuleAllSelected: this.data.pubViewRuleListView.every(r => map[r.id]) }); },

    async batchDeletePubViewRules() {
      if (!canPublish(this, 'delete')) return;
      const ids = Object.keys(this.data.pubViewRuleSelectedIds).filter(id => this.data.pubViewRuleSelectedIds[id]);
      if (!ids.length) { wx.showToast({ title: localeCopy.copy_fe25ffc934, icon: 'none' }); return; }
      const that = this;
      wx.showModal({ title: localeCopy.copy_1338b7f36a, content: localeFormat(localeCopy.copy_80406a7947, [ids.length]), success: async (res) => {
        if (!res.confirm) return;
        try {
          const result = await that.callCloud('batchDeletePubViewRules', { ruleIds: ids });
          if (result.status === 'success') {
            wx.showToast({ title: localeFormat(localeCopy.copy_813300cf46, [result.count || ids.length]), icon: 'success' });
          } else {
            wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_076bb5d383), icon: 'none' });
          }
        } catch (error) {
          wx.showToast({ title: getErrorText(error, localeCopy.copy_076bb5d383), icon: 'none' });
        }
        await that.loadPublicationData(that.data.publicationForm.activityId);
      } });
    },

    // ─── Merit Rule Category CRUD ───,

    startNewPubMeritRule() {
      this.setData({ pubMeritRuleForm: natureFields(this, { id: '', publicationId: this.data.publicationForm.id || '', granteeDepartmentId: '', granteeDepartment: '', granteeIdentityId: '', granteeIdentity: '', isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'all_people', clauseScopeLabel: localeCopy.copy_9a2854d17d, clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseQuotaLimit: 0, clauseRequireExactQuota: false, clauses: [] }) });
    },

    editPubMeritRule(e) {
      if (!canPublish(this, 'update')) return;
      const id = e.currentTarget.dataset.id;
      const rule = this.data.pubMeritRuleList.find(r => r.id === id);
      if (!rule) return;
      this.setData({ pubMeritRuleForm: natureFields(this, { id: rule.id, natureIds: rule.natureIds || [], legacyNatureScope: !rule.natureIds, publicationId: rule.publicationId, granteeDepartmentId: rule.granteeDepartmentId, granteeDepartment: rule.granteeDepartment, granteeIdentityId: rule.granteeIdentityId, granteeIdentity: rule.granteeIdentity, isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'all_people', clauseScopeLabel: localeCopy.copy_9a2854d17d, clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseQuotaLimit: 0, clauseRequireExactQuota: false, clauses: (rule.clauses || []).map(c => ({ ...c, natureIds: c.natureIds || [], legacyNatureScope: !c.natureIds })) }) });
    },

    async savePubMeritRule() {
      if (!canPublish(this, this.data.pubMeritRuleForm.id ? 'update' : 'create')) return;
      const f = this.data.pubMeritRuleForm;
      if (!await this.confirmPublicationNatures(f) || this.data.pubMeritRuleForm !== f || !canPublish(this, f.id ? 'update' : 'create')) return;
      if (!f.granteeDepartmentId || !f.granteeIdentityId) { wx.showToast({ title: localeCopy.meritDesignatorScopeRequired, icon: 'none' }); return; }
      if (!f.publicationId) { wx.showToast({ title: localeCopy.copy_0dff72de43, icon: 'none' }); return; }
      this.setLoading('savePubMeritRule', true);
      try {
        const result = await this.callCloud('savePubMeritRule', { id: f.id, natureIds: f.natureIds, publicationId: f.publicationId, granteeDepartmentId: f.granteeDepartmentId, granteeIdentityId: f.granteeIdentityId, clauses: f.clauses.map(c => ({ natureIds: c.natureIds, scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, quotaLimit: c.quotaLimit, requireExactQuota: c.requireExactQuota })) });
        if (result.status === 'success') { wx.showToast({ title: localeCopy.copy_0aacec2714, icon: 'success' }); this.startNewPubMeritRule(); this.loadPublicationData(this.data.publicationForm.activityId); }
        else { wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_215e3c57da), icon: 'none' }); }
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_215e3c57da), icon: 'none' }); }
      this.setLoading('savePubMeritRule', false);
    },

    async deletePubMeritRule(e) {
      if (!canPublish(this, 'delete')) return;
      const ruleId = e.currentTarget.dataset.id;
      if (!ruleId) return;
      const that = this;
      wx.showModal({ title: localeCopy.copy_7f31eec657, content: localeCopy.copy_323c50bf75, success: async (res) => { if (!res.confirm) return; try { const r = await that.callCloud('deletePubMeritRule', { ruleId }); if (r.status === 'success') { wx.showToast({ title: localeCopy.copy_5398fec054, icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } else { wx.showToast({ title: getErrorText(createResultError(r), localeCopy.copy_076bb5d383), icon: 'none' }); } } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_076bb5d383), icon: 'none' }); } } });
    },

    // ─── Merit Rule Clause Editor ───,

    openPubMeritClauseEditor() { this.setData({ meritScopeOptions: meritScopeOptions('all_people'), pubMeritRuleForm: natureFields(this, Object.assign({}, this.data.pubMeritRuleForm, { isClauseEditorVisible: true, clauseNatureIds: [], clauseLegacyNatureScope: false, clauseEditingIndex: -1, clauseScopeType: 'all_people', clauseScopeLabel: adminCopy.meritScopeOrganization, clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseQuotaLimit: 0, clauseRequireExactQuota: false })) }); },

    cancelPubMeritClauseEdit() { this.setData({ 'pubMeritRuleForm.isClauseEditorVisible': false, 'pubMeritRuleForm.clauseEditingIndex': -1 }); },

    onPubMeritClauseScopeChange(e) { const scope = this.data.meritScopeOptions[parseInt(e.detail.value, 10)]; if (scope) this.setData({ 'pubMeritRuleForm.clauseScopeType': scope.value, 'pubMeritRuleForm.clauseScopeLabel': scope.label, meritScopeOptions: meritScopeOptions(scope.value) }); },

    onPubMeritClauseTargetIdentChange(e) { const ident = this.data.pubMeritRuleForm.clauseApplicableIdentities[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubMeritRuleForm.clauseTargetIdentityId': ident.id, 'pubMeritRuleForm.clauseTargetIdentity': ident.name }); },

    onPubMeritClauseQuotaInput(e) { this.setData({ 'pubMeritRuleForm.clauseQuotaLimit': Math.max(0, parseInt(e.detail.value, 10) || 0) }); },

    onPubMeritClauseExactToggle(e) { this.setData({ 'pubMeritRuleForm.clauseRequireExactQuota': !!e.detail.value }); },

    addPubMeritClause() {
      const f = this.data.pubMeritRuleForm;
      if (!(f.clauseNatureIds || []).length) { wx.showToast({ title: natureCopy.selectNatureRequired, icon: 'none' }); return; }
      if (!f.clauseTargetIdentityId) { wx.showToast({ title: localeCopy.copy_5ece2c09c8, icon: 'none' }); return; }
      const clause = { natureIds: f.clauseNatureIds.slice(), legacyNatureScope: f.clauseLegacyNatureScope, scopeType: f.clauseScopeType, scopeLabel: f.clauseScopeLabel, targetIdentityId: f.clauseTargetIdentityId, targetIdentity: f.clauseTargetIdentity, quotaLimit: f.clauseQuotaLimit, requireExactQuota: f.clauseRequireExactQuota };
      const clauses = [...f.clauses];
      if (f.clauseEditingIndex >= 0) { clauses[f.clauseEditingIndex] = clause; } else { clauses.push(clause); }
      this.setData({ 'pubMeritRuleForm.clauses': clauses, 'pubMeritRuleForm.isClauseEditorVisible': false, 'pubMeritRuleForm.clauseEditingIndex': -1 });
    },

    editPubMeritClause(e) { const idx = parseInt(e.currentTarget.dataset.index, 10); const c = this.data.pubMeritRuleForm.clauses[idx]; if (!c) return; this.setData({ meritScopeOptions: meritScopeOptions(c.scopeType), pubMeritRuleForm: natureFields(this, Object.assign({}, this.data.pubMeritRuleForm, { isClauseEditorVisible: true, clauseNatureIds: c.natureIds || [], clauseLegacyNatureScope: c.legacyNatureScope, clauseEditingIndex: idx, clauseScopeType: c.scopeType, clauseScopeLabel: scopeLabel(c.scopeType, true), clauseTargetIdentityId: c.targetIdentityId, clauseTargetIdentity: c.targetIdentity, clauseQuotaLimit: c.quotaLimit || 0, clauseRequireExactQuota: c.requireExactQuota || false })) }); },

    removePubMeritClause(e) { const idx = parseInt(e.currentTarget.dataset.index, 10); const clauses = [...this.data.pubMeritRuleForm.clauses]; clauses.splice(idx, 1); this.setData({ 'pubMeritRuleForm.clauses': clauses }); },

    onPubMeritRuleDeptChange(e) { const dept = this.data.departmentList[parseInt(e.detail.value, 10)]; if (dept) this.setData({ 'pubMeritRuleForm.granteeDepartmentId': dept.id, 'pubMeritRuleForm.granteeDepartment': dept.name }); },

    onPubMeritRuleIdentChange(e) { const ident = this.data.pubMeritRuleForm.applicableIdentities[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubMeritRuleForm.granteeIdentityId': ident.id, 'pubMeritRuleForm.granteeIdentity': ident.name }); },

    // ─── Merit Rule Category List batch ops ───
    togglePubMeritRuleSelection(e) { const id = e.currentTarget.dataset.id; const map = { ...this.data.pubMeritRuleSelectedIds }; map[id] = !map[id]; const allSel = this.data.pubMeritRuleListView.every(r => map[r.id]); this.setData({ pubMeritRuleSelectedIds: map, pubMeritRuleAllSelected: allSel }); },
    toggleSelectAllPubMeritRules() { const allSel = !this.data.pubMeritRuleAllSelected; const map = {}; if (allSel) this.data.pubMeritRuleListView.forEach(r => { map[r.id] = true; }); this.setData({ pubMeritRuleSelectedIds: map, pubMeritRuleAllSelected: allSel }); },
    reverseSelectPubMeritRules() { const map = {}; this.data.pubMeritRuleListView.forEach(r => { map[r.id] = !this.data.pubMeritRuleSelectedIds[r.id]; }); this.setData({ pubMeritRuleSelectedIds: map, pubMeritRuleAllSelected: this.data.pubMeritRuleListView.every(r => map[r.id]) }); },

    async batchDeletePubMeritRules() {
      if (!canPublish(this, 'delete')) return;
      const ids = Object.keys(this.data.pubMeritRuleSelectedIds).filter(id => this.data.pubMeritRuleSelectedIds[id]);
      if (!ids.length) { wx.showToast({ title: localeCopy.copy_fe25ffc934, icon: 'none' }); return; }
      const that = this;
      wx.showModal({ title: localeCopy.copy_1338b7f36a, content: localeFormat(localeCopy.copy_80406a7947, [ids.length]), success: async (res) => {
        if (!res.confirm) return;
        try {
          const result = await that.callCloud('batchDeletePubMeritRules', { ruleIds: ids });
          if (result.status === 'success') {
            wx.showToast({ title: localeFormat(localeCopy.copy_813300cf46, [result.count || ids.length]), icon: 'success' });
          } else {
            wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_076bb5d383), icon: 'none' });
          }
        } catch (error) {
          wx.showToast({ title: getErrorText(error, localeCopy.copy_076bb5d383), icon: 'none' });
        }
        await that.loadPublicationData(that.data.publicationForm.activityId);
      } });
    },

    // ─── Generate default categories ───,

    async generatePubViewRules() {
      if (!canPublish(this, 'create')) return;
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: localeCopy.copy_477934f658, icon: 'none' }); return; }
      this.setLoading('generatePubViewRules', true);
      try {
        const result = await this.callCloud('generatePubViewRules', { publicationId: pubId });
        if (result.status === 'success') {
          const parts = [];
          if (result.createdCount > 0) parts.push(localeFormat(localeCopy.copy_d50cdab568, [result.createdCount]));
          if (result.skippedCount > 0) parts.push(localeFormat(localeCopy.copy_01ed9fb4f4, [result.skippedCount]));
          const msg = parts.length > 0 ? parts.join('，') : localeCopy.copy_2b3035d391;
          wx.showToast({ title: msg, icon: 'success' });
          this.loadPublicationData(this.data.publicationForm.activityId);
        } else {
          wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_9662ceba48), icon: 'none' });
        }
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_9662ceba48), icon: 'none' }); }
      this.setLoading('generatePubViewRules', false);
    },

    async generatePubMeritRules() {
      if (!canPublish(this, 'create')) return;
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: localeCopy.copy_477934f658, icon: 'none' }); return; }
      this.setLoading('generatePubMeritRules', true);
      try {
        const result = await this.callCloud('generatePubMeritRules', { publicationId: pubId });
        if (result.status === 'success') {
          const parts = [];
          if (result.createdCount > 0) parts.push(localeFormat(localeCopy.copy_d50cdab568, [result.createdCount]));
          if (result.skippedCount > 0) parts.push(localeFormat(localeCopy.copy_01ed9fb4f4, [result.skippedCount]));
          const msg = parts.length > 0 ? parts.join('，') : localeCopy.copy_2b3035d391;
          wx.showToast({ title: msg, icon: 'success' });
          this.loadPublicationData(this.data.publicationForm.activityId);
        } else {
          wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_9662ceba48), icon: 'none' });
        }
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_9662ceba48), icon: 'none' }); }
      this.setLoading('generatePubMeritRules', false);
    },

    // ─── Designation Picker (uses clauseId) ───,

    async openDesignationPicker(e) {
      if (!canPublish(this, 'update')) return;
      const ds = e.currentTarget.dataset;
      const clauseId = ds.clauseId; const pubId = ds.pubId;
      if (!clauseId || !pubId) { wx.showToast({ title: localeCopy.copy_157f5cd8f8, icon: 'none' }); return; }

      // Show popup immediately with loading state
      this.setData({ showDesignationPicker: true, designationPickerClauseId: clauseId, designationPickerPubId: pubId, designationPickerHrList: [], designationPickerFilteredList: [], designationPickerSelectedIds: [], designationPickerSelectedList: [], desigSearchKeyword: '', desigFilterDept: localeCopy.copy_31d4595959, desigFilterIdent: localeCopy.copy_31d4595959, desigFilterDeptOptions: [localeCopy.copy_31d4595959], desigFilterIdentOptions: [localeCopy.copy_31d4595959] });

      try {
        // Reload publication data to get latest clause info and designations
        await this.loadPublicationData(this.data.publicationForm.activityId);
        const allClauses = [];
        for (const rule of this.data.pubMeritRuleList) {
          for (const c of (rule.clauses || [])) {
            allClauses.push({
              ...c,
              granteeNatureIds: rule.natureIds,
              granteeDepartmentId: rule.granteeDepartmentId,
              granteeIdentityId: rule.granteeIdentityId
            });
          }
        }
        const clause = allClauses.find(c => c.id === clauseId);
        if (!clause) { wx.showToast({ title: localeCopy.copy_02e1583d4a, icon: 'none' }); this.setData({ showDesignationPicker: false }); return; }

        const granteeDeptId = clause.granteeDepartmentId || '';
        const granteeIdentityId = clause.granteeIdentityId || '';
        const scopeType = clause.scopeType || 'all_people';
        const targetIdentityId = clause.targetIdentityId || '';

        const assignmentCandidates = (this.data.publicationAssignmentCandidates || []).map(function(candidate) {
          return { ...candidate, hrId: candidate.targetHrId || '' };
        });
        const assignmentsByHrId = {};
        assignmentCandidates.forEach(function(candidate) {
          if (!assignmentsByHrId[candidate.hrId]) assignmentsByHrId[candidate.hrId] = [];
          assignmentsByHrId[candidate.hrId].push(candidate.assignmentId);
        });
        const currentIds = [];
        (this.data.designationList || []).filter(function(item) {
          return item.clauseId === clauseId;
        }).forEach(function(item) {
          const assignmentId = item.targetAssignmentId || item.assignmentId || '';
          if (assignmentId) {
            currentIds.push(assignmentId);
            return;
          }
          const legacyAssignments = assignmentsByHrId[item.targetHrId] || [];
          if (legacyAssignments.length === 1) currentIds.push(legacyAssignments[0]);
        });
        const currentIdSet = new Set(currentIds);
        const filtered = designationCandidateView.filterCandidatesForClause(assignmentCandidates, {
          natureIds: clause.natureIds,
          granteeNatureIds: clause.granteeNatureIds,
          scopeType,
          granteeDepartmentId: granteeDeptId,
          granteeIdentityId,
          targetIdentityId
        }).map(candidate => ({ ...candidate, isSelected: currentIdSet.has(candidate.assignmentId) }));
        const depts = new Set(filtered.map(candidate => candidate.department).filter(Boolean));
        const idents = new Set(filtered.map(candidate => candidate.identity).filter(Boolean));
        const selectedList = filtered.filter(candidate => candidate.isSelected);
        this.setData({
          designationPickerHrList: filtered, designationPickerFilteredList: filtered,
          designationPickerSelectedIds: currentIds, designationPickerSelectedList: selectedList,
          desigFilterDept: localeCopy.copy_31d4595959, desigFilterIdent: localeCopy.copy_31d4595959,
          desigFilterDeptOptions: [localeCopy.copy_31d4595959, ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
          desigFilterIdentOptions: [localeCopy.copy_31d4595959, ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
          desigSearchKeyword: ''
        });
      } catch (_) { wx.showToast({ title: localeCopy.copy_e52119b17e, icon: 'none' }); }
    },

    closeDesignationPicker() { this.setData({ showDesignationPicker: false }); },

    confirmSharedDesignationPicker(e) {
      const detail = e.detail || {};
      this.setData({
        designationPickerSelectedIds: Array.isArray(detail.keys) ? detail.keys : [],
        designationPickerSelectedList: Array.isArray(detail.items) ? detail.items : []
      }, () => this.saveDesignations());
    },

    onDesignationPickerToggle(e) {
      const assignmentId = e.currentTarget.dataset.assignmentId;
      if (!assignmentId) return;
      const selected = [...this.data.designationPickerSelectedIds];
      const idx = selected.indexOf(assignmentId);
      if (idx >= 0) selected.splice(idx, 1); else selected.push(assignmentId);
      const hrList = this.data.designationPickerHrList.map(candidate => ({ ...candidate, isSelected: candidate.assignmentId === assignmentId ? !candidate.isSelected : candidate.isSelected }));
      this.setData({
        designationPickerSelectedIds: selected, designationPickerHrList: hrList,
        designationPickerFilteredList: this.applyDesigFilters(hrList),
        designationPickerSelectedList: hrList.filter(hr => hr.isSelected)
      });
    },

    applyDesigFilters(list, overrides) {
      let result = list || this.data.designationPickerHrList;
      const next = overrides || {};
      const department = Object.prototype.hasOwnProperty.call(next, 'department') ? next.department : this.data.desigFilterDept;
      const identity = Object.prototype.hasOwnProperty.call(next, 'identity') ? next.identity : this.data.desigFilterIdent;
      const keyword = Object.prototype.hasOwnProperty.call(next, 'keyword') ? next.keyword : this.data.desigSearchKeyword;
      if (department !== localeCopy.copy_31d4595959) result = result.filter(hr => hr.department === department);
      if (identity !== localeCopy.copy_31d4595959) result = result.filter(hr => hr.identity === identity);
      if (keyword) { const kw = keyword.toLowerCase(); result = result.filter(hr => (hr.name || '').toLowerCase().includes(kw) || (hr.studentId || '').toLowerCase().includes(kw) || (hr.assignmentLabel || '').toLowerCase().includes(kw)); }
      return result;
    },

    onDesigFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const options = field === 'identity' ? this.data.desigFilterIdentOptions : this.data.desigFilterDeptOptions;
      const value = options[Number(e.detail.value)] || localeCopy.copy_31d4595959;
      const patch = {};
      if (field === 'department') {
        patch.desigFilterDept = value;
        patch.designationPickerFilteredList = this.applyDesigFilters(null, { department: value });
      } else {
        patch.desigFilterIdent = value;
        patch.designationPickerFilteredList = this.applyDesigFilters(null, { identity: value });
      }
      this.setData(patch);
    },

    onDesigSearchInput(e) { const keyword = e.detail.value; this.setData({ desigSearchKeyword: keyword, designationPickerFilteredList: this.applyDesigFilters(null, { keyword }) }); },

    async saveDesignations() {
      if (!canPublish(this, 'update')) return;
      const clauseId = this.data.designationPickerClauseId;
      const pubId = this.data.designationPickerPubId;
      const assignmentIds = this.data.designationPickerSelectedIds;
      this.setLoading('saveDesignations', true);
      try {
        const result = await this.callCloud('saveMeritListDesignations', { clauseId, publicationId: pubId, designationAssignmentIds: assignmentIds });
        if (result.status === 'success') { wx.showToast({ title: localeCopy.copy_0aacec2714, icon: 'success' }); this.closeDesignationPicker(); this.loadPublicationData(this.data.publicationForm.activityId); }
        else { wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_215e3c57da), icon: 'none' }); }
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_215e3c57da), icon: 'none' }); }
      this.setLoading('saveDesignations', false);
    },
    // ─── Batch category creation (replaces old batch form) ───,

    buildPubScorerCategoryList() {
      if (!this.data.departmentList.length || !this.data.identityList.length) return;
      const list = []; const seen = new Set();
      for (const dept of this.data.departmentList) { for (const ident of this.data.identityList) { const key = dept.id + '::' + ident.id; if (seen.has(key)) continue; seen.add(key); list.push({ key, departmentId: dept.id, department: dept.name, identityId: ident.id, identity: ident.name }); } };
      const depts = new Set(); const idents = new Set();
      list.forEach(item => { depts.add(item.department); idents.add(item.identity); });
      this.setData({ pubBatchList: list, pubBatchFilteredList: list, pubBatchFilterOptions: { departments: [localeCopy.copy_31d4595959, ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))], identities: [localeCopy.copy_31d4595959, ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))] } });
    },

    onPubBatchFilterChange(e) { /* kept for compatibility */ },

    applyPubBatchFilter(filters) { /* kept for compatibility */ },

    toggleBatchSelection(e) { /* kept for compatibility */ },

    toggleSelectAllBatch() { /* kept for compatibility */ },

    reverseSelectBatch() { /* kept for compatibility */ },

    // Batch save: apply current view clauses to selected view rule categories,

    async batchSavePubViewRules() {
      if (!canPublish(this, 'update')) return;
      if (this.data.pubBatchRunning) { wx.showToast({ title: localeCopy.copy_f7dbdfa4c2, icon: 'none' }); return; }
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: localeCopy.copy_0dff72de43, icon: 'none' }); return; }
      const form = this.data.pubViewRuleForm;
      const templateClauses = (form.clauses || []).map(c => ({ natureIds: c.natureIds, scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, displayMode: c.displayMode || 'score', gradeBands: c.displayMode === 'grade' ? (c.gradeBands || []) : [] }));
      const selected = (this.data.pubViewRuleList || []).filter(item => this.data.pubViewRuleSelectedIds[item.id]);
      if (!selected.length) { wx.showToast({ title: localeCopy.copy_78e3986a7f, icon: 'none' }); return; }
      const expected = orgSession.getSnapshot();
      if (!await confirmReplaceRules(selected, false) || !orgSession.isCurrent(expected) || !canPublish(this, 'update') || this.data.publicationForm.id !== pubId || this.data.pubBatchRunning) return;
      if (!await this.confirmPublicationBatchNatures(form, selected) || !orgSession.isCurrent(expected) || this.data.pubViewRuleForm !== form || !canPublish(this, 'update')) return;
      this.setData({ pubBatchRunning: true });
      this.setLoading('batchSavePubViewRules', true);
      try {
        const rules = selected.map(item => ({
          id: item.id,
          natureIds: item.natureIds || form.natureIds,
          publicationId: pubId,
          granteeDepartmentId: item.granteeDepartmentId,
          granteeIdentityId: item.granteeIdentityId,
          clauses: templateClauses
        }));
        const result = await this.callCloud('batchSavePubViewRules', { rules });
        if (result.status === 'success') {
          wx.showToast({ title: localeFormat(localeCopy.copy_9d5c7b0e2b, [result.count || selected.length]), icon: 'success' });
        } else {
          wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_0531ed9e78), icon: 'none' });
        }
        await this.loadPublicationData(this.data.publicationForm.activityId);
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_0531ed9e78), icon: 'none' }); }
      finally {
        this.setLoading('batchSavePubViewRules', false);
        this.setData({ pubBatchRunning: false });
      }
    },

    // Batch save: apply current merit clauses to selected merit rule categories,

    async batchSavePubMeritRules() {
      if (!canPublish(this, 'update')) return;
      if (this.data.pubBatchRunning) { wx.showToast({ title: localeCopy.copy_f7dbdfa4c2, icon: 'none' }); return; }
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: localeCopy.copy_0dff72de43, icon: 'none' }); return; }
      const form = this.data.pubMeritRuleForm;
      const templateClauses = (form.clauses || []).map(c => ({ natureIds: c.natureIds, scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, quotaLimit: c.quotaLimit || 0, requireExactQuota: c.requireExactQuota || false }));
      const selected = (this.data.pubMeritRuleList || []).filter(item => this.data.pubMeritRuleSelectedIds[item.id]);
      if (!selected.length) { wx.showToast({ title: localeCopy.copy_78e3986a7f, icon: 'none' }); return; }
      const expected = orgSession.getSnapshot();
      if (!await confirmReplaceRules(selected, true) || !orgSession.isCurrent(expected) || !canPublish(this, 'update') || this.data.publicationForm.id !== pubId || this.data.pubBatchRunning) return;
      if (!await this.confirmPublicationBatchNatures(form, selected) || !orgSession.isCurrent(expected) || this.data.pubMeritRuleForm !== form || !canPublish(this, 'update')) return;
      this.setData({ pubBatchRunning: true });
      this.setLoading('batchSavePubMeritRules', true);
      try {
        const rules = selected.map(item => ({
          id: item.id,
          natureIds: item.natureIds || form.natureIds,
          publicationId: pubId,
          granteeDepartmentId: item.granteeDepartmentId,
          granteeIdentityId: item.granteeIdentityId,
          clauses: templateClauses
        }));
        const result = await this.callCloud('batchSavePubMeritRules', { rules });
        if (result.status === 'success') {
          wx.showToast({ title: localeFormat(localeCopy.copy_9d5c7b0e2b, [result.count || selected.length]), icon: 'success' });
        } else {
          wx.showToast({ title: getErrorText(createResultError(result), localeCopy.copy_0531ed9e78), icon: 'none' });
        }
        await this.loadPublicationData(this.data.publicationForm.activityId);
      } catch (e) { wx.showToast({ title: getErrorText(e, localeCopy.copy_0531ed9e78), icon: 'none' }); }
      finally {
        this.setLoading('batchSavePubMeritRules', false);
        this.setData({ pubBatchRunning: false });
      }
    }
  }
});
