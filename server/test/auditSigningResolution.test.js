'use strict';
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const ink = require('../../shared/auditInk');

// 读取真实栅格像素，避免仅检查 DPR 变量存在而放过二次位图放大。
for (const ratio of [1, 2, 3]) {
  for (const zoom of [1, 4, 16]) {
    const size = ink.surfaceSize(360, 480, ratio);
    const canvas = createCanvas(size.width, size.height), ctx = canvas.getContext('2d');
    const camera = ink.fitCamera(360, 480, 600, 800, zoom);
    const measured = [];
    for (const pixels of [1, 2, 3.5]) {
      const history = ink.createHistory();
      const pen = ink.penWidthRatio(pixels, { width: 600, height: 800, pdf: true });
      ink.appendOperation(history, { type: 'draw', page: 1, color: '#000000', width: pen,
        points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }] });
      ink.renderViewportInk(ctx, history, 1, size.width, size.height, camera, ratio);
      const column = ctx.getImageData(Math.floor(size.width / 2), 0, 1, size.height).data;
      let coverage = 0;
      for (let i = 3; i < column.length; i += 4) coverage += column[i] / 255;
      assert(Math.abs(coverage / ratio - pen * camera.width) < 0.55, '缩放只改变显示像素，不能反向缩细文件中的笔宽');
      measured.push(coverage);
      const center = ctx.getImageData(Math.floor(size.width / 2), Math.floor(size.height / 2), 1, 1).data;
      assert.deepEqual(Array.from(center.slice(0, 3)), [0, 0, 0]);
      const point = ink.filePoint(30 + camera.left + camera.width * 0.6, 40 + camera.top + camera.height * 0.4, { left: 30, top: 40 }, camera);
      assert(Math.abs(point.x - 0.6) < 1e-10 && Math.abs(point.y - 0.4) < 1e-10, '触点不能重复乘 DPR');
    }
    assert(measured[1] > measured[0] * 1.4 && measured[2] > measured[1] * 1.4, '三档实际像素粗细必须可区分');
  }
}
const size = ink.exportSize(595, 842);
const cleared = ink.createHistory(), clearedCanvas = createCanvas(360, 480);
ink.appendOperation(cleared, { type: 'draw', page: 1, color: '#000000', width: 0.03,
  points: [{ x: 0.1, y: 1 }, { x: 0.9, y: 1 }] });
ink.appendOperation(cleared, { type: 'clear', page: 1 });
ink.renderViewportInk(clearedCanvas.getContext('2d'), cleared, 1, 360, 480, ink.fitCamera(360, 480, 800, 400, 1), 1);
assert.equal(ink.alphaBounds(clearedCanvas.getContext('2d').getImageData(0, 0, 360, 480).data, 360, 480), null,
  '清空必须移除越过纸张边缘的圆头笔迹，不能留下边缘残线');
assert.equal(size.height, 4096);
assert(size.width > 2800, '导出不得沿用手机上三百多像素的缩略图');
assert(Math.abs(size.width / size.height - 595 / 842) < 0.001);
console.log('高清签署像素测试通过：3 档 DPR × 3 档缩放 × 3 档笔宽，纯黑与坐标保持一致');
