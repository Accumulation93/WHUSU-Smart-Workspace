'use strict';

const pool = require('../../config/db');
const { createAuthorizationSession } = require('../services/authorizationSession');
const { authorizationError } = require('../services/authorizationError');

const READ_CAPABILITIES = ['hr.people.read', 'hr.profileReview.read'];
const WRITE_CAPABILITIES = ['hr.people.update', 'hr.profileReview.approve'];

// 每个候选行是一条真实岗位；范围条件不能跨岗位拼接，返回前再按人合并。
async function directory(reference, options = {}) {
  const run = async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true, profileFields: true });
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const [[currentSession]] = await connection.query('SELECT role FROM auth_sessions WHERE id=? AND account_id=? AND context_id=? AND organization_id=?',
      [reference.sessionId, reference.accountId, reference.contextId, reference.organizationId]);
    const capabilities = options.capabilities || READ_CAPABILITIES;
    if (capabilities.some(key => !READ_CAPABILITIES.concat(WRITE_CAPABILITIES, ['hr.people.export', 'hr.people.delete']).includes(key))) throw authorizationError('authorization_forbidden');
    const resourceType = capability => capability.slice(0, capability.lastIndexOf('.'));
    const scopes = capabilities.map(capability => session.queryScope({ resourceType: resourceType(capability),
      organization: 'c.org_id', id: 'c.id', ownerPersonId: 'c.person_id', assignmentValid: 'c.assignment_valid',
      dimensions: { natureId: 'c.assignment_kind', departmentId: 'c.assignment_department_id',
        identityCategoryId: 'c.assignment_identity_id', workGroupId: 'c.assignment_work_group_id' } }, capability));
    const [rows] = await connection.query(`WITH c AS (
      SELECT h.*, m.id AS membership_id, m.person_id, m.status AS membership_status,
        m.created_at AS joined_at, CASE WHEN m.status='left' THEN m.updated_at ELSE NULL END AS left_at,
        a.id AS assignment_id, a.assignment_kind, a.department_id AS assignment_department_id,
        a.identity_id AS assignment_identity_id, a.work_group_id AS assignment_work_group_id,
        d.name AS assignment_department_name, i.name AS assignment_identity_name,
        w.name AS assignment_work_group_name, n.name AS assignment_nature_name,
        CASE WHEN a.id IS NOT NULL AND m.status='active' AND a.status='active'
          AND d.id IS NOT NULL AND i.id IS NOT NULL AND n.id IS NOT NULL
          AND (a.work_group_id IS NULL OR a.work_group_id='' OR w.id IS NOT NULL) THEN 1 ELSE 0 END AS assignment_valid
      FROM hr_info h JOIN organization_memberships m ON m.legacy_hr_id=h.id AND m.org_id=h.org_id
      LEFT JOIN membership_assignments a ON a.membership_id=m.id AND a.org_id=m.org_id
        AND ((m.status='active' AND a.status='active') OR (m.status='left' AND a.status='revoked'
          AND a.revoked_by_departure_id=m.departure_batch_id))
      LEFT JOIN departments d ON d.id=a.department_id AND d.org_id=a.org_id
      LEFT JOIN identities i ON i.id=a.identity_id AND i.org_id=a.org_id
      LEFT JOIN work_groups w ON w.id=a.work_group_id AND w.org_id=a.org_id AND w.department_id=a.department_id
      LEFT JOIN assignment_natures n ON n.id=a.assignment_kind COLLATE utf8mb4_unicode_ci
        AND n.org_id=a.org_id COLLATE utf8mb4_unicode_ci
      WHERE h.org_id=? AND m.status IN ('active','left') ${options.hrId ? 'AND h.id=?' : ''}
    ) SELECT c.* FROM c WHERE (${scopes.map(scope => '(' + scope.sql + ')').join(' OR ')}) ORDER BY c.name,c.id,c.assignment_id`,
    [reference.organizationId, ...(options.hrId ? [options.hrId] : []), ...scopes.flatMap(scope => scope.params)]);
    const members = new Map();
    for (const row of rows) {
      const assignment = row.assignment_id ? { id: row.assignment_id, organizationId: reference.organizationId,
        personId: row.person_id, active: row.assignment_valid === 1, natureId: row.assignment_kind,
        departmentId: row.assignment_department_id, identityCategoryId: row.assignment_identity_id,
        workGroupId: row.assignment_work_group_id || null } : null;
      const decisions = capabilities.map(capability => session.check({ capability,
        resource: { id: row.id, type: resourceType(capability), organizationId: reference.organizationId,
          ownerPersonId: row.person_id, assignment }, requestedFields: options.requestedFields || [], businessAllowed: true }));
      const allowed = decisions.filter(decision => decision.allowed);
      if (!allowed.length) continue;
      let member = members.get(row.id);
      if (!member) {
        member = { row, fields: new Set(), writableFields: new Set(), reviewFields: new Set(), reviewGrants: [], assignments: [], revision: session.revision, admin: currentSession?.role === 'admin' };
        members.set(row.id, member);
      }
      for (const decision of allowed) decision.fields.forEach(field => member.fields.add(field));
      for (const [capability, destination] of [['hr.people.update', member.writableFields], ['hr.profileReview.approve', member.reviewFields]]) {
        const action = session.check({ capability, resource: { id: row.id, type: resourceType(capability),
          organizationId: reference.organizationId, ownerPersonId: row.person_id, assignment }, businessAllowed: true });
        if (action.allowed) action.fields.forEach(field => destination.add(field));
        if (action.allowed && capability === 'hr.profileReview.approve') member.reviewGrants.push(new Set(action.fields));
      }
      if (assignment && allowed.some(decision => decision.fields.includes('assignments'))) {
        member.assignments.push({ assignmentId: assignment.id, assignmentNature: row.assignment_kind,
          assignmentNatureLabel: row.assignment_nature_name || '', departmentId: assignment.departmentId,
          department: row.assignment_department_name || '', identityCategoryId: assignment.identityCategoryId,
          identityCategoryName: row.assignment_identity_name || '', workGroupId: assignment.workGroupId || '',
          workGroup: row.assignment_work_group_name || '', historical: row.membership_status === 'left',
          assignmentLabel: [row.assignment_identity_name, row.assignment_department_name, row.assignment_work_group_name].filter(Boolean).join(' · ') });
      }
    }
    return { members, revision: session.revision };
  };
  return options.connection ? run(options.connection) : pool.withTransaction(run);
}

