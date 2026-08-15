const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/routes/auditAdmin');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const adminInfoModel = require('../../../core/models/adminInfo');
const hrInfoModel = require('../../../core/models/hrInfo');
const flowTemplateModel = require('../models/auditFlowTemplate');
const flowTemplateStepModel = require('../models/auditFlowTemplateStep');
const flowTemplateStepConditionModel = require('../models/auditFlowTemplateStepCondition');
const stampModel = require('../models/stamp');
const stampAssignmentModel = require('../models/identityStampAssignment');
const submissionModel = require('../models/auditSubmission');
const submissionStepModel = require('../models/auditSubmissionStep');
const submissionFileModel = require('../models/auditSubmissionFile');
const submissionSignatureModel = require('../models/auditSubmissionSignature');
const auditEventModel = require('../models/auditEvent');
const verificationPermModel = require('../models/verificationPermission');
const { verifySignatureChain } = require('../utils/hashChain');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// ═══════════════════════════════════════════════════
// Audit Flow Templates
// ═══════════════════════════════════════════════════

// listAuditFlowTemplates
router.post('/listAuditFlowTemplates', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const templates = await flowTemplateModel.getAll();
    // Load steps for each template
    const result = [];
    for (const t of templates) {
      const steps = await flowTemplateStepModel.getByTemplateId(t.id);
      // Parse starter conditions JSON
      let starterConditions = [];
      if (t.starter_conditions_json) {
        try {
          starterConditions = JSON.parse(t.starter_conditions_json);
        } catch (_) { starterConditions = []; }
      }
      result.push({
        id: safeString(t.id),
        name: safeString(t.name),
        description: safeString(t.description),
        starterType: safeString(t.starter_type),
        starterIdentityId: safeString(t.starter_identity_id),
        starterHrId: safeString(t.starter_hr_id),
        starterConditionsJson: t.starter_conditions_json || null,
        starterConditions: starterConditions.map(function(c) { return {
          conditionType: safeString(c.conditionType),
          personHrIds: safeString(c.personHrIds),
          departmentScope: safeString(c.departmentScope),
          specificDepartmentId: safeString(c.specificDepartmentId),
          workGroupScope: safeString(c.workGroupScope),
          specificWorkGroupId: safeString(c.specificWorkGroupId),
          identityScope: safeString(c.identityScope),
          specificIdentityId: safeString(c.specificIdentityId)
        }; }),
        resubmitMode: safeString(t.resubmit_mode),
        isActive: t.is_active === 1,
        createdBy: safeString(t.created_by),
        stepCount: steps.length,
        steps: steps.map((s) => ({
          id: safeString(s.id),
          sortOrder: s.sort_order,
          name: s.name || '',
          approverType: safeString(s.approver_type),
          approverIdentityId: safeString(s.approver_identity_id),
          approverHrId: safeString(s.approver_hr_id),
          relatedRelation: safeString(s.related_relation),
          actionType: safeString(s.action_type),
          allowApproverDesignation: s.allow_approver_designation === 1,
          conditions: (s.conditions || []).map((c) => ({
            id: safeString(c.id),
            sortOrder: c.sort_order,
            conditionType: safeString(c.condition_type),
            personHrIds: safeString(c.person_hr_ids),
            departmentScope: safeString(c.department_scope),
            specificDepartmentId: safeString(c.specific_department_id),
            workGroupScope: safeString(c.work_group_scope),
            specificWorkGroupId: safeString(c.specific_work_group_id),
            identityScope: safeString(c.identity_scope),
            specificIdentityId: safeString(c.specific_identity_id)
          }))
        })),
        createdAt: t.created_at,
        updatedAt: t.updated_at
      });
    }
    res.json({ status: 'success', templates: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveAuditFlowTemplate
router.post('/saveAuditFlowTemplate', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const orgId = await getCurrentOrgId();
    if (!orgId) return res.json({ status: 'invalid_params', message: localeCopy.copy_e0aaf03f8a });
    const description = safeString(req.body.description);
    const starterType = safeString(req.body.starterType) || 'conditions';
    const starterIdentityId = safeString(req.body.starterIdentityId);
    const starterHrId = safeString(req.body.starterHrId);
    const resubmitMode = safeString(req.body.resubmitMode) || 'fresh';
    const starterConditions = Array.isArray(req.body.starterConditions) ? req.body.starterConditions : [];
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];

    if (!name) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_cf05c2ba56 });
    }
    if (!steps.length) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_4ac0ae43dd });
    }

    // Validate each step has at least one valid condition with proper IDs
    for (let vi = 0; vi < steps.length; vi++) {
      const vstep = steps[vi];
      const vconditions = Array.isArray(vstep.conditions) ? vstep.conditions : [];
      if (!vconditions.length && !(vstep.approverType || vstep.approverIdentityId || vstep.approverHrId)) {
        return res.json({ status: 'invalid_params', message: localeCopy.copy_93c50c01c0 + (vi + 1) + '步至少需要一个审批条件' });
      }
      for (let vj = 0; vj < vconditions.length; vj++) {
        const vc = vconditions[vj];
        if (vc.conditionType === 'person') {
          if (!vc.personHrIds || !vc.personHrIds.trim()) {
            return res.json({ status: 'invalid_params', message: localeCopy.copy_eb6b0a83d2 + (vi + 1) + '步的指定人员' });
          }
        } else {
          if (vc.departmentScope === 'specific' && (!vc.specificDepartmentId || !vc.specificDepartmentId.trim())) {
            return res.json({ status: 'invalid_params', message: localeCopy.copy_93c50c01c0 + (vi + 1) + '步条件' + (vj + 1) + '：指定了部门范围但未选择具体部门' });
          }
          if (vc.workGroupScope === 'specific' && (!vc.specificWorkGroupId || !vc.specificWorkGroupId.trim())) {
            return res.json({ status: 'invalid_params', message: localeCopy.copy_93c50c01c0 + (vi + 1) + '步条件' + (vj + 1) + '：指定了职能组范围但未选择具体职能组' });
          }
          if (vc.identityScope === 'specific' && (!vc.specificIdentityId || !vc.specificIdentityId.trim())) {
            return res.json({ status: 'invalid_params', message: localeCopy.copy_93c50c01c0 + (vi + 1) + '步条件' + (vj + 1) + '：指定了身份但未选择具体身份' });
          }
        }
      }
    }

    // Build starter conditions JSON if provided
    let starterConditionsJson = null;
    if (starterConditions.length) {
      starterConditionsJson = JSON.stringify(starterConditions.map(function(c) {
        let cond = { conditionType: c.conditionType };
        if (c.conditionType === 'person') {
          cond.personHrIds = c.personHrIds || '';
        } else {
          cond.departmentScope = c.departmentScope || 'all';
          cond.specificDepartmentId = c.specificDepartmentId || null;
          cond.workGroupScope = c.workGroupScope || 'all';
          cond.specificWorkGroupId = c.specificWorkGroupId || null;
          cond.identityScope = c.identityScope || 'all';
          cond.specificIdentityId = c.specificIdentityId || null;
        }
        return cond;
      }));
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let templateId;
      if (id) {
        templateId = id;
        await flowTemplateModel.update(id, {
          name, description, starterType,
          starterIdentityId: starterIdentityId || null,
          starterHrId: starterHrId || null,
          starterConditionsJson,
          resubmitMode,
          isActive: true
        });
        // Remove old steps, re-insert
        await flowTemplateStepModel.removeByTemplateId(id);
      } else {
        templateId = generateId();
        await flowTemplateModel.create(templateId, {
          name, description, starterType,
          starterIdentityId: starterIdentityId || null,
          starterHrId: starterHrId || null,
          starterConditionsJson,
          resubmitMode,
          createdBy: admin.id
        });
      }

      // Insert steps with conditions
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = generateId();
        await flowTemplateStepModel.create(stepId, {
          templateId,
          sortOrder: i + 1,
          actionType: safeString(step.actionType) || 'sign',
          allowApproverDesignation: step.allowApproverDesignation === true,
          name: safeString(step.name) || ''
        });

        // Create conditions for this step
        const conditions = Array.isArray(step.conditions) ? step.conditions : [];
        // If no conditions provided, try legacy fields
        if (!conditions.length && (step.approverType || step.approverIdentityId || step.approverHrId)) {
          const legacyCondId = generateId();
          const legacyType = safeString(step.approverType) || 'identity';
          if (legacyType === 'specific_person' && step.approverHrId) {
            await flowTemplateStepConditionModel.create(legacyCondId, {
              templateStepId: stepId,
              sortOrder: 1,
              conditionType: 'person',
              personHrIds: safeString(step.approverHrId)
            });
          } else if (legacyType === 'identity' && step.approverIdentityId) {
            await flowTemplateStepConditionModel.create(legacyCondId, {
              templateStepId: stepId,
              sortOrder: 1,
              conditionType: 'identity_scope',
              identityScope: 'specific',
              specificIdentityId: safeString(step.approverIdentityId)
            });
          }
        } else {
          for (let j = 0; j < conditions.length; j++) {
            const cond = conditions[j];
            const condId = generateId();
            await flowTemplateStepConditionModel.create(condId, {
              templateStepId: stepId,
              sortOrder: j + 1,
              conditionType: safeString(cond.conditionType) || 'identity_scope',
              personHrIds: safeString(cond.personHrIds) || null,
              departmentScope: safeString(cond.departmentScope) || 'all',
              specificDepartmentId: safeString(cond.specificDepartmentId) || null,
              workGroupScope: safeString(cond.workGroupScope) || 'all',
              specificWorkGroupId: safeString(cond.specificWorkGroupId) || null,
              identityScope: safeString(cond.identityScope) || 'all',
              specificIdentityId: safeString(cond.specificIdentityId) || null
            });
          }
        }
      }

      await conn.commit();
      res.json({ status: 'success', id: templateId, message: id ? '模板已更新' : '模板已创建' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteAuditFlowTemplate
router.post('/deleteAuditFlowTemplate', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_319cc04882 });

    // Check if any submissions reference this template
    const orgId = await getCurrentOrgId();
    const [submissions] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM audit_submissions WHERE template_id = ? AND org_id = ?',
      [id, orgId]
    );
    if (submissions[0] && submissions[0].cnt > 0) {
      return res.json({ status: 'in_use', message: localeCopy.copy_f6152889c8 });
    }

    await flowTemplateModel.remove(id);
    res.json({ status: 'success', message: localeCopy.copy_efc8493bdc });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Stamps Management
