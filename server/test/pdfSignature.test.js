'use strict';

const assert = require('assert');
const { PDFDocument } = require('pdf-lib');
const {
  generateSigningKeyPair,
  createSignerCertificate,
  signPdfBuffer,
  verifyPdfSignature
} = require('../src/modules/audit/utils/pdfSignature');

async function buildBlankPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

(async () => {
  const pdf = await buildBlankPdf();
  const pair = generateSigningKeyPair();
  const certPem = createSignerCertificate(
    pair.privateKey,
    pair.publicKey,
    '张三',
    '20210001',
    '武汉大学第四十四届学生会'
  );
  const nodeCert = new (require('crypto').X509Certificate)(certPem);
  assert(nodeCert.subject.includes('张三'), '证书 DN 应包含真实姓名（严格 X.509 解析）');
  assert(nodeCert.subject.includes('20210001'), '证书 DN 应包含学号（严格 X.509 解析）');

  const signed = await signPdfBuffer(pdf, pair.privateKeyPem, certPem, {
    signer: { name: '张三', studentId: '20210001', orgName: '武汉大学第四十四届学生会' },
    signaturePosition: { x: 0.5, y: 0.5, page: 1 }
  });
  assert(signed.includes('/Type /Sig'), '签名后 PDF 应包含签名对象');
  assert(signed.includes('/ByteRange ['), '签名后 PDF 应包含 ByteRange');
  assert(signed.includes('/Name (WHUSU Smart Workspace)'), '签名元数据不应包含乱码');
  assert(!/\/Name \([^)]*[\x80-\xff]/.test(signed.toString('binary')), '签名元数据不应出现非 ASCII 乱码');

  const verify = verifyPdfSignature(signed);
  assert.strictEqual(verify.present, true, '应识别出 PDF 数字签名');
  assert.strictEqual(verify.valid, true, '数字签名应有效');
  assert.strictEqual(verify.signatures.length, 1, '应解析出 1 个签名');
  assert.strictEqual(verify.signatures[0].ok, true, '签名校验应通过');
  assert.strictEqual(verify.signatures[0].signerName, '张三', '签名人姓名应为真实姓名');
  assert.strictEqual(verify.signatures[0].studentId, '20210001', '签名人学号应正确');

  // 篡改签名覆盖区内的内容 → 验签必须失败
  const tampered = Buffer.from(signed);
  const sigTagIndex = tampered.indexOf('/Type /Sig');
  assert(sigTagIndex >= 0, '应能找到签名对象标记');
  tampered[sigTagIndex] = tampered[sigTagIndex] === 0x53 ? 0x54 : 0x53;
  const verifyTampered = verifyPdfSignature(tampered);
  assert.strictEqual(verifyTampered.valid, false, '篡改后验签必须失败');

  console.log('PDF 数字签名/验签测试通过：签名、身份（姓名+学号）、篡改检测均正常');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
