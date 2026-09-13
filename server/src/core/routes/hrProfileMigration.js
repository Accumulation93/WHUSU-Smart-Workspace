const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { safeString, generateId } = require('../../utils/helpers');
const copy = require('../../locales/zh-CN/core/hrProfileMigration');
const { resolveCurrentAdmin } = require('../services/adminRequestContext');
const { loadEffectivePermissions, hasAnyPermission } = require('../services/adminPermissions');
const migrationService = require('../services/hrProfileMigrationService');
const migrationModel = require('../models/hrProfileMigration');
const { createNotification } = require('../../modules/audit/utils/notificationHelper');

const HR_PERMISSIONS = ['hr.people', 'hr.profile_review'];

async function resolveActor(req) {
  const admin = req.admin || await resolveCurrentAdmin(req);
  const personId = safeString(req.authAccount && req.authAccount.personId);
  const orgId = safeString(req.authContext && req.authContext.organizationId);
  const effective = req.adminPermissions || await loadEffectivePermissions(admin, orgId);
  return {
    personId,
    orgId,
    admin,
    effective,
    isSuper: Boolean((admin && admin.admin_level === 'super_admin') || (effective && effective.isSuper))
  };
}

function ensureHrPermission(actor) {
  return actor.isSuper || hasAnyPermission(actor.effective, HR_PERMISSIONS);
}

async function canReviewSourceOrg(actor, sourceOrgId) {
  if (actor.isSuper) return true;
  const [rows] = await pool.query(
    `SELECT admin_level, org_id FROM admin_grants
      WHERE person_id = ? AND status = 'active'
        AND (admin_level = 'super_admin' OR org_id = ?)`,
    [safeString(actor.personId), safeString(sourceOrgId)]
  );
  return rows.length > 0;
}

async function memberHrId(orgId, personId) {
  const [rows] = await pool.query(
    `SELECT legacy_hr_id FROM organization_memberships
      WHERE org_id = ? AND person_id = ? AND status IN ('active', 'left') LIMIT 1`,
    [safeString(orgId), safeString(personId)]
  );
  return rows[0] ? safeString(rows[0].legacy_hr_id) : '';
}

async function notify(personId, orgId, title, body, targetId) {
  try {
    const hrId = await memberHrId(orgId, personId);
    if (!hrId) return;
    await createNotification({
      orgId,
      recipientType: 'user',
      recipientId: hrId,
      type: 'hr_profile_migration',
      title,
      description: body,
      category: 'hr',
      targetType: 'hr_profile_migration',
      targetId
    });
  } catch (_) {}
}

router.post('/getCrossOrgMigrationContext', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!ensureHrPermission(actor)) return res.json({ status: 'forbidden', message: copy.forbidden });
    const visibleOrgIds = await migrationService.resolveVisibleOrgIds(actor);
    const [orgRows] = await pool.query(
      'SELECT id, name FROM organizations WHERE id IN (' + visibleOrgIds.map(() => '?').join(',') + ')'
        + (visibleOrgIds.length ? '' : ' WHERE 1 = 0'),
      visibleOrgIds
    );
    const sourceOrgId = safeString(req.body.sourceOrgId);
    const result = {
      status: 'success',
      targetOrgId: actor.orgId,
      canDirect: actor.isSuper,
      visibleOrgs: orgRows.map((row) => ({ id: safeString(row.id), name: safeString(row.name) }))
    };
    if (sourceOrgId) {
      if (visibleOrgIds.indexOf(sourceOrgId) < 0) return res.json({ status: 'forbidden', message: copy.sourceNotVisible });
      const [sourceSnapshot, targetSnapshot, members] = await Promise.all([
        migrationService.loadActiveSnapshot(sourceOrgId),
        migrationService.loadActiveSnapshot(actor.orgId),
        migrationService.listOrgMembers(actor.orgId)
      ]);
      result.sourceOrgId = sourceOrgId;
      result.sourceFields = sourceSnapshot ? sourceSnapshot.fields : [];
      result.targetFields = targetSnapshot ? targetSnapshot.fields : [];
      result.members = members;
    }
    return res.json(result);
  } catch (error) {
    return res.json({ status: 'error', message: copy.notFound });
  }
});

router.post('/previewCrossOrgMigration', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!ensureHrPermission(actor)) return res.json({ status: 'forbidden', message: copy.forbidden });
    const result = await migrationService.buildPlan(actor, req.body || {});
    return res.json({
      status: result.blockers.length ? 'mapping_blocked' : 'success',
      switchToken: result.token,
      blockers: result.blockers,
      conflicts: result.conflicts,
      skipped: result.skipped,
      summary: result.summary,
      message: result.blockers.length ? copy.incompatibleAction : ''
    });
  } catch (error) {
    return res.json({ status: 'invalid_params', message: error.message || copy.invalidPlan });
  }
});

