'use strict';
const crypto = require('crypto');
const pool = require('../../config/db');
const contract = require('./cacheVersionContract.json');
const { memo } = require('../../utils/requestWork');
let readiness;

async function ensureReady() {
  if (!readiness) {
    readiness = pool.query(
      `SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, EVENT_MANIPULATION, ACTION_TIMING
        FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`
    ).then(([rows]) => {
      const registered = new Set(rows.map(row => [row.TRIGGER_NAME, row.EVENT_OBJECT_TABLE, row.EVENT_MANIPULATION, row.ACTION_TIMING].join(':')));
      if (contract.some(item => !registered.has([item.name, item.table, item.event, 'AFTER'].join(':')))) throw Object.assign(new Error(), { code: 'CACHE_VERSION_CONTRACT_INCOMPLETE' });
    }).catch(error => { readiness = null; throw error; });
  }
  return readiness;
}

async function read(orgIds, domains) {
  await ensureReady();
  const ids = Array.from(new Set(['*', ...orgIds.map(String)])).sort();
  const versions = await memo('cacheVersions:' + JSON.stringify(ids), async () => {
    const collected = [];
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500);
      const [rows] = await pool.query(
        `SELECT org_id, domain, CAST(version AS CHAR) AS version FROM cache_domain_versions
          WHERE org_id IN (${chunk.map(() => '?').join(',')}) ORDER BY org_id, domain`, chunk);
      collected.push(...rows);
    }
    return collected;
  });
  const included = domains ? new Set(domains) : null;
  return crypto.createHash('sha256').update(JSON.stringify(included ? versions.filter(row => included.has(row.domain)) : versions)).digest('hex');
}

module.exports = { read, ensureReady };
