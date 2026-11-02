'use strict';

const { CATALOG } = require('../services/authorizationCatalog');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');

// 表名仅来自此固定登记，不接收请求中的表名或列名。
const RESOURCE_TABLES = Object.freeze({
  'scoring.activities': 'score_activities',
  'scoring.templates': 'score_question_templates',
  'scoring.rules': 'rate_target_rules',
  'scoring.results': 'score_records',
  'scoring.tasks': 'membership_assignments',
  'scoring.participation': 'membership_assignments',
  'scoring.publishedResults': 'result_publications',
  'scoring.meritSelections': 'result_publications',
  'scoring.publications': 'result_publications',
  'hr.people': 'hr_info',
  'hr.profileReview': 'hr_info',
  'hr.assignments': 'membership_assignments',
  'contacts.entries': 'hr_info',
  'hr.departments': 'departments',
  'hr.identities': 'identities',
  'hr.workGroups': 'work_groups',
  'hr.assignmentNatures': 'assignment_natures',
  'hr.directoryRules': 'hr_contact_directory_rules',
  'audit.templates': 'audit_flow_templates',
  'audit.stamps': 'stamps',
  'audit.submissions': 'audit_submissions',
  'venue.approvals': 'venue_approval_flows',
  'venue.bookingRules': 'venue_booking_rules',
  'venue.bookingWindows': 'venue_booking_policies',
  'venue.purposes': 'organization_venue_booking_purposes',
  'calendar.events': 'calendar_events',
  'calendar.rules': 'calendar_rules',
  'notifications.items': 'notifications',
  'authorization.rules': 'authorization_rules',
  'authorization.schemes': 'authorization_schemes',
  'authorization.delegations': 'authorization_delegations'
});
const DIMENSION_TABLES = Object.freeze({ natureId: 'assignment_natures', departmentId: 'departments',
  identityCategoryId: 'identities', workGroupId: 'work_groups' });
function stale() { throw Object.assign(new Error('authorization_stale_reference'), { code: 'authorization_stale_reference' }); }
const placeholders = values => values.map(() => '?').join(',');

