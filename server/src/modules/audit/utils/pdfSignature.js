'use strict';

const crypto = require('crypto');
const forge = require('node-forge');
const { PDFDocument } = require('pdf-lib');
const { SignPdf } = require('@signpdf/signpdf');
const { Signer, extractSignature } = require('@signpdf/utils');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');

const SIGNATURE_LENGTH = 16384;

// node-forge 的 RSA PKCS#1 v1.5 签名填充在 Node 22+ 下损坏（OpenSSL 严格校验
// 会报 invalid padding）。证书与 CMS 签名一律改用 Node 原生 crypto.sign/verify。
// 证书 DN 的 UTF-8 编解码也改用 Buffer 显式实现。
forge.util.encodeUtf8 = function encodeUtf8(str) {
  if (typeof str !== 'string') return str;
  return Buffer.from(str, 'utf8').toString('binary');
};
forge.util.decodeUtf8 = function decodeUtf8(bytes) {
  if (typeof bytes !== 'string') return bytes;
  return Buffer.from(bytes, 'binary').toString('utf8');
};

const asn1 = forge.asn1;
const pki = forge.pki;
const OIDS = forge.pki.oids;

function sha256Bytes(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

function aInteger(value) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(value).getBytes());
}

function aIntegerBytes(bytes) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, bytes);
}

function aOid(oidStr) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oidStr).getBytes());
}

function aNull() {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '');
}

function aSequence(children) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children);
}

function aSet(children) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, children);
}

function aContext(n, children) {
  return asn1.create(asn1.Class.CONTEXT_SPECIFIC, n, true, children);
}

function aOctets(bytes) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, bytes);
}

function aUtf8(str) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTF8, false, Buffer.from(str, 'utf8').toString('binary'));
}

function aBitString(bytes) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BITSTRING, false, '\x00' + bytes);
}

function aUtcTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const value = pad(date.getUTCFullYear() % 100) + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
    pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z';
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false, value);
}

function aRdn(attrs) {
  return aSequence(attrs.map((attr) => aSet([
    aSequence([aOid(OIDS[attr.name]), aUtf8(attr.value)])
  ])));
}

function derOf(node) {
  return Buffer.from(asn1.toDer(node).getBytes(), 'binary');
}

function parseAsn1(bytes) {
  return asn1.fromDer(forge.util.createBuffer(bytes.toString('binary'), 'binary'));
}

function pemDecode(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Buffer.from(b64, 'base64');
}

function pemEncode(type, derBytes) {
  const body = Buffer.from(derBytes).toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '');
  return '-----BEGIN ' + type + '-----\n' + body + '\n-----END ' + type + '-----\n';
}

function rsaPrivateKeyObject(privateKeyPem) {
  return crypto.createPrivateKey(privateKeyPem);
}

function rsaSignSha256(privateKeyObject, dataBuffer) {
  return crypto.sign('sha256', dataBuffer, privateKeyObject);
}

// ── 密钥对与证书 ─────────────────────────────────────────────
function generateSigningKeyPair() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  return {
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    publicKeyPem: forge.pki.publicKeyToPem(keys.publicKey)
  };
}

/**
 * 生成自签名 X.509 v3 证书（Node crypto 签名），CN 为“姓名（学号）”，
 * 供 Acrobat 等 PDF 软件显示“由 姓名（学号）签署”。
 */
function createSignerCertificate(privateKey, publicKey, signerName, studentId, orgName) {
  const serialHex = '01' + crypto.randomBytes(15).toString('hex');
  const serialBytes = Buffer.from(serialHex, 'hex').toString('binary');
  const dnAttrs = [
    { name: 'commonName', value: signerName + (studentId ? '（' + studentId + '）' : '') }
  ];
  if (orgName) dnAttrs.push({ name: 'organizationName', value: orgName });
  const rdn = aRdn(dnAttrs);
  const now = new Date();
  const tbs = aSequence([
    aContext(0, [aInteger(2)]), // X.509 v3
    aIntegerBytes(serialBytes),
    aSequence([aOid(OIDS.sha256WithRSAEncryption), aNull()]),
    rdn, // issuer
    aSequence([aUtcTime(new Date(now.getTime() - 5 * 60 * 1000)), aUtcTime(new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000))]),
    rdn, // subject
    forge.pki.publicKeyToAsn1(publicKey)
  ]);
  const tbsDer = derOf(tbs);
  const privateKeyObject = rsaPrivateKeyObject(forge.pki.privateKeyToPem(privateKey));
  const signature = rsaSignSha256(privateKeyObject, tbsDer);
  const certDer = derOf(aSequence([
    tbs,
    aSequence([aOid(OIDS.sha256WithRSAEncryption), aNull()]),
    aBitString(signature.toString('binary'))
  ]));
  return pemEncode('CERTIFICATE', certDer);
}

