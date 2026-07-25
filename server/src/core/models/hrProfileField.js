const pool = require('../../config/db');

async function getByTemplateId(snapshotId, connection = pool) {
  const [rows] = await connection.query(
    'SELECT * FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id = ? AND is_active = 1 ORDER BY sort_order',
    [snapshotId]
  );
  return rows;
}

async function getDefinitionFields(templateId, connection = pool) {
  const [rows] = await connection.query(
    'SELECT * FROM hr_profile_template_fields WHERE template_id = ? ORDER BY sort_order',
    [templateId]
  );
  return rows;
}

async function create(id, templateId, sortOrder, data, connection = pool) {
  const { label, type, required, minLength, maxLength, numberRule, allowDecimal,
    minDigits, maxDigits, minValue, maxValue, optionsJson } = data;
  await connection.query(
    `INSERT INTO hr_profile_template_fields
     (id, template_id, sort_order, label, type, required, min_length, max_length,
      number_rule, allow_decimal, min_digits, max_digits, min_value, max_value, options_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, sortOrder, label || '', type || 'text', required ? 1 : 0,
     minLength, maxLength, numberRule || 'value_range', allowDecimal !== false ? 1 : 0,
     minDigits, maxDigits, minValue, maxValue, optionsJson || null]
  );
}

async function removeByTemplateId(templateId, connection = pool) {
  await connection.query('DELETE FROM hr_profile_template_fields WHERE template_id = ?', [templateId]);
}

module.exports = { getByTemplateId, getDefinitionFields, create, removeByTemplateId };
