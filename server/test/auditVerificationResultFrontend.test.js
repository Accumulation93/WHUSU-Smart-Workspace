'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '../..');
function load(relative, register, overrides) {
  const file = path.join(root, relative);
  const localRequire = createRequire(file);
  let definition;
  const context = { [register]: value => { definition = value; },
    require: request => overrides && overrides[request] || localRequire(request),
    wx: {}, console };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return { definition, context };
}
let openedReport = null;
let outputOptions, resolveOutput;
const { definition, context: componentContext } = load('miniprogram/components/audit-verification-result/audit-verification-result.js', 'Component', {
  '../../utils/fileIO': { outputFile(options) { outputOptions = options; return new Promise(resolve => { resolveOutput = resolve; }); } },
  '../../utils/dateTime': { formatDetailTime: () => '2026-09-06 08:00:00' },
  '../../utils/auditVerificationReport': { open: result => { openedReport = result; } },
  '../../utils/orgSession': { beginRequest: () => ({}), isRequestCurrent: () => true, invalidateRequests: () => {} }
});
const component = { data: {}, setData(value) { Object.assign(this.data, value); } };
const verifiedChecks = Object.fromEntries(['documentIntegrity', 'cmsSignature', 'receiptChain', 'identityBinding', 'platformCertificate']
  .map(key => [key, { status: 'passed' }]));
component.present = value => definition.methods.present.call(component, value);
for (const status of ['passed', 'failed', 'indeterminate', 'legacy_partial']) {
  definition.methods.present.call(component, { verificationVersion: 2, overallStatus: status, verificationSource: 'uploaded_file',
    files: [{ fileName: 'long-file.pdf', overallStatus: status, checks: verifiedChecks, studentId: 'PROTECTED-STUDENT', personId: 'PROTECTED-PERSON',
      steps: [{ reference: 'random-ref', name: '同名', assignment: '签署时岗位', studentId: 'PROTECTED-STUDENT',
        identityCiphertext: 'PRIVATE-CIPHERTEXT', keyVersion: 'v1', status, round: 1, step: 1 }] }] });
  assert.equal(component.data.view.state, status);
  assert(!JSON.stringify(component.data.view).includes('PROTECTED-'));
  assert(!JSON.stringify(component.data.view).includes('PRIVATE-CIPHERTEXT'));
  assert.equal(component.data.view.files[0].checks.length, 6);
  assert.equal(component.data.view.files[0].steps[0].state, status);
  assert.equal(component.data.view.files[0].summary.length, 4);
  if (status !== 'passed') assert.notEqual(component.data.view.files[0].steps[0].name, '同名');
}
for (const malformed of [null, {}, 'invalid', [null], [{ steps: {} }], [{ cms: [null] }]]) {
  definition.methods.present.call(component, { verificationVersion: 2, overallStatus: 'passed', files: malformed });
  assert.equal(component.data.view.state, 'indeterminate');
}
definition.methods.presentJson.call(component, '{');
assert.equal(component.data.view.state, 'indeterminate');
const { presentVerificationResponse } = require('../../miniprogram/utils/auditVerification');
const transported = presentVerificationResponse({ verificationVersion: 2, overallStatus: 'failed', files: [] });
definition.methods.presentJson.call(component, transported.componentResultJson);
assert.equal(component.data.view.state, 'failed');
definition.methods.present.call(component, { valid: true, files: [] });
assert.equal(component.data.view.state, 'legacy_partial', '旧 valid 不能转换成新版完整通过');
definition.methods.openReport.call(component);
assert.equal(openedReport.valid, true);
assert.equal(definition.properties.report.value, false, '默认界面不显示专业检查');

const standalone = { verificationVersion: 2, verificationSource: 'uploaded_file', verificationScope: 'file_only',
  overallStatus: 'indeterminate', files: [{ overallStatus: 'indeterminate', checks: {
    documentIntegrity: { status: 'passed' }, cmsSignature: { status: 'passed' }, identityBinding: { status: 'indeterminate' }
  } }] };
