const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getBySubmissionId(submissionId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_files WHERE submission_id = ? AND org_id = ? ORDER BY sort_order',
    [submissionId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_files WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { submissionId, fileName, mimeType, filePath, fileSize, fileHash, sortOrder } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO audit_submission_files (id, submission_id, file_name, mime_type, file_path, file_size, file_hash, sort_order, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, submissionId, fileName || '', mimeType || null, filePath || '', fileSize || 0, fileHash || '', sortOrder || 1, orgId]
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

module.exports = { getBySubmissionId, getById, create, remove, removeBySubmissionId, updateMetadata };