// ═══════════════════════════════════════════════════

// listStamps
router.post('/listStamps', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const stamps = await stampModel.getAll();
    const assignments = await stampAssignmentModel.getAllGrouped();

    // Build stamp → identity list map
    const stampIdentityMap = {};
    for (const a of assignments) {
      if (!stampIdentityMap[a.stamp_id]) stampIdentityMap[a.stamp_id] = [];
      stampIdentityMap[a.stamp_id].push({
        identityId: safeString(a.identity_id),
        stampName: safeString(a.stamp_name)
      });
    }

    const result = stamps.map((s) => ({
      id: safeString(s.id),
      name: safeString(s.name),
      imageData: s.image_data || '',
      assignedIdentities: stampIdentityMap[s.id] || [],
      createdBy: safeString(s.created_by),
      createdAt: s.created_at
    }));

    res.json({ status: 'success', stamps: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveStamp
router.post('/saveStamp', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const imageData = safeString(req.body.imageData);

    if (!name) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_76f2662073 });
    }
    if (!imageData) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_9c1d248076 });
    }

    if (id) {
      await stampModel.update(id, { name, imageData });
      res.json({ status: 'success', message: localeCopy.copy_161855b67c });
    } else {
      const newId = generateId();
      await stampModel.create(newId, { name, imageData, createdBy: admin.id });
      res.json({ status: 'success', id: newId, message: localeCopy.copy_8e51c9c0df });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteStamp
router.post('/deleteStamp', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_fc971e88db });

    await stampModel.remove(id);
    res.json({ status: 'success', message: localeCopy.copy_a5d4679cf0 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveStampAssignments — Bulk set stamp assignments for an identity
router.post('/saveStampAssignments', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const identityId = safeString(req.body.identityId);
    const stampIds = Array.isArray(req.body.stampIds) ? req.body.stampIds.map((s) => safeString(s)).filter(Boolean) : [];

    if (!identityId) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_d1856227b6 });
    }

    await stampAssignmentModel.replaceForIdentity(identityId, stampIds);
    res.json({ status: 'success', message: localeCopy.copy_cb20eb18bc });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listIdentityStamps — Get stamps available for an identity
