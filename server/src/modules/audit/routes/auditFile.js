const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { safeString, generateId } = require('../../../utils/helpers');
const {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_MIMES,
  assertAllowedFile,
  createTempUpload,
  getAuthorizedAuditFile
} = require('../utils/fileSecurity');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支持的文件类型：' + file.mimetype));
  }
});

router.post('/uploadAuditFile', function(req, res, next) {
  const contentType = req.get('content-type') || '';
  if (contentType.indexOf('multipart/form-data') !== -1) {
    return upload.single('file')(req, res, next);
  }
  next();
}, async (req, res) => {
  try {
    let fileName = '';
    let mimeType = '';
    let buffer = null;

    if (req.file) {
      fileName = safeString(req.file.originalname);
      mimeType = safeString(req.file.mimetype);
      buffer = fs.readFileSync(req.file.path);
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    } else if (req.body.fileBase64) {
      fileName = safeString(req.body.fileName);
      mimeType = safeString(req.body.mimeType);
      if (String(req.body.fileBase64).length > Math.ceil(MAX_FILE_SIZE * 4 / 3) + 1024) {
        return res.json({ status: 'invalid_params', message: '文件过大，最大支持 10MB' });
      }
      buffer = Buffer.from(String(req.body.fileBase64), 'base64');
    } else {
      return res.json({ status: 'invalid_params', message: '请选择要上传的文件' });
    }

    mimeType = assertAllowedFile(buffer, mimeType);
    const uploadInfo = await createTempUpload({
      buffer,
      fileName,
      mimeType,
      openid: req.openid
    });

    res.json({ status: 'success', ...uploadInfo });
  } catch (e) {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
    res.json({ status: e.status || 'error', message: safeString(e.message) });
  }
});