function basics(member) {
  const { row, fields, assignments } = member;
  const result = { id: row.id };
  if (fields.has('name')) result.name = row.name || '';
  // 人事业务授权不能突破全局学号保护，即使规则字段中包含学号也同样执行。
  if (fields.has('studentId') && member.admin) result.studentId = row.student_id || '';
  if (fields.has('membershipStatus')) Object.assign(result, { membershipStatus: row.membership_status,
    joinedAt: row.joined_at, leftAt: row.left_at });
  if (fields.has('assignments')) Object.assign(result, { assignments, assignmentCount: assignments.length,
    assignmentNatures: [...new Set(assignments.map(item => item.assignmentNature).filter(Boolean))],
    departments: [...new Set(assignments.map(item => item.department).filter(Boolean))],
    identities: [...new Set(assignments.map(item => item.identityCategoryName).filter(Boolean))],
    workGroups: [...new Set(assignments.map(item => item.workGroup).filter(Boolean))] });
  return result;
}

async function confirm(reference, revision) {
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    if (session.mode !== 'enforced' || session.revision !== revision) throw authorizationError('authorization_forbidden');
  });
}

async function prepareWrite(connection, reference, organizationId) {
  if (!reference) {
    await require('./authorizationBusinessRoute').requireLegacyWrite(connection, organizationId);
    return async () => {};
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true, profileFields: true });
  if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  return async (hrId, capability, fields) => {
    const result = await directory(reference, { connection, hrId, capabilities: [capability], requestedFields: fields });
    if (!result.members.has(hrId)) throw authorizationError('authorization_forbidden');
    return result.members.get(hrId);
  };
}

