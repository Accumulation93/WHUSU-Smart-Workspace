const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { hashFile } = require('./hashChain');

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getImageBuffer(imageData) {
  if (!imageData || typeof imageData !== 'string') return null;
  const base64Data = imageData.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  if (!base64Data) return null;
  return Buffer.from(base64Data, 'base64');
}

async function buildSignaturePng(sig, targetWidth) {
  const sigBuffer = getImageBuffer(sig.imageData);
  if (!sigBuffer) return null;
  return sharp(sigBuffer)
    .resize({ width: targetWidth, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function overlayOnImageBuffer(sourceBuffer, signatures) {
  const image = sharp(sourceBuffer);
  const metadata = await image.metadata();
  const imgWidth = metadata.width || 800;
  const imgHeight = metadata.height || 600;
  const composites = [];

  for (const sig of signatures) {
    const size = clampNumber(sig.size || sig.signatureSize, 1, 0.5, 2.2);
    const rotation = clampNumber(sig.rotation, 0, -180, 180);
    const targetSigWidth = Math.max(48, Math.min(Math.round(imgWidth * 0.18 * size), Math.round(imgWidth * 0.55), 520));
    let sigPng = await buildSignaturePng(sig, targetSigWidth);
    if (!sigPng) continue;
    if (rotation) {
      sigPng = await sharp(sigPng).rotate(rotation, { background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    }

    const sigMeta = await sharp(sigPng).metadata();
    const sigWidth = sigMeta.width || targetSigWidth;
    const sigHeight = sigMeta.height || Math.round(targetSigWidth * 0.45);
    const posX = clamp01(sig.positionX, 0.5) * imgWidth;
    const posY = clamp01(sig.positionY, 0.5) * imgHeight;

    composites.push({
      input: sigPng,
      left: Math.max(0, Math.min(imgWidth - sigWidth, Math.round(posX - sigWidth / 2))),
      top: Math.max(0, Math.min(imgHeight - sigHeight, Math.round(posY - sigHeight / 2)))
    });
  }

  if (!composites.length) return null;
  return image.composite(composites).png().toBuffer();
}

async function overlayOnPdfBuffer(sourceBuffer, signatures) {
  const pdfDoc = await PDFDocument.load(sourceBuffer);
  const pages = pdfDoc.getPages();
  if (!pages.length) return null;

  let applied = 0;
  for (const sig of signatures) {
    const sigBuffer = getImageBuffer(sig.imageData);
    if (!sigBuffer) continue;

    const pageNum = sig.page == null || sig.page === '' ? 1 : Number(sig.page);
    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > pages.length) return null;
    const pageIndex = pageNum - 1;
    const page = pages[pageIndex];
    const pageSize = page.getSize();
    const size = clampNumber(sig.size || sig.signatureSize, 1, 0.5, 2.2);
    const rotation = clampNumber(sig.rotation, 0, -180, 180);
    const embedBuffer = rotation
      ? await sharp(sigBuffer).rotate(rotation, { background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer()
      : sigBuffer;

    let pdfImage;
    try {
      pdfImage = await pdfDoc.embedPng(embedBuffer);
    } catch (_) {
      const jpegBuffer = await sharp(embedBuffer).jpeg().toBuffer();
      pdfImage = await pdfDoc.embedJpg(jpegBuffer);
    }

    const sigWidth = Math.max(48, Math.min(pageSize.width * 0.18 * size, pageSize.width * 0.55, 300));
    const sigHeight = (pdfImage.height / pdfImage.width) * sigWidth;
    const posX = clamp01(sig.positionX, 0.5) * pageSize.width;
    const posY = clamp01(sig.positionY, 0.5) * pageSize.height;

    page.drawImage(pdfImage, {
      x: Math.max(0, Math.min(pageSize.width - sigWidth, posX - sigWidth / 2)),
      y: Math.max(0, Math.min(pageSize.height - sigHeight, pageSize.height - posY - sigHeight / 2)),
      width: sigWidth,
      height: sigHeight,
      opacity: sig.signatureType === 'stamp' ? 0.9 : 0.95
    });
    applied += 1;
  }

  if (!applied) return null;
  return Buffer.from(await pdfDoc.save());
}

async function overlaySignaturesOnFile(file, signatures) {
  const usable = signatures.filter((sig) => sig && sig.imageData);
  if (!file || !file.file_path || !fs.existsSync(file.file_path) || !usable.length) {
    return null;
  }

  const sourceBuffer = fs.readFileSync(file.file_path);
  const result = await overlaySignaturesOnBuffer(file, sourceBuffer, usable);
  if (!result) return null;

  fs.writeFileSync(file.file_path, result.buffer);
  return {
    filePath: file.file_path,
    fileName: file.file_name || path.basename(file.file_path),
    mimeType: result.mimeType,
    fileSize: result.buffer.length,
    fileHash: result.fileHash
  };
}

async function overlaySignaturesOnBuffer(file, sourceBuffer, signatures) {
  const usable = (Array.isArray(signatures) ? signatures : []).filter((sig) => sig && sig.imageData);
  if (!file || !Buffer.isBuffer(sourceBuffer) || !sourceBuffer.length || !usable.length) return null;
  const mimeType = file.mime_type || '';
  let buffer = null;
  let outputMimeType = mimeType;
  if (mimeType.startsWith('image/')) {
    buffer = await overlayOnImageBuffer(sourceBuffer, usable);
    outputMimeType = 'image/png';
  } else if (mimeType === 'application/pdf') {
    buffer = await overlayOnPdfBuffer(sourceBuffer, usable);
    outputMimeType = 'application/pdf';
  }
  if (!buffer) return null;
  return {
    buffer,
    mimeType: outputMimeType,
    fileSize: buffer.length,
    fileHash: hashFile(buffer)
  };
}

module.exports = {
  overlayOnPdfBuffer,
  overlaySignaturesOnFile,
  overlaySignaturesOnBuffer
};
