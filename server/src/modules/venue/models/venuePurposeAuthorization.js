'use strict';

const { usingStorage } = require('./venuePurposeStorage');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { authorizationError } = require('../../../core/services/authorizationError');

async function execute(reference, action, id, data) {
  return usingStorage(async (connection, isolated) => {
    if (!isolated) throw authorizationError('authorization_forbidden');
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    const decision = session.check({ capability: 'venue.purposes.' + action,
      resource: { id, type: 'venue.purposes', organizationId: reference.organizationId },
      requestedFields: action === 'delete' ? [] : ['text', 'sortOrder'], businessAllowed: true, legacyAllowed: false });
    if (session.mode !== 'enforced' || !decision.allowed) throw authorizationError('authorization_forbidden');
    const [existing] = await connection.query('SELECT id,text FROM organization_venue_booking_purposes WHERE org_id=? AND id=? FOR UPDATE',
      [reference.organizationId, id]);
    if (action !== 'create' && !existing.length) throw authorizationError('venue_purpose_missing');
    if (action === 'create') {
      await connection.query('INSERT INTO organization_venue_booking_purposes (org_id,id,text,sort_order) VALUES (?,?,?,?)',
        [reference.organizationId, id, data.text, data.sortOrder]);
    } else if (action === 'update') {
      await connection.query('UPDATE organization_venue_booking_purposes SET text=?,sort_order=?,updated_at=UTC_TIMESTAMP() WHERE org_id=? AND id=?',
        [data.text, data.sortOrder, reference.organizationId, id]);
    } else if (action === 'delete') {
      const [references] = await connection.query('SELECT id FROM venue_bookings WHERE creator_org_id=? AND title=? LIMIT 1 FOR SHARE',
        [reference.organizationId, existing[0].text]);
      if (references.length) throw authorizationError('venue_purpose_referenced');
      await connection.query('DELETE FROM organization_venue_booking_purposes WHERE org_id=? AND id=?', [reference.organizationId, id]);
    } else throw authorizationError('authorization_forbidden');
    return { id };
  });
}

async function list(organizationId, reference) {
  return usingStorage(async (connection, isolated) => {
    const state = await require('../../../core/models/authorization').read(connection, organizationId, true);
    if (state.mode === 'shadow') {
      const [rows] = await connection.query(isolated
        ? 'SELECT id,text,sort_order,created_at,updated_at FROM organization_venue_booking_purposes WHERE org_id=? ORDER BY sort_order,created_at'
        : 'SELECT id,text,sort_order,created_at,updated_at FROM venue_booking_purposes ORDER BY sort_order,created_at', isolated ? [organizationId] : []);
      return rows;
    }
    if (state.mode !== 'enforced' || !isolated || !reference || reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    const scope = session.queryScope({ resourceType: 'venue.purposes', organization: 'p.org_id', id: 'p.id' }, 'venue.purposes.read', { businessGranted: true });
    const [rows] = await connection.query(`SELECT p.id,p.text,p.sort_order FROM organization_venue_booking_purposes p
      WHERE p.org_id=? AND (${scope.sql}) ORDER BY p.sort_order,p.created_at`, [organizationId, ...scope.params]);
    return rows.flatMap(row => {
      const decision = session.check({ capability: 'venue.purposes.read', resource: { id: row.id, type: 'venue.purposes', organizationId },
        businessAllowed: true, businessGranted: true, legacyAllowed: false });
      if (!decision.allowed) return [];
      const visible = session.project({ text: row.text, sortOrder: row.sort_order }, decision);
      // 没有可读文字的事由不能作为借用快捷选项；也不能由排序位置推断隐藏文字。
      if (!Object.hasOwn(visible, 'text')) return [];
      return [{ id: row.id, text: visible.text, ...(Object.hasOwn(visible, 'sortOrder') ? { sort_order: visible.sortOrder } : {}) }];
    });
  });
}

module.exports = { execute, list };
