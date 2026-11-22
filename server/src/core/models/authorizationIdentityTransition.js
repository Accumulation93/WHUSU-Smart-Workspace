'use strict';

const { createHash } = require('node:crypto');
const { authorizationError } = require('../services/authorizationError');
const { UNIFIED_PROTOCOL } = require('../services/authorizationIdentityModel');
const { assignmentPredicate } = require('./identityNatureEligibility');

const SHA = /^[a-f0-9]{40}$/;
const digestBindings = rows => createHash('sha256')
  .update(JSON.stringify(rows.map(({ organizationId, grantId, assignmentId }) => [organizationId, grantId, assignmentId]))).digest('hex');
const validAssignmentJoins = `
    JOIN departments d ON d.id = a.department_id AND d.org_id = a.org_id
    JOIN identities i ON i.id = a.identity_id AND i.org_id = a.org_id
    JOIN assignment_natures n ON n.id = a.assignment_kind COLLATE utf8mb4_unicode_ci
      AND n.org_id = a.org_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN work_groups w ON w.id = a.work_group_id AND w.org_id = a.org_id AND w.department_id = a.department_id`;
const validAssignmentClause = `a.status = 'active' AND ${assignmentPredicate('a')}
    AND (a.work_group_id IS NULL OR a.work_group_id = '' OR w.id IS NOT NULL)`;

async function isUnified(connection) {
  try {
    const [[row]] = await connection.query('SELECT phase, minimum_protocol FROM authorization_runtime_transition WHERE id=1');
    return row?.phase === 'enforced' && Number(row.minimum_protocol) >= UNIFIED_PROTOCOL;
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    return false;
  }
}

async function linkedGrants(connection, actor, lock) {
  const [rows] = await connection.query(`SELECT l.admin_grant_id AS id FROM authorization_identity_assignment_links l
    JOIN admin_grants g ON g.id=l.admin_grant_id AND g.org_id=l.org_id AND g.person_id=? AND g.admin_level='admin' AND g.status='active'
    WHERE l.org_id=? AND l.assignment_id=? ORDER BY l.admin_grant_id${lock ? ' FOR UPDATE' : ''}`,
  [actor.personId, actor.organizationId, actor.assignment.id]);
  return rows.map(row => row.id);
}

async function linkedGrantsForAssignments(connection, organizationId, assignmentIds, lock) {
  if (!assignmentIds.length) return new Map();
  const [rows] = await connection.query(`SELECT l.assignment_id AS assignmentId,l.admin_grant_id AS grantId
    FROM authorization_identity_assignment_links l
    JOIN membership_assignments a ON a.id=l.assignment_id AND a.org_id=l.org_id
    JOIN organization_memberships m ON m.id=a.membership_id AND m.org_id=a.org_id
    JOIN admin_grants g ON g.id=l.admin_grant_id AND g.org_id=l.org_id AND g.person_id=m.person_id
      AND g.admin_level='admin' AND g.status='active'
    WHERE l.org_id=? AND l.assignment_id IN (${assignmentIds.map(() => '?').join(',')})
    ORDER BY l.assignment_id,l.admin_grant_id${lock ? ' FOR UPDATE' : ''}`, [organizationId, ...assignmentIds]);
  const grants = new Map();
  for (const row of rows) {
    if (!grants.has(row.assignmentId)) grants.set(row.assignmentId, []);
    grants.get(row.assignmentId).push(row.grantId);
  }
  return grants;
}

async function linkedAssignments(connection, organizationId, grantId, personId, lock) {
  const [rows] = await connection.query(`SELECT a.id, a.org_id AS organizationId, m.person_id AS personId,
    a.assignment_kind AS natureId, a.department_id AS departmentId,
    a.identity_id AS identityCategoryId, a.work_group_id AS workGroupId, m.legacy_hr_id AS legacyHrId
    FROM authorization_identity_assignment_links l
    JOIN membership_assignments a ON a.id=l.assignment_id AND a.org_id=l.org_id
    JOIN organization_memberships m ON m.id=a.membership_id AND m.org_id=a.org_id AND m.status='active'
    ${validAssignmentJoins}
    WHERE l.org_id=? AND l.admin_grant_id=? AND m.person_id=? AND ${validAssignmentClause}
    ORDER BY a.created_at, a.id${lock ? ' FOR UPDATE' : ''}`, [organizationId, grantId, personId]);
  return rows;
}

async function activeLinksForPerson(connection, personId) {
  const [rows] = await connection.query(`SELECT l.org_id AS organizationId, l.admin_grant_id AS grantId, l.assignment_id AS assignmentId
    FROM authorization_identity_assignment_links l
    JOIN admin_grants g ON g.id=l.admin_grant_id AND g.org_id=l.org_id AND g.person_id=?
      AND g.admin_level='admin' AND g.status='active'`, [personId]);
  return rows;
}

