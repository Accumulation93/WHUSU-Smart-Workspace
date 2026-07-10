// Auto-extracted pure utilities and constants from admin.js
// These functions have NO Page 'this' context — they are pure data transforms.
// All constants and factories used by admin.js and behaviors are here.

const STORAGE_KEY = 'roleProfiles';
const TAB_LIST = ['activities', 'templates', 'rules', 'results', 'hrInfo', 'departments', 'workGroups', 'identities', 'admins', 'settings', 'publications', 'auditTemplates', 'auditStamps', 'auditSubmissions', 'auditVerification'];
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
  let v = String(value || '').trim();
  if (!v) return null;

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD with optional time
  let m1 = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m1) {
    let year = Number(m1[1]);
    let month = Number(m1[2]);
    let day = Number(m1[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let dt = new Date(year, month - 1, day);
      if (dt.getFullYear() === year && dt.getMonth() + 1 === month && dt.getDate() === day) {
        return { year: year, month: month, day: day };
      }
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  let m2 = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m2) {
    let d = Number(m2[1]);
    let mo = Number(m2[2]);
    let y = Number(m2[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let dt2 = new Date(y, mo - 1, d);
      if (dt2.getFullYear() === y && dt2.getMonth() + 1 === mo && dt2.getDate() === d) {
        return { year: y, month: mo, day: d };
      }
    }
  }

  // Fallback to native Date
  let d3 = new Date(v);
  if (!isNaN(d3.getTime()) && d3.getFullYear() > 1900) {
    return { year: d3.getFullYear(), month: d3.getMonth() + 1, day: d3.getDate() };
  }
  let d4 = new Date(v.replace(' ', 'T'));
  if (!isNaN(d4.getTime()) && d4.getFullYear() > 1900) {
    return { year: d4.getFullYear(), month: d4.getMonth() + 1, day: d4.getDate() };
  }
  return null;
}

function detectFieldTypeFromValues(values) {
  let nonEmpty = (values || []).filter(function (v) { return String(v || '').trim() !== ''; });
  if (!nonEmpty.length) return 'text';

  let allDate = true;
  let allPhone = true;
  let allEmail = true;
  let allNumber = true;

  for (let i = 0; i < nonEmpty.length; i++) {
    let v = String(nonEmpty[i]).trim();
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

let EMPTY_VALUE_ALIASES = ['null', 'NULL', 'Null', '无', '空', 'N/A', 'NA', 'n/a', 'na', '-', '—', 'none', 'None', '/', '\\'];

function normalizeEmptyValue(value) {
  let v = String(value == null ? '' : value).trim();
  if (!v) return '';
  if (EMPTY_VALUE_ALIASES.indexOf(v) !== -1) return '';
  return v;
}

function getFieldTypeDisplayName(fieldDef) {
  let ft = (fieldDef && fieldDef.type) || 'text';
  let option = PROFILE_FIELD_TYPE_OPTIONS.find(function (item) { return item.value === ft; });
  return option ? option.label : '文本';
}

function getFieldTypeLabelForTarget(target, templateFields) {
  if (!target || target === 'ignore') return '—';
  if (target === 'name' || target === 'studentId' || target === 'department'
      || target === 'identity' || target === 'workGroup') {
    return '文本';
  }
  let fields = templateFields || [];
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].id === target) return getFieldTypeDisplayName(fields[i]);
  }
  return '文本';
}

function validateCsvValueAgainstField(value, fieldDef) {
  let v = normalizeEmptyValue(value);
  let fieldType = (fieldDef && fieldDef.type) || 'text';
  let typeLabel = getFieldTypeDisplayName(fieldDef);

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
    let num = Number(v);
    if (!isFinite(num)) return { ok: false, reason: '不是有效数字', fieldType: typeLabel };
    if (fieldDef.numberRule === 'length_range') {
      let nlen = String(v).replace(/^[+-]/, '').replace('.', '').length;
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
    let optionsArr = [];
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
  let sa = String(a || '').trim().toLowerCase();
  let sb = String(b || '').trim().toLowerCase();
  if (!sa || !sb) return 0;
  let setA = {}, setB = {};
  for (let i = 0; i < sa.length; i++) { setA[sa[i]] = true; }
  for (let i = 0; i < sb.length; i++) { setB[sb[i]] = true; }
  let intersection = 0, union = 0;
  let seen = {};
  for (let k in setA) { seen[k] = true; }
  for (let k in setB) { seen[k] = true; }
  for (let k in seen) {
    if (setA[k] && setB[k]) intersection++;
    union++;
  }
  return union === 0 ? 0 : intersection / union;
}

function autoMapCsvColumn(headerName, templateFields) {
  let h = String(headerName || '').trim().toLowerCase();
  if (!h) return 'ignore';
  let MIN_SIMILARITY = 0.4;

  let basicCandidates = [
    { target: 'name', aliases: ['姓名', 'name'] },
    { target: 'studentId', aliases: ['学号', 'studentid', 'student id'] },
    { target: 'department', aliases: ['所属部门', '部门', '学院', 'department'] },
    { target: 'identity', aliases: ['身份', 'identity'] },
    { target: 'workGroup', aliases: ['工作分工', '职能组', '职能', 'workgroup', 'work group'] }
  ];

  function scoreCandidates(candidates, source) {
    let best = null;
    for (let i = 0; i < candidates.length; i++) {
      let cand = candidates[i];
      let aliases = cand.aliases || [cand.label || ''];
      for (let j = 0; j < aliases.length; j++) {
        let alias = String(aliases[j] || '').trim().toLowerCase();
        if (!alias) continue;
        let score = 0;
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

  let bestBasic = scoreCandidates(basicCandidates, 'basic');

  let extCandidates = [];
  let fields = templateFields || [];
  for (let i = 0; i < fields.length; i++) {
    extCandidates.push({ target: fields[i].id, aliases: [fields[i].label] });
  }
  let bestExt = scoreCandidates(extCandidates, 'ext');

  let winner = null;
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
  let labels = ['— 忽略 —', '→ 姓名（基础字段）', '→ 学号（基础字段）', '→ 所属部门（基础字段）', '→ 身份（基础字段）', '→ 工作分工（基础字段）'];
  let values = ['ignore', 'name', 'studentId', 'department', 'identity', 'workGroup'];
  let fields = templateFields || [];
  for (let i = 0; i < fields.length; i++) {
    labels.push('→ ' + fields[i].label + '（扩展字段）');
    values.push(fields[i].id);
  }
  return { labels: labels, values: values };
}

function getOptionIndex(values, target) {
  for (let i = 0; i < values.length; i++) {
    if (values[i] === target) return i;
  }
  return 0;
}

function buildCsvColumnMapping(headers, samples, templateFields) {
  let mapping = buildCsvMappingOptions(templateFields);
  let labels = mapping.labels;
  let values = mapping.values;
  let rows = [];

  for (let i = 0; i < headers.length; i++) {
    let header = headers[i];
    let sampleValues = [];
    // samples[0] = header row, samples[1..N] = data rows, aligned by index
    for (let r = 1; r < Math.min(samples.length, 6); r++) {
      let dr = samples[r] || [];
      sampleValues.push(dr[i] || '');
    }

    let target = autoMapCsvColumn(header, templateFields);
    let fieldTypeLabel = getFieldTypeLabelForTarget(target, templateFields);
    let optIdx = getOptionIndex(values, target);

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


module.exports = {
  STORAGE_KEY,
  TAB_LIST,
  TIMEZONE_OPTIONS,
  RULE_SCOPE_OPTIONS,
  VIEW_SCOPE_OPTIONS,
  VIEW_SCOPE_LABEL_MAP,
  PROFILE_EDIT_MODE_OPTIONS,
  PROFILE_FIELD_TYPE_OPTIONS,
  NUMBER_RULE_OPTIONS,
  RULE_SCOPE_LABEL_MAP,
  toNumber,
  TEMPLATE_CSV_FIELDS,
  _csvEscapeField,
  formatScoreFixed3,
  clampNumber,
  getProgressColor,
  buildProgressFillStyle,
  emptyRuleForm,
  emptyHrForm,
  createEmptyProfileField,
  emptyHrProfileTemplateForm,
  normalizeHrProfileFieldForForm,
  emptyAdminForm,
  emptyDepartmentForm,
  emptyWorkGroupForm,
  emptyIdentityForm,
  emptyActivityForm,
  createEmptyQuestion,
  normalizeTemplateQuestionForForm,
  emptyTemplateForm,
  createLocalInviteCode,
  createTemplateConfig,
  normalizeClauseForEdit,
  moveItem,
  refreshTemplateConfigSortOrder,
  getScopeLabel,
  normalizeTemplateConfigsForSave,
  buildPendingTemplateConfigForSave,
  mergePendingTemplateConfig,
  hasPendingRuleClauseDraft,
  buildRuleClausesForSave,
  buildRuleClausesForBatchApply,
  buildRuleClauseText,
  buildRuleListItem,
  markSelectedRules,
  createSelectedRuleIdMap,
  emptyRuleFilters,
  buildRuleFilterOptions,
  normalizeRuleFilters,
  filterRuleList,
  buildResultFilterOptions,
  showShortToast,
  getErrorText,
  HR_PROFILE_STATUS_OPTIONS,
  emptyHrProfileFilters,
  emptyHrProfileFilterOptions,
  getHrProfileStatusOrder,
  buildHrProfileFilterOptions,
  applyHrProfileFilters,
  emptyResultFilters,
  isValidDateString,
  getNumericLength,
  getProfileFieldTypeLabel,
  buildFieldHint,
  validateProfileField,
  tryParseDateValue,
  detectFieldTypeFromValues,
  normalizeEmptyValue,
  getFieldTypeDisplayName,
  getFieldTypeLabelForTarget,
  validateCsvValueAgainstField,
  jaccardCharSimilarity,
  autoMapCsvColumn,
  buildCsvMappingOptions,
  getOptionIndex,
  buildCsvColumnMapping
};
