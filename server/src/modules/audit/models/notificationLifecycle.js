'use strict';
const pool = require('../../../config/db');
const { memo } = require('../../../utils/requestWork');

// 新通知必须登记业务失效策略；安全告知与一般公告仍有统一的 30 天上限。
const policies = Object.freeze({
  submission_progress: 'audit', submission_approved: 'audit', submission_rejected: 'audit',
  booking_approved: 'booking', booking_rejected: 'booking', booking_cancelled: 'booking',
  calendar_reminder: 'calendar', score_activity_started: 'scoring', score_deadline_24h: 'scoring',
  score_results_published: 'publication', hr_profile_approved: 'profile', hr_profile_rejected: 'profile',
  hr_profile_migration: 'migration', account_security: 'retention', system: 'retention',
  pending_approval: 'todo'
});

// 日程每次只加载一次业务数据；按自然人核查实际参会资格，不构建通知展示列表。
async function calendarKeys(orgId, personId, now) {
  const calendar = require('../../../core/models/calendar');
  const instances = await calendar.listForActor(pool, {organizationId:orgId,personId}, {
    from:new Date(now).toISOString(), to:new Date(now + 8 * 86400000).toISOString(), export:true
  });
  const keys = [];
  let expiresAt = Infinity;
  for (const item of instances) {
    const starts = Date.parse(item.startAt), ends = Date.parse(item.endAt);
    if (ends <= now) continue;
    const due = (item.reminders || []).filter(minutes => starts - minutes * 60000 <= now);
    for (const minutes of item.reminders || []) {
      const at = starts - minutes * 60000;
      if (at > now) expiresAt = Math.min(expiresAt, at);
    }
    if (!due.length) continue;
    keys.push(['calendar', item.id, item.occurrenceDate, Math.min(...due), starts].join(':'));
    expiresAt = Math.min(expiresAt, ends);
  }
  return { keys, expiresAt };
}

async function prepare(actor, orgId) {
  const types = (await pool.query(`SELECT DISTINCT type FROM notifications
    WHERE org_id=? AND recipient_type=? AND recipient_id=? AND created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY)
      AND type IN ('calendar_reminder','score_activity_started','score_deadline_24h')`, [orgId, actor.type, actor.id]))[0];
  const present = new Set(types.map(row => row.type));
  const now = Date.now();
  const calendar = present.has('calendar_reminder')
    ? await memo('notificationCalendar:' + orgId + ':' + actor.personId, () => calendarKeys(orgId, actor.personId, now))
    : { keys: [], expiresAt: Infinity };
  const scoring = [];
  let expiresAt = calendar.expiresAt;
  if (present.has('score_activity_started') || present.has('score_deadline_24h')) {
    const data = require('./messageData');
    const { getUserScoringTask } = require('../../scoring/services/scoringTaskService');
    const users = await memo('notificationScorers:' + orgId, () => data.listBoundUsersInOrg(orgId));
    for (const user of users.filter(value => value.person_id === actor.personId && value.id === actor.id)) {
      const task = await getUserScoringTask(user, null, new Date(now), Object.assign({}, actor, { assignmentId: user.assignment_id }));
      if (task && task.pendingCount > 0) {
        scoring.push(task.activity.id);
        if (task.dueAt) expiresAt = Math.min(expiresAt, new Date(task.dueAt).getTime() + 1);
      }
    }
  }
  return { calendar: calendar.keys, scoring: [...new Set(scoring)], expiresAt };
}
module.exports = { policies, prepare, calendarKeys };
