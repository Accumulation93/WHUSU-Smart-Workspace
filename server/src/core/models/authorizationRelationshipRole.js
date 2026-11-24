'use strict';

const { createHash } = require('node:crypto');
const { CATALOG } = require('../services/authorizationCatalog');
const copy = require('../../locales/zh-CN/authorization');

const CAPABILITIES = [...CATALOG.values()].filter(item => item.businessRoles.includes('user')).map(item => item.key).sort();
const CAPABILITY_SET = new Set(CAPABILITIES);

function schemeIdFor(organizationId) {
  return 'member-role-' + createHash('sha256').update(organizationId).digest('hex').slice(0, 48);
}

function decodeCapabilities(value) {
  const values = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(values) ? values.filter(key => CAPABILITY_SET.has(key)) : [];
}

async function read(connection, organizationId, lock = false) {
  try {
    const [rows] = await connection.query(`SELECT b.scheme_id AS schemeId, b.enabled, s.name,
      s.published_version AS publishedVersion, v.capabilities_json AS capabilities
      FROM authorization_relationship_role_assignments b
      LEFT JOIN authorization_schemes s ON s.id = b.scheme_id AND s.org_id = b.org_id
      LEFT JOIN authorization_scheme_versions v ON v.scheme_id = s.id AND v.org_id = s.org_id AND v.version = s.published_version
      WHERE b.org_id = ?${lock ? ' FOR SHARE' : ''}`, [organizationId]);
    if (!rows[0]) return null;
    const row = rows[0];
    return { schemeId: row.schemeId, name: row.name, enabled: Boolean(row.enabled && row.capabilities != null),
      capabilities: decodeCapabilities(row.capabilities) };
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    return undefined;
  }
}

function assignment(relationship, organizationId) {
  return relationship ? { id: organizationId, schemeId: relationship.schemeId, subject: 'organizationMembers',
    scope: 'businessRelationship', enabled: relationship.enabled } : null;
}

function disabledCapabilities(relationship) {
  const enabled = new Set(relationship?.enabled ? relationship.capabilities : []);
  return new Set(CAPABILITIES.filter(key => !enabled.has(key)));
}

async function syncExclusions(connection, organizationId, capabilities) {
  // 回退到上一服务版本仍能读取相同结果。新版本只从关联角色读取权限。
  if (capabilities.length) await connection.query(`DELETE FROM authorization_basic_role_exclusions
    WHERE org_id = ? AND capability_key IN (?)`, [organizationId, capabilities]);
  const excluded = [...disabledCapabilities({ enabled: true, capabilities })];
  if (excluded.length) await connection.query(`INSERT IGNORE INTO authorization_basic_role_exclusions (org_id, capability_key)
    VALUES ?`, [excluded.map(key => [organizationId, key])]);
}

async function initialize(connection, organizationId) {
  if (await read(connection, organizationId) !== null) return;
  const schemeId = schemeIdFor(organizationId);
  const capabilities = JSON.stringify(CAPABILITIES);
  await connection.query(`INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
    VALUES (?, ?, ?, ?, 1)`, [schemeId, organizationId, copy.unified.memberRelationshipRoleName, capabilities]);
  await connection.query(`INSERT INTO authorization_scheme_versions (id, org_id, scheme_id, version, capabilities_json, actor_context_id)
    VALUES (?, ?, ?, 1, ?, 'system:organization_init')`, [schemeId, organizationId, schemeId, capabilities]);
  await connection.query(`INSERT INTO authorization_relationship_role_assignments (org_id, scheme_id) VALUES (?, ?)`,
    [organizationId, schemeId]);
}

module.exports = { CAPABILITIES, CAPABILITY_SET, read, schemeIdFor, assignment, disabledCapabilities, syncExclusions, initialize };
