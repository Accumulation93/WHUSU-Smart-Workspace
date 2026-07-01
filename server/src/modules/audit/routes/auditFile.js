const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { safeString, generateId } = require('../../../utils/helpers');
const {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  assertAllowedFile,
  createTempUpload,
  getAuthorizedAuditFile
} = require('../utils/fileSecurity');

const execFileAsync = promisify(execFile);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function getPdfPageCount(filePath) {
  const { PDFDocument } = require('pdf-lib');
  const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));
  return pdfDoc.getPageCount() || 1;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function renderPdfPageWithPdftoppm(filePath, page) {
  const prefix = path.join(os.tmpdir(), 'audit_pdf_preview_' + generateId());
  const exe = process.env.PDFTOPPM_PATH || 'pdftoppm';
  await execFileAsync(exe, [
    '-f', String(page),
    '-l', String(page),
    '-png',
    '-singlefile',
    '-r', '150',
    filePath,
    prefix
  ], { windowsHide: true, timeout: 30000 });

  const outPath = prefix + '.png';
  const buffer = fs.readFileSync(outPath);
  try { fs.unlinkSync(outPath); } catch (_) { /* ignore */ }
  return buffer;
}

async function renderPdfPageWithPdfjs(filePath, page) {
  const { createCanvas, DOMMatrix, Path2D, ImageData } = require('@napi-rs/canvas');
  global.DOMMatrix = global.DOMMatrix || DOMMatrix;
  global.Path2D = global.Path2D || Path2D;
  global.ImageData = global.ImageData || ImageData;
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const canvasFactory = {
    create(width, height) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext('2d') };
    },
    reset(canvasAndContext, width, height) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    },
    destroy(canvasAndContext) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  };
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjsLib.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    canvasFactory
  });
  const pdfDoc = await loadingTask.promise;
  const pdfPage = await pdfDoc.getPage(page);
  const viewport = pdfPage.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const canvasContext = canvas.getContext('2d');
  await pdfPage.render({ canvasContext, viewport, canvasFactory }).promise;
  const pngBuffer = canvas.toBuffer('image/png');
  await pdfDoc.destroy();
  return pngBuffer;
}

async function renderPdfPage(filePath, page) {
  const errors = [];
  try {
    const sharp = require('sharp');
    const buffer = await sharp(filePath, { page: page - 1, density: 150 }).png().toBuffer();
    return { buffer, renderer: 'sharp' };
  } catch (sharpErr) {
    errors.push('sharp: ' + sharpErr.message);
  }

  try {
    const buffer = await renderPdfPageWithPdfjs(filePath, page);
    return { buffer, renderer: 'pdfjs' };
  } catch (pdfjsErr) {
    errors.push('pdfjs: ' + pdfjsErr.message);
  }

  try {
    const buffer = await renderPdfPageWithPdftoppm(filePath, page);
    return { buffer, renderer: 'pdftoppm' };
  } catch (pdftoppmErr) {
    errors.push('pdftoppm: ' + pdftoppmErr.message);
  }

  const err = new Error('PDF preview render failed: ' + errors.join('; '));
  err.renderErrors = errors;
  throw err;
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
  limits: { fileSize: MAX_FILE_SIZE }
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

// Direct binary download — avoids base64 overhead and USER_DATA_PATH quota issues.
// Used by wx.downloadFile → wx.openDocument for reliable file opening.
router.get('/downloadAuditFile', async (req, res) => {
  try {
    const fileId = safeString(req.query.fileId);
    if (!fileId) return res.status(400).json({ status: 'invalid_params', message: '请提供文件ID' });

    const auth = await getAuthorizedAuditFile(fileId, req.openid);
    if (auth.status !== 'success') {
      const code = auth.status === 'forbidden' ? 403 : 404;
      return res.status(code).json(auth);
    }
    const file = auth.file;

    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ status: 'not_found', message: '文件已被清理或不存在' });
    }

    const mime = file.mime_type || 'application/octet-stream';
    const encodedName = encodeURIComponent(file.file_name);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Length', String(file.file_size));
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const readStream = fs.createReadStream(file.file_path);
    readStream.on('error', (streamErr) => {
      if (!res.headersSent) {
        res.status(500).json({ status: 'error', message: safeString(streamErr.message) });
      }
    });
    readStream.pipe(res);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: safeString(e.message) });
    }
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
        const totalPages = await getPdfPageCount(file.file_path);
        const targetPage = Math.max(1, Math.min(page, totalPages));
        const rendered = await renderPdfPage(file.file_path, targetPage);
        return res.json({
          status: 'success',
          fileName: file.file_name,
          mimeType: 'application/pdf',
          previewMime: 'image/png',
          totalPages,
          page: targetPage,
          data: rendered.buffer.toString('base64'),
          renderer: rendered.renderer
        });
      } catch (e) {
        return res.json({
          status: 'success',
          fileName: file.file_name,
          mimeType: 'application/pdf',
          previewMime: 'application/pdf',
          totalPages: await getPdfPageCount(file.file_path).catch(() => 1),
          page: page,
          data: null,
          fallback: true,
          message: 'PDF预览生成失败，请检查服务器 PDF 渲染依赖',
          renderError: safeString(e.message)
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
        const size = clampNumber(sig.size || sig.signatureSize, 1, 0.5, 2.2);
        const rotation = clampNumber(sig.rotation, 0, -180, 180);
        const targetSigWidth = Math.max(48, Math.min(Math.round(imgWidth * 0.18 * size), Math.round(imgWidth * 0.55), 520));
        let sigResized = await sharp(sigBuffer).resize({ width: targetSigWidth, fit: 'inside' }).png().toBuffer();
        if (rotation) {
          sigResized = await sharp(sigResized).rotate(rotation, { background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
        }
        const sigMeta = await sharp(sigResized).metadata();
        const sigWidth = sigMeta.width || targetSigWidth;
        const sigHeight = sigMeta.height || Math.round(targetSigWidth * 0.45);
        const posX = Math.round((parseFloat(sig.positionX) || 0.5) * imgWidth);
        const posY = Math.round((parseFloat(sig.positionY) || 0.5) * imgHeight);
        composites.push({
          input: sigResized,
          top: Math.max(0, Math.min(imgHeight - sigHeight, posY - Math.round(sigHeight / 2))),
          left: Math.max(0, Math.min(imgWidth - sigWidth, posX - Math.round(sigWidth / 2)))
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
        const size = clampNumber(sig.size || sig.signatureSize, 1, 0.5, 2.2);
        const rotation = clampNumber(sig.rotation, 0, -180, 180);
        const embedBuffer = rotation
          ? await sharp(sigBuffer).rotate(rotation, { background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer()
          : sigBuffer;

        let pdfImage;
        try {
          pdfImage = await pdfDoc.embedPng(embedBuffer);
        } catch (_) {
          try {
            const jpegBuffer = await sharp(embedBuffer).jpeg().toBuffer();
            pdfImage = await pdfDoc.embedJpg(jpegBuffer);
          } catch (__) {
            continue;
          }
        }

        const sigWidth = Math.max(48, Math.min(pageWidth * 0.18 * size, pageWidth * 0.55, 300));
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
