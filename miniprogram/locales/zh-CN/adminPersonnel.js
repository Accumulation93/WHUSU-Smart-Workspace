'use strict';

module.exports = Object.freeze({
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
