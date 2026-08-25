const {
  resolveCurrentActorAssignment,
  toRuleProfile
} = require('./venueAssignmentContext');
const venueApprovalMultiFlow = require('./venueApprovalMultiFlow');

async function authorizeCurrentVenueApproval(booking, actor) {
  const orgId = booking && booking.approval_org_id;
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
  const result = await venueApprovalMultiFlow.evaluateActorEligibility(booking, effectiveActor, orgId);
  return Object.assign({}, result, { actor: result.actor || effectiveActor });
}

module.exports = { authorizeCurrentVenueApproval };