definition.methods.presentJson.call(component, presentVerificationResponse(standalone).componentResultJson);
assert.equal(component.data.view.title, '文件签名有效');
assert.equal(component.data.view.state, 'indeterminate', '未核实平台身份不得渲染成完整通过');
assert(component.data.view.notice.includes('没有匹配的申请记录'));
assert.equal(component.data.view.files[0].platformVerified, false);
standalone.files[0].certificates = [{ fingerprint: 'a'.repeat(64), derBase64: 'YWJj' }];
standalone.files[0].steps = [{ status: 'passed', name: '冒用平台名称', reference: 'claimed' }];
definition.methods.present.call(component, { ...standalone, overallStatus: 'passed' });
assert.equal(component.data.view.state, 'indeterminate', '缺少必需检查，顶层 passed 也不得误报通过');
assert.equal(component.data.view.files[0].steps.length, 0, '未核实的身份不得展示');
assert.equal(component.data.view.files[0].certificates.length, 0, '不得引导用户信任外来证书');
standalone.files[0].checks.cmsSignature = { status: 'indeterminate', reasonCode: 'pdf_unsigned' };
definition.methods.present.call(component, standalone);
assert.equal(component.data.view.title, '文件未签名');
definition.methods.present.call(component, null);
assert.equal(component.data.view, null);
const fileMarkup = fs.readFileSync(path.join(root, 'miniprogram/components/audit-verification-result/audit-verification-result.wxml'), 'utf8');
assert(!fileMarkup.includes('check.reasonCode'), '报告不得直接展示系统原因码');
assert(fileMarkup.includes("report && expanded['checks_' + fileIndex]"), '详细检查必须同时要求独立报告模式与显式展开');
assert(fileMarkup.includes("report && expanded['technical_' + fileIndex]"), '专业内容默认折叠，只在独立报告中展开');
assert.deepEqual(Object.keys(component.data.expanded), [], '每份新结果都恢复默认折叠');
assert(fileMarkup.includes('bindtap="openReport"'));
for (const className of ['crypto-step-header', 'crypto-person-reference', 'crypto-organization', 'crypto-assignment', 'crypto-identity']) {
  assert(fileMarkup.includes(className), '逐步身份需要独立语义层级：' + className);
}
assert(!/avatar|initial/i.test(fileMarkup), '验签人不得恢复姓氏装饰头像');
assert(fileMarkup.indexOf('copy.adobeTrustNotice') > fileMarkup.indexOf("report && expanded['technical_' + fileIndex]"), 'Adobe 信任说明仅在报告技术区');
assert(fileMarkup.includes('wx:if="{{file.platformVerified}}" class="crypto-note">{{copy.hostedNotice}}'));
assert(fileMarkup.includes("file.platformVerified && expanded['certificates_' + fileIndex]"), '证书只在来源核实且明确展开后展示');
definition.methods.present.call(component, { verificationVersion: 2, overallStatus: 'failed', files: [{ overallStatus: 'failed', checks: {
  ...verifiedChecks, platformCertificate: { status: 'failed' }, externalTrust: { status: 'failed' }
} }] });
assert.equal(component.data.view.files[0].failures.length, 2, '专业检查中的失败也必须在默认摘要显示');
for (const page of ['miniprogram/subpackages/audit/pages/verification/verification', 'miniprogram/subpackages/scoring/pages/admin/admin',
  'miniprogram/subpackages/audit/pages/verificationReport/verificationReport']) {
  const json = JSON.parse(fs.readFileSync(path.join(root, page + '.json'), 'utf8'));
  assert(json.usingComponents['audit-verification-result']);
  const markup = fs.readFileSync(path.join(root, page + '.wxml'), 'utf8');
  assert(markup.includes('<audit-verification-result'));
  assert(markup.includes('result-json="{{'));
}
(async () => {
let written, removed;
componentContext.wx = { env: { USER_DATA_PATH: '/tmp' },
  showModal() {},
  getFileSystemManager: () => ({ writeFile: options => { written = options; options.success(); }, unlink: options => { removed = options.filePath; } }) };
const certificate = { fingerprint: 'a'.repeat(64), derBase64: 'YWJj' };
definition.methods.present.call(component, { verificationVersion: 2, overallStatus: 'passed', files: [{ overallStatus: 'passed', checks: verifiedChecks, certificates: [certificate] }] });
const exportEvent = { currentTarget: { dataset: { file: '0', certificate: '0' } } };
for (const status of ['success', 'cancelled', 'error']) {
  removed = null; outputOptions = null;
  definition.methods.exportCertificate.call(component, exportEvent);
  assert.equal(written.data, certificate.derBase64);
  assert.equal(written.encoding, 'base64');
  assert(outputOptions.fileName.endsWith('.cer'));
  assert.equal(outputOptions.filePath, written.filePath);
  assert.deepEqual(Array.from(outputOptions.modes), ['share', 'save']);
  assert.equal(removed, null, '用户选择输出模式期间保留临时证书');
  assert.equal(component.data.exporting, true);
  const pending = outputOptions;
  definition.methods.exportCertificate.call(component, exportEvent);
  assert.equal(outputOptions, pending, '导出期间禁止重复发起');
  resolveOutput({ status }); await Promise.resolve();
  assert.equal(removed, written.filePath);
  assert.equal(component.data.exporting, false);
  assert.equal(outputOptions, pending, '结束后不能自动切换其他输出方式');
}
let clipboard;
componentContext.wx.setClipboardData = options => { clipboard = options.data; options.success(); };
definition.methods.copyCertificate.call(component, exportEvent);
assert(clipboard.startsWith('-----BEGIN CERTIFICATE-----\n'));
assert(clipboard.endsWith('\n-----END CERTIFICATE-----\n'));
assert.equal(Buffer.from(clipboard.split('\n').slice(1, -2).join(''), 'base64').toString('base64'), certificate.derBase64);
assert(!clipboard.includes('PRIVATE KEY'));
console.log('统一验签组件测试通过：用户摘要、独立报告、原因码隐藏、隐私白名单、证书导出与两端注册');

})().catch(error => { console.error(error); process.exitCode = 1; });
