'use strict';

/*
 * 认证码 / 恢复码导出验收。
 *
 * 号码只在生成时展示一次，且明确不允许「复制不全」，因此统一改为导出表格：
 * 这里用真实参数跑通「弹窗 → 选择格式 → 生成文件 → 写入磁盘」，
 * 断言导出内容包含姓名、学号与完整号码，并核对 Excel 走统一表格接口。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const adminRoot = path.resolve(__dirname, '..');
const moduleDir = path.join(adminRoot, 'modules');
const behaviorPath = path.join(moduleDir, 'authPersonnelBehavior.js');
const tableFilePath = path.resolve(adminRoot, '../../../../utils/tableFile');
const pageLocalePath = path.resolve(adminRoot, '../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/admin.js');

const FULL_CODE_A = 'A1B2C3D4E5F6G7H8J9K0';
const FULL_CODE_B = 'Z9Y8X7W6V5U4T3S2R1Q0';

/** 沙箱内的数组/对象来自另一个 Realm，比较前转成本 Realm 的普通值。 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** 在沙箱里加载认证行为模块，行为依赖与 wx 接口全部用可控桩替代。 */
function createHarness() {
  const state = { toasts: [], writes: [], actionSheetItems: null, actionSheetTapIndex: 0, modalCount: 0 };
  const realTableFile = require(tableFilePath);
  const wxStub = {
    env: { USER_DATA_PATH: '/tmp/wx-user-data' },
    getFileSystemManager: () => ({
      writeFile: (options) => {
        state.writes.push({ filePath: options.filePath, data: options.data, encoding: options.encoding });
        if (options.success) options.success();
      }
    }),
    showActionSheet: (options) => {
      state.actionSheetItems = Array.from(options.itemList || []).map(String);
      if (options.success) options.success({ tapIndex: state.actionSheetTapIndex });
    },
    openDocument: (options) => { if (options.success) options.success(); },
    shareFileMessage: (options) => { if (options.success) options.success(); },
    saveFileToDisk: (options) => { if (options.success) options.success(); },
    showModal: () => { state.modalCount += 1; }
  };
  const context = {
    console,
    wx: wxStub,
    module: { exports: {} },
    exports: {},
    Behavior: (config) => { state.config = config; return config; },
    require: (id) => {
      if (id.indexOf('locales/zh-CN/generated') >= 0) return require(path.resolve(moduleDir, id));
      if (/utils\/api$/.test(id)) {
        return {
          callFunction: () => Promise.reject(new Error('未预期的 callFunction')),
          showShortToast: (text) => state.toasts.push(String(text == null ? '' : text)),
          getErrorText: (error, fallback) => String(error && error.message || fallback || ''),
          formatAuditTime: () => '',
          formatAuditDetailTime: () => ''
        };
      }
      if (/utils\/authContext$/.test(id)) return { hasPermission: () => true };
      if (/utils\/orgSession$/.test(id)) return { getSnapshot: () => ({ orgId: 'org-1', orgName: '组织一' }), isCurrent: () => true };
      if (/utils\/dateTime$/.test(id)) {
        return { splitSystemDateTime: () => ({ date: '', time: '' }), systemDateTimeToIsoUtc: () => '' };
      }
      if (/utils\/tableFile$/.test(id)) return realTableFile;
      throw new Error('未预期的依赖：' + id);
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(behaviorPath, 'utf8'), context, { filename: behaviorPath });
  return { state, wxStub, methods: state.config.methods };
}

/** 构造最小页面上下文，并记录弹窗到导出方法的调用，便于等待真实异步导出。 */
function createPage(harness, overrides) {
  const settings = overrides || {};
  const realExport = harness.methods._exportAuthIssuedCodes;
  const page = {
    data: Object.assign({
      authIssuedCodes: [],
      authIssuedCodeKind: 'verification',
      authScopeOrganizationName: '第三十四届'
    }, settings.data),
    setData() {},
    callCloud: settings.callCloud || (() => Promise.reject(new Error('未预期的 callCloud'))),
    pendingExport: null
  };
  page._exportAuthIssuedCodes = function exportCodes(format, rows, texts) {
    page.pendingExport = realExport.call(page, format, rows, texts);
    return page.pendingExport;
  };
  return page;
}

async function runExport(harness, page) {
  const previousWx = global.wx;
  global.wx = harness.wxStub;
  try {
    await harness.methods.exportAuthIssuedCodes.call(page);
    if (page.pendingExport) await page.pendingExport;
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }
}

test('认证码导出 CSV 时包含姓名、学号与完整号码', async () => {
  const harness = createHarness();
  harness.state.actionSheetTapIndex = 1;
  const page = createPage(harness, {
    data: {
      authIssuedCodes: [
        { key: 'c1', personName: '张三', studentId: '2021302111001', code: FULL_CODE_A },
        { key: 'c2', personName: '李四', studentId: '2021302111002', code: FULL_CODE_B }
      ]
    }
  });
  await runExport(harness, page);

  assert.deepEqual(harness.state.actionSheetItems, ['Excel 表格（.xlsx）', 'CSV 文本（.csv）']);
  assert.equal(harness.state.writes.length, 1, '应写出一份文件');
  const written = harness.state.writes[0];
  assert.equal(written.encoding, 'base64');
  assert.match(written.filePath, /第三十四届认证码清单_\d+\.csv$/);
  const csv = Buffer.from(written.data, 'base64').toString('utf8');
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'CSV 必须带 BOM');
  assert.deepEqual(csv.replace(/^\ufeff/, '').split('\r\n'), [
    '姓名,学号,认证码',
    '张三,2021302111001,' + FULL_CODE_A,
    '李四,2021302111002,' + FULL_CODE_B
  ]);
});

