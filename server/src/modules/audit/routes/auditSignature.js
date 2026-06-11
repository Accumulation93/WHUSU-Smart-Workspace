const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const userInfoModel = require('../../../core/models/userInfo');
const hrInfoModel = require('../../../core/models/hrInfo');
const signatureTemplateModel = require('../models/signatureTemplate');
const submissionModel = require('../models/auditSubmission');
const submissionSignatureModel = require('../models/auditSubmissionSignature');
const verificationPermModel = require('../models/verificationPermission');
const adminInfoModel = require('../../../core/models/adminInfo');
const { verifySignatureChain } = require('../utils/hashChain');

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

// ═══════════════════════════════════════════════════
// Signature Template Management
// ═══════════════════════════════════════════════════

// listMySignatures
router.post('/listMySignatures', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const signatures = await signatureTemplateModel.getByHrId(hrId);
    const result = signatures.map((s) => ({
      id: safeString(s.id),
      name: safeString(s.name),
      imageData: s.image_data || '',
      isDefault: s.is_default === 1,
      createdAt: s.created_at
    }));

    res.json({ status: 'success', signatures: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveSignature
router.post('/saveSignature', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const imageData = safeString(req.body.imageData);
    const isDefault = req.body.isDefault === true;

    if (!imageData) {
      return res.json({ status: 'invalid_params', message: '请提供签名图片' });
    }

    if (isDefault) {
      await signatureTemplateModel.clearDefaults(hrId);
    }

    if (id) {
      await signatureTemplateModel.update(id, { name, imageData, isDefault });
      res.json({ status: 'success', message: '签名已更新' });
    } else {
      const newId = generateId();
      await signatureTemplateModel.create(newId, { hrId, name: name || '我的签名', imageData, isDefault });
      res.json({ status: 'success', id: newId, message: '签名已保存' });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteSignature
router.post('/deleteSignature', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供签名ID' });

    await signatureTemplateModel.remove(id);
    res.json({ status: 'success', message: '签名已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// setDefaultSignature
router.post('/setDefaultSignature', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供签名ID' });

    await signatureTemplateModel.clearDefaults(hrId);
    await signatureTemplateModel.update(id, { isDefault: true });
    res.json({ status: 'success', message: '已设为默认签名' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Chain Verification
// ═══════════════════════════════════════════════════

// verifySignatureChain — Verify hash chain of a submission
router.post('/verifySignatureChain', async (req, res) => {
  try {
    const openid = req.openid;
    const submissionNumber = safeString(req.body.submissionNumber);
    const submissionId = safeString(req.body.submissionId);

    // Check permissions: must be admin or have verification permission
    const admin = await adminInfoModel.getByOpenid(openid);
    const hrId = await resolveHrId(openid);
    let hasPermission = !!admin;

    if (!hasPermission && hrId) {
      hasPermission = await verificationPermModel.checkPermission(hrId);
    }

    if (!hasPermission) {
      return res.json({ status: 'forbidden', message: '没有验签权限' });
    }

    // Find submission
    let submission;
    if (submissionId) {
      submission = await submissionModel.getById(submissionId);
    } else if (submissionNumber) {
      submission = await submissionModel.getByNumber(submissionNumber);
    }

    if (!submission) {
      return res.json({ status: 'not_found', message: '提交不存在' });
    }

    // Get signatures and files
    const signatures = await submissionSignatureModel.getChainForVerification(submission.id);
    const files = await require('../models/auditSubmissionFile').getBySubmissionId(submission.id);

    // Build current file hash map (re-read files from disk)
    const fs = require('fs');
    const currentFileHashes = {};
    for (const f of files) {
      if (f.file_path && fs.existsSync(f.file_path)) {
        const buffer = fs.readFileSync(f.file_path);
        currentFileHashes[f.id] = require('../utils/hashChain').hashFile(buffer);
      }
    }

    const result = verifySignatureChain(signatures, currentFileHashes);

    res.json({
      status: 'success',
      submissionId: safeString(submission.id),
      submissionNumber: safeString(submission.submission_number),
      ...result
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
