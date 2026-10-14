'use strict';

// 连续路径与步骤草稿的唯一源。坐标是文件页内比例，视口触点只在采集边界转换一次。
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function clamp(value, low, high) { return Math.max(low, Math.min(high, Number(value))); }
function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#000000';
}
function createHistory() { return { operations: [], cursor: 0 }; }
let layerSequence = 0;
function nextLayerOrder() { layerSequence = Math.max(Date.now() * 1000, layerSequence + 1); return layerSequence; }
function appendOperation(history, operation) {
  if (operation && operation.type === 'clear') {
    history.operations.splice(history.cursor);
    history.operations.push({ page: Math.max(1, Number(operation.page) || 1), type: 'clear' });
    history.cursor = history.operations.length;
    return true;
  }
  if (!operation || !Array.isArray(operation.points) || !operation.points.length) return false;
  const points = operation.points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }));
  if (!points.length || !Number.isFinite(operation.width) || operation.width <= 0) return false;
  history.operations.splice(history.cursor);
  const order = nextLayerOrder();
  history.operations.push({ page: Math.max(1, Number(operation.page) || 1),
    layerId: 'stroke_' + order, layerOrder: order,
    type: operation.type === 'erase' ? 'erase' : 'draw', color: normalizeColor(operation.color),
    width: operation.width, points });
  history.cursor = history.operations.length;
  return true;
}
// 图层按创建先后排列。橡皮擦只作用于该手势之前的笔迹，不作用于印章或正文。
function signingLayers(history, materials, page) {
  let start = 0;
  for (let i = history.cursor - 1; i >= 0; i -= 1) if (history.operations[i].type === 'clear') { start = i + 1; break; }
  const result = (materials || []).filter(item => (item.page || 1) === page).map((item, index) => ({
    id: item._idx, kind: 'material', order: item.layerOrder == null ? index : item.layerOrder, material: item
  }));
  history.operations.slice(start, history.cursor).forEach((operation, index) => {
    if (operation.type !== 'draw' || operation.page !== page) return;
    if (!operation.layerId) operation.layerId = 'legacy_stroke_' + (start + index);
    result.push({ id: operation.layerId, kind: 'draw', order: operation.layerOrder == null ? (materials || []).length + index : operation.layerOrder,
      operation, index: start + index });
  });
  return result.sort((a, b) => a.order - b.order);
}
function moveLayer(history, materials, page, id, direction) {
  const layers = signingLayers(history, materials, page), index = layers.findIndex(layer => layer.id === id), target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return false;
  const value = layers[index]; layers[index] = layers[target]; layers[target] = value;
  const base = nextLayerOrder();
  layers.forEach((layer, offset) => { (layer.material || layer.operation).layerOrder = base + offset; });
  layerSequence = base + layers.length;
  return true;
}
function renderStrokeLayer(context, history, layer, width, height, active) {
  drawPath(context, layer.operation, width, height);
  for (let i = layer.index + 1; i < history.cursor; i += 1) {
    const operation = history.operations[i];
    if (operation.type === 'erase' && operation.page === layer.operation.page) drawPath(context, operation, width, height);
  }
  if (active && active.type === 'erase' && active.page === layer.operation.page) drawPath(context, active, width, height);
}
function renderViewportLayer(context, history, layer, width, height, camera, ratio, active) {
  context.clearRect(0, 0, width, height);
  context.save(); context.scale(ratio, ratio); context.translate(camera.left, camera.top);
  renderStrokeLayer(context, history, layer, camera.width, camera.height, active);
  context.restore();
}
// 单笔导出只分配实际包围区域，避免每笔重复扫描整张 4096px 页面。
function strokeExportRegion(operation, width, height) {
  const margin = operation.width * width / 2 + 2;
  let left = width, top = height, right = 0, bottom = 0;
  operation.points.forEach(point => { left = Math.min(left, point.x * width); right = Math.max(right, point.x * width); top = Math.min(top, point.y * height); bottom = Math.max(bottom, point.y * height); });
  left = Math.max(0, Math.floor(left - margin)); top = Math.max(0, Math.floor(top - margin));
  right = Math.min(width, Math.ceil(right + margin)); bottom = Math.min(height, Math.ceil(bottom + margin));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}
