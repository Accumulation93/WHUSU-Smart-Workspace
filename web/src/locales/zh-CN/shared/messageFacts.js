// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
import home from './home.js';
// 独立语言稿：docs/copy/message-facts-editorial-20261103.md。
const sharedModule = Object.freeze({
  context: { superAdmin: home.text.superAdmin, admin: home.text.admin, noAssignment: home.text.unsetIdentity },
  todoTitles: { audit_approval: '待审批的审核申请', venue_approval: '待审批的场地借用', scoring_task: '待完成的评分', hr_profile_review: '待审核的成员资料' },
  auditPendingFrom: (name, step) => `${name} 提交的申请，第 ${step} 步等待你审批。`,
  auditPendingWithoutName: step => `第 ${step} 步等待你审批。`,
  auditPendingWithoutStep: name => `${name} 提交的申请等待你审批。`,
  auditPendingGeneric: '有一条审核申请等待你审批。',
  venuePendingFrom: name => `${name} 提交的借用等待你审批。`,
  venuePendingGeneric: '有一条场地借用等待你审批。',
  scoringPending: count => `还有 ${count} 项评分需要完成。`,
  scoringPendingGeneric: '有评分任务等待你完成。',
  profilePending: name => `${name} 提交了资料修改，等待你审核。`,
  profilePendingGeneric: '有一份成员资料等待你审核。',
  todoVenueLabel: '场地',
  todoCurrentStepLabel: '当前步骤',
  todoStepOrder: order => `第 ${order} 步`,
  notifications: {
    submission_approved: ['审核申请通过通知', '查看申请详情，了解审批结果。'],
    submission_progress: ['审核进展通知', '查看申请详情，了解当前审批进展。'],
    submission_rejected: ['审核申请驳回通知', '查看申请详情，了解驳回原因。'],
    booking_approved: ['场地借用通过通知', '查看借用详情，确认借用安排。'],
    booking_rejected: ['场地借用驳回通知', '查看借用详情，了解驳回原因。'],
    booking_cancelled: ['场地借用取消通知', '查看借用详情，了解取消情况。'],
    hr_profile_approved: ['资料审核通过通知', '查看本人资料，确认已生效的内容。'],
    hr_profile_rejected: ['资料审核驳回通知', '查看本人资料，了解需要修改的内容。'],
    hr_profile_migration: ['资料迁移通知', '查看迁移申请，了解处理结果。'],
    score_activity_started: ['评分活动开始通知', '查看评分活动，了解需要完成的任务。'],
    score_deadline_24h: ['评分截止提醒', '查看评分活动，确认截止时间和任务进度。'],
    score_results_published: ['评分结果发布通知', '查看已获授权的评分结果。'],
    calendar_reminder: ['日程提醒', '查看日程详情，确认时间和安排。'],
    account_security: ['账号安全通知', '查看账号状态和微信绑定信息。']
  },
  unknownNotificationTitle: '工作台通知',
  unknownNotificationDescription: '打开详情，查看这条通知的相关信息。',
  notificationDetailUnavailable: '这条通知暂时无法打开详情。'
});

export default sharedModule;
