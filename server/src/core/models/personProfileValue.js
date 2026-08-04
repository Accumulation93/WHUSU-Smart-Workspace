const pool = require('../../config/db');
const { generateId, safeString } = require('../../utils/helpers');

function normalizeLabel(value) {
  return safeString(value).trim();
}

function key(label, type) {
  return normalizeLabel(label) + '\u0000' + safeString(type);
}

async function listForPerson(personId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT id, person_id, normalized_label, field_label, field_type, field_value,
            value_updated_at, source_org_id, source_record_id, source_field_id
       FROM person_profile_values
      WHERE person_id = ?`,
    [safeString(personId)]
  );
  return rows;
}

async function listForPersons(personIds, connection = pool) {
  const ids = Array.from(new Set((personIds || []).map(safeString).filter(Boolean)));
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id, person_id, normalized_label, field_label, field_type, field_value,
            value_updated_at, source_org_id, source_record_id, source_field_id
       FROM person_profile_values WHERE person_id IN (${placeholders})`,
    ids
  );
  return rows;
}

async function upsertEffectiveValues(personId, orgId, recordId, fields, values, updatedAt, connection = pool) {
  const actualPersonId = safeString(personId);
  if (!actualPersonId) return;
  const timestamp = updatedAt || new Date();
  for (const field of fields || []) {
    const label = safeString(field.label);
    const normalizedLabel = normalizeLabel(label);
    const fieldType = safeString(field.type || 'text');
    if (!normalizedLabel || !fieldType) continue;
    if (!values || !Object.prototype.hasOwnProperty.call(values, field.id)) continue;
    const value = values[field.id] == null ? '' : String(values[field.id]);
    const [currentRows] = await connection.query(
      `SELECT id, value_updated_at FROM person_profile_values
        WHERE person_id = ? AND normalized_label = ? AND field_type = ?
        LIMIT 1 FOR UPDATE`,
      [actualPersonId, normalizedLabel, fieldType]
    );
    const current = currentRows[0];
    const currentTime = current && new Date(current.value_updated_at).getTime();
    const candidateTime = new Date(timestamp).getTime();
    const wins = !current || !Number.isFinite(currentTime) || candidateTime >= currentTime;
    await connection.query(
      `INSERT INTO person_profile_value_history
        (id, person_id, normalized_label, field_label, field_type, field_value, value_updated_at,
         source_org_id, source_record_id, source_field_id, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), actualPersonId, normalizedLabel, label, fieldType, value, timestamp,
        safeString(orgId) || null, safeString(recordId) || null, safeString(field.id) || null,
        wins ? 'selected' : 'superseded']
    );
    if (!wins) continue;
    if (current) {
      await connection.query(
        `UPDATE person_profile_values
            SET field_label = ?, field_value = ?, value_updated_at = ?,
                source_org_id = ?, source_record_id = ?, source_field_id = ?
          WHERE id = ?`,
        [label, value, timestamp, safeString(orgId) || null, safeString(recordId) || null,
          safeString(field.id) || null, current.id]
      );
    } else {
      await connection.query(
        `INSERT INTO person_profile_values
          (id, person_id, normalized_label, field_label, field_type, field_value, value_updated_at,
           source_org_id, source_record_id, source_field_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), actualPersonId, normalizedLabel, label, fieldType, value, timestamp,
          safeString(orgId) || null, safeString(recordId) || null, safeString(field.id) || null]
      );
    }
  }
}

function mapRows(rows) {
  const result = {};
  (rows || []).forEach((row) => {
    result[key(row.normalized_label || row.field_label, row.field_type)] = row;
  });
  return result;
}

module.exports = {
  normalizeLabel,
  key,
  listForPerson,
  listForPersons,
  mapRows,
  upsertEffectiveValues
};
