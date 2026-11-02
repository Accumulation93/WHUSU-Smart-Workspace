'use strict';
const crypto = require('node:crypto');
const TABLES = Object.freeze({ 'venue.bookingRules': 'venue_booking_rules', 'venue.approvals': 'venue_approval_flows',
  'venue.openRules': 'venue_open_rules', 'venue.activityRules': 'venue_activity_rules' });
function fail(code) { throw Object.assign(new Error(code), { code }); }
function supported(kind) { return Object.hasOwn(TABLES, kind); }
async function read(connection, orgId, kind, id, adapter, lock = false) {
  if (!supported(kind)) return null;
  const table = TABLES[kind], global = adapter.globalVenue === true;
  const condition = global ? 'id=?' : 'id=? AND org_id=?';
  const params = global ? [id] : [id, orgId];
  const [initial] = await connection.query(`SELECT venue_id FROM ${table} WHERE ${condition}`, params);
  if (!initial.length) fail('config_copy_missing');
  // 与原场地规则保存串行化，先锁场地，再锁具体规则；确认时绑定目标场地名称。
  const [venues] = await connection.query(`SELECT id,name FROM venues WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [initial[0].venue_id]);
  if (!venues.length) fail('config_copy_reference');
  const [rows] = await connection.query(`SELECT venue_id,is_active FROM ${table} WHERE ${condition}${lock ? ' FOR UPDATE' : ''}`, params);
  if (!rows.length || rows[0].venue_id !== initial[0].venue_id) fail('config_copy_conflict');
  const payload = adapter.normalize(await adapter.source(connection, orgId, id));
  const enabled = rows[0].is_active === 1;
  const venueName = venues[0].name;
  const revision = crypto.createHash('sha256').update(JSON.stringify({ kind, id, enabled, venueName, payload })).digest('hex');
  return { venueId: rows[0].venue_id, venueName, enabled, revision, payload };
}
async function enable(connection, orgId, kind, id, state) {
  if (state.enabled) return;
  if (kind === 'venue.bookingRules' || kind === 'venue.approvals') {
    const [rules] = await connection.query(`SELECT id,rule_type FROM venue_booking_rules
      WHERE org_id=? AND venue_id=? AND is_active=1 FOR UPDATE`, [orgId, state.venueId]);
    const [flows] = await connection.query(`SELECT id FROM venue_approval_flows
      WHERE org_id=? AND venue_id=? AND is_active=1 FOR UPDATE`, [orgId, state.venueId]);
    const direct = kind === 'venue.bookingRules' && state.payload.ruleType === 'direct';
    if (direct ? rules.length || flows.length : rules.some(rule => rule.rule_type === 'direct')) fail('config_copy_approval_conflict');
  }
  const global = kind === 'venue.openRules' || kind === 'venue.activityRules';
  const condition = global ? 'id=?' : 'id=? AND org_id=?';
  await connection.query(`UPDATE ${TABLES[kind]} SET is_active=1 WHERE ${condition}`, global ? [id] : [id, orgId]);
}
module.exports = { supported, read, enable };
