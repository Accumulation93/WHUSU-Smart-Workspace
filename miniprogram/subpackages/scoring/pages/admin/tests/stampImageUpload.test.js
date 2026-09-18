const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_IMAGE_BYTES,
  detectImageMimeType,
  estimateByteLength,
  buildImageDataUrl
} = require('../../../../../utils/imageDataUrl');

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

const transparentPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
]);

test('印章上传按真实字节识别格式，不依赖临时文件扩展名', () => {
  const cases = [
    ['image/png', transparentPng],
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])],
    ['image/webp', Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0x1a, 0x00, 0x00, 0x00]), Buffer.from('WEBP', 'ascii')])],
    ['image/gif', Buffer.concat([Buffer.from('GIF87a', 'ascii'), Buffer.alloc(8)])],
    ['image/bmp', Buffer.concat([Buffer.from('BM', 'ascii'), Buffer.alloc(12)])]
  ];
  for (const [mimeType, buffer] of cases) {
    const base64 = toBase64(buffer);
    assert.equal(detectImageMimeType(base64), mimeType, mimeType + ' 必须能被识别');
    const built = buildImageDataUrl(base64);
    assert.equal(built.ok, true, mimeType + ' 必须被接受');
    assert.equal(built.mimeType, mimeType);
    assert.equal(built.dataUrl, 'data:' + mimeType + ';base64,' + base64);
  }
});

test('透明 PNG 的 Data URL 与真实字节声明一致', () => {
  const built = buildImageDataUrl(toBase64(transparentPng));
  assert.equal(built.ok, true);
  assert.equal(built.mimeType, 'image/png');
  assert.equal(built.byteLength, transparentPng.length);
  assert.ok(built.dataUrl.startsWith('data:image/png;base64,'));
});

test('压缩后临时路径无扩展名的场景不再误判', () => {
  // 微信压缩会把 PNG 转成 JPEG，且临时路径可能没有扩展名；
  // 此时必须按 JPEG 字节声明，否则服务端类型校验会失败。
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08]);
  const built = buildImageDataUrl(toBase64(jpegBytes));
  assert.equal(built.ok, true);
  assert.equal(built.mimeType, 'image/jpeg');
});

test('非图片与未支持格式必须被拒绝', () => {
  assert.equal(buildImageDataUrl(toBase64(Buffer.from('not-an-image'))).reason, 'unsupported');
  assert.equal(buildImageDataUrl(toBase64(Buffer.from([0x49, 0x49, 0x2a, 0x00]))).reason, 'unsupported');
  assert.equal(buildImageDataUrl('').reason, 'unsupported');
  assert.equal(detectImageMimeType(''), '');
});

test('体积上限按解码后的真实字节数判断', () => {
  const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0x41);
  const oversized = buildImageDataUrl(toBase64(big));
  assert.equal(oversized.reason, 'too_large');
  assert.equal(estimateByteLength(toBase64(big)), big.length);
});

test('base64 前缀解码兼容换行与自定义上限', () => {
  const base64 = toBase64(transparentPng);
  const wrapped = base64.slice(0, 8) + '\n' + base64.slice(8);
  assert.equal(detectImageMimeType(wrapped), 'image/png');
  assert.equal(buildImageDataUrl(base64, { maxBytes: 4 }).reason, 'too_large');
  assert.equal(buildImageDataUrl(base64, { maxBytes: 4096 }).ok, true);
});

