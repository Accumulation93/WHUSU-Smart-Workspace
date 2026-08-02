const express = require('express');
const router = express.Router();
const fs = require('fs');
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const adminInfoModel = require('../../../core/models/adminInfo');
const hrInfoModel = require('../../../core/models/hrInfo');
const flowTemplateModel = require('../models/auditFlowTemplate');

// Format current time in local timezone (UTC+8 / China Standard Time)
function nowLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const flowTemplateStepModel = require('../models/auditFlowTemplateStep');
const flowTemplateStepConditionModel = require('../models/auditFlowTemplateStepCondition');
const submissionModel = require('../models/auditSubmission');
const submissionStepModel = require('../models/auditSubmissionStep');
const submissionFileModel = require('../models/auditSubmissionFile');
const submissionSignatureModel = require('../models/auditSubmissionSignature');
const auditEventModel = require('../models/auditEvent');
const stampAssignmentModel = require('../models/identityStampAssignment');
const { hashFile, computeSignatureHash } = require('../utils/hashChain');
const { attachUploadedFiles } = require('../utils/fileSecurity');
const { overlaySignaturesOnFile } = require('../utils/signatureOverlay');
const { createNotification } = require('../utils/notificationHelper');
const requestDeduplication = require('../../../utils/requestDeduplication');
const { resolveCurrentActor } = require('../../../core/services/currentActor');

const { matchesAnyCondition, matchesIdentityScopeCondition, matchesScope } = submissionStepModel;

/**
 * Helper: check if a value exists in a comma-separated list.
 * Both inputs are coerced to strings for robust comparison.
 */
function inCsv(csv, value) {
  if (csv == null || value == null) return false;
  let csvStr = String(csv).trim();
  let valStr = String(value).trim();
  if (!csvStr || !valStr) return false;
  return csvStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean).includes(valStr);
}

/**
 * Resolve the current user's HR ID from openid.
 */
async function resolveHrId(openid) {
  if (!openid) return null;
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?',
    [openid, orgId]
  );
  return rows[0] ? rows[0].hr_id : null;
}

function buildAuditOperatorContext(req) {
  const context = req.authContext || {};
  return {
    operatorPersonId: safeString(context.personId),
    operatorAssignmentId: safeString(context.assignmentId),
    operatorAdminGrantId: safeString(context.adminGrantId),
    operatorContextSnapshot: context.contextId ? {
      contextId: safeString(context.contextId),
      organizationId: safeString(context.organizationId),
      role: safeString(context.role),
      identityType: safeString(context.identityType),
      identityName: safeString(context.identityName),
      department: safeString(context.department),
      identity: safeString(context.identity),
      workGroup: safeString(context.workGroup),
      adminLevel: safeString(context.adminLevel)
    } : null
  };
}

// ═══════════════════════════════════════════════════
// My Submissions
// ═══════════════════════════════════════════════════