async function inspect(connection) {
  const [grants] = await connection.query(`SELECT g.id, g.org_id AS organizationId, g.person_id AS personId
    FROM admin_grants g JOIN organizations o ON o.id=g.org_id COLLATE utf8mb4_unicode_ci
    WHERE g.admin_level='admin' AND g.status='active' ORDER BY g.org_id,g.id`);
  const [assignments] = await connection.query(`SELECT g.id AS grantId, g.org_id AS organizationId, a.id AS assignmentId,
    m.person_id AS personId,a.assignment_kind AS natureId,a.department_id AS departmentId,
    a.identity_id AS identityCategoryId,a.work_group_id AS workGroupId
    FROM admin_grants g JOIN organizations o ON o.id=g.org_id COLLATE utf8mb4_unicode_ci
    JOIN organization_memberships m ON m.person_id=g.person_id AND m.org_id=g.org_id AND m.status='active'
    JOIN membership_assignments a ON a.membership_id=m.id AND a.org_id=m.org_id
    ${validAssignmentJoins}
    WHERE g.admin_level='admin' AND g.status='active' AND ${validAssignmentClause}
    ORDER BY g.org_id,g.id,a.id`);
  const mapped = new Set(assignments.map(row => row.grantId));
  const blockers = grants.filter(row => !mapped.has(row.id))
    .map(row => ({ organizationId: row.organizationId, adminGrantId: row.id }));
  return {
    digest: digestBindings(assignments),
    grantCount: grants.length,
    assignmentCount: assignments.length,
    blockers,
    assignments
  };
}

function summary({ digest, grantCount, assignmentCount, blockers }) {
  return { digest, grantCount, assignmentCount, blockers };
}

async function lockTransition(connection) {
  const [[transition]] = await connection.query('SELECT phase,minimum_protocol FROM authorization_runtime_transition WHERE id=1 FOR UPDATE');
  if (!transition || transition.phase !== 'enforced') throw authorizationError('authorization_transition_invalid');
  return transition;
}

async function lockSources(connection) {
  // 字典和岗位写入均先取组织锁。切换期间同时锁定旧授权，避免复核和生效之间变更。
  await connection.query('SELECT id FROM organizations ORDER BY id FOR UPDATE');
  await connection.query("SELECT id FROM admin_grants WHERE admin_level='admin' ORDER BY org_id,id FOR UPDATE");
}

async function currentBindings(connection) {
  const [rows] = await connection.query(`SELECT org_id AS organizationId,admin_grant_id AS grantId,assignment_id AS assignmentId
    FROM authorization_identity_assignment_links ORDER BY org_id,admin_grant_id,assignment_id FOR UPDATE`);
  return rows;
}

