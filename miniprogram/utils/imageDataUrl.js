'use strict';

// 图片 Data URL 工具。
// 小程序没有 atob / Buffer，这里手写 base64 前缀解码，按文件真实字节判定图片类型，
// 不依赖 wx.chooseImage 临时文件路径的扩展名：压缩后的临时路径经常没有扩展名，
// 或扩展名与实际编码不一致，会导致服务端图片类型校验失败。
// 判定口径与 server/src/modules/audit/utils/auditImageData.js 的 detectImageMimeType 一致：
// PNG（含透明通道）、JPEG、WebP、GIF、BMP。

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function stripBase64(value) {
  return String(value == null ? '' : value).replace(/[\s\r\n]/g, '');
}

function textBytes(text) {
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    bytes.push(text.charCodeAt(index) & 0xff);
  }
  return bytes;
}

function decodeBase64Prefix(value, byteLength) {
  const text = stripBase64(value);
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < text.length && bytes.length < byteLength; index += 1) {
    const char = text.charAt(index);
    if (char === '=') break;
    const decoded = BASE64_ALPHABET.indexOf(char);
    if (decoded < 0) return [];
    buffer = (buffer << 6) | decoded;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function matches(bytes, offset, expected) {
  if (bytes.length < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

function detectImageMimeType(value) {
  const head = decodeBase64Prefix(value, 16);
  if (!head.length) return '';
  if (matches(head, 0, PNG_SIGNATURE)) return 'image/png';
  if (matches(head, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (matches(head, 0, textBytes('GIF87a')) || matches(head, 0, textBytes('GIF89a'))) return 'image/gif';
  if (matches(head, 0, textBytes('BM'))) return 'image/bmp';
  if (matches(head, 0, textBytes('RIFF')) && matches(head, 8, textBytes('WEBP'))) return 'image/webp';
  return '';
}

function estimateByteLength(value) {
  const text = stripBase64(value);
  if (!text) return 0;
  let padding = 0;
  if (text.charAt(text.length - 1) === '=') padding += 1;
  if (text.charAt(text.length - 2) === '=') padding += 1;
  return Math.max(0, Math.floor(text.length * 3 / 4) - padding);
}

// 把 readFile 读到的 base64 组装成 Data URL。
// 返回 { ok: true, mimeType, byteLength, dataUrl }，或 { ok: false, reason }，
// reason 为 unsupported（格式不支持）或 too_large（超过体积上限）。
function buildImageDataUrl(value, options) {
  const base64 = stripBase64(value);
  if (!base64) return { ok: false, reason: 'unsupported' };
  const limit = Math.max(1, Number(options && options.maxBytes) || MAX_IMAGE_BYTES);
  const byteLength = estimateByteLength(base64);
  if (byteLength > limit) return { ok: false, reason: 'too_large' };
  const mimeType = detectImageMimeType(base64);
  if (!mimeType) return { ok: false, reason: 'unsupported' };
  return {
    ok: true,
    mimeType,
    byteLength,
    dataUrl: 'data:' + mimeType + ';base64,' + base64
  };
}

module.exports = {
  MAX_IMAGE_BYTES,
  detectImageMimeType,
  estimateByteLength,
  buildImageDataUrl
};
