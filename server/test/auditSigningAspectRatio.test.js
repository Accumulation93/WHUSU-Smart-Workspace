'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { PDFDocument, degrees, rgb } = require('pdf-lib');
const sharp = require('sharp');
const { createCanvas, DOMMatrix, Path2D, ImageData } = require('@napi-rs/canvas');
const { displayedPdfPageSize, visualPointToPdf } = require('../src/modules/audit/utils/auditPageGeometry');
const { renderImagePreview } = require('../src/modules/audit/utils/auditImagePreview');
const { overlayOnPdfBuffer } = require('../src/modules/audit/utils/signatureOverlay');

async function renderPdfPage(buffer, pageNumber = 1) {
  global.DOMMatrix = global.DOMMatrix || DOMMatrix;
  global.Path2D = global.Path2D || Path2D;
  global.ImageData = global.ImageData || ImageData;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')), '../../standard_fonts')
    .replace(/\\/g, '/') + '/';
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, isEvalSupported: false,
    standardFontDataUrl });
  const document = await task.promise;
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;
  await document.destroy();
  return { canvas, context, width: canvas.width, height: canvas.height };
}

async function main() {
  const source = await PDFDocument.create();
  const landscape = source.addPage([842, 595]);
  landscape.drawRectangle({ x: 20, y: 20, width: 40, height: 40, color: rgb(0, 0, 0) });
  const rotatedRight = source.addPage([842, 595]);
  rotatedRight.setRotation(degrees(90));
  const rotatedLeft = source.addPage([842, 595]);
  rotatedLeft.setRotation(degrees(270));
  const portrait = source.addPage([595, 842]);
  const upsideDown = source.addPage([595, 842]);
  upsideDown.setRotation(degrees(180));
  const sourceBytes = Buffer.from(await source.save());
  const sourceDocument = await PDFDocument.load(sourceBytes);
  const sizes = sourceDocument.getPages().map(displayedPdfPageSize);
  assert.deepEqual(sizes.map(size => [size.width, size.height]), [[842, 595], [595, 842], [595, 842], [595, 842], [595, 842]]);
  assert.deepEqual(visualPointToPdf(sourceDocument.getPage(1), 0.25, 0.2), {
    x: 0.2 * 842, y: 0.25 * 595, frame: sizes[1]
  });

  const red = await sharp({ create: { width: 80, height: 20, channels: 4,
    background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const redData = 'data:image/png;base64,' + red.toString('base64');
  const signatures = [2, 3, 5].map(page => ({
    imageData: redData, page, positionX: 0.25, positionY: 0.3,
    widthRatio: 80 / 595, size: 1, rotation: 0
  }));
  const signed = await overlayOnPdfBuffer(sourceBytes, signatures);
  const signedDocument = await PDFDocument.load(signed);
  assert.equal(signedDocument.getPage(1).getRotation().angle, 90);
  assert.equal(signedDocument.getPage(2).getRotation().angle, 270);
  for (const page of [2, 3, 5]) {
    const rendered = await renderPdfPage(signed, page);
    const pixels = rendered.context.getImageData(0, 0, rendered.width, rendered.height).data;
    let left = rendered.width, right = -1, top = rendered.height, bottom = -1, count = 0;
    for (let y = 0; y < rendered.height; y += 1) {
      for (let x = 0; x < rendered.width; x += 1) {
        const index = (y * rendered.width + x) * 4;
        if (pixels[index] > 180 && pixels[index + 1] < 90 && pixels[index + 2] < 90 && pixels[index + 3] > 180) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y); count += 1;
        }
      }
    }
    assert(count > 400, '旋转页面上的签名必须实际可见');
    const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
    assert(Math.abs(centerX - rendered.width * 0.25) < 4, '旋转页面落点横向不能偏移');
    assert(Math.abs(centerY - rendered.height * 0.3) < 4, '旋转页面落点纵向不能偏移');
    assert((right - left + 1) / (bottom - top + 1) > 3.4, '反向旋转后的签名不能被压扁');
  }

  const photoSvg = '<svg width="160" height="80"><rect width="80" height="80" fill="red"/><rect x="80" width="80" height="80" fill="blue"/></svg>';
  const orientedJpeg = await sharp({ create: { width: 160, height: 80, channels: 3, background: '#ffffff' } })
    .composite([{ input: Buffer.from(photoSvg), left: 0, top: 0 }])
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rawMetadata = await sharp(orientedJpeg).metadata();
  assert.equal(rawMetadata.orientation, 6);
  const imagePreview = await renderImagePreview(orientedJpeg, 4096, 'webp');
  assert.deepEqual([imagePreview.width, imagePreview.height], [80, 160], 'EXIF 方向必须反映到真实预览宽高');
  assert.equal((await sharp(imagePreview.buffer).metadata()).orientation, undefined);

  const long = await PDFDocument.create();
  for (let index = 0; index < 100; index += 1) {
    const page = long.addPage(index % 3 === 0 ? [842, 595] : [595, 842]);
    if (index % 5 === 0) page.setRotation(degrees(90));
    page.drawText(String(index + 1), { x: 40, y: 40, size: 18, color: rgb(0, 0, 0) });
  }
  const longBytes = Buffer.from(await long.save());
  const lastPage = await renderPdfPage(longBytes, 100);
  assert.equal(lastPage.width, 842);
  assert.equal(lastPage.height, 595);
  console.log('PASS 签署页面几何：横版、竖版、90/180/270 度旋转 PDF、100 页 PDF 与 EXIF 照片');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
