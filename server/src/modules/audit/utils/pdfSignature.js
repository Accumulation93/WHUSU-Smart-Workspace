'use strict';

const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/utils/pdfSignature');
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

function readPemSetting(valueName, pathName) {
  const inlineValue = process.env[valueName];
  if (inlineValue) return inlineValue.replace(/\\n/g, '\n');
  const filePath = process.env[pathName];
  if (!filePath) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function splitCertificateChain(pem) {
  return String(pem || '').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
}

/**
 * 读取 CA 签发的组织级 PDF 文档签名身份。
 * 未配置时返回 null，由调用方使用临时自签名证书兼容旧数据。
 */
function getConfiguredSigningIdentity() {
  const privateKeyPem = readPemSetting('PDF_SIGNING_PRIVATE_KEY_PEM', 'PDF_SIGNING_PRIVATE_KEY_PATH');
  const certificatePem = readPemSetting('PDF_SIGNING_CERTIFICATE_PEM', 'PDF_SIGNING_CERTIFICATE_PATH');
  const certificateChainPem = readPemSetting('PDF_SIGNING_CERTIFICATE_CHAIN_PEM', 'PDF_SIGNING_CERTIFICATE_CHAIN_PATH');
  if (!privateKeyPem && !certificatePem && !certificateChainPem) return null;
  if (!privateKeyPem || !certificatePem) {
    throw new Error(localeCopy.copy_6350b591cd);
  }

  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const certificate = new crypto.X509Certificate(certificatePem);
    const privatePublicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    const certificatePublicKey = certificate.publicKey.export({ type: 'spki', format: 'der' });
    if (!privatePublicKey.equals(certificatePublicKey)) {
      throw new Error(localeCopy.copy_6fa0204352);
    }
    const chain = splitCertificateChain(certificateChainPem)
      .filter((item) => item.trim() && item.trim() !== certificatePem.trim());
    return {
      privateKeyPem,
      publicKeyPem: crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString(),
      certificatePem,
      certificateChainPem: chain.join('\n'),
      trustStatus: chain.length ? 'chain_configured' : 'certificate_configured'
    };
  } catch (error) {
    throw new Error(localeCopy.copy_6350b591cd);
  }
}

/**
 * 读取内部 CA/父证书身份。该模式只适用于组织已经把父证书根加入阅读器信任库的场景。
 * 公共 CA 通常不会把文档签名叶证书的签发私钥交给业务系统。
 */
function getConfiguredParentSigningIdentity() {
  const privateKeyPem = readPemSetting('PDF_SIGNING_PARENT_PRIVATE_KEY_PEM', 'PDF_SIGNING_PARENT_PRIVATE_KEY_PATH');
  const certificatePem = readPemSetting('PDF_SIGNING_PARENT_CERTIFICATE_PEM', 'PDF_SIGNING_PARENT_CERTIFICATE_PATH');
  const chainPem = readPemSetting('PDF_SIGNING_PARENT_CHAIN_PEM', 'PDF_SIGNING_PARENT_CHAIN_PATH');
  if (!privateKeyPem && !certificatePem && !chainPem) return null;
  if (!privateKeyPem || !certificatePem) {
    throw new Error(localeCopy.copy_6350b591cd);
  }
  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const certificate = new crypto.X509Certificate(certificatePem);
    const privatePublicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    const certificatePublicKey = certificate.publicKey.export({ type: 'spki', format: 'der' });
    if (!privatePublicKey.equals(certificatePublicKey)) {
      throw new Error(localeCopy.copy_515d8dc936);
    }
    return {
      privateKeyPem,
      certificatePem,
      chainPem
    };
  } catch (error) {
    throw new Error(localeCopy.copy_6350b591cd);
  }
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
function createSignerCertificate(privateKey, publicKey, signerName, studentId, orgName, issuerOptions) {
  const serialHex = '01' + crypto.randomBytes(15).toString('hex');
  const serialBytes = Buffer.from(serialHex, 'hex').toString('binary');
  const dnAttrs = [
    { name: 'commonName', value: signerName + (studentId ? '（' + studentId + '）' : '') }
  ];
  if (orgName) dnAttrs.push({ name: 'organizationName', value: orgName });
  const rdn = aRdn(dnAttrs);
  let issuerRdn = rdn;
  let issuerPrivateKeyObject = rsaPrivateKeyObject(forge.pki.privateKeyToPem(privateKey));
  if (issuerOptions && issuerOptions.certificatePem && issuerOptions.privateKeyPem) {
    const issuerCertNode = parseAsn1(pemDecode(issuerOptions.certificatePem));
    issuerRdn = issuerCertNode.value[0].value[5];
    issuerPrivateKeyObject = rsaPrivateKeyObject(issuerOptions.privateKeyPem);
  }
  const now = new Date();
  const tbs = aSequence([
    aContext(0, [aInteger(2)]), // X.509 v3
    aIntegerBytes(serialBytes),
    aSequence([aOid(OIDS.sha256WithRSAEncryption), aNull()]),
    issuerRdn,
    aSequence([aUtcTime(new Date(now.getTime() - 5 * 60 * 1000)), aUtcTime(new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000))]),
    rdn, // subject
    forge.pki.publicKeyToAsn1(publicKey)
  ]);
  const tbsDer = derOf(tbs);
  const signature = rsaSignSha256(issuerPrivateKeyObject, tbsDer);
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

