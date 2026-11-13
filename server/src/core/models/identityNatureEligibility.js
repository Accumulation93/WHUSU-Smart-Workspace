'use strict';

function alias(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw Object.assign(new TypeError(), { code: 'invalid_identity_nature_sql_alias' });
  }
  return value;
}

// 别名只能来自静态模型SQL；兼容期不改变旧岗位计算，启用后按真实关联判断。
function assignmentPredicate(value) {
  const table = alias(value);
  return `(NOT EXISTS (SELECT 1 FROM identity_nature_rollouts nr
    WHERE nr.org_id = ${table}.org_id COLLATE utf8mb4_unicode_ci AND nr.enabled = 1)
    OR EXISTS (SELECT 1 FROM identity_nature_links nl
      JOIN identities ni ON ni.id = nl.identity_id COLLATE utf8mb4_unicode_ci AND ni.org_id = nl.org_id COLLATE utf8mb4_unicode_ci
      JOIN assignment_natures nn ON nn.id = nl.nature_id AND nn.org_id = nl.org_id
      WHERE nl.org_id = ${table}.org_id COLLATE utf8mb4_unicode_ci
        AND nl.identity_id = ${table}.identity_id COLLATE utf8mb4_unicode_ci
        AND nl.nature_id = ${table}.assignment_kind COLLATE utf8mb4_unicode_ci))`;
}

async function isEnabled(connection, organizationId) {
  const [rows] = await connection.query('SELECT enabled FROM identity_nature_rollouts WHERE org_id=?', [organizationId]);
  return Boolean(rows.length && Number(rows[0].enabled) === 1);
}

module.exports = { assignmentPredicate, isEnabled };
