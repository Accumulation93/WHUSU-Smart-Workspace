const orgSession = require('../../../../../utils/orgSession');
const copy = require('../../../../../locales/zh-CN/hrProfileMigration');
const { showShortToast, getErrorText } = require('./adminUtils');

function sameNameMatch(source, targetFields) {
  const label = String(source.label || '').trim().toLowerCase();
  if (!label) return null;
  const matches = (targetFields || []).filter((target) => String(target.label || '').trim().toLowerCase() === label);
  return matches.length === 1 ? matches[0] : null;
}

function buildFieldPlan(sourceFields, targetFields) {
  const used = new Set();
  return (sourceFields || []).map((source) => {
    const targetOptions = (targetFields || []).filter((target) => target.type === 'text' || target.type === source.type || source.type === 'text');
    const suggested = sameNameMatch(source, targetOptions);
    const target = suggested && !used.has(suggested.id) ? suggested : null;
    if (target) used.add(target.id);
    return {
      sourceFieldId: source.id,
      label: source.label,
      typeLabel: source.type,
      action: target ? 'copy' : 'skip',
      targetTemplateFieldId: target ? target.id : '',
      targetOptions: targetOptions.map((item) => ({ id: item.id, displayLabel: item.label })),
      targetIndex: target ? targetOptions.findIndex((item) => item.id === target.id) : 0,
      conflictPolicy: 'keep'
    };
  });
}

const DATE_MONTH_NAMES = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

function formatFieldValue(field) {
  const value = field && field.value == null ? '' : String(field.value);
  const text = value.trim();
  if (!text) return value;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    return match[1] + '.' + String(Number(match[2])).padStart(2, '0') + '.' + String(Number(match[3])).padStart(2, '0');
  }
  match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    return match[1] + '.' + String(Number(match[2])).padStart(2, '0') + '.' + String(Number(match[3])).padStart(2, '0');
  }
  match = text.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if (match) {
    const month = DATE_MONTH_NAMES[String(match[1]).toLowerCase()];
    if (month) return match[3] + '.' + month + '.' + String(Number(match[2])).padStart(2, '0');
  }
  return value;
}

