const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByVenueId(venueId, conn, forUpdate) {
  const orgId = await getCurrentOrgId();
  return getByVenueIdForOrg(venueId, orgId, conn, forUpdate);
}

async function getByVenueIdForOrg(venueId, orgId, conn, forUpdate) {
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT * FROM venue_booking_rules WHERE venue_id = ? AND org_id = ? AND is_active = 1 ORDER BY sort_order' + (forUpdate ? ' FOR UPDATE' : ''),
    [venueId, orgId]
  );
  return rows;
}

async function getById(id, conn, forUpdate) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT * FROM venue_booking_rules WHERE id = ? AND org_id = ?' + (forUpdate ? ' FOR UPDATE' : ''),
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { venueId, ruleType, approverIdentityId, approverHrId, approverAssignmentId, scopeDepartmentId, scopeWorkGroupId, sortOrder } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO venue_booking_rules (id, venue_id, org_id, rule_type, approver_identity_id, approver_hr_id, approver_assignment_id, scope_department_id, scope_work_group_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, venueId, orgId, ruleType || 'admin', approverIdentityId || null, approverHrId || null, approverAssignmentId || null,
     scopeDepartmentId || null, scopeWorkGroupId || null, sortOrder || 1]
  );
}

async function update(id, data, conn) {
  const { ruleType, approverIdentityId, approverHrId, approverAssignmentId, scopeDepartmentId, scopeWorkGroupId, sortOrder, isActive } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = [];
  const values = [];
  if (ruleType !== undefined) { fields.push('rule_type = ?'); values.push(ruleType); }
  if (approverIdentityId !== undefined) { fields.push('approver_identity_id = ?'); values.push(approverIdentityId || null); }
  if (approverHrId !== undefined) { fields.push('approver_hr_id = ?'); values.push(approverHrId || null); }
  if (approverAssignmentId !== undefined) { fields.push('approver_assignment_id = ?'); values.push(approverAssignmentId || null); }
  if (scopeDepartmentId !== undefined) { fields.push('scope_department_id = ?'); values.push(scopeDepartmentId || null); }
  if (scopeWorkGroupId !== undefined) { fields.push('scope_work_group_id = ?'); values.push(scopeWorkGroupId || null); }
  if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
  if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (!fields.length) return;
  values.push(id, orgId);
  await db.query(`UPDATE venue_booking_rules SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

async function remove(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM venue_booking_rules WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function removeByVenueId(venueId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM venue_booking_rules WHERE venue_id = ? AND org_id = ?', [venueId, orgId]);
}

module.exports = { getByVenueId, getByVenueIdForOrg, getById, create, update, remove, removeByVenueId };
