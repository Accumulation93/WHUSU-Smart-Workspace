'use strict';

const crypto = require('crypto');
const forge = require('node-forge');
const { PDFDocument } = require('pdf-lib');
const { SignPdf } = require('@signpdf/signpdf');
const { Signer, extractSignature } = require('@signpdf/utils');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');

const SIGNATURE_LENGTH = 16384;

// node-forge 的高层 pkcs7 只负责构建、不实现验签，且 DN 编码依赖 unescape
// （Node 22+ 下中文会损坏）。这里用 forge 的 asn1 原语自行构建 X.509 证书与
// CMS/PKCS#7（UTF-8 全部由 Buffer 显式编码），并自行实现验签。
const asn1 = forge.asn1;
const pki = forge.pki;
const OIDS = forge.pki.oids;

function sha256Bytes(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

function utf8Bytes(str) {
  return Buffer.from(str, 'utf8').toString('binary');
}

// ── ASN.1 小工具 ─────────────────────────────────────────────
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
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTF8, false, utf8Bytes(str));
}

function aBitString(bytes) {
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BITSTRING, false, '\x00' + bytes);
}

function aUtcTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const value = pad(y % 100) + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
    pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z';
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false, value);
}

function aRdn(attrs) {
  return aSequence(attrs.map((attr) => aSet([
    aSequence([
      aOid(OIDS[attr.name]),
      aUtf8(attr.value)
    ])
  ])));
}

function derOf(node) {
  return Buffer.from(asn1.toDer(node).getBytes(), 'binary');
}

function parseAsn1(bytes) {
  return asn1.fromDer(forge.util.createBuffer(bytes.toString('binary'), 'binary'));
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
 * 生成自签名 X.509 v3 证书（DER），CN 为“姓名（学号）”，UTF-8 显式编码，
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
  const notBefore = new Date(now.getTime() - 5 * 60 * 1000);
  const notAfter = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000);

  const tbs = aSequence([
    aContext(0, [aInteger(2)]), // X.509 v3 version: [0] EXPLICIT INTEGER
    aIntegerBytes(serialBytes),
    aSequence([aOid(OIDS.sha256WithRSAEncryption), aNull()]),
    rdn,
    aSequence([aUtcTime(notBefore), aUtcTime(notAfter)]),
    rdn,
    forge.pki.publicKeyToAsn1(publicKey)
  ]);
  const tbsDer = derOf(tbs);
  const md = forge.md.sha256.create();
  md.update(tbsDer.toString('binary'), 'raw');
  const signature = privateKey.sign(md);

  const certDer = derOf(aSequence([
    tbs,
    aSequence([aOid(OIDS.sha256WithRSAEncryption), aNull()]),
    aBitString(signature)
  ]));
  return pemEncode('CERTIFICATE', certDer);
}

function pemEncode(type, derBytes) {
  const body = Buffer.from(derBytes).toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '');
  return '-----BEGIN ' + type + '-----\n' + body + '\n-----END ' + type + '-----\n';
}

function pemDecode(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Buffer.from(b64, 'base64');
}

// ── CMS / PKCS#7 构建 ────────────────────────────────────────
function buildCmsDer(certDer, privateKey, contentBytes, signingTime) {
  const certNode = parseAsn1(certDer);
  const tbs = certNode.value[0];
  const serialNode = tbs.value[1]; // INTEGER
  const serialBytes = serialNode.value;
  const issuerRdn = tbs.value[3]; // issuer RDNSequence

  const md = forge.md.sha256.create();
  md.update(contentBytes.toString('binary'), 'raw');
  const contentDigest = md.digest().getBytes();

  const signedAttrs = aSet([
    aSequence([aOid(OIDS.contentType), aSet([aOid(OIDS.data)])]),
    aSequence([aOid(OIDS.signingTime), aSet([aUtcTime(signingTime || new Date())])]),
    aSequence([aOid(OIDS.messageDigest), aSet([aOctets(contentDigest)])])
  ]);
  const signedAttrsDer = derOf(signedAttrs);
  const attrsMd = forge.md.sha256.create();
  attrsMd.update(signedAttrsDer.toString('binary'), 'raw');
  const encryptedDigest = privateKey.sign(attrsMd);

  const signerInfo = aSequence([
    aInteger(1),
    aSequence([issuerRdn, aIntegerBytes(serialBytes)]),
    aSequence([aOid(OIDS.sha256), aNull()]),
    aContext(0, [signedAttrs]),
    aSequence([aOid(OIDS.rsaEncryption), aNull()]),
    aOctets(encryptedDigest)
  ]);

  const signedData = aSequence([
    aInteger(1),
    aSet([aSequence([aOid(OIDS.sha256), aNull()])]),
    aSequence([aOid(OIDS.data)]),
    aContext(0, [certNode]),
    aSet([signerInfo])
  ]);

  const contentInfo = aSequence([
    aOid(OIDS.signedData),
    aContext(0, [signedData])
  ]);
  return derOf(contentInfo);
}