async function createMember(connection, reference, organizationId) {
  if (!reference) return require('./authorizationBusinessRoute').requireLegacyWrite(connection, organizationId);
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  const decision = session.check({ capability: 'hr.people.create', resource: { type: 'hr.people', organizationId },
    requestedFields: ['name', 'studentId'], businessAllowed: true });
  if (!decision.allowed || session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
}

async function deletionActor(reference, organizationId, hrId, connection) {
  if (!hrId || reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const access = await directory(reference, { hrId, capabilities: ['hr.people.delete'], connection });
  const member = access.members.get(hrId);
  if (!member) throw authorizationError('authorization_forbidden');
  return { personId: reference.personId, contextId: reference.contextId, organizationId,
    businessDeletionAuthorized: true, adminLevel: member.admin ? 'admin' : '', hideProtectedIdentity: !member.admin };
}

async function globalDeletionActor(reference, organizationId, target, connection) {
  const run = async db => {
    if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    const actor = await require('./authorizationIdentity').loadActor(db, reference, true);
    const session = await createAuthorizationSession(db, reference, { lock: true });
    if (!actor?.isSuper || session.mode !== 'enforced' || !session.check({ capability: 'auth.persons.delete',
      resource: { type: 'auth.persons', organizationId }, businessAllowed: true }).allowed) throw authorizationError('authorization_forbidden');
    const [members] = await db.query(`SELECT id FROM organization_memberships WHERE org_id=? AND status IN ('active','left')
      AND (?='' OR person_id=?) AND (?='' OR legacy_hr_id=?) FOR UPDATE`,
    [organizationId, target.personId || '', target.personId || '', target.hrId || '', target.hrId || '']);
    if ((!target.personId && !target.hrId) || members.length !== 1) throw authorizationError('authorization_forbidden');
    return { personId: actor.personId, contextId: actor.contextId, organizationId, adminLevel: 'super_admin' };
  };
  return connection ? run(connection) : pool.withTransaction(run);
}

async function reviewTodos(reference, organizationId, contextId) {
  return pool.withTransaction(async connection => {
    const state = await require('./authorization').read(connection, organizationId);
    if (state.mode === 'shadow') return null;
    const actor = await require('./authorizationIdentity').loadMessageActor(connection, reference, contextId);
    if (state.mode !== 'enforced' || !actor || actor.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
    const catalog = await require('./authorizationProfileFields').catalog(connection, organizationId, require('../services/authorizationCatalog').CATALOG);
    const { preparePolicies, evaluate } = require('../services/authorizationPolicy');
    const prepared = preparePolicies(state.rules.map(rule => rule.policy), catalog);
    const [rows] = await connection.query(`SELECT r.id,r.hr_id,h.name,r.requested_at,r.updated_at,m.person_id,
      a.id AS assignment_id,a.assignment_kind,a.department_id,a.identity_id,a.work_group_id,
      CASE WHEN a.status='active' AND d.id IS NOT NULL AND i.id IS NOT NULL AND n.id IS NOT NULL
        AND (a.work_group_id IS NULL OR a.work_group_id='' OR w.id IS NOT NULL) THEN 1 ELSE 0 END AS valid_assignment
      FROM hr_profile_records r JOIN hr_info h ON h.id=r.hr_id AND h.org_id=r.org_id
      JOIN organization_memberships m ON m.legacy_hr_id=h.id AND m.org_id=h.org_id AND m.status='active'
      LEFT JOIN membership_assignments a ON a.membership_id=m.id AND a.org_id=m.org_id AND a.status='active'
      LEFT JOIN departments d ON d.id=a.department_id AND d.org_id=a.org_id
      LEFT JOIN identities i ON i.id=a.identity_id AND i.org_id=a.org_id
      LEFT JOIN assignment_natures n ON n.id=a.assignment_kind COLLATE utf8mb4_unicode_ci AND n.org_id=a.org_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN work_groups w ON w.id=a.work_group_id AND w.department_id=a.department_id AND w.org_id=a.org_id
      WHERE r.org_id=? AND r.audit_status='pending'`, [organizationId]);
    const [values] = await connection.query(`SELECT v.record_id,v.field_id FROM hr_profile_record_values v
      JOIN hr_profile_records r ON r.id=v.record_id AND r.org_id=v.org_id
      WHERE v.org_id=? AND v.is_pending=1 AND r.audit_status='pending'`, [organizationId]);
    const pendingFields = new Map();
    for (const value of values) {
      if (!pendingFields.has(value.record_id)) pendingFields.set(value.record_id, []);
      pendingFields.get(value.record_id).push('profile:' + value.field_id);
    }
    const result = new Map();
    for (const row of rows) {
      const requestedFields = pendingFields.get(row.id);
      if (!requestedFields?.length) continue;
      const resource = { id: row.hr_id, type: 'hr.profileReview', organizationId, ownerPersonId: row.person_id,
        assignment: row.assignment_id ? { id: row.assignment_id, organizationId, personId: row.person_id,
          active: row.valid_assignment === 1, natureId: row.assignment_kind, departmentId: row.department_id,
          identityCategoryId: row.identity_id, workGroupId: row.work_group_id || null } : null };
      const check = (action, fields) => evaluate({ actor, resource, capability: 'hr.profileReview.' + action,
        requestedFields: fields, catalog, prepared, now: Date.now(), businessAllowed: true }).allowed;
      if (check('read', ['name', ...requestedFields]) && check('approve', requestedFields)) result.set(row.id, row);
    }
    return [...result.values()];
  });
}

async function verifyProfileSnapshot(connection, organizationId, snapshotId, fields) {
  await require('../services/dictionaryUsage').lockOrganizationDictionaryWrites(organizationId, connection);
  const [[snapshot]] = await connection.query('SELECT id FROM org_hr_profile_template_snapshots WHERE org_id=? FOR UPDATE', [organizationId]);
  if (snapshot?.id !== snapshotId) throw authorizationError('authorization_forbidden');
  const [current] = await connection.query('SELECT * FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id=? AND is_active=1 ORDER BY sort_order FOR UPDATE', [snapshotId]);
  if (JSON.stringify(current) !== JSON.stringify(fields)) throw authorizationError('authorization_forbidden');
}

async function importAccess(reference, capability, connection) {
  const run = async db => {
    const session = await createAuthorizationSession(db, reference, { lock: true });
    const type = capability.slice(0, capability.lastIndexOf('.'));
    const check = (key, resourceType) => session.check({ capability: key,
      resource: { type: resourceType, organizationId: reference.organizationId }, businessAllowed: true });
    if (session.mode !== 'enforced' || !check(capability, type).allowed) throw authorizationError('authorization_forbidden');
    const keys = [];
    for (const [key, resourceType] of [['hr.departments', 'hr.departments'], ['hr.identities', 'hr.identities'], ['hr.work_groups', 'hr.workGroups']]) {
      if (check(resourceType + '.create', resourceType).allowed) keys.push(key);
    }
    if (check('hr.assignmentNatures.create', 'hr.assignmentNatures').allowed) keys.push('hr.assignment_natures');
    return { effective: { keys }, revision: session.revision };
  };
  return connection ? run(connection) : pool.withTransaction(run);
}

async function templateAccess(reference, capabilities, connection) {
  const run = async db => {
    const session = await createAuthorizationSession(db, reference, { lock: true });
    const allowed = capabilities.filter(capability => session.check({ capability,
      resource: { type: capability.slice(0, capability.lastIndexOf('.')), organizationId: reference.organizationId }, businessAllowed: true }).allowed);
    if (session.mode !== 'enforced' || !allowed.length) throw authorizationError('authorization_forbidden');
    const effective = { permissions: {} };
    for (const [legacy, capability] of [['hr.profile_templates.manage', 'hr.profileTemplates.update'], ['hr.profile_templates.select', 'hr.profileSelection.update']]) {
      effective.permissions[legacy] = session.check({ capability,
        resource: { type: capability.slice(0, capability.lastIndexOf('.')), organizationId: reference.organizationId }, businessAllowed: true }).allowed;
    }
    return { orgId: reference.organizationId, admin: { id: reference.personId }, effective };
  };
  return connection ? run(connection) : pool.withTransaction(run);
}

async function governanceDirectory(reference, requestedOrganizationId) {
  if (requestedOrganizationId && requestedOrganizationId !== reference.organizationId) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true, profileFields: true });
    const currentActor = await require('./authorizationIdentity').loadActor(connection, reference, true);
    if (session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
    const access = await directory(reference, { connection });
    const source = await require('./personIdentityOverview').listGovernanceDirectory([reference.organizationId], connection);
    const rows = [];
    const totals = { total: 0, verified: 0, pendingVerification: 0, frozen: 0, recoveryRequired: 0 };
    for (const item of source.memberships) {
      const resource = { id: item.account_id || item.person_id, type: 'auth.accounts', organizationId: reference.organizationId,
        ownerPersonId: item.person_id };
      const authRead = session.check({ capability: 'auth.accounts.read', resource, businessAllowed: true }).allowed;
      const authWrite = currentActor?.role === 'admin' && item.membership_status === 'active'
        && session.check({ capability: 'auth.accounts.update', resource, businessAllowed: true }).allowed;
      const governanceResource = { organizationId: reference.organizationId, ownerPersonId: item.person_id };
      const identityResource = { ...governanceResource, type: 'auth.identity' };
      const recoveryResource = { ...governanceResource, type: 'auth.recovery' };
      const identityRead = session.check({ capability: 'auth.identity.read', resource: identityResource, businessAllowed: true }).allowed;
      const recoveryRead = session.check({ capability: 'auth.recovery.read', resource: recoveryResource, businessAllowed: true }).allowed;
      const canVerifyIdentity = item.membership_status === 'active' && session.check({ capability: 'auth.identity.verify', resource: identityResource, businessAllowed: true }).allowed;
      const canRecoverAccount = item.membership_status === 'active' && session.check({ capability: 'auth.recovery.update', resource: recoveryResource, businessAllowed: true }).allowed;
      const showIdentity = identityRead || canVerifyIdentity;
      const showRecovery = recoveryRead || canRecoverAccount;
      const member = access.members.get(item.id);
      if (!member && !authRead && !showIdentity && !showRecovery && !authWrite) continue;
      const result = member ? basics(member) : { id: item.id, name: item.name, membershipStatus: item.membership_status };
      Object.assign(result, { hrId: item.id, organizationId: reference.organizationId, organizationName: item.organization_name,
        canGlobalAccountManage: authWrite, canVerifyIdentity, canRecoverAccount });
      if (authRead || authWrite || showIdentity || showRecovery) {
        const status = ['verified','frozen','recovery_required'].includes(item.account_status) ? item.account_status : 'pending_verification';
        Object.assign(result, { personId: item.person_id, membershipId: item.membership_id, accountId: item.account_id || '',
          auth: { status } });
        if (authRead || authWrite) Object.assign(result, {
          wxBindStatus: item.has_active_binding ? 'bound' : 'unbound',
          auth: { ...result.auth, hasActiveBinding: Boolean(item.has_active_binding), hasBindingHistory: Boolean(item.has_binding_history),
            hasRecoveryCode: Boolean(item.has_recovery_code), hasPassphrase: Boolean(item.has_passphrase),
            activeSessionCount: Number(item.active_session_count || 0), verifiedAt: item.verified_at, recoveryRequiredAt: item.recovery_required_at }
        });
        if (showIdentity) Object.assign(result.auth, { pendingClaimId: item.pending_claim_id || '',
          hasPendingClaim: Boolean(item.has_pending_claim), hasActiveClaimCode: Boolean(item.has_active_claim_code),
          hasActiveInvite: Boolean(item.has_active_invite) });
        if (showRecovery) Object.assign(result.auth, { pendingRecoveryId: item.pending_recovery_id || '',
          hasRecoveryCode: Boolean(item.has_recovery_code) });
        totals[{ verified: 'verified', frozen: 'frozen', recovery_required: 'recoveryRequired', pending_verification: 'pendingVerification' }[status]]++;
      }
      rows.push(result);
    }
    totals.total = rows.length;
    return { status: 'success', rows, capabilities: { canGlobalAccountManage: rows.some(row => row.canGlobalAccountManage),
      canVerifyIdentity: rows.some(row => row.canVerifyIdentity), canRecoverAccount: rows.some(row => row.canRecoverAccount) },
      totals, organizations: [reference.organizationId] };
  });
}

