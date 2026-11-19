'use strict';

const sharp = require('sharp');

// 手机照片的 EXIF 方向必须先进入像素坐标；否则预览宽高与 Canvas 实际绘制方向相反。
async function renderImagePreview(buffer, edge, format) {
  const normalizedEdge = Number.isFinite(Number(edge)) ? Math.max(1024, Math.min(4096, Number(edge))) : 4096;
  const requestedFormat = format === 'png' ? 'png' : 'webp';
  let image = sharp(buffer).autoOrient()
    .resize({ width: normalizedEdge, height: normalizedEdge, fit: 'inside', withoutEnlargement: true });
  image = requestedFormat === 'webp' ? image.webp({ lossless: true, effort: 1 }) : image.png();
  const rendered = await image.toBuffer({ resolveWithObject: true });
  return { buffer: rendered.data, width: rendered.info.width, height: rendered.info.height, format: requestedFormat };
}

module.exports = { renderImagePreview };