// listMySubmissions
router.post('/listMySubmissions', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const filters = {
      submittedBy: hrId,
      status: safeString(req.body.status) || null,
      limit: Math.min(100, Math.max(1, parseInt(req.body.limit, 10) || 50)),
      offset: Math.max(0, parseInt(req.body.offset, 10) || 0)
    };

    const submissions = await submissionModel.getAll(filters);
    const submissionIds = submissions.map(s => s.id);
    const orgId = await getCurrentOrgId();

    // Get read cursors
    let cursorMap = {};
    if (submissionIds.length) {
      const [cursors] = await pool.query(
        'SELECT submission_id, last_read_status, last_read_step_index FROM audit_read_cursors WHERE org_id = ? AND hr_id = ? AND submission_id IN (?)',
        [orgId, hrId, submissionIds]
      );
      cursors.forEach(c => { cursorMap[c.submission_id] = c; });
    }

    const result = submissions.map((s) => {
      const c = cursorMap[s.id];
      const isUnread = !c || c.last_read_status !== s.status || c.last_read_step_index !== s.current_step_index;
      return {
        id: safeString(s.id),
        submissionNumber: safeString(s.submission_number),
        title: safeString(s.title),
        description: safeString(s.description),
        type: safeString(s.type),
        status: safeString(s.status),
        currentStepIndex: s.current_step_index,
        resubmitMode: safeString(s.resubmit_mode),
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        isUnread
      };
    });

    res.json({ status: 'success', submissions: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// checkPendingCount — Lightweight poll: returns count + latest timestamp only
// Used by the mini-program for periodic background refresh without loading full list
router.post('/checkPendingCount', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
    }
    const hrId = actorResult.actor.id;

    const steps = await submissionStepModel.getPendingByApprover(hrId, actorResult.actor.profile);
    const count = steps.length;
    const latestAt = count > 0 ? steps[0].created_at : null; // Already sorted DESC in model

    res.json({ status: 'success', count, latestAt });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listPendingApprovals — Submissions waiting for the current user to approve
router.post('/listPendingApprovals', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
    }
    const hrId = actorResult.actor.id;

    const steps = await submissionStepModel.getPendingByApprover(hrId, actorResult.actor.profile);

    // Load submitter names
    const submitterIds = [...new Set(steps.map((s) => s.submitted_by))];
    const hrMap = {};
    if (submitterIds.length) {
      const hrRows = await hrInfoModel.getByIds(submitterIds);
      for (const hr of hrRows) hrMap[hr.id] = safeString(hr.name);
    }

    const result = steps.map((s) => ({
      id: safeString(s.id),
      submissionId: safeString(s.submission_id),
      submissionNumber: safeString(s.submission_number),
      title: safeString(s.title),
      submittedBy: safeString(s.submitted_by),
      submitterName: hrMap[s.submitted_by] || '未知',
      sortOrder: s.sort_order,
      approverType: safeString(s.approver_type),
      approverIdentityId: safeString(s.approver_identity_id),
      scopeType: safeString(s.scope_type),
      actionType: safeString(s.action_type),
      round: s.round,
      createdAt: s.created_at,
      stepConditionsJson: s.step_conditions_json || null
    }));

    res.json({ status: 'success', pending: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Start Submission
// ═══════════════════════════════════════════════════

// startAuditSubmission — Create a new submission from a template
router.post('/startAuditSubmission', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = req.openid;
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
    }
    const hrId = actorResult.actor.id;
    const orgId = await getCurrentOrgId();

    const templateId = safeString(req.body.templateId);
    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const uploadedFiles = Array.isArray(req.body.files) ? req.body.files : [];
    const rawStepOverrides = Array.isArray(req.body.stepOverrides) ? req.body.stepOverrides : [];
    // Public step numbers are one-based. Normalize the old zero-based client
    // payload when it is still encountered during the compatibility window.
    const legacyZeroBasedOverrides = rawStepOverrides.some(function(o) {
      return Number(o && o.stepIndex) === 0;
    });
    const stepOverrides = rawStepOverrides.map(function(o) {
      const normalized = Object.assign({}, o);
      const rawIndex = Number(normalized.stepIndex);
      normalized.stepIndex = legacyZeroBasedOverrides && Number.isInteger(rawIndex)
        ? rawIndex + 1
        : rawIndex;
      return normalized;
    });

    if (!templateId) {
      return res.json({ status: 'invalid_params', message: '请选择审核流程' });
    }
    if (!title) {
      return res.json({ status: 'invalid_params', message: '请输入提交标题' });
    }
    if (!uploadedFiles.length) {
      return res.json({ status: 'invalid_params', message: '请上传至少一份文件' });
    }

    // Load template
    const template = await flowTemplateModel.getById(templateId);
    if (!template) {
      return res.json({ status: 'not_found', message: '请刷新审核类型后重试' });
    }
    if (!template.is_active) {
      return res.json({ status: 'invalid_params', message: '请选择其他审核流程' });
    }

    // Check starter eligibility
    // Load submitter info for scope resolution
    const [submitterRows] = await pool.query(
      'SELECT h.*, d.name as department_name, wg.name as work_group_name, i.name as identity_name FROM hr_info h LEFT JOIN departments d ON h.department_id = d.id LEFT JOIN work_groups wg ON h.work_group_id = wg.id LEFT JOIN identities i ON h.identity_id = i.id WHERE h.id = ?',
      [hrId]
    );
    const submitterInfo = submitterRows[0] || null;
    const submitterFull = submitterInfo ? {
      hrId: hrId,
      department_id: submitterInfo.department_id || '',
      work_group_id: submitterInfo.work_group_id || '',
      identity_id: submitterInfo.identity_id || ''
    } : null;

    // Parse starter conditions
    let starterConditions = [];
    if (template.starter_conditions_json) {
      try { starterConditions = JSON.parse(template.starter_conditions_json); } catch (_) {}
    }
    if (!Array.isArray(starterConditions)) starterConditions = [];

    if (starterConditions.length) {
      if (!submitterFull) {
        conn.release();
        return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
      }
      // Multi-condition check: user must match at least one condition
      let starterMatch = false;
      for (const cond of starterConditions) {
        if (cond.conditionType === 'person') {
          const personIds = (cond.personHrIds || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          if (personIds.includes(hrId)) { starterMatch = true; break; }
        } else {
          if (matchesIdentityScopeCondition(cond, submitterFull, submitterFull)) {
            starterMatch = true; break;
          }
        }
      }
      if (!starterMatch) {
        conn.release();
        return res.json({ status: 'forbidden', message: '请使用可发起该申请的身份' });
      }
    } else if (template.starter_type === 'identity' && template.starter_identity_id && submitterFull) {
      // Legacy identity check
      const identIds = template.starter_identity_id.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (!identIds.includes(submitterFull.identity_id)) {
        conn.release();
        return res.json({ status: 'forbidden', message: '请使用可发起该申请的身份' });
      }
    } else if (template.starter_type === 'specific_person' && template.starter_hr_id && submitterFull) {
      // Legacy specific person check
      const personIds = template.starter_hr_id.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (!personIds.includes(hrId)) {
        conn.release();
        return res.json({ status: 'forbidden', message: '请使用可发起该申请的身份' });
      }
    }
    // starter_type === 'self' means anyone can start — no check needed

    const templateSteps = await flowTemplateStepModel.getByTemplateId(templateId);
    if (!templateSteps.length) {
      return res.json({ status: 'invalid_params', message: '请联系管理员补充审批步骤' });
    }

    const requestedOverrides = stepOverrides.filter(function(o) {
      return Array.isArray(o.personHrIds) && o.personHrIds.length > 0;
    });
    if (requestedOverrides.some(function(o) { return Number(o.stepIndex) !== 1; })) {
      return res.json({ status: 'invalid_params', message: '后续步骤由上一环节选择审批人' });
    }
    if (requestedOverrides.length > 1) {
      return res.json({ status: 'invalid_params', message: '请重新选择第一步审批人' });
    }
    if (requestedOverrides.length && Number(templateSteps[0].allow_approver_designation) !== 1) {
      return res.json({ status: 'invalid_params', message: '第一步按审批条件确定审批人' });
    }

    await conn.beginTransaction();

    // Create submission
    const submissionId = generateId();
    const dedupClaim = await requestDeduplication.claim(conn, {
      orgId,
      actorKey: 'user:' + hrId,
      operationType: 'start_audit',
      clientRequestId: req.body.clientRequestId,
      resourceId: submissionId
    });
    if (!dedupClaim.claimed) {
      await conn.commit();
      return res.json(dedupClaim.response || {
        status: 'success', id: dedupClaim.resourceId, message: '审核已提交', idempotent: true
      });
    }
    const submissionNumber = await submissionModel.generateSubmissionNumber(conn);
    await submissionModel.create(submissionId, {
      submissionNumber,
      submittedBy: hrId,
      type: 'template',
      templateId,
      title,
      description,
      status: 'in_progress',
      currentStepIndex: 1,
      resubmitMode: template.resubmit_mode
    }, conn);

    await attachUploadedFiles({ uploadedFiles, submissionId, openid, conn });

    // Load conditions for all template steps
    const allConditions = await flowTemplateStepConditionModel.getByTemplateId(templateId);

    const stepConditionMap = {};
    for (const c of allConditions) {
      const sid = c.template_step_id;
      if (!stepConditionMap[sid]) stepConditionMap[sid] = [];
      stepConditionMap[sid].push({
        id: c.id,
        sortOrder: c.sort_order,
        conditionType: c.condition_type,
        personHrIds: c.person_hr_ids,
        departmentScope: c.department_scope,
        specificDepartmentId: c.specific_department_id,
        workGroupScope: c.work_group_scope,
        specificWorkGroupId: c.specific_work_group_id,
        identityScope: c.identity_scope,
        specificIdentityId: c.specific_identity_id
      });
    }

    // Create submission steps from template steps
    for (let i = 0; i < templateSteps.length; i++) {
      const ts = templateSteps[i];
      const stepId = generateId();

      // Build resolved conditions JSON from template step conditions
      const conditions = stepConditionMap[ts.id] || [];

      // Apply person overrides from submitter (specific person selection).
      // NARROW the scope: only designated persons can approve this step,
      // but they must be eligible under the original conditions (can't expand).
      const stepOverride = stepOverrides.find(function(o) {
        return i === 0 && Number(ts.allow_approver_designation) === 1 && Number(o.stepIndex) === 1;
      });
      if (stepOverride && stepOverride.personHrIds && stepOverride.personHrIds.length) {
        // Validate each designated person against original conditions
        const validPersonIds = [];
        for (let pi = 0; pi < stepOverride.personHrIds.length; pi++) {
          const pid = String(stepOverride.personHrIds[pi]);
          // If no original conditions (fully open), anyone is eligible
          if (!conditions.length) {
            validPersonIds.push(pid);
            continue;
          }
          // Check eligibility against original conditions
          const [personRows] = await pool.query(
            'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
            [pid, orgId]
          );
          const person = personRows[0];
          if (person && matchesAnyCondition(conditions, person, submitterFull)) {
            validPersonIds.push(pid);
          }
        }
        if (validPersonIds.length !== stepOverride.personHrIds.length) {
          throw new Error('所选第一步审批人已不符合审批条件');
        }
        // Replace original conditions with person-only conditions (narrow scope)
        if (validPersonIds.length > 0) {
          conditions.length = 0; // clear existing identity conditions
          for (let vpi = 0; vpi < validPersonIds.length; vpi++) {
            conditions.push({
              conditionType: 'person',
              personHrIds: validPersonIds[vpi],
              departmentScope: null,
              specificDepartmentId: null,
              workGroupScope: null,
              specificWorkGroupId: null,
              identityScope: null,
              specificIdentityId: null
            });
          }
        }
      }

      // Fallback: if no conditions resolved from template step, use template starter conditions
      // This ensures steps always have approvers — prevents orphan steps with no approver
      if (conditions.length === 0 && starterConditions.length > 0) {
        for (let sci = 0; sci < starterConditions.length; sci++) {
          conditions.push(Object.assign({}, starterConditions[sci]));
        }
      }

      let stepConditionsJson = null;
      if (conditions.length > 0) {
        stepConditionsJson = JSON.stringify(conditions);
      }
      if (!conditions.length && !ts.approver_hr_id && !ts.approver_identity_id) {
        const configError = new Error('请为每个审批步骤选择审批人');
        configError.code = 'AUDIT_STEP_CONDITIONS_REQUIRED';
        throw configError;
      }
      // Legacy: resolve approver_hr_id for specific_person type
      let approverHrId = null;
      if (ts.approver_type === 'specific_person' && ts.approver_hr_id) {
        approverHrId = ts.approver_hr_id;
      }

      await submissionStepModel.create(stepId, {
        submissionId,
        templateStepId: ts.id,
        sortOrder: i + 1,
        approverType: ts.approver_type,
        approverHrId,
        approverIdentityId: ts.approver_identity_id,
        actionType: ts.action_type,
        allowApproverDesignation: Number(ts.allow_approver_designation) === 1,
        stepName: ts.name || '',
        round: 1,
        stepConditionsJson
      }, conn);
    }

    // Insert submit event
    const submitterName = submitterInfo ? submitterInfo.name : '';
    await auditEventModel.create(generateId(), {
      ...buildAuditOperatorContext(req),
      submissionId,
      eventType: 'submit',
      stepIndex: null,
      round: 1,
      operatorHrId: hrId,
      operatorName: submitterName,
      comment: null
    }, conn);

    const response = {
      status: 'success',
      id: submissionId,
      submissionNumber,
      message: '审核申请已提交'
    };
    await requestDeduplication.complete(conn, {
      ...dedupClaim,
      resourceId: submissionId,
      orgId,
      actorKey: 'user:' + hrId,
      operationType: 'start_audit'
    }, response);
    await conn.commit();
    res.json(response);
  } catch (e) {
    await conn.rollback();
    if (e && e.code === 'AUDIT_STEP_CONDITIONS_REQUIRED') {
      return res.json({ status: 'invalid_params', message: e.message });
    }
    if (e && e.code === 'INVALID_CLIENT_REQUEST_ID') {
      return res.json({ status: 'invalid_params', message: '请重新提交申请' });
    }
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    if (conn) conn.release();
  }
});

// startAdHocAudit — Start an ad-hoc (temporary) approval flow
router.post('/startAdHocAudit', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const orgId = await getCurrentOrgId();

    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const resubmitMode = safeString(req.body.resubmitMode) || 'fresh';
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
    const uploadedFiles = Array.isArray(req.body.files) ? req.body.files : [];

    if (!title) return res.json({ status: 'invalid_params', message: '请输入提交标题' });
    if (!steps.length) return res.json({ status: 'invalid_params', message: '请至少添加一个审批步骤' });
    if (!uploadedFiles.length) return res.json({ status: 'invalid_params', message: '请上传至少一份文件' });

    await conn.beginTransaction();

    const submissionId = generateId();
    const dedupClaim = await requestDeduplication.claim(conn, {
      orgId,
      actorKey: 'user:' + hrId,
      operationType: 'start_ad_hoc_audit',
      clientRequestId: req.body.clientRequestId,
      resourceId: submissionId
    });
    if (!dedupClaim.claimed) {
      await conn.commit();
      return res.json(dedupClaim.response || {
        status: 'success', id: dedupClaim.resourceId, message: '临时审批已发起', idempotent: true
      });
    }
    const submissionNumber = await submissionModel.generateSubmissionNumber(conn);
    await submissionModel.create(submissionId, {
      submissionNumber,
      submittedBy: hrId,
      type: 'ad_hoc',
      templateId: null,
      title,
      description,
      status: 'in_progress',
      currentStepIndex: 1,
      resubmitMode
    }, conn);

    await attachUploadedFiles({ uploadedFiles, submissionId, openid, conn });

    // Create user-specified steps
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const stepId = generateId();

      // Serialize conditions if provided
      let conditions = Array.isArray(s.conditions) ? s.conditions : [];

      // Convert legacy scope fields to conditions format (frontend compatibility)
      if (conditions.length === 0) {
        const scopeType = safeString(s.scopeType) || 'all';
        const approverIdentId = safeString(s.approverIdentityId);
        if (approverIdentId) {
          const cond = {
            conditionType: 'identity_scope',
            identityScope: 'specific',
            specificIdentityId: approverIdentId,
            departmentScope: 'all',
            workGroupScope: 'all'
          };
          if (scopeType === 'same_department') {
            cond.departmentScope = 'own';
          } else if (scopeType === 'same_work_group') {
            cond.workGroupScope = 'own';
          } else if (scopeType === 'specific_department') {
            cond.departmentScope = 'specific';
            cond.specificDepartmentId = safeString(s.scopeDepartmentId) || null;
          } else if (scopeType === 'specific_work_group') {
            cond.departmentScope = 'specific';
            cond.specificDepartmentId = safeString(s.scopeDepartmentId) || null;
            cond.workGroupScope = 'specific';
            cond.specificWorkGroupId = safeString(s.scopeWorkGroupId) || null;
          }
          conditions.push(cond);
        }
      }

      let stepConditionsJson = null;
      if (conditions.length > 0) {
        stepConditionsJson = JSON.stringify(conditions);
      }
      if (!conditions.length && !safeString(s.approverHrId) && !safeString(s.approverIdentityId)) {
        const configError = new Error('请为每个审批步骤选择审批人');
        configError.code = 'AUDIT_STEP_CONDITIONS_REQUIRED';
        throw configError;
      }

      await submissionStepModel.create(stepId, {
        submissionId,
        templateStepId: null,
        sortOrder: i + 1,
        approverType: safeString(s.approverType) || null,
        approverHrId: safeString(s.approverHrId) || null,
        approverIdentityId: safeString(s.approverIdentityId) || null,
        actionType: safeString(s.actionType) || 'sign',
        allowApproverDesignation: false,
        stepName: safeString(s.name) || '',
        round: 1,
        stepConditionsJson
      }, conn);
    }

    // Insert submit event for ad-hoc audit
    const [adHocNameRows] = await pool.query('SELECT name FROM hr_info WHERE id = ? AND org_id = ?', [hrId, orgId]);
    const adHocSubmitterName = adHocNameRows[0] ? adHocNameRows[0].name : '';
    await auditEventModel.create(generateId(), {
      ...buildAuditOperatorContext(req),
      submissionId,
      eventType: 'submit',
      stepIndex: null,
      round: 1,
      operatorHrId: hrId,
      operatorName: adHocSubmitterName,
      comment: null
    }, conn);

    const response = { status: 'success', id: submissionId, submissionNumber, message: '临时审批已发起' };
    await requestDeduplication.complete(conn, {
      ...dedupClaim,
      resourceId: submissionId,
      orgId,
      actorKey: 'user:' + hrId,
      operationType: 'start_ad_hoc_audit'
    }, response);
    await conn.commit();
    res.json(response);
  } catch (e) {
    await conn.rollback();
    if (e && e.code === 'AUDIT_STEP_CONDITIONS_REQUIRED') {
      return res.json({ status: 'invalid_params', message: e.message });
    }
    if (e && e.code === 'INVALID_CLIENT_REQUEST_ID') {
      return res.json({ status: 'invalid_params', message: '请重新提交申请' });
    }
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    if (conn) conn.release();
  }
});

// ═══════════════════════════════════════════════════
// Get Submission Detail
// ═══════════════════════════════════════════════════

/**
 * Resolve comma-separated IDs to names, joined with 、
 * @param {string|null} rawIds - Comma-separated ID string
 * @param {object} map - id→name lookup
 * @returns {string} resolved names or empty string
 */
function resolveMultiNames(rawIds, map) {
  if (!rawIds) return '';
  const ids = String(rawIds).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (!ids.length) return '';
  return ids.map(function(id) { return map[id] || id; }).filter(Boolean).join('、');
}

/**
 * Build human-readable display strings from step conditions JSON.
 * Resolves all IDs to names using provided lookup maps.
 * @param {string|null} conditionsJson - Raw step_conditions_json
 * @param {object} maps - { hrMap, identityMap, deptMap, wgMap }
 * @returns {object} { displayParts, approverDesc }
 */
