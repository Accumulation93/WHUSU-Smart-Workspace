'use strict';

const crypto = require('node:crypto');
const directory = require('./contactDirectory');
const identity = require('./unifiedIdentity');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LINKS = { venueReference: 'venue', identityReference: 'identity', assignmentReference: 'assignments',
  departmentReference: 'department', workGroupReference: 'workGroup' };
function fail(code = 'config_copy_invalid') { throw Object.assign(new Error(code), { code }); }
function normalize(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || Array.from(raw.name).length > 600
    || !['admin', 'direct', 'identity', 'person'].includes(raw.ruleType)
    || !Number.isSafeInteger(raw.sortOrder) || raw.sortOrder < 1 || raw.sortOrder > 2147483647
    || !Array.isArray(raw.references) || raw.references.length > 5) fail();
  const refs = new Map();
  const references = raw.references.map(ref => {
    if (!ref || !ID.test(ref.token || '') || refs.has(ref.token) || !Object.values(LINKS).includes(ref.kind)
      || typeof ref.label !== 'string' || !ref.label || Array.from(ref.label).length > 600) fail();
    refs.set(ref.token, ref.kind);
    return { token: ref.token, kind: ref.kind, label: ref.label };
  });
  const result = { name: raw.name.trim(), ruleType: raw.ruleType, sortOrder: raw.sortOrder, references };
  const used = new Set();
  for (const [key, kind] of Object.entries(LINKS)) {
    const required = key === 'venueReference' || key === 'identityReference' && raw.ruleType === 'identity'
      || key === 'assignmentReference' && raw.ruleType === 'person';
    const value = raw[key];
    if (!value) { if (required) fail(); result[key] = null; continue; }
    if (typeof value !== 'string' || refs.get(value) !== kind || used.has(value)
      || key === 'identityReference' && raw.ruleType !== 'identity'
      || key === 'assignmentReference' && raw.ruleType !== 'person') fail();
    used.add(value); result[key] = value;
  }
  if (used.size !== refs.size) fail();
  return result;
}
function indexes(data) {
  const assignments = new Map();
  for (const person of data.people) for (const job of person.assignments) assignments.set(job.id, { ...job,
    personId: person.personId, hrId: person.hrId,
    name: [person.name, job.identityCategoryName, job.departmentName, job.workGroupName].filter(Boolean).join(' · ') });
  return { department: new Map(data.departments.map(row => [row.id, row])), identity: new Map(data.identities.map(row => [row.id, row])),
    workGroup: new Map(data.workGroups.map(row => [row.id, row])), assignments };
}
module.exports = {
  normalize,
  references(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 5) fail('config_copy_reference');
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!ID.test(key) || typeof value !== 'string' || !ID.test(value)) fail('config_copy_reference');
      result[key] = value;
    }
    return result;
  },
  async source(connection, orgId, id) {
    const [rows] = await connection.query(`SELECT r.*,v.name AS venue_name FROM venue_booking_rules r
      JOIN venues v ON v.id=r.venue_id WHERE r.org_id=? AND r.id=? FOR SHARE`, [orgId, id]);
    if (!rows.length) fail('config_copy_missing');
    const row = rows[0], data = indexes(await directory.catalog(connection, orgId, true));
    const references = [{ token: 'venue', kind: 'venue', label: row.venue_name }];
    function reference(key, kind, id) {
      if (!id) return null;
      const item = data[kind].get(id);
      if (!item || kind === 'assignments' && item.hrId !== row.approver_hr_id) fail('config_copy_reference');
      references.push({ token: key, kind, label: item.name }); return key;
    }
    return normalize({ name: row.venue_name, ruleType: row.rule_type, sortOrder: row.sort_order, venueReference: 'venue',
      identityReference: reference('identity', 'identity', row.approver_identity_id),
      assignmentReference: reference('assignment', 'assignments', row.approver_assignment_id),
      departmentReference: reference('department', 'department', row.scope_department_id),
      workGroupReference: reference('group', 'workGroup', row.scope_work_group_id), references });
  },
  async create(connection, orgId, raw, mapping) {
    const payload = normalize(raw);
    if (Object.keys(mapping).length !== payload.references.length || payload.references.some(ref => !Object.hasOwn(mapping, ref.token))) fail('config_copy_reference');
    const venueId = mapping[payload.venueReference];
    const [venues] = await connection.query('SELECT id FROM venues WHERE id=? FOR UPDATE', [venueId]);
    if (!venues.length) fail('config_copy_reference');
    // 岗位选择以目标组织当前关系为准；姓名相同不产生任何映射。
    if (payload.assignmentReference) {
      try {
        await identity.lockActiveBusinessSubjects(connection, [{ assignmentId: mapping[payload.assignmentReference], organizationId: orgId }]);
      } catch (error) {
        if (error instanceof identity.IdentityError) fail('config_copy_reference');
        throw error;
      }
    }
    await lockOrganizationDictionaryWrites(orgId, connection);
    const data = indexes(await directory.catalog(connection, orgId, true));
    const selected = {};
    for (const [key, kind] of Object.entries(LINKS)) {
      if (kind === 'venue' || !payload[key]) continue;
      const item = data[kind].get(mapping[payload[key]]);
      if (!item) fail('config_copy_reference');
      selected[key] = item;
    }
    if (selected.workGroupReference && selected.departmentReference
      && selected.workGroupReference.departmentId !== selected.departmentReference.id) fail('config_copy_reference');
    const job = selected.assignmentReference;
    if (job && !job.hrId) fail('config_copy_reference');
    const id = crypto.randomUUID();
    await connection.query(`INSERT INTO venue_booking_rules(id,venue_id,org_id,rule_type,approver_identity_id,
      approver_hr_id,approver_assignment_id,scope_department_id,scope_work_group_id,sort_order,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,0)`, [id, venueId, orgId, payload.ruleType,
      selected.identityReference ? selected.identityReference.id : null, job ? job.hrId : null, job ? job.id : null,
      selected.departmentReference ? selected.departmentReference.id : null,
      selected.workGroupReference ? selected.workGroupReference.id : null, payload.sortOrder]);
    // 副本停用，不删除目标的直接通过规则、审批流程或在途记录。
    return id;
  }
};
