const crypto = require('crypto');
const { safeString } = require('../../utils/helpers');

function secret() {
  const value = safeString(process.env.AUTH_IDENTITY_SECRET || process.env.JWT_SECRET);
  if (!value) throw new Error('AUTH_IDENTITY_SECRET or JWT_SECRET is required');
  return value;
}

function hmac(value) {
  return crypto.createHmac('sha256', secret()).update(safeString(value)).digest('hex');
}

function legacyHash(value) {
  return crypto.createHash('sha256').update(safeString(value)).digest('hex');
}

function randomCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let index = 0; index < (length || 12); index += 1) {
    value += chars[crypto.randomInt(0, chars.length)];
  }
  return value;
}

function encryptOpenid(openid) {
  const key = crypto.createHash('sha256').update(secret() + ':openid').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(safeString(openid), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptOpenid(ciphertext) {
  const payload = Buffer.from(safeString(ciphertext), 'base64');
  if (payload.length < 29) throw new TypeError();
  const key = crypto.createHash('sha256').update(secret() + ':openid').digest();
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function hashPassphrase(passphrase, salt) {
  const actualSalt = salt || crypto.randomBytes(16).toString('base64');
  const derived = crypto.scryptSync(safeString(passphrase), actualSalt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return { salt: actualSalt, hash: derived.toString('base64') };
}

function verifyPassphrase(passphrase, salt, expected) {
  const actual = hashPassphrase(passphrase, salt).hash;
  const left = Buffer.from(actual, 'base64');
  const right = Buffer.from(safeString(expected), 'base64');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function secureEqualHex(leftValue, rightValue) {
  const left = Buffer.from(safeString(leftValue), 'hex');
  const right = Buffer.from(safeString(rightValue), 'hex');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = {
  hmac,
  legacyHash,
  randomCode,
  encryptOpenid,
  decryptOpenid,
  hashPassphrase,
  verifyPassphrase,
  secureEqualHex
};
