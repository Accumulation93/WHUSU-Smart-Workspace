'use strict';

const crypto = require('node:crypto');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');

function fail(code) { throw Object.assign(new Error(code), { code }); }
const DEFINITIONS = Object.freeze({
  'hr.departments': Object.freeze({ table: 'departments', nameLimit: 100 }),
  'hr.identities': Object.freeze({ table: 'identities', nameLimit: 100, identity: true }),
  'hr.workGroups': Object.freeze({ table: 'work_groups', nameLimit: 100, department: true }),
  'hr.assignmentNatures': Object.freeze({ table: 'assignment_natures', nameLimit: 80, nature: true })
});

// SQL标识符仅来自上方固定目录，不接受请求中的表名或字段名。
function createAdapter(kind) {
  const definition = DEFINITIONS[kind];
  if (!definition) fail('config_copy_unsupported');
  function normalize(raw) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()
      || Array.from(raw.name.trim()).length > definition.nameLimit) fail('config_copy_invalid');
    const result = { name: raw.name.trim() };
    if (!definition.nature || Object.prototype.hasOwnProperty.call(raw, 'description')) {
      if (typeof raw.description !== 'string' || Array.from(raw.description).length > 2000) fail('config_copy_invalid');
      result.description = raw.description;
    }
    if (definition.department) {
      if (typeof raw.sourceDepartmentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.sourceDepartmentId)
        || typeof raw.sourceDepartmentName !== 'string' || !raw.sourceDepartmentName) fail('config_copy_invalid');
      result.sourceDepartmentId = raw.sourceDepartmentId;
      result.sourceDepartmentName = raw.sourceDepartmentName;
    }
    if (definition.identity && Object.prototype.hasOwnProperty.call(raw, 'natureReferences')) {
      if (!Array.isArray(raw.natureReferences) || raw.natureReferences.length > 2000 || raw.natureReferences.some(item => !item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(item.id) || typeof item.name !== 'string')
        || new Set(raw.natureReferences.map(item => item.id)).size !== raw.natureReferences.length) fail('config_copy_invalid');
      result.natureReferences = raw.natureReferences.map(item => ({ id: item.id, name: item.name }));
    }
    return result;
  }
  return Object.freeze({
    normalize,
    references(raw) {
      if (definition.identity) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.natureIds)) fail('config_copy_reference');
        const natureIds = require('./identityNature').normalizeIds(raw.natureIds);
        const natureMapping = raw.natureMapping || {};
        if (typeof natureMapping !== 'object' || Array.isArray(natureMapping) || Object.entries(natureMapping).some(([source, target]) => !/^[A-Za-z0-9_-]{1,32}$/.test(source) || typeof target !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(target))) fail('config_copy_reference');
        return { natureIds, natureMapping, impactToken: typeof raw.impactToken === 'string' ? raw.impactToken : '',
          descriptionChoice: raw.descriptionChoice === 'incoming' ? 'incoming' : raw.descriptionChoice === 'existing' ? 'existing' : '' };
      }
      if (!definition.department) {
        if (raw != null && (typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length)) fail('config_copy_reference');
        return {};
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1
        || typeof raw.departmentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.departmentId)) fail('config_copy_reference');
      return { departmentId: raw.departmentId };
    },
    async source(connection, orgId, id) {
      const columns = definition.department ? 'name, description, department_id' : 'name, description';
      const [rows] = await connection.query(`SELECT ${columns} FROM ${definition.table} WHERE org_id = ? AND id = ? FOR SHARE`, [orgId, id]);
      if (!rows.length) fail('config_copy_missing');
      const payload = { name: rows[0].name };
      payload.description = rows[0].description || '';
      if (definition.department) {
        const [departments] = await connection.query('SELECT id, name FROM departments WHERE org_id = ? AND id = ? FOR SHARE', [orgId, rows[0].department_id]);
        if (!departments.length) fail('config_copy_reference');
        payload.sourceDepartmentId = departments[0].id;
        payload.sourceDepartmentName = departments[0].name;
      }
      if (definition.identity) {
        const [natures] = await connection.query('SELECT n.id,n.name FROM identity_nature_links l JOIN assignment_natures n ON n.org_id=l.org_id AND n.id=l.nature_id WHERE l.org_id=? AND l.identity_id=? ORDER BY n.id', [orgId, id]);
        payload.natureReferences = natures;
      }
      return normalize(payload);
    },
    async create(connection, orgId, raw, mapping, reference) {
      const payload = normalize(raw);
      if (definition.identity) {
        const sources = payload.natureReferences || [];
        if (sources.length && (Object.keys(mapping.natureMapping || {}).length !== sources.length || sources.some(item => !mapping.natureMapping[item.id]))) fail('config_copy_reference');
        if (sources.length && JSON.stringify(Array.from(new Set(Object.values(mapping.natureMapping))).sort()) !== JSON.stringify(mapping.natureIds)) fail('config_copy_reference');
        const result = await require('./identityNature').saveInTransaction(connection, {
          newId: crypto.randomUUID(), name: payload.name, description: payload.description,
          organizationId: orgId, authorizationReference: reference, natureIds: mapping.natureIds,
          impactToken: mapping.impactToken, descriptionChoice: mapping.descriptionChoice
        });
        return result.id;
      }
      await lockOrganizationDictionaryWrites(orgId, connection);
      let departmentId = null;
      if (definition.department) {
        // 同名也必须显式映射到目标组织；不得直接沿用来源部门编号。
        if (!mapping || typeof mapping.departmentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(mapping.departmentId)) fail('config_copy_reference');
        const [departments] = await connection.query('SELECT id FROM departments WHERE org_id = ? AND id = ? FOR SHARE', [orgId, mapping.departmentId]);
        if (!departments.length) fail('config_copy_reference');
        departmentId = departments[0].id;
      }
      const [duplicates] = await connection.query(`SELECT id FROM ${definition.table} WHERE org_id = ? AND name = ?`
        + (definition.department ? ' AND department_id = ?' : '') + ' FOR UPDATE',
      definition.department ? [orgId, payload.name, departmentId] : [orgId, payload.name]);
      if (duplicates.length) fail('config_copy_duplicate');
      const id = definition.nature ? crypto.randomBytes(16).toString('hex') : crypto.randomUUID();
      if (definition.nature) {
        await connection.query('INSERT INTO assignment_natures (org_id, id, name, description) VALUES (?, ?, ?, ?)', [orgId, id, payload.name, payload.description || '']);
      } else if (definition.department) {
        await connection.query('INSERT INTO work_groups (org_id, id, name, description, department_id) VALUES (?, ?, ?, ?, ?)',
          [orgId, id, payload.name, payload.description, departmentId]);
      } else {
        await connection.query(`INSERT INTO ${definition.table} (org_id, id, name, description) VALUES (?, ?, ?, ?)`,
          [orgId, id, payload.name, payload.description]);
      }
      return id;
    }
  });
}

module.exports = { createAdapter };
