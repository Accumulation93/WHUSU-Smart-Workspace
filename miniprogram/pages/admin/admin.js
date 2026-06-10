const { callFunction } = require('../../utils/api');
const { chooseTableFile, buildCsv, buildExcelXml, saveAndShareFile } = require('../../utils/tableFile');

const STORAGE_KEY = 'roleProfiles';
const TAB_LIST = ['activities', 'templates', 'rules', 'results', 'hrInfo', 'departments', 'workGroups', 'identities', 'admins', 'settings', 'publications'];
const TIMEZONE_OPTIONS = [
  { value: -12, label: 'UTC-12 (国际日期变更线西)' },
  { value: -11, label: 'UTC-11 (中途岛)' },
  { value: -10, label: 'UTC-10 (夏威夷)' },
  { value: -9, label: 'UTC-9 (阿拉斯加)' },
  { value: -8, label: 'UTC-8 (洛杉矶)' },
  { value: -7, label: 'UTC-7 (丹佛)' },
  { value: -6, label: 'UTC-6 (芝加哥)' },
  { value: -5, label: 'UTC-5 (纽约)' },
  { value: -4, label: 'UTC-4 (圣地亚哥)' },
  { value: -3, label: 'UTC-3 (巴西利亚)' },
  { value: -2, label: 'UTC-2 (中大西洋)' },
  { value: -1, label: 'UTC-1 (亚速尔)' },
  { value: 0, label: 'UTC+0 (伦敦)' },
  { value: 1, label: 'UTC+1 (巴黎)' },
  { value: 2, label: 'UTC+2 (开罗)' },
  { value: 3, label: 'UTC+3 (莫斯科)' },
  { value: 4, label: 'UTC+4 (迪拜)' },
  { value: 5, label: 'UTC+5 (卡拉奇)' },
  { value: 6, label: 'UTC+6 (达卡)' },
  { value: 7, label: 'UTC+7 (曼谷)' },
  { value: 8, label: 'UTC+8 (北京/上海/香港)' },
  { value: 9, label: 'UTC+9 (东京)' },
  { value: 10, label: 'UTC+10 (悉尼)' },
  { value: 11, label: 'UTC+11 (所罗门群岛)' },
  { value: 12, label: 'UTC+12 (奥克兰)' }
];
const RULE_SCOPE_OPTIONS = [
  { value: 'same_department_identity', label: '同一部门内的指定身份成员' },
  { value: 'same_department_all', label: '同一部门内的所有成员' },
  { value: 'same_work_group_identity', label: '同一部门同一职能组内的指定身份成员' },
  { value: 'same_work_group_all', label: '同一部门同一职能组内的所有成员' },
  { value: 'identity_only', label: '全体成员中的指定身份' },
  { value: 'all_people', label: '全体成员' }
];
const VIEW_SCOPE_OPTIONS = [
  { value: 'own_results', label: '仅查看自己的评分结果' },
  { value: 'same_work_group_identity', label: '查看同职能组内指定身份的成员结果' },
  { value: 'same_work_group_all', label: '查看同职能组内所有成员的结果' },
  { value: 'same_department_identity', label: '查看同部门内指定身份的成员结果' },
  { value: 'same_department_all', label: '查看同部门内所有成员的结果' },
  { value: 'all_people', label: '查看全部成员的结果' }
];
const VIEW_SCOPE_LABEL_MAP = VIEW_SCOPE_OPTIONS.reduce((map, item) => { map[item.value] = item.label; return map; }, {});
const PROFILE_EDIT_MODE_OPTIONS = [
  { value: 'direct', label: '允许直接修改' },
  { value: 'audit', label: '需审核修改' },
  { value: 'readonly', label: '不允许修改' }
];
const PROFILE_FIELD_TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'sequence', label: '序列' },
  { value: 'date', label: '日期' },
  { value: 'phone', label: '手机号' },
  { value: 'email', label: '邮箱' }
];
const NUMBER_RULE_OPTIONS = [
  { value: 'value_range', label: '按数值范围' },
  { value: 'length_range', label: '按长度范围' }
];

const RULE_SCOPE_LABEL_MAP = RULE_SCOPE_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const TEMPLATE_CSV_FIELDS = [
  { key: 'question',   label: '问题内容', aliases: ['问题', '问题内容', '题目', 'question'] },
  { key: 'scoreLabel', label: '分值说明', aliases: ['分值说明', '说明', 'scoreLabel', '分值标签', '标签'] },
  { key: 'minValue',   label: '最低分',   aliases: ['最低分', '最小值', 'minValue', 'min', '最低'] },
  { key: 'startValue', label: '起评分',   aliases: ['起评分', '起始分', 'startValue', 'start', '起始'] },
  { key: 'maxValue',   label: '最高分',   aliases: ['最高分', '最大值', 'maxValue', 'max', '最高'] },
  { key: 'stepValue',  label: '步进值',   aliases: ['步进值', '步长', 'stepValue', 'step', '步进'] }
];

function _csvEscapeField(value) {
  const s = String(value == null ? '' : value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatScoreFixed3(value) {
  return toNumber(value, 0).toFixed(3);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ── Progress bar colour: 0–100 HSL lookup (red → orange → yellow → green, always bright) ──
function getProgressColor(ratePercent) {
  const t = clampNumber(toNumber(ratePercent, 0), 0, 100) / 100;

  // Hue: 0° red → 30° orange → 55° golden-yellow → 140° green
  let hue;
  if (t < 0.35)       hue = (t / 0.35) * 30;               // 0–35%  red → orange
  else if (t < 0.65)  hue = 30 + ((t - 0.35) / 0.30) * 25; // 35–65% orange → yellow
  else                hue = 55 + ((t - 0.65) / 0.35) * 85;  // 65–100% yellow → green

  // Saturation: high throughout (80–95%), peaking in the middle
  const sat = 85 + Math.sin(t * Math.PI) * 10;

  // Lightness: bright range (48–58%), peaking at golden-yellow
  const light = 50 + Math.sin(t * Math.PI) * 8;

  return `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
}

function buildProgressFillStyle(ratePercent) {
  const percent = clampNumber(toNumber(ratePercent, 0), 0, 100);
  const color = getProgressColor(percent);
  return `width: ${percent}%; background: linear-gradient(90deg, rgba(255,255,255,0.30), ${color});`;
}

function emptyRuleForm() {
  return {
    id: '',
    scorerDepartmentId: '',
    scorerDepartment: '',
    scorerIdentityId: '',
    scorerIdentity: '',
    allowSelfAssessment: true,
    clauseScope: RULE_SCOPE_OPTIONS[0].value,
    clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
    clauseTargetIdentityId: '',
    clauseTargetIdentity: '',
    clauseRequireAllComplete: false,
    clauseTemplateId: '',
    clauseTemplateName: '',
    clauseTemplateWeight: '1',
    clauseTemplateOrder: '',
    clauseCalculationMethod: 'weighted_average',
    clauseTrimHighCount: 0,
    clauseTrimLowCount: 0,
    clauseTemplateConfigEditingIndex: -1,
    clauseEditingIndex: -1,
    isRuleClauseEditorVisible: false,
    isTemplateConfigEditorVisible: false,
    clauseTemplateConfigs: [],
    clauses: []
  };
}

function emptyHrForm() {
  return {
    id: '',
    name: '',
    studentId: '',
    department: '',
    identity: '',
    workGroup: ''
  };
}

function createEmptyProfileField() {
  return {
    id: `profile_field_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    label: '',
    type: PROFILE_FIELD_TYPE_OPTIONS[0].value,
    typeLabel: PROFILE_FIELD_TYPE_OPTIONS[0].label,
    required: false,
    minLength: '',
    maxLength: '',
    numberRule: NUMBER_RULE_OPTIONS[0].value,
    numberRuleLabel: NUMBER_RULE_OPTIONS[0].label,
    allowDecimal: true,
    minDigits: '',
    maxDigits: '',
    minValue: '',
    maxValue: '',
    optionsText: ''
  };
}

function emptyHrProfileTemplateForm() {
  return {
    description: '',
    editMode: PROFILE_EDIT_MODE_OPTIONS[0].value,
    editModeLabel: PROFILE_EDIT_MODE_OPTIONS[0].label,
    fields: [createEmptyProfileField()]
  };
}

function normalizeHrProfileFieldForForm(field = {}) {
  const type = field.type || PROFILE_FIELD_TYPE_OPTIONS[0].value;
  const typeOption = PROFILE_FIELD_TYPE_OPTIONS.find((item) => item.value === type) || PROFILE_FIELD_TYPE_OPTIONS[0];
  const numberRule = field.numberRule || NUMBER_RULE_OPTIONS[0].value;
  const numberRuleOption = NUMBER_RULE_OPTIONS.find((item) => item.value === numberRule) || NUMBER_RULE_OPTIONS[0];
  return {
    id: field.id || createEmptyProfileField().id,
    label: field.label || '',
    type,
    typeLabel: typeOption.label,
    required: field.required === true,
    minLength: field.minLength == null ? '' : String(field.minLength),
    maxLength: field.maxLength == null ? '' : String(field.maxLength),
    numberRule,
    numberRuleLabel: numberRuleOption.label,
    allowDecimal: field.allowDecimal !== false,
    minDigits: field.minDigits == null ? '' : String(field.minDigits),
    maxDigits: field.maxDigits == null ? '' : String(field.maxDigits),
    minValue: field.minValue == null ? '' : String(field.minValue),
    maxValue: field.maxValue == null ? '' : String(field.maxValue),
    optionsText: Array.isArray(field.options) ? field.options.join('\n') : ''
  };
}

function emptyAdminForm() {
  return {
    id: '',
    name: '',
    studentId: '',
    adminLevel: 'admin',
    inviteCode: ''
  };
}

function emptyDepartmentForm() {
  return {
    id: '',
    name: '',
    description: ''
  };
}

function emptyWorkGroupForm() {
  return {
    id: '',
    name: '',
    departmentId: '',
    departmentCode: '',
    departmentName: '',
    description: ''
  };
}

function emptyIdentityForm() {
  return {
    id: '',
    name: '',
    description: ''
  };
}

function emptyActivityForm() {
  return {
    id: '',
    name: '',
    description: '',
    startDate: '',
    endDate: ''
  };
}

function createEmptyQuestion() {
  return {
    question: '',
    scoreLabel: '',
    minValue: '0',
    startValue: '0',
    maxValue: '10',
    stepValue: '1'
  };
}

function normalizeTemplateQuestionForForm(question = {}) {
  return {
    question: question.question || '',
    scoreLabel: question.scoreLabel || '',
    minValue: String(question.minValue == null ? 0 : question.minValue),
    startValue: String(question.startValue == null ? 0 : question.startValue),
    maxValue: String(question.maxValue == null ? 0 : question.maxValue),
    stepValue: String(question.stepValue == null ? 0.5 : question.stepValue)
  };
}

function emptyTemplateForm() {
  return {
    id: '',
    name: '',
    description: '',
    questions: []
  };
}

function createLocalInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createTemplateConfig(config = {}) {
  return {
    templateId: config.templateId || '',
    templateName: config.templateName || '',
    weight: config.weight == null ? '1' : String(config.weight),
    sortOrder: config.sortOrder == null ? '' : String(config.sortOrder),
    calculationMethod: config.calculationMethod || 'weighted_average',
    trimHighCount: Number(config.trimHighCount || 0),
    trimLowCount: Number(config.trimLowCount || 0)
  };
}

function normalizeClauseForEdit(clause = {}) {
  const templateConfigs = Array.isArray(clause.templateConfigs) && clause.templateConfigs.length
    ? clause.templateConfigs.map((item) => createTemplateConfig(item))
    : [];

  return {
    scopeType: clause.scopeType || RULE_SCOPE_OPTIONS[0].value,
    scopeLabel: getScopeLabel(clause.scopeType || RULE_SCOPE_OPTIONS[0].value),
    targetIdentityId: String(clause.targetIdentityId || '').trim(),
    targetIdentity: String(clause.targetIdentity || '').trim(),
    requireAllComplete: clause.requireAllComplete === true,
    templateConfigs
  };
}

function moveItem(list, fromIndex, toIndex) {
  const nextList = [...list];
  const [moved] = nextList.splice(fromIndex, 1);
  nextList.splice(toIndex, 0, moved);
  return nextList;
}

function refreshTemplateConfigSortOrder(templateConfigs = []) {
  return templateConfigs.map((item, index) => ({
    ...item,
    sortOrder: String(index + 1)
  }));
}

function getScopeLabel(value) {
  return RULE_SCOPE_LABEL_MAP[value] || value || '';
}

function normalizeTemplateConfigsForSave(templateConfigs = []) {
  return refreshTemplateConfigSortOrder((templateConfigs || [])
    .map((item) => ({
      templateId: String(item.templateId || '').trim(),
      templateName: String(item.templateName || '').trim(),
      weight: String(item.weight == null ? '1' : item.weight).trim(),
      sortOrder: String(item.sortOrder || '').trim(),
      calculationMethod: item.calculationMethod || 'weighted_average',
      trimHighCount: Number(item.trimHighCount || 0),
      trimLowCount: Number(item.trimLowCount || 0)
    }))
    .filter((item) => item.templateId));
}

function buildPendingTemplateConfigForSave(form = {}) {
  const templateId = String(form.clauseTemplateId || '').trim();
  if (!templateId) {
    return {
      status: 'empty'
    };
  }

  const weight = Number(form.clauseTemplateWeight);
  if (!Number.isFinite(weight) || weight <= 0) {
    return {
      status: 'invalid',
      message: '评分问题权重必须大于 0'
    };
  }

  const currentConfigs = Array.isArray(form.clauseTemplateConfigs) ? form.clauseTemplateConfigs : [];
  const editingIndex = Number(form.clauseTemplateConfigEditingIndex);
  const sortOrderValue = editingIndex >= 0 && currentConfigs[editingIndex]
    ? Number(currentConfigs[editingIndex].sortOrder) || (editingIndex + 1)
    : currentConfigs.length + 1;

  return {
    status: 'ready',
    config: {
      templateId,
      templateName: String(form.clauseTemplateName || '').trim(),
      weight: String(weight),
      sortOrder: String(sortOrderValue),
      calculationMethod: form.clauseCalculationMethod || 'weighted_average',
      trimHighCount: Number(form.clauseTrimHighCount || 0),
      trimLowCount: Number(form.clauseTrimLowCount || 0)
    }
  };
}

function mergePendingTemplateConfig(form = {}) {
  const templateConfigs = [...(form.clauseTemplateConfigs || [])];
  const pending = buildPendingTemplateConfigForSave(form);
  if (pending.status !== 'ready') {
    return {
      ok: pending.status !== 'invalid',
      message: pending.message || '',
      templateConfigs: normalizeTemplateConfigsForSave(templateConfigs)
    };
  }

  const editingIndex = Number(form.clauseTemplateConfigEditingIndex);
  if (editingIndex >= 0 && templateConfigs[editingIndex]) {
    templateConfigs[editingIndex] = pending.config;
  } else {
    const exists = templateConfigs.some((item) => (
      String(item.templateId || '') === pending.config.templateId
    ));
    if (!exists) {
      templateConfigs.push(pending.config);
    }
  }

  return {
    ok: true,
    message: '',
    templateConfigs: normalizeTemplateConfigsForSave(templateConfigs)
  };
}

function hasPendingRuleClauseDraft(form = {}) {
  return Number(form.clauseEditingIndex) >= 0
    || String(form.clauseTargetIdentityId || '').trim()
    || form.clauseRequireAllComplete === true
    || String(form.clauseTemplateId || '').trim()
    || (Array.isArray(form.clauseTemplateConfigs) && form.clauseTemplateConfigs.length > 0)
    || String(form.clauseScope || RULE_SCOPE_OPTIONS[0].value) !== RULE_SCOPE_OPTIONS[0].value;
}

function buildRuleClausesForSave(form = {}) {
  const clauses = Array.isArray(form.clauses)
    ? form.clauses.map((item) => normalizeClauseForEdit(item))
    : [];
  if (!hasPendingRuleClauseDraft(form)) {
    return {
      ok: true,
      clauses,
      message: ''
    };
  }

  const mergedConfigResult = mergePendingTemplateConfig(form);
  if (!mergedConfigResult.ok) {
    return {
      ok: false,
      clauses,
      message: mergedConfigResult.message
    };
  }

  const clauseScope = String(form.clauseScope || RULE_SCOPE_OPTIONS[0].value);
  const targetIdentityId = String(form.clauseTargetIdentityId || '').trim();
  const targetIdentity = String(form.clauseTargetIdentity || '').trim();
  if (clauseScope !== 'all_people' && clauseScope.indexOf('_all') === -1 && !targetIdentityId) {
    return {
      ok: false,
      clauses,
      message: '请填写被评分人身份'
    };
  }

  const nextClause = {
    scopeType: clauseScope,
    scopeLabel: getScopeLabel(clauseScope),
    targetIdentityId,
    targetIdentity,
    requireAllComplete: form.clauseRequireAllComplete === true,
    templateConfigs: mergedConfigResult.templateConfigs
  };
  const editingIndex = Number(form.clauseEditingIndex);
  if (editingIndex >= 0 && clauses[editingIndex]) {
    clauses[editingIndex] = nextClause;
  } else {
    const exists = clauses.some((item) => (
      item.scopeType === nextClause.scopeType
      && item.targetIdentityId === nextClause.targetIdentityId
      && item.requireAllComplete === nextClause.requireAllComplete
      && JSON.stringify(item.templateConfigs || []) === JSON.stringify(nextClause.templateConfigs)
    ));
    if (!exists) {
      clauses.push(nextClause);
    }
  }

  return {
    ok: true,
    clauses,
    message: ''
  };
}

function buildRuleClausesForBatchApply(form = {}) {
  const clauses = Array.isArray(form.clauses)
    ? form.clauses.map((item) => normalizeClauseForEdit(item))
    : [];
  return {
    ok: clauses.length > 0,
    clauses,
    message: clauses.length ? '' : '请先准备好要批量应用的被评分人规则'
  };
}

function buildRuleClauseText(clause = {}) {
  const scopeText = clause.scopeLabel || getScopeLabel(clause.scopeType) || '未设置被评分范围';
  const identityText = clause.targetIdentity ? `，被评分人身份：${clause.targetIdentity}` : '';
  const completeText = clause.requireAllComplete ? '，要求全评后计入核算' : '，不要求全评';
  const questionText = (clause.templateConfigs || []).length
    ? (clause.templateConfigs || [])
      .map((config) => `${config.templateName || '未命名评分问题'}（权重：${config.weight}，顺序：${config.sortOrder}）`)
      .join('、')
    : '未配置评分问题';
  return `${scopeText}${identityText}${completeText} [${questionText}]`;
}

function buildRuleListItem(rule = {}) {
  const clauses = (rule.clauses || []).map((item) => normalizeClauseForEdit(item));
  return {
    id: String(rule.id || '').trim(),
    activityId: String(rule.activityId || '').trim(),
    activityName: String(rule.activityName || '').trim(),
    scorerDepartmentId: String(rule.scorerDepartmentId || '').trim(),
    scorerDepartment: String(rule.scorerDepartment || '').trim(),
    scorerIdentityId: String(rule.scorerIdentityId || '').trim(),
    scorerIdentity: String(rule.scorerIdentity || '').trim(),
    clauses,
    ruleCount: clauses.length,
    clausesText: clauses.length
      ? clauses.map((clause) => buildRuleClauseText(clause)).join(' | ')
      : '未配置被评分人规则'
  };
}

function markSelectedRules(ruleList = [], selectedRuleIds = []) {
  const selectedIdSet = new Set((selectedRuleIds || []).map((item) => String(item)));
  return (ruleList || []).map((item) => ({
    ...item,
    isSelected: selectedIdSet.has(String(item.id || ''))
  }));
}

function createSelectedRuleIdMap(selectedRuleIds = []) {
  return (selectedRuleIds || []).reduce((map, item) => {
    const id = String(item || '').trim();
    if (id) {
      map[id] = true;
    }
    return map;
  }, {});
}

function emptyRuleFilters() {
  return {
    department: '全部',
    identity: '全部'
  };
}

function buildRuleFilterOptions(ruleList = []) {
  const departments = [];
  const identities = [];
  const departmentSet = new Set();
  const identitySet = new Set();

  (ruleList || []).forEach((item) => {
    const department = String(item.scorerDepartment || '').trim();
    const identity = String(item.scorerIdentity || '').trim();
    if (department && !departmentSet.has(department)) {
      departmentSet.add(department);
      departments.push(department);
    }
    if (identity && !identitySet.has(identity)) {
      identitySet.add(identity);
      identities.push(identity);
    }
  });

  return {
    departments: ['全部', ...departments.sort((a, b) => a.localeCompare(b, 'zh-CN'))],
    identities: ['全部', ...identities.sort((a, b) => a.localeCompare(b, 'zh-CN'))]
  };
}

function normalizeRuleFilters(filters = {}, filterOptions = buildRuleFilterOptions()) {
  const department = (filterOptions.departments || []).includes(filters.department) ? filters.department : '全部';
  const identity = (filterOptions.identities || []).includes(filters.identity) ? filters.identity : '全部';
  return {
    department,
    identity
  };
}

function filterRuleList(ruleList = [], filters = emptyRuleFilters()) {
  return (ruleList || []).filter((item) => {
    const departmentMatched = !filters.department
      || filters.department === '全部'
      || String(item.scorerDepartment || '') === filters.department;
    const identityMatched = !filters.identity
      || filters.identity === '全部'
      || String(item.scorerIdentity || '') === filters.identity;
    return departmentMatched && identityMatched;
  });
}

function buildResultFilterOptions(values = []) {
  return ['全部', ...values.filter(Boolean)];
}

function showShortToast(title, icon = 'none') {
  wx.showToast({
    title,
    icon
  });
}

function getErrorText(error, fallback) {
  const text = String((error && (error.errMsg || error.message)) || '').trim();
  return text || fallback;
}

const HR_PROFILE_STATUS_OPTIONS = ['全部状态', '待审核', '未提交', '已生效', '已驳回'];

function emptyHrProfileFilters() {
  return {
    department: '全部部门',
    identity: '全部身份',
    workGroup: '无',
    status: '全部状态',
    keyword: ''
  };
}

function emptyHrProfileFilterOptions() {
  return {
    departments: ['全部部门'],
    identities: ['全部身份'],
    workGroups: ['无'],
    statuses: HR_PROFILE_STATUS_OPTIONS
  };
}

function getHrProfileStatusOrder(auditStatus) {
  if (auditStatus === 'pending') {
    return 0;
  }
  if (auditStatus === 'none') {
    return 1;
  }
  if (auditStatus === 'approved') {
    return 2;
  }
  return 3;
}

function buildHrProfileFilterOptions(rows = []) {
  const departments = [];
  const identities = [];
  const workGroups = [];

  rows.forEach((item) => {
    if (item.department) {
      departments.push(item.department);
    }
    if (item.identity) {
      identities.push(item.identity);
    }
    if (item.workGroup) {
      workGroups.push(item.workGroup);
    }
  });

  return {
    departments: ['全部部门', ...[...new Set(departments)].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))],
    identities: ['全部身份', ...[...new Set(identities)].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))],
    workGroups: ['全部工作分工', ...[...new Set(workGroups)].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))],
    statuses: HR_PROFILE_STATUS_OPTIONS
  };
}

