const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { hashFile } = require('../utils/hashChain');
const adminInfoModel = require('../../../core/models/adminInfo');

const UPLOAD_DIR = path.resolve(__dirname, '../../../../uploads/audit');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use temp dir; we'll move to submission-specific dir later
    const tmpDir = path.join(UPLOAD_DIR, '_tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, generateId() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型：' + file.mimetype + '。仅支持 PNG、JPEG、WebP 图片和 PDF 文件。'));
    }
  }
});

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// uploadAuditFile — Upload a document file for audit submission
router.post('/uploadAuditFile', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ status: 'invalid_params', message: '请选择要上传的文件' });
    }

    const fileId = generateId();
    const originalName = safeString(req.file.originalname);
    const mimeType = safeString(req.file.mimetype);
    const fileSize = req.file.size;
    const tmpPath = req.file.path;

    // Compute SHA-256 hash
    const fileBuffer = fs.readFileSync(tmpPath);
    const fileHash = hashFile(fileBuffer);

    // File stays in _tmp for now; will be moved when submission is created
    // Store the tmp path so the submission creation can move it

    res.json({
      status: 'success',
      fileId,
      fileName: originalName,
      mimeType,
      fileSize,
      fileHash,
      tmpPath
    });
  } catch (e) {
    // Clean up temp file on error
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// getAuditFile — Serve a file for download/preview
router.post('/getAuditFile', async (req, res) => {
  try {
    const fileId = safeString(req.body.fileId);
    if (!fileId) {
      return res.json({ status: 'invalid_params', message: '请提供文件ID' });
    }

    const pool = require('../../../config/db');
    const orgId = await getCurrentOrgId();
    const [rows] = await pool.query(
      'SELECT * FROM audit_submission_files WHERE id = ? AND org_id = ?',
      [fileId, orgId]
    );
    const file = rows[0];
    if (!file) {
      return res.json({ status: 'not_found', message: '文件不存在' });
    }

    const filePath = file.file_path;
    if (!fs.existsSync(filePath)) {
      return res.json({ status: 'not_found', message: '文件已被清理或不存在' });
    }

    // Return the file as base64 for WeChat Mini Program consumption
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    res.json({
      status: 'success',
      fileName: file.file_name,
      mimeType: file.mime_type,
      fileSize: file.file_size,
      fileHash: file.file_hash,
      data: base64
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
