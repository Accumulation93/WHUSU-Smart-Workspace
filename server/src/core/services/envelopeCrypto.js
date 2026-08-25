const crypto = require('crypto');
const { safeString } = require('../../utils/helpers');

const ENVELOPE_FORMAT = 'enc';
const ENVELOPE_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

function decodeKeyMaterial(value, variableName) {
  const text = safeString(value);
  let key;
  if (text.startsWith('base64:')) {
    key = Buffer.from(text.slice(7), 'base64');
  } else if (text.startsWith('hex:')) {
    key = Buffer.from(text.slice(4), 'hex');
  } else {
    throw new Error(variableName + ' must use the base64: or hex: prefix');
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(variableName + ' must decode to exactly 32 bytes');
  }
  return key;
}

function activeKeyVersion() {
  const version = safeString(process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY_VERSION) || 'v1';
  if (!KEY_VERSION_PATTERN.test(version)) {
    throw new Error('PDF_SIGNING_KEY_ENCRYPTION_KEY_VERSION is invalid');
  }
  return version;
}

function parseLegacyKeyring() {
  const raw = safeString(process.env.PDF_SIGNING_KEY_DECRYPTION_KEYS_JSON);
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('PDF_SIGNING_KEY_DECRYPTION_KEYS_JSON must be a JSON object');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('PDF_SIGNING_KEY_DECRYPTION_KEYS_JSON must be a JSON object');
  }
  return parsed;
}

function encryptionKeyring() {
  const version = activeKeyVersion();
  const activeValue = safeString(process.env.PDF_SIGNING_KEY_ENCRYPTION_KEY);
  if (!activeValue) throw new Error('PDF_SIGNING_KEY_ENCRYPTION_KEY environment variable is required');
  const keys = new Map([[version, decodeKeyMaterial(activeValue, 'PDF_SIGNING_KEY_ENCRYPTION_KEY')]]);
  const legacy = parseLegacyKeyring();
  for (const [legacyVersion, legacyValue] of Object.entries(legacy)) {
    if (!KEY_VERSION_PATTERN.test(legacyVersion) || keys.has(legacyVersion)) continue;
    keys.set(legacyVersion, decodeKeyMaterial(legacyValue, 'PDF_SIGNING_KEY_DECRYPTION_KEYS_JSON'));
  }
  return { activeVersion: version, keys };
}

function aad(purpose, context) {
  const normalizedPurpose = safeString(purpose);
  const normalizedContext = safeString(context);
  if (!normalizedPurpose || !normalizedContext) {
    throw new Error('Envelope encryption purpose and context are required');
  }
  return Buffer.from(ENVELOPE_FORMAT + '|' + ENVELOPE_VERSION + '|' + normalizedPurpose + '|' + normalizedContext, 'utf8');
}

function inspectEnvelope(value) {
  const parts = safeString(value).split(':');
  if (parts.length !== 7 || parts[0] !== ENVELOPE_FORMAT || parts[1] !== ENVELOPE_VERSION || parts[6] !== 'gcm') {
    return null;
  }
  if (!KEY_VERSION_PATTERN.test(parts[2])) return null;
  return {
    formatVersion: parts[1],
    keyVersion: parts[2],
    iv: parts[3],
    tag: parts[4],
    ciphertext: parts[5]
  };
}

function encryptEnvelope(plaintext, options) {
  const value = safeString(plaintext);
  if (!value) return { ciphertext: null, keyVersion: null };
  const keyring = encryptionKeyring();
  const key = keyring.keys.get(keyring.activeVersion);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(options && options.purpose, options && options.context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [
      ENVELOPE_FORMAT,
      ENVELOPE_VERSION,
      keyring.activeVersion,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
      'gcm'
    ].join(':'),
    keyVersion: keyring.activeVersion
  };
}

function decryptEnvelope(ciphertext, options) {
  const envelope = inspectEnvelope(ciphertext);
  if (!envelope) throw new TypeError('Invalid encrypted envelope');
  const keyring = encryptionKeyring();
  const key = keyring.keys.get(envelope.keyVersion);
  if (!key) throw new Error('No decryption key configured for envelope version');
  const iv = Buffer.from(envelope.iv, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  const encrypted = Buffer.from(envelope.ciphertext, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !encrypted.length) {
    throw new TypeError('Invalid encrypted envelope payload');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad(options && options.purpose, options && options.context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = {
  encryptEnvelope,
  decryptEnvelope,
  inspectEnvelope,
  activeKeyVersion
};
