'use strict';

const pool = require('../../../config/db');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const { resource } = require('./venueBookingResource');

async function list(organizationId, reference, filters) {
  return pool.withTransaction(async connection => {
    let session;
    if (reference) {
      if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
      session = await createAuthorizationSession(connection, reference, { lock: true });
      if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    } else await requireLegacyWrite(connection, organizationId);
    // 岗位范围依赖不可变 JSON；先取组织内记录，逐条使用同一授权器过滤后再限制数量。
    // 不能先 LIMIT 后过滤，否则无权记录会挤掉有权记录；也不能将缺失岗位补成现任岗位。
    let sql = `SELECT vb.*,v.name AS venue_name,v.location AS venue_location FROM venue_bookings vb
      JOIN venues v ON v.id=vb.venue_id JOIN organizations authorized_org ON authorized_org.id=?
        AND (vb.creator_org_id=authorized_org.id OR vb.approval_org_id=authorized_org.id) WHERE 1=1`;
    const params = [organizationId];
    const conditions = [['venueId', 'vb.venue_id = ?'], ['status', 'vb.status = ?'], ['timeFrom', 'vb.time_end > ?'],
      ['timeTo', 'vb.time_start < ?'], ['userHrId', 'vb.user_hr_id = ?']];
    for (const [key, condition] of conditions) {
      if (filters[key]) { sql += ' AND ' + condition; params.push(filters[key]); }
    }
    const visible = [];
    let cursor;
    while (visible.length < 200) {
      const pageSql = sql + (cursor ? ' AND (vb.time_start < ? OR (vb.time_start = ? AND vb.id < ?))' : '')
        + ' ORDER BY vb.time_start DESC,vb.id DESC LIMIT 200';
      const pageParams = cursor ? params.concat([cursor.time_start, cursor.time_start, cursor.id]) : params;
      const [rows] = await connection.query(pageSql, pageParams);
      for (const row of rows) {
        if (!session || session.check({ capability: 'venue.bookings.read', resource: resource(row, organizationId),
          businessAllowed: true, legacyAllowed: false }).allowed) visible.push(row);
        if (visible.length === 200) break;
      }
      if (rows.length < 200 || !session) break;
      cursor = rows[rows.length - 1];
    }
    return visible.map(row => ({ ...row, authorizationCanDelete: session ? session.check({ capability: 'venue.bookings.delete',
      resource: resource(row, organizationId), businessAllowed: true, legacyAllowed: false }).allowed : false,
    authorizationCanApprove: !session || session.check({ capability: 'venue.bookings.approve',
      resource: resource(row, organizationId), businessAllowed: true, businessGranted: true, legacyAllowed: false }).allowed }));
  });
}

// 输入必须已经通过当前岗位的原历史关系检查；这里只追加读取限制，不授予历史关系。
async function filterRelated(organizationId, reference, entries, history) {
  return pool.withTransaction(async connection => {
    if (!reference) {
      await requireLegacyWrite(connection, organizationId);
      return entries;
    }
    if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    const visible = entries.filter(row => session.check({ capability: 'venue.bookings.read', resource: resource(row, organizationId),
      businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed
      && (!history || session.check({ capability: 'venue.approvalHistory.read',
        resource: { ...resource(row, organizationId), type: 'venue.approvalHistory' },
        businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed));
    return history ? visible : visible.map(row => ({ ...row,
      authorizationCanCancel: session.check({ capability: 'venue.bookings.cancel', resource: resource(row, organizationId),
        businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed,
      authorizationCanEnd: session.check({ capability: 'venue.bookings.update', resource: resource(row, organizationId),
        businessAllowed: true, businessGranted: true, legacyAllowed: true }).allowed }));
  });
}

module.exports = { list,
  relatedRead: (organizationId, reference, entries) => filterRelated(organizationId, reference, entries, true),
  ownedRead: (organizationId, reference, entries) => filterRelated(organizationId, reference, entries, false) };