class ForgePdfSigner extends Signer {
  constructor(privateKey, certPem) {
    super();
    this.privateKey = privateKey;
    this.certDer = pemDecode(certPem);
  }

  async sign(pdfBuffer) {
    return buildCmsDer(this.certDer, this.privateKey, pdfBuffer, new Date());
  }
}

/**
 * 给 PDF 追加符合 PDF 规范的 PKCS#7 数字签名（私钥仅在服务端）。
 */
async function signPdfBuffer(pdfBuffer, privateKeyPem, certPem) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
  pdflibAddPlaceholder({
    pdfDoc,
    reason: 'WHUSU智慧工作台电子签名',
    contactInfo: 'WHUSU智慧工作台',
    name: 'WHUSU智慧工作台',
    location: 'WHUSU智慧工作台',
    signatureLength: SIGNATURE_LENGTH,
    subFilter: 'adbe.pkcs7.detached'
  });
  const pdfWithPlaceholder = Buffer.from(await pdfDoc.save());
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  return new SignPdf().sign(pdfWithPlaceholder, new ForgePdfSigner(privateKey, certPem));
}

// ── CMS / PKCS#7 验签 ────────────────────────────────────────
function extractSubjectCn(certNode) {
  try {
    // 手工读取 subject RDN 中的 commonName UTF8String，绕开 forge decodeUtf8
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
    const signedData = root.value[1].value[0]; // [0] SignedData
    const body = signedData.value; // [version, digestAlgs, encap, certs?, signerInfos]
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

    const signer = signerInfosNode.value[0]; // SignerInfo SEQUENCE
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
      const attrsSet = signedAttrsNode.value[0];
      if (!attrsSet || !attrsSet.value) {
        return { ok: false, signerName: '', studentId: '', error: '签名属性解析失败' };
      }
      let messageDigestAttr = null;
      for (const attrNode of attrsSet.value) {
        const attrBody = attrNode.value;
        if (!attrBody || attrBody.length < 2) continue;
        if (attrBody[0].type === asn1.Type.OID &&
            asn1.derToOid(attrBody[0].value) === OIDS.messageDigest) {
          messageDigestAttr = attrBody[1];
        }
      }
      if (messageDigestAttr) {
        const attrDigest = Buffer.from(messageDigestAttr.value[0].value, 'binary');
        if (!attrDigest.equals(contentDigest)) {
          return { ok: false, signerName: '', studentId: '', error: '签名摘要不匹配（文档已变更）' };
        }
      }
      signedBytesForSig = derOf(attrsSet);
    }

    const certNode = certsNode && certsNode.value && certsNode.value[0];
    let signerName = '';
    let studentId = '';
    if (certNode) {
      const identity = extractSubjectCn(certNode);
      signerName = identity.signerName;
      studentId = identity.studentId;
      const tbsNode = certNode.value[0];
      const spkiNode = tbsNode.value[6]; // SubjectPublicKeyInfo
      const publicKey = pki.publicKeyFromAsn1(spkiNode);
      const publicKeyPem = pki.publicKeyToPem(publicKey);
      let cryptoOk = false;
      try {
        const publicKeyObject = crypto.createPublicKey(publicKeyPem);
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

/**
 * 校验 PDF 中嵌入的所有 PKCS#7 数字签名。
 */
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
  verifyPdfSignature
};