function applyHrProfileFilters(rows = [], filters = emptyHrProfileFilters()) {
  const keyword = String(filters.keyword || '').trim().toLowerCase();
  return (rows || []).filter((item) => {
    if (filters.department !== '全部部门' && item.department !== filters.department) {
      return false;
    }
    if (filters.identity !== '全部身份' && item.identity !== filters.identity) {
      return false;
    }
    if (filters.workGroup !== '无' && filters.workGroup !== '全部工作分工' && item.workGroup !== filters.workGroup) {
      return false;
    }
    if (filters.status !== '全部状态' && item.auditStatusText !== filters.status) {
      return false;
    }
    if (keyword) {
      const name = String(item.name || '').trim().toLowerCase();
      const studentId = String(item.studentId || '').trim().toLowerCase();
      if (!name.includes(keyword) && !studentId.includes(keyword)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const statusDiff = getHrProfileStatusOrder(a.auditStatus) - getHrProfileStatusOrder(b.auditStatus);
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
  });
}

function emptyResultFilters() {
  return {
    department: '全部',
    identity: '全部',
    workGroup: '全部',
    viewMode: 'overview',
    sortMode: 'score_desc'
  };
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const [year, month, day] = value.split('-').map((item) => Number(item));
  return date.getFullYear() === year
    && date.getMonth() + 1 === month
    && date.getDate() === day;
}

function getNumericLength(value) {
  return String(value || '').replace(/^[+-]/, '').replace('.', '').length;
}

function getProfileFieldTypeLabel(type) {
  if (type === 'number') {
    return '数字字段';
  }
  if (type === 'sequence') {
    return '序列选择';
  }
  if (type === 'date') {
    return '日期字段';
  }
  if (type === 'phone') {
    return '手机号字段';
  }
  if (type === 'email') {
    return '邮箱字段';
  }
  return '文本字段';
}

function buildFieldHint(field = {}) {
  if (field.type === 'text' && ((field.minLength != null && field.minLength !== '') || (field.maxLength != null && field.maxLength !== ''))) {
    const parts = [];
    if (field.minLength != null && field.minLength !== '') {
      parts.push(`最短 ${field.minLength}`);
    }
    if (field.maxLength != null && field.maxLength !== '') {
      parts.push(`最长 ${field.maxLength}`);
    }
    return `长度限制：${parts.join('，')}`;
  }

  if (field.type === 'number') {
    const decimalText = field.allowDecimal === false ? '仅整数' : '允许小数';
    if (field.numberRule === 'length_range' && ((field.minDigits != null && field.minDigits !== '') || (field.maxDigits != null && field.maxDigits !== ''))) {
      const parts = [];
      if (field.minDigits != null && field.minDigits !== '') {
        parts.push(`最短 ${field.minDigits}`);
      }
      if (field.maxDigits != null && field.maxDigits !== '') {
        parts.push(`最长 ${field.maxDigits}`);
      }
      return `数字长度：${parts.join('，')}，${decimalText}`;
    }
    if ((field.minValue != null && field.minValue !== '') || (field.maxValue != null && field.maxValue !== '')) {
      const parts = [];
      if (field.minValue != null && field.minValue !== '') {
        parts.push(`最小 ${field.minValue}`);
      }
      if (field.maxValue != null && field.maxValue !== '') {
        parts.push(`最大 ${field.maxValue}`);
      }
      return `数值范围：${parts.join('，')}，${decimalText}`;
    }
    return decimalText;
  }

  if (field.type === 'date') {
    return '格式：YYYY-MM-DD';
  }

  if (field.type === 'phone') {
    return '请输入 11 位手机号';
  }

  if (field.type === 'email') {
    return '示例：name@example.com';
  }

  return '';
}

function validateProfileField(field = {}, rawValue) {
  const value = normalizeEmptyValue(rawValue);

  if (!value) {
    return '';
  }

  if (field.type === 'text') {
    if (field.minLength != null && field.minLength !== '' && value.length < field.minLength) {
      return `${field.label}长度不能少于 ${field.minLength}`;
    }
    if (field.maxLength != null && field.maxLength !== '' && value.length > field.maxLength) {
      return `${field.label}长度不能超过 ${field.maxLength}`;
    }
  }

  if (field.type === 'number') {
    if (field.allowDecimal === false && !/^[+-]?\d+$/.test(value)) {
      return `${field.label}必须是整数`;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return `${field.label}必须是数字`;
    }
    if (field.numberRule === 'length_range') {
      const numericLength = getNumericLength(value);
      if (field.minDigits != null && field.minDigits !== '' && numericLength < field.minDigits) {
        return `${field.label}长度不能少于 ${field.minDigits}`;
      }
      if (field.maxDigits != null && field.maxDigits !== '' && numericLength > field.maxDigits) {
        return `${field.label}长度不能超过 ${field.maxDigits}`;
      }
    } else {
      if (field.minValue != null && field.minValue !== '' && numberValue < field.minValue) {
        return `${field.label}不能小于 ${field.minValue}`;
      }
      if (field.maxValue != null && field.maxValue !== '' && numberValue > field.maxValue) {
        return `${field.label}不能大于 ${field.maxValue}`;
      }
    }
  }

  if (field.type === 'sequence' && Array.isArray(field.options) && field.options.length && field.options.indexOf(value) === -1) {
    return `${field.label}必须从预设选项中选择`;
  }

  if (field.type === 'date' && !isValidDateString(value)) {
    return `${field.label}必须是有效日期`;
  }

  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) {
    return `${field.label}必须是有效手机号`;
  }

  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `${field.label}必须是有效邮箱`;
  }

  return '';
}

function tryParseDateValue(value) {
  var v = String(value || '').trim();
  if (!v) return null;

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD with optional time
  var m1 = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m1) {
    var year = Number(m1[1]);
    var month = Number(m1[2]);
    var day = Number(m1[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      var dt = new Date(year, month - 1, day);
      if (dt.getFullYear() === year && dt.getMonth() + 1 === month && dt.getDate() === day) {
        return { year: year, month: month, day: day };
      }
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  var m2 = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m2) {
    var d = Number(m2[1]);
    var mo = Number(m2[2]);
    var y = Number(m2[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      var dt2 = new Date(y, mo - 1, d);
      if (dt2.getFullYear() === y && dt2.getMonth() + 1 === mo && dt2.getDate() === d) {
        return { year: y, month: mo, day: d };
      }
    }
  }

  // Fallback to native Date
  var d3 = new Date(v);
  if (!isNaN(d3.getTime()) && d3.getFullYear() > 1900) {
    return { year: d3.getFullYear(), month: d3.getMonth() + 1, day: d3.getDate() };
  }
  var d4 = new Date(v.replace(' ', 'T'));
  if (!isNaN(d4.getTime()) && d4.getFullYear() > 1900) {
    return { year: d4.getFullYear(), month: d4.getMonth() + 1, day: d4.getDate() };
  }
  return null;
}

function detectFieldTypeFromValues(values) {
  var nonEmpty = (values || []).filter(function (v) { return String(v || '').trim() !== ''; });
  if (!nonEmpty.length) return 'text';

  var allDate = true;
  var allPhone = true;
  var allEmail = true;
  var allNumber = true;

  for (var i = 0; i < nonEmpty.length; i++) {
    var v = String(nonEmpty[i]).trim();
    if (!tryParseDateValue(v)) allDate = false;
    if (!/^1[3-9]\d{9}$/.test(v)) allPhone = false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) allEmail = false;
    if (!isFinite(Number(v)) || v === '') allNumber = false;
  }

  if (allDate) return 'date';
  if (allPhone) return 'phone';
  if (allEmail) return 'email';
  if (allNumber) return 'number';
  return 'text';
}

var EMPTY_VALUE_ALIASES = ['null', 'NULL', 'Null', '无', '空', 'N/A', 'NA', 'n/a', 'na', '-', '—', 'none', 'None', '/', '\\'];

function normalizeEmptyValue(value) {
  var v = String(value == null ? '' : value).trim();
  if (!v) return '';
  if (EMPTY_VALUE_ALIASES.indexOf(v) !== -1) return '';
  return v;
}

function getFieldTypeDisplayName(fieldDef) {
  var ft = (fieldDef && fieldDef.type) || 'text';
  var option = PROFILE_FIELD_TYPE_OPTIONS.find(function (item) { return item.value === ft; });
  return option ? option.label : '文本';
}

function getFieldTypeLabelForTarget(target, templateFields) {
  if (!target || target === 'ignore') return '—';
  if (target === 'name' || target === 'studentId' || target === 'department'
      || target === 'identity' || target === 'workGroup') {
    return '文本';
  }
  var fields = templateFields || [];
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].id === target) return getFieldTypeDisplayName(fields[i]);
  }
  return '文本';
}

function validateCsvValueAgainstField(value, fieldDef) {
  var v = normalizeEmptyValue(value);
  var fieldType = (fieldDef && fieldDef.type) || 'text';
  var typeLabel = getFieldTypeDisplayName(fieldDef);

  if (!v) return { ok: true };

  if (fieldType === 'text') {
    if (fieldDef.minLength && v.length < Number(fieldDef.minLength)) {
      return { ok: false, reason: '长度不能少于' + fieldDef.minLength, fieldType: typeLabel };
    }
    if (fieldDef.maxLength && v.length > Number(fieldDef.maxLength)) {
      return { ok: false, reason: '长度不能超过' + fieldDef.maxLength, fieldType: typeLabel };
    }
    return { ok: true };
  }

  if (fieldType === 'number') {
    if (fieldDef.allowDecimal === false && !/^[+-]?\d+$/.test(v)) {
      return { ok: false, reason: '必须是整数', fieldType: typeLabel };
    }
    var num = Number(v);
    if (!isFinite(num)) return { ok: false, reason: '不是有效数字', fieldType: typeLabel };
    if (fieldDef.numberRule === 'length_range') {
      var nlen = String(v).replace(/^[+-]/, '').replace('.', '').length;
      if (fieldDef.minDigits && nlen < Number(fieldDef.minDigits)) {
        return { ok: false, reason: '长度不能少于' + fieldDef.minDigits, fieldType: typeLabel };
      }
      if (fieldDef.maxDigits && nlen > Number(fieldDef.maxDigits)) {
        return { ok: false, reason: '长度不能超过' + fieldDef.maxDigits, fieldType: typeLabel };
      }
    } else {
      if (fieldDef.minValue !== '' && fieldDef.minValue != null && num < Number(fieldDef.minValue)) {
        return { ok: false, reason: '不能小于' + fieldDef.minValue, fieldType: typeLabel };
      }
      if (fieldDef.maxValue !== '' && fieldDef.maxValue != null && num > Number(fieldDef.maxValue)) {
        return { ok: false, reason: '不能大于' + fieldDef.maxValue, fieldType: typeLabel };
      }
    }
    return { ok: true };
  }

  if (fieldType === 'sequence') {
    var optionsArr = [];
    if (Array.isArray(fieldDef.options)) {
      optionsArr = fieldDef.options;
    } else if (fieldDef.optionsText) {
      optionsArr = String(fieldDef.optionsText).split(/[\n,]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    }
    if (optionsArr.length && optionsArr.indexOf(v) === -1) {
      return { ok: false, reason: '必须从预设选项中选择', fieldType: typeLabel };
    }
    return { ok: true };
  }

  if (fieldType === 'date') {
    if (!tryParseDateValue(v)) return { ok: false, reason: '不是有效日期（支持YYYY-MM-DD、YYYY/MM/DD、日期时间等格式）', fieldType: typeLabel };
    return { ok: true };
  }

  if (fieldType === 'phone') {
    if (!/^1[3-9]\d{9}$/.test(v)) return { ok: false, reason: '不是有效手机号', fieldType: typeLabel };
    return { ok: true };
  }

  if (fieldType === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, reason: '不是有效邮箱', fieldType: typeLabel };
    return { ok: true };
  }

  return { ok: true };
}

function jaccardCharSimilarity(a, b) {
  var sa = String(a || '').trim().toLowerCase();
  var sb = String(b || '').trim().toLowerCase();
  if (!sa || !sb) return 0;
  var setA = {}, setB = {};
  for (var i = 0; i < sa.length; i++) { setA[sa[i]] = true; }
  for (var i = 0; i < sb.length; i++) { setB[sb[i]] = true; }
  var intersection = 0, union = 0;
  var seen = {};
  for (var k in setA) { seen[k] = true; }
  for (var k in setB) { seen[k] = true; }
  for (var k in seen) {
    if (setA[k] && setB[k]) intersection++;
    union++;
  }
  return union === 0 ? 0 : intersection / union;
}

function autoMapCsvColumn(headerName, templateFields) {
  var h = String(headerName || '').trim().toLowerCase();
  if (!h) return 'ignore';
  var MIN_SIMILARITY = 0.4;

  var basicCandidates = [
    { target: 'name', aliases: ['姓名', 'name'] },
    { target: 'studentId', aliases: ['学号', 'studentid', 'student id'] },
    { target: 'department', aliases: ['所属部门', '部门', '学院', 'department'] },
    { target: 'identity', aliases: ['身份', 'identity'] },
    { target: 'workGroup', aliases: ['工作分工', '职能组', '职能', 'workgroup', 'work group'] }
  ];

  function scoreCandidates(candidates, source) {
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      var aliases = cand.aliases || [cand.label || ''];
      for (var j = 0; j < aliases.length; j++) {
        var alias = String(aliases[j] || '').trim().toLowerCase();
        if (!alias) continue;
        var score = 0;
        if (h === alias) {
          score = 1.0;
        } else if (h.indexOf(alias) >= 0 || alias.indexOf(h) >= 0) {
          score = 0.75;
        } else {
          score = jaccardCharSimilarity(h, alias);
        }
        if (score >= MIN_SIMILARITY) {
          if (!best || score > best.score) {
            best = { target: cand.target || cand.id, score: score, source: source };
          } else if (score === best.score && source === 'ext' && best.source === 'basic') {
            best = { target: cand.target || cand.id, score: score, source: source };
          }
        }
      }
    }
    return best;
  }

  var bestBasic = scoreCandidates(basicCandidates, 'basic');

  var extCandidates = [];
  var fields = templateFields || [];
  for (var i = 0; i < fields.length; i++) {
    extCandidates.push({ target: fields[i].id, aliases: [fields[i].label] });
  }
  var bestExt = scoreCandidates(extCandidates, 'ext');

  var winner = null;
  if (bestBasic && bestExt) {
    if (bestExt.score > bestBasic.score) {
      winner = bestExt;
    } else if (bestBasic.score > bestExt.score) {
      winner = bestBasic;
    } else {
      winner = bestExt;
    }
  } else {
    winner = bestBasic || bestExt;
  }

  return winner ? winner.target : 'ignore';
}

function buildCsvMappingOptions(templateFields) {
  var labels = ['— 忽略 —', '→ 姓名（基础字段）', '→ 学号（基础字段）', '→ 所属部门（基础字段）', '→ 身份（基础字段）', '→ 工作分工（基础字段）'];
  var values = ['ignore', 'name', 'studentId', 'department', 'identity', 'workGroup'];
  var fields = templateFields || [];
  for (var i = 0; i < fields.length; i++) {
    labels.push('→ ' + fields[i].label + '（扩展字段）');
    values.push(fields[i].id);
  }
  return { labels: labels, values: values };
}

function getOptionIndex(values, target) {
  for (var i = 0; i < values.length; i++) {
    if (values[i] === target) return i;
  }
  return 0;
}

function buildCsvColumnMapping(headers, samples, templateFields) {
  var mapping = buildCsvMappingOptions(templateFields);
  var labels = mapping.labels;
  var values = mapping.values;
  var rows = [];

  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    var sampleValues = [];
    // samples[0] = header row, samples[1..N] = data rows, aligned by index
    for (var r = 1; r < Math.min(samples.length, 6); r++) {
      var dr = samples[r] || [];
      sampleValues.push(dr[i] || '');
    }

    var target = autoMapCsvColumn(header, templateFields);
    var fieldTypeLabel = getFieldTypeLabelForTarget(target, templateFields);
    var optIdx = getOptionIndex(values, target);

    rows.push({
      header: header,
      target: target,
      fieldTypeLabel: fieldTypeLabel,
      sampleValue: sampleValues.length > 0 ? String(sampleValues[0] || '').trim() : '',
      optionIndex: optIdx,
      optionLabel: labels[optIdx] || ''
    });
  }
  return { rows: rows, labels: labels, values: values };
}

