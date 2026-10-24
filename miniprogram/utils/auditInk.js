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
    layerId: operation.layerId || 'stroke_' + order, layerOrder: (history.operations.find(item => item.type === 'draw' && item.layerId === operation.layerId && item.page === (Number(operation.page) || 1)) || {}).layerOrder || order,
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
  const groups = new Map(), numbers = new Map();
  history.operations.forEach(item => { if (item.type === 'draw' && !numbers.has(item.layerId)) numbers.set(item.layerId, numbers.size + 1); });
  history.operations.slice(start, history.cursor).forEach((operation, index) => {
    if (operation.type !== 'draw' || operation.page !== page || operation.hidden) return;
    if (!operation.layerId) operation.layerId = 'legacy_stroke_' + (start + index);
    let group = groups.get(operation.layerId);
    if (!group) {
      group = { id: operation.layerId, kind: 'draw', order: operation.layerOrder == null ? (materials || []).length + index : operation.layerOrder,
        operation, number: numbers.get(operation.layerId), index: start + index, strokes: [] };
      groups.set(operation.layerId, group); result.push(group);
    }
    group.strokes.push(operation);
  });
  return result.sort((a, b) => a.order - b.order);
}
// 编辑只记录发生变化的字段；移动一次不复制整个笔迹历史或图片。
function applyEdit(history, materials, operation, forward) {
  operation.changes.forEach(change => {
    const value = forward ? change.after : change.before;
    if (change.kind === 'ink') {
      const indices = change.indices ? new Set(change.indices) : null;
      history.operations.forEach((item, index) => { if (item.type === 'draw' && item.layerId === change.id && item.page === operation.page && (!indices || indices.has(index))) Object.assign(item, value); });
    } else {
      const index = materials.findIndex(item => item._idx === change.id);
      if (value === null) { if (index >= 0) materials.splice(index, 1); }
      else if (index < 0) materials.push(clone(value));
      else Object.assign(materials[index], clone(value));
    }
  });
}
function edit(history, materials, page, changes) {
  if (!changes.length) return false;
  history.operations.splice(history.cursor);
  // 固定本次编辑已有的笔画，重做不能误改同一次进入后续新增的笔画。
  changes.forEach(change => {
    if (change.kind === 'ink' && !change.indices) change.indices = history.operations.reduce((indices, item, index) => {
      if (item.type === 'draw' && item.layerId === change.id && item.page === page) indices.push(index);
      return indices;
    }, []);
  });
  const operation = { type: 'edit', page, changes };
  applyEdit(history, materials, operation, true);
  history.operations.push(operation); history.cursor = history.operations.length;
  return true;
}
function updateMaterial(history, materials, id, values, page) {
  const item = materials.find(row => row._idx === id); if (!item) return false;
  const before = {}, after = {};
  Object.keys(values).forEach(key => { if (item[key] !== values[key]) { before[key] = item[key] == null ? null : item[key]; after[key] = values[key]; } });
  return edit(history, materials, page || item.page || 1, Object.keys(after).length ? [{ kind: 'material', id, before, after }] : []);
}
function addMaterial(history, materials, item) {
  if (item.layerOrder == null) item.layerOrder = nextLayerOrder();
  return edit(history, materials, item.page || 1, [{ kind: 'material', id: item._idx, before: null, after: clone(item) }]);
}
function deleteLayer(history, materials, page, id) {
  const layer = signingLayers(history, materials, page).find(item => item.id === id);
  if (!layer) return false;
  return edit(history, materials, page, [layer.kind === 'material'
    ? { kind: 'material', id, before: clone(layer.material), after: null }
    : { kind: 'ink', id, before: { hidden: false }, after: { hidden: true } }]);
}
function moveLayer(history, materials, page, id, direction) {
  const layers = signingLayers(history, materials, page), index = layers.findIndex(layer => layer.id === id), target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return false;
  const first = layers[index], second = layers[target];
  return edit(history, materials, page, [first, second].map((layer, offset) => ({
    kind: layer.kind === 'draw' ? 'ink' : 'material', id: layer.id,
    before: { layerOrder: layer.order }, after: { layerOrder: offset ? first.order : second.order }
  })));
}
function recolorLayer(history, materials, page, id, value) {
  const color = normalizeColor(value), layer = signingLayers(history, materials, page).find(item => item.id === id);
  if (!layer || layer.kind !== 'draw') return false;
  const changes = [];
  history.operations.slice(0, history.cursor).forEach((operation, index) => {
    if (operation.type === 'draw' && operation.layerId === id && operation.page === page && operation.color !== color) {
      changes.push({ kind: 'ink', id, indices: [index], before: { color: operation.color }, after: { color } });
    }
  });
  return edit(history, materials, page, changes);
}
function renderStrokeLayer(context, history, layer, width, height, active) {
  const strokes = new Set(layer.strokes || [layer.operation]);
  for (let i = layer.index; i < history.cursor; i += 1) {
    const operation = history.operations[i];
    if (strokes.has(operation) || operation.type === 'erase' && operation.page === layer.operation.page) drawPath(context, operation, width, height);
  }
  if (active && active.page === layer.operation.page && (active.type === 'erase' || active.layerId === layer.id)) drawPath(context, active, width, height);
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
// 一次进入形成一个手写图层；逐笔撤销保留，导出不跨图层合并。
function inkExportGroups(history, materials, page) {
  const groups = []; let current = null;
  signingLayers(history, materials, page).forEach(layer => {
    if (layer.kind !== 'draw') { current = null; return; }
    if (!current || current.id !== layer.id) { current = { id: layer.id, order: layer.order, layers: [] }; groups.push(current); }
    current.layers.push(layer);
  });
  return groups;
}
function groupExportRegion(group, width, height) {
  const regions = group.layers.flatMap(layer => (layer.strokes || [layer.operation]).map(operation => strokeExportRegion(operation, width, height)));
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
function undo(history, materials) {
  if (!history.cursor) return null;
  history.cursor -= 1;
  const operation = history.operations[history.cursor];
  if (operation.type === 'edit') applyEdit(history, materials || [], operation, false);
  return operation.page;
}
function redo(history, materials) {
  if (history.cursor >= history.operations.length) return null;
  const operation = history.operations[history.cursor++];
  if (operation.type === 'edit') applyEdit(history, materials || [], operation, true);
  return operation.page;
}
function drawPath(context, operation, width, height) {
  const points = operation.points;
  if (!points || !points.length || operation.hidden) return;
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
    // 一条连续路径穿过实际采样点；控制点限制在本段包围盒内，转折不被抹平或过冲。
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1], b = points[index];
      const previous = points[Math.max(0, index - 2)], next = points[Math.min(points.length - 1, index + 1)];
      const lowX = Math.min(a.x, b.x), highX = Math.max(a.x, b.x), lowY = Math.min(a.y, b.y), highY = Math.max(a.y, b.y);
      context.bezierCurveTo(clamp(a.x + (b.x - previous.x) / 6, lowX, highX) * width,
        clamp(a.y + (b.y - previous.y) / 6, lowY, highY) * height,
        clamp(b.x - (next.x - a.x) / 6, lowX, highX) * width,
        clamp(b.y - (next.y - a.y) / 6, lowY, highY) * height, b.x * width, b.y * height);
    }
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
// 笔宽属于文件，不属于相机。图片没有可靠纸张单位，统一把短边映射为 210mm。
// 空白板是放大的 40mm 签名工作区，导出裁边后仍保留原物理比例。
function pageWidthMm(page) {
  if (page.pad) return 40;
  if (!(Number.isFinite(page.width) && page.width > 0 && Number.isFinite(page.height) && page.height > 0)) throw new Error('page_size_invalid');
  return page.pdf ? page.width * 25.4 / 72 : 210 * page.width / Math.min(page.width, page.height);
}
function penWidthRatio(preset, page) {
  const millimeters = preset === 1 ? 0.3 : preset === 3.5 ? 0.8 : 0.5;
  return millimeters / pageWidthMm(page);
}

// PNG 私有辅助块只携带签名尺寸，不改像素或文件正文。固定头读取避免解码整张图片。
// wsIG：辅助、私有、保留位大写、修改像素后须显式重建；遵循 PNG 5.4/5.7。
const PNG_PREFIX = 'data:image/png;base64,';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function signaturePngHeader(imageData) {
  if (typeof imageData !== 'string' || !imageData.startsWith(PNG_PREFIX)) return null;
  const source = imageData.slice(PNG_PREFIX.length, PNG_PREFIX.length + 72), bytes = [];
  let bits = 0, value = 0;
  for (const character of source) {
    const digit = BASE64.indexOf(character); if (digit < 0) return null;
    value = (value << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  if (bytes.length < 54 || bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10'
    || uint32(bytes, 8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  return bytes;
}
function uint32(bytes, offset) { return (bytes[offset] * 16777216 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0; }
function putUint32(bytes, offset, value) { for (let i = 0; i < 4; i += 1) bytes[offset + i] = (value >>> (24 - i * 8)) & 255; }
function pngCrc(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function signatureWidthMm(imageData) {
  const bytes = signaturePngHeader(imageData);
  if (!bytes || uint32(bytes, 33) !== 9 || String.fromCharCode(...bytes.slice(37, 41)) !== 'wsIG' || bytes[41] !== 1
    || pngCrc(bytes.slice(37, 50)) !== uint32(bytes, 50)) return null;
  const width = uint32(bytes, 42) / 1000;
  if (uint32(bytes, 46) !== uint32(bytes, 16) || !(width > 0 && width <= 500)) return null;
  return width;
}
function withSignatureWidth(imageData, widthMm) {
  const bytes = signaturePngHeader(imageData);
  if (!bytes || !(widthMm > 0 && widthMm <= 500)) throw new Error('signature_scale_invalid');
  const chunk = [0, 0, 0, 9, 119, 115, 73, 71, 1];
  putUint32(chunk, 9, Math.max(1, Math.round(widthMm * 1000)));
  putUint32(chunk, 13, uint32(bytes, 16)); putUint32(chunk, 17, pngCrc(chunk.slice(4, 17)));
  let encoded = '';
  for (let i = 0; i < chunk.length; i += 3) {
    const value = (chunk[i] << 16) | (chunk[i + 1] << 8) | chunk[i + 2];
    encoded += BASE64[(value >>> 18) & 63] + BASE64[(value >>> 12) & 63] + BASE64[(value >>> 6) & 63] + BASE64[value & 63];
  }
  const offset = PNG_PREFIX.length + 44;
  const existing = uint32(bytes, 33) === 9 && String.fromCharCode(...bytes.slice(37, 41)) === 'wsIG';
  return imageData.slice(0, offset) + encoded + imageData.slice(offset + (existing ? 28 : 0));
}
function signatureWidthRatio(imageData, page, size) {
  const millimeters = signatureWidthMm(imageData);
  return millimeters === null ? null : Math.min(1, millimeters * clamp(size || 1, 0.5, 2.2) / pageWidthMm(page));
}
// 未打开定位页也必须先确定新签名的文件比例；所有尺寸准备成功后才更新草稿。
async function prepareSignatureWidths(materials, files, loadPreview) {
  const pages = new Map(), changes = [];
  for (const item of materials) {
    if (item.signatureType !== 'signature' || item.widthRatio != null || signatureWidthMm(item.imageData) === null) continue;
    const file = files.find(row => row.id === item.fileId); if (!file) throw new Error('signature_file_missing');
    const page = item.page || 1, key = file.id + ':' + page;
    if (!pages.has(key)) pages.set(key, await loadPreview(file, page));
    const preview = pages.get(key), response = preview.response;
    const dimensions = { width: response.pageWidth || preview.image.width, height: response.pageHeight || preview.image.height, pdf: file.mimeType === 'application/pdf' };
    changes.push({ item, widthRatio: signatureWidthRatio(item.imageData, dimensions, item.size) });
  }
  changes.forEach(change => { change.item.widthRatio = change.widthRatio; });
}
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
  const scale = fit * clamp(zoom || 1, 1, 16);
  return { scale, fit, width: imageWidth * scale, height: imageHeight * scale,
    left: (viewWidth - imageWidth * scale) / 2 + (panX || 0),
    top: (viewHeight - imageHeight * scale) / 2 + (panY || 0) };
}
function filePoint(clientX, clientY, rect, camera) {
  const x = (clientX - rect.left - camera.left) / camera.width;
  const y = (clientY - rect.top - camera.top) / camera.height;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}
function pinchPan(rect, gesture, zoom, clientX, clientY) {
  const factor = zoom / gesture.zoom;
  const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
  return { x: clientX - centerX - (gesture.midX - centerX - gesture.panX) * factor,
    y: clientY - centerY - (gesture.midY - centerY - gesture.panY) * factor };
}
// 首笔前跟随真实视口，避免横屏动画前的竖屏测量锁死纸张；有历史（含可重做）后固定比例。
function blankPageSize(fileDraft, viewport) {
  const hasHistory = fileDraft.history && fileDraft.history.operations.length > 0;
  if (hasHistory && fileDraft.blankDimensions) return fileDraft.blankDimensions;
  const width = Number(viewport && viewport.width), height = Number(viewport && viewport.height);
  if (!hasHistory && (!(width > 0) || !(height > 0))) throw new Error('blank_viewport_unavailable');
  fileDraft.blankDimensions = hasHistory ? { width: 800, height: 400 } : { width, height };
  return fileDraft.blankDimensions;
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
module.exports = { prepareSignatureWidths, pageWidthMm, signatureWidthMm, withSignatureWidth, signatureWidthRatio, blankPageSize, clone, clamp, normalizeColor, createHistory, appendOperation, undo, redo, drawPath, renderInk, renderViewportInk, surfaceSize, exportSize, penWidthRatio, alphaBounds, fitCamera, filePoint, pinchPan, createDraftStore, addMaterial, updateMaterial, deleteLayer, nextLayerOrder, signingLayers, moveLayer, recolorLayer, renderStrokeLayer, renderViewportLayer, strokeExportRegion, inkExportGroups, groupExportRegion, renderExportGroup };
