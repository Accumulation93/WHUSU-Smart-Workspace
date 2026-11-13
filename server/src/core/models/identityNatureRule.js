'use strict';

const policy = require('../services/natureRulePolicy');

async function validate(connection, organizationId, value, identityIds) {
  const natureIds = policy.normalize(value);
  if (natureIds === null) return null;
  const [natures] = await connection.query('SELECT id FROM assignment_natures WHERE org_id = ? AND id IN (?) FOR SHARE', [organizationId, natureIds]);
  if (natures.length !== natureIds.length) throw Object.assign(new Error('identity_nature_invalid'), { code: 'identity_nature_invalid' });
  const ids = [...new Set((Array.isArray(identityIds) ? identityIds : String(identityIds || '').split(',')).map(id => String(id).trim()).filter(Boolean))];
  if (ids.length) {
    const [links] = await connection.query('SELECT DISTINCT identity_id FROM identity_nature_links WHERE org_id = ? AND identity_id IN (?) AND nature_id IN (?) FOR SHARE', [organizationId, ids, natureIds]);
    if (links.length !== ids.length) throw Object.assign(new Error('identity_nature_mismatch'), { code: 'identity_nature_mismatch' });
  }
  return natureIds;
}

module.exports = { validate };
