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

async function create(id, data) {
  const { submissionId, fileName, mimeType, filePath, fileSize, fileHash, sortOrder } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_submission_files (id, submission_id, file_name, mime_type, file_path, file_size, file_hash, sort_order, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, submissionId, fileName || '', mimeType || null, filePath || '', fileSize || 0, fileHash || '', sortOrder || 1, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM audit_submission_files WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getBySubmissionId, getById, create, remove };