// ── CMS / PKCS#7 构建（openssl 生成，兼容 Acrobat/OpenSSL）───
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function runOpenSsl(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile('openssl', args, { timeout: timeoutMs || 30000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function buildOpenSslCms(privateKeyPem, certPem, contentBytes) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-pdfsig-'));
  const contentPath = path.join(tmpDir, 'content.bin');
  const certPath = path.join(tmpDir, 'cert.pem');
  const keyPath = path.join(tmpDir, 'key.pem');
  const outPath = path.join(tmpDir, 'signature.der');
  try {
    fs.writeFileSync(contentPath, contentBytes);
    fs.writeFileSync(certPath, certPem);
    fs.writeFileSync(keyPath, privateKeyPem, { mode: 0o600 });
    await runOpenSsl([
      'cms', '-sign', '-binary',
      '-in', contentPath,
      '-signer', certPath,
      '-inkey', keyPath,
      '-outform', 'DER',
      '-out', outPath,
      '-md', 'sha256'
    ]);
    return fs.readFileSync(outPath);
  } finally {
    try { fs.unlinkSync(contentPath); } catch (_) {}
    try { fs.unlinkSync(certPath); } catch (_) {}
    try { fs.unlinkSync(keyPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
  }
}

class OpenSslPdfSigner extends Signer {
  constructor(privateKeyPem, certPem) {
    super();
    this.privateKeyPem = privateKeyPem;
    this.certPem = certPem;
  }

  async sign(pdfBuffer) {
    return buildOpenSslCms(this.privateKeyPem, this.certPem, pdfBuffer);
  }
}

/*
 * 备用构建器（Node crypto 手写 CMS），仅在 openssl 不可用时启用。
 */
class ForgePdfSigner extends Signer {
  constructor(privateKeyPem, certPem, signerIdentity) {
    super();
    this.privateKeyObject = rsaPrivateKeyObject(privateKeyPem);
    this.certDer = pemDecode(certPem);
    this.signerIdentity = signerIdentity || { name: '', studentId: '', orgName: '' };
  }

  async sign(pdfBuffer) {
    return buildFallbackCms(this.certDer, this.privateKeyObject, pdfBuffer, this.signerIdentity);
  }
}

function buildFallbackCms(certDer, privateKeyObject, contentBytes, signerIdentity) {
  const certNode = parseAsn1(certDer);
  const tbs = certNode.value[0];
  const serialBytes = tbs.value[1].value;
  const contentDigest = sha256Bytes(contentBytes).toString('binary');
  const signedAttrsChildren = [
    aSequence([aOid(OIDS.contentType), aSet([aOid(OIDS.data)])]),
    aSequence([aOid(OIDS.signingTime), aSet([aUtcTime(new Date())])]),
    aSequence([aOid(OIDS.messageDigest), aSet([aOctets(contentDigest)])])
  ];
  const encryptedDigest = rsaSignSha256(privateKeyObject, derOf(aSet(signedAttrsChildren)));
  const sidRdn = signerIdentity && (signerIdentity.name || signerIdentity.orgName)
    ? aRdn(fallbackSignerRdnAttrs(signerIdentity))
    : tbs.value[3];
  const signerInfo = aSequence([
    aInteger(1),
    aSequence([sidRdn, aIntegerBytes(serialBytes)]),
    aSequence([aOid(OIDS.sha256), aNull()]),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, signedAttrsChildren),
    aSequence([aOid(OIDS.rsaEncryption), aNull()]),
    aOctets(encryptedDigest.toString('binary'))
  ]);
  const signedData = aSequence([
    aInteger(1),
    aSet([aSequence([aOid(OIDS.sha256), aNull()])]),
    aSequence([aOid(OIDS.data)]),
    aContext(0, [certNode]),
    aSet([signerInfo])
  ]);
  return derOf(aSequence([aOid(OIDS.signedData), aContext(0, [signedData])]));
}

function fallbackSignerRdnAttrs(signerIdentity) {
  const attrs = [{
    name: 'commonName',
    value: signerIdentity.name + (signerIdentity.studentId ? '（' + signerIdentity.studentId + '）' : '')
  }];
  if (signerIdentity.orgName) attrs.push({ name: 'organizationName', value: signerIdentity.orgName });
  return attrs;
}

/**
 * 给 PDF 追加符合 PDF 规范的 PKCS#7 数字签名（私钥仅在服务端）。
 * options.signaturePosition: { x, y, page } 让签名域靠近可见签名图案。
 */
async function signPdfBuffer(pdfBuffer, privateKeyPem, certPem, options) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
  const opts = options || {};
  const widgetRect = computeWidgetRect(pdfDoc, opts.signaturePosition);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: 'WHUSU Smart Workspace eSignature',
    contactInfo: 'WHUSU Smart Workspace',
    name: 'WHUSU Smart Workspace',
    location: '',
    signatureLength: SIGNATURE_LENGTH,
    subFilter: 'adbe.pkcs7.detached',
    ...(widgetRect ? { widgetRect } : {})
  });
  const pdfWithPlaceholder = Buffer.from(await pdfDoc.save());
  try {
    return await new SignPdf().sign(pdfWithPlaceholder, new OpenSslPdfSigner(privateKeyPem, certPem));
  } catch (e) {
    // openssl 不可用时回退到自建 CMS（Node crypto 签名）
    return new SignPdf().sign(
      pdfWithPlaceholder,
      new ForgePdfSigner(privateKeyPem, certPem, opts.signer || { name: '', studentId: '', orgName: '' })
    );
  }
}

