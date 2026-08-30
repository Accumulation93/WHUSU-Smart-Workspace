const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const {
  encryptEnvelope,
  decryptEnvelope,
  inspectEnvelope
} = require('../../../core/services/envelopeCrypto');

const SIGNING_KEY_PURPOSE = 'audit-pdf-signing-private-key';

function signingKeyContext(orgId, fileId) {
  return String(orgId || '') + ':' + String(fileId || '');
}

function allowLegacyPlaintextSigningKeys() {
  return String(process.env.PDF_SIGNING_KEY_ALLOW_LEGACY_PLAINTEXT || '').toLowerCase() === 'true';
}

function decryptSigningKeyRow(row) {
  if (!row || !row.signing_key_private) return row;
  const envelope = inspectEnvelope(row.signing_key_private);
  if (!envelope) {
    if (!allowLegacyPlaintextSigningKeys()) {
      throw new Error('Legacy plaintext PDF signing key requires controlled migration');
    }
    return row;
  }
  if (row.signing_key_encryption_version
    && String(row.signing_key_encryption_version) !== envelope.keyVersion) {
    throw new Error('PDF signing key encryption version metadata mismatch');
  }
  return {
    ...row,
    signing_key_private: decryptEnvelope(row.signing_key_private, {
      purpose: SIGNING_KEY_PURPOSE,
      context: signingKeyContext(row.org_id, row.id)
    })
  };
}

function redactSigningKeyRow(row) {
  return row ? { ...row, signing_key_private: null } : row;
}

function redactSigningKeyRows(rows) {
  return rows.map(redactSigningKeyRow);
}

async function getBySubmissionId(submissionId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT * FROM audit_submission_files
      WHERE submission_id = ? AND org_id = ? AND is_current = 1
      ORDER BY sort_order, id`,
    [submissionId, orgId]
  );
  return redactSigningKeyRows(rows);
}

async function getAllBySubmissionId(submissionId, conn, lock) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const [rows] = await db.query(
    `SELECT * FROM audit_submission_files
      WHERE submission_id = ? AND org_id = ?
      ORDER BY revision_round, sort_order, id${lock ? ' FOR UPDATE' : ''}`,
    [submissionId, orgId]
  );
  return redactSigningKeyRows(rows);
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_files WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] ? redactSigningKeyRow(rows[0]) : null;
}

async function getCurrentById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_files WHERE id = ? AND org_id = ? AND is_current = 1',
    [id, orgId]
  );
  return rows[0] ? decryptSigningKeyRow(rows[0]) : null;
}

async function getCurrentBySubmissionIdForUpdate(submissionId, conn) {
  const orgId = await getCurrentOrgId();
  const [rows] = await conn.query(
    `SELECT * FROM audit_submission_files
      WHERE submission_id = ? AND org_id = ? AND is_current = 1
      ORDER BY sort_order, id
      FOR UPDATE`,
    [submissionId, orgId]
  );
  return rows.map(decryptSigningKeyRow);
}

async function create(id, data, conn) {
  const {
    submissionId, fileName, mimeType, filePath, fileSize, fileHash,
    sortOrder, revisionRound, isCurrent
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO audit_submission_files
      (id, submission_id, file_name, mime_type, file_path, file_size, file_hash,
       revision_round, is_current, sort_order, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, submissionId, fileName || '', mimeType || null, filePath || '', fileSize || 0, fileHash || '',
      Number(revisionRound) > 0 ? Number(revisionRound) : 1,
      isCurrent === false || Number(isCurrent) === 0 ? 0 : 1,
      sortOrder || 1, orgId
    ]
  );
}

async function markCurrentAsHistorical(submissionId, conn) {
  const orgId = await getCurrentOrgId();
  await conn.query(
    `UPDATE audit_submission_files
        SET is_current = 0
      WHERE submission_id = ? AND org_id = ? AND is_current = 1`,
    [submissionId, orgId]
  );
}

async function markUnretainedCurrentAsHistorical(submissionId, retainedFileIds, conn) {
  const orgId = await getCurrentOrgId();
  const ids = Array.from(new Set((retainedFileIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return markCurrentAsHistorical(submissionId, conn);
  await conn.query(
    `UPDATE audit_submission_files
        SET is_current = 0
      WHERE submission_id = ? AND org_id = ? AND is_current = 1
        AND id NOT IN (${ids.map(() => '?').join(', ')})`,
    [submissionId, orgId, ...ids]
  );
  const orderCases = ids.map(() => 'WHEN ? THEN ?').join(' ');
  const orderParams = [];
  ids.forEach(function(id, index) {
    orderParams.push(id, index + 1);
  });
  await conn.query(
    `UPDATE audit_submission_files
        SET sort_order = CASE id ${orderCases} ELSE sort_order END
      WHERE submission_id = ? AND org_id = ? AND is_current = 1
        AND id IN (${ids.map(() => '?').join(', ')})`,
    [...orderParams, submissionId, orgId, ...ids]
  );
}

async function setCurrentRevisionRound(submissionId, revisionRound, conn) {
  const orgId = await getCurrentOrgId();
  await conn.query(
    `UPDATE audit_submission_files
        SET revision_round = ?
      WHERE submission_id = ? AND org_id = ? AND is_current = 1`,
    [revisionRound, submissionId, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM audit_submission_files WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function removeBySubmissionId(submissionId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM audit_submission_files WHERE submission_id = ? AND org_id = ?', [submissionId, orgId]);
}

async function updateMetadata(id, data, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `UPDATE audit_submission_files
     SET file_path = ?, mime_type = ?, file_size = ?, file_hash = ?
     WHERE id = ? AND org_id = ?`,
    [data.filePath || '', data.mimeType || null, data.fileSize || 0, data.fileHash || '', id, orgId]
  );
}

/**
 * 保存每份文件的 PDF 数字签名密钥对与最近证书（私钥仅服务端持有）。
 */
async function saveSigningKey(id, data, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  if (data.privateKey && inspectEnvelope(data.privateKey)) {
    throw new TypeError('saveSigningKey expects plaintext key material and encrypts it internally');
  }
  const encryptedPrivateKey = encryptEnvelope(data.privateKey || '', {
    purpose: SIGNING_KEY_PURPOSE,
    context: signingKeyContext(orgId, id)
  });
  await db.query(
    `UPDATE audit_submission_files
     SET signing_key_private = ?, signing_key_encryption_version = ?, signing_key_public = ?, signing_cert = ?,
         signing_cert_chain = ?, signing_trust_status = ?,
         signing_algorithm = ?, signing_created_at = COALESCE(signing_created_at, NOW())
     WHERE id = ? AND org_id = ?`,
    [
      encryptedPrivateKey.ciphertext,
      encryptedPrivateKey.keyVersion,
      data.publicKey || null,
      data.cert || null,
      data.certificateChain || null,
      data.trustStatus || 'self_signed',
      data.algorithm || 'RSA-SHA256',
      id,
      orgId
    ]
  );
}

/**
 * 运维迁移入口：仅在显式开启旧明文读取开关时，将旧 PEM 原地转换为带版本密文。
 * 返回值只包含计数，不返回或记录任何密钥材料。
 */
async function migrateLegacySigningKeys(options) {
  if (!allowLegacyPlaintextSigningKeys()) {
    throw new Error('PDF_SIGNING_KEY_ALLOW_LEGACY_PLAINTEXT=true is required for legacy key migration');
  }
  const limit = Math.max(1, Math.min(Number(options && options.limit) || 100, 1000));
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT id, org_id, signing_key_private, signing_key_encryption_version
         FROM audit_submission_files
        WHERE signing_key_private IS NOT NULL
          AND signing_key_private <> ''
          AND (signing_key_encryption_version IS NULL
               OR signing_key_private NOT LIKE CONCAT('enc:v1:', signing_key_encryption_version, ':%'))
        ORDER BY id
        LIMIT ? FOR UPDATE`,
      [limit]
    );
    let migrated = 0;
    let metadataRepaired = 0;
    for (const row of rows) {
      const existingEnvelope = inspectEnvelope(row.signing_key_private);
      if (existingEnvelope) {
        await connection.query(
          `UPDATE audit_submission_files
              SET signing_key_encryption_version = ?
            WHERE id = ? AND org_id = ?`,
          [existingEnvelope.keyVersion, row.id, row.org_id]
        );
        metadataRepaired += 1;
        continue;
      }
      if (String(row.signing_key_private).startsWith('enc:')) {
        throw new Error('Malformed encrypted PDF signing key blocks migration');
      }
      const encrypted = encryptEnvelope(row.signing_key_private, {
        purpose: SIGNING_KEY_PURPOSE,
        context: signingKeyContext(row.org_id, row.id)
      });
      const [result] = await connection.query(
        `UPDATE audit_submission_files
            SET signing_key_private = ?, signing_key_encryption_version = ?
          WHERE id = ? AND org_id = ? AND signing_key_encryption_version IS NULL`,
        [encrypted.ciphertext, encrypted.keyVersion, row.id, row.org_id]
      );
      migrated += Number(result.affectedRows || 0);
    }
    return { scanned: rows.length, migrated, metadataRepaired, remainingPossible: rows.length === limit };
  });
}

