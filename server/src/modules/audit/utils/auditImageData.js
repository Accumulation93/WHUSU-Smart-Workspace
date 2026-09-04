'use strict';

const MAX_AUDIT_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['png', 'jpeg', 'jpg', 'webp']);

function detectImageMimeType(buffer) {
  if (!buffer || buffer.length < 4) return '';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

function inspectAuditImageData(value, maxBytes) {
  if (typeof value !== 'string') return { ok: false, reason: 'format' };
  const source = value.trim();
  const byteLimit = Math.max(1, Number(maxBytes) || MAX_AUDIT_IMAGE_BYTES);
  const encodedLimit = Math.ceil(byteLimit * 4 / 3) + 8;
  if (source.length > encodedLimit + 64) return { ok: false, reason: 'too_large' };

  const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(source);
  if (!match || !ALLOWED_IMAGE_MIME_TYPES.has(match[1].toLowerCase())) {
    return { ok: false, reason: 'format' };
  }
  const encoded = match[2].replace(/[\r\n]/g, '');
  if (!encoded || encoded.length > encodedLimit || encoded.length % 4 === 1) {
    return { ok: false, reason: encoded.length > encodedLimit ? 'too_large' : 'format' };
  }
  try {
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length) return { ok: false, reason: 'format' };
    if (buffer.length > byteLimit) return { ok: false, reason: 'too_large' };
    const declaredMimeType = match[1].toLowerCase() === 'jpg'
      ? 'image/jpeg'
      : 'image/' + match[1].toLowerCase();
    const detectedMimeType = detectImageMimeType(buffer);
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
      return { ok: false, reason: 'format' };
    }
    return {
      ok: true,
      mimeType: detectedMimeType,
      byteLength: buffer.length
    };
  } catch (_) {
    return { ok: false, reason: 'format' };
  }
}

function isValidAuditImageData(value, maxBytes) {
  return inspectAuditImageData(value, maxBytes).ok;
}

module.exports = {
  MAX_AUDIT_IMAGE_BYTES,
  detectImageMimeType,
  inspectAuditImageData,
  isValidAuditImageData
};
