'use strict';

const pool = require('../../../config/db');

const FORMAT_VERSION = 1;
const revisions = org => `LEFT JOIN cache_domain_versions org_version ON org_version.org_id = ${org} AND org_version.domain = 'scoring'
  LEFT JOIN cache_domain_versions global_version ON global_version.org_id = '*' AND global_version.domain = 'scoring'`;
const current = `m.format_version = ? AND m.org_revision = COALESCE(org_version.version, 0)
  AND m.global_revision = COALESCE(global_version.version, 0)`;

async function get(activityId, orgId) {
  const [rows] = await pool.query(`SELECT m.payload FROM scoring_publication_materializations m
    ${revisions('m.org_id')}
    WHERE m.activity_id = ? AND m.org_id = ? AND ${current}`, [activityId, orgId, FORMAT_VERSION]);
  return rows[0]?.payload || null;
}

async function getRevision(connection, orgId, lock = false) {
  const [rows] = await connection.query(`SELECT org_id, CAST(version AS CHAR) AS version FROM cache_domain_versions
    WHERE org_id IN ('*', ?) AND domain = 'scoring' ORDER BY org_id${lock ? ' FOR SHARE' : ''}`, [orgId]);
  return {
    org: rows.find(row => row.org_id === orgId)?.version || '0',
    global: rows.find(row => row.org_id === '*')?.version || '0'
  };
}

async function save(activityId, orgId, revision, payload) {
  const encoded = JSON.stringify(payload);
  return pool.withTransaction(async connection => {
    const [activities] = await connection.query('SELECT id FROM score_activities WHERE id = ? AND org_id = ? FOR SHARE', [activityId, orgId]);
    if (!activities.length) return false;
    const latest = await getRevision(connection, orgId, true);
    if (latest.org !== revision.org || latest.global !== revision.global) return false;
    await connection.query(`INSERT INTO scoring_publication_materializations
      (org_id, activity_id, format_version, org_revision, global_revision, payload) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE org_revision = VALUES(org_revision), global_revision = VALUES(global_revision), payload = VALUES(payload)`,
    [orgId, activityId, FORMAT_VERSION, revision.org, revision.global, encoded]);
    return true;
  });
}

async function listMissing(limit) {
  const [rows] = await pool.query(`SELECT p.activity_id, p.org_id FROM result_publications p
    ${revisions('p.org_id')}
    LEFT JOIN scoring_publication_materializations m ON m.org_id = p.org_id AND m.activity_id = p.activity_id AND ${current}
    WHERE p.is_published = 1 AND m.activity_id IS NULL ORDER BY p.published_at DESC, p.id LIMIT ?`, [FORMAT_VERSION, limit]);
  return rows;
}

module.exports = { get, getRevision, save, listMissing };