async function validateReferences(connection, policy) {
  const orgId = policy.organizationId;
  // 与既有字典删除持有同一把组织锁，不能在校验后被并发删除。
  await lockOrganizationDictionaryWrites(orgId, connection);
  const profileKeys = (policy.fields || []).filter(key => key.startsWith('profile:'));
  if (profileKeys.length) {
    const current = new Set((await require('./authorizationProfileFields').list(connection, orgId)).map(field => field.key));
    if (profileKeys.some(key => !current.has(key))) stale();
  }
  const dimensions = new Map(Object.keys(DIMENSION_TABLES).map(key => [key, new Set()]));
  const assignments = new Set();
  const grants = new Set();
  const recordIds = new Set();
  for (const clause of policy.subjects.concat(policy.scopes)) {
    if (clause.kind === 'assignments') clause.ids.forEach(id => assignments.add(id));
    if (clause.kind === 'adminGrants') clause.ids.forEach(id => grants.add(id));
    if (clause.kind === 'records') clause.ids.forEach(id => recordIds.add(id));
    if (clause.kind === 'assignmentScope') {
      for (const [key, values] of Object.entries(clause.dimensions)) {
        if (values !== 'same') values.forEach(id => dimensions.get(key).add(id));
      }
    }
  }
  for (const [key, ids] of dimensions) {
    if (!ids.size) continue;
    const values = [...ids];
    const [rows] = await connection.query(`SELECT id FROM ${DIMENSION_TABLES[key]} WHERE org_id = ? AND id IN (${placeholders(values)}) FOR SHARE`,
      [orgId, ...values]);
    if (rows.length !== values.length) stale();
  }
  if (assignments.size) {
    const values = [...assignments];
    const [rows] = await connection.query(`SELECT a.id FROM membership_assignments a
      JOIN organization_memberships m ON m.id = a.membership_id AND m.org_id = a.org_id AND m.status = 'active'
      JOIN persons p ON p.id = m.person_id AND p.status = 'active'
      JOIN departments d ON d.id = a.department_id AND d.org_id = a.org_id
      JOIN identities i ON i.id = a.identity_id AND i.org_id = a.org_id
      JOIN assignment_natures n ON n.id = a.assignment_kind COLLATE utf8mb4_unicode_ci
        AND n.org_id = a.org_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN work_groups w ON w.id = a.work_group_id AND w.org_id = a.org_id AND w.department_id = a.department_id
      WHERE a.org_id = ? AND a.status = 'active' AND a.id IN (${placeholders(values)})
        AND (a.work_group_id IS NULL OR a.work_group_id = '' OR w.id IS NOT NULL) FOR SHARE`, [orgId, ...values]);
    if (rows.length !== values.length) stale();
  }
  if (grants.size) {
    const values = [...grants];
    const [rows] = await connection.query(`SELECT g.id FROM admin_grants g
      JOIN persons p ON p.id = g.person_id AND p.status = 'active'
      WHERE g.org_id = ? AND g.admin_level = 'admin' AND g.status = 'active'
        AND g.id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
    if (rows.length !== values.length) stale();
  }
  if (recordIds.size) {
    const resourceTypes = new Set(policy.capabilities.map(key => CATALOG.get(key).resourceType));
    const values = [...recordIds];
    for (const resourceType of resourceTypes) {
      if (resourceType === 'auth.accounts') {
        const [rows] = await connection.query(`SELECT a.id FROM accounts a
          JOIN organization_memberships m ON m.person_id=a.person_id
          WHERE m.org_id=? AND m.status='active' AND a.id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
        const [people] = await connection.query(`SELECT person_id AS id FROM organization_memberships
          WHERE org_id=? AND status='active' AND person_id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
        const found = new Set(rows.concat(people).map(row => row.id));
        if (values.some(id => !found.has(id))) stale();
        continue;
      }
      if (resourceType === 'system.adminAccounts') {
        const [rows] = await connection.query(`SELECT id FROM admin_info
          WHERE org_id=? AND admin_level='admin' AND id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
        if (rows.length !== values.length) stale();
        continue;
      }
      if (['venue.resources', 'venue.schedule', 'venue.sharedConfiguration', 'venue.openRules', 'venue.activityRules', 'venue.activityParticipants'].includes(resourceType)) {
        // 场地及共享时间没有组织归属列；此处仅验证引用，执行仍须校验当前组织授权和全局配置能力。
        const table = { 'venue.resources': 'venues', 'venue.schedule': 'venues', 'venue.sharedConfiguration': 'venues',
          'venue.openRules': 'venue_open_rules', 'venue.activityRules': 'venue_activity_rules', 'venue.activityParticipants': 'venue_activity_rules' }[resourceType];
        const [rows] = await connection.query(`SELECT id FROM ${table} WHERE id IN (${placeholders(values)}) FOR SHARE`, values);
        if (rows.length !== values.length) stale();
        continue;
      }
      if (resourceType === 'authorization.effective') {
        const [jobs] = await connection.query(`SELECT a.id FROM membership_assignments a
          JOIN organization_memberships m ON m.id = a.membership_id AND m.org_id = a.org_id AND m.status = 'active'
          WHERE a.org_id = ? AND a.status = 'active' AND a.id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
        const [admins] = await connection.query(`SELECT id FROM admin_grants
          WHERE (org_id = ? OR (org_id = '' AND admin_level = 'super_admin')) AND status = 'active'
            AND id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
        const found = new Set(jobs.concat(admins).map(item => item.id));
        if (values.some(id => !found.has(id))) stale();
        continue;
      }
      if (resourceType === 'venue.bookings') {
        const [rows] = await connection.query(`SELECT id FROM venue_bookings
          WHERE (creator_org_id = ? OR approval_org_id = ?) AND id IN (${placeholders(values)}) FOR SHARE`, [orgId, orgId, ...values]);
        if (rows.length !== values.length) stale();
        continue;
      }
      if (resourceType === 'venue.bookingParticipants') {
        const [rows] = await connection.query(`SELECT id FROM venue_bookings WHERE creator_org_id=? AND id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
        if (rows.length !== values.length) stale();
        continue;
      }
      const table = RESOURCE_TABLES[resourceType];
      if (!table) stale();
      const [rows] = await connection.query(`SELECT id FROM ${table} WHERE org_id = ? AND id IN (${placeholders(values)}) FOR SHARE`, [orgId, ...values]);
      if (rows.length !== values.length) stale();
    }
  }
}

module.exports = { validateReferences, RESOURCE_TABLES };
