'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { project, fromPrepared } = require('../src/modules/audit/models/notificationFacts');

test('未知或缺失通知类型保留空事实，不触发业务读取', async () => {
  const rows = [{ id: 'old' }, { id: 'unknown', type: 'unknown', description: '不可直接显示' }];
  const result = await project({ async query() { throw new Error('未知类型不得读取业务'); } }, rows, {}, 'org', {}, {});
  assert.ok(result.every(row => Object.keys(row.displayFacts).length === 0));
});

test('审核批量事实使用事件轮次，拒绝当前岗位无关或明确禁止的资料', async () => {
  const queries = [];
  const connection = { async query(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('FROM audit_submissions')) return [[{ id: 'a', title: '申请', status: 'in_progress', current_step_index: 3, submitted_assignment_id: 'job' }]];
    if (sql.includes('FROM audit_submission_steps')) return [[1, 2, 3].map(sort_order => ({ submission_id: 'a', round: 2, sort_order, step_name: '步骤' + sort_order }))];
    if (sql.includes('FROM audit_events')) return [[{ submission_id: 'a', round: 2, step_index: 1, event_type: 'approve' }]];
    throw new Error(sql);
  } };
  const row = { id: 'n', type: 'submission_progress', target_id: 'a', event_key: 'audit:a:2:1:progress:user:h', recipient_type: 'user', recipient_id: 'h' };
  const access = { detailAllowed: (resource, related) => related };
  const [result] = await project(connection, [row], { assignmentId: 'job' }, 'org', access, {});
  assert.deepEqual(result.displayFacts.event, { roundOrder: 2, completedStepOrder: 1, completedStepName: '步骤1' });
  assert.equal(result.displayFacts.event.nextStepOrder, undefined);
  assert.equal(result.displayFacts.current.stepOrder, 3);
  assert.equal(queries.length, 3);
  assert.ok(queries.every(query => query.params[0] === 'org'));
  const [denied] = await project(connection, [row], { assignmentId: 'other' }, 'org', access, {});
  assert.deepEqual(denied.displayFacts, {});
  const [revoked] = await project(connection, [row], { assignmentId: 'job' }, 'org', { detailAllowed: () => false }, {});
  assert.deepEqual(revoked.displayFacts, {});
  const [mismatch] = await project(connection, [{ ...row, type: 'submission_rejected' }], { assignmentId: 'job' }, 'org', access, {});
  assert.equal(mismatch.displayFacts.event, undefined);
});

test('场地事实不能用组织关系绕过场地安排限制，时间待核对逐字段保留', async () => {
  const connection = { async query(sql) {
    if (sql.includes('FROM venue_bookings')) return [[{ id: 'b', title: '借用', venue_id: 'v', venue_name: '会议室', venue_active: 1,
      creator_org_id: 'org', status: 'approved', time_start: '2026-07-01 10:00:00', time_end: '2026-07-01 11:00:00' }]];
    if (sql.includes('absolute_time_record_reviews')) return [[{ table_name: 'venue_bookings', column_name: 'time_start', primary_record_id: 'b', raw_value: '2026-07-01 10:00:00' }]];
    throw new Error(sql);
  } };
  const row = { id: 'n', type: 'booking_approved', target_id: 'b' };
  const [result] = await project(connection, [row], {}, 'org', { detailAllowed: (resource, related) => related }, {});
  assert.equal(result.displayFacts.startTime, '2026-07-01T10:00:00.000Z');
  assert.equal(result.displayFacts.startTimeReviewStatus, 'review_required');
  assert.equal(result.displayFacts.endTimeReviewStatus, undefined);
  const [denied] = await project(connection, [row], {}, 'org', { detailAllowed: (resource, related) => related && resource.type !== 'venue.schedule' }, {});
  assert.deepEqual(denied.displayFacts, {});
});

test('已授权预备事实按类型读取，不解析旧描述或伪造安全事件', () => {
  const prepared = { scoringFacts: new Map([['s', { businessTitle: '考核', deadline: '2026-11-20T00:00:00Z' }]]), calendarFacts: new Map([['calendar:key', { businessTitle: '活动', allDay: true, startDate: '2026-11-10', endDateInclusive: '2026-11-11' }]]) };
  assert.equal(fromPrepared({ type: 'score_deadline_24h', target_id: 's' }, prepared).businessTitle, '考核');
  assert.equal(fromPrepared({ type: 'calendar_reminder', event_key: 'calendar:key' }, prepared).endDateInclusive, '2026-11-11');
  assert.deepEqual(fromPrepared({ type: 'account_security', description: '微信已恢复', event_key: 'unknown' }, prepared), {});
  assert.deepEqual(fromPrepared({ type: 'account_security', event_key: 'account-security:wechat-recovered:abc' }, prepared), { event: { subtype: 'wechat_recovered' } });
});

test('资料仅本人、迁移需当前权限、公示需同岗查看规则，未知历史不猜事件', async () => {
  let queries = 0;
  let hasPublicationClause = true;
  const connection = { async query(sql, params) {
    queries += 1;
    if (sql.includes('FROM hr_profile_records')) return [[{ id: 'profile', hr_id: 'hr', person_id: 'p', name: '姓名', audit_status: 'rejected', rejection_reason: '资料不全', reviewed_at: '2026-11-10 00:00:00' }]];
    if (sql.includes('FROM org_hr_profile_migrations')) {
      assert.match(sql, /WHERE \(m.source_org_id=\? OR m.target_org_id=\?\) AND m.id IN \(\?\)/);
      assert.deepEqual(params, ['org', 'org', ['migration']]);
      return [[{ id: 'migration', status: 'executed', source_name: '来源', target_name: '目标' }]];
    }
    if (sql.includes('FROM result_publications')) return [[{ id: 'pub', name: '活动' }]];
    if (sql.includes('FROM pub_view_rules')) {
      assert.match(sql, /EXISTS \(SELECT 1 FROM pub_view_rule_clauses c WHERE c.rule_id=v.id AND c.org_id=v.org_id\)/);
      return [hasPublicationClause ? [{ publication_id: 'pub' }] : []];
    }
    throw new Error(sql);
  } };
  const rows = [{ id: 'profileNotice', type: 'hr_profile_rejected', target_id: 'hr', event_key: 'hr-profile-review:profile:2026-11-10 00:00:00' },
    { id: 'migrationNotice', type: 'hr_profile_migration', target_id: 'migration', description: '旧迁移文案' },
    { id: 'pubNotice', type: 'score_results_published', target_id: 'pub' }];
  const values = await project(connection, rows, { personId: 'p', assignmentId: 'job' }, 'org', { detailAllowed: () => true }, {});
  assert.equal(queries, 4);
  assert.equal(values[0].displayFacts.event.reason, '资料不全');
  assert.deepEqual(values[1].displayFacts, { sourceOrganizationName: '来源', targetOrganizationName: '目标', current: { status: 'executed' } });
  assert.equal(values[2].displayFacts.businessTitle, '活动');
  const denied = await project(connection, rows, { personId: 'other' }, 'org', { detailAllowed: () => false }, {});
  assert.ok(denied.every(row => Object.keys(row.displayFacts).length === 0));
  hasPublicationClause = false;
  const emptyRule = await project(connection, [rows[2]], { personId: 'p', assignmentId: 'job' }, 'org', { detailAllowed: () => true }, {});
  assert.deepEqual(emptyRule[0].displayFacts, {});
});
