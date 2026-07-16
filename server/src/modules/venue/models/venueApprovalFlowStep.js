const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const ruleModel = require('./venueApprovalFlowStepRule');

async function getByFlowId(flowId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
    [flowId, orgId]
  );
  // Batch-load rules for all steps
  if (rows.length > 0) {
    const stepIds = rows.map(r => r.id);
    const [allRules] = await pool.query(
      'SELECT * FROM venue_approval_flow_step_rules WHERE step_id IN (?) AND org_id = ? ORDER BY sort_order',
      [stepIds, orgId]
    );
    const ruleMap = {};
    for (const r of allRules) {
      if (!ruleMap[r.step_id]) ruleMap[r.step_id] = [];
      ruleMap[r.step_id].push(r);
    }
    for (const row of rows) {
      row.rules = ruleMap[row.id] || [];
    }
  }
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_approval_flow_steps WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  if (rows[0]) {
    rows[0].rules = await ruleModel.getByStepId(id);
  }
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { flowId, sortOrder, name, approvalMode } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    'INSERT INTO venue_approval_flow_steps (id, flow_id, sort_order, name, approval_mode, org_id) VALUES (?, ?, ?, ?, ?, ?)',
    [id, flowId, sortOrder || 1, name || '', approvalMode === 'admin_any' ? 'admin_any' : 'hr_rule', orgId]
  );
}

async function removeByFlowId(flowId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await ruleModel.removeByFlowId(flowId, db);
  await db.query('DELETE FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ?', [flowId, orgId]);
}

async function remove(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await ruleModel.removeByStepId(id, db);
  await db.query('DELETE FROM venue_approval_flow_steps WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByFlowId, getById, create, removeByFlowId, remove };
