'use strict';

const pool = require('../../config/db');
const { requireWrite } = require('./dictionaryAuthorization');
const { lockOrganizationDictionaryWrites } = require('../services/dictionaryUsage');
const { authorizationError } = require('../services/authorizationError');
const TABLES = Object.freeze({ department: 'departments', identity: 'identities' });

async function save(kind, { id, newId, name, description, organizationId, authorizationReference }) {
  const table = TABLES[kind];
  if (!table) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    await requireWrite(connection, kind, id ? 'update' : 'create', id || newId, organizationId, authorizationReference);
    await lockOrganizationDictionaryWrites(organizationId, connection);
    const [duplicates] = await connection.query(`SELECT id FROM ${table} WHERE org_id=? AND name=? FOR UPDATE`, [organizationId, name]);
    if (duplicates.some(row => row.id !== id)) return { status: 'duplicate' };
    if (id) {
      const [rows] = await connection.query(`SELECT id FROM ${table} WHERE org_id=? AND id=? FOR UPDATE`, [organizationId, id]);
      if (!rows.length) return { status: 'not_found' };
      await connection.query(`UPDATE ${table} SET name=?,description=?,updated_at=UTC_TIMESTAMP() WHERE org_id=? AND id=?`,
        [name, description, organizationId, id]);
    } else {
      await connection.query(`INSERT INTO ${table} (id,name,description,org_id) VALUES (?,?,?,?)`,
        [newId, name, description, organizationId]);
    }
    return { status: 'success', id: id || newId };
  });
}

module.exports = { save };
