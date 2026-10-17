'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-round-files-'));
process.env.AUDIT_UPLOAD_DIR = root;
process.env.DB_USER = process.env.DB_USER || 'contract-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'contract-test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { resolveOriginal } = require('../src/modules/audit/services/auditRoundFiles');
const original = Buffer.from('%PDF-1.7\noriginal document');
const filePath = path.join(root, 'original.pdf');
const hash = crypto.createHash('sha256').update(original).digest('hex');
try {
  fs.writeFileSync(filePath, original);
  const file = { id: 'file', file_path: filePath, file_hash: hash, file_size: original.length };
  const empty = { evidence: [], signatures: [] };
  assert.deepEqual(resolveOriginal(file, empty).buffer, original);
  assert.throws(() => resolveOriginal(file, { ...empty, signatures: [{ file_id: 'file' }] }), { status: 'original_required' });
  const evidence = { file_id: 'file', input_file_path: filePath, input_digest: hash, legacy_prefix: 0 };
  assert.deepEqual(resolveOriginal(file, { evidence: [evidence], signatures: [{ file_id: 'file' }] }).buffer, original);
  assert.throws(() => resolveOriginal(file, { evidence: [{ ...evidence, legacy_prefix: 1 }], signatures: [] }), { status: 'original_required' });
  assert.throws(() => resolveOriginal(file, { evidence: [{ ...evidence, input_digest: '0'.repeat(64) }], signatures: [] }), { status: 'original_required' });
  const explicit = { ...file, original_file_path: filePath, original_file_hash: hash, original_file_size: original.length };
  assert.deepEqual(resolveOriginal(explicit, empty).buffer, original);
  fs.writeFileSync(filePath, Buffer.from('%PDF-tampered'));
  assert.throws(() => resolveOriginal(explicit, empty), { status: 'original_required' });
  fs.unlinkSync(filePath);
  assert.throws(() => resolveOriginal(explicit, empty), { status: 'original_required' });
  assert.throws(() => resolveOriginal({ ...explicit, original_file_path: path.join(root, '..', 'outside.pdf') }, empty), { status: 'original_required' });
  console.log('原件恢复通过：未签文件、明确来源、历史输入、旧协议拒绝、摘要漂移、缺失及路径边界');
} finally {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  fs.rmdirSync(root);
}
