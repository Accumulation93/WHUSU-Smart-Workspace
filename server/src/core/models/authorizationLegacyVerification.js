'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { listActiveAssignments } = require('../../modules/audit/services/auditAssignmentContext');
const compatibilityRoles = require('./authorizationCompatibilityRole');

const SOURCE = 'legacy_verification';
const MIGRATION_CONTEXT = 'migration:20261124123000';
const ACTION = 'verification_grant_migration';

function ruleId(organizationId, sourceId) {
  return createHash('sha256').update(`legacy-verification:${organizationId}:${sourceId}`).digest('hex');
}

function subjects(rule, assignmentIds) {
  // 原名单允许先登记尚未任职的人。占位仅保存在规则，从不成为候选工作角色。
  return [{ kind: 'assignments', ids: assignmentIds.length ? assignmentIds : ['compat-verifier-' + rule.slice(0, 48)] }];
}

async function readAssignmentIds(connection, organizationId, entries) {
  const hrIds = [...new Set(entries.map(row => row.hrId))];
  const directory = new Map(hrIds.map(hrId => [hrId, []]));
  if (hrIds.length) {
    for (const assignment of await listActiveAssignments(organizationId, { hrIds }, connection)) {
      directory.get(assignment.hr_id)?.push(assignment.assignment_id);
    }
  }
  return directory;
}

async function project(connection, organizationId, rows, rules, lock) {
  const sources = rows.filter(row => row.source_kind === SOURCE && compatibilityRoles.isCompatibilityRole(row.scheme_id));
  if (!sources.length) return rules;
  const [entries] = await connection.query(`SELECT p.id, h.id AS hrId
    FROM audit_verification_permissions p JOIN hr_info h ON h.org_id=p.org_id AND h.id=p.grantee_hr_id
    WHERE p.org_id=? AND p.id IN (?)` + (lock ? ' FOR SHARE' : ''), [organizationId, sources.map(row => row.source_ref)]);
  const directory = await readAssignmentIds(connection, organizationId, entries);
  const sourceById = new Map(entries.map(row => [row.id, row]));
  const assignmentsByRule = new Map();
  for (const row of sources) {
    const entry = sourceById.get(row.source_ref);
    if (entry) assignmentsByRule.set(row.id, directory.get(entry.hrId));
  }
  return rules.map(rule => assignmentsByRule.has(rule.id)
    ? { ...rule, policy: { ...rule.policy, subjects: subjects(rule.id, assignmentsByRule.get(rule.id)) } } : rule);
}

// 仅在旧模式切换事务内调用，组织与旧写入已经串行化。
async function bindForCutover(connection, organizationId) {
  const [entries] = await connection.query(`SELECT p.id, h.id AS hrId, h.name, p.granted_by AS grantedBy, p.created_at AS createdAt
    FROM audit_verification_permissions p JOIN hr_info h ON h.org_id=p.org_id AND h.id=p.grantee_hr_id
    WHERE p.org_id=? ORDER BY p.id FOR UPDATE`, [organizationId]);
  if (!entries.length) return;
  const directory = await readAssignmentIds(connection, organizationId, entries);
  for (const entry of entries) {
    const id = ruleId(organizationId, entry.id);
    const [[recorded]] = await connection.query(`SELECT 1 FROM authorization_changes
      WHERE org_id=? AND target_id=? AND action=? LIMIT 1`, [organizationId, id, ACTION]);
    if (recorded) continue;
    const name = String(entry.name || '').trim().slice(0, 80);
    const policy = { id, organizationId, effect: 'allow', enabled: true, capabilities: ['audit.verification.verify'],
      subjects: subjects(id, directory.get(entry.hrId)), scopes: [{ kind: 'organization' }],
      fields: null, startsAt: null, endsAt: null };
    const schemeId = await compatibilityRoles.bind(connection, organizationId, { id, name, policy }, MIGRATION_CONTEXT);
    await connection.query(`INSERT INTO authorization_rules (id, org_id, name, policy_json, scheme_id, source_kind, source_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, organizationId, name, JSON.stringify(policy), schemeId, SOURCE, entry.id]);
    await connection.query(`INSERT INTO authorization_changes (id, org_id, actor_context_id, action, target_id, before_json, after_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), organizationId, MIGRATION_CONTEXT, ACTION, id,
      JSON.stringify({ id: entry.id, granteeHrId: entry.hrId, grantedBy: entry.grantedBy, createdAt: entry.createdAt }),
      JSON.stringify(policy)]);
  }
}

module.exports = { project, bindForCutover };
