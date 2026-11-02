'use strict';

const pool = require('../../../config/db');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const { resource } = require('./venueBookingResource');
const localeCopy = require('../../../locales/zh-CN/generated/modules/venue/routes/venueUser');

async function prepare(connection, organizationId, reference) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return { require() {} };
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  return {
    require(action, booking) {
      if (!session.check({ capability: 'venue.bookings.' + action, resource: resource(booking, organizationId),
        businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed) {
        throw authorizationError('authorization_forbidden');
      }
    }
  };
}

// 请求前置校验不能替代事务内状态校验；等待锁期间审批、取消或时间均可能变化。
async function perform(id, action, actor, reference, timeEnd) {
  return pool.withTransaction(async connection => {
    const permission = await prepare(connection, actor.organizationId, reference);
    const model = require('./venueBooking');
    const booking = await model.getByIdForUpdate(id, connection);
    if (!booking) throw new Error(localeCopy.copy_3508043e2a);
    if (![booking.creator_org_id, booking.approval_org_id].includes(actor.organizationId)
      || (booking.creator_person_id ? booking.creator_person_id !== actor.personId : booking.user_hr_id !== actor.id)) {
      throw authorizationError('authorization_forbidden');
    }
    permission.require('read', booking);
    permission.require(action, booking);
    const now = new Date().getTime();
    if (action === 'cancel') {
      if (booking.status === 'cancelled') throw new Error(localeCopy.copy_f65527e76d);
      if (booking.status === 'rejected') throw new Error(localeCopy.copy_c16837c5f9);
      if (booking.status === 'approved' && now >= new Date(booking.time_start).getTime()) throw new Error(localeCopy.copy_22b06082e1);
      await model.updateStatus(id, 'cancelled', actor.id, '申请人取消', connection, actor);
    } else if (action === 'update') {
      if (booking.status !== 'approved') throw new Error(localeCopy.copy_38b3e3a11c);
      if (now < new Date(booking.time_start).getTime()) throw new Error(localeCopy.copy_9aa2375ba5);
      if (now >= new Date(booking.time_end).getTime()) throw new Error(localeCopy.copy_2012c1a0a5);
      await model.updateTimeEnd(id, timeEnd, connection, actor);
    } else throw authorizationError('authorization_forbidden');
  });
}

module.exports = { prepare, perform };
