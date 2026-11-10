'use strict';

// 只复用已经完成当前资源授权的事实；旧标题、描述和当前业务状态不能反推历史事件。
function eventKey(row) {
  const key = String(row.event_key || '');
  const suffix = ':' + row.recipient_type + ':' + row.recipient_id;
  return key.endsWith(suffix) ? key.slice(0, -suffix.length) : key;
}

function fromPrepared(row, prepared) {
  const key = eventKey(row);
  if (row.type === 'calendar_reminder') {
    return Object.assign({}, prepared.calendarFacts && prepared.calendarFacts.get(key) || {});
  }
  if (row.type === 'score_activity_started' || row.type === 'score_deadline_24h') {
    return Object.assign({}, prepared.scoringFacts && prepared.scoringFacts.get(row.target_id) || {});
  }
  if (row.type === 'account_security' && /^account-security:wechat-recovered:[A-Za-z0-9_-]+$/.test(key)) {
    return { event: { subtype: 'wechat_recovered' } };
  }
  return {};
}

function grouped(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const values = result.get(row[key]) || [];
    values.push(row);
    result.set(row[key], values);
  }
  return result;
}

function iso(value) {
  return require('../../../utils/dateTime').toIsoUtc(value) || undefined;
}

async function project(connection, rows, actor, organizationId, access, prepared) {
  const facts = new Map(rows.map(row => [row.id, fromPrepared(row, prepared)]));
  const idsFor = types => [...new Set(rows.filter(row => types.includes(row.type)).map(row => row.target_id).filter(Boolean))];
  const allowed = (type, id, business, resource = {}) => Boolean(access.detailAllowed && access.detailAllowed({
    ...resource, id, type, organizationId
  }, business));
  const auditIds = idsFor(['submission_approved', 'submission_progress', 'submission_rejected']);
  if (auditIds.length) {
    const [submissions] = await connection.query(`SELECT s.id,s.title,s.submission_number,s.status,s.current_step_index,s.submitted_assignment_id,s.submitted_context_snapshot,h.name AS submitter_name
      FROM audit_submissions s LEFT JOIN hr_info h ON h.id=s.submitted_by AND h.org_id=s.org_id WHERE s.org_id=? AND s.id IN (?)`, [organizationId, auditIds]);
    const [steps] = await connection.query('SELECT submission_id,round,sort_order,step_name,status,processed_assignment_id,processed_context_snapshot FROM audit_submission_steps WHERE org_id=? AND submission_id IN (?)', [organizationId, auditIds]);
    const [events] = await connection.query('SELECT submission_id,round,step_index,event_type,operator_assignment_id,operator_context_snapshot,comment FROM audit_events WHERE org_id=? AND submission_id IN (?)', [organizationId, auditIds]);
    const stepGroups = grouped(steps, 'submission_id'), eventGroups = grouped(events, 'submission_id');
    const { eventMatchesAssignment, submissionMatchesSubmitterAssignment } = require('../services/auditHistoryScope');
    const records = new Map(submissions.map(value => [value.id, value]));
    for (const row of rows.filter(value => auditIds.includes(value.target_id))) {
      const submission = records.get(row.target_id);
      if (!submission) continue;
      const allSteps = stepGroups.get(submission.id) || [], allEvents = eventGroups.get(submission.id) || [];
      const related = submissionMatchesSubmitterAssignment(submission, actor.assignmentId)
        || allEvents.some(value => ['approve', 'reject'].includes(value.event_type) && eventMatchesAssignment(value, allSteps, actor.assignmentId));
      if (!allowed('audit.submissions', submission.id, related)) continue;
      const value = { businessTitle: submission.title || '', businessNumber: submission.submission_number || '', current: { status: submission.status } };
      if (submission.submitter_name) value.submitterName = submission.submitter_name;
      const currentRound = Math.max(0, ...allSteps.map(step => Number(step.round) || 1));
      const current = allSteps.find(step => Number(step.round) === currentRound && Number(step.sort_order) === Number(submission.current_step_index));
      if (current && submission.status === 'in_progress') Object.assign(value.current, { stepOrder: Number(current.sort_order), stepName: current.step_name || '' });
      const prefix = 'audit:' + submission.id + ':';
      const parts = eventKey(row).startsWith(prefix) ? eventKey(row).slice(prefix.length).split(':') : [];
      const round = Number(parts[0]), order = Number(parts[1]);
      const step = allSteps.find(item => Number(item.round) === round && Number(item.sort_order) === order);
      const action = parts[2] === 'rejected' ? 'reject' : 'approve';
      const event = allEvents.find(item => Number(item.round) === round && Number(item.step_index) === order && item.event_type === action);
      if (parts.length === 3 && row.type === 'submission_' + parts[2] && step && event) {
        value.event = { roundOrder: round };
        if (action === 'reject') Object.assign(value.event, { rejectedStepOrder: order, rejectedStepName: step.step_name || '', reason: event.comment || '' });
        else {
          Object.assign(value.event, { completedStepOrder: order, completedStepName: step.step_name || '' });
          // 当前事件没有保存明确的转交步骤，不能从后续步骤或当前进度补造历史转交。
        }
      }
      facts.set(row.id, value);
    }
  }
  const bookingIds = idsFor(['booking_approved', 'booking_rejected', 'booking_cancelled']);
  if (bookingIds.length) {
    const [bookings] = await connection.query(`SELECT b.*,v.name AS venue_name,v.is_active AS venue_active FROM venue_bookings b JOIN venues v ON v.id=b.venue_id
      WHERE (b.creator_org_id=? OR b.approval_org_id=?) AND b.id IN (?)`, [organizationId, organizationId, bookingIds]);
    const records = new Map(bookings.map(value => [value.id, value]));
    const { resource } = require('../../venue/models/venueBookingResource');
    for (const row of rows.filter(value => bookingIds.includes(value.target_id))) {
      const booking = records.get(row.target_id);
      if (!booking) continue;
      const owned = actor.assignmentId && booking.creator_assignment_id === actor.assignmentId && booking.creator_person_id === actor.personId;
      // 组织关联只在场地安排入口完整授权时成立；本人借用读取不依赖场地当前开放状态。
      const related = owned || (booking.venue_active && ['approved', 'pending'].includes(booking.status)
        && (booking.creator_org_id === organizationId || booking.approval_org_id === organizationId)
        && allowed('venue.schedule', booking.venue_id, true) && allowed('venue.resources', booking.venue_id, true));
      if (!allowed('venue.bookings', booking.id, related, resource(booking, organizationId))) continue;
      const value = { businessTitle: booking.title || '', venueName: booking.venue_name || '',
        startTime: iso(booking.time_start), endTime: iso(booking.time_end), current: { status: booking.status } };
      const snapshot = require('../services/auditHistoryScope').snapshotAssignmentId(booking.creator_context_snapshot);
      if (snapshot && snapshot === booking.creator_assignment_id) {
        const stored = require('../services/auditAssignmentContext').parseSnapshot(booking.creator_context_snapshot);
        if (stored.personName && stored.personId === booking.creator_person_id) value.applicantName = stored.personName;
      }
      facts.set(row.id, value);
    }
  }
  const profileIds = idsFor(['hr_profile_approved', 'hr_profile_rejected']);
  if (profileIds.length) {
    const [profiles] = await connection.query(`SELECT r.id,r.hr_id,r.name,r.audit_status,r.rejection_reason,r.reviewed_at,
      m.person_id FROM hr_profile_records r JOIN organization_memberships m ON m.legacy_hr_id=r.hr_id AND m.org_id=r.org_id
      WHERE r.org_id=? AND r.hr_id IN (?) AND m.status='active'`, [organizationId, profileIds]);
    const records = new Map(profiles.map(value => [value.hr_id, value]));
    for (const row of rows.filter(value => profileIds.includes(value.target_id))) {
      const record = records.get(row.target_id);
      // 本人资料是独立读取入口；他人的审核结果仍须资料审核权限，且姓名也受字段授权约束。
      if (!record || record.person_id !== actor.personId) continue;
      const value = { memberName: record.name || '', current: { status: record.audit_status } };
      const reviewed = iso(record.reviewed_at);
      const prefix = 'hr-profile-review:' + record.id + ':';
      const rawDate = eventKey(row).startsWith(prefix) ? eventKey(row).slice(prefix.length) : '';
      if (reviewed && iso(rawDate) === reviewed) value.event = { status: record.audit_status, reason: record.rejection_reason || '' };
      facts.set(row.id, value);
    }
  }
  const migrationIds = idsFor(['hr_profile_migration']);
  if (migrationIds.length) {
    const [migrations] = await connection.query(`SELECT m.id,m.status,s.name AS source_name,t.name AS target_name
      FROM org_hr_profile_migrations m JOIN organizations s ON s.id=m.source_org_id JOIN organizations t ON t.id=m.target_org_id
      WHERE (m.source_org_id=? OR m.target_org_id=?) AND m.id IN (?)`, [organizationId, organizationId, migrationIds]);
    const records = new Map(migrations.map(value => [value.id, value]));
    for (const row of rows.filter(value => migrationIds.includes(value.target_id))) {
      const record = records.get(row.target_id);
      if (!record || !allowed('hr.profileMigration', record.id, false)) continue;
      // 旧迁移通知没有可校验的事件状态，仅投影权威当前状态，不猜测通知产生原因。
      facts.set(row.id, { sourceOrganizationName: record.source_name, targetOrganizationName: record.target_name, current: { status: record.status } });
    }
  }
  const publicationIds = idsFor(['score_results_published']);
  if (publicationIds.length) {
    const [publications] = await connection.query(`SELECT p.id,a.name FROM result_publications p JOIN score_activities a ON a.id=p.activity_id AND a.org_id=p.org_id
      WHERE p.org_id=? AND p.id IN (?) AND p.is_published=1`, [organizationId, publicationIds]);
    const [rules] = await connection.query(`SELECT v.publication_id FROM pub_view_rules v JOIN membership_assignments a
      ON a.org_id=v.org_id AND a.department_id=v.grantee_department_id AND a.identity_id=v.grantee_identity_id AND a.status='active'
      JOIN organization_memberships m ON m.id=a.membership_id AND m.org_id=a.org_id AND m.status='active'
      WHERE v.org_id=? AND v.publication_id IN (?) AND a.id=? AND m.person_id=?
        AND EXISTS (SELECT 1 FROM pub_view_rule_clauses c WHERE c.rule_id=v.id AND c.org_id=v.org_id)`, [organizationId, publicationIds, actor.assignmentId || '', actor.personId]);
    const related = new Set(rules.map(value => value.publication_id));
    const records = new Map(publications.map(value => [value.id, value]));
    for (const row of rows.filter(value => publicationIds.includes(value.target_id))) {
      const record = records.get(row.target_id);
      if (record && related.has(record.id) && allowed('scoring.publishedResults', record.id, true)) facts.set(row.id, { businessTitle: record.name || '' });
    }
  }
  const timed = rows.filter(row => {
    const value = facts.get(row.id) || {};
    return ['booking_approved', 'booking_rejected', 'booking_cancelled'].includes(row.type) && (value.startTime || value.endTime);
  });
  if (timed.length) {
    let reviews;
    try {
      [reviews] = await connection.query(`SELECT table_name,column_name,primary_record_id,raw_value FROM absolute_time_record_reviews
        WHERE migration_key=? AND review_status='review_required' AND primary_record_id IN (?)`,
      ['20260823190000', [...new Set(timed.map(row => row.target_id))]]);
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      reviews = [];
    }
    for (const row of timed) {
      const value = facts.get(row.id);
      for (const [field, column] of [['startTime', 'time_start'], ['endTime', 'time_end']]) {
        if (reviews.some(review => review.table_name === 'venue_bookings' && review.primary_record_id === row.target_id
          && review.column_name === column && iso(review.raw_value) === iso(value[field]))) value[field + 'ReviewStatus'] = 'review_required';
      }
    }
  }
  return rows.map(row => ({ ...row, displayFacts: facts.get(row.id) || {} }));
}

module.exports = { eventKey, fromPrepared, project, iso };