function buildStepConditionsDisplay(conditionsJson, maps) {
  const { hrMap, identityMap, deptMap, wgMap } = maps;
  let displayParts = [];
  let approverDesc = '';

  if (!conditionsJson) return { displayParts, approverDesc };

  let conditions;
  try {
    conditions = typeof conditionsJson === 'string' ? JSON.parse(conditionsJson) : conditionsJson;
  } catch (_) { return { displayParts, approverDesc }; }

  if (!Array.isArray(conditions) || !conditions.length) return { displayParts, approverDesc };

  for (const cond of conditions) {
    let part = '';
    if (cond.conditionType === 'person') {
      const ids = (cond.personHrIds || '').split(',').map(s => s.trim()).filter(Boolean);
      const names = ids.map(id => hrMap[id] || id).filter(Boolean);
      part = names.length ? '由 ' + names.join('、') + ' 审批' : '由指定人员审批';
    } else {
      // identity_scope
      const scopeParts = [];
      if (cond.departmentScope === 'own') scopeParts.push('同部门');
      else if (cond.departmentScope === 'specific') {
        if (cond.specificDepartmentId) {
          const deptIds = cond.specificDepartmentId.split(',').map(s => s.trim()).filter(Boolean);
          const deptNames = deptIds.map(id => deptMap[id] || id).filter(Boolean);
          if (deptNames.length) scopeParts.push(deptNames.join('、'));
        }
        // else: specific without ID → malformed condition, silently skip department part
      }

      if (cond.workGroupScope === 'own') scopeParts.push('同职能组');
      else if (cond.workGroupScope === 'specific') {
        if (cond.specificWorkGroupId) {
          const wgIds = cond.specificWorkGroupId.split(',').map(s => s.trim()).filter(Boolean);
          const wgNames = wgIds.map(id => wgMap[id] || id).filter(Boolean);
          if (wgNames.length) scopeParts.push(wgNames.join('、'));
        }
        // else: specific without ID → malformed condition, silently skip wg part
      }

      if (cond.identityScope === 'own') scopeParts.push('同身份');
      else if (cond.identityScope === 'specific') {
        if (cond.specificIdentityId) {
          const identIds = cond.specificIdentityId.split(',').map(s => s.trim()).filter(Boolean);
          const identNames = identIds.map(id => identityMap[id] || id).filter(Boolean);
          if (identNames.length) scopeParts.push(identNames.join('、'));
        }
        // else: specific without ID → malformed condition, silently skip identity part
      }

      const scopeStr = scopeParts.length ? scopeParts.join(' · ') + ' ' : '';

      if (cond.identityScope === 'all' && cond.departmentScope === 'all' && cond.workGroupScope === 'all') {
        part = '由全体成员审批';
      } else {
        part = '由 ' + scopeStr + '审批';
      }
    }
    if (part) displayParts.push(part);
  }

  approverDesc = displayParts.join(' 或 ');
  return { displayParts, approverDesc };
}

