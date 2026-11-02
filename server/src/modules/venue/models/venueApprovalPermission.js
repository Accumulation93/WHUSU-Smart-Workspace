'use strict';

const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const { resource } = require('./venueBookingResource');

// 这里只叠加授权限制。调用方仍须在同一业务事务检查原审批岗位及流程资格。
async function prepare(connection, organizationId, reference) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return { require() {} };
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  return {
    require(booking) {
      if (!booking || booking.approval_org_id !== organizationId) throw authorizationError('authorization_forbidden');
      for (const action of ['read', 'approve']) {
        const decision = session.check({ capability: 'venue.bookings.' + action,
          resource: resource(booking, organizationId), businessAllowed: true, businessGranted: true, legacyAllowed: true });
        if (!decision.allowed) throw authorizationError('authorization_forbidden');
      }
    }
  };
}

module.exports = { prepare };