router.post('/listIdentityStamps', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    const identityId = safeString(req.body.identityId);
    if (!identityId) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_10d3269bb4 });
    }

    const assignments = await stampAssignmentModel.getByIdentityId(identityId);
    const result = assignments.map((a) => ({
      id: safeString(a.stamp_id),
      name: safeString(a.stamp_name),
      identityId: safeString(a.identity_id)
    }));

    res.json({ status: 'success', stamps: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Verification Permissions
// ═══════════════════════════════════════════════════

// listVerificationPermissions
router.post('/listVerificationPermissions', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const perms = await verificationPermModel.getAll();
    // Load HR names
    const hrIds = perms.map((p) => p.grantee_hr_id);
    const hrMap = {};
    if (hrIds.length) {
      const hrRows = await hrInfoModel.getByIds(hrIds);
      for (const hr of hrRows) {
        hrMap[hr.id] = safeString(hr.name);
      }
    }

    const result = perms.map((p) => ({
      id: safeString(p.id),
      granteeHrId: safeString(p.grantee_hr_id),
      granteeName: hrMap[p.grantee_hr_id] || '未知',
      grantedBy: safeString(p.granted_by),
      createdAt: p.created_at
    }));

    res.json({ status: 'success', permissions: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVerificationPermission
router.post('/saveVerificationPermission', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const granteeHrId = safeString(req.body.granteeHrId);
    const action = safeString(req.body.action) || 'grant'; // 'grant' or 'revoke'

    if (!granteeHrId) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_7d1a305d97 });
    }

    if (action === 'revoke') {
      await verificationPermModel.removeByGrantee(granteeHrId);
      res.json({ status: 'success', message: localeCopy.copy_c2eabcfd63 });
    } else {
      // Check if already exists
      const existing = await verificationPermModel.getByGrantee(granteeHrId);
      if (existing) {
        return res.json({ status: 'duplicate', message: localeCopy.copy_dcc2e39631 });
      }
      const newId = generateId();
      await verificationPermModel.create(newId, { granteeHrId, grantedBy: admin.id });
      res.json({ status: 'success', message: localeCopy.copy_31f5d1514b });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Admin Submission Monitoring
// ═══════════════════════════════════════════════════

// listAllAuditSubmissions — Admin view of all submissions
router.post('/listAllAuditSubmissions', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const filters = {
      status: safeString(req.body.status) || null,
      type: safeString(req.body.type) || null,
      limit: Math.min(100, Math.max(1, parseInt(req.body.limit, 10) || 50)),
      offset: Math.max(0, parseInt(req.body.offset, 10) || 0)
    };

    const submissions = await submissionModel.getAll(filters);

    // Load submitter names
    const submitterIds = [...new Set(submissions.map((s) => s.submitted_by))];
    const hrMap = {};
    if (submitterIds.length) {
      const hrRows = await hrInfoModel.getByIds(submitterIds);
      for (const hr of hrRows) {
        hrMap[hr.id] = safeString(hr.name);
      }
    }

    const result = submissions.map((s) => ({
      id: safeString(s.id),
      submissionNumber: safeString(s.submission_number),
      title: safeString(s.title),
      description: safeString(s.description),
      type: safeString(s.type),
      status: safeString(s.status),
      submittedBy: safeString(s.submitted_by),
      submitterName: hrMap[s.submitted_by] || '未知',
      currentStepIndex: s.current_step_index,
      resubmitMode: safeString(s.resubmit_mode),
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));

    res.json({ status: 'success', submissions: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

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
      const scopeParts = [];
      if (cond.departmentScope === 'own') scopeParts.push('同部门');
      else if (cond.departmentScope === 'specific' && cond.specificDepartmentId) {
        const deptIds = cond.specificDepartmentId.split(',').map(s => s.trim()).filter(Boolean);
        const deptNames = deptIds.map(id => deptMap[id] || id).filter(Boolean);
        if (deptNames.length) scopeParts.push(deptNames.join('、'));
      }
      if (cond.workGroupScope === 'own') scopeParts.push('同职能组');
      else if (cond.workGroupScope === 'specific' && cond.specificWorkGroupId) {
        const wgIds = cond.specificWorkGroupId.split(',').map(s => s.trim()).filter(Boolean);
        const wgNames = wgIds.map(id => wgMap[id] || id).filter(Boolean);
        if (wgNames.length) scopeParts.push(wgNames.join('、'));
      }
      if (cond.identityScope === 'own') scopeParts.push('同身份');
      else if (cond.identityScope === 'specific' && cond.specificIdentityId) {
        const identIds = cond.specificIdentityId.split(',').map(s => s.trim()).filter(Boolean);
        const identNames = identIds.map(id => identityMap[id] || id).filter(Boolean);
        if (identNames.length) scopeParts.push(identNames.join('、'));
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

// getAuditProgress — View flow progress for a submission
router.post('/getAuditProgress', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const orgId = await getCurrentOrgId();

    const submissionId = safeString(req.body.submissionId);
    if (!submissionId) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_fa1dcca5ac });
    }

    const submission = await submissionModel.getById(submissionId);
    if (!submission) {
      return res.json({ status: 'not_found', message: localeCopy.copy_780fb113f1 });
    }

    const steps = await submissionStepModel.getBySubmissionId(submissionId);
    const files = await submissionFileModel.getBySubmissionId(submissionId);
    const signatures = await submissionSignatureModel.getBySubmissionId(submissionId);
    const events = await auditEventModel.getBySubmissionId(submissionId);

    // Load HR names
    const allHrIds = new Set();
    allHrIds.add(submission.submitted_by);
    steps.forEach((s) => { if (s.approver_hr_id) allHrIds.add(s.approver_hr_id); });
    signatures.forEach((s) => allHrIds.add(s.signer_hr_id));
    events.forEach((e) => { if (e.operator_hr_id) allHrIds.add(e.operator_hr_id); });
    const hrMap = {};
    if (allHrIds.size) {
      const hrRows = await hrInfoModel.getByIds([...allHrIds]);
      for (const hr of hrRows) hrMap[hr.id] = safeString(hr.name);
    }

    // Load identity names
    const identityIds = new Set(steps.map(s => s.approver_identity_id).filter(Boolean));
    const deptIdSet = new Set(steps.map(s => s.scope_department_id).filter(Boolean));
    const wgIdSet = new Set(steps.map(s => s.scope_work_group_id).filter(Boolean));
    const hrIdSet = new Set();
    for (const s of steps) {
      if (s.step_conditions_json) {
        try {
          const conds = JSON.parse(s.step_conditions_json);
          if (Array.isArray(conds)) {
            for (const c of conds) {
              if (c.conditionType === 'person' && c.personHrIds) {
                c.personHrIds.split(',').forEach(function(id) { hrIdSet.add(id.trim()); });
              } else {
                // identity_scope or unknown type — treat as identity_scope
                if (c.specificIdentityId) c.specificIdentityId.split(',').forEach(function(id) { identityIds.add(id.trim()); });
                if (c.specificDepartmentId) c.specificDepartmentId.split(',').forEach(function(id) { deptIdSet.add(id.trim()); });
                if (c.specificWorkGroupId) c.specificWorkGroupId.split(',').forEach(function(id) { wgIdSet.add(id.trim()); });
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
      submission: {
        id: safeString(submission.id),
        submissionNumber: safeString(submission.submission_number),
        title: safeString(submission.title),
        description: safeString(submission.description),
        type: safeString(submission.type),
        status: safeString(submission.status),
        submittedBy: safeString(submission.submitted_by),
        submitterName: hrMap[submission.submitted_by] || '未知',
        currentStepIndex: submission.current_step_index,
        resubmitMode: safeString(submission.resubmit_mode),
        createdAt: submission.created_at,
        updatedAt: submission.updated_at
      },
      events: events.map((e) => ({
        id: safeString(e.id),
        eventType: safeString(e.event_type),
        stepIndex: e.step_index,
        round: e.round || 1,
        operatorHrId: safeString(e.operator_hr_id),
        operatorName: hrMap[e.operator_hr_id] || e.operator_name || '',
        comment: safeString(e.comment),
        createdAt: e.created_at
      })),
      steps: steps.map((s) => {
        const condDisplay = buildStepConditionsDisplay(
          s.step_conditions_json,
          { hrMap, identityMap, deptMap, wgMap }
        );
        let legacyApproverDesc = '';
        const identName = identityMap[s.approver_identity_id] || '';
        const scopeType = (s.scope_type || '').trim();
        if (s.approver_type === 'specific_person') {
          legacyApproverDesc = '由 ' + (hrMap[s.approver_hr_id] || '未指定') + ' 审批';
        } else if (identName) {
          if (!scopeType || scopeType === 'all') {
            legacyApproverDesc = '由 全体 ' + identName + ' 审批';
          } else if (scopeType === 'same_department') {
            legacyApproverDesc = '由 同部门 ' + identName + ' 审批';
          } else if (scopeType === 'same_work_group') {
            legacyApproverDesc = '由 同职能组 ' + identName + ' 审批';
          } else if (scopeType === 'specific_department') {
            const dn = deptMap[s.scope_department_id] || s.scope_department_id || '指定部门';
            legacyApproverDesc = '由 ' + dn + ' ' + identName + ' 审批';
          } else if (scopeType === 'specific_work_group') {
            const dn = deptMap[s.scope_department_id] || '';
            const wn = wgMap[s.scope_work_group_id] || '';
            const loc = [dn, wn].filter(Boolean).join('·') || '指定职能组';
            legacyApproverDesc = '由 ' + loc + ' ' + identName + ' 审批';
          } else {
            legacyApproverDesc = '由 ' + identName + ' 审批';
          }
        }
        return {
          id: safeString(s.id),
          sortOrder: s.sort_order,
          approverType: safeString(s.approver_type),
          approverHrId: safeString(s.approver_hr_id),
          approverName: hrMap[s.approver_hr_id] || '未指定',
          approverIdentityId: safeString(s.approver_identity_id),
          approverIdentityName: identityMap[s.approver_identity_id] || '',
          scopeType: safeString(s.scope_type),
          scopeDepartmentId: safeString(s.scope_department_id),
          scopeDepartmentName: deptMap[s.scope_department_id] || '',
          scopeWorkGroupId: safeString(s.scope_work_group_id),
          scopeWorkGroupName: wgMap[s.scope_work_group_id] || '',
          actionType: safeString(s.action_type),
          allowApproverDesignation: s.allow_approver_designation === 1,
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
      }))
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// verifyAuditFile — Admin finds submissions containing a file by hash or base64 content
router.post('/verifyAuditFile', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const fileHash = safeString(req.body.fileHash);
    const fileBase64 = safeString(req.body.fileBase64);

    let targetHash = fileHash;
    if (!targetHash && fileBase64) {
      const crypto = require('crypto');
      const buffer = Buffer.from(fileBase64, 'base64');
      targetHash = crypto.createHash('sha256').update(buffer).digest('hex');
    }

    if (!targetHash) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_03d69a9d28 });
    }

    const orgId = await getCurrentOrgId();
    const [fileRows] = await pool.query(
      `SELECT asf.*, asub.submission_number, asub.title, asub.status
       FROM audit_submission_files asf
       JOIN audit_submissions asub ON asub.id = asf.submission_id
       WHERE asf.file_hash = ? AND asf.org_id = ?
       ORDER BY asub.created_at DESC`,
      [targetHash, orgId]
    );

    const submissions = fileRows.map((f) => ({
      submissionId: safeString(f.submission_id),
      submissionNumber: safeString(f.submission_number),
      title: safeString(f.title),
      status: safeString(f.status),
      fileId: safeString(f.id),
      fileName: safeString(f.file_name),
      fileSize: f.file_size
    }));

    res.json({
      status: 'success',
      fileHash: targetHash,
      matchCount: submissions.length,
      submissions
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