async function personIdentities(reference, hrId) {
  const access = await directory(reference, { hrId });
  const member = access.members.get(hrId);
  if (!member) throw authorizationError('authorization_forbidden');
  const data = await require('./personIdentityOverview').listPersonIdentityData(hrId, [reference.organizationId], [reference.organizationId]);
  if (!data) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    const current = await require('./authorizationIdentity').loadActor(connection, reference, true);
    if (session.mode !== 'enforced' || session.revision !== access.revision || !current) throw authorizationError('authorization_forbidden');
    const active = member.row.membership_status === 'active';
    const assignments = member.assignments.map(item => {
      const resource = { id: item.assignmentId, type: 'hr.assignments', organizationId: reference.organizationId,
        ownerPersonId: member.row.person_id, assignment: { id: item.assignmentId, organizationId: reference.organizationId,
          personId: member.row.person_id, active, natureId: item.assignmentNature, departmentId: item.departmentId,
          identityCategoryId: item.identityCategoryId, workGroupId: item.workGroupId || null } };
      const update = session.check({ capability: 'hr.assignments.update', resource, businessAllowed: active });
      return { ...item, id: item.assignmentId, assignmentKind: item.assignmentNature, identityId: item.identityCategoryId,
        identity: item.identityCategoryName, canEdit: update.allowed, writableFields: update.allowed ? update.fields : [],
        canDelete: session.check({ capability: 'hr.assignments.delete', resource, businessAllowed: active }).allowed };
    });
    const canCreate = active && session.hasExplicitEntry('hr.assignments.create');
    const grantDecision = (grant, action) => session.check({ capability: 'system.adminAccounts.' + action,
      resource: { id: grant?.legacy_admin_id || '', type: 'system.adminAccounts', organizationId: reference.organizationId },
      businessAllowed: current.role === 'admin' && (!grant || grant.org_id === reference.organizationId || (current.isSuper && grant.org_id === '')) }).allowed;
    const grants = data.grants.filter(grant => grantDecision(grant, 'read')).map(grant => ({ id: grant.legacy_admin_id,
      grantId: grant.id, adminLevel: grant.admin_level,
      adminLevelLabel: require('../../locales/zh-CN/core/personnel')[grant.admin_level === 'super_admin' ? 'superAdministrator' : 'regularAdministrator'],
      canDelete: grantDecision(grant, 'delete'), organizationId: grant.org_id }));
    const dictionaries = canCreate || assignments.some(item => item.canEdit) ? data.dictionaries : { departments: [], identities: [], workGroups: [], assignmentNatures: [] };
    const publicDictionaries = Object.fromEntries(Object.entries(dictionaries).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, name: row.name,
      ...(key === 'workGroups' ? { departmentId: row.department_id } : {}) }))]));
    const person = basics(member);
    return { status: 'success', person: { name: person.name, ...(person.studentId !== undefined ? { studentId: person.studentId } : {}) },
      organizations: [{ organizationId: reference.organizationId, organizationName: data.memberships[0]?.organization_name || '', hrId,
        membershipStatus: member.row.membership_status, canReadAssignments: member.fields.has('assignments'),
        canEditAssignments: canCreate || assignments.some(item => item.canEdit || item.canDelete), canAddAssignment: canCreate,
        assignments, canReadAdmins: grants.length > 0, canEditAdmins: grantDecision(null, 'create'),
        canAddAdmin: active && grantDecision(null, 'create') && !grants.some(grant => grant.organizationId),
        adminIdentities: grants.filter(grant => grant.organizationId),
        dictionaries: { ...publicDictionaries, identityCategories: publicDictionaries.identities } }],
      globalAdminIdentities: grants.filter(grant => !grant.organizationId), managementOrganizationId: reference.organizationId,
      canAddGlobalSuperAdmin: current.isSuper && grantDecision(null, 'create') && !grants.some(grant => !grant.organizationId) };
  });
}