module.exports = Behavior({
  methods: {
    onCrossOrgSourceChangeEvent(e) {
      this.onCrossOrgSourceChange({ detail: { value: e.detail.index } });
    },

    onCrossOrgFieldActionEvent(e) {
      this.onCrossOrgFieldActionChange({
        currentTarget: { dataset: { index: e.detail.index } },
        detail: { value: e.detail.action }
      });
    },

    onCrossOrgTargetEvent(e) {
      this.onCrossOrgTargetChange({
        currentTarget: { dataset: { index: e.detail.index } },
        detail: { value: e.detail.targetIndex }
      });
    },

    onCrossOrgConflictEvent(e) {
      this.onCrossOrgConflictChange({
        currentTarget: { dataset: { index: e.detail.index } },
        detail: { value: e.detail.policy }
      });
    },

    onCrossOrgBatchConflictEvent(e) {
      this.batchCrossOrgConflict({ currentTarget: { dataset: { policy: e.detail.policy } } });
    },

    onCrossOrgApproveEvent(e) {
      this.reviewCrossOrgMigrationRequest({ currentTarget: { dataset: { id: e.detail.id, action: 'approve' } } });
    },

    onCrossOrgRejectEvent(e) {
      this.reviewCrossOrgMigrationRequest({ currentTarget: { dataset: { id: e.detail.id, action: 'reject' } } });
    },

    onCrossOrgCancelEvent(e) {
      this.cancelCrossOrgMigrationRequest({ currentTarget: { dataset: { id: e.detail.id } } });
    },

    openCrossOrgMigration() {
      const request = orgSession.beginRequest(this, 'crossOrgMigration');
      this.setData({ crossOrgMigrationVisible: true, crossOrgMigrationLoading: true });
      this.callCloud('getCrossOrgMigrationContext', {})
        .then((result) => {
          if (!orgSession.isRequestCurrent(this, request)) return;
          if (result.status !== 'success') return showShortToast(result.message || copy.failed);
          this.setData({
            crossOrgMigrationOrgs: result.visibleOrgs || [],
            canDirectCrossOrgMigration: Boolean(result.canDirect),
            crossOrgMigrationSourceOrgId: '',
            crossOrgMigrationSourceFields: [],
            crossOrgMigrationTargetFields: [],
            crossOrgMigrationFieldPlan: [],
            crossOrgMigrationReport: null,
            crossOrgMigrationConflicts: [],
            crossOrgMigrationToken: ''
          });
        })
        .catch((error) => showShortToast(getErrorText(error, copy.failed)))
        .then(() => this.setData({ crossOrgMigrationLoading: false }));
    },

    closeCrossOrgMigration() {
      orgSession.beginRequest(this, 'crossOrgMigration');
      this.setData({
        crossOrgMigrationVisible: false,
        crossOrgMigrationSourceOrgId: '',
        crossOrgMigrationFieldPlan: [],
        crossOrgMigrationReport: null,
        crossOrgMigrationConflicts: [],
        crossOrgMigrationToken: ''
      });
    },

    onCrossOrgSourceChange(e) {
      const index = Number(e.detail.value);
      const org = (this.data.crossOrgMigrationOrgs || [])[index] || {};
      const sourceOrgId = org.id || '';
      const request = orgSession.beginRequest(this, 'crossOrgMigration');
      this.setData({
        crossOrgMigrationSourceOrgId: sourceOrgId,
        crossOrgMigrationSourceIndex: index,
        crossOrgMigrationSourceOrgName: org.name || '',
        crossOrgMigrationLoading: true
      });
      this.callCloud('getCrossOrgMigrationContext', { sourceOrgId })
        .then((result) => {
          if (!orgSession.isRequestCurrent(this, request)) return;
          if (result.status !== 'success') return showShortToast(result.message || copy.failed);
          const plan = buildFieldPlan(result.sourceFields || [], result.targetFields || []);
          this.setData({
            crossOrgMigrationSourceFields: result.sourceFields || [],
            crossOrgMigrationTargetFields: result.targetFields || [],
            crossOrgMigrationFieldPlan: plan,
            crossOrgMigrationReport: null,
            crossOrgMigrationConflicts: [],
            crossOrgMigrationToken: ''
          });
          if (!plan.length) showShortToast(copy.noSourceFields);
        })
        .catch((error) => showShortToast(getErrorText(error, copy.failed)))
        .then(() => this.setData({ crossOrgMigrationLoading: false }));
    },

    resolveCrossOrgPersonIds() {
      const selected = new Set(this.data.selectedHrMemberIds || []);
      const rows = (this._hrProfileFilteredRows && this._hrProfileFilteredRows.length)
        ? this._hrProfileFilteredRows
        : (this.data.hrProfileRows || []);
      const ids = [];
      rows.forEach((row) => {
        if (selected.has(row.id) && row.personId) ids.push(row.personId);
      });
      return Array.from(new Set(ids));
    },

    async previewCrossOrgMigration() {
      const sourceOrgId = this.data.crossOrgMigrationSourceOrgId;
      if (!sourceOrgId) return showShortToast(copy.sourceOrgPlaceholder);
      const personIds = this.resolveCrossOrgPersonIds();
      if (!personIds.length) return showShortToast(copy.noMembers);
      const fieldActions = (this.data.crossOrgMigrationFieldPlan || []).map((item) => ({
        sourceFieldId: item.sourceFieldId,
        action: item.action,
        targetTemplateFieldId: item.targetTemplateFieldId,
        conflictPolicy: item.conflictPolicy || 'keep'
      }));
      this.setData({ crossOrgMigrationLoading: true });
      try {
        const result = await this.callCloud('previewCrossOrgMigration', { sourceOrgId, personIds, fieldActions });
        if (result.status !== 'success' && result.status !== 'mapping_blocked') {
          return showShortToast(result.message || copy.failed);
        }
        this.setData({
          crossOrgMigrationToken: result.switchToken || '',
          crossOrgMigrationReport: result.status === 'mapping_blocked'
            ? (result.blockers || []).map((item, index) => Object.assign({}, item, { _key: 'b' + index }))
            : [],
          crossOrgMigrationConflicts: (result.conflicts || []).map((item, index) => Object.assign({}, item, { _key: 'c' + index })),
          crossOrgMigrationSummary: result.summary || null
        });
      } catch (error) {
        showShortToast(getErrorText(error, copy.failed));
      } finally {
        this.setData({ crossOrgMigrationLoading: false });
      }
    },

    closeCrossOrgMigrationReport() {
      this.setData({ crossOrgMigrationReport: [] });
    },

    onCrossOrgFieldActionChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const action = e.detail.value === 'copy' ? 'copy' : 'skip';
      const plan = (this.data.crossOrgMigrationFieldPlan || []).slice();
      if (!plan[index]) return;
      plan[index] = Object.assign({}, plan[index], {
        action,
        targetTemplateFieldId: action === 'copy' ? plan[index].targetTemplateFieldId : '',
        conflictPolicy: action === 'copy' ? (plan[index].conflictPolicy || 'keep') : 'keep'
      });
      this.setData({ crossOrgMigrationFieldPlan: plan, crossOrgMigrationToken: '' });
    },

    onCrossOrgTargetChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const targetIndex = Number(e.detail.value);
      const plan = (this.data.crossOrgMigrationFieldPlan || []).slice();
      if (!plan[index]) return;
      const option = plan[index].targetOptions[targetIndex] || {};
      plan[index] = Object.assign({}, plan[index], {
        targetIndex,
        targetTemplateFieldId: option.id || '',
        action: option.id ? 'copy' : 'skip'
      });
      this.setData({ crossOrgMigrationFieldPlan: plan, crossOrgMigrationToken: '' });
    },

    onCrossOrgConflictChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const policy = e.detail.value === 'overwrite' ? 'overwrite' : 'keep';
      const conflicts = (this.data.crossOrgMigrationConflicts || []).slice();
      if (!conflicts[index]) return;
      conflicts[index] = Object.assign({}, conflicts[index], { conflictPolicy: policy });
      this.setData({ crossOrgMigrationConflicts: conflicts, crossOrgMigrationToken: '' });
    },

    batchCrossOrgConflict(e) {
      const policy = e.currentTarget.dataset.policy === 'overwrite' ? 'overwrite' : 'keep';
      const conflicts = (this.data.crossOrgMigrationConflicts || []).map((item) => Object.assign({}, item, { conflictPolicy: policy }));
      this.setData({ crossOrgMigrationConflicts: conflicts, crossOrgMigrationToken: '' });
    },

    buildCrossOrgFieldActions() {
      return (this.data.crossOrgMigrationFieldPlan || []).map((item) => {
        const overrides = (this.data.crossOrgMigrationConflicts || [])
          .filter((conflict) => conflict.sourceFieldId === item.sourceFieldId);
        const policy = overrides.length && overrides.every((conflict) => conflict.conflictPolicy === 'overwrite')
          ? 'overwrite' : 'keep';
        return {
          sourceFieldId: item.sourceFieldId,
          action: item.action,
          targetTemplateFieldId: item.targetTemplateFieldId,
          conflictPolicy: policy
        };
      });
    },

    async applyCrossOrgMigration() {
      const sourceOrgId = this.data.crossOrgMigrationSourceOrgId;
      const personIds = this.resolveCrossOrgPersonIds();
      if (!sourceOrgId || !personIds.length) return showShortToast(copy.noMembers);
      if (!this.data.crossOrgMigrationToken) return showShortToast(copy.failed);
      const direct = Boolean(this.data.canDirectCrossOrgMigration);
      const name = direct ? 'applyCrossOrgMigration' : 'submitCrossOrgMigrationRequest';
      this.setData({ crossOrgMigrationSubmitting: true });
      try {
        const result = await this.callCloud(name, {
          sourceOrgId,
          personIds,
          fieldActions: this.buildCrossOrgFieldActions(),
          switchToken: this.data.crossOrgMigrationToken
        });
        if (result.status !== 'success') return showShortToast(result.message || copy.failed);
        showShortToast(direct ? copy.success : copy.submitted, 'success');
        this.closeCrossOrgMigration();
        this.loadCrossOrgMigrationRequests();
      } catch (error) {
        showShortToast(getErrorText(error, copy.failed));
      } finally {
        this.setData({ crossOrgMigrationSubmitting: false });
      }
    },

    async loadCrossOrgMigrationRequests() {
      try {
        const result = await this.callCloud('listCrossOrgMigrationRequests', {});
        if (result.status !== 'success') return;
        this.setData({
          crossOrgMyRequests: result.myRequests || [],
          crossOrgPendingRequests: result.pendingForMe || []
        });
      } catch (_) {}
    },

    async reviewCrossOrgMigrationRequest(e) {
      const id = e.currentTarget.dataset.id;
      const action = e.currentTarget.dataset.action;
      if (action === 'reject') {
        const that = this;
        wx.showModal({
          title: copy.reject,
          editable: true,
          placeholderText: copy.rejectReasonPlaceholder,
          success(res) {
            const reason = String(res.content || '').trim();
            if (!res.confirm) return;
            if (!reason) return showShortToast(copy.rejectReasonPlaceholder);
            that.submitCrossOrgReview(id, 'reject', reason);
          }
        });
        return;
      }
      this.submitCrossOrgReview(id, 'approve', '');
    },

    async submitCrossOrgReview(id, action, reason) {
      try {
        const result = await this.callCloud('reviewCrossOrgMigrationRequest', { id, action, reason });
        if (result.status !== 'success') return showShortToast(result.message || copy.failed);
        showShortToast(copy.reviewed, 'success');
        this.loadCrossOrgMigrationRequests();
      } catch (error) {
        showShortToast(getErrorText(error, copy.failed));
      }
    },

    async cancelCrossOrgMigrationRequest(e) {
      const id = e.currentTarget.dataset.id;
      try {
        const result = await this.callCloud('cancelCrossOrgMigrationRequest', { id });
        if (result.status !== 'success') return showShortToast(result.message || copy.failed);
        showShortToast(copy.cancelled, 'success');
        this.loadCrossOrgMigrationRequests();
      } catch (error) {
        showShortToast(getErrorText(error, copy.failed));
      }
    },

    async loadPersonOrgProfiles(personId) {
      if (!personId) return;
      this.setData({ personOrgProfilesLoading: true, personOrgProfiles: [], personOrgProfilesPersonId: personId });
      try {
        const result = await this.callCloud('getPersonOrgProfiles', { personId });
        if (result.status !== 'success') return;
        const groups = (result.groups || []).map((group) => Object.assign({}, group, {
          fields: (group.fields || []).map((field) => Object.assign({}, field, {
            value: formatFieldValue(field)
          }))
        }));
        const current = groups.filter((group) => group.isCurrent)[0] || null;
        this.setData({
          personOrgProfiles: groups,
          currentOrgName: current ? current.orgName : '',
          orgProfileCurrentExpanded: true,
          otherOrgProfileGroups: groups.filter((group) => !group.isCurrent).map((group) => Object.assign({}, group, {
            expanded: false
          }))
        });
      } catch (_) {
      } finally {
        this.setData({ personOrgProfilesLoading: false });
      }
    },

    toggleOrgProfileGroup(e) {
      if (e.currentTarget.dataset.org === 'current') {
        this.setData({ orgProfileCurrentExpanded: !this.data.orgProfileCurrentExpanded });
        return;
      }
      const index = Number(e.currentTarget.dataset.index);
      const groups = (this.data.otherOrgProfileGroups || []).slice();
      if (!groups[index]) return;
      groups[index] = Object.assign({}, groups[index], { expanded: !groups[index].expanded });
      this.setData({ otherOrgProfileGroups: groups });
    },

    openPersonOrgProfiles() {
      let personId = '';
      const profile = this.data.detailHrProfile || {};
      if (profile.personId) personId = profile.personId;
      if (!personId) {
        const rows = this.data.hrProfileRows || [];
        const row = rows.find((item) => item.id === this.data.detailHrId);
        if (row && row.personId) personId = row.personId;
      }
      if (!personId) return showShortToast(copy.failed);
      this.loadPersonOrgProfiles(personId);
    },

    togglePersonOrgProfile(e) {
      const index = Number(e.currentTarget.dataset.index);
      const groups = (this.data.personOrgProfiles || []).slice();
      if (!groups[index]) return;
      groups[index] = Object.assign({}, groups[index], { expanded: !groups[index].expanded });
      this.setData({ personOrgProfiles: groups });
    }
  }
});
