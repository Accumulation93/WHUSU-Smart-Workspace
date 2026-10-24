'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ink = require('../../shared/auditInk');
const { signatureGeometry } = require('../../shared/auditSignatureGeometry');

function coverage(context, width, height) {
  const data = context.getImageData(Math.floor(width / 2), 0, 1, height).data;
  let sum = 0; for (let i = 3; i < data.length; i += 4) sum += data[i] / 255;
  return sum;
}
async function run() {
  const pages = [{ width: 595.28, height: 841.89, pdf: true }, { width: 841.89, height: 1190.55, pdf: true },
    { width: 841.89, height: 595.28, pdf: true }, { width: 600, height: 900 }, { width: 2400, height: 3600 }];
  for (const page of pages) {
    for (const [preset, mm] of [[1, 0.3], [2, 0.5], [3.5, 0.8]]) {
      const history = ink.createHistory();
      ink.appendOperation(history, { page: 1, type: 'draw', color: '#000000', width: ink.penWidthRatio(preset, page), points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }] });
      const size = ink.exportSize(page.width, page.height), canvas = createCanvas(size.width, size.height), context = canvas.getContext('2d');
      ink.renderInk(context, history, 1, size.width, size.height);
      const measured = coverage(context, size.width, size.height) * ink.pageWidthMm(page) / size.width;
      assert(Math.abs(measured - mm) < 0.025, 'PDF 原页尺寸与图片分辨率不能改变输出笔宽');
      for (const zoom of [1, 4, 16]) {
        const camera = ink.fitCamera(748, 217, page.width, page.height, zoom);
        assert.equal(ink.penWidthRatio(preset, page), history.operations[0].width);
        assert(Math.abs(history.operations[0].width * camera.width / camera.scale * ink.pageWidthMm(page) / page.width - mm) < 1e-9);
      }
    }
  }
  // 以不同设备实际空白板绘制、裁边、PNG 保存后重新解码，再按真实前端比例放到文件。
  for (const viewport of [{ width: 748, height: 217 }, { width: 1200, height: 640 }]) {
    for (const fraction of [0.25, 0.8]) {
      const history = ink.createHistory(), width = ink.penWidthRatio(2, { ...viewport, pad: true });
      ink.appendOperation(history, { page: 1, type: 'draw', color: '#000000', width, points: [{ x: 0.5 - fraction / 2, y: 0.5 }, { x: 0.5 + fraction / 2, y: 0.5 }] });
      const size = ink.exportSize(viewport.width, viewport.height), canvas = createCanvas(size.width, size.height), context = canvas.getContext('2d');
      ink.renderInk(context, history, 1, size.width, size.height);
      const bounds = ink.alphaBounds(context.getImageData(0, 0, size.width, size.height).data, size.width, size.height);
      const crop = createCanvas(bounds.width, bounds.height); crop.getContext('2d').drawImage(canvas, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      const raw = crop.toDataURL('image/png'), marked = ink.withSignatureWidth(raw, 40 * bounds.width / size.width);
      assert.equal(marked.length, raw.length + 28, '图片只增加 21 字节尺寸说明');
      const image = await loadImage(marked);
      const roundtrip = createCanvas(image.width, image.height); roundtrip.getContext('2d').drawImage(image, 0, 0);
      assert.deepEqual(roundtrip.getContext('2d').getImageData(0, 0, image.width, image.height).data, crop.getContext('2d').getImageData(0, 0, image.width, image.height).data, '私有块不得修改原笔迹像素');
      assert.equal(ink.withSignatureWidth(marked, ink.signatureWidthMm(marked)), marked, '重复写入不累计数据块');
      for (const page of pages) {
        const ratio = ink.signatureWidthRatio(marked, page, 1);
        const box = signatureGeometry({ widthRatio: ratio, positionX: 0.5, positionY: 0.5 }, page.width, page.height, image.width, image.height, page.pdf);
        const physical = coverage(roundtrip.getContext('2d'), image.width, image.height) / image.width * box.width / page.width * ink.pageWidthMm(page);
        assert(Math.abs(physical - 0.5) < 0.02, '不同书写长度、设备与目标文件均为 0.5mm');
        assert.equal(ink.signatureWidthRatio(marked, page, 2), ratio * 2, '用户主动放大整张签名仍须等比');
      }
      const rows = ['a', 'b'].map(fileId => ({ fileId, signatureType: 'signature', imageData: marked }));
      const files = rows.map(row => ({ id: row.fileId, mimeType: 'application/pdf' }));
      await assert.rejects(ink.prepareSignatureWidths(rows, files, async file => {
        if (file.id === 'b') throw new Error('preview_failed');
        return { response: { pageWidth: 595, pageHeight: 842 } };
      }));
      assert(rows.every(row => row.widthRatio === undefined), '预览失败不留下半组默认尺寸');
      let calls = 0;
      await ink.prepareSignatureWidths([rows[0], { ...rows[0] }], files, async () => {
        calls += 1; return { response: { pageWidth: 595, pageHeight: 842 } };
      });
      assert.equal(calls, 1, '同一文件同一页只读取一次尺寸');
      assert.equal(rows[0].widthRatio, ink.signatureWidthRatio(marked, { width: 595, height: 842, pdf: true }, 1));
      const bare = { module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(require.resolve('../../shared/auditInk'), 'utf8'), bare);
      assert.equal(bare.module.exports.withSignatureWidth(raw, ink.signatureWidthMm(marked)), marked, '微信不能依赖 Buffer、atob 或 btoa');
      const corrupted = Buffer.from(marked.slice(marked.indexOf(',') + 1), 'base64'); corrupted[42] ^= 1;
      assert.equal(ink.signatureWidthMm('data:image/png;base64,' + corrupted.toString('base64')), null, '尺寸损坏不得采用');
      assert.equal(ink.signatureWidthRatio(raw, pages[0], 1), null, '旧签名未留存尺寸，保持兼容而非猜测加粗');
    }
  }
  for (const input of ['', 'data:image/jpeg;base64,AAAA', 'data:image/png;base64,AAAA']) assert.equal(ink.signatureWidthMm(input), null);
  console.log('实际像素检查通过：5 种页面 × 3 档笔宽；2 种签名板 × 2 种裁边 × 5 种文件放置，默认中档 0.5mm');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
