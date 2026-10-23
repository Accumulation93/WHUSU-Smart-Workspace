'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function main() {
  const file = path.resolve(__dirname, '../../miniprogram/subpackages/audit/components/signaturePad/signaturePad.js');
  let definition, writes = 0;
  const runtime = { Component(value) { definition = value; }, require: createRequire(file), console,
    wx: { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager() { return {
      writeFile(options) { writes++; options.fail(new Error('quota')); },
      writeFileSync() { writes++; throw new Error('quota'); }
    }; } } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), runtime, { filename: file });
  const instance = { ...definition.methods, _alive: true, _images: {}, _imagePending: {}, _imagePaths: [],
    _surface: { createImage() { const image = { width: 1200, height: 1800 }; Object.defineProperty(image, 'src', {
      set(value) { Promise.resolve().then(() => value.startsWith('data:') ? image.onload() : image.onerror(new Error('not_found'))); }
    }); return image; } } };
  const source = 'data:image/png;base64,aW1hZ2U=';
  const image = await instance._image(source);
  assert.strictEqual(image.width, 1200);
  assert.strictEqual(writes, 0, '持久空间已满时，受支持的内存图片不得转成持久文件');
  assert.strictEqual(await instance._image(source), image, '同页签章共享已解码图片');
  // 布局切换后先同步缓冲与相机，再处理已经排队的触点。
  const ink = require('../../shared/auditInk');
  // 横屏工具并排后按容器实际高度计算，不能累加同一行的按钮组。
  let measuredMinimum;
  const measuredPad = { ...definition.methods, _alive: true, triggerEvent(name, detail) { measuredMinimum = detail.minimum; } };
  runtime.wx.createSelectorQuery = () => ({
    in() { return this; }, select() { return this; }, fields() { return this; },
    selectAll(selector) { assert.equal(selector, '.sigpad-tools, .sigpad-notice'); return this; },
    boundingClientRect() { return this; },
    exec(callback) { callback([{ width: 636, height: 126 }, [{ height: 84 }]]); }
  });
  measuredPad.measure();
  assert.equal(measuredMinimum, 208);
  const touchPad = { ...definition.methods, _rect: { left: 32, top: 140 } };
  assert.deepEqual(JSON.parse(JSON.stringify(touchPad._viewportTouch({ x: 10, y: 20, identifier: 1 }))), { clientX: 42, clientY: 160, identifier: 1 });
  assert.equal(touchPad._viewportTouch({ pageX: 42, pageY: 999 }), null, '不猜测页面滚动偏移');
  assert.equal(touchPad._viewportTouch({ clientX: 42, clientY: 160, x: 999 }).clientX, 42, '视口坐标优先，不重复转换');
  for (const pixelRatio of [1, 2, 3]) {
    runtime.wx.getWindowInfo = () => ({ pixelRatio });
    const surface = {}, layer = {};
    const pad = { ...definition.methods, _alive: true, data: { ready: true }, _surface: surface, _layer: layer,
      _documentWidth: 800, _documentHeight: 400, _zoom: 1, _panX: 0, _panY: 0 };
    for (const rect of [{left:16,top:140,width:278,height:180},{left:20,top:190,width:728,height:540},{left:30,top:150,width:1180,height:220}]) {
      const query = { in() { return this; }, select() { return this; }, fields() { return this; }, exec(callback) { callback([rect]); } };
      runtime.wx.createSelectorQuery = () => query;
      let point;
      pad._touch = () => { point = pad._point({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }); };
      pad.onTouchStart({ touches: [] });
      const expected = ink.surfaceSize(rect.width, rect.height, pixelRatio);
      assert.equal(surface.width, expected.width); assert.equal(surface.height, expected.height);
      assert.equal(layer.width, expected.width); assert.equal(layer.height, expected.height);
      assert.equal(pad._camera.width / pad._camera.height, 2, '布局改变不得拉伸文件比例');
      assert(Math.abs(point.x - 0.5) < 1e-12); assert(Math.abs(point.y - 0.5) < 1e-12);
    }
    assert.equal(pad._applyViewport({ width: 0, height: 0 }), false);
  }
  const pageFile = path.resolve(__dirname, '../../miniprogram/subpackages/audit/pages/signing/signing.js');
  let pageDefinition;
  const ownRequire = createRequire(pageFile);
  const pageRuntime = { Page(value) { pageDefinition = value; }, console, setTimeout, clearTimeout,
    wx: { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager() { return { readdir(options) { options.success({ files: [] }); } }; } },
    require(name) {
      if (name === '../../../../utils/auditSigningAssets') return { preview: async () => ({ src: source, image: { width: 1200, height: 1800 }, response: { status: 'success', totalPages: 2 } }) };
      if (name === '../../../../utils/api') return { callFunction: async () => ({ status: 'success', previewMime: 'image/png', data: 'aW1hZ2U=', totalPages: 2 }) };
      if (name === '../../../../utils/orgSession') return { isCurrent: () => true };
      if (name === '../../package-resources/utils/auditPreviewFiles') return { removeExpiredPreviews: () => new Promise(() => {}), removePreview: () => new Promise(() => {}) };
      return ownRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(pageFile, 'utf8'), pageRuntime, { filename: pageFile });
  const page = { ...pageDefinition, data: { fileId: 'file-a', width: 0, height: 0 }, _alive: true, _validated: true, _scope: {},
    _handoff: { draft: { locked: false } }, _fileDraft: { currentPage: 1 }, _previewPaths: ['wxfile://usr/audit_canvas_1000000000000_test.png'], _cache: {},
    setData(values) { Object.assign(this.data, values); if (values.fileImage) Promise.resolve().then(() => this.onCanvasReady({ detail: { width: 1200, height: 1800 } })); } };
  let timeout;
  try {
    await Promise.race([page.loadPage(1), new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('清理回调停滞不应阻止打开文件')), 500); })]);
  } finally { clearTimeout(timeout); }
  assert.strictEqual(page.data.ready, true);
  assert.strictEqual(page.data.width, 1200, '旧预览响应缺少尺寸时使用实际已解码图片尺寸');
  assert.strictEqual(page.data.height, 1800);
  assert(page.data.fileImage.length < 40, '大图片不得通过 setData 传进视图');
  assert(page._handoff.preview.src.startsWith('data:image/png;base64,'), '实际图片只在工作区内存流转');
  console.log('原生签署内存加载测试通过：存储满、重复解码、旧尺寸与小体积视图数据');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
