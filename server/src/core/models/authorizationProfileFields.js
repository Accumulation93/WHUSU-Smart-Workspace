'use strict';

// 只读取本组织已启用的补充资料定义，不读取任何人的资料值。
async function list(connection, organizationId) {
  const [rows] = await connection.query(`SELECT f.id,f.label,f.type
    FROM org_hr_profile_template_snapshot_fields f
    JOIN org_hr_profile_template_snapshots s ON s.id=f.snapshot_id
    WHERE s.org_id=? AND f.is_active=1 ORDER BY f.sort_order,f.id`, [organizationId]);
  return rows.map(row => ({ key: 'profile:' + row.id, id: row.id, label: row.label, type: row.type }));
}

async function catalog(connection, organizationId, baseCatalog) {
  const fields = await list(connection, organizationId);
  const keys = fields.map(field => field.key);
  const labels = Object.fromEntries(fields.map(field => [field.key, field.label]));
  const protectedKeys = fields.filter(field => /(学号|学生号|student.?id|password|口令|密码|恢复码|认证码|openid|身份证)/i.test(field.label))
    .map(field => field.key);
  return new Map([...baseCatalog].map(([key, definition]) => [key, definition.profileFieldKeys
    ? { ...definition, fields: definition.fields.concat(keys), fieldLabels: labels,
      adminOnlyFields: definition.adminOnlyFields.concat(protectedKeys) } : definition]));
}

module.exports = { list, catalog };