async function buildOpenSslCms(privateKeyPem, certPem, certificateChainPem, contentBytes) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-pdfsig-'));
  const contentPath = path.join(tmpDir, 'content.bin');
  const certPath = path.join(tmpDir, 'cert.pem');
  const chainPath = path.join(tmpDir, 'chain.pem');
  const keyPath = path.join(tmpDir, 'key.pem');
  const outPath = path.join(tmpDir, 'signature.der');
  try {
    fs.writeFileSync(contentPath, contentBytes);
    fs.writeFileSync(certPath, certPem);
    if (certificateChainPem) fs.writeFileSync(chainPath, certificateChainPem);
    fs.writeFileSync(keyPath, privateKeyPem, { mode: 0o600 });
    await runOpenSsl([
      'cms', '-sign', '-binary',
      '-in', contentPath,
      '-signer', certPath,
      '-inkey', keyPath,
      ...(certificateChainPem ? ['-certfile', chainPath] : []),
      '-outform', 'DER',
      '-out', outPath,
      '-md', 'sha256'
    ]);
    return fs.readFileSync(outPath);
  } finally {
    try { fs.unlinkSync(contentPath); } catch (_) {}
    try { fs.unlinkSync(certPath); } catch (_) {}
    try { fs.unlinkSync(chainPath); } catch (_) {}
    try { fs.unlinkSync(keyPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
  }
}

class OpenSslPdfSigner extends Signer {
  constructor(privateKeyPem, certPem, certificateChainPem) {
    super();
    this.privateKeyPem = privateKeyPem;
    this.certPem = certPem;
    this.certificateChainPem = certificateChainPem || '';
  }

  async sign(pdfBuffer) {
    return buildOpenSslCms(this.privateKeyPem, this.certPem, this.certificateChainPem, pdfBuffer);
  }
}

/*
 * 备用构建器（Node crypto 手写 CMS），仅在 openssl 不可用时启用。
 */
class ForgePdfSigner extends Signer {
  constructor(privateKeyPem, certPem, certificateChainPem, signerIdentity) {
    super();
    this.privateKeyObject = rsaPrivateKeyObject(privateKeyPem);
    this.certDer = pemDecode(certPem);
    this.certificateChain = splitCertificateChain(certificateChainPem)
      .map(pemDecode);
    this.signerIdentity = signerIdentity || { name: '', studentId: '', orgName: '' };
  }

  async sign(pdfBuffer) {
    return buildFallbackCms(this.certDer, this.certificateChain, this.privateKeyObject, pdfBuffer, this.signerIdentity);
  }
}

function buildFallbackCms(certDer, certificateChain, privateKeyObject, contentBytes, signerIdentity) {
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
    aContext(0, [certNode, ...(certificateChain || []).map(parseAsn1)]),
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
  const certificateChainPem = opts.certificateChainPem || '';
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
    return await new SignPdf().sign(pdfWithPlaceholder, new OpenSslPdfSigner(privateKeyPem, certPem, certificateChainPem));
  } catch (e) {
    // openssl 不可用时回退到自建 CMS（Node crypto 签名）
    return new SignPdf().sign(
      pdfWithPlaceholder,
      new ForgePdfSigner(privateKeyPem, certPem, certificateChainPem, opts.signer || { name: '', studentId: '', orgName: '' })
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
  const normalizedX = Number.isFinite(Number(position.x)) ? Math.max(0, Math.min(1, Number(position.x))) : 0.5;
  const normalizedY = Number.isFinite(Number(position.y)) ? Math.max(0, Math.min(1, Number(position.y))) : 0.5;
  const cx = normalizedX * width;
  const cy = height - (normalizedY * height);
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

function getCertificateTrustStatus(certNode, certsNode) {
  try {
    const tbs = certNode.value[0];
    const issuer = tbs.value[3];
    const subject = tbs.value[5];
    if (issuer && subject && derOf(issuer).equals(derOf(subject))) return 'self_signed';
    if (certsNode && certsNode.value && certsNode.value.length > 1) return 'chain_present';
    return 'issuer_not_embedded';
  } catch (_) {
    return 'unknown';
  }
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

    let certNode = null;
    if (certsNode && certsNode.value && certsNode.value.length) {
      const signerSid = siBody[1];
      const signerSerial = signerSid && signerSid.value && signerSid.value[1]
        ? signerSid.value[1].value
        : null;
      certNode = certsNode.value.find((candidate) => {
        try {
          return signerSerial && candidate.value && candidate.value[0] &&
            candidate.value[0].value[1] &&
            Buffer.from(candidate.value[0].value[1].value, 'binary').equals(Buffer.from(signerSerial, 'binary'));
        } catch (_) {
          return false;
        }
      }) || certsNode.value[0];
    }
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
      const trustStatus = getCertificateTrustStatus(certNode, certsNode);
      return {
        ok: true,
        signerName,
        studentId,
        algorithm: 'RSA-SHA256',
        trustStatus,
        error: ''
      };
    } else {
      return { ok: false, signerName, studentId, error: '缺少签名者证书' };
    }
  } catch (e) {
    return { ok: false, signerName: '', studentId: '', error: safeError(e) };
  }
}

function readDerPayloadLength(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return 0;
  const firstLengthByte = buffer[1];
  if ((firstLengthByte & 0x80) === 0) return 2 + firstLengthByte;
  const lengthByteCount = firstLengthByte & 0x7f;
  if (!lengthByteCount || lengthByteCount > 6 || buffer.length < 2 + lengthByteCount) return 0;
  let payloadLength = 0;
  for (let index = 0; index < lengthByteCount; index += 1) {
    payloadLength = payloadLength * 256 + buffer[2 + index];
  }
  const totalLength = 2 + lengthByteCount + payloadLength;
  return Number.isSafeInteger(totalLength) ? totalLength : 0;
}

function extractCmsDerFromPdfContents(pdfBuffer, byteRange) {
  if (!Buffer.isBuffer(pdfBuffer) || !Array.isArray(byteRange) || byteRange.length !== 4) return null;
  const contentsStart = Number(byteRange[0]) + Number(byteRange[1]);
  const contentsEnd = Number(byteRange[2]);
  if (!Number.isSafeInteger(contentsStart) || !Number.isSafeInteger(contentsEnd)
    || contentsStart < 0 || contentsEnd <= contentsStart || contentsEnd > pdfBuffer.length) return null;
  const rawContents = pdfBuffer.slice(contentsStart, contentsEnd).toString('ascii');
  const openIndex = rawContents.indexOf('<');
  const closeIndex = rawContents.lastIndexOf('>');
  if (openIndex < 0 || closeIndex <= openIndex) return null;
  const signatureHex = rawContents.slice(openIndex + 1, closeIndex).replace(/\s+/g, '');
  if (!signatureHex || signatureHex.length % 2 !== 0 || /[^0-9a-f]/i.test(signatureHex)) return null;
  const paddedDer = Buffer.from(signatureHex, 'hex');
  const derLength = readDerPayloadLength(paddedDer);
  if (!derLength || derLength > paddedDer.length) return null;
  return paddedDer.subarray(0, derLength);
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
    const cmsDer = extractCmsDerFromPdfContents(pdfBuffer, extracted.ByteRange)
      || Buffer.from(extracted.signature, 'binary');
    const result = verifyCmsDer(cmsDer, extracted.signedData);
    signatures.push({
      ok: result.ok,
      signerName: result.signerName || '',
      studentId: result.studentId || '',
      algorithm: result.algorithm || 'RSA-SHA256',
      trustStatus: result.trustStatus || 'unknown',
      error: result.error || ''
    });
  }
  return {
    present: signatures.length > 0,
    valid: signatures.length > 0 && signatures.every((s) => s.ok),
    trusted: signatures.length > 0 && signatures.every((s) => s.trustStatus === 'chain_present'),
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
  pemDecode,
  getConfiguredSigningIdentity,
  getConfiguredParentSigningIdentity,
  extractCmsDerFromPdfContents
};