// getSubmissionDetail
router.post('/getSubmissionDetail', async (req, res) => {
  try {
    const openid = req.openid;
    const selectedRole = safeString(req.get('X-Role')).toLowerCase();
    const detailActorResult = selectedRole === 'user' ? await resolveCurrentActor(req) : null;
    const detailActor = detailActorResult && detailActorResult.ok && detailActorResult.actor.type === 'user'
      ? detailActorResult.actor
      : null;
    const hrId = detailActor ? detailActor.id : null;
    const admin = selectedRole === 'admin' ? await adminInfoModel.getByOpenid(openid) : null;
    const orgId = await getCurrentOrgId();
    if (!hrId && !admin) return res.json({ status: 'forbidden', message: '请先登录' });

    const submissionId = safeString(req.body.submissionId);
    if (!submissionId) return res.json({ status: 'invalid_params', message: '请重新打开申请' });

    const submission = await submissionModel.getById(submissionId);
    if (!submission) return res.json({ status: 'not_found', message: '请刷新申请记录' });

    const steps = await submissionStepModel.getBySubmissionId(submissionId);

    // Check access: submitter, approver in any step, or admin
    const isSubmitter = submission.submitted_by === hrId;
    let isApprover = steps.some((s) => s.approver_hr_id && inCsv(s.approver_hr_id, hrId));

    // Check identity-based matching — always run so submitter-as-approver is detected
    // Also runs for admins so they get properly identified as approvers when their identity matches
    if (!isApprover && hrId) {
      const orgId = await getCurrentOrgId();
      // Load approver HR info for identity/scope matching
      const approverInfo = detailActor ? {
        id: hrId,
        department_id: safeString(detailActor.profile.department_id),
        identity_id: safeString(detailActor.profile.identity_id),
        work_group_id: safeString(detailActor.profile.work_group_id)
      } : null;
      if (approverInfo) {
        // Load submitter info
        const [subRows] = await pool.query(
          'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
          [submission.submitted_by, orgId]
        );
        const submitterInfo = subRows[0] || null;
        // Batch-load template step conditions for fallback
        const tplStepIds = [...new Set(steps.map(s => s.template_step_id).filter(Boolean))];
        const templateConditionMap = {};
        if (tplStepIds.length) {
          const [tplCondRows] = await pool.query(
            `SELECT * FROM audit_flow_template_step_conditions
             WHERE template_step_id IN (?) AND org_id = ?
             ORDER BY template_step_id, sort_order`,
            [tplStepIds, orgId]
          );
          for (const tc of tplCondRows) {
            if (!templateConditionMap[tc.template_step_id]) templateConditionMap[tc.template_step_id] = [];
            templateConditionMap[tc.template_step_id].push({
              conditionType: tc.condition_type,
              personHrIds: tc.person_hr_ids,
              departmentScope: tc.department_scope,
              specificDepartmentId: tc.specific_department_id,
              workGroupScope: tc.work_group_scope,
              specificWorkGroupId: tc.specific_work_group_id,
              identityScope: tc.identity_scope,
              specificIdentityId: tc.specific_identity_id
            });
          }
        }
        // Only check CURRENT pending steps (at current_step_index).
        // Don't match against already-approved or future steps — the user
        // must match the step that is actually waiting for approval.
        for (const s of steps) {
          if (s.status !== 'pending') continue;
          if (s.sort_order !== submission.current_step_index) continue;
          let stepHasExplicitConds = false;
          // Check step_conditions_json
          if (s.step_conditions_json) {
            stepHasExplicitConds = true;
            try {
              const conds = JSON.parse(s.step_conditions_json);
              if (matchesAnyCondition(conds, approverInfo, submitterInfo)) {
                isApprover = true; break;
              }
            } catch (_) {
              // Invalid explicit conditions fail closed; never broaden to the
              // template or legacy approver fields.
            }
          }
          // Fallback: template step conditions (only when NO explicit conditions)
          if (!isApprover && !stepHasExplicitConds && s.template_step_id && templateConditionMap[s.template_step_id]) {
            if (matchesAnyCondition(templateConditionMap[s.template_step_id], approverInfo, submitterInfo)) {
              isApprover = true; break;
            }
          }
          // Legacy check (only when NO explicit conditions — legacy fields may be stale)
          if (!isApprover && !stepHasExplicitConds && s.approver_type === 'identity' && s.approver_identity_id) {
            if (inCsv(s.approver_identity_id, approverInfo.identity_id)) {
              if (matchesScope(s, approverInfo, submitterInfo)) {
                isApprover = true; break;
              }
            }
          }
        }
      }
    }

    if (!isSubmitter && !isApprover && !admin) {
      return res.json({ status: 'forbidden', message: '没有查看权限' });
    }

    const files = await submissionFileModel.getBySubmissionId(submissionId);
    const signatures = await submissionSignatureModel.getBySubmissionId(submissionId);
    const events = await auditEventModel.getBySubmissionId(submissionId);

    // Load HR names
    const allHrIds = new Set();
    allHrIds.add(submission.submitted_by);
    steps.forEach(function(s) { if (s.approver_hr_id) addCsvToSet(s.approver_hr_id, allHrIds); });
    signatures.forEach((s) => allHrIds.add(s.signer_hr_id));
    events.forEach((e) => { if (e.operator_hr_id) allHrIds.add(e.operator_hr_id); });
    const hrMap = {};
    if (allHrIds.size) {
      const hrRows = await hrInfoModel.getByIds([...allHrIds]);
      for (const hr of hrRows) hrMap[hr.id] = safeString(hr.name);
    }

    // Load template name if applicable
    let templateName = '';
    if (submission.template_id) {
      const template = await flowTemplateModel.getById(submission.template_id);
      templateName = template ? safeString(template.name) : '';
    }

    // Helper: add comma-separated IDs to a Set
    function addCsvToSet(csv, targetSet) {
      if (!csv) return;
      String(csv).split(',').forEach(function(id) {
        let tid = id.trim();
        if (tid) targetSet.add(tid);
      });
    }

    // Load identity names — split comma-separated IDs
    const identityIds = new Set();
    steps.forEach(function(s) { addCsvToSet(s.approver_identity_id, identityIds); });
    const deptIdSet = new Set();
    steps.forEach(function(s) { addCsvToSet(s.scope_department_id, deptIdSet); });
    const wgIdSet = new Set();
    steps.forEach(function(s) { addCsvToSet(s.scope_work_group_id, wgIdSet); });
    const hrIdSet = new Set();
    // Also collect from step_conditions_json
    for (const s of steps) {
      if (s.step_conditions_json) {
        try {
          const conds = JSON.parse(s.step_conditions_json);
          if (Array.isArray(conds)) {
            for (const c of conds) {
              if (c.conditionType === 'person' && c.personHrIds) {
                addCsvToSet(c.personHrIds, hrIdSet);
              } else {
                // identity_scope or unknown type — treat as identity_scope
                addCsvToSet(c.specificIdentityId, identityIds);
                addCsvToSet(c.specificDepartmentId, deptIdSet);
                addCsvToSet(c.specificWorkGroupId, wgIdSet);
              }
            }
          }
        } catch (_) { }
      }
    }
    const identityMap = {};
    if (identityIds.size) {
      const [identRows] = await pool.query(
        'SELECT id, name FROM identities WHERE id IN (?) AND org_id = ?',
        [[...identityIds], orgId]
      );
      for (const ident of identRows) identityMap[ident.id] = safeString(ident.name);
    }

    const deptMap = {}, wgMap = {};
    if (deptIdSet.size) {
      const [deptRows] = await pool.query(
        'SELECT id, name FROM departments WHERE id IN (?) AND org_id = ?',
        [[...deptIdSet], orgId]
      );
      for (const d of deptRows) deptMap[d.id] = safeString(d.name);
    }
    if (wgIdSet.size) {
      const [wgRows] = await pool.query(
        'SELECT id, name FROM work_groups WHERE id IN (?) AND org_id = ?',
        [[...wgIdSet], orgId]
      );
      for (const w of wgRows) wgMap[w.id] = safeString(w.name);
    }
    if (hrIdSet.size) {
      const hrCondRows = await hrInfoModel.getByIds([...hrIdSet]);
      for (const hr of hrCondRows) {
        if (!hrMap[hr.id]) hrMap[hr.id] = safeString(hr.name);
      }
    }

    res.json({
      status: 'success',
      userIsSubmitter: isSubmitter,
      userIsApprover: isApprover,
      userIsAdmin: !!admin,
      events: events.map((e) => ({
        id: safeString(e.id),
        eventType: safeString(e.event_type),
        stepIndex: e.step_index,
        round: e.round || 1,
        operatorName: hrMap[e.operator_hr_id] || e.operator_name || '',
        comment: safeString(e.comment),
        createdAt: e.created_at
      })),
      submission: {
        id: safeString(submission.id),
        submissionNumber: safeString(submission.submission_number),
        title: safeString(submission.title),
        description: safeString(submission.description),
        type: safeString(submission.type),
        templateId: safeString(submission.template_id),
        templateName,
        status: safeString(submission.status),
        submittedBy: safeString(submission.submitted_by),
        submitterName: hrMap[submission.submitted_by] || '未知',
        currentStepIndex: submission.current_step_index,
        resubmitMode: safeString(submission.resubmit_mode),
        previousRejectStepIndex: submission.previous_reject_step_index,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at
      },
      steps: steps.map((s) => {
        // Build condition display strings from step_conditions_json
        const condDisplay = buildStepConditionsDisplay(
          s.step_conditions_json,
          { hrMap, identityMap, deptMap, wgMap }
        );

        // Build legacy approverDesc as fallback
        let legacyApproverDesc = '';
        // Resolve legacy identity field — may contain comma-separated IDs (multi-select)
        const rawIdentId = (s.approver_identity_id || '').trim();
        let identName = '';
        if (rawIdentId) {
          const identIds = rawIdentId.split(',').map(function(id) { return id.trim(); }).filter(Boolean);
          const identNames = identIds.map(function(id) { return identityMap[id] || id; }).filter(Boolean);
          identName = identNames.join('、');
        }
        const scopeType = (s.scope_type || '').trim();
        if (s.approver_type === 'specific_person') {
          const rawHrId = (s.approver_hr_id || '').trim();
          let personNames = '';
          if (rawHrId) {
            const hrIds = rawHrId.split(',').map(function(id) { return id.trim(); }).filter(Boolean);
            const names = hrIds.map(function(id) { return hrMap[id] || id; }).filter(Boolean);
            personNames = names.join('、');
          }
          legacyApproverDesc = '由 ' + (personNames || '未指定') + ' 审批';
        } else if (identName || scopeType) {
          // Always build from scope + identity, using fallback labels when names are missing
          const identLabel = identName || '特定身份';
          if (!scopeType || scopeType === 'all') {
            legacyApproverDesc = '由 全体 ' + identLabel + ' 审批';
          } else if (scopeType === 'same_department') {
            legacyApproverDesc = '由 同部门 ' + identLabel + ' 审批';
          } else if (scopeType === 'same_work_group') {
            legacyApproverDesc = '由 同职能组 ' + identLabel + ' 审批';
          } else if (scopeType === 'specific_department') {
            const dn = resolveMultiNames(s.scope_department_id, deptMap);
            if (dn) {
              legacyApproverDesc = '由 ' + dn + ' ' + identLabel + ' 审批';
            } else {
              legacyApproverDesc = '由 ' + identLabel + ' 审批';
            }
          } else if (scopeType === 'specific_work_group') {
            const dn = resolveMultiNames(s.scope_department_id, deptMap);
            const wn = resolveMultiNames(s.scope_work_group_id, wgMap);
            const loc = [dn, wn].filter(Boolean).join('·');
            if (loc) {
              legacyApproverDesc = '由 ' + loc + ' ' + identLabel + ' 审批';
            } else {
              legacyApproverDesc = '由 ' + identLabel + ' 审批';
            }
          } else {
            legacyApproverDesc = '由 ' + identLabel + ' 审批';
          }
        }

        // Resolve multi-select names for legacy flat fields
        let approverNameDisplay = '未指定';
        let rawHrId2 = (s.approver_hr_id || '').trim();
        if (rawHrId2) {
          let hrIds2 = rawHrId2.split(',').map(function(id) { return id.trim(); }).filter(Boolean);
          let hrNames2 = hrIds2.map(function(id) { return hrMap[id] || id; }).filter(Boolean);
          approverNameDisplay = hrNames2.join('、');
        }
        let approverIdentityNameDisplay = '';
        let rawIdentId2 = (s.approver_identity_id || '').trim();
        if (rawIdentId2) {
          let identIds2 = rawIdentId2.split(',').map(function(id) { return id.trim(); }).filter(Boolean);
          let identNames2 = identIds2.map(function(id) { return identityMap[id] || id; }).filter(Boolean);
          approverIdentityNameDisplay = identNames2.join('、');
        }

        return {
        id: safeString(s.id),
        sortOrder: s.sort_order,
        stepName: safeString(s.step_name || s.name || ''),
        approverType: safeString(s.approver_type),
        approverHrId: safeString(s.approver_hr_id),
        approverName: approverNameDisplay,
        approverIdentityId: safeString(s.approver_identity_id),
        approverIdentityName: approverIdentityNameDisplay,
        scopeType: safeString(s.scope_type),
        scopeDepartmentId: safeString(s.scope_department_id),
        scopeDepartmentName: resolveMultiNames(s.scope_department_id, deptMap),
        scopeWorkGroupId: safeString(s.scope_work_group_id),
        scopeWorkGroupName: resolveMultiNames(s.scope_work_group_id, wgMap),
        actionType: safeString(s.action_type),
        allowApproverDesignation: Number(s.allow_approver_designation) === 1,
        status: safeString(s.status),
        comment: safeString(s.comment),
        rejectionReason: safeString(s.rejection_reason),
        round: s.round,
        processedAt: s.processed_at,
        stepConditionsJson: s.step_conditions_json || null,
        stepConditionsDisplay: condDisplay.displayParts,
        approverDesc: condDisplay.approverDesc || legacyApproverDesc || '由未指定审批人审批'
      };
    }),
      files: files.map((f) => ({
        id: safeString(f.id),
        fileName: safeString(f.file_name),
        mimeType: safeString(f.mime_type),
        fileSize: f.file_size,
        fileHash: safeString(f.file_hash),
        sortOrder: f.sort_order
      })),
      signatures: signatures.map((sig) => ({
        id: safeString(sig.id),
        stepId: safeString(sig.step_id),
        fileId: safeString(sig.file_id),
        signatureType: safeString(sig.signature_type),
        imageData: sig.image_data || '',
        positionX: parseFloat(sig.position_x) || 0,
        positionY: parseFloat(sig.position_y) || 0,
        size: parseFloat(sig.signature_size) || 1,
        rotation: parseFloat(sig.rotation_degrees) || 0,
        page: sig.page || 1,
        signerHrId: safeString(sig.signer_hr_id),
        signerName: hrMap[sig.signer_hr_id] || '未知',
        round: sig.round,
        signedAt: sig.signed_at
      }))
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Approval Actions
// ═══════════════════════════════════════════════════

/**
 * Shared authorization check for approve/reject step actions.
 * Checks: 1) step_conditions_json, 2) template step conditions fallback, 3) legacy flat fields.
 * @returns {boolean} authorized
 */
async function checkStepAuthorization(step, submission, hrId, approverOverride) {
  const orgId = await getCurrentOrgId();
  const currentApprover = approverOverride ? {
    id: hrId,
    department_id: safeString(approverOverride.department_id),
    identity_id: safeString(approverOverride.identity_id),
    work_group_id: safeString(approverOverride.work_group_id)
  } : null;

  let hasExplicitConditions = false;

  // 1. Check step_conditions_json first (new multi-condition model)
  if (step.step_conditions_json) {
    hasExplicitConditions = true;
    try {
      const conditions = JSON.parse(step.step_conditions_json);
      const approver = currentApprover || (await pool.query(
        'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
        [hrId, orgId]
      ))[0][0];
      if (approver) {
        const [subRows] = await pool.query(
          'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
          [submission.submitted_by, orgId]
        );
        const submitter = subRows[0] || null;
        if (matchesAnyCondition(conditions, approver, submitter)) return true;
      }
    } catch (_) {
      // Corrupt explicit conditions fail closed; template and legacy fields
      // may be broader and must not become an authorization fallback.
    }
  }

  // 2. Fallback: load conditions from template step (covers legacy submissions
  //    or steps created before conditions were properly serialized).
  //    Only when NO explicit conditions exist — if step_conditions_json was parsed
  //    successfully (even if it didn't match), it is the sole authority.
  if (!hasExplicitConditions && step.template_step_id) {
    try {
      const tplConds = await submissionStepModel.getTemplateStepConditions(step.template_step_id);
      if (tplConds) {
        const approver = currentApprover || (await pool.query(
          'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
          [hrId, orgId]
        ))[0][0];
        if (approver) {
          const [subRows] = await pool.query(
            'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
            [submission.submitted_by, orgId]
          );
          const submitter = subRows[0] || null;
          if (matchesAnyCondition(tplConds, approver, submitter)) return true;
        }
      }
    } catch (_) { /* fall through */ }
  }

  // 3. Legacy check — uses inCsv() to handle comma-separated multi-ID fields.
  //    Only when NO explicit conditions exist (legacy fields may be stale).
  if (!hasExplicitConditions) {
    if (step.approver_type === 'specific_person' && step.approver_hr_id) {
      if (inCsv(step.approver_hr_id, hrId)) return true;
    } else if (step.approver_type === 'identity' && step.approver_identity_id) {
      const approver = currentApprover || (await pool.query(
        'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
        [hrId, orgId]
      ))[0][0];
      if (approver && inCsv(step.approver_identity_id, approver.identity_id)) {
        let submitter = null;
        const [subRows] = await pool.query(
          'SELECT id, department_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
          [submission.submitted_by, orgId]
        );
        submitter = subRows[0] || null;
        if (matchesScope(step, approver, submitter)) return true;
      }
    }
    // 4. 无条件步骤不授予隐式审批权；管理员身份也不能替代普通用户人事身份审批。
    if (!step.step_conditions_json && !step.template_step_id &&
        !step.approver_hr_id && !step.approver_identity_id) {
      return false;
    }
  }

  return false;
}

// approveStep — Approve current step with optional signature/stamp
async function validateStepForAction(step, submission, submissionId, conn) {
  if (step.submission_id !== submissionId) {
    return { ok: false, status: 'invalid_params', message: '请刷新后重试' };
  }
  if (submission.status !== 'in_progress') {
    return { ok: false, status: 'invalid_state', message: '请刷新页面查看最新进度' };
  }
  if (step.status !== 'pending') {
    return { ok: false, status: 'invalid_state', message: '该审批已处理，请刷新页面' };
  }
  if (step.sort_order !== submission.current_step_index) {
    return { ok: false, status: 'invalid_state', message: '请处理当前审批步骤' };
  }
  const maxRound = await submissionStepModel.getMaxRound(submission.id, step.sort_order, conn);
  if ((step.round || 1) !== maxRound) {
    return { ok: false, status: 'invalid_state', message: '请刷新页面查看最新进度' };
  }
  return { ok: true };
}

router.post('/approveStep', async (req, res) => {
  const conn = await pool.getConnection();
  const signedFileBackups = [];
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
    }
    const actor = actorResult.actor;
    const hrId = actor.id;

    const orgId = await getCurrentOrgId();

    const submissionId = safeString(req.body.submissionId);
    const stepId = safeString(req.body.stepId);
    const comment = safeString(req.body.comment);
    const signatures = Array.isArray(req.body.signatures) ? req.body.signatures : [];

    if (!submissionId || !stepId) {
      return res.json({ status: 'invalid_params', message: '请重新打开审批详情' });
    }

    await conn.beginTransaction();
    const submission = await submissionModel.getByIdForUpdate(submissionId, conn);
    if (!submission) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '请刷新申请记录' });
    }
    if (submission.status !== 'in_progress') {
      await conn.rollback();
      return res.json({ status: 'success', message: '该审核已处理', submissionStatus: submission.status, idempotent: true });
    }

    const step = await submissionStepModel.getByIdForUpdate(stepId, conn);
    if (!step) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '请刷新审批详情' });
    }
    if (step.status !== 'pending') {
      await conn.rollback();
      return res.json({ status: 'success', message: '该步骤已处理', stepStatus: step.status, idempotent: true });
    }

    // Check authorization — shared helper
    const stepState = await validateStepForAction(step, submission, submissionId, conn);
    if (!stepState.ok) {
      await conn.rollback();
      return res.json({ status: stepState.status, message: stepState.message });
    }

    const authorized = await checkStepAuthorization(step, submission, hrId, actor.profile);
    if (!authorized) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: '您不是该步骤的审批人' });
    }

    const now = new Date();
    const nowISO = nowLocal();
    const currentRound = step.round;
    const designatedNextPersonIds = Array.isArray(req.body.designatedNextPersonIds)
      ? [...new Set(req.body.designatedNextPersonIds.map(function(id) { return safeString(id); }).filter(Boolean))]
      : [];
    const allSteps = await submissionStepModel.getBySubmissionId(submissionId, conn);
    const currentSteps = allSteps
      .filter((s) => s.round === currentRound)
      .sort((a, b) => a.sort_order - b.sort_order);
    const nextStep = currentSteps.find((s) => s.sort_order === step.sort_order + 1);
    if (designatedNextPersonIds.length && (!nextStep || Number(nextStep.allow_approver_designation) !== 1)) {
      await conn.rollback();
      return res.json({ status: 'invalid_params', message: nextStep ? '下一步按审批条件确定审批人' : '已是最后一步' });
    }

    // Update step status to approved
    await submissionStepModel.updateStatus(stepId, {
      status: 'approved',
      comment,
      processedAt: nowISO
    }, conn);

    // Record signatures/stamps and persist them onto the target files.
    const signaturesByFile = new Map();
    for (const sigData of signatures) {
      const fileId = safeString(sigData.fileId);
      const imageData = safeString(sigData.imageData);
      if (!fileId || !imageData) continue;
      const positionX = Math.max(0, Math.min(1, parseFloat(sigData.positionX) || 0));
      const positionY = Math.max(0, Math.min(1, parseFloat(sigData.positionY) || 0));
      const size = Math.max(0.5, Math.min(2.2, parseFloat(sigData.size) || 1));
      const rotation = Math.max(-180, Math.min(180, parseFloat(sigData.rotation) || 0));
      const normalized = {
        id: generateId(),
        fileId,
        signatureType: safeString(sigData.signatureType) || 'signature',
        imageData,
        positionX,
        positionY,
        size,
        rotation,
        page: Math.max(1, parseInt(sigData.page, 10) || 1)
      };
      if (!signaturesByFile.has(fileId)) signaturesByFile.set(fileId, []);
      signaturesByFile.get(fileId).push(normalized);
    }

    for (const [fileId, fileSignatures] of signaturesByFile) {
      const file = await submissionFileModel.getById(fileId);
      if (!file || file.submission_id !== submissionId) {
        throw new Error('请重新选择签名');
      }

      if (file.file_path && fs.existsSync(file.file_path)) {
        signedFileBackups.push({
          filePath: file.file_path,
          buffer: fs.readFileSync(file.file_path)
        });
      }
      const overlayResult = await overlaySignaturesOnFile(file, fileSignatures);
      const documentHash = overlayResult
        ? overlayResult.fileHash
        : (file.file_path && fs.existsSync(file.file_path) ? hashFile(fs.readFileSync(file.file_path)) : file.file_hash);

      if (overlayResult) {
        await submissionFileModel.updateMetadata(fileId, overlayResult, conn);
      }

      fileSignatures.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const lastSig = await submissionSignatureModel.getLastSignature(fileId, currentRound, conn);
      let previousHash = lastSig ? lastSig.signature_data_hash : null;

      for (const sigData of fileSignatures) {
        const sigHash = computeSignatureHash({
          id: sigData.id,
          stepId,
          signerHrId: hrId,
          positionX: sigData.positionX,
          positionY: sigData.positionY,
          size: sigData.size,
          rotation: sigData.rotation,
          page: sigData.page,
          round: currentRound,
          previousSignatureHash: previousHash,
          documentHash,
          signedAt: now.toISOString()
        });

        await submissionSignatureModel.create(sigData.id, {
          submissionId,
          stepId,
          fileId,
          signatureType: sigData.signatureType,
          imageData: sigData.imageData,
          positionX: sigData.positionX,
          positionY: sigData.positionY,
          size: sigData.size,
          rotation: sigData.rotation,
          page: sigData.page,
          signerHrId: hrId,
          round: currentRound,
          previousSignatureHash: previousHash,
          documentHashAtSigning: documentHash,
          signatureDataHash: sigHash,
          signedAt: now
        }, conn);
        previousHash = sigHash;
      }
    }

    // Check if there are more steps
    if (nextStep) {
      // If the approver designated specific people for the next step,
      // NARROW the scope: only designated persons can approve, BUT they
      // must also be eligible under the original step conditions (can't expand scope).
      if (designatedNextPersonIds.length > 0) {
        // Parse original next-step conditions (before modification)
        let originalConds = [];
        if (nextStep.step_conditions_json) {
          try {
            originalConds = JSON.parse(nextStep.step_conditions_json);
            if (!Array.isArray(originalConds)) originalConds = [];
          } catch (_) { originalConds = []; }
        }
        // Fallback: load from template
        if (!originalConds.length && nextStep.template_step_id) {
          try {
            const tplConds2 = await submissionStepModel.getTemplateStepConditions(nextStep.template_step_id);
            if (tplConds2) originalConds = tplConds2;
          } catch (_) {}
        }

        // Validate each designated person against original conditions (cannot expand scope)
        const [subRows2] = await pool.query(
          'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
          [submission.submitted_by, orgId]
        );
        const submitter2 = subRows2[0] || null;

        const validPersonIds = [];
        for (let dni = 0; dni < designatedNextPersonIds.length; dni++) {
          const pid = designatedNextPersonIds[dni];
          // If no original conditions (fully open scope), anyone is eligible
          if (!originalConds.length) {
            validPersonIds.push(pid);
            continue;
          }
          // Check this person against original conditions
          const [personRows] = await pool.query(
            'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
            [pid, orgId]
          );
          const person = personRows[0];
          if (person && matchesAnyCondition(originalConds, person, submitter2)) {
            validPersonIds.push(pid);
          }
        }

        if (validPersonIds.length !== designatedNextPersonIds.length) {
          throw new Error('所选下一步审批人已不符合审批条件');
        }

        if (validPersonIds.length > 0) {
          // Replace conditions entirely: ONLY designated (and eligible) persons can approve
          let newConds = validPersonIds.map(function(pid) {
            return {
              conditionType: 'person',
              personHrIds: pid,
              departmentScope: null,
              specificDepartmentId: null,
              workGroupScope: null,
              specificWorkGroupId: null,
              identityScope: null,
              specificIdentityId: null
            };
          });
          let newCondsJson = JSON.stringify(newConds);
          await conn.query(
            'UPDATE audit_submission_steps SET step_conditions_json = ? WHERE id = ? AND org_id = ?',
            [newCondsJson, nextStep.id, orgId]
          );
        }
      }
      // Move to next step
      await submissionModel.update(submissionId, { currentStepIndex: nextStep.sort_order }, conn);
    } else {
      // All steps approved — submission complete
      await submissionModel.update(submissionId, { status: 'approved' }, conn);
    }

    // Insert approve event
    const [approverNameRows] = await pool.query('SELECT name FROM hr_info WHERE id = ? AND org_id = ?', [hrId, orgId]);
    const approverEventName = approverNameRows[0] ? approverNameRows[0].name : '';
    await auditEventModel.create(generateId(), {
      ...buildAuditOperatorContext(req),
      submissionId,
      eventType: 'approve',
      stepIndex: step.sort_order,
      round: currentRound,
      operatorHrId: hrId,
      operatorName: approverEventName,
      comment: comment || null
    }, conn);

    // 业务状态与通知 Outbox 在同一事务提交。
    if (!nextStep) {
      // Final step approved → notify submitter
      await createNotification({
        hrId: submission.submitted_by,
        type: 'submission_approved',
        title: '审核已通过',
        description: '您提交的「' + (submission.title || submission.submission_number) + '」已通过全部审核',
        category: 'audit',
        targetType: 'submission',
        targetId: submissionId,
        targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + submissionId
      }, conn);
    } else {
      // Advanced to next step → notify submitter of progress
      await createNotification({
        hrId: submission.submitted_by,
        type: 'submission_progress',
        title: '审核进度更新',
        description: '您提交的「' + (submission.title || submission.submission_number) + '」已通过第' + step.sort_order + '步，进入第' + nextStep.sort_order + '步',
        category: 'audit',
        targetType: 'submission',
        targetId: submissionId,
        targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + submissionId
      }, conn);
    }
    await conn.commit();
    res.json({ status: 'success', message: '审批通过' + (nextStep ? '，已流转至下一步' : '，审核完成') });
  } catch (e) {
    await conn.rollback();
    for (const backup of signedFileBackups.reverse()) {
      try {
        fs.writeFileSync(backup.filePath, backup.buffer);
      } catch (restoreErr) {
        console.error('[audit:approveStep] failed to restore signed file backup:', restoreErr);
      }
    }
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    if (conn) conn.release();
  }
});

