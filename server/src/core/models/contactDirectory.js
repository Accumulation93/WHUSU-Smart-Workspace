'use strict';

const pool = require('../../config/db');
const { generateId } = require('../../utils/helpers');
const identity = require('./unifiedIdentity');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');
const policy = require('../services/contactDirectoryPolicy');
const copy = require('../../locales/zh-CN/contactDirectory');
const { hmac } = require('../services/identityCrypto');
const crypto = require('crypto');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const placeholders = values => values.map(() => '?').join(',');

function decode(row) {
  return { id: row.id, name: row.name, version: row.version, enabled: Boolean(row.enabled),
    audience: parse(row.audience_json), targets: parse(row.targets_json), fieldIds: parse(row.field_ids_json) };
}
async function catalog(connection, orgId, lock = false) {
  const suffix = lock ? ' FOR SHARE' : '';
  const departments = (await connection.query('SELECT id, name FROM departments WHERE org_id = ? ORDER BY id' + suffix, [orgId]))[0];
  const identities = (await connection.query('SELECT id, name FROM identities WHERE org_id = ? ORDER BY id' + suffix, [orgId]))[0];
  const workGroups = (await connection.query('SELECT id, name, department_id AS departmentId FROM work_groups WHERE org_id = ? ORDER BY id' + suffix, [orgId]))[0];
  const fields = (await connection.query(`SELECT f.id, f.label, f.type FROM org_hr_profile_template_snapshot_fields f
    JOIN org_hr_profile_template_snapshots s ON s.id = f.snapshot_id
    WHERE s.org_id = ? AND f.is_active = 1 ORDER BY f.id${suffix}`, [orgId]))[0]
    // 自定义资料也不能以改列名的方式开放受保护的身份/认证列。
    .filter(field => !/(学号|学生号|student.?id|password|口令|密码|恢复码|认证码|openid|身份证)/i.test(field.label));
  const members = (await connection.query(`SELECT p.id AS personId, p.name, m.id AS membershipId, m.legacy_hr_id AS hrId
    FROM organization_memberships m JOIN persons p ON p.id = m.person_id AND p.status = 'active'
    WHERE m.org_id = ? AND m.status = 'active' ORDER BY p.id${suffix}`, [orgId]))[0];
  const assignments = (await connection.query(`SELECT a.id, a.membership_id AS membershipId, a.assignment_kind AS nature,
    a.department_id AS departmentId, a.identity_id AS identityCategoryId, a.work_group_id AS workGroupId,
    d.name AS departmentName, i.name AS identityCategoryName, w.name AS workGroupName
    FROM membership_assignments a
    JOIN organization_memberships m ON m.id = a.membership_id AND m.org_id = a.org_id AND m.status = 'active'
    JOIN departments d ON d.id = a.department_id AND d.org_id = a.org_id
    JOIN identities i ON i.id = a.identity_id AND i.org_id = a.org_id
    LEFT JOIN work_groups w ON w.id = a.work_group_id AND w.org_id = a.org_id AND w.department_id = a.department_id
    WHERE a.org_id = ? AND a.status = 'active' AND (a.work_group_id IS NULL OR a.work_group_id = '' OR w.id IS NOT NULL)
    ORDER BY a.id${suffix}`, [orgId]))[0];
  const byMembership = new Map();
  for (const assignment of assignments) {
    const list = byMembership.get(assignment.membershipId) || [];
    list.push(assignment);
    byMembership.set(assignment.membershipId, list);
  }
  const people = members.map(member => Object.assign({}, member, { assignments: byMembership.get(member.membershipId) || [] }));
  return { departments, identities, workGroups, fields, people,
    departmentIds: departments.map(row => row.id), identityCategoryIds: identities.map(row => row.id), workGroupIds: workGroups.map(row => row.id) };
}
async function list(connection, orgId) {
  return (await connection.query('SELECT * FROM hr_contact_directory_rules WHERE org_id = ? ORDER BY created_at, id', [orgId]))[0].map(decode);
}
async function configuration(orgId, authorize) {
  return pool.withTransaction(async connection => {
    await authorize(connection);
    const data = await catalog(connection, orgId);
    const people = data.people.map(person => ({ personId: person.personId, name: person.name,
      assignments: person.assignments.map(assignment => ({ id: assignment.id, departmentId: assignment.departmentId,
        identityCategoryId: assignment.identityCategoryId, workGroupId: assignment.workGroupId,
        departmentName: assignment.departmentName, identityCategoryName: assignment.identityCategoryName, workGroupName: assignment.workGroupName })) }));
    return { rules: await list(connection, orgId), people, fields: data.fields,
      departments: data.departments, identities: data.identities, workGroups: data.workGroups };
  });
}
async function save(input, orgId, authorize) {
  const rule = policy.normalizeRule(input);
  return pool.withTransaction(async connection => {
    await authorize(connection);
    await identity.lockActiveBusinessSubjects(connection, policy.referenceIds(rule).map(personId => ({ personId, organizationId: orgId })));
    await lockOrganizationDictionaryWrites(orgId, connection);
    const data = await catalog(connection, orgId, true);
    policy.validateReferences(rule, data);
    if (rule.id) {
      const [result] = await connection.query(`UPDATE hr_contact_directory_rules SET name = ?, audience_json = ?, targets_json = ?,
        field_ids_json = ?, enabled = ?, version = version + 1 WHERE id = ? AND org_id = ? AND version = ?`,
      [rule.name, JSON.stringify(rule.audience), JSON.stringify(rule.targets), JSON.stringify(rule.fieldIds), rule.enabled ? 1 : 0, rule.id, orgId, rule.version]);
      if (result.affectedRows !== 1) throw new policy.DirectoryError('conflict');
    } else {
      rule.id = generateId();
      await connection.query(`INSERT INTO hr_contact_directory_rules (id, org_id, name, audience_json, targets_json, field_ids_json, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [rule.id, orgId, rule.name, JSON.stringify(rule.audience), JSON.stringify(rule.targets), JSON.stringify(rule.fieldIds), rule.enabled ? 1 : 0]);
    }
    return decode((await connection.query('SELECT * FROM hr_contact_directory_rules WHERE id = ? AND org_id = ?', [rule.id, orgId]))[0][0]);
  });
}
async function batch(input, orgId, authorize) {
  if (!input || !['enable', 'disable', 'delete'].includes(input.action) || !Array.isArray(input.rules) || !input.rules.length || input.rules.length > 500) throw new policy.DirectoryError('invalidRule');
  const ids = new Set();
  input.rules.forEach(rule => {
    if (!rule || typeof rule.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(rule.id) || !Number.isSafeInteger(rule.version) || rule.version < 1 || ids.has(rule.id)) throw new policy.DirectoryError('invalidRule');
    ids.add(rule.id);
  });
  return pool.withTransaction(async connection => {
    await authorize(connection);
    await lockOrganizationDictionaryWrites(orgId, connection);
    const rows = (await connection.query(`SELECT * FROM hr_contact_directory_rules WHERE org_id = ? AND id IN (${placeholders(input.rules)}) ORDER BY id FOR UPDATE`, [orgId, ...ids]))[0];
    const versions = new Map(input.rules.map(rule => [rule.id, rule.version]));
    if (rows.length !== ids.size || rows.some(row => row.version !== versions.get(row.id))) throw new policy.DirectoryError('conflict');
    if (input.action === 'enable') {
      const data = await catalog(connection, orgId, true);
      rows.forEach(row => policy.validateReferences(policy.normalizeRule(decode(row)), data));
    }
    if (input.action === 'delete') await connection.query(`DELETE FROM hr_contact_directory_rules WHERE org_id = ? AND id IN (${placeholders(rows)})`, [orgId, ...ids]);
    else await connection.query(`UPDATE hr_contact_directory_rules SET enabled = ?, version = version + 1 WHERE org_id = ? AND id IN (${placeholders(rows)})`, [input.action === 'enable' ? 1 : 0, orgId, ...ids]);
    return { count: rows.length };
  });
}
function contactKey(actor, item, nonce) {
  return nonce + hmac(JSON.stringify(['contact-directory-v1', actor.organizationId, actor.contextId,
    actor.personId, actor.assignmentId || '', nonce, item.person.personId, item.assignment && item.assignment.id]));
}
async function read(actor, options = {}) {
  const detail = options.key !== undefined;
  if (detail && (typeof options.key !== 'string' || !/^[a-f0-9]{96}$/.test(options.key))) throw new policy.DirectoryError('contactUnavailable');
  const nonce = detail ? options.key.slice(0, 32) : crypto.randomBytes(16).toString('hex');
  return pool.withTransaction(async connection => {
    const rules = (await list(connection, actor.organizationId)).filter(rule => rule.enabled);
    const empty = () => { if (detail) throw new policy.DirectoryError('contactUnavailable'); return { groups: [] }; };
    if (!rules.length) return empty();
    const data = await catalog(connection, actor.organizationId);
    const viewerPerson = data.people.find(person => person.personId === actor.personId);
    if (!viewerPerson) return empty();
    const viewer = { personId: actor.personId, assignment: viewerPerson.assignments.find(assignment => assignment.id === actor.assignmentId) || null };
    // 当前岗位已失效时，不得悄悄改用其他岗位匹配。
    if (actor.assignmentId && !viewer.assignment) return empty();
    let visible = policy.grants(rules, data.people, viewer, data);
    if (detail) {
      visible = visible.filter(item => contactKey(actor, item, nonce) === options.key);
      if (!visible.length) throw new policy.DirectoryError('contactUnavailable');
    }
    if (!visible.length) return { groups: [] };
    const hrIds = Array.from(new Set(visible.map(item => item.person.hrId)));
    const fieldIds = options.summaryOnly === true && !detail ? [] : Array.from(new Set(visible.flatMap(item => item.fieldIds)));
    const values = fieldIds.length ? (await connection.query(`SELECT r.hr_id AS hrId, v.field_id AS fieldId, v.field_value AS value
      FROM hr_profile_records r JOIN hr_profile_record_values v ON v.record_id = r.id AND v.org_id = r.org_id
      WHERE r.org_id = ? AND v.is_pending = 0 AND r.hr_id IN (${placeholders(hrIds)}) AND v.field_id IN (${placeholders(fieldIds)})`,
    [actor.organizationId, ...hrIds, ...fieldIds]))[0] : [];
    const byValue = new Map(values.map(row => [JSON.stringify([row.hrId, row.fieldId]), row.value]));
    const fieldById = new Map(data.fields.map(field => [field.id, field]));
    const groups = new Map();
    const relations = new Map();
    const seen = new Set();
    for (const item of visible) {
      const assignment = item.assignment;
      const tuple = JSON.stringify([item.person.personId, assignment && assignment.nature, assignment && assignment.departmentId, assignment && assignment.identityCategoryId, assignment && assignment.workGroupId]);
      if (seen.has(tuple)) continue;
      seen.add(tuple);
      const department = assignment ? assignment.departmentName : copy.noPosition;
      const groupKey = assignment ? assignment.departmentId : '';
      const group = groups.get(groupKey) || { key: generateId(), name: department, items: [] };
      const card = { key: contactKey(actor, item, nonce), name: item.person.name, departmentName: department,
        identityCategoryName: assignment ? assignment.identityCategoryName : '', workGroupName: assignment ? assignment.workGroupName || '' : '',
        fields: (options.summaryOnly === true && !detail ? [] : item.fieldIds).map(id => ({ label: fieldById.get(id).label, type: fieldById.get(id).type,
          value: String(byValue.get(JSON.stringify([item.person.hrId, id])) || '') })), relatedKeys: [] };
      group.items.push(card);
      groups.set(groupKey, group);
      const related = relations.get(item.person.personId) || [];
      related.push(card);
      relations.set(item.person.personId, related);
    }
    relations.forEach(cards => cards.forEach(card => { card.relatedKeys = cards.filter(other => other !== card).map(other => other.key); }));
    if (detail) return { contact: Array.from(groups.values())[0].items[0] };
    return { groups: Array.from(groups.values()) };
  });
}
async function personReferences(connection, personId, orgId, lock = false) {
  const exists = (await connection.query('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', ['hr_contact_directory_rules']))[0];
  if (!exists.length) return [];
  const rows = (await connection.query(`SELECT * FROM hr_contact_directory_rules WHERE (? = '' OR org_id = ?)
    AND (JSON_CONTAINS(JSON_EXTRACT(audience_json, '$[*].personIds[*]'), JSON_QUOTE(?))
      OR JSON_CONTAINS(JSON_EXTRACT(targets_json, '$[*].personIds[*]'), JSON_QUOTE(?)))${lock ? ' FOR UPDATE' : ''}`, [orgId, orgId, personId, personId]))[0];
  return rows;
}
async function deletionImpact(connection, personId, orgId, lock) {
  return (await personReferences(connection, personId, orgId, lock)).map(row => ({ type: 'directory_rule', id: row.id, name: row.name,
    reference: 'specified_person', wouldDisable: !policy.removePerson(decode(row), personId).enabled }));
}
async function cleanupPerson(connection, personId, orgId) {
  const rows = await personReferences(connection, personId, orgId, true);
  for (const row of rows) {
    const cleaned = policy.removePerson(decode(row), personId);
    await connection.query(`UPDATE hr_contact_directory_rules SET audience_json = ?, targets_json = ?, enabled = ?, version = version + 1
      WHERE id = ? AND org_id = ?`, [JSON.stringify(cleaned.audience), JSON.stringify(cleaned.targets), cleaned.enabled ? 1 : 0, row.id, row.org_id]);
  }
  return rows.length;
}
module.exports = { catalog, configuration, save, batch, read, cleanupPerson, deletionImpact };