async function exportTable(reference, payload) {
  const access = await directory(reference, { capabilities: ['hr.people.export'] });
  const copy = require('../../locales/zh-CN/hrImport');
  const members = [...access.members.values()].filter(member => member.row.membership_status === 'active');
  const template = await require('./hrProfileTemplate').getActiveSnapshot();
  const fields = payload.includeProfile && template ? await require('./hrProfileField').getByTemplateId(template.id) : [];
  const visible = new Map(members.map(member => [member.row.id, new Set(visibleProfileFields(member, fields).map(field => field.id))]));
  const exportedFields = fields.filter(field => members.some(member => visible.get(member.row.id).has(field.id)));
  const basic = [['name', 'name'], ['studentId', 'studentId'], ['nature', 'assignments'], ['department', 'assignments'], ['identity', 'assignments'], ['workGroup', 'assignments']]
    .filter(([key, permission]) => members.some(member => member.fields.has(permission) && (key !== 'studentId' || member.admin)));
  const data = [];
  const valueMaps = new Map();
  if (members.length && exportedFields.length) {
    const [values] = await pool.query(`SELECT r.hr_id,v.field_id,v.field_value FROM hr_profile_records r
      JOIN hr_profile_record_values v ON v.record_id=r.id AND v.org_id=r.org_id AND v.is_pending=0
      WHERE r.org_id=? AND r.hr_id IN (?) AND v.field_id IN (?)`,
    [reference.organizationId, members.map(member => member.row.id), exportedFields.map(field => field.id)]);
    for (const value of values) {
      if (!valueMaps.has(value.hr_id)) valueMaps.set(value.hr_id, new Map());
      valueMaps.get(value.hr_id).set(value.field_id, value.field_value);
    }
  }
  for (const member of members) {
    const person = basics(member);
    const valueMap = valueMaps.get(member.row.id) || new Map();
    const assignments = person.assignments?.length ? person.assignments : [null];
    for (const assignment of assignments) {
      const cells = { name: person.name, studentId: person.studentId, nature: assignment?.assignmentNatureLabel,
        department: assignment?.department, identity: assignment?.identityCategoryName, workGroup: assignment?.workGroup };
      data.push(basic.map(([key]) => cells[key] || '').concat(exportedFields.map(field => visible.get(member.row.id).has(field.id) ? valueMap.get(field.id) || '' : '')));
    }
  }
  await confirm(reference, access.revision);
  const headers = basic.map(([key]) => copy[key]).concat(exportedFields.map(field => field.label));
  if (payload.format === 'xlsx') {
    const buffer = await require('../../utils/excelFile').buildWorkbookBuffer(copy.maintenanceFile, [headers, ...data]);
    return { status: 'success', fileBase64: buffer.toString('base64'), extension: 'xlsx', instructions: [] };
  }
  return { status: 'success', headers, rows: data, instructions: [] };
}

