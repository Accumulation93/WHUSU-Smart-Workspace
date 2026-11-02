'use strict';

const crypto = require('node:crypto');
const directory = require('./contactDirectory');
const identity = require('./unifiedIdentity');
const directoryPolicy = require('../services/contactDirectoryPolicy');
const calendarPolicy = require('../services/calendarPolicy');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DIMENSIONS = ['personIds', 'departmentIds', 'identityCategoryIds', 'workGroupIds', 'fieldIds'];
function fail(code) { throw Object.assign(new Error(code), { code }); }
function parse(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
function transform(rule, convert) {
  const clauses = values => values.map(clause => {
    const result = Object.assign({}, clause);
    for (const key of DIMENSIONS) if (Array.isArray(clause[key])) result[key] = clause[key].map(id => convert(key, id));
    return result;
  });
  return Object.assign({}, rule, { audience: clauses(rule.audience), targets: clauses(rule.targets),
    fieldIds: rule.fieldIds.map(id => convert('fieldIds', id)) });
}

// 分享的是规则结构与关联说明；来源自然人、岗位及字典编号不会进入目标组织。
function createAdapter(kind) {
  if (!['hr.directoryRules', 'calendar.rules'].includes(kind)) fail('config_copy_unsupported');
  const calendar = kind === 'calendar.rules';
  const table = calendar ? 'calendar_rules' : 'hr_contact_directory_rules';
  function ruleValue(raw) {
    try { return (calendar ? calendarPolicy.normalize : directoryPolicy.normalizeRule)(Object.assign({}, raw, { id: '', enabled: false })); }
    catch (_) { fail('config_copy_invalid'); }
  }
  function normalize(raw) {
    if (!raw || !Array.isArray(raw.references) || raw.references.length > 20000) fail('config_copy_invalid');
    const rule = ruleValue(raw.rule);
    const refs = new Map();
    const references = raw.references.map(item => {
      if (!item || !DIMENSIONS.includes(item.kind) || typeof item.token !== 'string' || !ID.test(item.token)
        || refs.has(item.token) || typeof item.label !== 'string' || !item.label || Array.from(item.label).length > 400
        || typeof item.fieldType !== 'string' || item.fieldType.length > 64) fail('config_copy_invalid');
      const value = { token: item.token, kind: item.kind, label: item.label, fieldType: item.fieldType };
      refs.set(item.token, value);
      return value;
    });
    const used = new Set();
    transform(rule, (dimension, token) => {
      if (!refs.has(token) || refs.get(token).kind !== dimension) fail('config_copy_invalid');
      used.add(token);
      return token;
    });
    if (used.size !== refs.size) fail('config_copy_invalid');
    return { rule, references };
  }
  return {
    normalize,
    references(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 20000) fail('config_copy_reference');
      const result = {};
      for (const key of Object.keys(raw).sort()) {
        if (!ID.test(key) || typeof raw[key] !== 'string' || !ID.test(raw[key])) fail('config_copy_reference');
        Object.defineProperty(result, key, { value: raw[key], enumerable: true });
      }
      return result;
    },
    async source(connection, orgId, id) {
      const [rows] = await connection.query(`SELECT * FROM ${table} WHERE org_id = ? AND id = ? FOR SHARE`, [orgId, id]);
      if (!rows.length) fail('config_copy_missing');
      const row = rows[0];
      const rule = ruleValue({ name: row.name, audience: parse(row.audience_json), targets: parse(row.targets_json),
        fieldIds: calendar ? [] : parse(row.field_ids_json), actions: calendar ? parse(row.actions_json) : undefined });
      const data = await directory.catalog(connection, orgId, true);
      try { directoryPolicy.validateReferences(rule, data); } catch (_) { fail('config_copy_reference'); }
      const catalogs = {
        personIds: new Map(data.people.map(item => [item.personId, { label: item.name }])),
        departmentIds: new Map(data.departments.map(item => [item.id, { label: item.name }])),
        identityCategoryIds: new Map(data.identities.map(item => [item.id, { label: item.name }])),
        workGroupIds: new Map(data.workGroups.map(item => [item.id, { label: item.name }])),
        fieldIds: new Map(data.fields.map(item => [item.id, { label: item.label, fieldType: item.type }]))
      };
      const tokens = new Map();
      const references = [];
      const portable = transform(rule, (dimension, sourceId) => {
        const key = dimension + ':' + sourceId;
        if (!tokens.has(key)) {
          const description = catalogs[dimension].get(sourceId);
          if (!description) fail('config_copy_reference');
          const token = 'ref-' + (references.length + 1);
          tokens.set(key, token);
          references.push({ token, kind: dimension, label: description.label, fieldType: description.fieldType || '' });
        }
        return tokens.get(key);
      });
      return normalize({ rule: portable, references });
    },
    async create(connection, orgId, raw, mapping) {
      const payload = normalize(raw);
      if (Object.keys(mapping).length !== payload.references.length
        || payload.references.some(item => !Object.hasOwn(mapping, item.token))) fail('config_copy_reference');
      const rule = ruleValue(transform(payload.rule, (_dimension, token) => mapping[token]));
      try {
        await identity.lockActiveBusinessSubjects(connection, directoryPolicy.referenceIds(rule).map(personId => ({ personId, organizationId: orgId })));
      } catch (error) {
        if (error instanceof identity.IdentityError) fail('config_copy_reference');
        throw error;
      }
      await lockOrganizationDictionaryWrites(orgId, connection);
      const data = await directory.catalog(connection, orgId, true);
      try { directoryPolicy.validateReferences(rule, data); } catch (_) { fail('config_copy_reference'); }
      const fields = new Map(data.fields.map(item => [item.id, item]));
      for (const item of payload.references) {
        if (item.kind === 'fieldIds' && fields.get(mapping[item.token]).type !== item.fieldType) fail('config_copy_reference');
      }
      const [duplicates] = await connection.query(`SELECT id FROM ${table} WHERE org_id = ? AND name = ? FOR UPDATE`, [orgId, rule.name]);
      if (duplicates.length) fail('config_copy_duplicate');
      const id = crypto.randomUUID();
      // 完成映射后仍保持停用，由目标组织在原规则编辑器核对并明确启用。
      if (calendar) {
        await connection.query(`INSERT INTO calendar_rules (id, org_id, name, audience_json, targets_json, actions_json, enabled)
          VALUES (?, ?, ?, ?, ?, ?, 0)`, [id, orgId, rule.name, JSON.stringify(rule.audience), JSON.stringify(rule.targets), JSON.stringify(rule.actions)]);
      } else {
        await connection.query(`INSERT INTO hr_contact_directory_rules (id, org_id, name, audience_json, targets_json, field_ids_json, enabled)
          VALUES (?, ?, ?, ?, ?, ?, 0)`, [id, orgId, rule.name, JSON.stringify(rule.audience), JSON.stringify(rule.targets), JSON.stringify(rule.fieldIds)]);
      }
      return id;
    }
  };
}
module.exports = { createAdapter };
