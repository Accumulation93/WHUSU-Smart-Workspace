const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function listFileHashMatches(fileHash) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT asf.id AS file_id,
            asf.submission_id,
            asf.file_name,
            asf.file_size,
            asub.submission_number,
            asub.title,
            asub.status,
            asub.created_at
       FROM audit_submission_files asf
       JOIN audit_submissions asub
         ON asub.id = asf.submission_id
        AND asub.org_id = asf.org_id
      WHERE asf.file_hash = ?
        AND asf.org_id = ?
      ORDER BY asub.created_at DESC, asub.id DESC, asf.sort_order ASC, asf.id ASC`,
    [fileHash, orgId]
  );
  return rows;
}

function groupFileHashMatches(rows) {
  const grouped = new Map();
  (rows || []).forEach((row) => {
    const submissionId = String(row.submission_id || '');
    if (!submissionId) return;
    if (!grouped.has(submissionId)) {
      grouped.set(submissionId, {
        submissionId,
        submissionNumber: String(row.submission_number || ''),
        title: String(row.title || ''),
        status: String(row.status || ''),
        matchingFiles: []
      });
    }
    grouped.get(submissionId).matchingFiles.push({
      fileId: String(row.file_id || ''),
      fileName: String(row.file_name || ''),
      fileSize: Number(row.file_size) || 0
    });
  });
  return Array.from(grouped.values());
}

module.exports = { listFileHashMatches, groupFileHashMatches };