function visibleProfileFields(member, fields) {
  return fields.filter(field => member.fields.has('profile:' + field.id)
    && (member.admin || !/(学号|学生号|student.?id|password|口令|密码|恢复码|认证码|openid|身份证)/i.test(field.label)));
}

function profileRow(row, member, fields, emptySummary) {
  const result = basics(member);
  const visible = visibleProfileFields(member, fields);
  const keys = new Set(visible.map(field => field.id));
  const project = source => Object.fromEntries(Object.entries(source || {}).filter(([key]) => keys.has(key)));
  result.currentValues = project(row.currentValues);
  result.pendingValues = project(row.pendingValues);
  const summarize = values => visible.map(field => values[field.id] ? field.label + '：' + values[field.id] : '').filter(Boolean).join('；');
  result.currentSummary = summarize(result.currentValues) || emptySummary;
  result.pendingSummary = summarize(result.pendingValues);
  if (member.fields.has('reviewStatus')) {
    for (const key of ['recordId', 'auditStatus', 'reviewStatus', 'auditStatusText', 'rejectionReason', 'hasPending',
      'selfSubmittedAt', 'selfSubmittedByName', 'maintainedAt', 'maintainedByName', 'lastChangedAt']) result[key] = row[key];
    result.hasPending = row.hasPending && Object.keys(result.pendingValues).length > 0;
  }
  const missing = new Set(row.missingRequiredFieldIds || []);
  result.missingRequiredFieldIds = visible.filter(field => missing.has(field.id)).map(field => field.id);
  result.isComplete = result.missingRequiredFieldIds.length === 0;
  result.writableFieldIds = visible.filter(field => member.writableFields.has('profile:' + field.id)).map(field => field.id);
  result.canManagePeople = result.writableFieldIds.length > 0;
  const pendingIds = Object.keys(row.pendingValues || {});
  result.canReviewProfiles = pendingIds.length > 0 && pendingIds.every(id => keys.has(id))
    && member.reviewGrants.some(grant => pendingIds.every(id => grant.has('profile:' + id)));
  if (result.assignments) {
    result.department = result.departments.join('、');
    result.identity = result.identities.join('、');
    result.workGroup = result.workGroups.join('、');
  }
  return result;
}

module.exports = { directory, basics, confirm, prepareWrite, createMember, deletionActor, globalDeletionActor, reviewTodos, verifyProfileSnapshot, importAccess, templateAccess, governanceDirectory, personIdentities, exportTable, visibleProfileFields, profileRow };
