// Behavior: publication tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { saveAndShareFile } = require('../../../../../utils/tableFile');
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    async loadPublicationData(activityId) {
      const request = orgSession.beginRequest(this, 'publicationData');
      if (!activityId) {
        this.setData({ publicationForm: { id: '', activityId: '', activityName: '', isPublished: false }, pubViewRuleList: [], pubMeritRuleList: [], designationList: [] });
        return;
      }
      this.setLoading('publications', true);
      try {
        const result = await this.callCloud('getResultPublication', { activityId });
        if (!orgSession.isRequestCurrent(this, request) || this.data.currentActivityId !== activityId) return;
        if (result.status === 'success') {
          const pub = result.publication;
          const viewRules = result.viewRules || [];
          const meritRules = result.meritRules || [];
          this.setData({
            publicationForm: pub ? { id: pub.id, activityId: pub.activityId, activityName: this.data.publicationForm.activityName, isPublished: !!pub.isPublished } : { id: '', activityId, activityName: this.data.publicationForm.activityName, isPublished: false },
            pubViewRuleList: viewRules, pubViewRuleListView: viewRules,
            pubMeritRuleList: meritRules, pubMeritRuleListView: meritRules,
            designationList: result.meritListDesignations || [],
            pubViewRuleSelectedIds: {}, pubViewRuleAllSelected: false,
            pubMeritRuleSelectedIds: {}, pubMeritRuleAllSelected: false
          });
          this.rebuildPubViewRuleFilters(viewRules);
          this.rebuildPubMeritRuleFilters(meritRules);
        }
      } catch (e) {
        if (orgSession.isRequestCurrent(this, request) && !(e && e.silent)) console.error('loadPublicationData error:', e);
      }
      if (orgSession.isRequestCurrent(this, request)) this.setLoading('publications', false);
    },
  
    // ─── Merit list summary (Feature 5) ───,

    async loadMeritListSummary() {
      const activityId = this.data.publicationForm.activityId;
      if (!activityId) return;
      const request = orgSession.beginRequest(this, 'meritListSummary');
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
            meritSummaryDeptOptions: ['全部', ...Array.from(deptSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))],
            meritSummaryIdentOptions: ['全部', ...Array.from(identSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))],
            meritSummaryWgOptions: ['全部', ...Array.from(wgSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))],
            meritSummaryFilterDept: '全部', meritSummaryFilterIdent: '全部', meritSummaryFilterWg: '全部'
          });
        }
      } catch (e) {
        if (orgSession.isRequestCurrent(this, request) && !(e && e.silent)) console.error('loadMeritListSummary error:', e);
      }
    },

    applyMeritSummaryFilters() {
      let groups = this.data.meritSummaryGroups || [];
      const deptFilter = this.data.meritSummaryFilterDept;
      const identFilter = this.data.meritSummaryFilterIdent;
      const wgFilter = this.data.meritSummaryFilterWg;
      if (deptFilter !== '全部' || identFilter !== '全部' || wgFilter !== '全部') {
        groups = groups.map(g => ({
          ...g,
          members: g.members.filter(m =>
            (deptFilter === '全部' || m.department === deptFilter) &&
            (identFilter === '全部' || m.identity === identFilter) &&
            (wgFilter === '全部' || m.workGroup === wgFilter)
          )
        })).filter(g => g.members.length > 0);
      }
      this.setData({ meritSummaryFilteredGroups: groups });
    },

    onMeritSummaryFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const options = this.data[field === 'department' ? 'meritSummaryDeptOptions' : (field === 'identity' ? 'meritSummaryIdentOptions' : 'meritSummaryWgOptions')];
      const value = options[Number(e.detail.value)] || '全部';
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
      const activityId = this.data.publicationForm.activityId;
      if (!activityId) { wx.showToast({ title: '请先选择评分活动', icon: 'none' }); return; }
      this.setLoading('exportMeritSummary', true);
      try {
        const result = await this.callCloud('exportMeritListSummary', {
          activityId,
          filterDepartment: this.data.meritSummaryFilterDept === '全部' ? '' : this.data.meritSummaryFilterDept,
          filterIdentity: this.data.meritSummaryFilterIdent === '全部' ? '' : this.data.meritSummaryFilterIdent,
          filterWorkGroup: this.data.meritSummaryFilterWg === '全部' ? '' : this.data.meritSummaryFilterWg
        });
        if (result.status === 'success' && result.fileContent) {
          saveAndShareFile(result.fileContent, result.fileName || '评优名单汇总', result.extension || 'xlsx');
          wx.showToast({ title: `已导出 ${result.rowCount || 0} 条记录`, icon: 'success' });
        } else {
          wx.showToast({ title: result.message || '导出失败', icon: 'none' });
        }
      } catch (e) { wx.showToast({ title: '导出失败', icon: 'none' }); }
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
        this.setData({ publicationForm: { id: '', activityId, activityName: activity.name || '', isPublished: false } });
        // 先加载服务端状态，再决定是否需要静默创建（避免 savePublication 覆盖已发布状态）
        await this.loadPublicationData(activityId);
        if (!this.data.publicationForm.id && activityId) {
          await this.savePublication(true);
        }
      }
    },

    onPublicationToggle(e) { this.setData({ 'publicationForm.isPublished': !!e.detail.value }); },

    async savePublication(silent) {
      const form = this.data.publicationForm;
      // 区分 bindtap 事件对象（用户点击按钮）和布尔 true（代码静默调用）
      const isSilent = silent === true;
      if (!form.activityId) { if (!isSilent) wx.showToast({ title: '请选择评分活动', icon: 'none' }); return; }
      // 静默模式下，如果 publication 已存在则跳过（避免覆盖 isPublished 等已有字段）
      if (isSilent && form.id) return;
      this.setLoading('savePublication', true);
      try {
        const result = await this.callCloud('saveResultPublication', { activityId: form.activityId, isPublished: form.isPublished });
        if (result.status === 'success') {
          if (!isSilent) wx.showToast({ title: result.message || '已保存', icon: 'success' });
          this.setData({ 'publicationForm.id': result.publication.id, 'publicationForm.isPublished': !!result.publication.isPublished });
        } else { if (!isSilent) wx.showToast({ title: result.message || '保存失败', icon: 'none' }); }
      } catch (e) { if (!isSilent) wx.showToast({ title: '保存失败', icon: 'none' }); }
      this.setLoading('savePublication', false);
    },
  
    // ─── View Rule Filters ───,

    rebuildPubViewRuleFilters(list) {
      const depts = new Set(); const idents = new Set();
      (list || []).forEach(r => { if (r.granteeDepartment) depts.add(r.granteeDepartment); if (r.granteeIdentity) idents.add(r.granteeIdentity); });
      this.setData({
        pubViewRuleFilterOptions: { departments: ['全部', ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))], identities: ['全部', ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))] },
        pubViewRuleListView: list || []
      });
    },

    rebuildPubMeritRuleFilters(list) {
      const depts = new Set(); const idents = new Set();
      (list || []).forEach(r => { if (r.granteeDepartment) depts.add(r.granteeDepartment); if (r.granteeIdentity) idents.add(r.granteeIdentity); });
      this.setData({
        pubMeritRuleFilterOptions: { departments: ['全部', ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))], identities: ['全部', ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))] },
        pubMeritRuleListView: list || []
      });
    },

    onPubViewRuleFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const optionKey = field === 'identity' ? 'identities' : 'departments';
      const options = (this.data.pubViewRuleFilterOptions || {})[optionKey] || ['全部'];
      const value = options[Number(e.detail.value)] || '全部';
      const next = { ...this.data.pubViewRuleFilters, [field]: value };
      this.setData({ pubViewRuleFilters: next });
      let list = this.data.pubViewRuleList || [];
      if (next.department && next.department !== '全部') list = list.filter(r => r.granteeDepartment === next.department);
      if (next.identity && next.identity !== '全部') list = list.filter(r => r.granteeIdentity === next.identity);
      this.setData({ pubViewRuleListView: list, pubViewRuleSelectedIds: {}, pubViewRuleAllSelected: false });
    },

    onPubMeritRuleFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const optionKey = field === 'identity' ? 'identities' : 'departments';
      const options = (this.data.pubMeritRuleFilterOptions || {})[optionKey] || ['全部'];
      const value = options[Number(e.detail.value)] || '全部';
      const next = { ...this.data.pubMeritRuleFilters, [field]: value };
      this.setData({ pubMeritRuleFilters: next });
      let list = this.data.pubMeritRuleList || [];
      if (next.department && next.department !== '全部') list = list.filter(r => r.granteeDepartment === next.department);
      if (next.identity && next.identity !== '全部') list = list.filter(r => r.granteeIdentity === next.identity);
      this.setData({ pubMeritRuleListView: list, pubMeritRuleSelectedIds: {}, pubMeritRuleAllSelected: false });
    },
  
    // ─── View Rule Category CRUD ───,

    startNewPubViewRule() {
      this.setData({ pubViewRuleForm: { id: '', publicationId: this.data.publicationForm.id || '', granteeDepartmentId: '', granteeDepartment: '', granteeIdentityId: '', granteeIdentity: '', isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'own_results', clauseScopeLabel: '仅查看自己的评分结果', clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseDisplayMode: 'score', clauseGradeBands: [], clauses: [] } });
    },

    editPubViewRule(e) {
      const id = e.currentTarget.dataset.id;
      const rule = this.data.pubViewRuleList.find(r => r.id === id);
      if (!rule) return;
      this.setData({ pubViewRuleForm: { id: rule.id, publicationId: rule.publicationId, granteeDepartmentId: rule.granteeDepartmentId, granteeDepartment: rule.granteeDepartment, granteeIdentityId: rule.granteeIdentityId, granteeIdentity: rule.granteeIdentity, isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'own_results', clauseScopeLabel: '仅查看自己的评分结果', clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseDisplayMode: 'score', clauseGradeBands: [], clauses: (rule.clauses || []).map(c => ({ scopeType: c.scopeType, scopeLabel: c.scopeLabel || '', targetIdentityId: c.targetIdentityId || '', targetIdentity: c.targetIdentity || '', displayMode: c.displayMode || 'score', gradeBands: (c.gradeBands || []).map(gb => ({ minScore: gb.minScore, maxScore: gb.maxScore, gradeName: gb.gradeName })) })) } });
    },

    async savePubViewRule() {
      const f = this.data.pubViewRuleForm;
      if (!f.granteeDepartmentId || !f.granteeIdentityId) { wx.showToast({ title: '请选择授权部门和身份', icon: 'none' }); return; }
      if (!f.publicationId) { wx.showToast({ title: '请先保存公示设置', icon: 'none' }); return; }
      this.setLoading('savePubViewRule', true);
      try {
        const result = await this.callCloud('savePubViewRule', { id: f.id, publicationId: f.publicationId, granteeDepartmentId: f.granteeDepartmentId, granteeIdentityId: f.granteeIdentityId, clauses: f.clauses.map(c => ({ scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, displayMode: c.displayMode || 'score', gradeBands: c.displayMode === 'grade' ? (c.gradeBands || []) : [] })) });
        if (result.status === 'success') { wx.showToast({ title: '已保存', icon: 'success' }); this.startNewPubViewRule(); this.loadPublicationData(this.data.publicationForm.activityId); }
        else { wx.showToast({ title: result.message || '保存失败', icon: 'none' }); }
      } catch (e) { wx.showToast({ title: '保存失败', icon: 'none' }); }
      this.setLoading('savePubViewRule', false);
    },

    async deletePubViewRule(e) {
      const ruleId = e.currentTarget.dataset.id;
      if (!ruleId) return;
      const that = this;
      wx.showModal({ title: '确认删除', content: '删除此类别及全部条款？', success: async (res) => { if (!res.confirm) return; try { const r = await that.callCloud('deletePubViewRule', { ruleId }); if (r.status === 'success') { wx.showToast({ title: '已删除', icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } else { wx.showToast({ title: r.message || '删除失败', icon: 'none' }); } } catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }); } } });
    },
  
    // ─── View Rule Clause Editor ───,

    openPubViewClauseEditor() { this.setData({ 'pubViewRuleForm.isClauseEditorVisible': true, 'pubViewRuleForm.clauseEditingIndex': -1, 'pubViewRuleForm.clauseScopeType': 'own_results', 'pubViewRuleForm.clauseScopeLabel': '仅查看自己的评分结果', 'pubViewRuleForm.clauseTargetIdentityId': '', 'pubViewRuleForm.clauseTargetIdentity': '', 'pubViewRuleForm.clauseDisplayMode': 'score', 'pubViewRuleForm.clauseGradeBands': [] }); },

    cancelPubViewClauseEdit() { this.setData({ 'pubViewRuleForm.isClauseEditorVisible': false, 'pubViewRuleForm.clauseEditingIndex': -1 }); },

    onPubViewClauseScopeChange(e) { const scope = this.data.viewScopeOptions[parseInt(e.detail.value, 10)]; if (scope) this.setData({ 'pubViewRuleForm.clauseScopeType': scope.value, 'pubViewRuleForm.clauseScopeLabel': scope.label }); },

    onPubViewClauseTargetIdentChange(e) { const ident = this.data.identityList[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubViewRuleForm.clauseTargetIdentityId': ident.id, 'pubViewRuleForm.clauseTargetIdentity': ident.name }); },
  
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
        { minScore: 0, maxScore: 59.99, gradeName: '不合格' },
        { minScore: 60, maxScore: 69.99, gradeName: '合格' },
        { minScore: 70, maxScore: 79.99, gradeName: '中等' },
        { minScore: 80, maxScore: 89.99, gradeName: '良好' },
        { minScore: 90, maxScore: 100, gradeName: '优秀' }
      ] });
    },

    addPubViewClause() {
      const f = this.data.pubViewRuleForm;
      const clause = { scopeType: f.clauseScopeType, scopeLabel: f.clauseScopeLabel, targetIdentityId: f.clauseTargetIdentityId, targetIdentity: f.clauseTargetIdentity, displayMode: f.clauseDisplayMode || 'score', gradeBands: f.clauseDisplayMode === 'grade' ? (f.clauseGradeBands || []).map(gb => ({ ...gb })) : [] };
      const clauses = [...f.clauses];
      if (f.clauseEditingIndex >= 0) { clauses[f.clauseEditingIndex] = clause; } else { clauses.push(clause); }
      this.setData({ 'pubViewRuleForm.clauses': clauses, 'pubViewRuleForm.isClauseEditorVisible': false, 'pubViewRuleForm.clauseEditingIndex': -1 });
    },

    editPubViewClause(e) {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      const c = this.data.pubViewRuleForm.clauses[idx];
      if (!c) return;
      this.setData({ 'pubViewRuleForm.isClauseEditorVisible': true, 'pubViewRuleForm.clauseEditingIndex': idx, 'pubViewRuleForm.clauseScopeType': c.scopeType, 'pubViewRuleForm.clauseScopeLabel': c.scopeLabel || '', 'pubViewRuleForm.clauseTargetIdentityId': c.targetIdentityId || '', 'pubViewRuleForm.clauseTargetIdentity': c.targetIdentity || '', 'pubViewRuleForm.clauseDisplayMode': c.displayMode || 'score', 'pubViewRuleForm.clauseGradeBands': (c.gradeBands || []).map(gb => ({ minScore: gb.minScore, maxScore: gb.maxScore, gradeName: gb.gradeName })) });
    },

    removePubViewClause(e) { const idx = parseInt(e.currentTarget.dataset.index, 10); const clauses = [...this.data.pubViewRuleForm.clauses]; clauses.splice(idx, 1); this.setData({ 'pubViewRuleForm.clauses': clauses }); },

    onPubViewRuleDeptChange(e) { const dept = this.data.departmentList[parseInt(e.detail.value, 10)]; if (dept) this.setData({ 'pubViewRuleForm.granteeDepartmentId': dept.id, 'pubViewRuleForm.granteeDepartment': dept.name }); },

    onPubViewRuleIdentChange(e) { const ident = this.data.identityList[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubViewRuleForm.granteeIdentityId': ident.id, 'pubViewRuleForm.granteeIdentity': ident.name }); },
  
    // ─── View Rule Category List batch ops ───
    togglePubViewRuleSelection(e) { const id = e.currentTarget.dataset.id; const map = { ...this.data.pubViewRuleSelectedIds }; map[id] = !map[id]; const allSel = this.data.pubViewRuleListView.every(r => map[r.id]); this.setData({ pubViewRuleSelectedIds: map, pubViewRuleAllSelected: allSel }); },
    toggleSelectAllPubViewRules() { const allSel = !this.data.pubViewRuleAllSelected; const map = {}; if (allSel) this.data.pubViewRuleListView.forEach(r => { map[r.id] = true; }); this.setData({ pubViewRuleSelectedIds: map, pubViewRuleAllSelected: allSel }); },
    reverseSelectPubViewRules() { const map = {}; this.data.pubViewRuleListView.forEach(r => { map[r.id] = !this.data.pubViewRuleSelectedIds[r.id]; }); this.setData({ pubViewRuleSelectedIds: map, pubViewRuleAllSelected: this.data.pubViewRuleListView.every(r => map[r.id]) }); },

    async batchDeletePubViewRules() {
      const ids = Object.keys(this.data.pubViewRuleSelectedIds).filter(id => this.data.pubViewRuleSelectedIds[id]);
      if (!ids.length) { wx.showToast({ title: '请先选择要删除的类别', icon: 'none' }); return; }
      const that = this;
      wx.showModal({ title: '批量删除', content: `删除选中的 ${ids.length} 个类别？`, success: async (res) => { if (!res.confirm) return; for (const id of ids) { try { await that.callCloud('deletePubViewRule', { ruleId: id }); } catch (e) {} } wx.showToast({ title: `已删除 ${ids.length} 个`, icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } });
    },
  
    // ─── Merit Rule Category CRUD ───,

    startNewPubMeritRule() {
      this.setData({ pubMeritRuleForm: { id: '', publicationId: this.data.publicationForm.id || '', granteeDepartmentId: '', granteeDepartment: '', granteeIdentityId: '', granteeIdentity: '', isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'all_people', clauseScopeLabel: '全部成员', clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseQuotaLimit: 0, clauseRequireExactQuota: false, clauses: [] } });
    },

    editPubMeritRule(e) {
      const id = e.currentTarget.dataset.id;
      const rule = this.data.pubMeritRuleList.find(r => r.id === id);
      if (!rule) return;
      this.setData({ pubMeritRuleForm: { id: rule.id, publicationId: rule.publicationId, granteeDepartmentId: rule.granteeDepartmentId, granteeDepartment: rule.granteeDepartment, granteeIdentityId: rule.granteeIdentityId, granteeIdentity: rule.granteeIdentity, isClauseEditorVisible: false, clauseEditingIndex: -1, clauseScopeType: 'all_people', clauseScopeLabel: '全部成员', clauseTargetIdentityId: '', clauseTargetIdentity: '', clauseQuotaLimit: 0, clauseRequireExactQuota: false, clauses: (rule.clauses || []).map(c => ({ ...c })) } });
    },

    async savePubMeritRule() {
      const f = this.data.pubMeritRuleForm;
      if (!f.granteeDepartmentId || !f.granteeIdentityId) { wx.showToast({ title: '请选择授权部门和身份', icon: 'none' }); return; }
      if (!f.publicationId) { wx.showToast({ title: '请先保存公示设置', icon: 'none' }); return; }
      this.setLoading('savePubMeritRule', true);
      try {
        const result = await this.callCloud('savePubMeritRule', { id: f.id, publicationId: f.publicationId, granteeDepartmentId: f.granteeDepartmentId, granteeIdentityId: f.granteeIdentityId, clauses: f.clauses.map(c => ({ scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, quotaLimit: c.quotaLimit, requireExactQuota: c.requireExactQuota })) });
        if (result.status === 'success') { wx.showToast({ title: '已保存', icon: 'success' }); this.startNewPubMeritRule(); this.loadPublicationData(this.data.publicationForm.activityId); }
        else { wx.showToast({ title: result.message || '保存失败', icon: 'none' }); }
      } catch (e) { wx.showToast({ title: '保存失败', icon: 'none' }); }
      this.setLoading('savePubMeritRule', false);
    },

    async deletePubMeritRule(e) {
      const ruleId = e.currentTarget.dataset.id;
      if (!ruleId) return;
      const that = this;
      wx.showModal({ title: '确认删除', content: '删除后将清空相关评优名单，是否继续？', success: async (res) => { if (!res.confirm) return; try { const r = await that.callCloud('deletePubMeritRule', { ruleId }); if (r.status === 'success') { wx.showToast({ title: '已删除', icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } else { wx.showToast({ title: r.message || '删除失败', icon: 'none' }); } } catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }); } } });
    },
  
    // ─── Merit Rule Clause Editor ───,

    openPubMeritClauseEditor() { this.setData({ 'pubMeritRuleForm.isClauseEditorVisible': true, 'pubMeritRuleForm.clauseEditingIndex': -1, 'pubMeritRuleForm.clauseScopeType': 'all_people', 'pubMeritRuleForm.clauseScopeLabel': '全部成员', 'pubMeritRuleForm.clauseTargetIdentityId': '', 'pubMeritRuleForm.clauseTargetIdentity': '', 'pubMeritRuleForm.clauseQuotaLimit': 0, 'pubMeritRuleForm.clauseRequireExactQuota': false }); },

    cancelPubMeritClauseEdit() { this.setData({ 'pubMeritRuleForm.isClauseEditorVisible': false, 'pubMeritRuleForm.clauseEditingIndex': -1 }); },

    onPubMeritClauseScopeChange(e) { const scope = this.data.viewScopeOptions[parseInt(e.detail.value, 10)]; if (scope) this.setData({ 'pubMeritRuleForm.clauseScopeType': scope.value, 'pubMeritRuleForm.clauseScopeLabel': scope.label }); },

    onPubMeritClauseTargetIdentChange(e) { const ident = this.data.identityList[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubMeritRuleForm.clauseTargetIdentityId': ident.id, 'pubMeritRuleForm.clauseTargetIdentity': ident.name }); },

    onPubMeritClauseQuotaInput(e) { this.setData({ 'pubMeritRuleForm.clauseQuotaLimit': Math.max(0, parseInt(e.detail.value, 10) || 0) }); },

    onPubMeritClauseExactToggle(e) { this.setData({ 'pubMeritRuleForm.clauseRequireExactQuota': !!e.detail.value }); },

    addPubMeritClause() {
      const f = this.data.pubMeritRuleForm;
      if (!f.clauseTargetIdentityId) { wx.showToast({ title: '请选择目标身份', icon: 'none' }); return; }
      const clause = { scopeType: f.clauseScopeType, scopeLabel: f.clauseScopeLabel, targetIdentityId: f.clauseTargetIdentityId, targetIdentity: f.clauseTargetIdentity, quotaLimit: f.clauseQuotaLimit, requireExactQuota: f.clauseRequireExactQuota };
      const clauses = [...f.clauses];
      if (f.clauseEditingIndex >= 0) { clauses[f.clauseEditingIndex] = clause; } else { clauses.push(clause); }
      this.setData({ 'pubMeritRuleForm.clauses': clauses, 'pubMeritRuleForm.isClauseEditorVisible': false, 'pubMeritRuleForm.clauseEditingIndex': -1 });
    },

    editPubMeritClause(e) { const idx = parseInt(e.currentTarget.dataset.index, 10); const c = this.data.pubMeritRuleForm.clauses[idx]; if (!c) return; this.setData({ 'pubMeritRuleForm.isClauseEditorVisible': true, 'pubMeritRuleForm.clauseEditingIndex': idx, 'pubMeritRuleForm.clauseScopeType': c.scopeType, 'pubMeritRuleForm.clauseScopeLabel': c.scopeLabel, 'pubMeritRuleForm.clauseTargetIdentityId': c.targetIdentityId, 'pubMeritRuleForm.clauseTargetIdentity': c.targetIdentity, 'pubMeritRuleForm.clauseQuotaLimit': c.quotaLimit || 0, 'pubMeritRuleForm.clauseRequireExactQuota': c.requireExactQuota || false }); },

    removePubMeritClause(e) { const idx = parseInt(e.currentTarget.dataset.index, 10); const clauses = [...this.data.pubMeritRuleForm.clauses]; clauses.splice(idx, 1); this.setData({ 'pubMeritRuleForm.clauses': clauses }); },

    onPubMeritRuleDeptChange(e) { const dept = this.data.departmentList[parseInt(e.detail.value, 10)]; if (dept) this.setData({ 'pubMeritRuleForm.granteeDepartmentId': dept.id, 'pubMeritRuleForm.granteeDepartment': dept.name }); },

    onPubMeritRuleIdentChange(e) { const ident = this.data.identityList[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubMeritRuleForm.granteeIdentityId': ident.id, 'pubMeritRuleForm.granteeIdentity': ident.name }); },
  
    // ─── Merit Rule Category List batch ops ───
    togglePubMeritRuleSelection(e) { const id = e.currentTarget.dataset.id; const map = { ...this.data.pubMeritRuleSelectedIds }; map[id] = !map[id]; const allSel = this.data.pubMeritRuleListView.every(r => map[r.id]); this.setData({ pubMeritRuleSelectedIds: map, pubMeritRuleAllSelected: allSel }); },
    toggleSelectAllPubMeritRules() { const allSel = !this.data.pubMeritRuleAllSelected; const map = {}; if (allSel) this.data.pubMeritRuleListView.forEach(r => { map[r.id] = true; }); this.setData({ pubMeritRuleSelectedIds: map, pubMeritRuleAllSelected: allSel }); },
    reverseSelectPubMeritRules() { const map = {}; this.data.pubMeritRuleListView.forEach(r => { map[r.id] = !this.data.pubMeritRuleSelectedIds[r.id]; }); this.setData({ pubMeritRuleSelectedIds: map, pubMeritRuleAllSelected: this.data.pubMeritRuleListView.every(r => map[r.id]) }); },

    async batchDeletePubMeritRules() {
      const ids = Object.keys(this.data.pubMeritRuleSelectedIds).filter(id => this.data.pubMeritRuleSelectedIds[id]);
      if (!ids.length) { wx.showToast({ title: '请先选择要删除的类别', icon: 'none' }); return; }
      const that = this;
      wx.showModal({ title: '批量删除', content: `删除选中的 ${ids.length} 个类别？`, success: async (res) => { if (!res.confirm) return; for (const id of ids) { try { await that.callCloud('deletePubMeritRule', { ruleId: id }); } catch (e) {} } wx.showToast({ title: `已删除 ${ids.length} 个`, icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } });
    },
  
    // ─── Generate default categories ───,

    async generatePubViewRules() {
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: '请先选择活动', icon: 'none' }); return; }
      this.setLoading('generatePubViewRules', true);
      try {
        const result = await this.callCloud('generatePubViewRules', { publicationId: pubId });
        if (result.status === 'success') {
          const parts = [];
          if (result.createdCount > 0) parts.push(`已生成 ${result.createdCount} 个`);
          if (result.skippedCount > 0) parts.push(`跳过 ${result.skippedCount} 个已存在`);
          if (result.backfilledCount > 0) parts.push(`补填 ${result.backfilledCount} 个条款`);
          const msg = parts.length > 0 ? parts.join('，') : '已全部就绪';
          wx.showToast({ title: msg, icon: 'success' });
          this.loadPublicationData(this.data.publicationForm.activityId);
        } else {
          wx.showToast({ title: result.message || '生成失败', icon: 'none' });
        }
      } catch (e) { wx.showToast({ title: '生成失败: ' + (e.message || '网络错误'), icon: 'none' }); }
      this.setLoading('generatePubViewRules', false);
    },

    async generatePubMeritRules() {
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: '请先选择活动', icon: 'none' }); return; }
      this.setLoading('generatePubMeritRules', true);
      try {
        const result = await this.callCloud('generatePubMeritRules', { publicationId: pubId });
        if (result.status === 'success') {
          const parts = [];
          if (result.createdCount > 0) parts.push(`已生成 ${result.createdCount} 个`);
          if (result.skippedCount > 0) parts.push(`跳过 ${result.skippedCount} 个已存在`);
          if (result.backfilledCount > 0) parts.push(`补填 ${result.backfilledCount} 个条款`);
          const msg = parts.length > 0 ? parts.join('，') : '已全部就绪';
          wx.showToast({ title: msg, icon: 'success' });
          this.loadPublicationData(this.data.publicationForm.activityId);
        } else {
          wx.showToast({ title: result.message || '生成失败', icon: 'none' });
        }
      } catch (e) { wx.showToast({ title: '生成失败: ' + (e.message || '网络错误'), icon: 'none' }); }
      this.setLoading('generatePubMeritRules', false);
    },
  
    // ─── Designation Picker (uses clauseId) ───,

    async openDesignationPicker(e) {
      const ds = e.currentTarget.dataset;
      const clauseId = ds.clauseId; const pubId = ds.pubId;
      if (!clauseId || !pubId) { wx.showToast({ title: '参数错误', icon: 'none' }); return; }
  
      // Show popup immediately with loading state
      this.setData({ showDesignationPicker: true, designationPickerClauseId: clauseId, designationPickerPubId: pubId, designationPickerHrList: [], designationPickerFilteredList: [], designationPickerSelectedIds: [], designationPickerSelectedList: [], desigSearchKeyword: '', desigFilterDept: '全部', desigFilterIdent: '全部', desigFilterDeptOptions: ['全部'], desigFilterIdentOptions: ['全部'] });
  
      try {
        // Reload publication data to get latest clause info and designations
        await this.loadPublicationData(this.data.publicationForm.activityId);
        const allClauses = [];
        for (const rule of this.data.pubMeritRuleList) {
          for (const c of (rule.clauses || [])) {
            allClauses.push({ ...c, granteeDepartmentId: rule.granteeDepartmentId });
          }
        }
        const clause = allClauses.find(c => c.id === clauseId);
        if (!clause) { wx.showToast({ title: '未找到该条款', icon: 'none' }); this.setData({ showDesignationPicker: false }); return; }
  
        const granteeDeptId = clause.granteeDepartmentId || '';
        const scopeType = clause.scopeType || 'all_people';
        const targetIdentityId = clause.targetIdentityId || '';
  
        const currentIds = (this.data.designationList || []).filter(d => d.clauseId === clauseId).map(d => d.targetHrId);
        const hrResult = await this.callCloud('listHrInfo');
        if (hrResult.status !== 'success') { wx.showToast({ title: '加载人事信息失败', icon: 'none' }); return; }
  
        const currentIdSet = new Set(currentIds);
        let granteeWgId = '';
        if (scopeType === 'same_work_group_identity' || scopeType === 'same_work_group_all') {
          const granteeHr = (hrResult.list || []).find(hr => hr.departmentId === granteeDeptId);
          granteeWgId = granteeHr ? (granteeHr.workGroupId || '') : '';
        }
        const filtered = (hrResult.list || []).filter(hr => {
          if (hr.identityId !== targetIdentityId) return false;
          if (scopeType === 'all_people' || scopeType === 'identity_only') return true;
          if (scopeType === 'same_department_identity' || scopeType === 'same_department_all') return hr.departmentId === granteeDeptId;
          if (scopeType === 'same_work_group_identity' || scopeType === 'same_work_group_all') return hr.departmentId === granteeDeptId && hr.workGroupId === granteeWgId;
          return true;
        }).map(hr => ({ ...hr, isSelected: currentIdSet.has(hr.id) }));
        const depts = new Set(filtered.map(hr => hr.department).filter(Boolean));
        const idents = new Set(filtered.map(hr => hr.identity).filter(Boolean));
        const selectedList = filtered.filter(hr => hr.isSelected);
        this.setData({
          designationPickerHrList: filtered, designationPickerFilteredList: filtered,
          designationPickerSelectedIds: currentIds, designationPickerSelectedList: selectedList,
          desigFilterDept: '全部', desigFilterIdent: '全部',
          desigFilterDeptOptions: ['全部', ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
          desigFilterIdentOptions: ['全部', ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
          desigSearchKeyword: ''
        });
      } catch (e) { console.error('openDesignationPicker error:', e); wx.showToast({ title: '加载失败: ' + (e.message || '未知错误'), icon: 'none' }); }
    },

    closeDesignationPicker() { this.setData({ showDesignationPicker: false }); },

    onDesignationPickerToggle(e) {
      const hrId = e.currentTarget.dataset.hrId;
      const selected = [...this.data.designationPickerSelectedIds];
      const idx = selected.indexOf(hrId);
      if (idx >= 0) selected.splice(idx, 1); else selected.push(hrId);
      const hrList = this.data.designationPickerHrList.map(hr => ({ ...hr, isSelected: hr.id === hrId ? !hr.isSelected : hr.isSelected }));
      this.setData({
        designationPickerSelectedIds: selected, designationPickerHrList: hrList,
        designationPickerFilteredList: this.applyDesigFilters(hrList),
        designationPickerSelectedList: hrList.filter(hr => hr.isSelected)
      });
    },

    applyDesigFilters(list) {
      let result = list || this.data.designationPickerHrList;
      if (this.data.desigFilterDept !== '全部') result = result.filter(hr => hr.department === this.data.desigFilterDept);
      if (this.data.desigFilterIdent !== '全部') result = result.filter(hr => hr.identity === this.data.desigFilterIdent);
      if (this.data.desigSearchKeyword) { const kw = this.data.desigSearchKeyword.toLowerCase(); result = result.filter(hr => (hr.name || '').toLowerCase().includes(kw) || (hr.studentId || '').toLowerCase().includes(kw)); }
      return result;
    },

    onDesigFilterChange(e) {
      const field = e.currentTarget.dataset.field;
      const options = field === 'identity' ? this.data.desigFilterIdentOptions : this.data.desigFilterDeptOptions;
      const value = options[Number(e.detail.value)] || '全部';
      const patch = { designationPickerFilteredList: this.applyDesigFilters() };
      if (field === 'department') patch.desigFilterDept = value; else patch.desigFilterIdent = value;
      this.setData(patch);
    },

    onDesigSearchInput(e) { this.setData({ desigSearchKeyword: e.detail.value, designationPickerFilteredList: this.applyDesigFilters() }); },

    async saveDesignations() {
      const clauseId = this.data.designationPickerClauseId;
      const pubId = this.data.designationPickerPubId;
      const hrIds = this.data.designationPickerSelectedIds;
      this.setLoading('saveDesignations', true);
      try {
        const result = await this.callCloud('saveMeritListDesignations', { clauseId, publicationId: pubId, designationHrIds: hrIds });
        if (result.status === 'success') { wx.showToast({ title: result.message || '已保存', icon: 'success' }); this.closeDesignationPicker(); this.loadPublicationData(this.data.publicationForm.activityId); }
        else { wx.showToast({ title: result.message || '保存失败', icon: 'none' }); }
      } catch (e) { wx.showToast({ title: '保存失败', icon: 'none' }); }
      this.setLoading('saveDesignations', false);
    },
    // ─── Batch category creation (replaces old batch form) ───,

    buildPubScorerCategoryList() {
      if (!this.data.departmentList.length || !this.data.identityList.length) return;
      const list = []; const seen = new Set();
      for (const dept of this.data.departmentList) { for (const ident of this.data.identityList) { const key = dept.id + '::' + ident.id; if (seen.has(key)) continue; seen.add(key); list.push({ key, departmentId: dept.id, department: dept.name, identityId: ident.id, identity: ident.name }); } };
      const depts = new Set(); const idents = new Set();
      list.forEach(item => { depts.add(item.department); idents.add(item.identity); });
      this.setData({ pubBatchList: list, pubBatchFilteredList: list, pubBatchFilterOptions: { departments: ['全部', ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))], identities: ['全部', ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))] } });
    },

    onPubBatchFilterChange(e) { /* kept for compatibility */ },

    applyPubBatchFilter(filters) { /* kept for compatibility */ },

    toggleBatchSelection(e) { /* kept for compatibility */ },

    toggleSelectAllBatch() { /* kept for compatibility */ },

    reverseSelectBatch() { /* kept for compatibility */ },
  
    // Batch save: apply current view clauses to selected view rule categories,

    async batchSavePubViewRules() {
      if (this.data.pubBatchRunning) { wx.showToast({ title: '批量操作进行中，请稍候', icon: 'none' }); return; }
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: '请先保存公示设置', icon: 'none' }); return; }
      const templateClauses = (this.data.pubViewRuleForm.clauses || []).map(c => ({ scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, displayMode: c.displayMode || 'score', gradeBands: c.displayMode === 'grade' ? (c.gradeBands || []) : [] }));
      const selected = (this.data.pubViewRuleList || []).filter(item => this.data.pubViewRuleSelectedIds[item.id]);
      if (!selected.length) { wx.showToast({ title: '请选择类别', icon: 'none' }); return; }
      this.setData({ pubBatchRunning: true });
      this.setLoading('batchSavePubViewRules', true);
      let count = 0;
      try {
        for (const item of selected) {
          const res = await this.callCloud('savePubViewRule', { id: item.id, publicationId: pubId, granteeDepartmentId: item.granteeDepartmentId, granteeIdentityId: item.granteeIdentityId, clauses: templateClauses });
          if (res.status === 'success') count++;
        }
        wx.showToast({ title: `已批量授权 ${count} 个类别`, icon: 'success' });
        this.loadPublicationData(this.data.publicationForm.activityId);
      } catch (e) { wx.showToast({ title: '批量操作失败', icon: 'none' }); }
      finally {
        this.setLoading('batchSavePubViewRules', false);
        this.setData({ pubBatchRunning: false });
      }
    },
  
    // Batch save: apply current merit clauses to selected merit rule categories,

    async batchSavePubMeritRules() {
      if (this.data.pubBatchRunning) { wx.showToast({ title: '批量操作进行中，请稍候', icon: 'none' }); return; }
      const pubId = this.data.publicationForm.id;
      if (!pubId) { wx.showToast({ title: '请先保存公示设置', icon: 'none' }); return; }
      const templateClauses = (this.data.pubMeritRuleForm.clauses || []).map(c => ({ scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, quotaLimit: c.quotaLimit || 0, requireExactQuota: c.requireExactQuota || false }));
      const selected = (this.data.pubMeritRuleList || []).filter(item => this.data.pubMeritRuleSelectedIds[item.id]);
      if (!selected.length) { wx.showToast({ title: '请选择类别', icon: 'none' }); return; }
      this.setData({ pubBatchRunning: true });
      this.setLoading('batchSavePubMeritRules', true);
      let ok = 0, err = 0;
      try {
        for (const item of selected) {
          const res = await this.callCloud('savePubMeritRule', { id: item.id, publicationId: pubId, granteeDepartmentId: item.granteeDepartmentId, granteeIdentityId: item.granteeIdentityId, clauses: templateClauses });
          if (res.status === 'success') ok++; else err++;
        }
        let msg = `成功 ${ok} 个`; if (err > 0) msg += `，${err} 个失败`;
        wx.showToast({ title: msg, icon: ok > 0 ? 'success' : 'none' });
        this.loadPublicationData(this.data.publicationForm.activityId);
      } catch (e) { wx.showToast({ title: '批量操作失败', icon: 'none' }); }
      finally {
        this.setLoading('batchSavePubMeritRules', false);
        this.setData({ pubBatchRunning: false });
      }
    }
  }
});
