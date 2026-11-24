'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = async function applyMemberRelationshipRoleMigration(connection) {
  const migration = fs.readFileSync(path.join(__dirname,
    '../../db/deploy/20261124131000_bind_member_relationship_permissions_to_roles.sql'), 'utf8');
  const [definitions, triggersAndBackfill] = migration.split('DELIMITER $$');
  const [triggers, backfill] = triggersAndBackfill.split('DELIMITER ;');
  const [[{ collation }]] = await connection.query('SELECT @@session.collation_connection AS collation');
  // 复现原生 mysql 客户端的排序规则，避免 mysql2 会话默认值掩盖跨排序规则错误。
  await connection.query("SET SESSION collation_connection = 'utf8mb4_0900_ai_ci'");
  try {
    await connection.query(definitions);
    for (const statement of triggers.split('$$').map(sql => sql.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    await connection.query(backfill);
  } finally {
    await connection.query('SET SESSION collation_connection = ?', [collation]);
  }
};
