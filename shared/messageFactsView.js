'use strict';

function text(value) { return typeof value === 'string' ? value : ''; }
function messageCategory(item) {
  const source = item || {};
  return source.type === 'calendar_reminder' ? 'calendar' : text(source.category);
}
function positive(value) { return Number.isInteger(value) && value > 0; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function label(map, key, fallback) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback; }
function stepText(order, name, copy) {
  return positive(order) ? text(name) ? copy.stepNameAndOrder(order, name) : copy.todoStepOrder(order) : text(name);
}
function dateTime(value, settings, reviewStatus) {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return '';
  return typeof settings.formatDateTime === 'function' ? settings.formatDateTime(value, reviewStatus) : '';
}
function dateOnly(value, settings) {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return typeof settings.formatDate === 'function' ? settings.formatDate(value) : '';
}
function addLine(lines, label, value) { if (text(value)) lines.push({ label, value }); }
function addPeriod(lines, facts, label, copy, settings) {
  if (facts.allDay === true) {
    const start = dateOnly(facts.startDate, settings), end = dateOnly(facts.endDateInclusive, settings);
    if (start && end) addLine(lines, label, start === end ? copy.allDayDate(start) : copy.allDayDateRange(start, end));
    else if (start) addLine(lines, copy.startTimeLabel, copy.allDayDate(start));
    else if (end) addLine(lines, copy.endTimeLabel, copy.allDayDate(end));
    return;
  }
  const start = dateTime(facts.startTime, settings, facts.startTimeReviewStatus), end = dateTime(facts.endTime, settings, facts.endTimeReviewStatus);
  if (start && end) addLine(lines, label, typeof settings.formatRange === 'function'
    ? settings.formatRange(facts.startTime, facts.endTime, { startReviewStatus: facts.startTimeReviewStatus, endReviewStatus: facts.endTimeReviewStatus })
    : copy.timeRange(start, end));
  else { addLine(lines, copy.startTimeLabel, start); addLine(lines, copy.endTimeLabel, end); }
}

function contextLabel(source, copy) {
  if (source.role === 'admin' || source.identityType === 'admin') {
    return source.adminLevel === 'super_admin' ? copy.context.superAdmin : copy.context.admin;
  }
  if (source.identityType === 'membership') return copy.context.noAssignment;
  return text(source.assignmentLabel);
}

