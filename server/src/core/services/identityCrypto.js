const crypto = require('crypto');
const { safeString } = require('../../utils/helpers');

const MIN_SECRET_BYTES = 32;

function secretByteLength(value) {
  return Buffer.byteLength(safeString(value), 'utf8');
}

function readIdentitySecret() {
  const value = safeString(process.env.AUTH_IDENTITY_SECRET);
  if (!value) throw new Error('AUTH_IDENTITY_SECRET environment variable is required');
  if (secretByteLength(value) < MIN_SECRET_BYTES) {
    throw new Error('AUTH_IDENTITY_SECRET must contain at least 32 bytes');
  }
  if (process.env.NODE_ENV === 'production' && value === safeString(process.env.JWT_SECRET)) {
    throw new Error('AUTH_IDENTITY_SECRET must be independent from JWT_SECRET');
  }
  return value;
}

function readLegacyIdentitySecret() {
  const value = safeString(process.env.AUTH_IDENTITY_LEGACY_SECRET);
  if (!value) return '';
  if (secretByteLength(value) < MIN_SECRET_BYTES) {
    throw new Error('AUTH_IDENTITY_LEGACY_SECRET must contain at least 32 bytes');
  }
  return value;
}

function validateIdentityCryptoConfig() {
  readIdentitySecret();
  readLegacyIdentitySecret();
  return true;
}

function hmacWithSecret(value, secretValue) {
  return crypto.createHmac('sha256', secretValue).update(safeString(value)).digest('hex');
}

function hmac(value) {
  return hmacWithSecret(value, readIdentitySecret());
}

function legacyHmac(value) {
  const legacySecret = readLegacyIdentitySecret();
  return legacySecret ? hmacWithSecret(value, legacySecret) : '';
}

function hmacCandidates(value) {
  return [...new Set([hmac(value), legacyHmac(value)].filter(Boolean))];
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

function openidEncryptionKey(secretValue) {
  return crypto.createHash('sha256').update(secretValue + ':openid').digest();
}

function encryptOpenid(openid) {
  const key = openidEncryptionKey(readIdentitySecret());
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(safeString(openid), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptOpenidWithSecret(ciphertext, secretValue) {
  const payload = Buffer.from(safeString(ciphertext), 'base64');
  if (payload.length < 29) throw new TypeError();
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', openidEncryptionKey(secretValue), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function decryptOpenid(ciphertext) {
  const secrets = [readIdentitySecret(), readLegacyIdentitySecret()].filter(Boolean);
  let lastError = null;
  for (const candidate of [...new Set(secrets)]) {
    try {
      return decryptOpenidWithSecret(ciphertext, candidate);
    } catch (error) {
      lastError = error;
    }
  }
  const failure = new TypeError();
  if (lastError) failure.cause = lastError;
  throw failure;
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
  validateIdentityCryptoConfig,
  hmac,
  legacyHmac,
  hmacCandidates,
  legacyHash,
  randomCode,
  encryptOpenid,
  decryptOpenid,
  hashPassphrase,
  verifyPassphrase,
  secureEqualHex
};