function computeWidgetRect(pdfDoc, position) {
  if (!position || !pdfDoc) return null;
  const pageNum = parseInt(position.page, 10) || 1;
  const pages = pdfDoc.getPages();
  const page = pages[Math.max(0, Math.min(pageNum - 1, pages.length - 1))];
  if (!page) return null;
  const { width, height } = page.getSize();
  const rectWidth = Math.min(190, Math.max(110, width * 0.22));
  const rectHeight = 46;
  const cx = (parseFloat(position.x) || 0.5) * width;
  const cy = height - ((parseFloat(position.y) || 0.5) * height);
  const x1 = Math.max(0, Math.min(width - rectWidth, cx - rectWidth / 2));
  const y1 = Math.max(0, Math.min(height - rectHeight, cy - rectHeight / 2));
  return [x1, y1, x1 + rectWidth, y1 + rectHeight];
}

// ── CMS / PKCS#7 验签 ────────────────────────────────────────
function extractSubjectCn(certNode) {
  try {
    const subject = certNode.value[0].value[5]; // Certificate→TBSCertificate→subject
    if (!subject || !subject.value) return { signerName: '', studentId: '' };
    for (const setNode of subject.value) {
      const ava = setNode.value && setNode.value[0];
      if (!ava || !ava.value || ava.value.length < 2) continue;
      const oidNode = ava.value[0];
      const valueNode = ava.value[1];
      if (oidNode.type === asn1.Type.OID && valueNode.type === asn1.Type.UTF8) {
        const oidStr = asn1.derToOid(oidNode.value);
        if (oidStr === OIDS.commonName) {
          const cn = Buffer.from(valueNode.value, 'binary').toString('utf8');
          const match = /^(.+?)（([^（）]+)）$/.exec(cn);
          if (match) return { signerName: match[1], studentId: match[2] };
          return { signerName: cn, studentId: '' };
        }
      }
    }
  } catch (_) { /* fallthrough */ }
  return { signerName: '', studentId: '' };
}

