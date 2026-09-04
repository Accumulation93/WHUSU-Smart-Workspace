const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/routes/auditSignature');
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const signatureTemplateModel = require('../models/signatureTemplate');
const submissionModel = require('../models/auditSubmission');
const submissionFileModel = require('../models/auditSubmissionFile');
const submissionSignatureModel = require('../models/auditSubmissionSignature');
const verificationMatchModel = require('../models/auditVerificationMatch');
const verificationPermModel = require('../models/verificationPermission');
const unifiedIdentityModel = require('../../../core/models/unifiedIdentity');
const { resolveCurrentActor } = require('../../../core/services/currentActor');
const {
  resolveActorAssignment,
  resolveActorAssignmentForUpdate
} = require('../services/auditAssignmentContext');
const { hashFile, verifySignatureChain } = require('../utils/hashChain');
const { verifyPdfSignature } = require('../utils/pdfSignature');
const { MAX_FILE_SIZE, readStoredAuditFile } = require('../utils/fileSecurity');
const { inspectAuditImageData } = require('../utils/auditImageData');

const MAX_SIGNATURE_NAME_CHARS = 100;

function validateSignatureTemplateInput(name, imageData) {
  if (Array.from(name).length > MAX_SIGNATURE_NAME_CHARS) {
    return { status: 'invalid_params', message: localeCopy.signatureNameTooLong };
  }
  const inspected = inspectAuditImageData(imageData);
  if (!inspected.ok) {
    return {
      status: 'invalid_params',
      message: inspected.reason === 'too_large'
        ? localeCopy.signatureImageTooLarge
        : localeCopy.signatureImageInvalid
    };
  }
  return null;
}

function decodeVerificationFile(fileBase64) {
  const encoded = safeString(fileBase64).replace(/[\r\n]/g, '');
  const encodedLimit = Math.ceil(MAX_FILE_SIZE * 4 / 3) + 8;
  if (!encoded || encoded.length > encodedLimit || encoded.length % 4 === 1
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  const buffer = Buffer.from(encoded, 'base64');
  return buffer.length && buffer.length <= MAX_FILE_SIZE ? buffer : null;
}

async function resolveVerificationAccess(req) {
  const actorResult = await resolveCurrentActor(req);
  if (!actorResult.ok) return { canVerify: false, actorResult };
  if (actorResult.actor.type === 'admin') {
    return { canVerify: true, selectedRole: 'admin', hrId: null };
  }
  const orgId = await getCurrentOrgId();
  const assignment = await resolveActorAssignment(actorResult.actor, orgId);
  const hrId = assignment ? assignment.hr_id : null;
  const canVerify = Boolean(hrId) && await verificationPermModel.checkPermission(hrId);
  return { canVerify, selectedRole: 'user', hrId };
}

async function withLockedSignatureOwner(req, callback) {
  const actorResult = await resolveCurrentActor(req);
  if (!actorResult.ok || actorResult.actor.type !== 'user') return { forbidden: true };
  return pool.withTransaction(async (connection) => {
    const orgId = await getCurrentOrgId();
    await unifiedIdentityModel.lockActiveBusinessSubjects(connection, [{
      personId: safeString(actorResult.actor.personId),
      legacyHrId: safeString(actorResult.actor.id),
      organizationId: orgId,
      assignmentId: safeString(actorResult.actor.assignmentId)
    }]);
    const assignment = await resolveActorAssignmentForUpdate(actorResult.actor, orgId, connection);
    if (!assignment) return { forbidden: true };
    return callback(connection, { hrId: assignment.hr_id, orgId });
  });
}

function signatureOwnerForbidden(res) {
  return res.json({ status: 'forbidden', message: localeCopy.copy_162d055e98 });
}

async function verifySubmissionFiles(submission) {
  const signatures = await submissionSignatureModel.getChainForVerification(submission.id);
  const files = await submissionFileModel.getBySubmissionId(submission.id);
  const currentFileHashes = {};
  const currentPdfFileIds = [];
  const currentFiles = new Map();
  for (const file of files) {
    if (String(file.mime_type || '').toLowerCase() === 'application/pdf') {
      currentPdfFileIds.push(String(file.id));
    }
    const stored = readStoredAuditFile(file, { requireIntegrity: false });
    if (stored.status === 'success') {
      currentFileHashes[file.id] = hashFile(stored.buffer);
      currentFiles.set(String(file.id), stored);
    }
  }

  const result = verifySignatureChain(signatures, currentFileHashes, {
    requiredFileIds: currentPdfFileIds
  });
  for (const file of files) {
    let fileResult = (result.files || []).find((item) => String(item.fileId) === String(file.id));
    const isPdf = String(file.mime_type || '').toLowerCase() === 'application/pdf';
    if (!fileResult && !isPdf) continue;
    if (!fileResult) {
      fileResult = {
        fileId: String(file.id),
        signatureId: null,
        signedAt: null,
        hashVerified: false,
        missingSignatureRecord: true,
        documentHashAtLastSigning: null,
        currentHash: currentFileHashes[file.id] || null
      };
      result.files.push(fileResult);
      result.valid = false;
    }
    fileResult.fileName = safeString(file.file_name);
    const stored = currentFiles.get(String(file.id));
    if (isPdf && stored) {
      try {
        fileResult.pdfSignature = verifyPdfSignature(stored.buffer);
      } catch (error) {
        console.error('[audit:signature:pdfVerify] failed:', error);
        fileResult.pdfSignature = {
          present: true,
          valid: false,
          signatures: [],
          message: localeCopy.pdfVerificationFailed
        };
      }
      if (!fileResult.pdfSignature.present || !fileResult.pdfSignature.valid) result.valid = false;
    } else {
      fileResult.pdfSignature = {
        present: false,
        valid: isPdf ? false : null,
        signatures: [],
        message: isPdf ? localeCopy.copy_6f376151a2 : localeCopy.copy_c6b6dad622
      };
      if (isPdf) result.valid = false;
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════
// Signature Template Management
// ═══════════════════════════════════════════════════

// listMySignatures
router.post('/listMySignatures', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: 'forbidden', message: localeCopy.copy_162d055e98 });
    }
    const assignment = await resolveActorAssignment(actorResult.actor, await getCurrentOrgId());
    if (!assignment) return res.json({ status: 'forbidden', message: localeCopy.copy_162d055e98 });
    const hrId = assignment.hr_id;

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
    console.error('[audit:signature:list] failed:', e);
    res.json({ status: 'error', message: localeCopy.signatureOperationFailed });
  }
});

