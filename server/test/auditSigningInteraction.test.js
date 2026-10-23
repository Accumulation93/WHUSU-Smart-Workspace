'use strict';
const assert = require('node:assert/strict');
const ink = require('../../shared/auditInk');
// 双指以手指中点为锚，不以窗口中心放大导致落点漂移。
const rect = { left: 24, top: 130, width: 350, height: 420 };
const gesture = { zoom: 2, panX: 45, panY: -20, midX: 120, midY: 320 };
const original = ink.fitCamera(rect.width, rect.height, 800, 1000, gesture.zoom, gesture.panX, gesture.panY);
const point = ink.filePoint(gesture.midX, gesture.midY, rect, original);
for (const zoom of [1, 4, 8, 16]) {
  const pan = ink.pinchPan(rect, gesture, zoom, 150, 300);
  const camera = ink.fitCamera(rect.width, rect.height, 800, 1000, zoom, pan.x, pan.y);
  const after = ink.filePoint(150, 300, rect, camera);
  assert(Math.abs(after.x - point.x) < 1e-12);
  assert(Math.abs(after.y - point.y) < 1e-12);
  assert.equal(camera.scale / camera.fit, zoom);
}
assert.equal(ink.fitCamera(350, 420, 800, 1000, 50).scale / original.fit, 16);
const history = ink.createHistory();
const stroke = { type: 'draw', page: 1, layerId: 'entry', width: .002, points: [{ x: .2, y: .2 }, { x: .3, y: .3 }] };
ink.appendOperation(history, { ...stroke, color: '#000000' });
ink.appendOperation(history, { ...stroke, color: '#ff0000' });
ink.appendOperation(history, { ...stroke, page: 2, color: '#0000ff' });
assert(ink.recolorLayer(history, [], 1, 'entry', '#12abcd'));
assert.deepEqual(history.operations.slice(0, 3).map(row => row.color), ['#12abcd', '#12abcd', '#0000ff']);
ink.undo(history, []);
assert.deepEqual(history.operations.slice(0, 3).map(row => row.color), ['#000000', '#ff0000', '#0000ff']);
ink.redo(history, []);
assert.equal(history.operations[1].color, '#12abcd');
ink.undo(history, []);
ink.appendOperation(history, { ...stroke, color: '#000000' });
assert.equal(ink.redo(history, []), null);
assert.equal(history.operations[1].color, '#ff0000');
console.log('PASS 16倍缩放、双指锚点、整层改色、多色撤销及跨页隔离');
