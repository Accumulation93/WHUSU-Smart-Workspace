'use strict';

const { createHash, randomUUID } = require('node:crypto');

const PREFIX = 'compat-rule-';

function idForRule(organizationId, ruleId) {
  const digest = createHash('sha256').update(`${organizationId}:${ruleId}`).digest('hex');
  return PREFIX + digest.slice(0, 48);
}

function isCompatibilityRole(id) {
  return typeof id === 'string' && id.startsWith(PREFIX);
}

async function bind(connection, organizationId, rule, actorContextId) {
  const roleId = idForRule(organizationId, rule.id);
  const [rows] = await connection.query(`SELECT s.published_version AS version, v.capabilities_json AS capabilities
    FROM authorization_schemes s JOIN authorization_scheme_versions v
      ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version
    WHERE s.org_id = ? AND s.id = ? FOR UPDATE`, [organizationId, roleId]);
  const current = rows[0];
  const capabilityJson = JSON.stringify(rule.policy.capabilities);
  if (current && JSON.stringify(typeof current.capabilities === 'string'
    ? JSON.parse(current.capabilities) : current.capabilities) === capabilityJson) return roleId;
  const version = current ? Number(current.version) + 1 : 1;
  if (!current) {
    await connection.query(`INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
      VALUES (?, ?, ?, ?, ?)`, [roleId, organizationId, rule.name, capabilityJson, version]);
  } else {
    await connection.query(`UPDATE authorization_schemes SET name = ?, draft_capabilities_json = ?,
      published_version = ?, version = version + 1 WHERE org_id = ? AND id = ?`,
    [rule.name, capabilityJson, version, organizationId, roleId]);
  }
  await connection.query(`INSERT INTO authorization_scheme_versions
    (id, org_id, scheme_id, version, capabilities_json, actor_context_id) VALUES (?, ?, ?, ?, ?, ?)`,
  [version === 1 ? roleId : randomUUID(), organizationId, roleId, version, capabilityJson, actorContextId]);
  return roleId;
}

async function bindOrganization(connection, organizationId, actorContextId) {
  const [rules] = await connection.query(`SELECT id, name, policy_json AS policy FROM authorization_rules
    WHERE org_id = ? AND scheme_id IS NULL ORDER BY id FOR UPDATE`, [organizationId]);
  for (const rule of rules) {
    if (typeof rule.policy === 'string') rule.policy = JSON.parse(rule.policy);
    const roleId = await bind(connection, organizationId, rule, actorContextId);
    await connection.query('UPDATE authorization_rules SET scheme_id = ?, updated_at = updated_at WHERE org_id = ? AND id = ?',
      [roleId, organizationId, rule.id]);
  }
}

module.exports = { bind, bindOrganization, idForRule, isCompatibilityRole };
