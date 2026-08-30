const pool = require('../../../config/db');

async function getByTemplateId(templateId, connection = pool) {
  const [rows] = await connection.query(
    'SELECT * FROM score_questions WHERE template_id = ? ORDER BY sort_order',
    [templateId]
  );
  return rows;
}

async function getByTemplateIds(templateIds, connection = pool) {
  if (!templateIds.length) return [];
  const placeholders = templateIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT * FROM score_questions WHERE template_id IN (${placeholders}) ORDER BY template_id, sort_order`,
    templateIds
  );
  return rows;
}

async function create(id, templateId, sortOrder, data, connection = pool) {
  const { question, scoreLabel, minValue, startValue, maxValue, stepValue } = data;
  await connection.query(
    `INSERT INTO score_questions (id, template_id, sort_order, question, score_label, min_value, start_value, max_value, step_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, sortOrder, question || '', scoreLabel || '',
     minValue != null ? minValue : 0, startValue != null ? startValue : 0,
     maxValue != null ? maxValue : 5, stepValue != null ? stepValue : 1]
  );
}

async function removeByTemplateId(templateId, connection = pool) {
  await connection.query('DELETE FROM score_questions WHERE template_id = ?', [templateId]);
}

module.exports = { getByTemplateId, getByTemplateIds, create, removeByTemplateId };