function verifyCmsDer(cmsDer, contentBytes) {
  let root;
  try {
    root = parseAsn1(cmsDer);
  } catch (e) {
    return { ok: false, signerName: '', studentId: '', error: 'CMS 解析失败：' + safeError(e) };
  }
  try {
    const signedData = root.value[1].value[0];
    const body = signedData.value;
    let certsNode = null;
    let signerInfosNode = null;
    for (let i = 2; i < body.length; i += 1) {
      const el = body[i];
      if (el.tagClass === asn1.Class.CONTEXT_SPECIFIC && el.type === 0) certsNode = el;
      else if (el.tagClass === asn1.Class.UNIVERSAL && el.type === asn1.Type.SET) signerInfosNode = el;
    }
    if (!signerInfosNode || !signerInfosNode.value || !signerInfosNode.value.length) {
      return { ok: false, signerName: '', studentId: '', error: '未找到签名者信息' };
    }

    const signer = signerInfosNode.value[0];
    const siBody = signer.value;
    let signedAttrsNode = null;
    let signatureNode = null;
    for (let i = 2; i < siBody.length; i += 1) {
      const el = siBody[i];
      if (el.tagClass === asn1.Class.CONTEXT_SPECIFIC && el.type === 0) signedAttrsNode = el;
      else if (el.tagClass === asn1.Class.UNIVERSAL && el.type === asn1.Type.OCTETSTRING) signatureNode = el;
    }
    if (!signatureNode) {
      return { ok: false, signerName: '', studentId: '', error: '签名值缺失' };
    }
    const signatureBytes = Buffer.from(signatureNode.value, 'binary');
    const contentDigest = sha256Bytes(contentBytes);
    let signedBytesForSig = contentBytes;

    if (signedAttrsNode) {
      const attrs = signedAttrsNode.value;
      if (!attrs || !attrs.length) {
        return { ok: false, signerName: '', studentId: '', error: '签名属性解析失败' };
      }
      let messageDigestAttr = null;
      for (const attrNode of attrs) {
        const attrBody = attrNode.value;
        if (!attrBody || attrBody.length < 2) continue;
        if (attrBody[0].type === asn1.Type.OID &&
            asn1.derToOid(attrBody[0].value) === OIDS.messageDigest) {
          messageDigestAttr = attrBody[1];
        }
      }
      if (messageDigestAttr && messageDigestAttr.value && messageDigestAttr.value[0]) {
        const attrDigest = Buffer.from(messageDigestAttr.value[0].value, 'binary');
        if (!attrDigest.equals(contentDigest)) {
          return { ok: false, signerName: '', studentId: '', error: '签名摘要不匹配（文档已变更）' };
        }
      }
      signedBytesForSig = derOf(aSet(attrs));
    }

    const certNode = certsNode && certsNode.value && certsNode.value[0];
    let signerName = '';
    let studentId = '';
    if (certNode) {
      const identity = extractSubjectCn(certNode);
      signerName = identity.signerName;
      studentId = identity.studentId;
      const spkiNode = certNode.value[0].value[6];
      const publicKey = pki.publicKeyFromAsn1(spkiNode);
      const publicKeyObject = crypto.createPublicKey(pki.publicKeyToPem(publicKey));
      let cryptoOk = false;
      try {
        cryptoOk = crypto.verify('sha256', signedBytesForSig, publicKeyObject, signatureBytes);
      } catch (_) {
        cryptoOk = false;
      }
      if (!cryptoOk) {
        return { ok: false, signerName, studentId, error: '签名者证书校验失败' };
      }
    } else {
      return { ok: false, signerName, studentId, error: '缺少签名者证书' };
    }

    return { ok: true, signerName, studentId, algorithm: 'RSA-SHA256', error: '' };
  } catch (e) {
    return { ok: false, signerName: '', studentId: '', error: safeError(e) };
  }
}

function verifyPdfSignature(pdfBuffer) {
  const signatures = [];
  let index = 1;
  for (;;) {
    let extracted;
    try {
      extracted = extractSignature(pdfBuffer, index);
    } catch (_) {
      break;
    }
    index += 1;
    const cmsDer = Buffer.from(extracted.signature, 'binary');
    const result = verifyCmsDer(cmsDer, extracted.signedData);
    signatures.push({
      ok: result.ok,
      signerName: result.signerName || '',
      studentId: result.studentId || '',
      algorithm: result.algorithm || 'RSA-SHA256',
      error: result.error || ''
    });
  }
  return {
    present: signatures.length > 0,
    valid: signatures.length > 0 && signatures.every((s) => s.ok),
    signatures
  };
}

function safeError(e) {
  return e && e.message ? String(e.message) : '验签失败';
}

module.exports = {
  generateSigningKeyPair,
  createSignerCertificate,
  signPdfBuffer,
  verifyPdfSignature,
  pemDecode
};