Page({
  data: {
    user: null,
    hasPermission: false,
    isSuperAdmin: false,
    canManageAdmins: false,
    isRootAdmin: false,
    activeTab: TAB_LIST[0],
    loadingMap: {},
    organizationList: [],
    currentOrganizationId: null,
    currentOrganizationName: '',
    orgFormVisible: false,
    orgFormData: { name: '' },
    scopeOptions: RULE_SCOPE_OPTIONS,
    profileEditModeOptions: PROFILE_EDIT_MODE_OPTIONS,
    profileFieldTypeOptions: PROFILE_FIELD_TYPE_OPTIONS,
    numberRuleOptions: NUMBER_RULE_OPTIONS,
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
    timezoneOptions: TIMEZONE_OPTIONS,
    timezoneIndex: 20,
    systemConfig: { timezone: 8 },
    // ─── Publication management ───
    publicationsLoading: false,
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
    viewScopeOptions: VIEW_SCOPE_OPTIONS,
    viewScopeLabelMap: VIEW_SCOPE_LABEL_MAP,
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

  onShow() {
    this.bootstrapPage();
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

    this.setData({
      user: adminProfile,
      hasPermission: true,
      isSuperAdmin,
      isRootAdmin,
      canManageAdmins,
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

    await this.loadActivityList();
    this.loadTemplateList();
    this.loadRuleList();
    if (!this._csvImportActive && !this.data.showCsvMappingDialog) {
      this.loadHrProfileAdminData();
      this.loadHrList();
    }
    this.loadAdminList();
    this.loadSystemConfig();
    this.loadOrganizations();
    await this.loadDepartmentList();
    await this.loadWorkGroupList();
    await this.loadIdentityList();
    this.updateHrFormOptions();
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
          // 先加载服务端状态，再决定是否需要静默创建（避免 savePublication 覆盖已发布状态）
          await this.loadPublicationData(currentActivityId);
          if (!this.data.publicationForm.id && currentActivityId) {
            await this.savePublication(true);
          }
          // Load merit summary (Feature 5)
          await this.loadMeritListSummary();
        }
        this.setData({ publicationsLoading: false });
      }).catch(() => { this.setData({ publicationsLoading: false }); });
    }
  },

  async loadSystemConfig() {
    this.setLoading('settings', true);
    try {
      const result = await this.callCloud('getSystemConfig');
      if (result.status === 'success' && result.config) {
        const timezone = result.config.timezone;
        const timezoneIndex = this.data.timezoneOptions.findIndex(function (item) {
          return item.value === timezone;
        });
        this.setData({
          systemConfig: { timezone: timezone },
          timezoneIndex: timezoneIndex >= 0 ? timezoneIndex : 20,
          currentOrganizationId: result.config.currentOrganization || null
        });
        this.resolveCurrentOrganizationName();
      }
    } catch (e) {
      console.error('loadSystemConfig error:', e);
    } finally {
      this.setLoading('settings', false);
    }
  },

  onTimezoneChange(e) {
    const idx = Number(e.detail.value);
    const option = this.data.timezoneOptions[idx];
    if (option) {
      this.setData({
        timezoneIndex: idx,
        systemConfig: { timezone: option.value }
      });
    }
  },

  async saveSystemConfig() {
    this.setLoading('saveSystemConfig', true);
    try {
      const result = await this.callCloud('saveSystemConfig', {
        timezone: this.data.systemConfig.timezone
      });
      if (result.status === 'success') {
        wx.showToast({ title: '配置已保存', icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    this.setLoading('saveSystemConfig', false);
  },

  async loadOrganizations() {
    if (!this.data.isRootAdmin) return;
    try {
      const result = await this.callCloud('listOrganizations');
      if (result.status === 'success') {
        this.setData({ organizationList: result.list || [] });
        this.resolveCurrentOrganizationName();
      }
    } catch (e) {
      console.error('loadOrganizations error:', e);
    }
  },

  resolveCurrentOrganizationName() {
    const orgId = this.data.currentOrganizationId;
    if (!orgId) {
      this.setData({ currentOrganizationName: '' });
      return;
    }
    const org = this.data.organizationList.find(function (o) { return o.id === orgId; });
    this.setData({ currentOrganizationName: org ? org.name : '' });
  },

  openOrgForm(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset.id;
    if (id) {
      const org = this.data.organizationList.find(function (o) { return o.id === id; });
      this.setData({ orgFormVisible: true, orgFormData: { id, name: org ? org.name : '' } });
    } else {
      this.setData({ orgFormVisible: true, orgFormData: { name: '' } });
    }
  },

  closeOrgForm() {
    this.setData({ orgFormVisible: false, orgFormData: { name: '' } });
  },

  onOrgFieldInput(e) {
    this.setData({
      orgFormData: { ...this.data.orgFormData, name: e.detail.value.trim() }
    });
  },

  async saveOrganization() {
    if (!this.data.orgFormData.name) {
      wx.showToast({ title: '请填写组织名称', icon: 'none' });
      return;
    }
    this.setLoading('saveOrganization', true);
    try {
      const result = await this.callCloud('saveOrganization', this.data.orgFormData);
      if (result.status === 'success') {
        wx.showToast({ title: '组织已保存', icon: 'success' });
        this.closeOrgForm();
        await this.loadOrganizations();
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '保存组织失败', icon: 'none' });
    }
    this.setLoading('saveOrganization', false);
  },

  async deleteOrganization(e) {
    const organizationId = e.currentTarget.dataset.id;
    if (!organizationId) return;
    const confirm = await new Promise(function (resolve) {
      wx.showModal({
        title: '删除组织',
        content: '删除后将清除该组织的所有数据，不可恢复。确认删除？',
        confirmText: '删除',
        cancelText: '取消',
        success: function (res) { resolve(res.confirm); }
      });
    });
    if (!confirm) return;
    this.setLoading('deleteOrganization', true);
    wx.showLoading({ title: '正在删除组织...', mask: true });
    try {
      const result = await this.callCloud('deleteOrganization', { organizationId });
      if (result.status === 'success') {
        wx.showToast({ title: '组织已删除', icon: 'success' });
        await this.loadOrganizations();
      } else {
        wx.showToast({ title: result.message || '删除失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '删除组织失败', icon: 'none' });
    }
    wx.hideLoading();
    this.setLoading('deleteOrganization', false);
  },

  async switchOrganization(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id || !name) return;
    const confirm = await new Promise(function (resolve) {
      wx.showModal({
        title: '切换组织',
        content: '确认切换到「' + name + '」？',
        confirmText: '切换',
        cancelText: '取消',
        success: function (res) { resolve(res.confirm); }
      });
    });
    if (!confirm) return;

    this.setLoading('switchOrganization', true);
    wx.showLoading({ title: '正在切换组织...', mask: true });

    try {
      const result = await this.callCloud('switchOrganization', {
        organizationId: id,
        organizationName: name
      });
      if (result.status === 'success') {
        wx.showToast({ title: result.message || '切换成功', icon: 'success' });
        this.setData({ currentOrganizationId: id, currentOrganizationName: name });
        await this.loadOrganizations();
        this.loadActivityList();
        this.loadTemplateList();
        this.loadRuleList();
        this.loadHrProfileAdminData();
        this.loadHrList();
        this.loadAdminList();
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        await this.loadIdentityList();
      } else {
        wx.showToast({ title: result.message || '切换失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '切换组织失败', icon: 'none' });
    }
    wx.hideLoading();
    this.setLoading('switchOrganization', false);
  },

  async createAndSwitchOrganization() {
    if (!this.data.orgFormData.name) {
      wx.showToast({ title: '请填写组织名称', icon: 'none' });
      return;
    }
    const confirm = await new Promise(function (resolve) {
      wx.showModal({
        title: '新建并切换组织',
        content: '确认创建并切换到新组织「' + this.data.orgFormData.name + '」？',
        confirmText: '确认',
        cancelText: '取消',
        success: function (res) { resolve(res.confirm); }
      });
    }.bind(this));
    if (!confirm) return;

    this.setLoading('switchOrganization', true);
    wx.showLoading({ title: '正在创建并切换组织...', mask: true });

    try {
      // Step 1: Create the organization
      const saveResult = await this.callCloud('saveOrganization', { name: this.data.orgFormData.name });
      if (saveResult.status !== 'success') {
        wx.hideLoading();
        wx.showToast({ title: saveResult.message || '创建组织失败', icon: 'none' });
        this.setLoading('switchOrganization', false);
        return;
      }

      // Step 2: Switch to it
      const result = await this.callCloud('switchOrganization', {
        organizationId: saveResult.organization.id,
        organizationName: this.data.orgFormData.name
      });
      if (result.status === 'success') {
        wx.showToast({ title: result.message || '切换成功', icon: 'success' });
        this.closeOrgForm();
        this.setData({ currentOrganizationId: saveResult.organization.id, currentOrganizationName: this.data.orgFormData.name });
        await this.loadOrganizations();
        this.loadActivityList();
        this.loadTemplateList();
        this.loadRuleList();
        this.loadHrProfileAdminData();
        this.loadHrList();
        this.loadAdminList();
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        await this.loadIdentityList();
      } else {
        wx.showToast({ title: result.message || '切换失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '切换失败，请重试', icon: 'none' });
    }
    wx.hideLoading();
    this.setLoading('switchOrganization', false);
  },

  callCloud(name, data = {}) {
    return new Promise((resolve, reject) => {
      callFunction({
        name,
        data,
        success: (res) => resolve(res.result || {}),
        fail: reject
      });
    });
  },

  setRuleListState(ruleList = [], selectedRuleIds = this.data.selectedRuleIds, filters = this.data.ruleFilters) {
    const normalizedList = (ruleList || []).map((item) => buildRuleListItem(item));
    const ruleIdSet = new Set(normalizedList.map((item) => item.id).filter(Boolean));
    const safeSelectedRuleIds = (selectedRuleIds || [])
      .map((item) => String(item || '').trim())
      .filter((id, index, list) => id && ruleIdSet.has(id) && list.indexOf(id) === index);
    const filterOptions = buildRuleFilterOptions(normalizedList);
    const nextFilters = normalizeRuleFilters(filters || emptyRuleFilters(), filterOptions);
    const selectedRuleIdMap = createSelectedRuleIdMap(safeSelectedRuleIds);
    const markedRuleList = markSelectedRules(normalizedList, safeSelectedRuleIds);
    const ruleListView = markSelectedRules(filterRuleList(normalizedList, nextFilters), safeSelectedRuleIds);
    const visibleRuleAllSelected = ruleListView.length > 0
      && ruleListView.every((item) => selectedRuleIdMap[String(item.id || '')]);

    this.setData({
      ruleList: markedRuleList,
      ruleListView,
      selectedRuleIds: safeSelectedRuleIds,
      selectedRuleIdMap,
      visibleRuleAllSelected,
      ruleFilters: nextFilters,
      ruleFilterOptions: filterOptions
    });
  },

  filterAdminCandidates(keyword) {
    const text = String(keyword || '').trim().toLowerCase();
    const sourceList = this.data.hrList || [];

    if (!text) {
      return sourceList;
    }

    return sourceList.filter((item) => {
      const fields = [
        item.name,
        item.studentId,
        item.department,
        item.identity,
        item.workGroup
      ].map((value) => String(value || '').toLowerCase());

      return fields.some((value) => value.indexOf(text) !== -1);
    });
  },

  refreshAdminCandidates(keyword = this.data.adminCandidateKeyword) {
    this.setData({
      adminCandidateKeyword: keyword,
      adminCandidateList: this.filterAdminCandidates(keyword)
    });
  },

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

  async loadTemplateList() {
    this.setLoading('templates', true);
    try {
      const result = await this.callCloud('listScoreTemplates');
      this.setData({
        templateList: result.list || []
      });
    } catch (error) {
      wx.showToast({
        title: '加载评分问题失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('templates', false);
    }
  },

  async loadRuleList(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setLoading('rules', true);
    }
    try {
      if (!this.data.currentActivityId) {
        this.setRuleListState([], [], emptyRuleFilters());
        return;
      }

      const result = await this.callCloud('listRateRules', {
        activityId: this.data.currentActivityId
      });
      if (result.status && result.status !== 'success') {
        throw new Error(result.message || '加载评分人类别失败');
      }
      this.setRuleListState(result.rules || [], this.data.selectedRuleIds, this.data.ruleFilters);
    } catch (error) {
      if (!silent) {
        wx.showToast({
          title: '加载评分人类别失败',
          icon: 'none'
        });
      }
    } finally {
      if (!silent) {
        this.setLoading('rules', false);
      }
    }
  },

  wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },

  async reloadRuleListWithRetry(expectedMinimum = 0) {
    const retryDelays = [0, 200, 500];
    for (let i = 0; i < retryDelays.length; i += 1) {
      if (retryDelays[i] > 0) {
        await this.wait(retryDelays[i]);
      }

      await this.loadRuleList();
      if ((this.data.ruleList || []).length >= expectedMinimum) {
        return;
      }
    }
  },

  upsertRuleListItem(rule) {
    const item = buildRuleListItem(rule);
    if (!item.id && (!item.scorerDepartment || !item.scorerIdentity)) {
      return;
    }

    const selectedRuleIds = this.data.selectedRuleIds || [];
    const nextList = [...(this.data.ruleList || [])];
    const index = nextList.findIndex((current) => (
      (item.id && String(current.id || '') === item.id)
      || (
        String(current.scorerDepartment || '') === item.scorerDepartment
        && String(current.scorerIdentity || '') === item.scorerIdentity
      )
    ));
    if (index >= 0) {
      nextList[index] = {
        ...nextList[index],
        ...item
      };
    } else {
      nextList.push(item);
    }

    nextList.sort((a, b) => {
      if (a.scorerDepartment !== b.scorerDepartment) {
        return String(a.scorerDepartment || '').localeCompare(String(b.scorerDepartment || ''), 'zh-CN');
      }
      return String(a.scorerIdentity || '').localeCompare(String(b.scorerIdentity || ''), 'zh-CN');
    });

    this.setRuleListState(nextList, selectedRuleIds, this.data.ruleFilters);
  },

  async reloadRuleListAfterSave(savedRule) {
    this.upsertRuleListItem(savedRule);
    const expectedId = String((savedRule && savedRule.id) || '').trim();
    const expectedDepartment = String((savedRule && savedRule.scorerDepartment) || '').trim();
    const expectedIdentity = String((savedRule && savedRule.scorerIdentity) || '').trim();
    const retryDelays = [120, 300, 600];
    for (let i = 0; i < retryDelays.length; i += 1) {
      await this.wait(retryDelays[i]);
      await this.loadRuleList({ silent: true });
      const matched = (this.data.ruleList || []).find((item) => (
        (expectedId && String(item.id || '') === expectedId)
        || (
          String(item.scorerDepartment || '') === expectedDepartment
          && String(item.scorerIdentity || '') === expectedIdentity
        )
      ));
      if (matched && (matched.clauses || []).length) {
        return;
      }
    }
    this.upsertRuleListItem(savedRule);
  },

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

  async loadAdminList() {
    this.setLoading('admins', true);
    try {
      const result = await this.callCloud('listAdmins');
      this.setData({
        adminList: result.list || [],
        canManageAdmins: !!result.canManage
      });
    } catch (error) {
      wx.showToast({
        title: '加载管理员失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('admins', false);
    }
  },

  async loadDepartmentList() {
    this.setLoading('departments', true);
    try {
      const result = await this.callCloud('listDepartments');
      if (result.status !== 'success') {
        throw new Error(result.message || '加载部门列表失败');
      }
      this.setData({
        departmentList: result.departments || []
      });
    } catch (error) {
      console.error('加载部门列表失败:', error);
      // 不再显示错误提示，因为空数据库是正常情况
      this.setData({
        departmentList: []
      });
    } finally {
      this.setLoading('departments', false);
    }
  },

  async loadWorkGroupList() {
    this.setLoading('workGroups', true);
    try {
      const result = await this.callCloud('listWorkGroups');
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
      console.error('加载工作分工列表失败:', error);
      // 不再显示错误提示，因为空数据库是正常情况
      this.setData({
        workGroupList: []
      });
    } finally {
      this.setLoading('workGroups', false);
    }
  },

  async loadIdentityList() {
    this.setLoading('identities', true);
    try {
      const result = await this.callCloud('listIdentities');
      if (result.status !== 'success') {
        throw new Error(result.message || '加载身份类别列表失败');
      }
      this.setData({
        identityList: result.identities || []
      });
    } catch (error) {
      console.error('加载身份类别列表失败:', error);
      // 不再显示错误提示，因为空数据库是正常情况
      this.setData({
        identityList: []
      });
    } finally {
      this.setLoading('identities', false);
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

  onIdentityFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    const rawValue = e.detail.value;
    const value = field === 'description' ? rawValue : rawValue.trim();
    this.setData({
      identityForm: {
        ...this.data.identityForm,
        [field]: value
      }
    });
  },

  startCreateIdentity() {
    this.setData({
      identityForm: emptyIdentityForm(),
      activeTab: 'identities'
    });
  },

  editIdentity(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.identityList[index];
    if (!item) {
      return;
    }

    this.setData({
      identityForm: {
        id: item.id,
        name: item.name,
        description: item.description || ''
      },
      activeTab: 'identities'
    });
  },

  async saveIdentity() {
    const form = this.data.identityForm;
    if (!form.name) {
      wx.showToast({
        title: '请填写身份类别名称',
        icon: 'none'
      });
      return;
    }

    this.setLoading('saveIdentity', true);
    try {
      const result = await this.callCloud('saveIdentity', {
        id: form.id,
        name: form.name,
        description: form.description
      });

      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '保存身份类别失败',
          icon: 'none'
        });
        return;
      }

      this.setData({ identityForm: emptyIdentityForm() });
      await this.loadIdentityList();
      wx.showToast({
        title: '身份类别信息已保存',
        icon: 'success'
      });
    } catch (error) {
      wx.showToast({
        title: '保存身份类别失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('saveIdentity', false);
    }
  },

  async deleteIdentity(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '删除身份类别',
        content: '确认删除这个身份类别吗？',
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
      const result = await this.callCloud('deleteIdentity', { id });
      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '删除身份类别失败',
          icon: 'none'
        });
        return;
      }

      await this.loadIdentityList();
      this.updateHrFormOptions();
      wx.showToast({
        title: '身份类别已删除',
        icon: 'success'
      });
    } catch (error) {
      wx.showToast({
        title: '删除身份类别失败',
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
  reloadScoreResults() {
    this.resetCurrentResultRows();
    this.loadScoreResults({ nocache: true });
  },
  
  async loadScoreResults(options) {
    options = options || {};
    const viewMode = this.data.resultFilters.viewMode || 'overview';
    const loadToken = Date.now();
    this.resultLoadToken = loadToken;

    if (!this.data.currentActivityId) {
      this.setLoading('results', false);
      return;
    }

    this.setLoading('results', true);

    const mergedRows = {
      overviewRows: [],
      calculationRows: [],
      detailRows: [],
      recordRows: [],
      scorerCompletionRows: []
    };

    let offset = 0;
    let hasMore = true;
    let latestResult = null;
    let requestCount = 0;
    const maxRequests = 100;

    try {
      if (viewMode === 'overview') {
        // Load ALL overview rows at once (like user-side "结果公示") — server caches computed result
        const result = await this.callCloud('getScoreResults', {
          activityId: this.data.currentActivityId,
          timezone: this.data.systemConfig.timezone,
          dataType: viewMode,
          nocache: options.nocache === true,
          filters: {
            department: this.data.resultFilters.department,
            identity: this.data.resultFilters.identity,
            workGroup: this.data.resultFilters.workGroup
          }
        });

        if (this.resultLoadToken !== loadToken) return;

        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '加载评分结果失败', icon: 'none' });
          this.setLoading('results', false);
          return;
        }

        const overviewRows = result.overviewRows || [];
        this.setData({
          'scoreResultsRaw.stats': result.stats || {},
          'scoreResultsRaw.overviewRows': overviewRows,
          resultFilterOptions: {
            departments: buildResultFilterOptions((this.data.departmentList || []).map(function (item) { return item.name; })),
            identities: buildResultFilterOptions((this.data.identityList || []).map(function (item) { return item.name; })),
            workGroups: this.buildWorkGroupFilterOptions()
          }
        });
        this.applyScoreResultFilters();
        this.setLoading('results', false);
        return;
      }

      if (viewMode === 'completion') {
        const result = await this.callCloud('getScoreResults', {
          activityId: this.data.currentActivityId,
          timezone: this.data.systemConfig.timezone,
          dataType: viewMode,
          filters: {
            department: this.data.resultFilters.department,
            identity: this.data.resultFilters.identity,
            workGroup: this.data.resultFilters.workGroup
          }
        });

        if (this.resultLoadToken !== loadToken) {
          return;
        }

        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '加载评分结果失败',
            icon: 'none'
          });
          return;
        }

        this.setData({
          'scoreResultsRaw.stats': result.stats || {},
          'scoreResultsRaw.completionBoards': result.completionBoards || { departments: [] },
          'scoreResultsRaw.scorerCompletionRows': [],
          resultFilterOptions: {
            departments: buildResultFilterOptions((this.data.departmentList || []).map((item) => item.name)),
            identities: buildResultFilterOptions((this.data.identityList || []).map((item) => item.name)),
            workGroups: this.buildWorkGroupFilterOptions()
          }
        });
        this.applyScoreResultFilters();
        return;
      }

      while (hasMore && requestCount < maxRequests) {
        const result = await this.callCloud('getScoreResults', {
          activityId: this.data.currentActivityId,
          timezone: this.data.systemConfig.timezone,
          dataType: viewMode,
          offset,
          filters: {
            department: this.data.resultFilters.department,
            identity: this.data.resultFilters.identity,
            workGroup: this.data.resultFilters.workGroup
          }
        });

        if (this.resultLoadToken !== loadToken) {
          return;
        }

        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '加载评分结果失败',
            icon: 'none'
          });
          return;
        }

        latestResult = result;

        const batchMap = {
          overview: result.overviewRows || [],
          calculation: result.calculationRows || [],
          detail: result.detailRows || [],
          records: result.recordRows || [],
          completion: result.scorerCompletionRows || []
        };

        const batchRows = batchMap[viewMode] || [];

        if (viewMode === 'overview') {
          mergedRows.overviewRows.push(...batchRows);
        } else if (viewMode === 'calculation') {
          mergedRows.calculationRows.push(...batchRows);
        } else if (viewMode === 'detail') {
          mergedRows.detailRows.push(...batchRows);
        } else if (viewMode === 'records') {
          mergedRows.recordRows.push(...batchRows);
        } else if (viewMode === 'completion') {
          mergedRows.scorerCompletionRows.push(...batchRows);
        }
  
        const setDataObj = {
          'scoreResultsRaw.stats': result.stats || {},
          resultFilterOptions: {
            departments: buildResultFilterOptions((this.data.departmentList || []).map(function (item) { return item.name; })),
            identities: buildResultFilterOptions((this.data.identityList || []).map(function (item) { return item.name; })),
            workGroups: this.buildWorkGroupFilterOptions()
          }
        };
        
        if (viewMode === 'overview') {
          setDataObj['scoreResultsRaw.overviewRows'] = mergedRows.overviewRows;
        }
        
        if (viewMode === 'calculation') {
          setDataObj['scoreResultsRaw.calculationRows'] = mergedRows.calculationRows;
        }
        
        if (viewMode === 'detail') {
          setDataObj['scoreResultsRaw.detailRows'] = mergedRows.detailRows;
        }
        
        if (viewMode === 'records') {
          setDataObj['scoreResultsRaw.recordRows'] = mergedRows.recordRows;
        }
        
        if (viewMode === 'completion') {
          setDataObj['scoreResultsRaw.scorerCompletionRows'] = mergedRows.scorerCompletionRows;
          setDataObj['scoreResultsRaw.completionBoards'] = result.completionBoards || {
            departments: []
          };
        }
        
        this.setData(setDataObj);
  
        this.applyScoreResultFilters();
  
        hasMore = !!(result.pagination && result.pagination.hasMore);
        const nextOffset = result.pagination ? Number(result.pagination.nextOffset || 0) : 0;

        if (!batchRows.length || nextOffset <= offset) {
          hasMore = false;
        } else {
          offset = nextOffset;
        }
  
        requestCount += 1;
      }
  
      this.setData({
        resultPagination: {
          ...this.data.resultPagination,
          [viewMode]: {
            page: 1,
            pageSize: latestResult && latestResult.pagination ? latestResult.pagination.returnedCount || 0 : 0,
            hasMore: false,
            total: latestResult && latestResult.pagination ? latestResult.pagination.total || 0 : 0
          }
        }
      });
    } catch (error) {
      console.error('加载评分结果失败：', error);
      wx.showToast({
        title: getErrorText(error, '加载评分结果失败'),
        icon: 'none'
      });
    } finally {
      if (this.resultLoadToken === loadToken) {
        this.setLoading('results', false);
      }
    }
  },
  
  loadMoreScoreResults() {
    // Overview results are now loaded all at once — scrolling is instant, no pagination needed
  },

  async openTargetScoreRecords(e) {
    const targetId = String(e.currentTarget.dataset.targetId || '').trim();
    const target = (this.data.scoreResultsView.overviewRows || []).find((item) => String(item.targetId || item.id) === targetId);
    if (!target || !this.data.currentActivityId) {
      return;
    }

    await this.loadTargetScoreRecords(targetId, target);
  },

  async loadTargetScoreRecords(targetId, target, options = {}) {
    const requestToken = `${targetId}_${Date.now()}`;
    this.targetRecordLoadToken = requestToken;
    const revokedRecordId = String(options.revokedRecordId || '').trim();
    const keepRows = options.keepRows === true;

    const loadingData = {
      selectedResultTarget: target,
      targetRecordLoading: true
    };
    if (!keepRows) {
      loadingData.targetRecordRows = [];
    }
    this.setData(loadingData);

    try {
      const result = await this.callCloud('getScoreResults', {
        activityId: this.data.currentActivityId,
        timezone: this.data.systemConfig.timezone,
        dataType: 'targetRecords',
        targetId
      });

      const currentTargetId = String((this.data.selectedResultTarget && (this.data.selectedResultTarget.targetId || this.data.selectedResultTarget.id)) || '');
      if (this.targetRecordLoadToken !== requestToken || currentTargetId !== targetId) {
        return;
      }

      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '加载评分记录失败',
          icon: 'none'
        });
        return;
      }

      const targetRows = (result.targetRecordRows || []).map((item) => {
        const forcePending = revokedRecordId && String(item.recordId || '') === revokedRecordId;
        const normalizedItem = forcePending ? {
          ...item,
          recordId: '',
          status: 'pending',
          statusText: '未完成',
          submittedAt: '',
          excludedByRequireAll: false
        } : item;
        const recordStatus = normalizedItem.status === 'inactive' || normalizedItem.excludedByRequireAll
          ? 'inactive'
          : normalizedItem.status;
        return {
          ...normalizedItem,
          status: recordStatus,
          canViewDetail: (recordStatus === 'completed' || recordStatus === 'inactive') && !!normalizedItem.recordId,
          departmentText: normalizedItem.scorerDepartment || '未设置部门',
          identityText: normalizedItem.scorerIdentity || '未设置身份',
          workGroupText: normalizedItem.scorerWorkGroup || normalizedItem.workGroup || '',
          statusClass: recordStatus === 'completed'
            ? 'status-completed'
            : (recordStatus === 'inactive' ? 'status-inactive' : 'status-pending'),
          scoreTagClass: recordStatus === 'completed'
            ? 'score-tag-completed'
            : (recordStatus === 'inactive' ? 'score-tag-inactive' : 'score-tag-pending')
        };
      });

      this.setData({
        targetRecordRows: targetRows
      });
    } catch (error) {
      if (this.targetRecordLoadToken !== requestToken) {
        return;
      }
      wx.showToast({
        title: '加载评分记录失败',
        icon: 'none'
      });
    } finally {
      if (this.targetRecordLoadToken === requestToken) {
        this.setData({
          targetRecordLoading: false
        });
      }
    }
  },

  closeTargetScoreRecords() {
    this.targetRecordLoadToken = '';
    this.setData({
      selectedResultTarget: null,
      targetRecordRows: []
    });
  },

  async openScoreRecordDetail(e) {
    const recordId = String(e.currentTarget.dataset.recordId || '').trim();
    if (!recordId || !this.data.currentActivityId) {
      return;
    }

    this.setData({
      recordDetailPopupVisible: true,
      recordDetail: null
    });
    this.setLoading(`recordDetail_${recordId}`, true);
    try {
      const result = await this.callCloud('getScoreResults', {
        activityId: this.data.currentActivityId,
        timezone: this.data.systemConfig.timezone,
        dataType: 'recordDetail',
        recordId
      });

      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '加载评分详情失败',
          icon: 'none'
        });
        this.setData({ recordDetailPopupVisible: false });
        return;
      }

      const recordDetail = result.recordDetail ? {
        ...result.recordDetail,
        templates: (result.recordDetail.templates || []).map((template) => ({
          ...template,
          questions: (template.questions || []).map((question) => ({
            ...question,
            expandKey: `${template.templateId}_${question.questionIndex}`,
            hasScoreLabel: !!question.scoreLabel,
            scoreLabelExpanded: false
          }))
        }))
      } : null;

      this.setData({
        recordDetail,
        expandedScoreLabelMap: {}
      });
    } catch (error) {
      this.setData({ recordDetailPopupVisible: false });
      wx.showToast({
        title: '加载评分详情失败',
        icon: 'none'
      });
    } finally {
      this.setLoading(`recordDetail_${recordId}`, false);
    }
  },

  closeScoreRecordDetail() {
    this.setData({
      recordDetailPopupVisible: false,
      recordDetail: null,
      expandedScoreLabelMap: {}
    });
  },

  toggleScoreLabel(e) {
    const templateIndex = Number(e.currentTarget.dataset.templateIndex);
    const questionIndex = Number(e.currentTarget.dataset.questionIndex);
    const recordDetail = this.data.recordDetail;
    if (!recordDetail || !recordDetail.templates || !recordDetail.templates[templateIndex]) {
      return;
    }

    const templates = recordDetail.templates.map((template, currentTemplateIndex) => {
      if (currentTemplateIndex !== templateIndex) {
        return template;
      }
      return {
        ...template,
        questions: (template.questions || []).map((question, currentQuestionIndex) => {
          if (currentQuestionIndex !== questionIndex) {
            return question;
          }
          return {
            ...question,
            scoreLabelExpanded: !question.scoreLabelExpanded
          };
        })
      };
    });

    this.setData({
      recordDetail: {
        ...recordDetail,
        templates
      }
    });
  },
  
  resetCurrentResultRows() {
    const viewMode = this.data.resultFilters.viewMode || 'overview';
  
    const nextRaw = {
      ...this.data.scoreResultsRaw
    };
  
    if (viewMode === 'overview') {
      nextRaw.overviewRows = [];
    } else if (viewMode === 'calculation') {
      nextRaw.calculationRows = [];
    } else if (viewMode === 'detail') {
      nextRaw.detailRows = [];
    } else if (viewMode === 'records') {
      nextRaw.recordRows = [];
    } else if (viewMode === 'completion') {
      nextRaw.scorerCompletionRows = [];
      nextRaw.completionBoards = {
        departments: [],
        identities: [],
        workGroups: []
      };
    }
  
    this.setData({
      scoreResultsRaw: nextRaw,
      selectedResultTarget: null,
      targetRecordRows: [],
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
      resultPagination: {
        ...this.data.resultPagination,
        [viewMode]: {
          page: 0,
          pageSize: 0,
          hasMore: true,
          total: 0
        }
      }
    });
  },
  buildWorkGroupFilterOptions(department) {
    var dept = department;
    if (dept === undefined) {
      dept = this.data.resultFilters.department;
    }
    var workGroupList = this.data.workGroupList || [];
    if (!dept || dept === '全部') {
      return ['请先选择所属部门'];
    }
    var deptId = '';
    var deptList = this.data.departmentList || [];
    for (var i = 0; i < deptList.length; i++) {
      if (deptList[i].name === dept) {
        deptId = deptList[i].id || deptList[i]._id || '';
        break;
      }
    }
    var filtered = workGroupList
      .filter(function (item) {
        return item.departmentId === deptId || item.departmentName === dept;
      })
      .map(function (item) { return item.name; });
    return ['全部'].concat(filtered);
  },

  applyScoreResultFilters() {
    const filters = this.data.resultFilters || emptyResultFilters();
    const isAllValue = (value) => !value
      || value === '全部'
      || value === '全部部门'
      || value === '全部身份'
      || value === '全部工作分工'
      || value === '全部工作分工（职能组）'
      || value === '全部状态';
    const matches = (row) => {
      if (!isAllValue(filters.department) && row.department !== filters.department) {
        return false;
      }
      if (!isAllValue(filters.identity) && row.identity !== filters.identity) {
        return false;
      }
      if (!isAllValue(filters.workGroup) && (row.workGroup || '') !== filters.workGroup) {
        return false;
      }
      return true;
    };

    const sortRows = (rows, scoreField = 'finalScore') => {
      const nextRows = [...rows];
      const sortMode = filters.sortMode;
      nextRows.sort((a, b) => {
        if (sortMode === 'name_asc') {
          return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
        }
        if (sortMode === 'department_asc') {
          const depCompare = String(a.department || '').localeCompare(String(b.department || ''), 'zh-CN');
          return depCompare || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
        }
        if (sortMode === 'workGroup_asc') {
          const groupCompare = String(a.workGroup || '').localeCompare(String(b.workGroup || ''), 'zh-CN');
          return groupCompare || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
        }
        return Number(b[scoreField] || 0) - Number(a[scoreField] || 0);
      });
      return nextRows;
    };

    const overviewRows = sortRows((this.data.scoreResultsRaw.overviewRows || []).filter(matches), 'finalScore').map((row) => {
      const expected = Math.max(0, Math.floor(toNumber(row.expectedScorerCount, 0)));
      const submitted = Math.max(0, Math.floor(toNumber(row.submittedScorerCount, 0)));
      const safeSubmitted = expected ? Math.min(expected, submitted) : submitted;
      const rate = expected ? (safeSubmitted / expected) * 100 : 100;
      const percent = clampNumber(rate, 0, 100);
      return {
        ...row,
        finalScoreDisplay: formatScoreFixed3(row.finalScore),
        progressText: `${safeSubmitted}/${expected}`,
        progressPercentText: `${Math.round(percent)}%`,
        progressFillStyle: buildProgressFillStyle(percent)
      };
    });
    const calculationRows = sortRows((this.data.scoreResultsRaw.calculationRows || []).filter(matches), 'contributionScore');
    const detailRows = sortRows((this.data.scoreResultsRaw.detailRows || []).filter(matches), 'weightedScore');
    const recordRows = sortRows((this.data.scoreResultsRaw.recordRows || []).filter(matches), 'submittedAt');
    const backendBoards = (this.data.scoreResultsRaw.completionBoards || {}).departments || [];
    const completionBoards = backendBoards.map((item) => {
      const percent = item.memberCount
        ? clampNumber((item.completedCount / item.memberCount) * 100, 0, 100)
        : 100;
      return {
        ...item,
        completionRate: Number(percent.toFixed(2)),
        completionText: `${item.completedCount}/${item.memberCount}`,
        progressPercentText: `${Math.round(percent)}%`,
        progressFillStyle: buildProgressFillStyle(percent),
        scorerRows: undefined
      };
    }).sort((a, b) => {
      const rateDiff = Number(b.completionRate || 0) - Number(a.completionRate || 0);
      if (rateDiff !== 0) return rateDiff;
      return String(a.groupName || '').localeCompare(String(b.groupName || ''), 'zh-CN');
    });

    this.setData({
      scoreResultsView: {
        overviewRows,
        calculationRows,
        detailRows,
        recordRows,
        scorerCompletionRows: [],
        completionBoards: {
          departments: completionBoards
        }
      }
    });
  },

  async toggleDepartmentScorers(e) {
    const { groupName } = e.currentTarget.dataset;
    if (!groupName || !this.data.currentActivityId) return;

    if (this.data.selectedCompletionDepartment === groupName) {
      this.closeDepartmentScorers();
      return;
    }

    const loadToken = Date.now();
    this.departmentScorerToken = loadToken;

    this.setData({
      selectedCompletionDepartment: groupName,
      departmentScorerLoading: true,
      departmentScorerRows: []
    });

    try {
      const result = await this.callCloud('getScoreResults', {
        activityId: this.data.currentActivityId,
        timezone: this.data.systemConfig.timezone,
        dataType: 'completion',
        departmentName: groupName,
        filters: {
          department: this.data.resultFilters.department,
          identity: this.data.resultFilters.identity,
          workGroup: this.data.resultFilters.workGroup
        }
      });

      if (this.departmentScorerToken !== loadToken) return;

      if (result.status !== 'success') {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ departmentScorerLoading: false });
        return;
      }

      const rows = (result.scorerCompletionRows || []).map((item) => {
        const expectedCount = Math.max(0, Math.floor(toNumber(item.expectedCount, 0)));
        const submittedCount = Math.max(0, Math.floor(toNumber(item.submittedCount, 0)));
        const pendingCount = Math.max(expectedCount - submittedCount, 0);
        return {
          ...item,
          expectedCount,
          submittedCount,
          pendingCount,
          detailText: [item.identity, item.workGroup].filter(Boolean).join(' / ') || '未设置',
          completionText: `${submittedCount}/${expectedCount}`,
          progressPercentText: `${expectedCount ? Math.round((submittedCount / expectedCount) * 100) : 100}%`,
          progressFillStyle: buildProgressFillStyle(expectedCount ? (submittedCount / expectedCount) * 100 : 100),
          statusText: pendingCount > 0 ? '未完成' : '已完成',
          statusClass: pendingCount > 0 ? 'status-pending' : 'status-completed'
        };
      });

      this.setData({
        departmentScorerRows: rows,
        departmentScorerLoading: false
      });
    } catch (error) {
      if (this.departmentScorerToken !== loadToken) return;
      wx.showToast({ title: '加载评分人列表失败', icon: 'none' });
      this.setData({ departmentScorerLoading: false });
    }
  },

  closeDepartmentScorers() {
    this.departmentScorerToken = '';
    this.setData({
      selectedCompletionDepartment: '',
      departmentScorerLoading: false,
      departmentScorerRows: []
    });
  },

  async openScorerTargetPopup(e) {
    const { scorerKey } = e.currentTarget.dataset;
    if (!scorerKey || !this.data.currentActivityId) return;

    const popupToken = Date.now();
    this.scorerTargetPopupToken = popupToken;

    const scorerRow = (this.data.departmentScorerRows || []).find((item) => item.scorerKey === scorerKey);
    const scorerName = scorerRow ? scorerRow.scorerName : scorerKey;

    this.setData({
      scorerTargetPopupVisible: true,
      scorerTargetPopupTitle: `${scorerName} 的被评分人完成情况`,
      scorerTargetPopupLoading: true,
      scorerTargetPopupRows: []
    });

    try {
      const result = await this.callCloud('getScoreResults', {
        activityId: this.data.currentActivityId,
        timezone: this.data.systemConfig.timezone,
        dataType: 'scorerTargets',
        scorerKey
      });

      if (this.scorerTargetPopupToken !== popupToken) return;

      if (result.status !== 'success') {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ scorerTargetPopupLoading: false });
        return;
      }

      const rows = (result.scorerTargetRows || []).map((item) => ({
        ...item,
        detailText: [item.targetDepartment, item.targetIdentity, item.targetWorkGroup].filter(Boolean).join(' / ') || '未设置'
      }));

      this.setData({
        scorerTargetPopupRows: rows,
        scorerTargetPopupLoading: false
      });
    } catch (error) {
      if (this.scorerTargetPopupToken !== popupToken) return;
      wx.showToast({ title: '加载被评分人列表失败', icon: 'none' });
      this.setData({ scorerTargetPopupLoading: false });
    }
  },

  closeScorerTargetPopup() {
    this.scorerTargetPopupToken = '';
    this.setData({
      scorerTargetPopupVisible: false,
      scorerTargetPopupTitle: '',
      scorerTargetPopupLoading: false,
      scorerTargetPopupRows: []
    });
  },

  openScorerTargetRecordDetail(e) {
    const recordId = String(e.currentTarget.dataset.recordId || '').trim();
    if (!recordId) return;
    this.openScoreRecordDetail(e);
  },

  noop() {},

  onResultFilterChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    const optionsMap = {
      department: this.data.resultFilterOptions.departments,
      identity: this.data.resultFilterOptions.identities,
      workGroup: this.data.resultFilterOptions.workGroups,
      viewMode: (this.data.resultViewOptions || []).map((item) => item.label),
      sortMode: (this.data.resultSortOptions || []).map((item) => item.label)
    };
    const rawOptions = optionsMap[field] || [];
    const pickedLabel = rawOptions[Number(value)] || '全部';

    if (field === 'workGroup' && pickedLabel === '请先选择所属部门') {
      return;
    }

    let nextValue = pickedLabel;
    if (field === 'viewMode') {
      nextValue = (this.data.resultViewOptions[Number(value)] || {}).value || 'overview';
      this.setData({
        resultViewLabel: (this.data.resultViewOptions[Number(value)] || {}).label || '明细查看'
      });
    }
    if (field === 'sortMode') {
      nextValue = (this.data.resultSortOptions[Number(value)] || {}).value || 'score_desc';
      this.setData({
        resultSortLabel: (this.data.resultSortOptions[Number(value)] || {}).label || '按分数从高到低'
      });
    }

    const nextFilters = {
      ...this.data.resultFilters,
      [field]: nextValue
    };

    if (field === 'department') {
      nextFilters.workGroup = '全部';
    }

    this.setData({
      resultFilters: nextFilters,
      'resultFilterOptions.workGroups': this.buildWorkGroupFilterOptions(nextFilters.department)
    });
    this.resetCurrentResultRows();
    this.loadScoreResults({ append: false });
  },

  exportScoreResultsUnified(e) {
    const report = e.currentTarget.dataset.report;
    if (!this.data.currentActivityId) {
      wx.showToast({ title: '请先设置当前评分活动', icon: 'none' });
      return;
    }

    const _this = this;
    wx.showActionSheet({
      itemList: ['CSV 格式 (.csv)', 'Excel 格式 (.xlsx)'],
      success: function (res) {
        const format = res.tapIndex === 0 ? 'csv' : 'excel';
        _this._doExportScoreResults(report, format);
      }
    });
  },

  async _doExportScoreResults(report, format) {
    this.setLoading('export_' + report, true);
    try {
      const result = await this.callCloud('exportScoreResults', {
        activityId: this.data.currentActivityId,
        timezone: this.data.systemConfig.timezone,
        reportType: report,
        format: format,
        filters: {
          department: this.data.resultFilters.department,
          identity: this.data.resultFilters.identity,
          workGroup: this.data.resultFilters.workGroup
        }
      });

      if (result.status !== 'success' || !result.fileContent || !result.fileName) {
        wx.showToast({ title: result.message || '导出失败', icon: 'none' });
        return;
      }

      saveAndShareFile(result.fileContent, result.fileName, result.extension || 'csv');
    } catch (error) {
      wx.showToast({ title: '导出失败', icon: 'none' });
    } finally {
      this.setLoading('export_' + report, false);
    }
  },

  async revokeScoreRecord(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '撤销评分记录',
        content: '撤销后该条评分记录会被删除，成员将恢复为待评分状态，是否继续？',
        confirmText: '确认撤销',
        cancelText: '取消',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirm) {
      return;
    }

    this.setLoading(`revoke_${id}`, true);
    try {
      const result = await this.callCloud('revokeScoreRecord', {
        recordId: id
      });
      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '撤销评分记录失败',
          icon: 'none'
        });
        return;
      }
      wx.showToast({
        title: '评分记录已撤销',
        icon: 'success'
      });
      const selectedTarget = this.data.selectedResultTarget;
      const revokedRow = (this.data.targetRecordRows || []).find((item) => String(item.recordId || '') === String(id));
      this.setData({
        recordDetailPopupVisible: false,
        recordDetail: null,
        expandedScoreLabelMap: {},
        targetRecordRows: (this.data.targetRecordRows || []).map((item) => {
          if (String(item.recordId || '') !== String(id)) {
            return item;
          }
          return {
            ...item,
            recordId: '',
            status: 'pending',
            statusText: '未完成',
            submittedAt: '',
            excludedByRequireAll: false,
            canViewDetail: false,
            statusClass: 'status-pending',
            scoreTagClass: 'score-tag-pending'
          };
        })
      });
      await this.loadScoreResults();
      if (selectedTarget && (selectedTarget.targetId || selectedTarget.id)) {
        const targetId = String(selectedTarget.targetId || selectedTarget.id);
        const latestTarget = (this.data.scoreResultsView.overviewRows || [])
          .find((item) => String(item.targetId || item.id) === targetId) || selectedTarget;
        await this.loadTargetScoreRecords(targetId, latestTarget, {
          revokedRecordId: id,
          revokedScorerKey: revokedRow && revokedRow.scorerKey,
          keepRows: true
        });
      }
    } catch (error) {
      wx.showToast({
        title: '撤销评分记录失败',
        icon: 'none'
      });
    } finally {
      this.setLoading(`revoke_${id}`, false);
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
  },

  onTemplateFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    const rawValue = e.detail.value;
    const value = field === 'description' ? rawValue : rawValue.trim();
    this.setData({
      templateForm: {
        ...this.data.templateForm,
        [field]: value
      }
    });
  },

  onTemplateQuestionInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const questionIndex = Number(index);
    const questions = this.data.templateForm.questions;
    if (!questions[questionIndex]) {
      return;
    }

    const rawValue = e.detail.value;
    const value = field === 'scoreLabel' ? rawValue : rawValue.trim();

    // Write to a separate data object to avoid re-rendering the wx:for list,
    // which would destroy the input element and dismiss the keyboard.
    this.setData({
      [`questionInputValues.${questionIndex}.${field}`]: value
    });
  },

  onTemplateQuestionBlur(e) {
    const { index, field } = e.currentTarget.dataset;
    const questionIndex = Number(index);
    var inputValues = this.data.questionInputValues;
    if (!inputValues[questionIndex] || inputValues[questionIndex][field] === undefined) return;
    var value = inputValues[questionIndex][field];
    // Sync the cached value back to the real question data on blur
    this.setData({
      [`templateForm.questions[${questionIndex}].${field}`]: value
    });
  },

  addTemplateQuestion() {
    var questions = [...this.data.templateForm.questions, createEmptyQuestion()];
    var newIndex = questions.length - 1;
    this.setData({
      templateForm: { ...this.data.templateForm, questions: questions },
      expandedQuestionIndex: newIndex,
      questionFocusIndex: newIndex,
      templateQuestionScrollInto: 'question-' + newIndex,
      questionValidationErrors: {}
    });
  },

  _flushQuestionInputs() {
    var inputCache = this.data.questionInputValues;
    if (!inputCache || !Object.keys(inputCache).length) return;
    var updates = {};
    for (var qi in inputCache) {
      for (var f in inputCache[qi]) {
        updates['templateForm.questions[' + qi + '].' + f] = inputCache[qi][f];
      }
    }
    this.setData(updates);
  },

  removeTemplateQuestion(e) {
    const index = Number(e.currentTarget.dataset.index);
    this._flushQuestionInputs();
    const questions = this.data.templateForm.questions.filter((_, questionIndex) => questionIndex !== index);
    var expandedIndex = this.data.expandedQuestionIndex;
    if (expandedIndex === index) {
      expandedIndex = -1;
    } else if (expandedIndex > index) {
      expandedIndex -= 1;
    }
    this.setData({
      templateForm: {
        ...this.data.templateForm,
        questions: questions
      },
      expandedQuestionIndex: expandedIndex,
      questionInputValues: {},
      questionValidationErrors: {}
    });
  },

  resetTemplateForm() {
    this.setData({
      templateForm: emptyTemplateForm(),
      questionInputValues: {},
      questionValidationErrors: {},
      expandedQuestionIndex: -1,
      questionFocusIndex: -1,
      templateQuestionScrollInto: '',
      draggingQuestionIndex: -1
    });
  },

  moveQuestionUp(e) {
    var index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index) || index <= 0) return;
    this._flushQuestionInputs();
    var questions = moveItem(this.data.templateForm.questions, index, index - 1);
    var expandedIndex = this.data.expandedQuestionIndex;
    if (expandedIndex === index) expandedIndex = index - 1;
    else if (expandedIndex === index - 1) expandedIndex = index;
    this.setData({
      templateForm: { ...this.data.templateForm, questions: questions },
      templateQuestionScrollInto: 'question-' + (index - 1),
      expandedQuestionIndex: expandedIndex,
      questionInputValues: {},
      questionValidationErrors: {}
    });
  },

  moveQuestionDown(e) {
    var index = Number(e.currentTarget.dataset.index);
    var questions = this.data.templateForm.questions;
    if (Number.isNaN(index) || index >= questions.length - 1) return;
    this._flushQuestionInputs();
    questions = moveItem(questions, index, index + 1);
    var expandedIndex = this.data.expandedQuestionIndex;
    if (expandedIndex === index) expandedIndex = index + 1;
    else if (expandedIndex === index + 1) expandedIndex = index;
    this.setData({
      templateForm: { ...this.data.templateForm, questions: questions },
      templateQuestionScrollInto: 'question-' + (index + 1),
      expandedQuestionIndex: expandedIndex,
      questionInputValues: {},
      questionValidationErrors: {}
    });
  },

  startQuestionDrag(e) {
    const index = Number(e.currentTarget.dataset.index);
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch || Number.isNaN(index)) return;
    var touchY = touch.clientY != null ? touch.clientY : touch.pageY;
    this._dragStartY = touchY;
    this._questionDragState = { currentIndex: index };
    this._dragLastScrollTime = 0;
    this._dragEffectiveScrollTop = this.data.templateQuestionScrollTop || 0;
    this.setData({ dragActive: true, draggingQuestionIndex: index, dragInsertIndex: index, questionValidationErrors: {} });
    var self = this;
    wx.createSelectorQuery().selectAll('.question-card').boundingClientRect(function(rects) {
      if (rects && rects.length) {
        self._questionCardRects = rects;
        var cardRect = rects[index];
        if (cardRect) {
          self._dragCardOriginalTop = cardRect.top;
          self._dragCardLeft = cardRect.left;
          self._dragCardWidth = cardRect.width;
          self._fingerOffsetInCard = touchY - cardRect.top;
          self.setData({
            dragGhostTop: cardRect.top,
            dragGhostLeft: cardRect.left,
            dragGhostWidth: cardRect.width,
            dragGhostVisible: true
          });
        }
      }
    }).exec();
    wx.createSelectorQuery().select('.large-scroll').boundingClientRect(function(rect) {
      if (rect) self._questionDragScrollRect = rect;
    }).exec();
  },

  onQuestionDragMove(e) {
    if (!this._questionDragState || this.data.draggingQuestionIndex < 0) return;
    var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;

    var touchY = touch.clientY != null ? touch.clientY : touch.pageY;
    this._dragLastY = touchY;
    var self = this;
    var now = Date.now();

    // Accumulate scroll delta every frame based on finger position relative to scroll view edges.
    // Middle zone (between middleTop and middleBottom) = no scroll at all.
    var sr = this._questionDragScrollRect;
    if (sr) {
      var viewHeight = sr.bottom - sr.top;
      var edgeSize = Math.min(70, viewHeight * 0.22);
      var middleTop = sr.top + edgeSize;
      var middleBottom = sr.bottom - edgeSize;
      var scrollDelta = 0;

      if (touchY < middleTop) {
        var distIntoEdge = middleTop - touchY;
        var factor = Math.min(distIntoEdge / edgeSize, 3);
        scrollDelta = -Math.round(5 * factor);
      } else if (touchY > middleBottom) {
        var distIntoEdge = touchY - middleBottom;
        var factor = Math.min(distIntoEdge / edgeSize, 3);
        scrollDelta = Math.round(5 * factor);
      }

      if (scrollDelta !== 0) {
        self._dragEffectiveScrollTop = Math.max(0, (self._dragEffectiveScrollTop || 0) + scrollDelta);
      }
    }

    // Throttle expensive DOM queries + setData to ~30fps.
    // Scroll delta still accumulates every frame — setData applies the latest.
    if (self._lastUpdateTime && now - self._lastUpdateTime < 33) return;
    self._lastUpdateTime = now;

    wx.createSelectorQuery().selectAll('.question-card').boundingClientRect(function(rects) {
      if (!rects || !rects.length || !self._questionDragState) return;
      self._questionCardRects = rects;

      var y = self._dragLastY;
      if (y == null) return;

      var newInsertIndex = rects.length;
      for (var i = 0; i < rects.length; i++) {
        if (y < rects[i].top + rects[i].height / 2) {
          newInsertIndex = i;
          break;
        }
      }

      var sr = self._questionDragScrollRect;
      var ghostTop;
      if (self._fingerOffsetInCard != null) {
        ghostTop = y - self._fingerOffsetInCard;
      } else if (self._dragCardOriginalTop != null && self._dragStartY != null) {
        ghostTop = self._dragCardOriginalTop + (y - self._dragStartY);
      }
      if (sr) {
        var draggedRect = rects[self._questionDragState.currentIndex];
        var ghostHeight = draggedRect ? draggedRect.height : 80;
        ghostTop = Math.max(sr.top, Math.min(sr.bottom - ghostHeight, ghostTop));
      }

      // Single batched setData for all visual updates
      var update = {};
      if (newInsertIndex !== self.data.dragInsertIndex) update.dragInsertIndex = newInsertIndex;
      if (ghostTop !== self.data.dragGhostTop) update.dragGhostTop = ghostTop;
      if (self._dragEffectiveScrollTop != null) update.templateQuestionScrollTop = self._dragEffectiveScrollTop;
      if (Object.keys(update).length) self.setData(update);
    }).exec();
  },

  endQuestionDrag() {
    var state = this._questionDragState;
    if (!state) return;
    var fromIndex = state.currentIndex;
    var insertIndex = this.data.dragInsertIndex;
    // Adjust: if inserting after dragged item, account for its removal
    var toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
    if (toIndex !== fromIndex && toIndex >= 0 && toIndex < this.data.templateForm.questions.length) {
      var questions = moveItem(this.data.templateForm.questions, fromIndex, toIndex);
      var expandedIndex = this.data.expandedQuestionIndex;
      if (expandedIndex === fromIndex) {
        expandedIndex = toIndex;
      } else if (fromIndex < toIndex) {
        if (expandedIndex > fromIndex && expandedIndex <= toIndex) expandedIndex -= 1;
      } else {
        if (expandedIndex >= toIndex && expandedIndex < fromIndex) expandedIndex += 1;
      }
      this.setData({
        templateForm: { ...this.data.templateForm, questions: questions },
        expandedQuestionIndex: expandedIndex
      });
    }
    this._questionDragState = null;
    this._questionCardRects = null;
    this._questionDragScrollRect = null;
    this._dragLastY = null;
    this._dragCardOriginalTop = null;
    this._dragStartY = null;
    this._dragCardLeft = null;
    this._dragCardWidth = null;
    this._dragLastScrollTime = 0;
    this._dragEffectiveScrollTop = null;
    this._fingerOffsetInCard = null;
    this._lastUpdateTime = null;
    this.setData({ dragActive: false, draggingQuestionIndex: -1, dragInsertIndex: -1, dragGhostVisible: false, questionInputValues: {} });
  },

  onQuestionDragCancel() {
    this.endQuestionDrag();
  },

  toggleQuestionExpand(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;
    var isExpanded = this.data.expandedQuestionIndex === index;
    var updates = {
      expandedQuestionIndex: isExpanded ? -1 : index,
      questionFocusIndex: -1
    };
    // When collapsing, flush any pending input values to the question data
    if (isExpanded) {
      var inputCache = this.data.questionInputValues;
      if (inputCache[index]) {
        for (var f in inputCache[index]) {
          updates['templateForm.questions[' + index + '].' + f] = inputCache[index][f];
        }
      }
    }
    this.setData(updates);
  },

  onQuestionContentFocus() {
    if (this.data.questionFocusIndex >= 0) {
      this.setData({ questionFocusIndex: -1 });
    }
  },

  startCreateTemplate() {
    this.resetTemplateForm();
    this.setData({ activeTab: 'templates' });
  },

  async saveTemplate() {
    // Flush any pending question input values before saving
    this._flushQuestionInputs();

    var form = this.data.templateForm || emptyTemplateForm();
    var name = String(form.name || '').trim();
    var description = String(form.description || '');

    if (!name) {
      wx.showToast({ title: '请填写评分问题名称', icon: 'none' });
      return;
    }

    // Validate each question
    var validationErrors = {};
    var firstInvalidIndex = -1;
    var rawQuestions = form.questions || [];
    var questions = [];
    for (var qi = 0; qi < rawQuestions.length; qi++) {
      var question = rawQuestions[qi];
      var q = {
        question: String(question.question || '').trim(),
        scoreLabel: String(question.scoreLabel || ''),
        minValue: String(question.minValue == null ? '0' : question.minValue).trim(),
        startValue: String(question.startValue == null || question.startValue === '' ? '0' : question.startValue).trim(),
        maxValue: String(question.maxValue == null ? '' : question.maxValue).trim(),
        stepValue: String(question.stepValue == null || question.stepValue === '' ? '0.5' : question.stepValue).trim()
      };

      if (!q.question) {
        validationErrors[qi] = { field: 'question', msg: '问题内容不能为空' };
        if (firstInvalidIndex === -1) firstInvalidIndex = qi;
      }
      var min = parseFloat(q.minValue);
      var max = parseFloat(q.maxValue);
      var step = parseFloat(q.stepValue);
      if (isNaN(max) || max <= 0) {
        if (!validationErrors[qi]) {
          validationErrors[qi] = { field: 'maxValue', msg: '最高分必须为正数' };
          if (firstInvalidIndex === -1) firstInvalidIndex = qi;
        }
      } else if (isNaN(min) || min >= max) {
        if (!validationErrors[qi]) {
          validationErrors[qi] = { field: 'minValue', msg: '最低分必须小于最高分' };
          if (firstInvalidIndex === -1) firstInvalidIndex = qi;
        }
      }
      if (isNaN(step) || step <= 0) {
        if (!validationErrors[qi]) {
          validationErrors[qi] = { field: 'stepValue', msg: '步进值必须为正数' };
          if (firstInvalidIndex === -1) firstInvalidIndex = qi;
        }
      }
      if (q.question) questions.push(q);
    }

    if (!questions.length) {
      wx.showToast({ title: '请至少填写一道题目', icon: 'none' });
      return;
    }

    if (firstInvalidIndex >= 0) {
      var err = validationErrors[firstInvalidIndex];
      wx.showToast({ title: '第' + (firstInvalidIndex + 1) + '题：' + err.msg, icon: 'none', duration: 2500 });
      this.setData({
        questionValidationErrors: validationErrors,
        expandedQuestionIndex: firstInvalidIndex,
        templateQuestionScrollInto: 'question-' + firstInvalidIndex
      });
      return;
    }

    this.setLoading('saveTemplate', true);
    try {
      const result = await this.callCloud('saveScoreTemplate', {
        id: form.id,
        name,
        description,
        questions
      });

      if (result.status !== 'success') {
        wx.showToast({ title: result.message || '保存评分问题失败', icon: 'none' });
        return;
      }

      this.resetTemplateForm();
      await this.loadTemplateList();
      wx.showToast({ title: '评分问题已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '保存评分问题失败', icon: 'none' });
    } finally {
      this.setLoading('saveTemplate', false);
    }
  },

  editTemplate(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.templateList[index];
    if (!item) {
      return;
    }

    const questions = (item.questions || []).length
      ? (item.questions || []).map((question) => normalizeTemplateQuestionForForm(question))
      : [createEmptyQuestion()];

    this.setData({
      templateForm: {
        id: item.id,
        name: item.name,
        description: item.description || '',
        questions
      },
      expandedQuestionIndex: -1,
      questionFocusIndex: -1,
      activeTab: 'templates'
    });
  },

  async duplicateTemplate(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    this.setLoading('duplicateTemplate', true);
    try {
      const result = await this.callCloud('duplicateScoreTemplate', { id });
      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '复制评分问题失败',
          icon: 'none'
        });
        return;
      }

      await this.loadTemplateList();
      wx.showToast({
        title: '评分问题副本已创建',
        icon: 'success'
      });
    } catch (error) {
      wx.showToast({
        title: '复制评分问题失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('duplicateTemplate', false);
    }
  },

  // ========== Template Table Import / Export ==========

  importTableTemplate() {
    const _this = this;
    chooseTableFile(_this.callCloud.bind(_this)).then(function (tableData) {
      if (!tableData) return;

      const headers = tableData.headers;
      const dataRows = tableData.rows;
      if (dataRows.length === 0 && headers.length <= 1) {
        wx.showToast({ title: '表格文件为空', icon: 'none' });
        return;
      }
      // Auto-fill empty template name/description from file name
      const baseName = (tableData.fileName || '').replace(/\.(xlsx?|xls|csv)$/i, '');
      if (baseName) {
        const form = _this.data.templateForm;
        const updates = {};
        if (!(form.name || '').trim()) updates['templateForm.name'] = baseName;
        if (!(form.description || '').trim()) updates['templateForm.description'] = baseName;
        if (Object.keys(updates).length) _this.setData(updates);
      }
      // Build samples (first 5 data rows)
      const sampleRows = dataRows.slice(0, 5);
      // Auto-map columns
      const mapping = _this._buildTemplateCsvMapping(headers);
      // Build mapping rows for dialog
      const csvImportRows = headers.map((header, idx) => {
        const mapped = mapping[idx] || '';
        const fieldDef = TEMPLATE_CSV_FIELDS.find(f => f.key === mapped);
        const samples = sampleRows.map(r => (r[idx] || '').substring(0, 30)).filter(s => s);
        return {
          header: header,
          fieldTypeLabel: fieldDef ? fieldDef.label : '—',
          sampleValue: samples.slice(0, 3).join(', ') || '—',
          optionIndex: mapped ? TEMPLATE_CSV_FIELDS.findIndex(f => f.key === mapped) + 1 : 0,
          optionLabel: fieldDef ? fieldDef.label : '-- 忽略 --'
        };
      });
      // Build picker labels
      const mappingLabels = ['-- 忽略 --'].concat(TEMPLATE_CSV_FIELDS.map(f => f.label));
      _this.setData({
        showTemplateCsvDialog: true,
        templateCsvHeaders: headers,
        templateCsvSamples: sampleRows,
        templateCsvMapping: mapping,
        templateCsvFullRows: dataRows,
        templateCsvReplaceMode: true,
        templateCsvImportRows: csvImportRows,
        templateCsvImportMappingLabels: mappingLabels
      });
    }).catch(function (err) {
      if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
        wx.showToast({ title: '选择文件失败', icon: 'none' });
      }
    });
  },

  _parseTemplateCsvLine(line) {
    if (!line && line !== '') return [];
    const s = String(line);
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < s.length && s[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    // Filter out completely empty rows
    if (result.length === 1 && result[0].trim() === '') return [];
    if (result.every(c => c.trim() === '')) return [];
    return result;
  },

  _buildTemplateCsvMapping(headers) {
    const mapping = {};
    const usedFields = new Set();
    // First pass: exact / substring matches
    for (let ci = 0; ci < headers.length; ci++) {
      const hdr = headers[ci].toLowerCase().trim();
      for (const field of TEMPLATE_CSV_FIELDS) {
        if (usedFields.has(field.key)) continue;
        for (const alias of field.aliases) {
          if (hdr === alias.toLowerCase()) {
            mapping[ci] = field.key;
            usedFields.add(field.key);
            break;
          }
        }
        if (mapping[ci]) break;
      }
      if (!mapping[ci]) {
        // Substring match
        for (const field of TEMPLATE_CSV_FIELDS) {
          if (usedFields.has(field.key)) continue;
          for (const alias of field.aliases) {
            if (hdr.indexOf(alias.toLowerCase()) !== -1) {
              mapping[ci] = field.key;
              usedFields.add(field.key);
              break;
            }
          }
          if (mapping[ci]) break;
        }
      }
    }
    // Second pass: Jaccard similarity for unmapped columns
    for (let ci = 0; ci < headers.length; ci++) {
      if (mapping[ci]) continue;
      const hdr = headers[ci].toLowerCase().trim();
      if (!hdr) continue;
      let bestScore = 0;
      let bestField = null;
      for (const field of TEMPLATE_CSV_FIELDS) {
        if (usedFields.has(field.key)) continue;
        for (const alias of field.aliases) {
          const score = _jaccardSimilarity(hdr, alias.toLowerCase());
          if (score > bestScore && score >= 0.3) {
            bestScore = score;
            bestField = field.key;
          }
        }
      }
      if (bestField) {
        mapping[ci] = bestField;
        usedFields.add(bestField);
      }
    }
    return mapping;

    function _jaccardSimilarity(a, b) {
      if (!a || !b) return 0;
      const setA = new Set(a.split(''));
      const setB = new Set(b.split(''));
      const union = new Set([...setA, ...setB]);
      let intersection = 0;
      for (const ch of setA) { if (setB.has(ch)) intersection++; }
      return intersection / union.size;
    }
  },

  onTemplateCsvMappingChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const selectedIndex = Number(e.detail.value);
    const rows = this.data.templateCsvImportRows.slice();
    const mapping = Object.assign({}, this.data.templateCsvMapping);
    if (selectedIndex === 0) {
      // "忽略"
      delete mapping[idx];
      rows[idx].optionIndex = 0;
      rows[idx].optionLabel = '-- 忽略 --';
      rows[idx].fieldTypeLabel = '—';
    } else {
      const field = TEMPLATE_CSV_FIELDS[selectedIndex - 1];
      mapping[idx] = field.key;
      rows[idx].optionIndex = selectedIndex;
      rows[idx].optionLabel = field.label;
      rows[idx].fieldTypeLabel = field.label;
    }
    this.setData({
      templateCsvMapping: mapping,
      templateCsvImportRows: rows
    });
  },

  confirmTemplateCsvImport() {
    const mapping = this.data.templateCsvMapping;
    const rows = this.data.templateCsvFullRows;
    const replaceMode = this.data.templateCsvReplaceMode;

    // Resolve which CSV column maps to which field
    const fieldToCol = {};
    for (const ci in mapping) {
      fieldToCol[mapping[ci]] = Number(ci);
    }

    const questionCol = fieldToCol['question'];
    if (questionCol == null) {
      wx.showToast({ title: '请先将一个 CSV 列映射到"问题内容"', icon: 'none' });
      return;
    }

    const DEFAULT_VALUES = {
      scoreLabel: '',
      minValue: '0',
      startValue: '0',
      maxValue: '10',
      stepValue: '1'
    };

    const newQuestions = [];
    for (const row of rows) {
      const questionText = (row[questionCol] || '').trim();
      if (!questionText) continue; // Skip empty questions
      const q = createEmptyQuestion();
      q.question = questionText;
      for (const fk of ['scoreLabel', 'minValue', 'startValue', 'maxValue', 'stepValue']) {
        const col = fieldToCol[fk];
        if (col != null) {
          const rawVal = (row[col] || '').trim();
          if (rawVal) {
            q[fk] = rawVal;
          } else {
            q[fk] = DEFAULT_VALUES[fk];
          }
        } else {
          q[fk] = DEFAULT_VALUES[fk];
        }
      }
      newQuestions.push(q);
    }

    if (!newQuestions.length) {
      wx.showToast({ title: '没有有效的问题条目（所有行的问题内容为空）', icon: 'none' });
      return;
    }

    // Flush any pending question inputs
    this._flushQuestionInputs();

    let finalQuestions;
    if (replaceMode) {
      finalQuestions = newQuestions;
    } else {
      finalQuestions = (this.data.templateForm.questions || []).concat(newQuestions);
    }

    this.setData({
      showTemplateCsvDialog: false,
      templateCsvHeaders: [],
      templateCsvSamples: [],
      templateCsvMapping: {},
      templateCsvFullRows: [],
      templateCsvImportRows: [],
      templateForm: Object.assign({}, this.data.templateForm, { questions: finalQuestions }),
      expandedQuestionIndex: -1,
      questionInputValues: {},
      questionValidationErrors: {}
    });

    wx.showToast({ title: '已导入 ' + newQuestions.length + ' 个问题', icon: 'success' });
  },

  cancelTemplateCsvImport() {
    this.setData({
      showTemplateCsvDialog: false,
      templateCsvHeaders: [],
      templateCsvSamples: [],
      templateCsvMapping: {},
      templateCsvFullRows: [],
      templateCsvImportRows: []
    });
  },

  toggleTemplateCsvReplaceMode() {
    this.setData({ templateCsvReplaceMode: !this.data.templateCsvReplaceMode });
  },

  exportTemplate() {
    const questions = this.data.templateForm.questions || [];
    if (!questions.length) {
      wx.showToast({ title: '当前没有问题条目可导出', icon: 'none' });
      return;
    }
    const _this = this;
    wx.showActionSheet({
      itemList: ['CSV 格式 (.csv)', 'Excel 格式 (.xlsx)'],
      success: (res) => {
        const format = res.tapIndex === 0 ? 'csv' : 'excel';
        const headers = [
          { key: 'question', label: '问题内容' },
          { key: 'scoreLabel', label: '分值说明' },
          { key: 'minValue', label: '最低分' },
          { key: 'startValue', label: '起评分' },
          { key: 'maxValue', label: '最高分' },
          { key: 'stepValue', label: '步进值' }
        ];
        const rows = questions.map(function (q) {
          return {
            question: q.question || '',
            scoreLabel: q.scoreLabel || '',
            minValue: q.minValue || '0',
            startValue: q.startValue || '0',
            maxValue: q.maxValue || '10',
            stepValue: q.stepValue || '1'
          };
        });
        if (format === 'excel') {
          _this.callCloud('buildTableFile', { headers: headers, rows: rows, sheetName: '评分问题' }).then(function (result) {
            if (result && result.status === 'success' && result.fileBase64) {
              saveAndShareFile(result.fileBase64, '评分问题模板', 'xlsx');
            } else {
              wx.showToast({ title: '生成Excel失败', icon: 'none' });
            }
          }).catch(function () {
            wx.showToast({ title: '生成Excel失败', icon: 'none' });
          });
        } else {
          saveAndShareFile(buildCsv(headers, rows), '评分问题模板', 'csv');
        }
      }
    });
  },

  startTemplateConfigDrag(e) {
    const index = Number(e.currentTarget.dataset.index);
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch || Number.isNaN(index)) return;
    var touchY = touch.clientY != null ? touch.clientY : touch.pageY;
    this._templateConfigDragStartY = touchY;
    this._templateConfigDragState = { currentIndex: index };
    this._templateConfigEffectiveScrollTop = this.data.templateConfigScrollTop || 0;
    this.setData({ dragActive: true, draggingClauseTemplateIndex: index, dragTemplateInsertIndex: index, dragTemplateGhostVisible: false });
    var self = this;
    wx.createSelectorQuery().selectAll('.template-config-card').boundingClientRect(function(rects) {
      if (rects && rects.length) {
        self._templateConfigCardRects = rects;
        var cardRect = rects[index];
        if (cardRect) {
          self._templateConfigCardOriginalTop = cardRect.top;
          self._templateConfigCardLeft = cardRect.left;
          self._templateConfigCardWidth = cardRect.width;
          self._templateConfigFingerOffsetInCard = touchY - cardRect.top;
          self.setData({
            dragTemplateGhostTop: cardRect.top,
            dragTemplateGhostLeft: cardRect.left,
            dragTemplateGhostWidth: cardRect.width,
            dragTemplateGhostVisible: true
          });
        }
      }
    }).exec();
    wx.createSelectorQuery().select('.template-config-scroll').boundingClientRect(function(rect) {
      if (rect) self._templateConfigDragScrollRect = rect;
    }).exec();
  },

  onTemplateConfigDragMove(e) {
    if (!this._templateConfigDragState || this.data.draggingClauseTemplateIndex < 0) return;
    var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    var touchY = touch.clientY != null ? touch.clientY : touch.pageY;
    this._templateConfigDragLastY = touchY;
    var self = this;
    var now = Date.now();

    var sr = this._templateConfigDragScrollRect;
    if (sr) {
      var viewHeight = sr.bottom - sr.top;
      var edgeSize = Math.min(70, viewHeight * 0.22);
      var middleTop = sr.top + edgeSize;
      var middleBottom = sr.bottom - edgeSize;
      var scrollDelta = 0;
      if (touchY < middleTop) {
        var distIntoEdge = middleTop - touchY;
        var factor = Math.min(distIntoEdge / edgeSize, 3);
        scrollDelta = -Math.round(5 * factor);
      } else if (touchY > middleBottom) {
        var distIntoEdge = touchY - middleBottom;
        var factor = Math.min(distIntoEdge / edgeSize, 3);
        scrollDelta = Math.round(5 * factor);
      }
      if (scrollDelta !== 0) {
        self._templateConfigEffectiveScrollTop = Math.max(0, (self._templateConfigEffectiveScrollTop || 0) + scrollDelta);
      }
    }

    if (self._templateConfigLastUpdateTime && now - self._templateConfigLastUpdateTime < 33) return;
    self._templateConfigLastUpdateTime = now;

    wx.createSelectorQuery().selectAll('.template-config-card').boundingClientRect(function(rects) {
      if (!rects || !rects.length || !self._templateConfigDragState) return;
      self._templateConfigCardRects = rects;
      var y = self._templateConfigDragLastY;
      if (y == null) return;

      var newInsertIndex = rects.length;
      for (var i = 0; i < rects.length; i++) {
        if (y < rects[i].top + rects[i].height / 2) {
          newInsertIndex = i;
          break;
        }
      }

      var sr = self._templateConfigDragScrollRect;
      var ghostTop;
      if (self._templateConfigFingerOffsetInCard != null) {
        ghostTop = y - self._templateConfigFingerOffsetInCard;
      } else if (self._templateConfigCardOriginalTop != null && self._templateConfigDragStartY != null) {
        ghostTop = self._templateConfigCardOriginalTop + (y - self._templateConfigDragStartY);
      }
      if (sr) {
        var draggedRect = rects[self._templateConfigDragState.currentIndex];
        var ghostHeight = draggedRect ? draggedRect.height : 60;
        ghostTop = Math.max(sr.top, Math.min(sr.bottom - ghostHeight, ghostTop));
      }

      var update = {};
      if (newInsertIndex !== self.data.dragTemplateInsertIndex) update.dragTemplateInsertIndex = newInsertIndex;
      if (ghostTop !== self.data.dragTemplateGhostTop) update.dragTemplateGhostTop = ghostTop;
      if (self._templateConfigEffectiveScrollTop != null) update.templateConfigScrollTop = self._templateConfigEffectiveScrollTop;
      if (Object.keys(update).length) self.setData(update);
    }).exec();
  },

  endTemplateConfigDrag() {
    var state = this._templateConfigDragState;
    if (!state) return;
    var fromIndex = state.currentIndex;
    var insertIndex = this.data.dragTemplateInsertIndex;
    var toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
    if (toIndex !== fromIndex && toIndex >= 0 && toIndex <= this.data.ruleForm.clauseTemplateConfigs.length - 1) {
      var configs = refreshTemplateConfigSortOrder(moveItem(this.data.ruleForm.clauseTemplateConfigs, fromIndex, toIndex));
      this.setData({
        ruleForm: { ...this.data.ruleForm, clauseTemplateConfigs: configs }
      });
    }
    this._templateConfigDragState = null;
    this._templateConfigCardRects = null;
    this._templateConfigDragScrollRect = null;
    this._templateConfigDragLastY = null;
    this._templateConfigCardOriginalTop = null;
    this._templateConfigDragStartY = null;
    this._templateConfigCardLeft = null;
    this._templateConfigCardWidth = null;
    this._templateConfigEffectiveScrollTop = null;
    this._templateConfigFingerOffsetInCard = null;
    this._templateConfigLastUpdateTime = null;
    this.setData({ dragActive: false, draggingClauseTemplateIndex: -1, dragTemplateInsertIndex: -1, dragTemplateGhostVisible: false });
  },

  onTemplateConfigDragCancel() {
    this.endTemplateConfigDrag();
  },

  deleteTemplate(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除评分问题',
      content: '确认删除这份评分问题吗？',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        try {
          const result = await this.callCloud('deleteScoreTemplate', { id });
          if (result.status !== 'success') {
            wx.showToast({
              title: result.message || '删除失败',
              icon: 'none'
            });
            return;
          }

          await this.loadTemplateList();
          wx.showToast({
            title: '评分问题已删除',
            icon: 'success'
          });
        } catch (error) {
          wx.showToast({
            title: '删除评分问题失败',
            icon: 'none'
          });
        }
      }
    });
  },

  onRuleFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value.trim();
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        [field]: value
      }
    });
  },

  onClauseScopeChange(e) {
    const clauseScope = RULE_SCOPE_OPTIONS[e.detail.value].value;
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseScope,
        clauseScopeLabel: RULE_SCOPE_OPTIONS[e.detail.value].label
      }
    });
  },

  openScorerTaskPage() {
    if (!this.data.currentActivityId) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/scorerTasks/scorerTasks?activityId=${encodeURIComponent(this.data.currentActivityId)}&activityName=${encodeURIComponent(this.data.currentActivityName || '')}`
    });
  },

  onClauseRequireAllCompleteChange(e) {
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseRequireAllComplete: !!e.detail.value
      }
    });
  },

  onAllowSelfAssessmentChange(e) {
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        allowSelfAssessment: !!e.detail.value
      }
    });
  },

  onCalculationMethodChange(e) {
    const methods = ['weighted_average', 'trim_extremes'];
    const method = methods[e.detail.value];
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseCalculationMethod: method
      }
    });
  },

  openNewRuleClauseEditor() {
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseScope: RULE_SCOPE_OPTIONS[0].value,
        clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
        clauseTargetIdentityId: '',
        clauseTargetIdentity: '',
        clauseRequireAllComplete: false,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseTemplateConfigEditingIndex: -1,
        clauseEditingIndex: -1,
        clauseTemplateConfigs: [],
        isRuleClauseEditorVisible: true,
        isTemplateConfigEditorVisible: false
      }
    });
  },

  openTemplateConfigEditor() {
    this.setData({
      clauseTemplateInlineEditIndex: this.data.ruleForm.clauseTemplateConfigs.length,
      ruleForm: {
        ...this.data.ruleForm,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseCalculationMethod: 'weighted_average',
        clauseTrimHighCount: 0,
        clauseTrimLowCount: 0,
        clauseTemplateConfigEditingIndex: -1
      }
    });
  },

  startCreateRuleCategory() {
    this.setData({
      ruleForm: emptyRuleForm(),
      draggingClauseTemplateIndex: -1
    });
  },

  onRuleScorerDepartmentChange(e) {
    const index = Number(e.detail.value);
    const departmentObj = this.data.departmentList[index] || {};
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        scorerDepartmentId: departmentObj.id || '',
        scorerDepartment: departmentObj.name || ''
      }
    });
  },

  onRuleScorerIdentityChange(e) {
    const index = Number(e.detail.value);
    const identityObj = this.data.identityList[index] || {};
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        scorerIdentityId: identityObj.id || '',
        scorerIdentity: identityObj.name || ''
      }
    });
  },

  onRuleTargetIdentityChange(e) {
    const index = Number(e.detail.value);
    const identityObj = this.data.identityList[index] || {};
    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseTargetIdentityId: identityObj.id || '',
        clauseTargetIdentity: identityObj.name || ''
      }
    });
  },

  onRuleFilterChange(e) {
    const { field } = e.currentTarget.dataset;
    const optionKey = field === 'identity' ? 'identities' : 'departments';
    const options = (this.data.ruleFilterOptions || {})[optionKey] || ['全部'];
    const value = options[Number(e.detail.value)] || '全部';
    const nextFilters = {
      ...(this.data.ruleFilters || emptyRuleFilters()),
      [field]: value
    };
    this.setRuleListState(this.data.ruleList, this.data.selectedRuleIds, nextFilters);
  },

  resetRuleFilters() {
    this.setRuleListState(this.data.ruleList, this.data.selectedRuleIds, emptyRuleFilters());
  },

  toggleRuleSelection(e) {
    const { id } = e.currentTarget.dataset;
    const targetId = String(id || '').trim();
    if (!targetId) {
      return;
    }

    const selectedRuleIds = new Set((this.data.selectedRuleIds || []).map((item) => String(item)));
    if (selectedRuleIds.has(targetId)) {
      selectedRuleIds.delete(targetId);
    } else {
      selectedRuleIds.add(targetId);
    }

    const nextSelectedRuleIds = [...selectedRuleIds];
    this.setRuleListState(this.data.ruleList, nextSelectedRuleIds, this.data.ruleFilters);
  },

  toggleSelectAllRules() {
    const visibleRuleIds = (this.data.ruleListView || []).map((item) => item.id).filter(Boolean);
    if (!visibleRuleIds.length) {
      return;
    }

    const selectedSet = new Set((this.data.selectedRuleIds || []).map((item) => String(item)));
    const isVisibleAllSelected = visibleRuleIds.every((id) => selectedSet.has(String(id)));
    visibleRuleIds.forEach((id) => {
      if (isVisibleAllSelected) {
        selectedSet.delete(String(id));
      } else {
        selectedSet.add(String(id));
      }
    });
    this.setRuleListState(this.data.ruleList, [...selectedSet], this.data.ruleFilters);
  },

  reverseSelectVisibleRules() {
    const visibleRuleIds = (this.data.ruleListView || []).map((item) => item.id).filter(Boolean);
    if (!visibleRuleIds.length) {
      return;
    }

    const selectedSet = new Set((this.data.selectedRuleIds || []).map((item) => String(item)));
    visibleRuleIds.forEach((id) => {
      const textId = String(id);
      if (selectedSet.has(textId)) {
        selectedSet.delete(textId);
      } else {
        selectedSet.add(textId);
      }
    });
    this.setRuleListState(this.data.ruleList, [...selectedSet], this.data.ruleFilters);
  },

  async applyClausesToSelectedRules() {
    const selectedRules = (this.data.ruleList || []).filter((item) => (this.data.selectedRuleIds || []).includes(item.id));
    const clauseResult = buildRuleClausesForBatchApply(this.data.ruleForm);
    const clauses = clauseResult.clauses || [];
    const currentActivity = (this.data.activityList || []).find((item) => item.id === this.data.currentActivityId);

    if (!this.data.currentActivityId || !currentActivity) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }

    if (!selectedRules.length) {
      wx.showToast({
        title: '请先勾选需要批量设置的评分人类别',
        icon: 'none'
      });
      return;
    }

    if (!clauseResult.ok) {
      wx.showToast({
        title: clauseResult.message || '请先准备好要批量应用的被评分人规则',
        icon: 'none'
      });
      return;
    }

    this.setLoading('batchSaveRules', true);
    wx.showLoading({ title: '正在批量应用...', mask: true });
    try {
      const savedRules = [];
      for (const rule of selectedRules) {
        const result = await this.callCloud('saveRateRule', {
          id: rule.id,
          activityId: this.data.currentActivityId,
          activityName: currentActivity.name || '',
          scorerDepartmentId: rule.scorerDepartmentId,
          scorerIdentityId: rule.scorerIdentityId,
          clauses,
          mode: 'replace'
        });

        if (result.status !== 'success') {
          wx.hideLoading();
          wx.showToast({
            title: result.message || (`批量设置失败：${rule.scorerDepartment}/${rule.scorerIdentity}`),
            icon: 'none'
          });
          this.setLoading('batchSaveRules', false);
          return;
        }
        savedRules.push({
          id: result.id || rule.id,
          activityId: this.data.currentActivityId,
          activityName: currentActivity.name || '',
          scorerDepartmentId: rule.scorerDepartmentId,
          scorerDepartment: rule.scorerDepartment,
          scorerIdentityId: rule.scorerIdentityId,
          scorerIdentity: rule.scorerIdentity,
          clauses
        });
      }

      savedRules.forEach((rule) => this.upsertRuleListItem(rule));
      await this.loadRuleList({ silent: true });
      wx.hideLoading();
      wx.showToast({
        title: '批量更新完成',
        icon: 'success'
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '批量设置规则失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('batchSaveRules', false);
    }
  },

  onRuleTemplateChange(e) {
    const index = Number(e.detail.value);
    const template = this.data.templateList[index];
    if (!template) {
      return;
    }

    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseTemplateId: template.id,
        clauseTemplateName: template.name
      }
    });
  },

  addClauseTemplateConfig() {
  const {
    clauseTemplateId,
    clauseTemplateName,
    clauseTemplateWeight,
    clauseTemplateConfigEditingIndex,
    clauseTemplateConfigs
  } = this.data.ruleForm;

    if (!clauseTemplateId) {
      wx.showToast({
        title: '请先选择评分问题',
        icon: 'none'
      });
      return;
    }

    const weight = Number(clauseTemplateWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      wx.showToast({
        title: '评分问题权重必须大于 0',
        icon: 'none'
      });
      return;
    }

    const sortOrderValue = clauseTemplateConfigEditingIndex >= 0 && clauseTemplateConfigs[clauseTemplateConfigEditingIndex]
      ? Number(clauseTemplateConfigs[clauseTemplateConfigEditingIndex].sortOrder) || (clauseTemplateConfigEditingIndex + 1)
      : clauseTemplateConfigs.length + 1;

    const nextConfig = {
      templateId: clauseTemplateId,
      templateName: clauseTemplateName,
      weight: String(weight),
      sortOrder: String(sortOrderValue),
      calculationMethod: this.data.ruleForm.clauseCalculationMethod || 'weighted_average',
      trimHighCount: Number(this.data.ruleForm.clauseTrimHighCount || 0),
      trimLowCount: Number(this.data.ruleForm.clauseTrimLowCount || 0)
    };

    const exists = clauseTemplateConfigs.some((item, index) => (
      index !== clauseTemplateConfigEditingIndex &&
      item.templateId === nextConfig.templateId
    ));

    if (exists) {
      wx.showToast({
        title: '这个评分问题已在当前规则中',
        icon: 'none'
      });
      return;
    }

    const nextConfigs = [...clauseTemplateConfigs];
    if (clauseTemplateConfigEditingIndex >= 0 && nextConfigs[clauseTemplateConfigEditingIndex]) {
      nextConfigs[clauseTemplateConfigEditingIndex] = nextConfig;
    } else {
      nextConfigs.push(nextConfig);
    }

    nextConfigs.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
    const normalizedNextConfigs = refreshTemplateConfigSortOrder(nextConfigs);

    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseTemplateConfigs: normalizedNextConfigs,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseTemplateConfigEditingIndex: -1,
        isTemplateConfigEditorVisible: false
      }
    });
  },

  editClauseTemplateConfig(e) {
    const index = Number(e.currentTarget.dataset.index);
    const targetConfig = this.data.ruleForm.clauseTemplateConfigs[index];
    if (!targetConfig) {
      return;
    }

    this.setData({
      clauseTemplateInlineEditIndex: index,
      ruleForm: {
        ...this.data.ruleForm,
        clauseTemplateId: targetConfig.templateId || '',
        clauseTemplateName: targetConfig.templateName || '',
        clauseTemplateWeight: String(targetConfig.weight || '1'),
        clauseTemplateOrder: String(targetConfig.sortOrder || ''),
        clauseCalculationMethod: targetConfig.calculationMethod || 'weighted_average',
        clauseTrimHighCount: Number(targetConfig.trimHighCount || 0),
        clauseTrimLowCount: Number(targetConfig.trimLowCount || 0),
        clauseTemplateConfigEditingIndex: index
      }
    });
  },

  removeClauseTemplateConfig(e) {
    const index = Number(e.currentTarget.dataset.index);
    const nextConfigs = this.data.ruleForm.clauseTemplateConfigs.filter((_, configIndex) => configIndex !== index);
    const nextEditingIndex = this.data.ruleForm.clauseTemplateConfigEditingIndex === index
      ? -1
      : (this.data.ruleForm.clauseTemplateConfigEditingIndex > index
        ? this.data.ruleForm.clauseTemplateConfigEditingIndex - 1
        : this.data.ruleForm.clauseTemplateConfigEditingIndex);

    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseTemplateConfigs: refreshTemplateConfigSortOrder(nextConfigs),
        clauseTemplateConfigEditingIndex: nextEditingIndex,
      }
    });
  },

  moveClauseTemplateConfigUp(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index) || index <= 0) return;
    const configs = refreshTemplateConfigSortOrder(
      moveItem(this.data.ruleForm.clauseTemplateConfigs, index, index - 1)
    );
    this.setData({
      ruleForm: { ...this.data.ruleForm, clauseTemplateConfigs: configs }
    });
  },

  moveClauseTemplateConfigDown(e) {
    const index = Number(e.currentTarget.dataset.index);
    const configs = this.data.ruleForm.clauseTemplateConfigs;
    if (Number.isNaN(index) || index >= configs.length - 1) return;
    const nextConfigs = refreshTemplateConfigSortOrder(
      moveItem(configs, index, index + 1)
    );
    this.setData({
      ruleForm: { ...this.data.ruleForm, clauseTemplateConfigs: nextConfigs }
    });
  },

  saveClauseTemplateConfigInline() {
    const {
      clauseTemplateId,
      clauseTemplateName,
      clauseTemplateWeight,
      clauseTemplateConfigs
    } = this.data.ruleForm;
    const editIndex = this.data.clauseTemplateInlineEditIndex;

    if (!clauseTemplateId) {
      wx.showToast({ title: '请先选择评分问题', icon: 'none' });
      return;
    }

    const weight = Number(clauseTemplateWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      wx.showToast({ title: '评分问题权重必须大于 0', icon: 'none' });
      return;
    }

    const isAdd = editIndex >= clauseTemplateConfigs.length;
    const sortOrderValue = isAdd
      ? clauseTemplateConfigs.length + 1
      : Number(clauseTemplateConfigs[editIndex].sortOrder) || (editIndex + 1);

    const nextConfig = {
      templateId: clauseTemplateId,
      templateName: clauseTemplateName,
      weight: String(weight),
      sortOrder: String(sortOrderValue),
      calculationMethod: this.data.ruleForm.clauseCalculationMethod || 'weighted_average',
      trimHighCount: Number(this.data.ruleForm.clauseTrimHighCount || 0),
      trimLowCount: Number(this.data.ruleForm.clauseTrimLowCount || 0)
    };

    const exists = clauseTemplateConfigs.some((item, idx) => (
      idx !== editIndex && item.templateId === nextConfig.templateId
    ));

    if (exists) {
      wx.showToast({ title: '这个评分问题已在当前规则中', icon: 'none' });
      return;
    }

    const nextConfigs = [...clauseTemplateConfigs];
    if (isAdd) {
      nextConfigs.push(nextConfig);
    } else {
      nextConfigs[editIndex] = nextConfig;
    }

    nextConfigs.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
    const normalizedNextConfigs = refreshTemplateConfigSortOrder(nextConfigs);

    this.setData({
      clauseTemplateInlineEditIndex: -1,
      ruleForm: {
        ...this.data.ruleForm,
        clauseTemplateConfigs: normalizedNextConfigs,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseTemplateConfigEditingIndex: -1
      }
    });
  },

  cancelClauseTemplateConfigInline() {
    this.setData({
      clauseTemplateInlineEditIndex: -1,
      ruleForm: {
        ...this.data.ruleForm,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseCalculationMethod: 'weighted_average',
        clauseTrimHighCount: 0,
        clauseTrimLowCount: 0,
        clauseTemplateConfigEditingIndex: -1
      }
    });
  },

  cancelClauseTemplateConfigEdit() {
    this.cancelClauseTemplateConfigInline();
  },

  addRuleClause() {
    const {
      clauseScope,
      clauseTargetIdentityId,
      clauseTargetIdentity,
      clauseRequireAllComplete,
      clauseEditingIndex,
      clauseTemplateConfigs,
      clauses
    } = this.data.ruleForm;
    if (clauseScope !== 'all_people' && !clauseTargetIdentityId && clauseScope.indexOf('_all') === -1) {
      wx.showToast({
        title: '请填写被评分人身份',
        icon: 'none'
      });
      return;
    }

    const nextClause = {
      scopeType: clauseScope,
      scopeLabel: getScopeLabel(clauseScope),
      targetIdentityId: clauseTargetIdentityId,
      targetIdentity: clauseTargetIdentity,
      requireAllComplete: !!clauseRequireAllComplete,
      templateConfigs: [...clauseTemplateConfigs].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    };

    const exists = clauses.some((item, index) => (
      index !== clauseEditingIndex &&
      item.scopeType === nextClause.scopeType &&
      item.targetIdentityId === nextClause.targetIdentityId &&
      JSON.stringify(item.templateConfigs || []) === JSON.stringify(nextClause.templateConfigs)
    ));

    if (exists) {
      wx.showToast({
        title: '被评分人规则已存在',
        icon: 'none'
      });
      return;
    }

    const nextClauses = [...clauses];
    if (clauseEditingIndex >= 0 && nextClauses[clauseEditingIndex]) {
      nextClauses[clauseEditingIndex] = nextClause;
    } else {
      nextClauses.push(nextClause);
    }

    this.setData({
      clauseTemplateInlineEditIndex: -1,
      ruleForm: {
        ...this.data.ruleForm,
        clauses: nextClauses,
        clauseScope: RULE_SCOPE_OPTIONS[0].value,
        clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
        clauseTargetIdentityId: '',
        clauseTargetIdentity: '',
        clauseRequireAllComplete: false,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseTemplateConfigEditingIndex: -1,
        clauseEditingIndex: -1,
        clauseTemplateConfigs: [],
        isRuleClauseEditorVisible: false,
        isTemplateConfigEditorVisible: false
      }
    });
  },

  removeRuleClause(e) {
    const index = Number(e.currentTarget.dataset.index);
    const nextClauses = this.data.ruleForm.clauses.filter((_, clauseIndex) => clauseIndex !== index);
    const nextEditingIndex = this.data.ruleForm.clauseEditingIndex === index
      ? -1
      : (this.data.ruleForm.clauseEditingIndex > index
        ? this.data.ruleForm.clauseEditingIndex - 1
        : this.data.ruleForm.clauseEditingIndex);

    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauses: nextClauses,
        clauseTemplateConfigs: this.data.ruleForm.clauseEditingIndex === index ? [] : this.data.ruleForm.clauseTemplateConfigs,
        clauseTemplateId: this.data.ruleForm.clauseEditingIndex === index ? '' : this.data.ruleForm.clauseTemplateId,
        clauseTemplateName: this.data.ruleForm.clauseEditingIndex === index ? '' : this.data.ruleForm.clauseTemplateName,
        clauseTemplateWeight: this.data.ruleForm.clauseEditingIndex === index ? '1' : this.data.ruleForm.clauseTemplateWeight,
        clauseTemplateOrder: this.data.ruleForm.clauseEditingIndex === index ? '' : this.data.ruleForm.clauseTemplateOrder,
        clauseTemplateConfigEditingIndex: this.data.ruleForm.clauseEditingIndex === index ? -1 : this.data.ruleForm.clauseTemplateConfigEditingIndex,
        clauseEditingIndex: nextEditingIndex,
        isRuleClauseEditorVisible: nextEditingIndex >= 0,
        isTemplateConfigEditorVisible: this.data.ruleForm.clauseEditingIndex === index ? false : this.data.ruleForm.isTemplateConfigEditorVisible
      }
    });
  },

  editRuleClause(e) {
    const index = Number(e.currentTarget.dataset.index);
    const targetClause = this.data.ruleForm.clauses[index];
    if (!targetClause) {
      return;
    }

    this.setData({
      ruleForm: {
        ...this.data.ruleForm,
        clauseScope: targetClause.scopeType || RULE_SCOPE_OPTIONS[0].value,
        clauseScopeLabel: getScopeLabel(targetClause.scopeType),
        clauseTargetIdentityId: targetClause.targetIdentityId || '',
        clauseTargetIdentity: targetClause.targetIdentity || '',
        clauseRequireAllComplete: targetClause.requireAllComplete === true,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseTemplateConfigEditingIndex: -1,
        clauseTemplateConfigs: refreshTemplateConfigSortOrder(normalizeClauseForEdit(targetClause).templateConfigs),
        clauseEditingIndex: index,
        isRuleClauseEditorVisible: true,
        isTemplateConfigEditorVisible: false
      }
    });
  },

  cancelRuleClauseEdit() {
    this.setData({
      clauseTemplateInlineEditIndex: -1,
      ruleForm: {
        ...this.data.ruleForm,
        clauseScope: RULE_SCOPE_OPTIONS[0].value,
        clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
        clauseTargetIdentityId: '',
        clauseTargetIdentity: '',
        clauseRequireAllComplete: false,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseTemplateConfigEditingIndex: -1,
        clauseTemplateConfigs: [],
        clauseEditingIndex: -1,
        isRuleClauseEditorVisible: false,
        isTemplateConfigEditorVisible: false
      }
    });
  },

  editRule(e) {
    const { id, index } = e.currentTarget.dataset;
    const targetId = String(id || '').trim();
    const target = targetId
      ? (this.data.ruleList || []).find((item) => String(item.id || '') === targetId)
      : this.data.ruleList[Number(index)];
    if (!target) {
      return;
    }

    this.setData({
      ruleForm: {
        id: target.id,
        scorerDepartmentId: target.scorerDepartmentId || '',
        scorerDepartment: target.scorerDepartment || '',
        scorerIdentityId: target.scorerIdentityId || '',
        scorerIdentity: target.scorerIdentity || '',
        allowSelfAssessment: target.allowSelfAssessment !== false,
        clauseScope: RULE_SCOPE_OPTIONS[0].value,
        clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
        clauseTargetIdentity: '',
        clauseRequireAllComplete: false,
        clauseTemplateId: '',
        clauseTemplateName: '',
        clauseTemplateWeight: '1',
        clauseTemplateOrder: '',
        clauseCalculationMethod: 'weighted_average',
        clauseTrimHighCount: 0,
        clauseTrimLowCount: 0,
        clauseTemplateConfigEditingIndex: -1,
        clauseEditingIndex: -1,
        isRuleClauseEditorVisible: false,
        isTemplateConfigEditorVisible: false,
        clauseTemplateConfigs: [],
        clauses: (target.clauses || []).map((item) => normalizeClauseForEdit(item))
      },
      activeTab: 'rules'
    });
  },

  async saveRuleCategory() {
    const { id, scorerDepartmentId, scorerDepartment, scorerIdentityId, scorerIdentity } = this.data.ruleForm;
    const clauseResult = buildRuleClausesForSave(this.data.ruleForm);
    const clauses = clauseResult.clauses || [];
    const currentActivity = (this.data.activityList || []).find((item) => item.id === this.data.currentActivityId);
    if (!this.data.currentActivityId || !currentActivity) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }

    if (!scorerDepartmentId || !scorerIdentityId) {
      wx.showToast({
        title: '请填写完整的评分人类别',
        icon: 'none'
      });
      return;
    }

    if (!clauseResult.ok) {
      wx.showToast({
        title: clauseResult.message || '请先添加被评分人规则',
        icon: 'none'
      });
      return;
    }

    this.setLoading('saveRule', true);
    try {
      const result = await this.callCloud('saveRateRule', {
        id,
        activityId: this.data.currentActivityId,
        activityName: currentActivity.name || '',
        scorerDepartmentId,
        scorerIdentityId,
        allowSelfAssessment: this.data.ruleForm.allowSelfAssessment,
        clauses
      });
      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '保存评分人类别失败',
          icon: 'none'
        });
        return;
      }

      await this.reloadRuleListAfterSave(result.rule || {
        id: result.id || id,
        activityId: this.data.currentActivityId,
        activityName: currentActivity.name || '',
        scorerDepartmentId,
        scorerIdentityId,
        clauses
      });
      this.setData({ ruleForm: emptyRuleForm() });
      wx.showToast({
        title: '类别已保存',
        icon: 'success'
      });
    } catch (error) {
      wx.showToast({
        title: '保存评分人类别失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('saveRule', false);
    }
  },

  async generateRuleCategories() {
    if (!this.data.currentActivityId) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }

    this.setLoading('generateRules', true);
    try {
      const result = await this.callCloud('generateRateTargetRules', {
        activityId: this.data.currentActivityId
      });

      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '生成默认评分人类别失败',
          icon: 'none'
        });
        return;
      }

      await this.reloadRuleListWithRetry(result.ruleCount || 0);
      wx.showToast({
        title: result.ruleCount ? '默认评分人类别已生成' : '没有可生成的评分人类别',
        icon: 'success'
      });
    } catch (error) {
      wx.showToast({
        title: '生成默认评分人类别失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('generateRules', false);
    }
  },

  async generateRuleCategoriesSafe() {
    if (!this.data.currentActivityId) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }

    this.setLoading('generateRules', true);
    let result = null;
    try {
      result = await this.callCloud('generateRateTargetRules', {
        activityId: this.data.currentActivityId
      });

      if (!result || result.status !== 'success') {
        wx.showToast({
          title: (result && result.message) || '生成默认评分人类别失败',
          icon: 'none'
        });
        return;
      }

      for (const delay of [0, 200, 500]) {
        if (delay > 0) {
          await this.wait(delay);
        }
        try {
          const listResult = await this.callCloud('listRateRules', {
            activityId: this.data.currentActivityId
          });
          this.setRuleListState(listResult.rules || [], this.data.selectedRuleIds, this.data.ruleFilters);
          break;
        } catch (refreshError) {}
      }

      wx.showToast({
        title: '默认评分人类别已生成',
        icon: 'success'
      });
      return;
    } catch (error) {
      if (result && result.status === 'success') {
        wx.showToast({
          title: '默认评分人类别已生成',
          icon: 'success'
        });
        return;
      }

      wx.showToast({
        title: '生成默认评分人类别失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('generateRules', false);
    }
  },

  async generateRuleCategoriesFinal() {
    if (!this.data.currentActivityId) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }

    this.setLoading('generateRules', true);
    wx.showLoading({ title: '正在生成默认类别...', mask: true });
    let result = null;
    try {
      result = await this.callCloud('generateRateTargetRules', {
        activityId: this.data.currentActivityId
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '生成默认评分人类别失败',
        icon: 'none'
      });
      this.setLoading('generateRules', false);
      return;
    }

    if (!result || result.status !== 'success') {
      wx.hideLoading();
      wx.showToast({
        title: (result && result.message) || '生成默认评分人类别失败',
        icon: 'none'
      });
      this.setLoading('generateRules', false);
      return;
    }

    for (const delay of [0, 200, 500]) {
      if (delay > 0) {
        await this.wait(delay);
      }

      try {
        const listResult = await this.callCloud('listRateRules', {
          activityId: this.data.currentActivityId
        });
        this.setRuleListState(listResult.rules || [], this.data.selectedRuleIds, this.data.ruleFilters);
        break;
      } catch (refreshError) {}
    }

    wx.hideLoading();
    this.setLoading('generateRules', false);
    wx.showToast({
      title: `已生成 ${result.ruleCount || 0} 类评分人`,
      icon: 'none',
      duration: 2000
    });
  },

  async saveRule() {
    const { id, scorerDepartmentId, scorerDepartment, scorerIdentityId, scorerIdentity, clauses } = this.data.ruleForm;
    const currentActivity = (this.data.activityList || []).find((item) => item.id === this.data.currentActivityId);
    if (!this.data.currentActivityId || !currentActivity) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }
    if (!scorerDepartmentId || !scorerIdentityId) {
      wx.showToast({
        title: '请填写完整评分人类别',
        icon: 'none'
      });
      return;
    }

    this.setLoading('saveRule', true);
    try {
      const result = await this.callCloud('saveRateRule', {
        id,
        activityId: this.data.currentActivityId,
        activityName: currentActivity.name || '',
        scorerDepartmentId,
        scorerIdentityId,
        allowSelfAssessment: this.data.ruleForm.allowSelfAssessment,
        clauses
      });
      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        });
        return;
      }

      this.setData({ ruleForm: emptyRuleForm() });
      await this.loadRuleList();
      wx.showToast({
        title: '类别已保存',
        icon: 'success'
      });
    } catch (error) {
      wx.showToast({
        title: '保存评分人类别失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('saveRule', false);
    }
  },

  deleteRule(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除评分人类别',
      content: '确认删除这条评分人类别吗？',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await this.callCloud('deleteRateRule', { id });
          await this.loadRuleList();
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

  async generateDefaultRules() {
    if (!this.data.currentActivityId) {
      wx.showToast({
        title: '请先设置当前评分活动',
        icon: 'none'
      });
      return;
    }

    this.setLoading('generateRules', true);
    try {
      const result = await this.callCloud('generateRateTargetRules', {
        activityId: this.data.currentActivityId
      });
      wx.showToast({
        title: result.ruleCount ? '默认评分人类别已生成' : '没有可生成的评分人类别',
        icon: 'none'
      });
      await this.loadRuleList();
    } catch (error) {
      wx.showToast({
        title: '生成默认评分人类别失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('generateRules', false);
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
    var self = this;
    self._csvImportActive = true;

    chooseTableFile(self.callCloud.bind(self)).then(function (tableData) {
      if (!tableData) { self._csvImportActive = false; return; }

      var headers = tableData.headers;
      var rows = tableData.rows;
      var rawContent = tableData.rawContent;
      var fileName = tableData.fileName;

      var samples = [headers];
      for (var r = 0; r < Math.min(rows.length, 6); r++) {
        samples.push(rows[r]);
      }

      var templateFields = (self.data.hrProfileTemplateForm || {}).fields || [];
      var result = buildCsvColumnMapping(headers, samples, templateFields);

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
    var result = [];
    var current = '';
    var inQuotes = false;
    var text = String(line || '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var next = text[i + 1];
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
    var cards = [];
    var cardMap = {};
    for (var i = 0; i < flatErrors.length; i++) {
      var e = flatErrors[i];
      var key = e.studentId || '__no_id__';
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
    var self = this;
    var errors = self.data.validationErrors || [];
    if (!errors.length) {
      wx.showToast({ title: '没有错误数据可导出', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['CSV 格式 (.csv)', 'Excel 格式 (.xlsx)'],
      success: function (res) {
        var format = res.tapIndex === 0 ? 'csv' : 'excel';
        var headers = [
          { key: 'name', label: '姓名' },
          { key: 'studentId', label: '学号' },
          { key: 'fieldName', label: '字段名' },
          { key: 'fieldType', label: '字段类型' },
          { key: 'errorValue', label: '错误值' },
          { key: 'errorReason', label: '错误原因' }
        ];
        var rows = errors.map(function (e) {
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

  escapeCsvCell(value) {
    var s = String(value == null ? '' : value);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  },

  closeValidationErrors() {
    this.setData({ showValidationErrors: false });
  },

  onCsvMappingTargetChange(e) {
    var rowIndex = Number(e.currentTarget.dataset.index);
    var values = this.data.csvImportMappingValues || [];
    var labels = this.data.csvImportMappingLabels || [];
    var optionIndex = Number(e.detail.value);
    var targetValue = values[optionIndex];
    if (isNaN(rowIndex) || targetValue === undefined) return;

    var newFieldTypeLabel = getFieldTypeLabelForTarget(
      targetValue,
      (this.data.hrProfileTemplateForm || {}).fields || []
    );

    var rows = this.data.csvImportRows.slice();
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
    var self = this;
    var rows = self.data.csvImportRows || [];
    var columnMapping = {};
    var extensionFields = {};

    // Build field ID → label lookup for extension fields
    var tplFields = (self.data.hrProfileTemplateForm || {}).fields || [];
    var fieldIdToLabel = {};
    for (var j = 0; j < tplFields.length; j++) {
      fieldIdToLabel[tplFields[j].id] = tplFields[j].label;
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.target === 'ignore') continue;

      if (row.target === 'name' || row.target === 'studentId' || row.target === 'department'
        || row.target === 'identity' || row.target === 'workGroup') {
        columnMapping[row.target] = row.header;
      } else {
        var label = fieldIdToLabel[row.target];
        if (label) {
          extensionFields[row.header] = label;
        }
      }
    }

    // Require all 5 basic fields to be mapped
    var requiredBasicFields = ['name', 'studentId', 'department', 'identity', 'workGroup'];
    var missingBasicFields = [];
    for (var k = 0; k < requiredBasicFields.length; k++) {
      if (!columnMapping[requiredBasicFields[k]]) {
        missingBasicFields.push(requiredBasicFields[k]);
      }
    }
    if (missingBasicFields.length > 0) {
      var fieldNameMap = { name: '姓名', studentId: '学号', department: '所属部门', identity: '身份', workGroup: '工作分工' };
      var missingNames = [];
      for (var k2 = 0; k2 < missingBasicFields.length; k2++) {
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

    var skipInvalid = self.data.csvImportSkipInvalid;

    // --- Pre-validation (only when NOT skipping invalid fields) ---
    var validationErrors = [];
    var csvLines = self.data.csvImportContent.split(/\r?\n/);

    if (!skipInvalid) {
      // Validate ALL data rows against field definitions
      var tplFields = (self.data.hrProfileTemplateForm || {}).fields || [];

      // Build index: CSV column index → field definition
      var colFieldMap = [];
      for (var r = 0; r < rows.length; r++) {
        var mappingRow = rows[r];
        if (!mappingRow || mappingRow.target === 'ignore') {
          colFieldMap[r] = null;
          continue;
        }
        if (mappingRow.target === 'name' || mappingRow.target === 'studentId'
          || mappingRow.target === 'department' || mappingRow.target === 'identity'
          || mappingRow.target === 'workGroup') {
          colFieldMap[r] = { type: 'basic', name: mappingRow.target, csvHeader: mappingRow.header };
        } else {
          var found = tplFields.find(function (f) { return f.id === mappingRow.target; });
          colFieldMap[r] = { type: 'ext', csvHeader: mappingRow.header, fieldDef: found || { type: 'text' } };
        }
      }

      var studentIdColIndex = -1;
      var nameColIndex = -1;
      for (var c = 0; c < colFieldMap.length; c++) {
        if (colFieldMap[c] && colFieldMap[c].type === 'basic') {
          if (colFieldMap[c].name === 'studentId') studentIdColIndex = c;
          if (colFieldMap[c].name === 'name') nameColIndex = c;
        }
      }

      for (var rowIdx = 1; rowIdx < csvLines.length; rowIdx++) {
        var rowCells = self.parseCsvLine(csvLines[rowIdx] || '');
        if (!rowCells.length) continue;

        var studentId = normalizeEmptyValue(rowCells[studentIdColIndex]);
        if (!studentId) continue;

        var name = normalizeEmptyValue(rowCells[nameColIndex]);

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

        for (var c = 0; c < colFieldMap.length; c++) {
          var map = colFieldMap[c];
          if (!map || map.type !== 'ext') continue;
          var cellValue = normalizeEmptyValue(rowCells[c]);
          var check = validateCsvValueAgainstField(cellValue, map.fieldDef);
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
        var errorRecordCount = 0;
        var seenStudentIds = {};
        for (var ei = 0; ei < validationErrors.length; ei++) {
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
      var startIndex = 1;
      var totalCount = 0;
      var hasMore = true;
      var skipInvalidFlag = skipInvalid;
      var skippedNoStudentIdTotal = 0;

      while (hasMore) {
        wx.showLoading({
          title: '正在导入' + (totalCount > 0 ? '（已导入' + totalCount + '条）' : '...'),
          mask: true
        });

        var result = await this.callCloud('importHrCsv', {
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
          var errors = result.errors || [];
          var flatErrors = [];
          for (var ei = 0; ei < errors.length; ei++) {
            var errRec = errors[ei];
            for (var fi = 0; fi < errRec.errors.length; fi++) {
              var e = errRec.errors[fi];
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
        var successBatchHadRows = Number(result.count || 0) > 0;
        var successFrontendHasMore = startIndex < csvLines.length;
        if (result.hasMore !== undefined) {
          hasMore = !!result.hasMore || (successBatchHadRows && successFrontendHasMore);
        } else {
          hasMore = successFrontendHasMore;
        }

        // Collect any skipped-field errors from this batch
        if (result.errors && result.errors.length) {
          var batchFlatErrors = [];
          for (var bei = 0; bei < result.errors.length; bei++) {
            var ber = result.errors[bei];
            for (var bfi = 0; bfi < ber.errors.length; bfi++) {
              var be = ber.errors[bfi];
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

      var toastTitle = '导入成功，共 ' + totalCount + ' 条';
      if (skippedNoStudentIdTotal > 0) {
        toastTitle += '，' + skippedNoStudentIdTotal + ' 条因学号为空跳过';
      }
      if (validationErrors.length > 0) {
        var errRecordCount = 0;
        var errSeen = {};
        for (var ie = 0; ie < validationErrors.length; ie++) {
          if (!errSeen[validationErrors[ie].studentId]) {
            errSeen[validationErrors[ie].studentId] = true;
            errRecordCount++;
          }
        }
        if (totalCount > 0) {
          var summary = '已导入 ' + totalCount + ' 条，共 ' + errRecordCount + ' 条记录 ' + validationErrors.length + ' 个字段因格式问题跳过';
          if (skippedNoStudentIdTotal > 0) {
            summary += '，' + skippedNoStudentIdTotal + ' 条因学号为空跳过';
          }
          toastTitle += '（部分字段已跳过）';
          wx.showToast({ title: toastTitle, icon: 'none', duration: 2500 });
        } else {
          var summary = '导入失败，' + errRecordCount + ' 条记录存在 ' + validationErrors.length + ' 个字段格式错误，请修正后重新导入，或开启「字段无效时仍然导入」';
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
  },

  onAdminFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    const value = field === 'inviteCode'
      ? e.detail.value.trim().toUpperCase()
      : e.detail.value.trim();

    this.setData({
      adminForm: {
        ...this.data.adminForm,
        [field]: value
      }
    });
  },

  generateInviteCode() {
    if (!this.data.canManageAdmins) {
      return;
    }

    const inviteCode = createLocalInviteCode();
    this.setData({
      adminForm: {
        ...this.data.adminForm,
        inviteCode
      },
      latestInviteCode: inviteCode
    });

    wx.showToast({
      title: '邀请码已生成',
      icon: 'success'
    });
  },

  onAdminLevelChange(e) {
    const idx = Number(e.detail.value);
    let adminLevel;
    if (this.data.isRootAdmin) {
      adminLevel = idx === 0 ? 'admin' : (idx === 1 ? 'super_admin' : 'root_admin');
    } else {
      adminLevel = idx === 0 ? 'admin' : 'super_admin';
    }
    this.setData({
      adminLevelIndex: idx,
      adminForm: {
        ...this.data.adminForm,
        adminLevel
      }
    });
  },

  onAdminCandidateKeyword(e) {
    this.refreshAdminCandidates(e.detail.value);
  },

  onAdminCandidateConfirm(e) {
    this.refreshAdminCandidates(e.detail.value);
  },

  pickAdminCandidate(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.adminCandidateList[index];
    if (!item) {
      return;
    }

    this.setData({
      adminForm: {
        ...this.data.adminForm,
        name: item.name,
        studentId: item.studentId
      }
    });

    wx.showToast({
      title: '已填入管理员信息',
      icon: 'none'
    });
  },

  editAdmin(e) {
    if (!this.data.canManageAdmins) {
      return;
    }

    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.adminList[index];
    if (!item) {
      return;
    }

    const adminLevel = item.adminLevel || 'admin';
    const idx = this.data.isRootAdmin
      ? (adminLevel === 'root_admin' ? 2 : (adminLevel === 'super_admin' ? 1 : 0))
      : (adminLevel === 'super_admin' ? 1 : 0);

    this.setData({
      adminLevelIndex: idx,
      adminForm: {
        id: item.id,
        name: item.name,
        studentId: item.studentId,
        adminLevel,
        inviteCode: item.inviteCode || ''
      },
      latestInviteCode: '',
      activeTab: 'admins'
    });
  },

  resetAdminForm() {
    this.setData({
      adminForm: emptyAdminForm(),
      adminLevelIndex: 0,
      latestInviteCode: ''
    });
  },

  startCreateAdmin() {
    if (!this.data.canManageAdmins) {
      return;
    }

    this.resetAdminForm();
    this.setData({ activeTab: 'admins' });
  },

  async saveAdmin() {
    if (!this.data.canManageAdmins) {
      return;
    }

    const form = this.data.adminForm;
    if (!form.name || !form.studentId) {
      wx.showToast({
        title: '请填写管理员姓名和学号',
        icon: 'none'
      });
      return;
    }

    let inviteCode = String(form.inviteCode || '').trim().toUpperCase();
    if (!inviteCode) {
      inviteCode = createLocalInviteCode();
      this.setData({
        adminForm: {
          ...this.data.adminForm,
          inviteCode
        },
        latestInviteCode: inviteCode
      });
    }

    this.setLoading('saveAdmin', true);
    try {
      const result = await this.callCloud('saveAdmin', {
        ...form,
        inviteCode
      });
      if (result.status !== 'success') {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        });
        return;
      }

      this.resetAdminForm();
      this.setData({
        latestInviteCode: result.inviteCode || ''
      });
      await this.loadAdminList();
      wx.showToast({
        title: '管理员已保存',
        icon: 'success'
      });
    } catch (error) {
      wx.showToast({
        title: '保存管理员失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('saveAdmin', false);
    }
  },

  async exportAdmins() {
    if (!this.data.isSuperAdmin && !this.data.isRootAdmin) {
      return;
    }

    this.setLoading('exportAdmins', true);
    try {
      const result = await this.callCloud('exportAdmins');
      if (result.status !== 'success' || !result.csvContent) {
        wx.showToast({
          title: result.message || '导出失败',
          icon: 'none'
        });
        return;
      }

      const filePath = `${wx.env.USER_DATA_PATH}/admin_info_export_${Date.now()}.csv`;
      await new Promise((resolve, reject) => {
        wx.getFileSystemManager().writeFile({
          filePath,
          data: result.csvContent,
          encoding: 'utf8',
          success: resolve,
          fail: reject
        });
      });

      wx.openDocument({
        filePath,
        fileType: 'csv',
        showMenu: true,
        fail: () => {
          wx.showToast({
            title: '已导出到本地文件',
            icon: 'none'
          });
        }
      });
    } catch (error) {
      wx.showToast({
        title: '导出管理员失败',
        icon: 'none'
      });
    } finally {
      this.setLoading('exportAdmins', false);
    }
  },


  deleteAdmin(e) {
    if (!this.data.canManageAdmins) {
      return;
    }

    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除管理员',
      content: '删除后如果没有其他至高权限管理员，将被阻止。是否继续？',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          const result = await this.callCloud('deleteAdmin', { id });
          if (result.status !== 'success') {
            wx.showToast({
              title: result.message || '删除失败',
              icon: 'none'
            });
            return;
          }
          await this.loadAdminList();
          wx.showToast({
            title: '管理员已删除',
            icon: 'success'
          });
        } catch (error) {
          wx.showToast({
            title: '删除管理员失败',
            icon: 'none'
          });
        }
      }
    });
  },

  // ─── Publication Management (类别-条款层级架构) ───

  async loadPublicationData(activityId) {
    if (!activityId) {
      this.setData({ publicationForm: { id: '', activityId: '', activityName: '', isPublished: false }, pubViewRuleList: [], pubMeritRuleList: [], designationList: [] });
      return;
    }
    this.setLoading('publications', true);
    try {
      const result = await this.callCloud('getResultPublication', { activityId });
      if (result.status === 'success') {
        const pub = result.publication;
        const viewRules = result.viewRules || [];
        const meritRules = result.meritRules || [];
        this.setData({
          publicationForm: pub ? { id: pub.id, activityId: pub.activityId, activityName: this.data.publicationForm.activityName, isPublished: pub.isPublished } : { id: '', activityId, activityName: this.data.publicationForm.activityName, isPublished: false },
          pubViewRuleList: viewRules, pubViewRuleListView: viewRules,
          pubMeritRuleList: meritRules, pubMeritRuleListView: meritRules,
          designationList: result.meritListDesignations || [],
          pubViewRuleSelectedIds: {}, pubViewRuleAllSelected: false,
          pubMeritRuleSelectedIds: {}, pubMeritRuleAllSelected: false
        });
        this.rebuildPubViewRuleFilters(viewRules);
        this.rebuildPubMeritRuleFilters(meritRules);
      }
    } catch (e) { console.error('loadPublicationData error:', e); }
    this.setLoading('publications', false);
  },

  // ─── Merit list summary (Feature 5) ───
  async loadMeritListSummary() {
    const activityId = this.data.publicationForm.activityId;
    if (!activityId) return;
    try {
      const result = await this.callCloud('getMeritListSummary', { activityId });
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
    } catch (e) { console.error('loadMeritListSummary error:', e); }
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
      if (result.status === 'success' && result.csv) {
        // Copy CSV to clipboard or use file system
        wx.setClipboardData({ data: result.csv, success: () => {
          wx.showToast({ title: `已复制 ${result.rowCount} 条记录`, icon: 'success' });
        }});
      } else {
        wx.showToast({ title: result.message || '导出失败', icon: 'none' });
      }
    } catch (e) { wx.showToast({ title: '导出失败', icon: 'none' }); }
    this.setLoading('exportMeritSummary', false);
  },

  // ─── Grade band expand/collapse (Feature 4) ───
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

  // ─── Publication toggle ───
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
        this.setData({ 'publicationForm.id': result.publication.id, 'publicationForm.isPublished': result.publication.isPublished });
      } else { if (!isSilent) wx.showToast({ title: result.message || '保存失败', icon: 'none' }); }
    } catch (e) { if (!isSilent) wx.showToast({ title: '保存失败', icon: 'none' }); }
    this.setLoading('savePublication', false);
  },

  // ─── View Rule Filters ───
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

  // ─── View Rule Category CRUD ───
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
    wx.showModal({ title: '确认删除', content: '确定要删除该查看权限类别及所有条款吗？', success: async (res) => { if (!res.confirm) return; try { const r = await that.callCloud('deletePubViewRule', { ruleId }); if (r.status === 'success') { wx.showToast({ title: '已删除', icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } else { wx.showToast({ title: r.message || '删除失败', icon: 'none' }); } } catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }); } } });
  },

  // ─── View Rule Clause Editor ───
  openPubViewClauseEditor() { this.setData({ 'pubViewRuleForm.isClauseEditorVisible': true, 'pubViewRuleForm.clauseEditingIndex': -1, 'pubViewRuleForm.clauseScopeType': 'own_results', 'pubViewRuleForm.clauseScopeLabel': '仅查看自己的评分结果', 'pubViewRuleForm.clauseTargetIdentityId': '', 'pubViewRuleForm.clauseTargetIdentity': '', 'pubViewRuleForm.clauseDisplayMode': 'score', 'pubViewRuleForm.clauseGradeBands': [] }); },
  cancelPubViewClauseEdit() { this.setData({ 'pubViewRuleForm.isClauseEditorVisible': false, 'pubViewRuleForm.clauseEditingIndex': -1 }); },
  onPubViewClauseScopeChange(e) { const scope = this.data.viewScopeOptions[parseInt(e.detail.value, 10)]; if (scope) this.setData({ 'pubViewRuleForm.clauseScopeType': scope.value, 'pubViewRuleForm.clauseScopeLabel': scope.label }); },
  onPubViewClauseTargetIdentChange(e) { const ident = this.data.identityList[parseInt(e.detail.value, 10)]; if (ident) this.setData({ 'pubViewRuleForm.clauseTargetIdentityId': ident.id, 'pubViewRuleForm.clauseTargetIdentity': ident.name }); },

  // ─── Per-clause display mode & grade band handlers ───
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
    wx.showModal({ title: '批量删除', content: `确定要删除选中的 ${ids.length} 个查看权限类别吗？`, success: async (res) => { if (!res.confirm) return; for (const id of ids) { try { await that.callCloud('deletePubViewRule', { ruleId: id }); } catch (e) {} } wx.showToast({ title: `已删除 ${ids.length} 个`, icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } });
  },

  // ─── Merit Rule Category CRUD ───
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
    wx.showModal({ title: '确认删除', content: '确定要删除该评优指定权类别及所有条款吗？关联的评优名单也会被清空。', success: async (res) => { if (!res.confirm) return; try { const r = await that.callCloud('deletePubMeritRule', { ruleId }); if (r.status === 'success') { wx.showToast({ title: '已删除', icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } else { wx.showToast({ title: r.message || '删除失败', icon: 'none' }); } } catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }); } } });
  },

  // ─── Merit Rule Clause Editor ───
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
    wx.showModal({ title: '批量删除', content: `确定要删除选中的 ${ids.length} 个评优指定权类别吗？`, success: async (res) => { if (!res.confirm) return; for (const id of ids) { try { await that.callCloud('deletePubMeritRule', { ruleId: id }); } catch (e) {} } wx.showToast({ title: `已删除 ${ids.length} 个`, icon: 'success' }); that.loadPublicationData(that.data.publicationForm.activityId); } });
  },

  // ─── Generate default categories ───
  async generatePubViewRules() {
    const pubId = this.data.publicationForm.id;
    if (!pubId) { wx.showToast({ title: '请先选择活动，公示记录将自动创建', icon: 'none' }); return; }
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
    if (!pubId) { wx.showToast({ title: '请先选择活动，公示记录将自动创建', icon: 'none' }); return; }
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

  // ─── Designation Picker (uses clauseId) ───
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
    if (field === 'department') this.setData({ desigFilterDept: value }); else this.setData({ desigFilterIdent: value });
    this.setData({ designationPickerFilteredList: this.applyDesigFilters() });
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
  // ─── Batch category creation (replaces old batch form) ───
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

  // Batch save: create a pubViewRule for each selected category
  async batchSavePubViewRules() {
    const pubId = this.data.publicationForm.id;
    if (!pubId) { wx.showToast({ title: '请先保存公示设置', icon: 'none' }); return; }
    // Use the current view clauses as template
    const templateClauses = (this.data.pubViewRuleForm.clauses || []).map(c => ({ scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, displayMode: c.displayMode || 'score', gradeBands: c.displayMode === 'grade' ? (c.gradeBands || []) : [] }));
    this.buildPubScorerCategoryList();
    const selected = this.data.pubBatchFilteredList.filter(item => this.data.pubBatchSelectedKeys[item.key]);
    if (!selected.length) { wx.showToast({ title: '请选择至少一个类别（需先在列表中勾选）', icon: 'none' }); return; }
    this.setLoading('batchSavePubViewRules', true);
    let count = 0;
    for (const item of selected) {
      try {
        const res = await this.callCloud('savePubViewRule', { publicationId: pubId, granteeDepartmentId: item.departmentId, granteeIdentityId: item.identityId, clauses: templateClauses });
        if (res.status === 'success') count++;
      } catch (e) {}
    }
    wx.showToast({ title: `已批量授权 ${count} 个类别`, icon: 'success' });
    this.setLoading('batchSavePubViewRules', false);
    this.loadPublicationData(this.data.publicationForm.activityId);
  },

  // Batch save: create a pubMeritRule for each selected category
  async batchSavePubMeritRules() {
    const pubId = this.data.publicationForm.id;
    if (!pubId) { wx.showToast({ title: '请先保存公示设置', icon: 'none' }); return; }
    const templateClauses = (this.data.pubMeritRuleForm.clauses || []).map(c => ({ scopeType: c.scopeType, targetIdentityId: c.targetIdentityId, quotaLimit: c.quotaLimit || 0, requireExactQuota: c.requireExactQuota || false }));
    this.buildPubScorerCategoryList();
    const selected = this.data.pubBatchFilteredList.filter(item => this.data.pubBatchSelectedKeys[item.key]);
    if (!selected.length) { wx.showToast({ title: '请选择至少一个类别', icon: 'none' }); return; }
    this.setLoading('batchSavePubMeritRules', true);
    let ok = 0, err = 0;
    for (const item of selected) {
      try {
        const res = await this.callCloud('savePubMeritRule', { publicationId: pubId, granteeDepartmentId: item.departmentId, granteeIdentityId: item.identityId, clauses: templateClauses });
        if (res.status === 'success') ok++; else err++;
      } catch (e) { err++; }
    }
    let msg = `成功 ${ok} 个`; if (err > 0) msg += `，${err} 个失败`;
    wx.showToast({ title: msg, icon: ok > 0 ? 'success' : 'none' });
    this.setLoading('batchSavePubMeritRules', false);
    this.loadPublicationData(this.data.publicationForm.activityId);
  }
});