// 编辑保留逐笔图层；提交只合并相邻笔迹，绝不跨过印章改变遮挡顺序。
function inkExportGroups(history, materials, page) {
  const groups = []; let current = null;
  signingLayers(history, materials, page).forEach(layer => {
    if (layer.kind !== 'draw') { current = null; return; }
    if (!current) { current = { id: layer.id, order: layer.order, layers: [] }; groups.push(current); }
    current.layers.push(layer);
  });
  return groups;
}
function groupExportRegion(group, width, height) {
  const regions = group.layers.map(layer => strokeExportRegion(layer.operation, width, height));
  const left = Math.min(...regions.map(item => item.left)), top = Math.min(...regions.map(item => item.top));
  return { left, top, width: Math.max(...regions.map(item => item.left + item.width)) - left,
    height: Math.max(...regions.map(item => item.top + item.height)) - top };
}
function renderExportGroup(context, scratch, history, group, width, height, region) {
  scratch.width = region.width; scratch.height = region.height;
  const layerContext = scratch.getContext('2d');
  group.layers.forEach(layer => {
    layerContext.clearRect(0, 0, region.width, region.height);
    layerContext.save(); layerContext.translate(-region.left, -region.top);
    renderStrokeLayer(layerContext, history, layer, width, height); layerContext.restore();
    context.drawImage(scratch, 0, 0);
  });
}
function undo(history) {
  if (!history.cursor) return null;
  history.cursor -= 1;
  return history.operations[history.cursor].page;
}
function redo(history) {
  if (history.cursor >= history.operations.length) return null;
  return history.operations[history.cursor++].page;
}
function drawPath(context, operation, width, height) {
  const points = operation.points;
  if (!points.length) return;
  context.save();
  context.globalCompositeOperation = operation.type === 'erase' ? 'destination-out' : 'source-over';
  context.globalAlpha = 1;
  context.strokeStyle = operation.color;
  context.fillStyle = operation.color;
  context.lineWidth = operation.width * width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0].x * width, points[0].y * height, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.moveTo(points[0].x * width, points[0].y * height);
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index], next = points[index + 1];
      context.quadraticCurveTo(current.x * width, current.y * height,
        (current.x + next.x) * width / 2, (current.y + next.y) * height / 2);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x * width, last.y * height);
    context.stroke();
  }
  context.restore();
}
function renderInk(context, history, page, width, height, active) {
  context.clearRect(0, 0, width, height);
  let start = 0;
  for (let index = history.cursor - 1; index >= 0; index -= 1) {
    if (history.operations[index].type === 'clear') { start = index + 1; break; }
  }
  history.operations.slice(start, history.cursor).forEach(operation => {
    if (operation.page === page) drawPath(context, operation, width, height);
  });
  if (active && active.page === page) drawPath(context, active, width, height);
}
// 屏幕像素密度只用于画布采样；相机和触点始终使用 CSS 像素。
function surfaceSize(width, height, pixelRatio) {
  const ratio = Math.max(1, Number(pixelRatio) || 1);
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), ratio };
}
function exportSize(width, height) {
  const scale = 4096 / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
function penWidthRatio(pixels, camera) { return pixels / camera.width; }
// 在视口大小的透明层上直接重画路径，放大时不拉伸低清笔迹位图。
function renderViewportInk(context, history, page, width, height, camera, ratio, active) {
  context.clearRect(0, 0, width, height);
  context.save();
  context.scale(ratio, ratio);
  context.translate(camera.left, camera.top);
  renderInk(context, history, page, camera.width, camera.height, active);
  context.restore();
}
function alphaBounds(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!data[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}
function fitCamera(viewWidth, viewHeight, imageWidth, imageHeight, zoom, panX, panY) {
  const fit = Math.min(viewWidth / imageWidth, viewHeight / imageHeight);
  const scale = fit * clamp(zoom || 1, 1, 4);
  return { scale, fit, width: imageWidth * scale, height: imageHeight * scale,
    left: (viewWidth - imageWidth * scale) / 2 + (panX || 0),
    top: (viewHeight - imageHeight * scale) / 2 + (panY || 0) };
}
function filePoint(clientX, clientY, rect, camera) {
  const x = (clientX - rect.left - camera.left) / camera.width;
  const y = (clientY - rect.top - camera.top) / camera.height;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}
function createDraftStore() {
  let scope = '', drafts = new Map();
  function reset() { scope = ''; drafts.clear(); }
  function bind(next) { if (scope !== next) { reset(); scope = next; } }
  function open(key) {
    if (!scope || !key) throw new Error('draft_scope_required');
    if (!drafts.has(key)) drafts.set(key, { files: {}, materials: [], pendingRead: false, locked: false });
    return drafts.get(key);
  }
  function file(draft, fileId) {
    if (!draft.files[fileId]) draft.files[fileId] = { history: createHistory(), currentPage: 1, exports: [] };
    return draft.files[fileId];
  }
  return { bind, open, file, reset };
}
module.exports = { clone, clamp, normalizeColor, createHistory, appendOperation, undo, redo, drawPath, renderInk, renderViewportInk, surfaceSize, exportSize, penWidthRatio, alphaBounds, fitCamera, filePoint, createDraftStore, nextLayerOrder, signingLayers, moveLayer, renderStrokeLayer, renderViewportLayer, strokeExportRegion, inkExportGroups, groupExportRegion, renderExportGroup };
