'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { roleNameNumber } = require('../../locales/zh-CN/authorization');

// 已上线角色编号保持稳定，前缀没有权限含义。
const HISTORICAL_ID_PREFIX = 'compat-rule-';

function idForRule(organizationId, ruleId) {
  const digest = createHash('sha256').update(`${organizationId}:${ruleId}`).digest('hex');
  return HISTORICAL_ID_PREFIX + digest.slice(0, 48);
}

function activeRole(alias) {
  return `NOT EXISTS (SELECT 1 FROM authorization_role_merges merged
    WHERE merged.org_id = ${alias}.org_id AND merged.old_role_id = ${alias}.id)`;
}

async function roleNameExists(connection, organizationId, name, excludedId = '') {
  const [rows] = await connection.query(`SELECT s.id FROM authorization_schemes s
    WHERE s.org_id = ? AND s.name = ? AND s.id <> ? AND ${activeRole('s')} LIMIT 1 FOR UPDATE`,
  [organizationId, name, excludedId]);
  return rows.length > 0;
}

async function nextRoleName(connection, organizationId, requested) {
  const characters = Array.from(requested);
  let candidate = requested;
  for (let index = 2; await roleNameExists(connection, organizationId, candidate); index += 1) {
    const suffix = roleNameNumber(index);
    candidate = characters.slice(0, 80 - suffix.length).join('') + suffix;
  }
  return candidate;
}

async function selectRole(connection, organizationId, rule, previousRoleId) {
  const originalId = idForRule(organizationId, rule.id);
  const options = [...new Set([previousRoleId, originalId].filter(Boolean))];
  const [rows] = await connection.query(`SELECT s.id, v.capabilities_json AS capabilities, ${activeRole('s')} AS active
    FROM authorization_schemes s LEFT JOIN authorization_scheme_versions v
      ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version
    WHERE s.org_id = ? AND s.id IN (?) FOR UPDATE`, [organizationId, options]);
  const byId = new Map(rows.map(row => [row.id, row]));
  const capabilityJson = value => JSON.stringify([...value].sort());
  const wanted = capabilityJson(rule.policy.capabilities);
  const match = options.find(id => {
    const role = byId.get(id);
    if (!role?.active) return false;
    const raw = role.capabilities;
    const actual = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(actual) && capabilityJson(actual) === wanted;
  });
  // 旧客户端仍可单独编辑原授权；调整能力时不触碰已可复用的角色及其他绑定。
  return match ? { id: match, exists: true } : { id: byId.has(originalId) ? randomUUID() : originalId, exists: false };
}

async function bind(connection, organizationId, rule, actorContextId, selected) {
  const role = selected || await selectRole(connection, organizationId, rule);
  if (role.exists) return role.id;
  const capabilityJson = JSON.stringify(rule.policy.capabilities);
  const name = await nextRoleName(connection, organizationId, rule.name);
  await connection.query(`INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
    VALUES (?, ?, ?, ?, 1)`, [role.id, organizationId, name, capabilityJson]);
  await connection.query(`INSERT INTO authorization_scheme_versions
    (id, org_id, scheme_id, version, capabilities_json, actor_context_id) VALUES (?, ?, ?, 1, ?, ?)`,
  [role.id, organizationId, role.id, capabilityJson, actorContextId]);
  return role.id;
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

module.exports = { activeRole, bind, bindOrganization, idForRule, roleNameExists, selectRole };
