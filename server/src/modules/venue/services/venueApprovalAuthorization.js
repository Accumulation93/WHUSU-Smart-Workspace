const stepModel = require('../models/venueApprovalFlowStep');
const { evaluateVenueApprovalStep } = require('./venueApprovalPolicy');
const {
  resolveCurrentActorAssignment,
  resolveBookingApplicantAssignment,
  toRuleProfile
} = require('./venueAssignmentContext');

async function authorizeCurrentVenueApproval(booking, actor) {
  const orgId = booking && booking.approval_org_id;
  const steps = await stepModel.getByFlowId(booking.approval_flow_id, orgId);
  let effectiveActor = actor;
  if (actor && actor.type === 'user') {
    const assignment = await resolveCurrentActorAssignment(actor, orgId);
    if (!assignment) {
      effectiveActor = Object.assign({}, actor, { assignment: null, profile: null });
    } else {
      effectiveActor = Object.assign({}, actor, {
        assignment,
        profile: toRuleProfile(assignment)
      });
    }
  }
  const applicantAssignment = await resolveBookingApplicantAssignment(booking);
  const result = evaluateVenueApprovalStep({
    booking,
    actor: effectiveActor,
    steps,
    applicantHrInfo: applicantAssignment ? toRuleProfile(applicantAssignment) : null
  });
  return Object.assign({}, result, { actor: effectiveActor, applicantAssignment });
}

module.exports = { authorizeCurrentVenueApproval };