router.post('/getAuditFile', async (req, res) => {
  try {
    const fileId = safeString(req.body.fileId);
    if (!fileId) return res.json({ status: 'invalid_params', message: '请提供文件ID' });

    const auth = await getAuthorizedAuditFile(fileId, req.openid);
    if (auth.status !== 'success') return res.json(auth);
    const file = auth.file;

    if (!fs.existsSync(file.file_path)) {
      return res.json({ status: 'not_found', message: '文件已被清理或不存在' });
    }

    const buffer = fs.readFileSync(file.file_path);
    res.json({
      status: 'success',
      fileName: file.file_name,
      mimeType: file.mime_type,
      fileSize: file.file_size,
      fileHash: file.file_hash,
      data: buffer.toString('base64')
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/getAuditFilePreview', async (req, res) => {
  try {
    const fileId = safeString(req.body.fileId);
    const page = parseInt(req.body.page) || 1;
    if (!fileId) return res.json({ status: 'invalid_params', message: '请提供文件ID' });

    const auth = await getAuthorizedAuditFile(fileId, req.openid);
    if (auth.status !== 'success') return res.json(auth);
    const file = auth.file;

    if (!fs.existsSync(file.file_path)) {
      return res.json({ status: 'not_found', message: '文件已被清理或不存在' });
    }

    const mimeType = file.mime_type;
    if (mimeType && mimeType.startsWith('image/')) {
      return res.json({
        status: 'success',
        fileName: file.file_name,
        mimeType,
        previewMime: mimeType,
        totalPages: 1,
        page: 1,
        data: fs.readFileSync(file.file_path).toString('base64')
      });
    }

    if (mimeType === 'application/pdf') {
      try {
        const sharp = require('sharp');
        let totalPages = 1;
        for (let p = 1; p <= 200; p++) {
          try {
            await sharp(file.file_path, { page: p - 1, density: 150 }).metadata();
            totalPages = p;
          } catch (_) {
            break;
          }
        }
        const targetPage = Math.max(1, Math.min(page, totalPages));
        const pngBuffer = await sharp(file.file_path, { page: targetPage - 1, density: 150 }).png().toBuffer();
        return res.json({
          status: 'success',
          fileName: file.file_name,
          mimeType: 'application/pdf',
          previewMime: 'image/png',
          totalPages,
          page: targetPage,
          data: pngBuffer.toString('base64')
        });
      } catch (e) {
        return res.json({
          status: 'success',
          fileName: file.file_name,
          mimeType: 'application/pdf',
          previewMime: 'application/pdf',
          totalPages: 1,
          page: 1,
          data: null,
          fallback: true
        });
      }
    }

    res.json({
      status: 'success',
      fileName: file.file_name,
      mimeType,
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

router.post('/mergeSignaturesIntoFile', async (req, res) => {
  try {
    const fileId = safeString(req.body.fileId);
    const signatures = Array.isArray(req.body.signatures) ? req.body.signatures : [];
    if (!fileId) return res.json({ status: 'invalid_params', message: '请提供文件ID' });

    const auth = await getAuthorizedAuditFile(fileId, req.openid);
    if (auth.status !== 'success') return res.json(auth);
    const file = auth.file;

    if (!fs.existsSync(file.file_path)) {
      return res.json({ status: 'not_found', message: '文件已被清理' });
    }

    const mimeType = file.mime_type;
    const sharp = require('sharp');

    if (mimeType && mimeType.startsWith('image/')) {
      const image = sharp(file.file_path);
      const metadata = await image.metadata();
      const imgWidth = metadata.width || 800;
      const imgHeight = metadata.height || 600;
      const composites = [];

      for (const sig of signatures) {
        if (!sig.imageData) continue;
        const base64Data = sig.imageData.replace(/^data:image\/\w+;base64,/, '');
        const sigBuffer = Buffer.from(base64Data, 'base64');
        const targetSigWidth = Math.min(Math.round(imgWidth * 0.18), 200);
        const sigResized = await sharp(sigBuffer).resize({ width: targetSigWidth, fit: 'inside' }).png().toBuffer();
        const posX = Math.round((parseFloat(sig.positionX) || 0.5) * imgWidth);
        const posY = Math.round((parseFloat(sig.positionY) || 0.5) * imgHeight);
        composites.push({
          input: sigResized,
          top: Math.max(0, posY - Math.round(targetSigWidth / 4)),
          left: Math.max(0, posX - Math.round(targetSigWidth / 2))
        });
      }

      if (composites.length) {
        const merged = await image.composite(composites).png().toBuffer();
        return res.json({ status: 'success', fileName: file.file_name, mimeType: 'image/png', data: merged.toString('base64'), merged: true });
      }

      return res.json({
        status: 'success',
        fileName: file.file_name,
        mimeType,
        data: fs.readFileSync(file.file_path).toString('base64'),
        merged: false
      });
    }

    if (mimeType === 'application/pdf') {
      const { PDFDocument } = require('pdf-lib');
      const pdfBytes = fs.readFileSync(file.file_path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const totalPages = pages.length;

      for (const sig of signatures) {
        if (!sig.imageData) continue;
        const pageNum = parseInt(sig.page) || 1;
        const pageIndex = Math.max(0, Math.min(pageNum - 1, totalPages - 1));
        const page = pages[pageIndex];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const base64Data = sig.imageData.replace(/^data:image\/\w+;base64,/, '');
        const sigBuffer = Buffer.from(base64Data, 'base64');

        let pdfImage;
        try {
          pdfImage = await pdfDoc.embedPng(sigBuffer);
        } catch (_) {
          try {
            const jpegBuffer = await sharp(sigBuffer).jpeg().toBuffer();
            pdfImage = await pdfDoc.embedJpg(jpegBuffer);
          } catch (__) {
            continue;
          }
        }

        const sigWidth = Math.min(pageWidth * 0.18, 120);
        const sigHeight = (pdfImage.height / pdfImage.width) * sigWidth;
        const posX = (parseFloat(sig.positionX) || 0.5) * pageWidth;
        const posY = (parseFloat(sig.positionY) || 0.5) * pageHeight;
        page.drawImage(pdfImage, {
          x: Math.max(0, posX - sigWidth / 2),
          y: Math.max(0, pageHeight - posY - sigHeight / 2),
          width: sigWidth,
          height: sigHeight,
          opacity: 0.85
        });
      }

      const mergedPdfBytes = await pdfDoc.save();
      return res.json({
        status: 'success',
        fileName: file.file_name,
        mimeType: 'application/pdf',
        data: Buffer.from(mergedPdfBytes).toString('base64'),
        merged: signatures.length > 0
      });
    }

    res.json({
      status: 'success',
      fileName: file.file_name,
      mimeType,
      data: fs.readFileSync(file.file_path).toString('base64'),
      merged: false
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