function describeMessage(item, copy, options) {
  const source = item || {};
  const settings = options || {};
  const canOpen = settings.canOpen === true;
  const workContextName = contextLabel(source, copy);
  const facts = object(source.displayFacts);
  const detailLines = [];
  if (settings.notification === true) {
    const event = object(facts.event), current = object(facts.current);
    const currentStepVisible = !text(current.status) || current.status === 'pending' || current.status === 'in_progress';
    const kind = text(source.type);
    let description = canOpen ? copy.unknownNotificationDescription : copy.unknownNotificationUnavailable;
    if (kind === 'submission_approved') description = copy.auditApproved;
    else if (kind === 'submission_progress') {
      description = positive(event.completedStepOrder) || positive(event.nextStepOrder) || text(event.completedStepName) || text(event.nextStepName) || (currentStepVisible && (positive(current.stepOrder) || text(current.stepName))) ? copy.auditProgressStatus : copy.auditProgressUnknown;
      addLine(detailLines, copy.completedStepLabel, stepText(event.completedStepOrder, event.completedStepName, copy));
      addLine(detailLines, copy.nextStepLabel, stepText(event.nextStepOrder, event.nextStepName, copy));
    } else if (kind === 'submission_rejected') {
      description = copy.auditRejected;
      addLine(detailLines, copy.rejectedStepLabel, stepText(event.rejectedStepOrder, event.rejectedStepName, copy));
    } else if (kind === 'booking_approved') description = copy.venueApproved;
    else if (kind === 'booking_rejected') description = copy.venueRejected;
    else if (kind === 'booking_cancelled') description = copy.venueCancelled;
    else if (kind === 'hr_profile_approved') description = copy.profileApproved;
    else if (kind === 'hr_profile_rejected') description = copy.profileRejected;
    else if (kind === 'hr_profile_migration') {
      const eventLabels = { pending: copy.migrationPending, executed: copy.migrationExecuted, rejected: copy.migrationRejected, cancelled: copy.migrationCancelled };
      const currentLabels = { pending: copy.migrationCurrentPending, executed: copy.migrationCurrentExecuted, rejected: copy.migrationCurrentRejected, cancelled: copy.migrationCurrentCancelled };
      description = text(event.status) ? label(eventLabels, event.status, copy.migrationUnknown)
        : text(current.status) ? label(currentLabels, current.status, copy.migrationCurrentUnknown) : copy.migrationUnknown;
      addLine(detailLines, copy.sourceOrganizationLabel, text(facts.sourceOrganizationName));
      addLine(detailLines, copy.targetOrganizationLabel, text(facts.targetOrganizationName));
    } else if (kind === 'score_activity_started') description = copy.scoringStarted;
    else if (kind === 'score_deadline_24h') {
      const eventDeadline = dateTime(event.deadline, settings, event.deadlineReviewStatus), currentDeadline = dateTime(facts.deadline, settings, facts.deadlineReviewStatus);
      description = eventDeadline || currentDeadline ? copy.scoringDeadlineAction : copy.scoringDeadlineUnknown;
      addLine(detailLines, eventDeadline ? copy.deadlineLabel : copy.currentDeadlineLabel, eventDeadline || currentDeadline);
    } else if (kind === 'score_results_published') description = copy.scoringPublished;
    else if (kind === 'calendar_reminder') {
      addPeriod(detailLines, facts, copy.scheduleTimeLabel, copy, settings);
      description = detailLines.length ? '' : copy.calendarTimeUnknown;
      if (text(facts.venueName) !== text(facts.location)) addLine(detailLines, copy.venueLabel, text(facts.venueName));
      addLine(detailLines, copy.locationLabel, text(facts.location));
    } else if (kind === 'account_security') description = event.subtype === 'wechat_recovered' ? copy.accountWechatRecovered : copy.accountSecurityUnknown;
    if (kind.startsWith('submission_')) {
      if (positive(event.roundOrder)) addLine(detailLines, copy.roundLabel, copy.roundNumber(event.roundOrder));
      const sameNextStep = positive(current.stepOrder) && current.stepOrder === event.nextStepOrder && text(current.stepName) === text(event.nextStepName);
      if (kind === 'submission_progress' && currentStepVisible && !sameNextStep) addLine(detailLines, copy.currentProgressLabel, stepText(current.stepOrder, current.stepName, copy));
    }
    if (kind.startsWith('booking_')) { addLine(detailLines, copy.venueLabel, text(facts.venueName)); addPeriod(detailLines, facts, copy.bookingTimeLabel, copy, settings); }
    if (kind === 'score_activity_started') addLine(detailLines, copy.deadlineLabel, dateTime(facts.deadline, settings, facts.deadlineReviewStatus));
    addLine(detailLines, copy.reasonLabel, text(event.reason));
    if (!canOpen) {
      if (description === copy.auditProgressUnknown) description = copy.auditProgressUnavailable;
      else if (description === copy.migrationUnknown) description = copy.migrationUnavailable;
      else if (description === copy.scoringDeadlineUnknown) description = copy.scoringDeadlineUnavailable;
      else if (description === copy.calendarTimeUnknown) description = copy.calendarTimeUnavailable;
      else if (description === copy.accountSecurityUnknown) description = copy.accountSecurityUnavailable;
    }
    if (!text(facts.businessTitle) && !text(facts.businessNumber) && ['submission_approved', 'submission_rejected', 'booking_approved', 'booking_rejected', 'booking_cancelled', 'hr_profile_approved', 'hr_profile_rejected', 'score_activity_started', 'score_results_published'].includes(kind)) description = '';
    return { title: text(facts.businessTitle) || text(facts.businessNumber) || label(copy.notificationTitles, kind, copy.unknownNotificationTitle),
      description, detailLines, canOpen, workContextName };
  }
  const kind = text(source.sourceType);
  let description = '';
  if (kind === 'audit_approval') {
    const name = text(facts.submitterName);
    description = name ? copy.auditTodoFrom(name) : copy.auditTodo;
    addLine(detailLines, copy.currentStepLabel, stepText(facts.currentStepOrder || facts.stepOrder, facts.currentStepName, copy));
  } else if (kind === 'venue_approval') {
    description = text(facts.applicantName) ? copy.venueTodoFrom(facts.applicantName) : copy.venueTodo;
    addLine(detailLines, copy.venueLabel, text(facts.venueName));
    addLine(detailLines, copy.currentStepLabel, stepText(facts.currentStepOrder || facts.stepOrder, facts.currentStepName, copy));
    addPeriod(detailLines, facts, copy.bookingTimeLabel, copy, settings);
  } else if (kind === 'scoring_task') {
    description = positive(facts.pendingCount) ? copy.scoringTodo(facts.pendingCount) : facts.pendingCount === 0 ? copy.scoringTodoComplete : copy.scoringTodoUnknown;
    addLine(detailLines, copy.deadlineLabel, dateTime(facts.deadline, settings, facts.deadlineReviewStatus));
  } else if (kind === 'hr_profile_review') {
    description = text(facts.memberName) ? copy.profileTodo(facts.memberName) : copy.profileTodoUnknown;
  }
  const title = text(facts.businessTitle) || (Object.prototype.hasOwnProperty.call(copy.todoTitles, kind) ? copy.todoTitles[kind] : copy.unknownNotificationTitle);
  if (!text(facts.businessTitle) && ((kind === 'audit_approval' && !text(facts.submitterName)) || (kind === 'venue_approval' && !text(facts.applicantName)) || (kind === 'hr_profile_review' && !text(facts.memberName)))) description = '';
  return { title, description, detailLines, canOpen, workContextName };
}

module.exports = { describeMessage, contextLabel, messageCategory };