async function rebuildPlan(actor, body) {
  const result = await migrationService.buildPlan(actor, body || {});
  return result;
}

router.post('/applyCrossOrgMigration', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!ensureHrPermission(actor)) return res.json({ status: 'forbidden', message: copy.forbidden });
    if (!actor.isSuper) return res.json({ status: 'forbidden', message: copy.noPermissionToReview });
    const built = await rebuildPlan(actor, req.body);
    const token = safeString(req.body.switchToken);
    await migrationService.executePlan(actor, built.plan, token);
    const migrationId = await migrationModel.createMigration({
      sourceOrgId: built.plan.sourceOrgId,
      targetOrgId: built.plan.targetOrgId,
      status: 'executed',
      requestedByPersonId: actor.personId,
      requestedByContextId: req.authContext && req.authContext.contextId,
      plan: built.plan,
      sourceSnapshotId: built.plan.sourceSnapshotId,
      targetSnapshotId: built.plan.targetSnapshotId,
      result: { copied: built.plan.persons.length }
    });
    await migrationModel.createItems(migrationId, built.plan.targetOrgId, built.plan.persons.map((person) => ({
      personId: person.personId,
      sourceHrId: person.sourceHrId,
      targetHrId: person.targetHrId,
      status: 'executed'
    })));
    return res.json({ status: 'success', message: copy.executed });
  } catch (error) {
    return res.json({ status: 'invalid_params', message: error.message || copy.invalidPlan });
  }
});

router.post('/submitCrossOrgMigrationRequest', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!ensureHrPermission(actor)) return res.json({ status: 'forbidden', message: copy.forbidden });
    if (actor.isSuper) return res.json({ status: 'forbidden', message: copy.invalidOperation });
    const built = await rebuildPlan(actor, req.body);
    const migrationId = await migrationModel.createMigration({
      sourceOrgId: built.plan.sourceOrgId,
      targetOrgId: built.plan.targetOrgId,
      status: 'pending',
      requestedByPersonId: actor.personId,
      requestedByContextId: req.authContext && req.authContext.contextId,
      plan: built.plan,
      sourceSnapshotId: built.plan.sourceSnapshotId,
      targetSnapshotId: built.plan.targetSnapshotId,
      result: { token: safeString(req.body.switchToken) }
    });
    await migrationModel.createItems(migrationId, built.plan.targetOrgId, built.plan.persons.map((person) => ({
      personId: person.personId,
      sourceHrId: person.sourceHrId,
      targetHrId: person.targetHrId,
      status: 'pending'
    })));
    return res.json({ status: 'success', id: migrationId, message: copy.requestSubmitted });
  } catch (error) {
    return res.json({ status: 'invalid_params', message: error.message || copy.invalidPlan });
  }
});

router.post('/reviewCrossOrgMigrationRequest', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    const id = safeString(req.body.id);
    const action = safeString(req.body.action);
    const reason = safeString(req.body.reason).trim();
    const record = await migrationModel.getById(id);
    if (!record || record.status !== 'pending') return res.json({ status: 'invalid_operation', message: copy.requestNotFound });
    if (action === 'reject' && !reason) return res.json({ status: 'invalid_params', message: copy.rejectReasonRequired });
    if (!(await canReviewSourceOrg(actor, record.sourceOrgId))) {
      return res.json({ status: 'forbidden', message: copy.noPermissionToReview });
    }
    if (action === 'reject') {
      await migrationModel.updateStatus(id, {
        status: 'rejected',
        reviewedByPersonId: actor.personId,
        reviewedByContextId: req.authContext && req.authContext.contextId,
        rejectReason: reason
      });
      await notify(record.requestedByPersonId, record.targetOrgId, copy.notifierTitle, copy.notifierRejectedBody, id);
      return res.json({ status: 'success', message: copy.requestRejected });
    }
    const token = record.result && record.result.token ? record.result.token : '';
    await migrationService.executePlan(actor, record.plan, token);
    await migrationModel.updateStatus(id, {
      status: 'executed',
      reviewedByPersonId: actor.personId,
      reviewedByContextId: req.authContext && req.authContext.contextId,
      result: Object.assign({}, record.result, { copied: (record.plan.persons || []).length })
    });
    const items = await migrationModel.getItems(id);
    for (const item of items) await migrationModel.updateItem(item.id, { status: 'executed' });
    await notify(record.requestedByPersonId, record.targetOrgId, copy.notifierTitle, copy.notifierApprovedBody, id);
    return res.json({ status: 'success', message: copy.requestApproved });
  } catch (error) {
    return res.json({ status: 'invalid_params', message: error.message || copy.stale });
  }
});