// rejectStep — Reject current step
router.post('/rejectStep', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
    }
    const actor = actorResult.actor;
    const hrId = actor.id;

    const orgId = await getCurrentOrgId();

    const submissionId = safeString(req.body.submissionId);
    const stepId = safeString(req.body.stepId);
    const rejectionReason = safeString(req.body.rejectionReason);

    if (!submissionId || !stepId) {
      return res.json({ status: 'invalid_params', message: '请重新打开审批详情' });
    }
    if (!rejectionReason) {
      return res.json({ status: 'invalid_params', message: '请填写驳回理由' });
    }

    await conn.beginTransaction();
    const submission = await submissionModel.getByIdForUpdate(submissionId, conn);
    if (!submission) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '请刷新申请记录' });
    }

    const step = await submissionStepModel.getByIdForUpdate(stepId, conn);
    if (!step) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '请刷新审批详情' });
    }
    if (step.status !== 'pending') {
      await conn.rollback();
      return res.json({ status: 'success', message: '该步骤已处理', stepStatus: step.status, idempotent: true });
    }

    // Check authorization — shared helper
    const stepState = await validateStepForAction(step, submission, submissionId, conn);
    if (!stepState.ok) {
      await conn.rollback();
      return res.json({ status: stepState.status, message: stepState.message });
    }

    const authorized = await checkStepAuthorization(step, submission, hrId, actor.profile);
    if (!authorized) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: '您不是该步骤的审批人' });
    }

    const nowISO = nowLocal();

    // Update step to rejected
    await submissionStepModel.updateStatus(stepId, {
      status: 'rejected',
      rejectionReason,
      processedAt: nowISO
    }, conn);

    // Set submission to rejected, record which step rejected
    await submissionModel.update(submissionId, {
      status: 'rejected',
      previousRejectStepIndex: step.sort_order
    }, conn);

    // Insert reject event
    const [rejecterNameRows] = await pool.query('SELECT name FROM hr_info WHERE id = ? AND org_id = ?', [hrId, orgId]);
    const rejecterEventName = rejecterNameRows[0] ? rejecterNameRows[0].name : '';
    await auditEventModel.create(generateId(), {
      ...buildAuditOperatorContext(req),
      submissionId,
      eventType: 'reject',
      stepIndex: step.sort_order,
      round: step.round,
      operatorHrId: hrId,
      operatorName: rejecterEventName,
      comment: rejectionReason || null
    }, conn);

    await createNotification({
      hrId: submission.submitted_by,
      type: 'submission_rejected',
      title: '审核被驳回',
      description: '您提交的「' + (submission.title || submission.submission_number) + '」在第' + step.sort_order + '步被驳回' + (rejectionReason ? '：' + rejectionReason : ''),
      category: 'audit',
      targetType: 'submission',
      targetId: submissionId,
      targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + submissionId
    }, conn);
    await conn.commit();
    res.json({ status: 'success', message: '已驳回，提交人将收到通知' });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    if (conn) conn.release();
  }
});

