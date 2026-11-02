'use strict';

const crypto = require('node:crypto');
const { ruleValidationError, cycleMeta } = require('../../modules/venue/services/venueActivitySchedule');
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TYPES = Object.freeze({
  'venue.openRules': ['venue_open_rules', 'name'],
  'venue.activityRules': ['venue_activity_rules', 'activity_name']
});
function fail(code = 'config_copy_invalid') { throw Object.assign(new Error(code), { code }); }
function time(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value)) fail();
  return value.slice(0, 5);
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail();
  return value;
}
function cycleValues(raw, cycleType) {
  if (!raw || typeof raw !== 'object') fail();
  if (cycleType === 'datetime_range' || cycleType === 'repeat') {
    if (Array.isArray(raw)) fail();
    const result = { startDate: date(raw.startDate), startTime: time(raw.startTime),
      endDate: date(raw.endDate), endTime: time(raw.endTime) };
    if (result.endDate + result.endTime <= result.startDate + result.startTime) fail();
    if (cycleType === 'repeat') {
      if (!['day', 'week'].includes(raw.intervalUnit) || !Number.isSafeInteger(raw.intervalValue) || raw.intervalValue < 1
        || raw.intervalValue > 366 || !Number.isSafeInteger(raw.repeatCount) || raw.repeatCount < 1 || raw.repeatCount > 1000) fail();
      Object.assign(result, { intervalUnit: raw.intervalUnit, intervalValue: raw.intervalValue, repeatCount: raw.repeatCount });
    }
    return result;
  }
  if (cycleType === 'range') {
    if (Array.isArray(raw)) fail();
    // 旧开放时间按startDate/endDate解释，不能改成新活动周期字段而改变原范围。
    const result = { startDate: date(raw.startDate), endDate: date(raw.endDate) };
    if (result.endDate < result.startDate) fail();
    return result;
  }
  const values = Array.isArray(raw) ? raw : raw.values;
  if (!Array.isArray(values) || values.length > 366) fail();
  const normalized = values.map(value => {
    if (cycleType === 'yearly') {
      if (!value || !Number.isInteger(value.m) || value.m < 1 || value.m > 12) fail();
      const start = value.dStart === undefined ? value.d : value.dStart;
      const end = value.dEnd === undefined ? value.d : value.dEnd;
      const max = new Date(Date.UTC(2000, value.m, 0)).getUTCDate();
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > max) fail();
      return { m: value.m, dStart: start, dEnd: end };
    }
    const max = cycleType === 'weekly' ? 7 : 31;
    if (!Number.isInteger(value) || value < 1 || value > max || cycleType === 'daily') fail();
    return value;
  });
  if (cycleType !== 'daily' && !normalized.length) fail();
  if (Array.isArray(raw)) return normalized;
  if (raw.periodMode !== undefined && !['none', 'range', 'count'].includes(raw.periodMode)) fail();
  // 仅缺少旧字段时沿用生产日程的既有解释，不把未知枚举当作无限期。
  const meta = cycleMeta(raw);
  const result = { values: normalized, periodMode: meta.periodMode,
    periodStartDate: '', periodStartTime: '', periodEndDate: '', periodEndTime: '', repeatCount: 0 };
  if (meta.periodMode !== 'none') {
    result.periodStartDate = date(meta.periodStartDate);
    result.periodStartTime = time(meta.periodStartTime || '00:00');
  }
  if (meta.periodMode === 'range') {
    result.periodEndDate = date(meta.periodEndDate);
    result.periodEndTime = time(meta.periodEndTime || '23:59');
    if (result.periodEndDate + result.periodEndTime <= result.periodStartDate + result.periodStartTime) fail();
  }
  if (meta.periodMode === 'count') {
    if (!Number.isSafeInteger(raw.repeatCount) || raw.repeatCount < 1 || raw.repeatCount > 1000) fail();
    result.repeatCount = raw.repeatCount;
  }
  return result;
}
function normalize(raw, kind) {
  if (!raw || typeof raw.name !== 'string' || Array.from(raw.name).length > 200
    || !ID.test(raw.sourceVenueId || '') || typeof raw.sourceVenueName !== 'string'
    || !['daily', 'weekly', 'monthly', 'yearly', 'range'].concat(kind === 'venue.activityRules' ? ['datetime_range', 'repeat'] : []).includes(raw.cycleType)) fail();
  const result = { name: raw.name, sourceVenueId: raw.sourceVenueId, sourceVenueName: raw.sourceVenueName,
    cycleType: raw.cycleType, cycleValues: cycleValues(raw.cycleValues, raw.cycleType),
    timeStart: time(raw.timeStart), timeEnd: time(raw.timeEnd),
    references: [{ token: 'venueId', kind: 'venue', label: raw.sourceVenueName }] };
  if (result.timeEnd <= result.timeStart || ruleValidationError(result)) fail();
  return result;
}
function createAdapter(kind) {
  if (!Object.hasOwn(TYPES, kind)) fail('config_copy_unsupported');
  const [table, name] = TYPES[kind];
  return Object.freeze({
    globalVenue: true,
    normalize: raw => normalize(raw, kind),
    references(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1
        || !Object.hasOwn(raw, 'venueId') || typeof raw.venueId !== 'string' || !ID.test(raw.venueId)) fail('config_copy_reference');
      return { venueId: raw.venueId };
    },
    async source(connection, orgId, id) {
      // 共享时间没有组织列；调用方必须另外核验该场地的全局配置授权。
      const [rows] = await connection.query(`SELECT r.*,v.name AS venue_name FROM ${table} r
        JOIN venues v ON v.id=r.venue_id WHERE r.id=? FOR SHARE`, [id]);
      if (!rows.length) fail('config_copy_missing');
      const row = rows[0];
      return normalize({ name: row[name], sourceVenueId: row.venue_id, sourceVenueName: row.venue_name,
        cycleType: row.cycle_type, cycleValues: typeof row.cycle_values === 'string' ? JSON.parse(row.cycle_values) : row.cycle_values,
        timeStart: row.time_start, timeEnd: row.time_end }, kind);
    },
    async create(connection, orgId, raw, mapping) {
      const payload = normalize(raw, kind);
      const venueId = mapping.venueId;
      if (venueId === payload.sourceVenueId) fail('config_copy_reference');
      const [venues] = await connection.query('SELECT id FROM venues WHERE id=? FOR UPDATE', [venueId]);
      if (!venues.length) fail('config_copy_reference');
      const [duplicates] = await connection.query(`SELECT id FROM ${table} WHERE venue_id=? AND ${name}=? FOR UPDATE`, [venueId, payload.name]);
      if (duplicates.length) fail('config_copy_duplicate');
      const id = crypto.randomUUID();
      await connection.query(`INSERT INTO ${table}(id,venue_id,${name},cycle_type,cycle_values,time_start,time_end,is_active)
        VALUES (?,?,?,?,?,?,?,0)`, [id, venueId, payload.name, payload.cycleType, JSON.stringify(payload.cycleValues), payload.timeStart, payload.timeEnd]);
      return id;
    }
  });
}
module.exports = { createAdapter };