router.post('/cancelCrossOrgMigrationRequest', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    const id = safeString(req.body.id);
    const record = await migrationModel.getById(id);
    if (!record || record.status !== 'pending' || record.requestedByPersonId !== actor.personId) {
      return res.json({ status: 'invalid_operation', message: copy.requestNotFound });
    }
    await migrationModel.updateStatus(id, { status: 'cancelled' });
    await notify(record.requestedByPersonId, record.targetOrgId, copy.notifierTitle, copy.notifierCancelledBody, id);
    return res.json({ status: 'success', message: copy.requestSubmitted });
  } catch (error) {
    return res.json({ status: 'error', message: copy.invalidOperation });
  }
});

router.post('/listCrossOrgMigrationRequests', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!ensureHrPermission(actor)) return res.json({ status: 'forbidden', message: copy.forbidden });
    const [mine, pending] = await Promise.all([
      migrationModel.listByRequester(actor.personId),
      migrationModel.listBySourceOrg(actor.orgId, ['pending'])
    ]);
    const [orgRows] = await pool.query('SELECT id, name FROM organizations');
    const orgMap = new Map(orgRows.map((row) => [safeString(row.id), safeString(row.name)]));
    const decorate = (item) => ({
      id: item.id,
      status: item.status,
      statusText: item.status === 'pending' ? copy.statusPending
        : (item.status === 'executed' ? copy.statusExecuted
          : (item.status === 'rejected' ? copy.statusRejected : copy.statusCancelled)),
      sourceOrgId: item.sourceOrgId,
      sourceOrgName: orgMap.get(item.sourceOrgId) || '',
      targetOrgId: item.targetOrgId,
      targetOrgName: orgMap.get(item.targetOrgId) || '',
      personCount: (item.plan && item.plan.persons ? item.plan.persons.length : 0),
      rejectReason: item.rejectReason,
      createdAt: item.createdAt,
      canCancel: item.status === 'pending' && item.requestedByPersonId === actor.personId
    });
    return res.json({
      status: 'success',
      myRequests: mine.map(decorate),
      pendingForMe: pending.map(decorate)
    });
  } catch (error) {
    return res.json({ status: 'error', message: copy.invalidOperation });
  }
});

router.post('/getPersonOrgProfiles', async (req, res) => {
  try {
    const actor = await resolveActor(req);
    if (!actor.isSuper) return res.json({ status: 'forbidden', message: copy.forbidden });
    const personId = safeString(req.body.personId);
    if (!personId) return res.json({ status: 'invalid_params', message: copy.notFound });
    const [memberships] = await pool.query(
      `SELECT m.org_id, m.legacy_hr_id, m.status, o.name AS org_name
         FROM organization_memberships m
         JOIN organizations o ON o.id = m.org_id
        WHERE m.person_id = ? AND m.status IN ('active', 'left')
        ORDER BY o.name`,
      [personId]
    );
    const groups = [];
    for (const membership of memberships) {
      const orgId = safeString(membership.org_id);
      const snapshot = await migrationService.loadActiveSnapshot(orgId);
      const [records] = await pool.query(
        'SELECT id FROM hr_profile_records WHERE hr_id = ? AND org_id = ? LIMIT 1',
        [safeString(membership.legacy_hr_id), orgId]
      );
      const recordId = records[0] ? safeString(records[0].id) : '';
      const valuesByField = new Map();
      if (recordId) {
        const [valueRows] = await pool.query(
          'SELECT field_id, field_value, is_pending FROM hr_profile_record_values WHERE org_id = ? AND record_id = ? AND is_pending = 0',
          [orgId, recordId]
        );
        valueRows.forEach((row) => valuesByField.set(safeString(row.field_id), row.field_value));
        const [pendingRows] = await pool.query(
          'SELECT field_id, field_value FROM hr_profile_record_values WHERE org_id = ? AND record_id = ? AND is_pending = 1',
          [orgId, recordId]
        );
        pendingRows.forEach((row) => valuesByField.set('pending:' + safeString(row.field_id), row.field_value));
      }
      groups.push({
        orgId,
        orgName: safeString(membership.org_name),
        membershipStatus: safeString(membership.status),
        isCurrent: orgId === actor.orgId,
        fields: (snapshot ? snapshot.fields : []).map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          value: valuesByField.has(field.id) ? String(valuesByField.get(field.id) == null ? '' : valuesByField.get(field.id)) : '',
          pendingValue: valuesByField.has('pending:' + field.id)
            ? String(valuesByField.get('pending:' + field.id) == null ? '' : valuesByField.get('pending:' + field.id))
            : ''
        }))
      });
    }
    return res.json({ status: 'success', personId, groups });
  } catch (error) {
    return res.json({ status: 'error', message: copy.notFound });
  }
});

module.exports = router;