// updateAuditSubmission — Edit submission metadata, steps, and files when in editable status
router.post('/updateAuditSubmission', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const orgId = await getCurrentOrgId();

    const submissionId = safeString(req.body.submissionId);
    if (!submissionId) return res.json({ status: 'invalid_params', message: '请重新打开申请' });

    const submission = await submissionModel.getById(submissionId);
    if (!submission) return res.json({ status: 'not_found', message: '请刷新申请记录' });
    if (submission.submitted_by !== hrId) {
      return res.json({ status: 'forbidden', message: '只有提交人可以修改' });
    }

    const editableStatuses = ['draft', 'pending', 'rejected', 'withdrawn'];
    if (!editableStatuses.includes(submission.status)) {
      return res.json({ status: 'invalid_state', message: '请在待修改时编辑申请' });
    }

    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const newType = safeString(req.body.type) || submission.type;
    const newTemplateId = safeString(req.body.templateId) || null;
    const newResubmitMode = safeString(req.body.resubmitMode) || submission.resubmit_mode;
    const newSteps = Array.isArray(req.body.steps) ? req.body.steps : null;
    const uploadedFiles = Array.isArray(req.body.files) ? req.body.files : null;

    if (!title) return res.json({ status: 'invalid_params', message: '请输入标题' });

    await conn.beginTransaction();

    // Update submission metadata
    await submissionModel.update(submissionId, {
      title,
      description,
      type: newType,
      templateId: newType === 'template' ? newTemplateId : null,
      resubmitMode: newResubmitMode
    }, conn);

    // Compute max round BEFORE removing old steps (for edit event logging)
    const oldSteps = await submissionStepModel.getBySubmissionId(submissionId);
    let editEventRound = 1;
    for (let osi = 0; osi < oldSteps.length; osi++) {
      editEventRound = Math.max(editEventRound, oldSteps[osi].round || 1);
    }

    // Replace steps
    // Remove existing steps for this submission
    await submissionStepModel.removeBySubmissionId(submissionId, conn);

    let stepsToCreate = [];
    if (newType === 'template' && newTemplateId) {
      // Load template steps
      const templateSteps = await flowTemplateStepModel.getByTemplateId(newTemplateId);
      const allConditions = await flowTemplateStepConditionModel.getByTemplateId(newTemplateId);
      const stepConditionMap = {};
      for (const c of allConditions) {
        const sid = c.template_step_id;
        if (!stepConditionMap[sid]) stepConditionMap[sid] = [];
        stepConditionMap[sid].push({
          conditionType: c.condition_type,
          personHrIds: c.person_hr_ids,
          departmentScope: c.department_scope,
          specificDepartmentId: c.specific_department_id,
          workGroupScope: c.work_group_scope,
          specificWorkGroupId: c.specific_work_group_id,
          identityScope: c.identity_scope,
          specificIdentityId: c.specific_identity_id
        });
      }
      stepsToCreate = templateSteps.map((ts, idx) => ({
        templateStepId: ts.id,
        sortOrder: idx + 1,
        actionType: ts.action_type || 'sign',
        allowApproverDesignation: Number(ts.allow_approver_designation) === 1,
        name: ts.name || '',
        conditions: stepConditionMap[ts.id] || []
      }));
    } else if (newSteps && newSteps.length) {
      // Ad-hoc: use user-provided steps
      stepsToCreate = newSteps.map((s, idx) => {
        let conditions = Array.isArray(s.conditions) ? s.conditions : [];
        if (conditions.length === 0) {
          const scopeType = safeString(s.scopeType) || 'all';
          const approverIdentId = safeString(s.approverIdentityId);
          if (approverIdentId) {
            const cond = {
              conditionType: 'identity_scope',
              identityScope: 'specific',
              specificIdentityId: approverIdentId,
              departmentScope: 'all',
              workGroupScope: 'all'
            };
            if (scopeType === 'same_department') cond.departmentScope = 'own';
            else if (scopeType === 'same_work_group') cond.workGroupScope = 'own';
            else if (scopeType === 'specific_department') {
              cond.departmentScope = 'specific';
              cond.specificDepartmentId = safeString(s.scopeDepartmentId) || null;
            } else if (scopeType === 'specific_work_group') {
              cond.departmentScope = 'specific';
              cond.specificDepartmentId = safeString(s.scopeDepartmentId) || null;
              cond.workGroupScope = 'specific';
              cond.specificWorkGroupId = safeString(s.scopeWorkGroupId) || null;
            }
            conditions.push(cond);
          }
        }
        return {
          templateStepId: null,
          sortOrder: idx + 1,
          approverType: safeString(s.approverType) || null,
          approverHrId: safeString(s.approverHrId) || null,
          approverIdentityId: safeString(s.approverIdentityId) || null,
          actionType: safeString(s.actionType) || 'sign',
          allowApproverDesignation: false,
          name: safeString(s.name) || '',
          conditions
        };
      });
    }

    if (stepsToCreate.length > 0) {
      for (let i = 0; i < stepsToCreate.length; i++) {
        const s = stepsToCreate[i];
        const stepId = generateId();
        let stepConditionsJson = s.conditions && s.conditions.length > 0 ? JSON.stringify(s.conditions) : null;
        await submissionStepModel.create(stepId, {
          submissionId,
          templateStepId: s.templateStepId || null,
          sortOrder: s.sortOrder,
          approverType: s.approverType || null,
          approverHrId: s.approverHrId || null,
          approverIdentityId: s.approverIdentityId || null,
          actionType: s.actionType || 'sign',
          allowApproverDesignation: s.allowApproverDesignation === true,
          stepName: s.name || s.stepName || '',
          round: 1,
          stepConditionsJson
        }, conn);
      }
    }

    // Reset to step 1 since steps changed
    await submissionModel.update(submissionId, { currentStepIndex: 1, previousRejectStepIndex: null }, conn);

    // Replace files if provided
    if (uploadedFiles && uploadedFiles.length) {
      // Remove existing files
      const existingFiles = await submissionFileModel.getBySubmissionId(submissionId);
      for (const ef of existingFiles) {
        if (ef.file_path && require('fs').existsSync(ef.file_path)) {
          try { require('fs').unlinkSync(ef.file_path); } catch (_) {}
        }
      }
      await submissionFileModel.removeBySubmissionId(submissionId, conn);

      await attachUploadedFiles({ uploadedFiles, submissionId, openid, conn });
    }

    // Insert edit event
    const [editorNameRows] = await pool.query('SELECT name FROM hr_info WHERE id = ? AND org_id = ?', [hrId, orgId]);
    const editorName = editorNameRows[0] ? editorNameRows[0].name : '';
    await auditEventModel.create(generateId(), {
      ...buildAuditOperatorContext(req),
      submissionId,
      eventType: 'edit',
      stepIndex: null,
      round: editEventRound,
      operatorHrId: hrId,
      operatorName: editorName,
      comment: null
    }, conn);

    await conn.commit();
    res.json({ status: 'success', message: '审核已更新' });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    if (conn) conn.release();
  }
});

// resubmitAudit — Resubmit after rejection
router.post('/resubmitAudit', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const orgId = await getCurrentOrgId();

    const submissionId = safeString(req.body.submissionId);
    if (!submissionId) return res.json({ status: 'invalid_params', message: '请重新打开申请' });

    const submission = await submissionModel.getById(submissionId);
    if (!submission) return res.json({ status: 'not_found', message: '请刷新申请记录' });
    if (submission.submitted_by !== hrId) {
      return res.json({ status: 'forbidden', message: '只有提交人可以重提交' });
    }
    if (submission.status !== 'rejected' && submission.status !== 'withdrawn' && submission.status !== 'pending') {
      return res.json({ status: 'invalid_state', message: '请在待修改时重新提交' });
    }

    // Optional updates during resubmission
    const newTitle = safeString(req.body.title);
    const newDescription = safeString(req.body.description);
    if (newTitle || newDescription) {
      const updateData = {};
      if (newTitle) updateData.title = newTitle;
      if (newDescription) updateData.description = newDescription;
      await submissionModel.update(submissionId, updateData, conn);
    }

    const isWithdrawn = submission.status === 'withdrawn';
    const isPending = submission.status === 'pending';

    await conn.beginTransaction();

    // Clean up: mark all old-round pending steps as 'superseded' so they
    // don't pollute authorization queries that should only see the latest round.
    await conn.query(
      `UPDATE audit_submission_steps
       SET status = 'superseded'
       WHERE submission_id = ? AND status = 'pending' AND org_id = ?`,
      [submissionId, orgId]
    );

    const allSteps = await submissionStepModel.getBySubmissionId(submissionId);

    if (isPending) {
      // Pending: steps already exist but status wasn't updated to in_progress
      // Simply activate the submission — no new steps needed
      await submissionModel.update(submissionId, {
        status: 'in_progress',
        currentStepIndex: 1
      }, conn);
      // Insert submit event (first submit from pending state)
      const [resubNameRows1] = await pool.query('SELECT name FROM hr_info WHERE id = ? AND org_id = ?', [hrId, orgId]);
      await auditEventModel.create(generateId(), {
        ...buildAuditOperatorContext(req),
        submissionId,
        eventType: 'submit',
        stepIndex: null,
        round: 1,
        operatorHrId: hrId,
        operatorName: resubNameRows1[0] ? resubNameRows1[0].name : '',
        comment: null
      }, conn);

      await conn.commit();
      return res.json({
        status: 'success',
        message: '审核已提交，审批流程已启动'
      });
    }

    const resubmitMode = isWithdrawn ? 'fresh' : submission.resubmit_mode;
    const rejectStepIndex = isWithdrawn ? 1 : (submission.previous_reject_step_index || 1);
    // Use MAX round across ALL steps (not just the first one) to ensure
    // round numbers only ever increase, never decrease or repeat.
    let maxExistingRound = 1;
    for (let ri = 0; ri < allSteps.length; ri++) {
      maxExistingRound = Math.max(maxExistingRound, allSteps[ri].round || 1);
    }
    const newRound = maxExistingRound + 1;
    const latestStepBySortOrder = {};
    allSteps
      .slice()
      .sort(function(a, b) {
        if ((a.round || 1) !== (b.round || 1)) return (a.round || 1) - (b.round || 1);
        return String(a.id).localeCompare(String(b.id));
      })
      .forEach(function(s) {
        latestStepBySortOrder[s.sort_order] = s;
      });
    const canonicalSteps = Object.keys(latestStepBySortOrder)
      .map(function(k) { return latestStepBySortOrder[k]; })
      .sort(function(a, b) { return a.sort_order - b.sort_order; });

    if (!isWithdrawn && resubmitMode === 'from_rejector') {
      // Create new round entries for all steps from reject step onwards.
      // Recreating only the reject step would leave subsequent steps stranded
      // in the old round, causing the flow to terminate prematurely.
      const remainingSteps = canonicalSteps
        .filter(function(s) { return s.sort_order >= rejectStepIndex; })
        .sort(function(a, b) { return a.sort_order - b.sort_order; });
      for (let rsi = 0; rsi < remainingSteps.length; rsi++) {
        let rs = remainingSteps[rsi];
        let stepId = generateId();
        await submissionStepModel.create(stepId, {
          submissionId,
          templateStepId: safeString(rs.template_step_id),
          sortOrder: rs.sort_order,
          approverType: rs.approver_type,
          approverHrId: rs.approver_hr_id,
          approverIdentityId: rs.approver_identity_id,
          actionType: rs.action_type,
          allowApproverDesignation: Number(rs.allow_approver_designation) === 1,
          stepName: rs.step_name || rs.name || '',
          round: newRound,
          stepConditionsJson: rs.step_conditions_json
        }, conn);
      }
    } else {
      // Fresh mode: create new round entries for ALL steps
      const templateSteps = canonicalSteps;
      for (const ts of templateSteps) {
        const stepId = generateId();
        await submissionStepModel.create(stepId, {
          submissionId,
          templateStepId: safeString(ts.template_step_id),
          sortOrder: ts.sort_order,
          approverType: ts.approver_type,
          approverHrId: ts.approver_hr_id,
          approverIdentityId: ts.approver_identity_id,
          actionType: ts.action_type,
          allowApproverDesignation: Number(ts.allow_approver_designation) === 1,
          stepName: ts.step_name || ts.name || '',
          round: newRound,
          stepConditionsJson: ts.step_conditions_json
        }, conn);
      }
    }

    // Reset submission status
    const startStepIndex = resubmitMode === 'from_rejector' ? rejectStepIndex : 1;
    await submissionModel.update(submissionId, {
      status: 'in_progress',
      currentStepIndex: startStepIndex
    }, conn);

    // Insert resubmit event
    const [resubNameRows2] = await pool.query('SELECT name FROM hr_info WHERE id = ? AND org_id = ?', [hrId, orgId]);
    await auditEventModel.create(generateId(), {
      ...buildAuditOperatorContext(req),
      submissionId,
      eventType: 'resubmit',
      stepIndex: null,
      round: newRound,
      operatorHrId: hrId,
      operatorName: resubNameRows2[0] ? resubNameRows2[0].name : '',
      comment: null
    }, conn);

    await conn.commit();
    // Notify approvers at the start step (fire-and-forget)
    res.json({
      status: 'success',
      message: isWithdrawn
        ? '已重新提交，将从头开始审批流程'
        : (resubmitMode === 'from_rejector'
          ? '已重提交，直接流转至驳回审批人'
          : '已重提交，将从头开始审批流程')
    });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    if (conn) conn.release();
  }
});