// saveSignature
router.post('/saveSignature', async (req, res) => {
  try {
    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const imageData = safeString(req.body.imageData);
    const isDefault = req.body.isDefault === true;

    if (!imageData) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_a35b383a47 });
    }
    const validationError = validateSignatureTemplateInput(name, imageData);
    if (validationError) return res.json(validationError);

    const result = await withLockedSignatureOwner(req, async (connection, owner) => {
      if (id) {
        const [rows] = await connection.query(
          'SELECT id, hr_id FROM signature_templates WHERE id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
          [id, owner.orgId]
        );
        const existing = rows[0];
        if (!existing || safeString(existing.hr_id) !== owner.hrId) return { forbiddenSignature: true };
        if (isDefault) {
          await connection.query(
            'UPDATE signature_templates SET is_default = 0 WHERE hr_id = ? AND org_id = ?',
            [owner.hrId, owner.orgId]
          );
        }
        await connection.query(
          `UPDATE signature_templates
              SET name = ?, image_data = ?, is_default = ?
            WHERE id = ? AND hr_id = ? AND org_id = ?`,
          [name || '', imageData, isDefault ? 1 : 0, id, owner.hrId, owner.orgId]
        );
        return { status: 'success', message: localeCopy.copy_1c620d13e8 };
      }
      if (isDefault) {
        await connection.query(
          'UPDATE signature_templates SET is_default = 0 WHERE hr_id = ? AND org_id = ?',
          [owner.hrId, owner.orgId]
        );
      }
      const newId = generateId();
      await connection.query(
        `INSERT INTO signature_templates (id, hr_id, name, image_data, is_default, org_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId, owner.hrId, name || localeCopy.copy_214c901792, imageData, isDefault ? 1 : 0, owner.orgId]
      );
      return { status: 'success', id: newId, message: localeCopy.copy_082505816e };
    });
    if (result.forbidden) return signatureOwnerForbidden(res);
    if (result.forbiddenSignature) {
      return res.json({ status: 'forbidden', message: localeCopy.copy_e6677fcefe });
    }
    return res.json(result);
  } catch (e) {
    console.error('[audit:signature:save] failed:', e);
    return res.json({ status: 'error', message: localeCopy.signatureOperationFailed });
  }
});

// deleteSignature
router.post('/deleteSignature', async (req, res) => {
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_6ae85136ce });
    const result = await withLockedSignatureOwner(req, async (connection, owner) => {
      const [rows] = await connection.query(
        'SELECT id, hr_id FROM signature_templates WHERE id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
        [id, owner.orgId]
      );
      const existing = rows[0];
      if (!existing || safeString(existing.hr_id) !== owner.hrId) return { forbiddenSignature: true };
      await connection.query(
        'DELETE FROM signature_templates WHERE id = ? AND hr_id = ? AND org_id = ?',
        [id, owner.hrId, owner.orgId]
      );
      return { status: 'success', message: localeCopy.copy_1c47adeb46 };
    });
    if (result.forbidden) return signatureOwnerForbidden(res);
    if (result.forbiddenSignature) {
      return res.json({ status: 'forbidden', message: localeCopy.copy_e6677fcefe });
    }
    return res.json(result);
  } catch (e) {
    console.error('[audit:signature:delete] failed:', e);
    return res.json({ status: 'error', message: localeCopy.signatureOperationFailed });
  }
});

// setDefaultSignature
router.post('/setDefaultSignature', async (req, res) => {
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_6ae85136ce });
    const result = await withLockedSignatureOwner(req, async (connection, owner) => {
      const [rows] = await connection.query(
        'SELECT id, hr_id FROM signature_templates WHERE id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
        [id, owner.orgId]
      );
      const existing = rows[0];
      if (!existing || safeString(existing.hr_id) !== owner.hrId) return { forbiddenSignature: true };
      await connection.query(
        'UPDATE signature_templates SET is_default = 0 WHERE hr_id = ? AND org_id = ?',
        [owner.hrId, owner.orgId]
      );
      await connection.query(
        'UPDATE signature_templates SET is_default = 1 WHERE id = ? AND hr_id = ? AND org_id = ?',
        [id, owner.hrId, owner.orgId]
      );
      return { status: 'success', message: localeCopy.copy_ce2b164f35 };
    });
    if (result.forbidden) return signatureOwnerForbidden(res);
    if (result.forbiddenSignature) {
      return res.json({ status: 'forbidden', message: localeCopy.copy_e6677fcefe });
    }
    return res.json(result);
  } catch (e) {
    console.error('[audit:signature:default] failed:', e);
    return res.json({ status: 'error', message: localeCopy.signatureOperationFailed });
  }
});

// ═══════════════════════════════════════════════════
// Chain Verification
// ═══════════════════════════════════════════════════

// getAuditVerificationAccess — 只返回当前组织下的验签权限。
router.post('/getAuditVerificationAccess', async (req, res) => {
  try {
    const access = await resolveVerificationAccess(req);
    return res.json({ status: 'success', canVerify: access.canVerify });
  } catch (e) {
    console.error('[audit:signature:access] failed:', e);
    return res.json({ status: 'error', message: localeCopy.verificationFailed });
  }
});

// verifySignatureChain — Verify hash chain of a submission
router.post('/verifySignatureChain', async (req, res) => {
  try {
    const submissionNumber = safeString(req.body.submissionNumber);
    const submissionId = safeString(req.body.submissionId);
    const fileHash = safeString(req.body.fileHash);
    const fileBase64 = safeString(req.body.fileBase64);

    const access = await resolveVerificationAccess(req);
    if (!access.canVerify) {
      return res.json({ status: 'forbidden', message: localeCopy.copy_4ca1fc6fb1 });
    }

    if (fileHash && !/^[a-fA-F0-9]{64}$/.test(fileHash)) {
      return res.json({ status: 'invalid_params', message: localeCopy.verificationInputInvalid });
    }

    let resolvedFileHash = fileHash.toLowerCase();
    if (!resolvedFileHash && fileBase64) {
      const buffer = decodeVerificationFile(fileBase64);
      if (!buffer) {
        return res.json({ status: 'invalid_params', message: localeCopy.verificationFileInvalid });
      }
      resolvedFileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    }

    let submission;
    let matches = [];
    if (resolvedFileHash) {
      const matchRows = await verificationMatchModel.listFileHashMatches(resolvedFileHash);
      matches = verificationMatchModel.groupFileHashMatches(matchRows);
      if (!matches.length) {
        return res.json({ status: 'not_found', message: localeCopy.copy_780fb113f1 });
      }
      const selectedMatch = submissionId
        ? matches.find((item) => item.submissionId === submissionId)
        : matches[0];
      if (!selectedMatch) {
        return res.json({ status: 'not_found', message: localeCopy.copy_780fb113f1 });
      }
      submission = await submissionModel.getById(selectedMatch.submissionId);
    } else if (submissionId) {
      submission = await submissionModel.getById(submissionId);
    } else if (submissionNumber) {
      submission = await submissionModel.getByNumber(submissionNumber);
    }

    if (!submission) {
      return res.json({ status: 'not_found', message: localeCopy.copy_780fb113f1 });
    }

    const result = await verifySubmissionFiles(submission);

    res.json({
      status: 'success',
      submissionId: safeString(submission.id),
      submissionNumber: safeString(submission.submission_number),
      verifyByFileHash: resolvedFileHash || null,
      matchCount: matches.length,
      matches,
      ...result
    });
  } catch (e) {
    console.error('[audit:signature:verify] failed:', e);
    res.json({ status: 'error', message: localeCopy.verificationFailed });
  }
});

module.exports = router;
