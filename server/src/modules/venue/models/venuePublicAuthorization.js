'use strict';

const pool = require('../../../config/db');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const { resource } = require('./venueBookingResource');

// 公共场地占用仍用于冲突展示；借用内容按当前角色单独判断，不能合并其他组织岗位。
async function prepare(organizationId, reference) {
  return pool.withTransaction(async connection => {
    if (!reference) {
      await requireLegacyWrite(connection, organizationId);
      return { venue: item => item, schedule() {}, booking: () => true };
    }
    if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    function check(capability, type, id, requestedFields) {
      return session.check({ capability, resource: { id, type, organizationId }, requestedFields,
        businessAllowed: true, businessGranted: true, legacyAllowed: true });
    }
    return {
      venue(item) {
        const decision = check('venue.resources.read', 'venue.resources', item.id, ['name']);
        if (!decision.allowed) return null;
        if (session.mode !== 'enforced') return item;
        const visible = session.project(item, decision);
        return { id: item.id, ...visible, approvalType: item.approvalType, bookingWindow: item.bookingWindow };
      },
      schedule(id) {
        if (!check('venue.schedule.read', 'venue.schedule', id).allowed
          || !check('venue.resources.read', 'venue.resources', id, ['name']).allowed) {
          throw authorizationError('authorization_forbidden');
        }
      },
      booking(row) {
        if (session.mode !== 'enforced') return true;
        if (![row.creator_org_id, row.approval_org_id].includes(organizationId)) return false;
        return session.check({ capability: 'venue.bookings.read', resource: resource(row, organizationId),
          businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed;
      }
    };
  });
}

module.exports = { prepare };
