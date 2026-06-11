const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM hr_profile_template_fields WHERE template_id = ? AND org_id = ? ORDER BY sort_order',
    [templateId, orgId]
  );
  return rows;
}

async function create(id, templateId, sortOrder, data) {
  const { label, type, required, minLength, maxLength, numberRule, allowDecimal,
    minDigits, maxDigits, minValue, maxValue, optionsJson } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO hr_profile_template_fields
     (id, template_id, sort_order, label, type, required, min_length, max_length,
      number_rule, allow_decimal, min_digits, max_digits, min_value, max_value, options_json, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, sortOrder, label || '', type || 'text', required ? 1 : 0,
     minLength, maxLength, numberRule || 'value_range', allowDecimal !== false ? 1 : 0,
     minDigits, maxDigits, minValue, maxValue, optionsJson || null, orgId]
  );
}

async function removeByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM hr_profile_template_fields WHERE template_id = ? AND org_id = ?', [templateId, orgId]);
}

module.exports = { getByTemplateId, create, removeByTemplateId };
