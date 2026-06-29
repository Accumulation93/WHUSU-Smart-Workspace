const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getBySubmissionId(submissionId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_signatures WHERE submission_id = ? AND org_id = ? ORDER BY signed_at, id',
    [submissionId, orgId]
  );
  return rows;
}

async function getByStepId(stepId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_signatures WHERE step_id = ? AND org_id = ? ORDER BY signed_at, id',
    [stepId, orgId]
  );
  return rows;
}

async function getByFileId(fileId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_signatures WHERE file_id = ? AND org_id = ? ORDER BY signed_at, id',
    [fileId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_signatures WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

/**
 * Get all signatures for a submission, ordered correctly for chain verification.
 * Returns signatures sorted by round, then signed_at within each round.
 */
async function getChainForVerification(submissionId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_signatures WHERE submission_id = ? AND org_id = ? ORDER BY round, signed_at, id',
    [submissionId, orgId]
  );
  return rows;
}

/**
 * Get the last signature in a chain for a given file and round.
 * Used to determine the previous_signature_hash for a new signature.
 */
async function getLastSignature(fileId, round, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const [rows] = await db.query(
    `SELECT * FROM audit_submission_signatures
     WHERE file_id = ? AND round = ? AND org_id = ?
     ORDER BY signed_at DESC, id DESC LIMIT 1`,
    [fileId, round, orgId]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const {
    submissionId, stepId, fileId, signatureType, imageData,
    positionX, positionY, size, rotation, page, signerHrId, round,
    previousSignatureHash, documentHashAtSigning, signatureDataHash, signedAt
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO audit_submission_signatures
     (id, submission_id, step_id, file_id, signature_type, image_data, position_x, position_y, signature_size, rotation_degrees, page,
      signer_hr_id, round, previous_signature_hash, document_hash_at_signing, signature_data_hash, signed_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, submissionId, stepId, fileId, signatureType || 'signature', imageData || null,
      positionX || 0, positionY || 0, size || 1, rotation || 0, page || 1, signerHrId, round || 1,
      previousSignatureHash || null, documentHashAtSigning || '', signatureDataHash || '', signedAt || new Date(), orgId
    ]
  );
}

module.exports = { getBySubmissionId, getByStepId, getByFileId, getById, getChainForVerification, getLastSignature, create };