// ── 运行链路：真实前端参数驱动 chooseStampImage ──
// 复现场景：微信压缩后返回的临时路径没有扩展名，旧实现固定声明为 image/png，
// 与真实 JPEG 字节不一致，被服务端判定为“请使用支持的印章图片”。
function loadStampUploadRuntime() {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  const behaviorPath = path.join(__dirname, '..', 'modules', 'auditBehavior.js');
  const source = fs.readFileSync(behaviorPath, 'utf8');
  let behavior = null;
  const toasts = [];
  const vmRequire = (name) => {
    if (name.endsWith('stampAuthorization')) return require('../../../../../locales/zh-CN/stampAuthorization');
    if (name.endsWith('imageDataUrl')) return require('../../../../../utils/imageDataUrl');
    if (name.endsWith('auditPersonnelView')) {
      return { ALL_FILTER_KEY: 'all', buildAuditPersonnelFilterOptions: () => ({}), filterAuditPersonnel: () => [] };
    }
    if (name.endsWith('adminUtils')) {
      return {
        showShortToast: (text) => toasts.push(text),
        getErrorText: (error, fallback) => (error && error.message ? error.message : fallback)
      };
    }
    if (name.endsWith('orgSession')) {
      return { beginRequest: () => 1, isRequestCurrent: () => true };
    }
    if (name.endsWith('auditVerification')) {
      return { verificationCopy: {}, presentVerificationResponse: () => {}, buildMatchVerificationParams: () => ({}) };
    }
    if (name.endsWith('filePreview')) return { openAuditFile: () => {} };
    if (name.endsWith('utils/api')) return { formatAuditTime: () => '' };
    return {};
  };
  const sandbox = {
    module: { exports: {} },
    Behavior: (value) => { behavior = value; return value; },
    require: vmRequire,
    wx: {},
    console
  };
  vm.runInNewContext(source, sandbox);
  return { behavior, toasts, sandbox };
}

// 还原小程序 setData 的路径写法（'stampForm.imageData'）。
function applySetData(data, values) {
  Object.keys(values).forEach((key) => {
    const parts = key.split('.');
    let target = data;
    for (let index = 0; index < parts.length - 1; index += 1) {
      target = target[parts[index]];
    }
    target[parts[parts.length - 1]] = values[key];
  });
}

function createStampPage(behavior) {
  return Object.assign({}, behavior.methods, {
    data: Object.assign({}, behavior.data, { stampForm: { id: '', name: '', imageData: '' }, stampFormError: '' }),
    setData(values) { applySetData(this.data, values); }
  });
}

function pickStampImage(runtime, page, pickResult, readResult) {
  runtime.sandbox.wx = {
    chooseImage: (options) => options.success(pickResult),
    getFileSystemManager: () => ({
      readFile: (options) => (readResult.ok ? options.success({ data: readResult.data }) : options.fail(readResult.error))
    })
  };
  page.chooseStampImage();
}

test('无扩展名临时路径下按真实字节声明类型，透明 PNG 与 JPEG 都能通过', () => {
  const runtime = loadStampUploadRuntime();
  const { behavior, toasts } = runtime;
  assert.ok(behavior && behavior.methods.chooseStampImage, '印章上传方法必须存在');
  const page = createStampPage(behavior);

  // 透明 PNG，临时路径无扩展名，且平台没有返回 size。
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  pickStampImage(runtime, page, { tempFilePaths: ['wxfile://tmp_no_extension'] }, { ok: true, data: pngBase64 });
  assert.equal(page.data.stampForm.imageData, 'data:image/png;base64,' + pngBase64);
  assert.equal(page.data.stampFormError, '');
  assert.equal(toasts.length, 0);

  // 微信压缩产生的 JPEG，同样没有扩展名，旧实现会错误声明成 PNG。
  const jpegBase64 = toBase64(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]));
  page.setData({ 'stampForm.imageData': '' });
  pickStampImage(runtime, page, { tempFilePaths: ['wxfile://tmp_no_extension'] }, { ok: true, data: jpegBase64 });
  assert.equal(page.data.stampForm.imageData, 'data:image/jpeg;base64,' + jpegBase64);
  assert.equal(page.data.stampFormError, '');
});

test('印章上传保留 PNG 透明通道：必须取原图而非微信压缩图', () => {
  const runtime = loadStampUploadRuntime();
  const { behavior } = runtime;
  const captured = [];
  const page = createStampPage(behavior);
  runtime.sandbox.wx = {
    chooseImage: (options) => { captured.push(options); },
    getFileSystemManager: () => ({ readFile() {} })
  };
  page.chooseStampImage();
  assert.equal(captured[0].sizeType.join(','), 'original', '印章必须使用原图，压缩会丢失透明通道');
});

