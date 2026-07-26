const pool = require('../../config/db');
const { safeString } = require('../../utils/helpers');
const adminInfoModel = require('../models/adminInfo');
const organizationModel = require('../models/organization');

const ACTIVE_ROLES = new Set(['user', 'admin']);

function buildUserActor(openid, hr, binding) {
  return {
    type: 'user',
    id: safeString(hr.id),
    openid,
    name: safeString(hr.name),
    userInfoId: safeString(binding && binding.id),
    profile: hr
  };
}

function buildAdminActor(openid, admin) {
  return {
    type: 'admin',
    id: safeString(admin.id),
    openid,
    adminLevel: safeString(admin.admin_level),
    name: safeString(admin.name),
    profile: admin
  };
}

async function loadUserActorMap(openid, organizations) {
  const [boundRows] = await pool.query(
    `SELECT ui.id AS user_info_id, ui.org_id AS binding_org_id,
            h.id, h.name, h.student_id, h.department_id, h.identity_id,
            h.work_group_id, h.org_id, h.created_at, h.updated_at
       FROM user_info ui
       JOIN hr_info h ON h.id = ui.hr_id AND h.org_id = ui.org_id
      WHERE ui.openid = ? AND ui.hr_id != ''`,
    [openid]
  );
  if (!boundRows.length || !organizations.length) return new Map();

  const identityKeys = new Map();
  for (const row of boundRows) {
    const studentId = safeString(row.student_id);
    const name = safeString(row.name);
    if (studentId && name) identityKeys.set(studentId + '\u0000' + name, { studentId, name });
  }

  const actorMap = new Map();
  for (const row of boundRows) {
    actorMap.set(safeString(row.org_id), buildUserActor(openid, row, {
      id: row.user_info_id
    }));
  }
  if (!identityKeys.size) return actorMap;

  const identities = Array.from(identityKeys.values());
  const identityConditions = identities.map(() => '(student_id = ? AND name = ?)').join(' OR ');
  const params = [];
  for (const identity of identities) params.push(identity.studentId, identity.name);
  const orgIds = organizations.map((item) => safeString(item.id)).filter(Boolean);
  const orgPlaceholders = orgIds.map(() => '?').join(',');
  const [matchedRows] = await pool.query(
    `SELECT id, name, student_id, department_id, identity_id, work_group_id,
            org_id, created_at, updated_at
       FROM hr_info
      WHERE org_id IN (${orgPlaceholders}) AND (${identityConditions})`,
    orgIds.concat(params)
  );
  for (const row of matchedRows) {
    const orgId = safeString(row.org_id);
    if (!actorMap.has(orgId)) actorMap.set(orgId, buildUserActor(openid, row, null));
  }
  return actorMap;
}

async function loadAdminActorMap(openid, organizations) {
  const rows = await adminInfoModel.getByOpenidAcrossOrgs(openid);
  const globalSuperAdmin = rows.find((item) => (
    safeString(item.admin_level) === 'super_admin' && safeString(item.org_id) === ''
  )) || null;
  const actorMap = new Map();
  for (const organization of organizations) {
    const orgId = safeString(organization.id);
    const organizationAdmin = rows.find((item) => safeString(item.org_id) === orgId);
    const effectiveAdmin = globalSuperAdmin || organizationAdmin;
    if (effectiveAdmin) actorMap.set(orgId, buildAdminActor(openid, effectiveAdmin));
  }
  return actorMap;
}

async function listAccessibleActorContexts(options) {
  const openid = safeString(options && options.openid);
  const role = safeString(options && options.role).toLowerCase();
  const currentOrgId = safeString(options && options.currentOrgId);
  if (!openid || !ACTIVE_ROLES.has(role)) return [];

  const organizations = await organizationModel.getAll();
  const actorMap = role === 'admin'
    ? await loadAdminActorMap(openid, organizations)
    : await loadUserActorMap(openid, organizations);

  return organizations
    .filter((organization) => actorMap.has(safeString(organization.id)))
    .map((organization) => {
      const organizationId = safeString(organization.id);
      return {
        organizationId,
        organizationName: safeString(organization.name),
        isCurrentOrganization: organizationId === currentOrgId,
        actor: actorMap.get(organizationId)
      };
    });
}

async function listAvailableOrganizations(openid, role) {
  const contexts = await listAccessibleActorContexts({ openid, role, currentOrgId: '' });
  return contexts.map((context) => ({
    id: context.organizationId,
    name: context.organizationName,
    role
  }));
}

module.exports = {
  ACTIVE_ROLES,
  listAccessibleActorContexts,
  listAvailableOrganizations
};
