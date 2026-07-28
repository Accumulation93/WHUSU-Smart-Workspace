const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../../../config/db');
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const adminInfoModel = require('../../../core/models/adminInfo');
const verificationPermModel = require('../models/verificationPermission');
const submissionFileModel = require('../models/auditSubmissionFile');
const { JWT_SECRET } = require('../../../middleware/auth');
const { hashFile } = require('./hashChain');

const UPLOAD_DIR = path.resolve(
  process.env.AUDIT_UPLOAD_DIR || path.resolve(__dirname, '../../../../uploads/audit')
);
const TMP_DIR = path.join(UPLOAD_DIR, '_tmp');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_FILES_PER_SUBMISSION = 20;

function normalizeMime(mimeType) {
  const mime = safeString(mimeType).toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'application/x-pdf') return 'application/pdf';
  if (mime === 'application/octet-stream' || mime === 'binary/octet-stream') return '';
  return mime;
}

function detectMime(buffer) {
  if (!buffer || buffer.length < 4) return '';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  return '';
}

function extForMime(mimeType) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'application/pdf') return '.pdf';
  return '';
}

function assertAllowedFile(buffer, declaredMime) {
  const detectedMime = detectMime(buffer);
  const mimeType = detectedMime || normalizeMime(declaredMime);
  if (!ALLOWED_MIMES.includes(mimeType)) {
    const err = new Error('不支持的文件类型或文件内容与类型不匹配');
    err.status = 'invalid_params';
    throw err;
  }
  if (buffer.length > MAX_FILE_SIZE) {
    const err = new Error('文件过大，最大支持 10MB');
    err.status = 'invalid_params';
    throw err;
  }
  return mimeType;
}

function signUploadToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyUploadToken(token) {
  const parts = safeString(token).split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(parts[0]).digest('base64url');
  if (parts[1].length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

async function createTempUpload({ buffer, fileName, mimeType, openid }) {
  const orgId = await getCurrentOrgId();
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const actualMime = assertAllowedFile(buffer, mimeType);
  const fileId = generateId();
  const cleanName = safeString(fileName) || ('audit-file' + extForMime(actualMime));
  const ext = path.extname(cleanName) || extForMime(actualMime);
  const tempName = fileId + ext;
  const tmpPath = path.join(TMP_DIR, tempName);
  fs.writeFileSync(tmpPath, buffer);

  const fileHash = hashFile(buffer);
  const token = signUploadToken({
    fileId,
    fileName: cleanName,
    mimeType: actualMime,
    fileSize: buffer.length,
    fileHash,
    tempName,
    openid: safeString(openid),
    orgId,
    exp: Date.now() + TOKEN_TTL_MS
  });

  return { fileId, fileName: cleanName, mimeType: actualMime, fileSize: buffer.length, fileHash, fileToken: token };
}

async function resolveUploadedFile(uploadedFile, openid) {
  const orgId = await getCurrentOrgId();
  const tokenPayload = verifyUploadToken(uploadedFile.fileToken);
  const meta = tokenPayload;
  if (!meta) {
    const err = new Error('上传文件凭证无效或已过期');
    err.status = 'invalid_params';
    throw err;
  }

  if (!safeString(meta.openid) || safeString(meta.openid) !== safeString(openid)) {
    const err = new Error('上传文件不属于当前用户');
    err.status = 'forbidden';
    throw err;
  }
  if (!safeString(meta.orgId) || safeString(meta.orgId) !== orgId) {
    const err = new Error('上传文件不属于当前组织');
    err.status = 'forbidden';
    throw err;
  }
  const tempName = path.basename(safeString(meta.tempName));
  if (!tempName || tempName !== safeString(meta.tempName)) {
    const err = new Error('上传文件凭证无效');
    err.status = 'invalid_params';
    throw err;
  }
  const tmpPath = path.join(TMP_DIR, tempName);
  if (!fs.existsSync(tmpPath)) {
    const err = new Error('上传文件已过期或不存在');
    err.status = 'not_found';
    throw err;
  }

  const buffer = fs.readFileSync(tmpPath);
  const actualMime = assertAllowedFile(buffer, meta.mimeType);
  return {
    fileId: safeString(meta.fileId) || generateId(),
    fileName: safeString(meta.fileName) || ('audit-file' + extForMime(actualMime)),
    mimeType: actualMime,
    fileSize: buffer.length,
    fileHash: hashFile(buffer),
    tmpPath
  };
}

async function attachUploadedFiles({ uploadedFiles, submissionId, openid, conn }) {
  if (!Array.isArray(uploadedFiles) || uploadedFiles.length > MAX_FILES_PER_SUBMISSION) {
    const err = new Error('单次最多上传20个文件');
    err.status = 'invalid_params';
    throw err;
  }
  const submissionDir = path.join(UPLOAD_DIR, submissionId);
  if (!fs.existsSync(submissionDir)) fs.mkdirSync(submissionDir, { recursive: true });

  for (let i = 0; i < uploadedFiles.length; i++) {
    const meta = await resolveUploadedFile(uploadedFiles[i], openid);
    const ext = path.extname(meta.fileName) || extForMime(meta.mimeType);
    const destPath = path.join(submissionDir, meta.fileId + ext);
    fs.renameSync(meta.tmpPath, destPath);
    await submissionFileModel.create(meta.fileId, {
      submissionId,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      filePath: destPath,
      fileSize: meta.fileSize,
      fileHash: meta.fileHash,
      sortOrder: i + 1
    }, conn);
  }
}

function csvContainsExactId(value, expectedId) {
  return safeString(value).split(',').map((item) => item.trim()).filter(Boolean).includes(expectedId);
}

function jsonContainsExactId(value, expectedId) {
  if (typeof value === 'string') return value === expectedId;
  if (Array.isArray(value)) return value.some((item) => jsonContainsExactId(item, expectedId));
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value).some((key) => jsonContainsExactId(value[key], expectedId));
}

async function getAuthorizedAuditFile(fileId, openid) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT f.*, s.submitted_by
     FROM audit_submission_files f
     JOIN audit_submissions s ON s.id = f.submission_id AND s.org_id = f.org_id
     WHERE f.id = ? AND f.org_id = ?`,
    [fileId, orgId]
  );
  const file = rows[0];
  if (!file) return { status: 'not_found', message: '文件不存在' };

  const admin = await adminInfoModel.getByOpenid(openid);
  if (admin) return { status: 'success', file };

  const [userRows] = await pool.query('SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?', [openid, orgId]);
  const hrId = userRows[0] ? userRows[0].hr_id : '';
  if (!hrId) return { status: 'forbidden', message: '请先绑定人事信息' };
  if (file.submitted_by === hrId) return { status: 'success', file };

  const [stepRows] = await pool.query(
    `SELECT approver_hr_id, step_conditions_json
       FROM audit_submission_steps
      WHERE submission_id = ? AND org_id = ?`,
    [file.submission_id, orgId]
  );
  const isStepParticipant = stepRows.some((step) => {
    if (csvContainsExactId(step.approver_hr_id, hrId)) return true;
    try {
      return jsonContainsExactId(JSON.parse(step.step_conditions_json || '{}'), hrId);
    } catch (_) {
      return false;
    }
  });
  if (isStepParticipant) return { status: 'success', file };

  const [eventRows] = await pool.query(
    'SELECT id FROM audit_events WHERE submission_id = ? AND operator_hr_id = ? AND org_id = ? LIMIT 1',
    [file.submission_id, hrId, orgId]
  );
  if (eventRows.length) return { status: 'success', file };

  if (await verificationPermModel.checkPermission(hrId)) return { status: 'success', file };
  return { status: 'forbidden', message: '没有文件访问权限' };
}

module.exports = {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_MIMES,
  assertAllowedFile,
  createTempUpload,
  attachUploadedFiles,
  getAuthorizedAuditFile
};
