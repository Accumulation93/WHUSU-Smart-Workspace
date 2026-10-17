// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write

const sharedModule = Object.freeze({
  auditSubmitter: '发起人本人',
  read: '查看',
  remove: '删除',
  readDescription: '查看本组织的相关记录',
  deleteDescription: '删除本组织的相关记录，仍须满足关联数据保护要求',
  auditRecordsDelete: '永久删除审核申请',
  auditRecordsDeleteDescription: '永久删除申请、所有轮次、签署记录和附件',
  venueRecordsDelete: '永久删除借用记录',
  venueRecordsDeleteDescription: '永久删除本组织可管理的借用记录及审批记录',
  deleteTitle: '永久删除记录',
  deleteBody: '确定永久删除“{0}”？相关历史和附件也会被删除，无法恢复。',
  deleteConfirm: '永久删除',
  deleted: '记录已删除',
  cleanupPending: '记录已删除，附件正在清理',
  failed: '删除失败，请重试',
  forbidden: '你没有删除这条记录的权限',
  notFound: '记录不存在或已删除',
  changed: '记录已发生变化，请重新查看后删除',
  invalid: '请重新选择要删除的记录',
  cancel: '取消',
  deletePermissions: {
    'scoring.activities': '删除评分活动',
    'scoring.templates': '删除评分模板',
    'scoring.rules': '删除评分类别',
    'scoring.publications': '删除公示规则与名单',
    'hr.people': '永久删除组织成员',
    'hr.profile_templates.manage': '删除资料模板',
    'hr.departments': '删除部门',
    'hr.identities': '删除身份类别',
    'hr.work_groups': '删除职能组',
    'audit.templates': '删除审核模板',
    'audit.stamps': '删除电子印章',
    'venue.resources': '删除场地及占用规则',
    'venue.approvals': '删除借用审批规则',
    'venue.purposes': '删除常用事由'
  }
});

export default sharedModule;
