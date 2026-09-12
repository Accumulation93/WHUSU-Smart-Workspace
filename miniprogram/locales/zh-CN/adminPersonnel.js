'use strict';

module.exports = Object.freeze({
  excelFormatTitle: 'Excel',
  excelFormatExtension: '.xlsx',
  csvFormatTitle: 'CSV',
  csvFormatExtension: '.csv',
  hrTemplateSwitchActionMove: '移入现有资料',
  hrTemplateSwitchActionHide: '隐藏保存',
  hrTemplateSwitchActionDelete: '删除现有资料',
  hrTemplateSwitchDuplicateTarget: '请为每项资料选择不同的保存位置',
  hrTemplateSwitchIncompatibleReportTitle: '部分资料无法移入',
  hrTemplateSwitchIncompatibleReportIntro: '以下字段与所选移入字段格式不匹配，无法直接移入：',
  hrTemplateSwitchIncompatibleReportHint: '可将该字段改为“隐藏保存”保留原资料，或选择“删除现有资料”；调整后重新预检。',
  hrTemplateSwitchIncompatibleReportDetailIntro: '以下资料内容无法转换为新字段类型，可返回修改后重新应用，或忽略不兼容直接应用（不兼容内容将清空）。',
  hrTemplateSwitchIncompatibleBackToEdit: '返回修改',
  hrTemplateSwitchIncompatibleApplyAnyway: '忽略不兼容并应用',
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
  dictionaryUsageDialogDescription: '该字典项仍被以下内容引用。请先处理相关配置或记录，再尝试删除。',
  dictionaryUsageTargetLabel: '当前字典项',
  dictionaryUsageCount(count) {
    return `${count} 条引用`;
  },
  dictionaryUsageClose: '知道了',
  dictionaryUsageCategories: Object.freeze({
    legacy_people: '历史人员资料',
    positions: '成员岗位',
    work_groups: '职能组',
    scoring_rules: '评分规则',
    scoring_history: '评分历史',
    publication_rules: '结果公示规则',
    audit_templates: '审核模板',
    audit_history: '审核历史',
    venue_rules: '场地借用规则',
    venue_history: '场地借用历史',
    stamp_bindings: '印章绑定',
    unknown: '其他业务内容'
  }),
  adminCandidateNoPosition: '暂未设置岗位',
  adminCandidatePositionPrefix: '岗位',
  assignmentNatureLabels: Object.freeze({
    staff: '本会岗位',
    liaison: '学院对接岗位',
    other: '其他岗位'
  })
});
