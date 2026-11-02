'use strict';

// 不依赖浏览器全局或 Node Buffer，供微信 AppService 的表格上传/导出使用。
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encodeBinaryBase64(binary) {
  const chunks = [];
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
    if (a > 255 || b > 255 || c > 255) throw new TypeError('invalid_binary_byte');
    chunks.push(ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < binary.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=')
      + (i + 2 < binary.length ? ALPHABET[c & 63] : '='));
  }
  return chunks.join('');
}
function decodeBinaryBase64(value) {
  const source = String(value).replace(/[\t\n\f\r ]/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source) || source.length % 4 === 1
    || (source.includes('=') && source.length % 4 !== 0)) throw new TypeError('invalid_base64');
  const clean = source.replace(/=+$/, '');
  const chunks = [];
  let bits = 0;
  let count = 0;
  for (let i = 0; i < clean.length; i++) {
    bits = (bits << 6) | ALPHABET.indexOf(clean[i]);
    count += 6;
    if (count >= 8) { count -= 8; chunks.push(String.fromCharCode((bits >> count) & 255)); }
  }
  return chunks.join('');
}
module.exports = { encodeBinaryBase64, decodeBinaryBase64 };
