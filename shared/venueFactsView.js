'use strict';

function createVenueFactsView(copy, statusCopy, occupiedText) {
  function step(item, definitionIndex) {
    if (!item || typeof item !== 'object') return item;
    const facts = item && item.displayFacts || {};
    const index = Number.isInteger(item.stepIndex) ? item.stepIndex : definitionIndex;
    return Object.assign({}, item, { stepName: facts.stepName || (Number.isInteger(index) && index >= 0
      ? copy.defaultStepName(index + 1) : copy.stepNameMissing) });
  }
  function event(item) {
    if (!item || typeof item !== 'object') return item;
    const facts = item && item.displayFacts || {};
    return Object.assign({}, step(item), {
      approverName: facts.approverName || copy.approverMissing,
      approverAssignmentLabel: facts.approverName && facts.approverType !== 'admin' ? facts.assignmentLabel || copy.assignmentMissing : ''
    });
  }
  function booking(item) {
    if (!item || typeof item !== 'object') return item;
    const facts = item.displayFacts || {};
    const anonymous = item.visibility === 'occupancy_only' || item.visibility === 'busy' || item.creatorType === 'anonymous';
    const name = anonymous ? '' : facts.creatorName || copy.nameMissing;
    const assignment = !anonymous && facts.creatorName && facts.creatorType !== 'admin'
      ? facts.assignmentLabel || copy.assignmentMissing : '';
    const result = Object.assign({}, item, {
      creatorName: name, userName: name, applicantName: name,
      creatorLabel: anonymous ? occupiedText : facts.creatorType === 'admin' ? copy.creatorAdmin
        : facts.creatorType === 'user' ? copy.creatorUser : copy.creatorUnknown,
      creatorAssignmentLabel: assignment, applicantAssignmentLabel: assignment,
      venueName: facts.venueName || copy.venueNameMissing,
      myActionLabel: item.myAction === 'rejected' ? statusCopy.copy_5d5af942c5
        : item.myAction === 'approved' ? statusCopy.copy_ce171a2581 : statusCopy.copy_4cfdf3f638
    });
    if (anonymous) result.title = occupiedText;
    if (item.approvalProgress) {
      result.approvalProgress = Object.assign({}, item.approvalProgress);
      if (Array.isArray(item.approvalProgress.flowSteps)) result.approvalProgress.flowSteps = item.approvalProgress.flowSteps.map(step);
      if (Array.isArray(item.approvalProgress.events)) result.approvalProgress.events = item.approvalProgress.events.map(event);
    }
    return result;
  }
  function response(name, value) {
    if (!value || value.status !== 'success') return value;
    const key = { listAllVenueBookings: 'bookings', listMyVenueBookings: 'bookings',
      listPendingVenueApprovals: 'pending', listVenueApprovalHistory: 'history' }[name];
    if (key && Array.isArray(value[key])) return Object.assign({}, value, { [key]: value[key].map(booking) });
    if (name === 'getVenueApprovalHistoryDetail' && value.detail) return Object.assign({}, value, { detail: booking(value.detail) });
    if (name === 'getVenueSchedule' && Array.isArray(value.dailySchedules)) {
      return Object.assign({}, value, { dailySchedules: value.dailySchedules.map(day => Object.assign({}, day,
        { bookedSlots: Array.isArray(day.bookedSlots) ? day.bookedSlots.map(booking) : [] })) });
    }
    return value;
  }
  return { booking, response };
}

module.exports = { createVenueFactsView };