test('超出体积、格式不支持与读取失败都给出明确提示且不写入图片', () => {
  const copy = require('../../../../../locales/zh-CN/stampAuthorization');
  const runtime = loadStampUploadRuntime();
  const { behavior, toasts } = runtime;
  const page = createStampPage(behavior);

  pickStampImage(runtime, page, { tempFilePaths: ['wxfile://tmp_big'], tempFiles: [{ size: MAX_IMAGE_BYTES + 1 }] }, { ok: true, data: '' });
  assert.equal(page.data.stampForm.imageData, '');
  assert.equal(page.data.stampFormError, copy.imageTooLarge);

  const tiffBase64 = toBase64(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]));
  pickStampImage(runtime, page, { tempFilePaths: ['wxfile://tmp_tiff'] }, { ok: true, data: tiffBase64 });
  assert.equal(page.data.stampForm.imageData, '');
  assert.equal(page.data.stampFormError, copy.imageUnsupported);

  pickStampImage(runtime, page, { tempFilePaths: ['wxfile://tmp_missing'] }, { ok: false, error: { errMsg: 'read fail' } });
  assert.equal(page.data.stampForm.imageData, '');
  assert.equal(page.data.stampFormError, copy.imageReadFailed);
  assert.ok(toasts.length >= 3, '三种失败都必须有提示');
});

// 真机相册可能返回小程序无法直接识别的格式（iPhone 原图 HEIC 等），
// 此时先转码一次，再按真实字节重新识别，不能直接判为不支持。
function installConvertibleWx(runtime, options) {
  const convertCalls = [];
  runtime.sandbox.wx = {
    chooseImage: (pickOptions) => pickOptions.success({ tempFilePaths: ['wxfile://tmp_heic_original'] }),
    getFileSystemManager: () => ({
      readFile: (readOptions) => {
        const data = readOptions.filePath === 'wxfile://tmp_heic_original' ? options.original : options.converted;
        if (data == null) {
          readOptions.fail({ errMsg: 'readFile:fail' });
          return;
        }
        readOptions.success({ data });
      }
    })
  };
  if (options.compressImage) {
    runtime.sandbox.wx.compressImage = (compressOptions) => {
      convertCalls.push(compressOptions.src);
      options.compressImage(compressOptions);
    };
  }
  return convertCalls;
}

test('无法直接识别的格式转码后按字节重新识别，成功写入图片', () => {
  const runtime = loadStampUploadRuntime();
  const { behavior, toasts } = runtime;
  const page = createStampPage(behavior);
  const heicBase64 = toBase64(Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypheic', 'ascii'),
    Buffer.alloc(8)
  ]));
  const convertedJpeg = toBase64(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
  const convertCalls = installConvertibleWx(runtime, {
    original: heicBase64,
    converted: convertedJpeg,
    compressImage: (options) => options.success({ tempFilePath: 'wxfile://tmp_converted' })
  });

  page.chooseStampImage();
  assert.equal(convertCalls.length, 1, 'HEIC 必须先转码一次');
  assert.equal(page.data.stampForm.imageData, 'data:image/jpeg;base64,' + convertedJpeg);
  assert.equal(page.data.stampFormError, '');
  assert.equal(toasts.length, 0);
});

test('转码后仍不支持或转码失败时只提示一次，不重复转码', () => {
  const copy = require('../../../../../locales/zh-CN/stampAuthorization');
  const heicBase64 = toBase64(Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypheic', 'ascii'),
    Buffer.alloc(8)
  ]));

  const failRuntime = loadStampUploadRuntime();
  const failPage = createStampPage(failRuntime.behavior);
  installConvertibleWx(failRuntime, {
    original: heicBase64,
    converted: null,
    compressImage: (options) => options.fail({ errMsg: 'compressImage:fail' })
  });
  failPage.chooseStampImage();
  assert.equal(failPage.data.stampForm.imageData, '');
  assert.equal(failPage.data.stampFormError, copy.imageUnsupported);

  const retryRuntime = loadStampUploadRuntime();
  const retryPage = createStampPage(retryRuntime.behavior);
  const convertCalls = installConvertibleWx(retryRuntime, {
    original: heicBase64,
    converted: heicBase64,
    compressImage: (options) => options.success({ tempFilePath: 'wxfile://tmp_converted' })
  });
  retryPage.chooseStampImage();
  assert.equal(convertCalls.length, 1, '转码只允许尝试一次，避免循环');
  assert.equal(retryPage.data.stampFormError, copy.imageUnsupported);
});
