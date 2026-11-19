'use strict';

// PDF 的 /Rotate 和页面原始宽高属于两套坐标。预览、落点与最终盖章必须共享同一映射。
function normalizedRotation(value) {
  const angle = Number(value) || 0;
  return ((angle % 360) + 360) % 360;
}

function displayedPdfPageSize(page) {
  // PDF 阅读器按 CropBox 显示；用 MediaBox 会让带裁切边的扫描件再次拉伸。
  const crop = page.getCropBox ? page.getCropBox() : Object.assign({ x: 0, y: 0 }, page.getSize());
  const rotation = normalizedRotation(page.getRotation && page.getRotation().angle);
  return rotation % 180 === 90
    ? { width: crop.height, height: crop.width, rawWidth: crop.width, rawHeight: crop.height, offsetX: crop.x, offsetY: crop.y, rotation }
    : { width: crop.width, height: crop.height, rawWidth: crop.width, rawHeight: crop.height, offsetX: crop.x, offsetY: crop.y, rotation };
}

// 输入是用户在预览中看到的 0..1 坐标，左下原点为 PDF 原始坐标。
function visualPointToPdf(page, positionX, positionY) {
  const frame = displayedPdfPageSize(page);
  const x = Math.max(0, Math.min(1, Number(positionX) || 0));
  const y = Math.max(0, Math.min(1, Number(positionY) || 0));
  if (frame.rotation === 90) return { x: frame.offsetX + y * frame.rawWidth, y: frame.offsetY + x * frame.rawHeight, frame };
  if (frame.rotation === 180) return { x: frame.offsetX + (1 - x) * frame.rawWidth, y: frame.offsetY + y * frame.rawHeight, frame };
  if (frame.rotation === 270) return { x: frame.offsetX + (1 - y) * frame.rawWidth, y: frame.offsetY + (1 - x) * frame.rawHeight, frame };
  return { x: frame.offsetX + x * frame.rawWidth, y: frame.offsetY + (1 - y) * frame.rawHeight, frame };
}

// drawImage 会围绕 x/y 旋转后再缩放。先反向旋转图片，再交给页面 /Rotate 显示。
function uprightImageOptions(page, box) {
  const center = visualPointToPdf(page, box.centerX / box.frameWidth, box.centerY / box.frameHeight);
  const angle = -center.frame.rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: center.x - (cosine * box.width / 2 - sine * box.height / 2),
    y: center.y - (sine * box.width / 2 + cosine * box.height / 2),
    width: box.width,
    height: box.height,
    rotation: center.frame.rotation
  };
}

module.exports = { normalizedRotation, displayedPdfPageSize, visualPointToPdf, uprightImageOptions };
