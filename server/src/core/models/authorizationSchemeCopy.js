'use strict';

const { CATALOG } = require('../services/authorizationCatalog');
const model = require('./authorization');
const { activeRole, roleNameExists } = require('./authorizationRoleBackfill');
const { createGuard } = require('../services/authorizationManagement');
const relationshipRole = require('./authorizationRelationshipRole');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function normalize(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || Array.from(raw.name.trim()).length > 80
    || !Array.isArray(raw.capabilities) || !raw.capabilities.length || raw.capabilities.length > CATALOG.size
    || raw.capabilities.some(key => typeof key !== 'string' || !CATALOG.has(key) || CATALOG.get(key).businessOnly)) fail('config_copy_invalid');
  return { name: raw.name.trim(), capabilities: [...new Set(raw.capabilities)].sort() };
}
module.exports = {
  normalize,
  references(raw) {
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length)) fail('config_copy_reference');
    return {};
  },
  async source(connection, orgId, id) {
    if ((await relationshipRole.read(connection, orgId, true))?.schemeId === id) fail('authorization_forbidden');
    const [rows] = await connection.query(`SELECT s.name, v.capabilities_json FROM authorization_schemes s
      JOIN authorization_scheme_versions v ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version
      WHERE s.org_id = ? AND s.id = ? AND ${activeRole('s')} FOR SHARE`, [orgId, id]);
    if (!rows.length) fail('config_copy_missing');
    return normalize({ name: rows[0].name, capabilities: typeof rows[0].capabilities_json === 'string'
      ? JSON.parse(rows[0].capabilities_json) : rows[0].capabilities_json });
  },
  async create(connection, orgId, raw, _mapping, reference) {
    const payload = normalize(raw);
    await model.lockOrganization(connection, orgId);
    if (await roleNameExists(connection, orgId, payload.name)) fail('config_copy_duplicate');
    // 复用原方案保存的委托边界；复制不发布、不复制绑定规则或分配权。
    const scheme = await model.saveScheme(payload, orgId, createGuard(reference), connection);
    return scheme.id;
  }
};
