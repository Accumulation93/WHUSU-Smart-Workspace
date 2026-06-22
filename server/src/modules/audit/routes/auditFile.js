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
// Supports both multipart/form-data (multer) and JSON body with base64
router.post('/uploadAuditFile', function(req, res, next) {
  // If Content-Type is multipart/form-data, use multer
  var contentType = req.get('content-type') || '';
  if (contentType.indexOf('multipart/form-data') !== -1) {
    return upload.single('file')(req, res, next);
  }
  // JSON body — skip multer
  next();
}, async (req, res) => {
  try {
    var fileId = generateId();
    var originalName, mimeType, fileSize, tmpPath, fileBuffer;

    if (req.file) {
      // Multipart upload via multer
      originalName = safeString(req.file.originalname);
      mimeType = safeString(req.file.mimetype);
      fileSize = req.file.size;
      tmpPath = req.file.path;
      fileBuffer = fs.readFileSync(tmpPath);
    } else if (req.body.fileBase64) {
      // JSON body with base64 data
      originalName = safeString(req.body.fileName);
      mimeType = safeString(req.body.mimeType);
      fileBuffer = Buffer.from(String(req.body.fileBase64), 'base64');
      fileSize = fileBuffer.length;

      // Validate mime type
      var ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
      if (ALLOWED_MIMES.indexOf(mimeType) === -1) {
        return res.json({ status: 'invalid_params', message: '不支持的文件类型：' + mimeType + '。仅支持 PNG、JPEG、WebP 图片和 PDF 文件。' });
      }

      // Validate file size
      var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (fileSize > MAX_FILE_SIZE) {
        return res.json({ status: 'invalid_params', message: '文件过大，最大支持 10MB' });
      }

      // Write to temp file
      var ext = path.extname(originalName) || '';
      if (!ext) {
        // Infer extension from mime type
        if (mimeType === 'image/png') ext = '.png';
        else if (mimeType === 'image/jpeg') ext = '.jpg';
        else if (mimeType === 'image/webp') ext = '.webp';
        else if (mimeType === 'application/pdf') ext = '.pdf';
      }
      var tmpDir = path.join(UPLOAD_DIR, '_tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      tmpPath = path.join(tmpDir, fileId + ext);
      fs.writeFileSync(tmpPath, fileBuffer);
    } else {
      return res.json({ status: 'invalid_params', message: '请选择要上传的文件' });
    }

    // Compute SHA-256 hash
    var fileHash = hashFile(fileBuffer);

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

// getAuditFilePreview — Return a page preview image (PDF rendered as PNG, images as-is)
router.post('/getAuditFilePreview', async (req, res) => {
  try {
    const fileId = safeString(req.body.fileId);
    const page = parseInt(req.body.page) || 1;
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

    const mimeType = file.mime_type;

    // For images, return the full image as-is
    if (mimeType && mimeType.startsWith('image/')) {
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      return res.json({
        status: 'success',
        fileName: file.file_name,
        mimeType: mimeType,
        previewMime: mimeType,
        totalPages: 1,
        page: 1,
        data: base64
      });
    }

    // For PDFs, render a specific page as PNG using sharp
    if (mimeType === 'application/pdf') {
      try {
        const sharp = require('sharp');

        // Count total pages — sharp can render all pages, we probe by trying pages
        // First, get page count by trying to render pages until one fails
        let totalPages = 1;
        try {
          // Try rendering pages sequentially to find total
          for (let p = 1; p <= 200; p++) {
            try {
              await sharp(filePath, { page: p - 1, density: 150 }).metadata();
              totalPages = p;
            } catch (e) {
              break;
            }
          }
        } catch (_) {
          totalPages = 1;
        }

        // Clamp page to valid range
        const targetPage = Math.max(1, Math.min(page, totalPages));

        // Render the page at 150 DPI for good quality
        const pngBuffer = await sharp(filePath, {
          page: targetPage - 1, // sharp uses 0-based page index
          density: 150
        })
        .png()
        .toBuffer();

        const base64 = pngBuffer.toString('base64');
        return res.json({
          status: 'success',
          fileName: file.file_name,
          mimeType: 'application/pdf',
          previewMime: 'image/png',
          totalPages: totalPages,
          page: targetPage,
          data: base64
        });
      } catch (sharpErr) {
        // If sharp fails on PDF (e.g., no PDF support in libvips), fall back
        console.error('[auditFile] PDF preview render failed:', sharpErr.message);
        return res.json({
          status: 'success',
          fileName: file.file_name,
          mimeType: 'application/pdf',
          previewMime: 'application/pdf',
          totalPages: 1,
          page: 1,
          data: null, // No preview image available — client should show placeholder
          fallback: true
        });
      }
    }

    // Other file types — return metadata only
    return res.json({
      status: 'success',
      fileName: file.file_name,
      mimeType: mimeType,
      previewMime: mimeType,
      totalPages: 1,
      page: 1,
      data: null,
      fallback: true
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
