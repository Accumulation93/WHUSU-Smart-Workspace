// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const sharedModule = Object.freeze({
  memberSearchPlaceholder: '搜索姓名或学号',
  excelFormatTitle: 'Excel',
  excelFormatExtension: '.xlsx',
  csvFormatTitle: 'CSV',
  csvFormatExtension: '.csv',
  hrTemplateSwitchActionMove: '移入现有资料',
  hrTemplateSwitchActionHide: '隐藏保存',
  hrTemplateSwitchActionDelete: '删除现有资料',
  hrTemplateSwitchDuplicateTarget: '请为每个资料项选择不同的目标资料项。',
  hrTemplateSwitchIncompatibleReportTitle: '部分资料无法移入',
  hrTemplateSwitchIncompatibleReportIntro: '以下资料项与目标资料项的格式不匹配，无法直接移入：',
  hrTemplateSwitchIncompatibleReportHint: '可将该项改为“隐藏保存”保留原资料，或选择“删除现有资料”；调整后重新检查。',
  hrTemplateSwitchIncompatibleReportDetailIntro: '以下资料内容不符合新资料项的格式。可返回修改；若选择清空不兼容内容后应用，下列内容将被清空。',
  hrTemplateSwitchIncompatibleBackToEdit: '返回修改',
  hrTemplateSwitchIncompatibleApplyAnyway: '清空不兼容内容并应用',
  hrTemplateSwitchIncompatibleUnnamedMember: '未命名成员',
  hrTemplateSwitchIncompatibleOriginalValue: '原值',
  hrTemplateSwitchIncompatibleEmptyValue: '（空）',
  hrTemplateSwitchIncompatiblePending: '待审核',
  hrTemplateSwitchIncompatibleRow(count, field, target) {
    return `${field} → ${target}：${count} 条资料不符合格式`;
  },
  dictionaryRetry: '重新加载',
  dictionaryLoadFailed: Object.freeze({
    departments: Object.freeze({
      title: '部门列表加载失败',
      description: '暂时无法获取部门列表，已加载的内容会继续保留。'
    }),
    identities: Object.freeze({
      title: '身份类别加载失败',
      description: '暂时无法获取身份类别，已加载的内容会继续保留。'
    }),
    workGroups: Object.freeze({
      title: '职能组列表加载失败',
      description: '暂时无法获取职能组列表，已加载的内容会继续保留。'
    })
  }),
  dictionaryUsageDialogTitle: '暂时无法删除',
  dictionaryUsageDialogDescription: '以下配置或记录仍在使用该选项。请先调整相关内容，再删除；历史记录不能直接改写。',
  dictionaryUsageTargetLabel: '待删除选项',
  dictionaryUsageCount(count) {
    return `${count} 处使用`;
  },
  dictionaryUsageClose: '我知道了',
  dictionaryUsageCategories: Object.freeze({
    legacy_people: '历史人员资料',
    positions: '成员岗位',
    work_groups: '职能组',
    scoring_rules: '评分规则',
    scoring_history: '评分历史',
    publication_rules: '结果公示规则',
    audit_templates: '审核模板',
    directory_rules: '通讯录规则',
    authorization_rules: '授权规则',
    calendar_rules: '日程安排规则',
    calendar_events: '日程记录',
    audit_history: '审核历史',
    venue_rules: '场地借用规则',
    venue_history: '场地借用历史',
    stamp_bindings: '印章使用授权',
    unknown: '其他业务内容'
  }),
  adminCandidateNoPosition: '暂未设置岗位',
  adminCandidatePositionPrefix: '岗位',
  hrProfileSelfSubmittedAt: '本人提交时间',
  hrProfileMaintainedAt: '管理员维护时间',
  hrProfileMaintainedBy: '维护管理员',
  hrProfileLastChangedAt: '资料最后变更时间',
  deletedPerson: '已删除人员',
  deletedPersonWithStudentId: '{0}（原学号 {1}）',
  assignmentNatureLabels: Object.freeze({
    staff: '本会岗位',
    liaison: '学院对接岗位',
    other: '其他岗位'
  }),
  chooseAssignmentNature: '请选择岗位性质',
  addAssignmentNature: '新增岗位性质',
  assignmentNatureName: '岗位性质名称',
  createAndSelectNature: '新增并选用',
  assignmentNatureMissing: '岗位性质未记录'
});

export default sharedModule;
