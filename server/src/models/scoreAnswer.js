const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByRecordId(recordId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM score_answers WHERE record_id = ? AND org_id = ? ORDER BY question_index',
    [recordId, orgId]
  );
  return rows;
}

async function getByRecordIds(recordIds) {
  if (!recordIds.length) return [];
  const orgId = await getCurrentOrgId();
  const placeholders = recordIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM score_answers WHERE record_id IN (${placeholders}) AND org_id = ? ORDER BY record_id, question_index`,
    [...recordIds, orgId]
  );
  return rows;
}

async function create(id, recordId, questionIndex, score) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'INSERT INTO score_answers (id, record_id, question_index, score, org_id) VALUES (?, ?, ?, ?, ?)',
    [id, recordId, questionIndex, score, orgId]
  );
}

async function removeByRecordId(recordId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM score_answers WHERE record_id = ? AND org_id = ?', [recordId, orgId]);
}

async function createMany(answers) {
  if (!answers.length) return;
  const orgId = await getCurrentOrgId();
  const placeholders = answers.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const values = answers.flatMap(a => [a.id, a.recordId, a.questionIndex, a.score, orgId]);
  await pool.query(
    `INSERT INTO score_answers (id, record_id, question_index, score, org_id) VALUES ${placeholders}`,
    values
  );
}

module.exports = { getByRecordId, getByRecordIds, create, createMany, removeByRecordId };