async function compareAuthorization(connection, result) {
  const { CATALOG } = require('../services/authorizationCatalog');
  const { normalizePolicy, evaluate } = require('../services/authorizationPolicy');
  const storage = require('./authorization');
  const organizations = new Map();
  for (const assignment of result.assignments) {
    let grants = organizations.get(assignment.organizationId);
    if (!grants) organizations.set(assignment.organizationId, grants = new Map());
    if (!grants.has(assignment.grantId)) grants.set(assignment.grantId, []);
    grants.get(assignment.grantId).push(assignment);
  }
  const differences = [];
  const specialRestrictions = [];
  let comparisons = 0;
  const now = Date.now();
  for (const [organizationId, grants] of organizations) {
    const catalog = await require('./authorizationProfileFields').catalog(connection, organizationId, CATALOG);
    const state = await storage.read(connection, organizationId, true);
    if (state.mode !== 'enforced') {
      differences.push({ organizationId, reason: 'legacy_organization_not_enforced' });
      continue;
    }
    const policies = state.rules.map(entry => normalizePolicy(entry.policy, catalog));
    for (const [grantId, assignments] of grants) {
      const personId = assignments[0].personId;
      const base = { role: 'admin', active: true, organizationId, personId, adminGrantId: grantId };
      const relevant = policies.filter(policy => policy.subjects.some(subject => subject.kind === 'adminGrants' && subject.ids.includes(grantId)));
      for (const policy of relevant) {
        if (!policy.enabled) continue;
        for (const capability of policy.capabilities) {
          const definition = catalog.get(capability);
          for (const scope of policy.scopes) {
            if (scope.kind === 'assignmentScope' && Object.values(scope.dimensions).includes('same')) {
              differences.push({ organizationId, grantId, policyId: policy.id, capability, reason: 'relative_legacy_scope' });
              continue;
            }
            const relatedPosition = { active: true, organizationId };
            if (scope.kind === 'assignmentScope') for (const [key, values] of Object.entries(scope.dimensions)) relatedPosition[key] = values[0];
            const sampleTime = policy.startsAt ? Math.max(now, Date.parse(policy.startsAt)) : now;
            if (policy.endsAt && sampleTime >= Date.parse(policy.endsAt)) continue;
            for (const value of scope.ids || ['']) {
              const resource = { organizationId, type: definition.resourceType, assignment: relatedPosition,
                id: scope.kind === 'records' ? value : '',
                ownerPersonId: scope.kind === 'self' ? personId : scope.kind === 'people' ? value : '' };
              const input = { resource, capability, catalog, policies, now: sampleTime, businessAllowed: true };
              const adminBefore = evaluate({ ...input, actor: base });
              for (const { assignmentId: id, natureId, departmentId, identityCategoryId, workGroupId } of assignments) {
                const actor = { role: 'user', active: true, organizationId, personId,
                  assignment: { active: true, id, organizationId, personId, natureId, departmentId, identityCategoryId, workGroupId } };
                const ordinaryBefore = evaluate({ ...input, actor });
                const after = evaluate({ ...input, actor: { ...actor, unifiedAuthorization: true, legacyAdminGrantIds: [grantId] } });
                const expectedFields = new Set([...adminBefore.fields, ...ordinaryBefore.fields]);
                comparisons++;
                if (after.allowed !== (adminBefore.allowed || ordinaryBefore.allowed) || after.fields.length !== expectedFields.size
                  || after.fields.some(field => !expectedFields.has(field))) {
                  const difference = { organizationId, grantId, policyId: policy.id, assignmentId: id, capability, reason: after.reason };
                  if (definition.classification === 'special' && !after.allowed && (adminBefore.allowed || ordinaryBefore.allowed)) {
                    specialRestrictions.push(difference);
                  } else {
                    differences.push(difference);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return { valid: differences.length === 0, comparisons, differences, specialRestrictions };
}

async function stage(pool) {
  return pool.withTransaction(async connection => {
    const state = await lockTransition(connection);
    if (Number(state.minimum_protocol) >= UNIFIED_PROTOCOL) throw authorizationError('authorization_migration_already_enforced');
    await lockSources(connection);
    const result = await inspect(connection);
    if (result.blockers.length) return { ...summary(result), staged: false };
    const [[previous]] = await connection.query('SELECT comparison_digest FROM authorization_identity_stage WHERE id=1 FOR UPDATE');
    if (previous?.comparison_digest === result.digest && digestBindings(await currentBindings(connection)) === result.digest) {
      return { ...summary(result), staged: true, changed: false };
    }
    await connection.query('DELETE FROM authorization_identity_assignment_links WHERE org_id IS NOT NULL');
    const width = 100;
    for (let offset = 0; offset < result.assignments.length; offset += width) {
      const batch = result.assignments.slice(offset, offset + width);
      await connection.query(`INSERT INTO authorization_identity_assignment_links(org_id,admin_grant_id,assignment_id)
        VALUES ${batch.map(() => '(?,?,?)').join(',')}`, batch.flatMap(row => [row.organizationId, row.grantId, row.assignmentId]));
    }
    await connection.query(`INSERT INTO authorization_identity_stage(id,comparison_digest) VALUES (1,?)
      ON DUPLICATE KEY UPDATE comparison_digest=VALUES(comparison_digest),staged_at=UTC_TIMESTAMP(3)`, [result.digest]);
    return { ...summary(result), staged: true, changed: true };
  });
}

async function activate(pool, release, verifyDeployment, verifyEquivalence) {
  if (!release || !SHA.test(release.compatibleSha || '') || !SHA.test(release.fallbackSha || '')
    || release.compatibleSha === release.fallbackSha || typeof verifyDeployment !== 'function'
    || typeof verifyEquivalence !== 'function') throw authorizationError('authorization_deployment_required');
  const proof = { ...release, protocol: UNIFIED_PROTOCOL };
  if (await verifyDeployment(proof) !== true) throw authorizationError('authorization_deployment_not_ready');
  return pool.withTransaction(async connection => {
    const state = await lockTransition(connection);
    if (Number(state.minimum_protocol) === UNIFIED_PROTOCOL) return { changed: false, protocol: UNIFIED_PROTOCOL };
    if (Number(state.minimum_protocol) > UNIFIED_PROTOCOL) throw authorizationError('authorization_release_incompatible');
    await lockSources(connection);
    const result = await inspect(connection);
    const [[staged]] = await connection.query('SELECT comparison_digest FROM authorization_identity_stage WHERE id=1 FOR UPDATE');
    const bindingDigest = digestBindings(await currentBindings(connection));
    if (result.blockers.length || staged?.comparison_digest !== result.digest || bindingDigest !== result.digest) {
      throw authorizationError('authorization_migration_stale');
    }
    const equivalence = await verifyEquivalence(connection, result);
    if (!equivalence || equivalence.valid !== true) throw authorizationError('authorization_migration_unreviewed');
    if (await verifyDeployment(proof) !== true) throw authorizationError('authorization_deployment_not_ready');
    await connection.query(`UPDATE authorization_runtime_transition SET minimum_protocol=?, compatible_sha=?, fallback_sha=?,
      comparison_json=?, activated_at=UTC_TIMESTAMP(3) WHERE id=1`, [UNIFIED_PROTOCOL, release.compatibleSha, release.fallbackSha,
      JSON.stringify({ assignments: summary(result), equivalence })]);
    await connection.query('UPDATE authorization_organizations SET revision=revision+1 WHERE org_id IN (SELECT id FROM organizations)');
    return { changed: true, ...proof, ...summary(result), equivalence };
  });
}

module.exports = { isUnified, linkedGrants, linkedGrantsForAssignments, linkedAssignments, activeLinksForPerson,
  inspect, summary, compareAuthorization, stage, activate };
