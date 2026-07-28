const hrInfoModel = require('../../../core/models/hrInfo');
const stepModel = require('../models/venueApprovalFlowStep');
const { evaluateVenueApprovalStep } = require('./venueApprovalPolicy');

async function authorizeCurrentVenueApproval(booking, actor) {
  const steps = await stepModel.getByFlowId(booking.approval_flow_id);
  let applicantHrInfo = null;
  if (booking.user_hr_id) {
    applicantHrInfo = await hrInfoModel.getById(booking.user_hr_id);
  }
  return evaluateVenueApprovalStep({ booking, actor, steps, applicantHrInfo });
}

module.exports = { authorizeCurrentVenueApproval };
