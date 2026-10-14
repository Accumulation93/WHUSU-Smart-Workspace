'use strict';
// 文件几何使用原文件单位。预览、图片与 PDF 在各自边界只投影一次。
function signatureGeometry(material, pageWidth, pageHeight, imageWidth, imageHeight, pdf) {
  const size = Math.max(0.5, Math.min(2.2, Number(material.size) || 1));
  const ratio = imageHeight / imageWidth;
  const rotation = (Number(material.rotation) || 0) * Math.PI / 180;
  const explicit = material.widthRatio != null;
  let width = explicit ? Number(material.widthRatio) * pageWidth
    : Math.max(48, Math.min(pageWidth * 0.18 * size, pageWidth * 0.55, pdf ? 300 : 520));
  if (!explicit && !pdf) width = Math.min(width, imageWidth);
  let height = width * ratio;
  const factorX = Math.abs(Math.cos(rotation)) + ratio * Math.abs(Math.sin(rotation));
  const factorY = Math.abs(Math.sin(rotation)) + ratio * Math.abs(Math.cos(rotation));
  const shrink = Math.min(1, pageWidth / (width * factorX), pageHeight / (width * factorY));
  width *= shrink; height *= shrink;
  const rotatedWidth = width * factorX, rotatedHeight = width * factorY;
  const centerX = Math.max(rotatedWidth / 2, Math.min(pageWidth - rotatedWidth / 2, material.positionX * pageWidth));
  const centerY = Math.max(rotatedHeight / 2, Math.min(pageHeight - rotatedHeight / 2, material.positionY * pageHeight));
  return { width, height, rotatedWidth, rotatedHeight, centerX, centerY,
    left: centerX - rotatedWidth / 2, top: centerY - rotatedHeight / 2 };
}
module.exports = { signatureGeometry };
