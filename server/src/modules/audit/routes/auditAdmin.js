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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const templates = await flowTemplateModel.getAll();
    // Load steps for each template
    const result = [];
    for (const t of templates) {
      const steps = await flowTemplateStepModel.getByTemplateId(t.id);
      result.push({
        id: safeString(t.id),
        name: safeString(t.name),
        description: safeString(t.description),
        starterType: safeString(t.starter_type),
        starterIdentityId: safeString(t.starter_identity_id),
        starterHrId: safeString(t.starter_hr_id),
        resubmitMode: safeString(t.resubmit_mode),
        isActive: t.is_active === 1,
        createdBy: safeString(t.created_by),
        stepCount: steps.length,
        steps: steps.map((s) => ({
          id: safeString(s.id),
          sortOrder: s.sort_order,
          approverType: safeString(s.approver_type),
          approverIdentityId: safeString(s.approver_identity_id),
          approverHrId: safeString(s.approver_hr_id),
          relatedRelation: safeString(s.related_relation),
          actionType: safeString(s.action_type),
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);
    const starterType = safeString(req.body.starterType) || 'self';
    const starterIdentityId = safeString(req.body.starterIdentityId);
    const starterHrId = safeString(req.body.starterHrId);
    const resubmitMode = safeString(req.body.resubmitMode) || 'fresh';
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];

    if (!name) {
      return res.json({ status: 'invalid_params', message: '请输入模板名称' });
    }
    if (!steps.length) {
      return res.json({ status: 'invalid_params', message: '请至少添加一个审核步骤' });
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
          actionType: safeString(step.actionType) || 'sign'
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
      res.json({ status: 'success', id: templateId, message: id ? '模板更新成功' : '模板创建成功' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供模板ID' });

    // Check if any submissions reference this template
    const orgId = await getCurrentOrgId();
    const [submissions] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM audit_submissions WHERE template_id = ? AND org_id = ?',
      [id, orgId]
    );
    if (submissions[0] && submissions[0].cnt > 0) {
      return res.json({ status: 'in_use', message: '该模板已有审核提交记录，不能删除' });
    }

    await flowTemplateModel.remove(id);
    res.json({ status: 'success', message: '模板已删除' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const imageData = safeString(req.body.imageData);

    if (!name) {
      return res.json({ status: 'invalid_params', message: '请输入印章名称' });
    }
    if (!imageData) {
      return res.json({ status: 'invalid_params', message: '请上传印章图片' });
    }

    if (id) {
      await stampModel.update(id, { name, imageData });
      res.json({ status: 'success', message: '印章更新成功' });
    } else {
      const newId = generateId();
      await stampModel.create(newId, { name, imageData, createdBy: admin.id });
      res.json({ status: 'success', id: newId, message: '印章创建成功' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供印章ID' });

    await stampModel.remove(id);
    res.json({ status: 'success', message: '印章已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveStampAssignments — Bulk set stamp assignments for an identity
router.post('/saveStampAssignments', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const identityId = safeString(req.body.identityId);
    const stampIds = Array.isArray(req.body.stampIds) ? req.body.stampIds.map((s) => safeString(s)).filter(Boolean) : [];

    if (!identityId) {
      return res.json({ status: 'invalid_params', message: '请选择身份' });
    }

    await stampAssignmentModel.replaceForIdentity(identityId, stampIds);
    res.json({ status: 'success', message: '印章分配已更新' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listIdentityStamps — Get stamps available for an identity
router.post('/listIdentityStamps', async (req, res) => {
  try {
    const identityId = safeString(req.body.identityId);
    if (!identityId) {
      return res.json({ status: 'invalid_params', message: '请提供身份ID' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const granteeHrId = safeString(req.body.granteeHrId);
    const action = safeString(req.body.action) || 'grant'; // 'grant' or 'revoke'

    if (!granteeHrId) {
      return res.json({ status: 'invalid_params', message: '请选择授权人员' });
    }

    if (action === 'revoke') {
      await verificationPermModel.removeByGrantee(granteeHrId);
      res.json({ status: 'success', message: '验签权限已撤销' });
    } else {
      // Check if already exists
      const existing = await verificationPermModel.getByGrantee(granteeHrId);
      if (existing) {
        return res.json({ status: 'duplicate', message: '该人员已有验签权限' });
      }
      const newId = generateId();
      await verificationPermModel.create(newId, { granteeHrId, grantedBy: admin.id });
      res.json({ status: 'success', message: '验签权限已授予' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const filters = {
      status: safeString(req.body.status) || null,
      type: safeString(req.body.type) || null,
      limit: parseInt(req.body.limit) || 50,
      offset: parseInt(req.body.offset) || 0
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

// getAuditProgress — View flow progress for a submission
router.post('/getAuditProgress', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const submissionId = safeString(req.body.submissionId);
    if (!submissionId) {
      return res.json({ status: 'invalid_params', message: '请提供提交ID' });
    }

    const submission = await submissionModel.getById(submissionId);
    if (!submission) {
      return res.json({ status: 'not_found', message: '提交不存在' });
    }

    const steps = await submissionStepModel.getBySubmissionId(submissionId);
    const files = await submissionFileModel.getBySubmissionId(submissionId);
    const signatures = await submissionSignatureModel.getBySubmissionId(submissionId);

    // Load HR names
    const allHrIds = new Set();
    allHrIds.add(submission.submitted_by);
    steps.forEach((s) => { if (s.approver_hr_id) allHrIds.add(s.approver_hr_id); });
    signatures.forEach((s) => allHrIds.add(s.signer_hr_id));
    const hrMap = {};
    if (allHrIds.size) {
      const hrRows = await hrInfoModel.getByIds([...allHrIds]);
      for (const hr of hrRows) hrMap[hr.id] = safeString(hr.name);
    }

    res.json({
      status: 'success',
      submission: {
        id: safeString(submission.id),
        submissionNumber: safeString(submission.submission_number),
        title: safeString(submission.title),
        type: safeString(submission.type),
        status: safeString(submission.status),
        submittedBy: safeString(submission.submitted_by),
        submitterName: hrMap[submission.submitted_by] || '未知',
        currentStepIndex: submission.current_step_index,
        resubmitMode: safeString(submission.resubmit_mode),
        createdAt: submission.created_at,
        updatedAt: submission.updated_at
      },
      steps: steps.map((s) => ({
        id: safeString(s.id),
        sortOrder: s.sort_order,
        approverType: safeString(s.approver_type),
        approverHrId: safeString(s.approver_hr_id),
        approverName: hrMap[s.approver_hr_id] || '未指定',
        approverIdentityId: safeString(s.approver_identity_id),
        actionType: safeString(s.action_type),
        status: safeString(s.status),
        comment: safeString(s.comment),
        rejectionReason: safeString(s.rejection_reason),
        round: s.round,
        processedAt: s.processed_at,
        stepConditionsJson: s.step_conditions_json || null
      })),
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const fileHash = safeString(req.body.fileHash);
    const fileBase64 = safeString(req.body.fileBase64);

    let targetHash = fileHash;
    if (!targetHash && fileBase64) {
      const crypto = require('crypto');
      const buffer = Buffer.from(fileBase64, 'base64');
      targetHash = crypto.createHash('sha256').update(buffer).digest('hex');
    }

    if (!targetHash) {
      return res.json({ status: 'invalid_params', message: '请提供文件或文件哈希' });
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