// withdrawSubmission — Withdraw own submission
router.post('/withdrawSubmission', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const orgId = await getCurrentOrgId();

    const submissionId = safeString(req.body.submissionId);
    if (!submissionId) return res.json({ status: 'invalid_params', message: '请重新打开申请' });

    const submission = await submissionModel.getById(submissionId);
    if (!submission) return res.json({ status: 'not_found', message: '请刷新申请记录' });
    if (submission.submitted_by !== hrId) {
      return res.json({ status: 'forbidden', message: '只有提交人可以撤回' });
    }
    if (submission.status === 'approved') {
      return res.json({ status: 'invalid_state', message: '已完成的申请无需撤回' });
    }
    if (submission.status === 'withdrawn') {
      return res.json({ status: 'invalid_state', message: '该审核已经撤回' });
    }
    if (submission.status === 'draft') {
      return res.json({ status: 'invalid_state', message: '草稿无需撤回' });
    }
    if (submission.status === 'pending') {
      return res.json({ status: 'invalid_state', message: '待提交审核无需撤回' });
    }

    await submissionModel.update(submissionId, { status: 'withdrawn' });

    // Insert withdraw event with actual current round (not hardcoded 1)
    const allSteps = await submissionStepModel.getBySubmissionId(submissionId);
    let currentRound = 1;
    for (let wi = 0; wi < allSteps.length; wi++) {
      currentRound = Math.max(currentRound, allSteps[wi].round || 1);
    }
    const [withdrawNameRows] = await pool.query('SELECT name FROM hr_info WHERE id = ? AND org_id = ?', [hrId, orgId]);
    await auditEventModel.create(generateId(), {
      ...buildAuditOperatorContext(req),
      submissionId,
      eventType: 'withdraw',
      stepIndex: null,
      round: currentRound,
      operatorHrId: hrId,
      operatorName: withdrawNameRows[0] ? withdrawNameRows[0].name : '',
      comment: null
    });

    res.json({ status: 'success', message: '审核已撤回' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listAvailableFlowTemplates — User-facing: list active templates the current user is eligible to start
router.post('/listAvailableFlowTemplates', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'forbidden', message: '请先登录' });

    // Resolve submitter info for starter-condition matching
    const hrId = await resolveHrId(openid);
    let submitterFull = null;
    if (hrId) {
      const [submitterRows] = await pool.query(
        `SELECT h.*, d.name as department_name, wg.name as work_group_name, i.name as identity_name
         FROM hr_info h
         LEFT JOIN departments d ON h.department_id = d.id
         LEFT JOIN work_groups wg ON h.work_group_id = wg.id
         LEFT JOIN identities i ON h.identity_id = i.id
         WHERE h.id = ?`,
        [hrId]
      );
      const info = submitterRows[0] || null;
      if (info) {
        submitterFull = {
          hrId: hrId,
          department_id: info.department_id || '',
          work_group_id: info.work_group_id || '',
          identity_id: info.identity_id || ''
        };
      }
    }

    const templates = await flowTemplateModel.getActive();
    const result = [];

    for (const t of templates) {
      // Check if user is eligible to start this template
      let eligible = false;

      // Parse starter conditions
      let starterConditions = [];
      if (t.starter_conditions_json) {
        try { starterConditions = JSON.parse(t.starter_conditions_json); } catch (_) {}
      }
      if (!Array.isArray(starterConditions)) starterConditions = [];

      if (starterConditions.length) {
        // Must have HR binding to verify starter conditions
        if (!submitterFull) {
          eligible = false;
        } else {
          // Multi-condition OR match
          for (const cond of starterConditions) {
            if (cond.conditionType === 'person') {
              const personIds = (cond.personHrIds || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
              if (personIds.includes(hrId)) { eligible = true; break; }
            } else {
              if (matchesIdentityScopeCondition(cond, submitterFull, submitterFull)) {
                eligible = true; break;
              }
            }
          }
        }
      } else if (t.starter_type === 'identity' && t.starter_identity_id && submitterFull) {
        // Legacy identity check
        const identIds = t.starter_identity_id.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (identIds.includes(submitterFull.identity_id)) eligible = true;
      } else if (t.starter_type === 'specific_person' && t.starter_hr_id) {
        // Legacy specific person check
        const personIds = t.starter_hr_id.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (hrId && personIds.includes(hrId)) eligible = true;
      } else {
        // starter_type === 'self' or no conditions — anyone can start
        eligible = true;
      }

      if (!eligible) continue;

      const steps = await flowTemplateStepModel.getByTemplateId(t.id);
      result.push({
        id: safeString(t.id),
        name: safeString(t.name),
        description: safeString(t.description),
        stepCount: steps.length,
        resubmitMode: safeString(t.resubmit_mode)
      });
    }
    res.json({ status: 'success', templates: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// previewTemplateSteps — Returns template steps with resolved condition display info
router.post('/previewTemplateSteps', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'forbidden', message: '请先登录' });

    const templateId = safeString(req.body.templateId);
    if (!templateId) return res.json({ status: 'invalid_params', message: '请重新选择审核类型' });

    const template = await flowTemplateModel.getById(templateId);
    if (!template) return res.json({ status: 'not_found', message: '请刷新审核类型后重试' });

    const templateSteps = await flowTemplateStepModel.getByTemplateId(templateId);
    const allConditions = await flowTemplateStepConditionModel.getByTemplateId(templateId);

    // Group conditions by template_step_id
    const stepConditionMap = {};
    for (const c of allConditions) {
      const sid = c.template_step_id;
      if (!stepConditionMap[sid]) stepConditionMap[sid] = [];
      stepConditionMap[sid].push({
        conditionType: c.condition_type,
        personHrIds: c.person_hr_ids,
        departmentScope: c.department_scope,
        specificDepartmentId: c.specific_department_id,
        workGroupScope: c.work_group_scope,
        specificWorkGroupId: c.specific_work_group_id,
        identityScope: c.identity_scope,
        specificIdentityId: c.specific_identity_id
      });
    }

    // Collect IDs to resolve names
    const orgId = await getCurrentOrgId();
    const hrIdSet = new Set();
    const identIdSet = new Set();
    const deptIdSet = new Set();
    const wgIdSet = new Set();

    for (const sid in stepConditionMap) {
      for (const cond of stepConditionMap[sid]) {
        if (cond.conditionType === 'person' && cond.personHrIds) {
          cond.personHrIds.split(',').forEach(function(id) { hrIdSet.add(id.trim()); });
        } else {
          if (cond.specificDepartmentId) cond.specificDepartmentId.split(',').forEach(function(id) { deptIdSet.add(id.trim()); });
          if (cond.specificWorkGroupId) cond.specificWorkGroupId.split(',').forEach(function(id) { wgIdSet.add(id.trim()); });
          if (cond.specificIdentityId) cond.specificIdentityId.split(',').forEach(function(id) { identIdSet.add(id.trim()); });
        }
      }
    }

    const identityMap = {};
    if (identIdSet.size) {
      const [idRows] = await pool.query('SELECT id, name FROM identities WHERE id IN (?) AND org_id = ?', [[...identIdSet], orgId]);
      for (const r of idRows) identityMap[r.id] = safeString(r.name);
    }
    const deptMap = {};
    if (deptIdSet.size) {
      const [dRows] = await pool.query('SELECT id, name FROM departments WHERE id IN (?) AND org_id = ?', [[...deptIdSet], orgId]);
      for (const r of dRows) deptMap[r.id] = safeString(r.name);
    }
    const wgMap = {};
    if (wgIdSet.size) {
      const [wRows] = await pool.query('SELECT id, name FROM work_groups WHERE id IN (?) AND org_id = ?', [[...wgIdSet], orgId]);
      for (const r of wRows) wgMap[r.id] = safeString(r.name);
    }
    const hrMap = {};
    if (hrIdSet.size) {
      const hrRows = await hrInfoModel.getByIds([...hrIdSet]);
      for (const hr of hrRows) hrMap[hr.id] = safeString(hr.name);
    }

    // Build step preview
    const previewSteps = templateSteps.sort((a, b) => a.sort_order - b.sort_order).map(function(ts, idx) {
      const conds = stepConditionMap[ts.id] || [];
      const actionMap = { pass: '仅通过', sign: '签字', estamp: '盖章', both: '签字+盖章' };
      const actionLabel = actionMap[ts.action_type] || ts.action_type || '签字';

      // Build condition display using shared helper
      const condJson = conds.length ? JSON.stringify(conds) : null;
      const display = buildStepConditionsDisplay(condJson, { hrMap, identityMap, deptMap, wgMap });

      return {
        stepIndex: Number(ts.sort_order) || idx + 1,
        sortOrder: Number(ts.sort_order) || idx + 1,
        name: ts.name || '',
        actionType: ts.action_type || 'sign',
        actionLabel: actionLabel,
        allowApproverDesignation: Number(ts.allow_approver_designation) === 1,
        displayParts: display.displayParts,
        approverDesc: display.approverDesc || '由全体成员审批',
        // Pass raw conditions for client-side person override logic
        conditions: conds
      };
    });

    res.json({ status: 'success', steps: previewSteps });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listMyStamps — Get stamps available for the current user's identity
router.post('/listMyStamps', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const orgId = await getCurrentOrgId();
    const [hrRows] = await pool.query(
      'SELECT identity_id FROM hr_info WHERE id = ? AND org_id = ?',
      [hrId, orgId]
    );
    const identityId = hrRows[0] ? hrRows[0].identity_id : null;
    if (!identityId) return res.json({ status: 'success', stamps: [] });

    const assignments = await stampAssignmentModel.getByIdentityId(identityId);
    if (!assignments.length) return res.json({ status: 'success', stamps: [] });

    const stampIds = assignments.map(a => a.stamp_id);
    const [stampRows] = await pool.query(
      'SELECT id, name, image_data FROM stamps WHERE id IN (?) AND org_id = ?',
      [stampIds, orgId]
    );
    const stamps = stampRows.map(s => ({
      id: safeString(s.id),
      name: safeString(s.name),
      imageData: s.image_data || ''
    }));

    res.json({ status: 'success', stamps });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Read Status Tracking
// ═══════════════════════════════════════════════════

// getUnreadCounts — returns unread counts for my submissions + pending count
// Each section is independently fault-tolerant: one failure won't zero out the others
router.post('/getUnreadCounts', async (req, res) => {
  const actorResult = await resolveCurrentActor(req);
  if (!actorResult.ok || actorResult.actor.type !== 'user') {
    return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
  }
  const hrId = actorResult.actor.id;

  let pendingCount = 0;
  let mySubmissionsUnread = 0;
  let myApprovalHistoryUnread = 0;
  const orgId = await getCurrentOrgId();

  // ── Pending count (items needing my action) ──
  try {
    const pendingSteps = await submissionStepModel.getPendingByApprover(hrId, actorResult.actor.profile);
    pendingCount = pendingSteps.length;
  } catch (e) {
    console.error('[getUnreadCounts] pendingCount failed:', e.message);
  }

  // ── My submissions unread count ──
  try {
    const mySubs = await submissionModel.getAll({ submittedBy: hrId, limit: 200 });
    const mySubmissionIds = mySubs.map(s => s.id);

    if (mySubmissionIds.length) {
      const [cursors] = await pool.query(
        'SELECT submission_id, last_read_status, last_read_step_index FROM audit_read_cursors WHERE org_id = ? AND hr_id = ? AND submission_id IN (?)',
        [orgId, hrId, mySubmissionIds]
      );
      const cursorMap = {};
      cursors.forEach(c => { cursorMap[c.submission_id] = c; });

      for (const s of mySubs) {
        const c = cursorMap[s.id];
        if (!c || c.last_read_status !== s.status || c.last_read_step_index !== s.current_step_index) {
          mySubmissionsUnread++;
        }
      }
    }
  } catch (e) {
    console.error('[getUnreadCounts] mySubmissionsUnread failed:', e.message);
  }

  // myApprovalHistoryUnread is always 0 — approval history no longer uses read/unread
  // (only mySubmissions retains read/unread functionality)

  res.json({ status: 'success', mySubmissionsUnread, myApprovalHistoryUnread, pendingCount });
});

// markSubmissionRead — mark a single submission as read (upsert cursor)
router.post('/markSubmissionRead', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const submissionId = safeString(req.body.submissionId);
    if (!submissionId) return res.json({ status: 'invalid_params', message: '请重新打开申请' });

    // Get current submission state
    const sub = await submissionModel.getById(submissionId);
    if (!sub) return res.json({ status: 'not_found', message: '请刷新申请记录' });
    const orgId = await getCurrentOrgId();

    await pool.query(
      `INSERT INTO audit_read_cursors (hr_id, submission_id, org_id, last_read_status, last_read_step_index, read_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_status = VALUES(last_read_status), last_read_step_index = VALUES(last_read_step_index), read_at = NOW()`,
      [hrId, submissionId, orgId, sub.status, sub.current_step_index]
    );

    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// markAllSubmissionsRead — batch mark all user's submissions as read
router.post('/markAllSubmissionsRead', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    // Only mark "my submissions" as read — approval history no longer uses read/unread
    const mySubs = await submissionModel.getAll({ submittedBy: hrId, limit: 500 });
    const orgId = await getCurrentOrgId();
    for (const s of mySubs) {
      await pool.query(
        `INSERT INTO audit_read_cursors (hr_id, submission_id, org_id, last_read_status, last_read_step_index, read_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_read_status = VALUES(last_read_status), last_read_step_index = VALUES(last_read_step_index), read_at = NOW()`,
        [hrId, s.id, orgId, s.status, s.current_step_index]
      );
    }

    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listMyApprovalHistory — submissions where the current user has approved/rejected a step
// QUERY SOURCE: audit_events table (records actual operator, not template-defined approver_hr_id).
// This correctly captures identity-matched approvers and multi-select approvers that the old
// st.approver_hr_id = ? query missed.
router.post('/listMyApprovalHistory', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const limit = Math.min(100, Math.max(1, parseInt(req.body.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.body.offset, 10) || 0);
    const orgId = await getCurrentOrgId();

    // Get submissions where user has approve/reject events
    const [rows] = await pool.query(
      `SELECT s.*, MAX(e.created_at) AS my_last_action_at
       FROM audit_submissions s
       JOIN audit_events e ON s.id = e.submission_id
       WHERE e.operator_hr_id = ?
         AND s.org_id = ?
         AND e.org_id = ?
         AND e.event_type IN ('approve', 'reject')
       GROUP BY s.id
       ORDER BY my_last_action_at DESC
       LIMIT ? OFFSET ?`,
      [hrId, orgId, orgId, limit, offset]
    );

    // Get the steps I handled for each submission (from audit_events)
    const submissionIds = rows.map(r => r.id);
    let myStepsMap = {};
    if (submissionIds.length) {
      const [mySteps] = await pool.query(
        `SELECT e.submission_id, e.step_index AS sort_order,
           e.event_type, e.created_at AS processed_at, e.comment
         FROM audit_events e
         WHERE e.submission_id IN (?)
           AND e.operator_hr_id = ?
           AND e.org_id = ?
           AND e.event_type IN ('approve', 'reject')
         ORDER BY e.created_at DESC`,
        [submissionIds, hrId, orgId]
      );
      mySteps.forEach((st, stIdx) => {
        if (!myStepsMap[st.submission_id]) myStepsMap[st.submission_id] = [];
        myStepsMap[st.submission_id].push({
          _key: stIdx,
          sortOrder: st.sort_order,
          status: st.event_type === 'approve' ? 'approved' : 'rejected',
          processedAt: st.processed_at,
          comment: safeString(st.comment || '')
        });
      });
    }

    // Load submitter names
    const submitterIds = [...new Set(rows.map(r => r.submitted_by))];
    const hrMap = {};
    if (submitterIds.length) {
      const hrRows = await hrInfoModel.getByIds(submitterIds);
      hrRows.forEach(hr => { hrMap[hr.id] = safeString(hr.name); });
    }

    // Note: isUnread intentionally omitted — approval history no longer uses read/unread
    const result = rows.map(s => {
      return {
        id: safeString(s.id),
        submissionNumber: safeString(s.submission_number),
        title: safeString(s.title),
        description: safeString(s.description),
        type: safeString(s.type),
        status: safeString(s.status),
        currentStepIndex: s.current_step_index,
        submittedBy: safeString(s.submitted_by),
        submitterName: hrMap[s.submitted_by] || '未知',
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        mySteps: myStepsMap[s.id] || [],
        myLastActionAt: s.my_last_action_at
      };
    });

    res.json({ status: 'success', items: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listEligibleApprovers — Return eligible approvers matching a step's conditions
// Used by both Create mode (template step preview) and View mode (designate next approver)
router.post('/listEligibleApprovers', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
    }
    const hrId = actorResult.actor.id;

    const orgId = await getCurrentOrgId();
    const submissionId = safeString(req.body.submissionId);
    const templateId = safeString(req.body.templateId);
    const stepIndex = parseInt(req.body.stepIndex) || 0;

    let conditions = [];
    let submitterInfo = null;

    if (submissionId) {
      // View mode: resolve next step's conditions from the submission
      const submission = await submissionModel.getById(submissionId);
      if (!submission) return res.json({ status: 'not_found', message: '请刷新申请记录' });

      const allSteps = await submissionStepModel.getBySubmissionId(submissionId);
      const currentIdx = submission.current_step_index || 0;
      const currentRound = Math.max(...allSteps.map(function(s) { return s.round || 1; }));
      const currentRoundSteps = allSteps
        .filter(function(s) { return (s.round || 1) === currentRound; })
        .sort(function(a, b) { return a.sort_order - b.sort_order; });
      const currentStep = currentRoundSteps.find(function(s) { return s.sort_order === currentIdx; });
      const nextStep = currentRoundSteps.find(function(s) { return s.sort_order === currentIdx + 1; });

      if (!currentStep || !(await checkStepAuthorization(currentStep, submission, hrId, actorResult.actor.profile))) {
        return res.json({ status: 'forbidden', message: '您不是当前步骤的审批人' });
      }
      if (!nextStep) {
        return res.json({ status: 'success', approvers: [], message: '已是最后一步，无需指定下一步审批人' });
      }
      if (Number(nextStep.allow_approver_designation) !== 1) {
        return res.json({ status: 'forbidden', message: '下一步按审批条件确定审批人' });
      }

      // Parse next step's conditions
      if (nextStep.step_conditions_json) {
        try { conditions = JSON.parse(nextStep.step_conditions_json); } catch (_) {}
        if (!Array.isArray(conditions)) conditions = [];
      }

      // Fallback: template step conditions
      if (!conditions.length && nextStep.template_step_id) {
        const tplConds = await submissionStepModel.getTemplateStepConditions(nextStep.template_step_id);
        if (tplConds) conditions = tplConds;
      }

      // Load submitter for 'own' scope resolution
      const [subRows] = await pool.query(
        'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
        [submission.submitted_by, orgId]
      );
      submitterInfo = subRows[0] || null;
    } else if (templateId && stepIndex > 0) {
      // Create mode: resolve template step conditions
      if (stepIndex !== 1) {
        return res.json({ status: 'forbidden', message: '后续步骤由上一环节选择审批人' });
      }
      const template = await flowTemplateModel.getById(templateId);
      if (!template || !template.is_active) {
        return res.json({ status: 'not_found', message: '请刷新审核类型后重试' });
      }
      const templateSteps = await flowTemplateStepModel.getByTemplateId(templateId);
      const targetStep = templateSteps.find(function(s) { return Number(s.sort_order) === stepIndex; });
      if (!targetStep) {
        return res.json({ status: 'not_found', message: '请刷新审批详情' });
      }
      if (Number(targetStep.allow_approver_designation) !== 1) {
        return res.json({ status: 'forbidden', message: '第一步按审批条件确定审批人' });
      }

      const tplConds = await submissionStepModel.getTemplateStepConditions(targetStep.id);
      if (tplConds) conditions = tplConds;

      // For Create mode, use the current user as submitter (for 'own' scope)
      const [subRows] = await pool.query(
        'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
        [hrId, orgId]
      );
      submitterInfo = subRows[0] || null;
      let starterConditions = [];
      if (template.starter_conditions_json) {
        try { starterConditions = JSON.parse(template.starter_conditions_json); } catch (_) { starterConditions = []; }
      }
      if (starterConditions.length && (!submitterInfo || !matchesAnyCondition(starterConditions, submitterInfo, submitterInfo))) {
        return res.json({ status: 'forbidden', message: '请使用可发起该申请的身份' });
      }
      if (!starterConditions.length && template.starter_type === 'identity' && template.starter_identity_id) {
        const identityIds = String(template.starter_identity_id).split(',').map(function(id) { return id.trim(); }).filter(Boolean);
        if (!submitterInfo || !identityIds.includes(String(submitterInfo.identity_id))) {
          return res.json({ status: 'forbidden', message: '请使用可发起该申请的身份' });
        }
      }
      if (!starterConditions.length && template.starter_type === 'specific_person' && template.starter_hr_id) {
        const personIds = String(template.starter_hr_id).split(',').map(function(id) { return id.trim(); }).filter(Boolean);
        if (!personIds.includes(String(hrId))) {
          return res.json({ status: 'forbidden', message: '请使用可发起该申请的身份' });
        }
      }
    } else {
      return res.json({ status: 'invalid_params', message: '缺少必要信息' });
    }

    // If no conditions or all conditions are "all" scope, return all HR
    if (!conditions.length) {
      const [allHr] = await pool.query(
        `SELECT h.id, h.name, h.student_id AS studentId,
                h.department_id AS departmentId, d.name AS department,
                h.identity_id AS identityId, i.name AS identity,
                h.work_group_id AS workGroupId, wg.name AS workGroup
         FROM hr_info h
         LEFT JOIN departments d ON h.department_id = d.id
         LEFT JOIN identities i ON h.identity_id = i.id
         LEFT JOIN work_groups wg ON h.work_group_id = wg.id
         WHERE h.org_id = ? ORDER BY h.name`,
        [orgId]
      );
      return res.json({ status: 'success', approvers: allHr });
    }

    // Check if all conditions are effectively "all" (identity_scope with all scopes = 'all')
    const allAreOpen = conditions.every(function(c) {
      if (c.conditionType === 'person') return false;
      return (c.departmentScope || 'all') === 'all' &&
             (c.workGroupScope || 'all') === 'all' &&
             (c.identityScope || 'all') === 'all';
    });
    if (allAreOpen) {
      const [allHr] = await pool.query(
        `SELECT h.id, h.name, h.student_id AS studentId,
                h.department_id AS departmentId, d.name AS department,
                h.identity_id AS identityId, i.name AS identity,
                h.work_group_id AS workGroupId, wg.name AS workGroup
         FROM hr_info h
         LEFT JOIN departments d ON h.department_id = d.id
         LEFT JOIN identities i ON h.identity_id = i.id
         LEFT JOIN work_groups wg ON h.work_group_id = wg.id
         WHERE h.org_id = ? ORDER BY h.name`,
        [orgId]
      );
      return res.json({ status: 'success', approvers: allHr });
    }

    // Load all HR records and filter in JS with matchesAnyCondition
    const [allHr] = await pool.query(
      `SELECT h.id, h.name, h.student_id AS studentId,
              h.department_id AS departmentId, d.name AS department,
              h.identity_id AS identityId, i.name AS identity,
              h.work_group_id AS workGroupId, wg.name AS workGroup
       FROM hr_info h
       LEFT JOIN departments d ON h.department_id = d.id
       LEFT JOIN identities i ON h.identity_id = i.id
       LEFT JOIN work_groups wg ON h.work_group_id = wg.id
       WHERE h.org_id = ? ORDER BY h.name`,
      [orgId]
    );

    const eligible = allHr.filter(function(hr) {
      const approver = {
        id: hr.id,
        department_id: hr.departmentId || '',
        identity_id: hr.identityId || '',
        work_group_id: hr.workGroupId || ''
      };
      return matchesAnyCondition(conditions, approver, submitterInfo);
    });

    res.json({ status: 'success', approvers: eligible });
  } catch (e) {
    console.error('[audit:listEligibleApprovers] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
