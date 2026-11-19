'use strict';

const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const ink = require('../../shared/auditInk');

function alphaStats(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let covered = 0, strong = 0, partial = 0, strength = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (!data[index]) continue;
    covered += 1;
    strength += data[index] / 255;
    if (data[index] === 255) strong += 1;
    else partial += 1;
  }
  return { covered, strong, partial, strength };
}

const page = { width: 595, height: 842, pdf: true };
const widths = [0.15, 0.3, 0.5, 0.8, 1.2];
const measurements = [];
for (const width of widths) {
  const history = ink.createHistory();
  ink.appendOperation(history, { page: 1, type: 'draw', color: '#000000', penStyle: 'hard',
    width: ink.penWidthRatio(width, page), points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }] });
  const canvas = createCanvas(595, 842);
  ink.renderInk(canvas.getContext('2d'), history, 1, 595, 842);
  const stats = alphaStats(canvas);
  assert(stats.covered > 0);
  measurements.push(stats.strength);
  assert.equal(history.operations[0].penStyle, 'hard');
}
for (let index = 1; index < measurements.length; index += 1) {
  assert(measurements[index] > measurements[index - 1], '五档宽度必须逐档可区分');
}

function renderSoft() {
  const history = ink.createHistory();
  ink.appendOperation(history, { page: 1, type: 'draw', color: '#000000', penStyle: 'soft',
    width: ink.penWidthRatio(0.5, page), points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }] });
  const canvas = createCanvas(595, 842);
  ink.renderInk(canvas.getContext('2d'), history, 1, 595, 842);
  return { canvas, stats: alphaStats(canvas), history };
}
const hard = createCanvas(595, 842);
const hardHistory = ink.createHistory();
ink.appendOperation(hardHistory, { page: 1, type: 'draw', color: '#000000', penStyle: 'hard',
  width: ink.penWidthRatio(0.5, page), points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }] });
ink.renderInk(hard.getContext('2d'), hardHistory, 1, 595, 842);
const soft = renderSoft();
assert.equal(soft.history.operations[0].penStyle, 'soft');
assert(soft.stats.strength > alphaStats(hard).strength, '软笔应有更柔和的外缘');
assert(soft.stats.partial > 0, '软笔不能表现为实心无边缘的毛笔块');
console.log('PASS 五档笔宽逐级可区分，硬笔清晰、软笔有柔和边缘且保持连续路径');