test('认证码导出 Excel 时走统一表格接口并原样保存服务端文件', async () => {
  const harness = createHarness();
  harness.state.actionSheetTapIndex = 0;
  const serverBase64 = Buffer.from('xlsx-file-bytes').toString('base64');
  let payload = null;
  const page = createPage(harness, {
    data: { authIssuedCodes: [{ key: 'c1', personName: '张三', studentId: '2021302111001', code: FULL_CODE_A }] },
    callCloud: (name, data) => {
      payload = { name, data };
      return Promise.resolve({ status: 'success', fileBase64: serverBase64, extension: 'xlsx' });
    }
  });
  await runExport(harness, page);

  assert.equal(payload.name, 'buildTableFile');
  assert.equal(payload.data.format, 'excel');
  assert.equal(payload.data.sheetName, '认证码');
  assert.deepEqual(plain(payload.data.headers).map((header) => header.label), ['姓名', '学号', '认证码']);
  assert.deepEqual(plain(payload.data.headers).map((header) => header.key), ['name', 'studentId', 'code']);
  assert.deepEqual(plain(payload.data.rows), [{ name: '张三', studentId: '2021302111001', code: FULL_CODE_A }]);
  assert.equal(harness.state.writes.length, 1);
  assert.match(harness.state.writes[0].filePath, /第三十四届认证码清单_\d+\.xlsx$/);
  assert.equal(harness.state.writes[0].data, serverBase64, '文件内容必须是服务端返回的表格，不能二次加工');
});

test('恢复码导出使用恢复码列名、清单名与弹窗标题', async () => {
  const harness = createHarness();
  harness.state.actionSheetTapIndex = 1;
  const page = createPage(harness, {
    data: {
      authIssuedCodeKind: 'recovery',
      authIssuedCodes: [{ key: 'a1', personName: '王五', studentId: '2021302111003', code: FULL_CODE_A }]
    }
  });
  await runExport(harness, page);

  const written = harness.state.writes[0];
  assert.match(written.filePath, /第三十四届恢复码清单_\d+\.csv$/);
  const csv = Buffer.from(written.data, 'base64').toString('utf8').replace(/^\ufeff/, '');
  assert.equal(csv.split('\r\n')[0], '姓名,学号,恢复码');

  const pageLocale = require(pageLocalePath);
  assert.equal(pageLocale.authCodeDialogTitleRecovery, '恢复码已生成');
  assert.equal(pageLocale.authCodeExportAction, '导出表格');
});

test('没有号码时不打开格式选择也不生成文件', async () => {
  const harness = createHarness();
  const page = createPage(harness, { data: { authIssuedCodes: [] } });
  await runExport(harness, page);

  assert.deepEqual(harness.state.toasts, ['暂无可导出的认证码']);
  assert.equal(harness.state.actionSheetItems, null);
  assert.equal(harness.state.writes.length, 0);
});

test('号码弹窗不再走剪贴板，且每个发放流程都标记号码种类', () => {
  const wxml = fs.readFileSync(path.join(adminRoot, 'admin.wxml'), 'utf8');
  const behavior = fs.readFileSync(behaviorPath, 'utf8');
  const pageLocale = require(pageLocalePath);

  assert.doesNotMatch(behavior, /copyAuthIssuedCodes|setClipboardData/);
  assert.doesNotMatch(wxml, /copyAuthIssuedCodes|复制全部/);
  assert.match(wxml, /bindtap="exportAuthIssuedCodes"/);
  assert.match(wxml, /authIssuedCodeKind === 'recovery' \? localeCopy\.authCodeDialogTitleRecovery : localeCopy\.copy_c195d59710/);
  const removedCopyKey = ['copy', 'b763f058b0'].join('_');
  assert.equal(pageLocale[removedCopyKey], undefined, '复制按钮文案应随功能一起下线');
  assert.equal((behavior.match(/issuedCodesDialogData\('recovery'/g) || []).length, 3);
  assert.equal((behavior.match(/issuedCodesDialogData\('verification'/g) || []).length, 5);
});
