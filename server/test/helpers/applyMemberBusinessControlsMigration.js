'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = async function applyMemberBusinessControlsMigration(connection) {
  const migration = fs.readFileSync(path.join(__dirname, '../../db/deploy/20261125100000_move_member_business_controls_to_apps.sql'), 'utf8');
  const [backfill, programs] = migration.split('DELIMITER $$');
  const [program, catchup] = programs.split('DELIMITER ;');
  await connection.query(backfill);
  for (const statement of program.split('$$').map(sql => sql.trim()).filter(Boolean)) await connection.query(statement);
  await connection.query(catchup);
};
