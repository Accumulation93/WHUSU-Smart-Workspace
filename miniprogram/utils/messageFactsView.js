'use strict';

function text(value) { return typeof value === 'string' ? value : ''; }
function positive(value) { return Number.isInteger(value) && value > 0; }

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
  if (settings.notification === true) {
    const entry = Object.prototype.hasOwnProperty.call(copy.notifications, source.type) ? copy.notifications[source.type] : null;
    return { title: entry ? entry[0] : copy.unknownNotificationTitle,
      description: canOpen ? entry ? entry[1] : copy.unknownNotificationDescription : copy.notificationDetailUnavailable,
      detailLines: [], canOpen, workContextName };
  }
  const facts = source.displayFacts && typeof source.displayFacts === 'object' ? source.displayFacts : {};
  const kind = text(source.sourceType);
  let description = '';
  const detailLines = [];
  if (kind === 'audit_approval') {
    const name = text(facts.submitterName);
    description = name && positive(facts.stepOrder) ? copy.auditPendingFrom(name, facts.stepOrder)
      : name ? copy.auditPendingWithoutStep(name) : positive(facts.stepOrder) ? copy.auditPendingWithoutName(facts.stepOrder) : copy.auditPendingGeneric;
  } else if (kind === 'venue_approval') {
    description = text(facts.applicantName) ? copy.venuePendingFrom(facts.applicantName) : copy.venuePendingGeneric;
    if (text(facts.venueName)) detailLines.push({ label: copy.todoVenueLabel, value: facts.venueName });
    const step = text(facts.currentStepName) || (positive(facts.stepOrder) ? copy.todoStepOrder(facts.stepOrder) : '');
    if (step) detailLines.push({ label: copy.todoCurrentStepLabel, value: step });
  } else if (kind === 'scoring_task') {
    description = Number.isInteger(facts.pendingCount) && facts.pendingCount >= 0 ? copy.scoringPending(facts.pendingCount) : copy.scoringPendingGeneric;
  } else if (kind === 'hr_profile_review') {
    description = text(facts.businessTitle) ? copy.profilePending(facts.businessTitle) : copy.profilePendingGeneric;
  }
  const title = text(facts.businessTitle) || (Object.prototype.hasOwnProperty.call(copy.todoTitles, kind) ? copy.todoTitles[kind] : copy.unknownNotificationTitle);
  return { title, description, detailLines, canOpen, workContextName };
}

module.exports = { describeMessage, contextLabel };