async function inspectSigningKeyMigrationState() {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN signing_key_private IS NOT NULL AND signing_key_private <> '' THEN 1 ELSE 0 END) AS total,
       SUM(CASE WHEN signing_key_private LIKE 'enc:v1:%'
                 AND signing_key_encryption_version IS NOT NULL
                 AND signing_key_private LIKE CONCAT('enc:v1:', signing_key_encryption_version, ':%')
                THEN 1 ELSE 0 END) AS encrypted,
       SUM(CASE WHEN signing_key_private IS NOT NULL AND signing_key_private <> ''
                 AND signing_key_private NOT LIKE 'enc:%' THEN 1 ELSE 0 END) AS plaintext,
       SUM(CASE WHEN signing_key_private LIKE 'enc:%'
                 AND (signing_key_encryption_version IS NULL
                      OR signing_key_private NOT LIKE CONCAT('enc:v1:', signing_key_encryption_version, ':%'))
                THEN 1 ELSE 0 END) AS malformed_or_metadata_mismatch
       FROM audit_submission_files`
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total || 0),
    encrypted: Number(row.encrypted || 0),
    plaintext: Number(row.plaintext || 0),
    malformedOrMetadataMismatch: Number(row.malformed_or_metadata_mismatch || 0)
  };
}

module.exports = {
  getBySubmissionId,
  getAllBySubmissionId,
  getById,
  getCurrentById,
  getCurrentBySubmissionIdForUpdate,
  create,
  markCurrentAsHistorical,
  markUnretainedCurrentAsHistorical,
  setCurrentRevisionRound,
  remove,
  removeBySubmissionId,
  updateMetadata,
  saveSigningKey,
  migrateLegacySigningKeys,
  inspectSigningKeyMigrationState
};
