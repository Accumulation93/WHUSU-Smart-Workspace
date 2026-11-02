'use strict';
const crypto = require('node:crypto');
const { MAX_ADVANCE_DAYS, normalizeBookingWindow } = require('../../modules/venue/services/venueBookingWindow');
const ID = /^[A-Za-z0-9_-]{1,64}$/;
function fail(code = 'config_copy_invalid') { throw Object.assign(new Error(code), { code }); }
function side(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
  if (raw.mode === 'none') return { mode: 'none' };
  if (raw.mode === 'days' && Number.isSafeInteger(raw.days) && raw.days >= 0 && raw.days <= MAX_ADVANCE_DAYS) return { mode: 'days', days: raw.days };
  if (raw.mode === 'duration' && Number.isSafeInteger(raw.hours) && raw.hours >= 0 && raw.hours <= MAX_ADVANCE_DAYS * 24
    && Number.isSafeInteger(raw.minutes) && raw.minutes >= 0 && raw.minutes <= 59) return { mode: 'duration', hours: raw.hours, minutes: raw.minutes };
  fail();
}
function normalize(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name || Array.from(raw.name).length > 600) fail();
  const result = { name: raw.name, open: side(raw.open), deadline: side(raw.deadline),
    references: [{ token: 'venueId', kind: 'venue', label: raw.name }] };
  try { normalizeBookingWindow(result); } catch (_) { fail(); }
  return result;
}
function fromRow(row, prefix) {
  const mode = row[prefix + '_advance_mode'];
  if (mode == null) {
    if (row[prefix + '_advance_minutes'] != null || row[prefix + '_advance_days'] != null) fail();
    return { mode: 'none' };
  }
  if (mode === 'days') {
    const days = row[prefix + '_advance_days'];
    if (!Number.isSafeInteger(days) || row[prefix + '_advance_minutes'] !== days * 1440) fail();
    return { mode, days };
  }
  if (mode !== 'duration') fail();
  const minutes = row[prefix + '_advance_minutes'];
  if (!Number.isSafeInteger(minutes) || minutes < 0) fail();
  return { mode, hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
module.exports = {
  normalize,
  references(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1
      || typeof raw.venueId !== 'string' || !ID.test(raw.venueId)) fail('config_copy_reference');
    return { venueId: raw.venueId };
  },
  async source(connection, orgId, id) {
    const [rows] = await connection.query(`SELECT p.*,v.name FROM venue_booking_policies p JOIN venues v ON v.id=p.venue_id
      WHERE p.org_id=? AND p.id=? FOR SHARE`, [orgId, id]);
    if (!rows.length) fail('config_copy_missing');
    return normalize({ name: rows[0].name, open: fromRow(rows[0], 'open'), deadline: fromRow(rows[0], 'deadline') });
  },
  async create(connection, orgId, raw, mapping) {
    const payload = normalize(raw), venueId = mapping.venueId;
    const [venues] = await connection.query('SELECT id FROM venues WHERE id=? FOR UPDATE', [venueId]);
    if (!venues.length) fail('config_copy_reference');
    const [existing] = await connection.query('SELECT id FROM venue_booking_policies WHERE org_id=? AND venue_id=? FOR UPDATE', [orgId, venueId]);
    if (existing.length) fail('config_copy_duplicate');
    // 用户已接收草稿、核对目标后明确创建；绝不覆盖目标已有策略。
    const value = normalizeBookingWindow(payload), id = crypto.randomUUID();
    await connection.query(`INSERT INTO venue_booking_policies(id,org_id,venue_id,open_advance_mode,open_advance_days,
      open_advance_minutes,deadline_advance_mode,deadline_advance_days,deadline_advance_minutes) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, orgId, venueId, value.openAdvanceMode, value.openAdvanceDays, value.openAdvanceMinutes,
      value.deadlineAdvanceMode, value.deadlineAdvanceDays, value.deadlineAdvanceMinutes]);
    return id;
  }
};
