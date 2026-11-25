'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = async function applyAllocationPermissionsMigration(connection, file = '20261124160000_unify_allocation_permissions.sql') {
  const migration = fs.readFileSync(path.join(__dirname,
    '../../db/deploy', file), 'utf8');
  const [definitions, programAndBackfill] = migration.split('DELIMITER $$');
  const [program, backfill] = programAndBackfill.split('DELIMITER ;');
  const [[{ collation }]] = await connection.query('SELECT @@session.collation_connection AS collation');
  await connection.query("SET SESSION collation_connection='utf8mb4_0900_ai_ci'");
  try {
    await connection.query(definitions);
    for (const statement of program.split('$$').map(sql => sql.trim()).filter(Boolean)) await connection.query(statement);
    await connection.query(backfill);
  } finally { await connection.query('SET SESSION collation_connection=?', [collation]); }
};
