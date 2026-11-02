'use strict';

// 日程参与关系与管理授权分别计算；私有日程仍只属于创建者。
function eventAuthorization(session, actor) {
  function resource(event) {
    const creator = event && event.creator;
    let assignment = null;
    if (creator && creator.organizationId === actor.organizationId && creator.assignmentId
      && creator.personId === event.creatorPersonId && creator.departmentId && creator.identityCategoryId && creator.assignmentKind) {
      assignment = { id: creator.assignmentId, organizationId: actor.organizationId, active: true,
        personId: creator.personId, natureId: creator.assignmentKind, departmentId: creator.departmentId,
        identityCategoryId: creator.identityCategoryId, workGroupId: creator.workGroupId || '' };
    }
    return { id: event ? event.id : actor.organizationId, type: 'calendar.events', organizationId: actor.organizationId,
      ownerPersonId: event ? event.creatorPersonId : actor.personId, assignment };
  }
  function can(action, event, related = false) {
    if (event && event.visibility === 'private' && event.creatorPersonId !== actor.personId) return false;
    return session.check({ capability: 'calendar.events.' + action, resource: resource(event),
      businessAllowed: true, businessGranted: related, legacyAllowed: related }).allowed;
  }
  return { can };
}

function sourceAuthorization(session, actor) {
  return (kind, action, id, related = false) => {
    const type = kind === 'venue_booking' ? 'venue.bookingParticipants' : kind === 'venue_activity' ? 'venue.activityParticipants' : null;
    if (!type) return { allowed: false, reason: 'invalid_context' };
    return session.check({ capability: type + '.' + action, resource: { id, type, organizationId: actor.organizationId },
      businessAllowed: true, businessGranted: related, legacyAllowed: false });
  };
}

module.exports = { eventAuthorization, sourceAuthorization };
