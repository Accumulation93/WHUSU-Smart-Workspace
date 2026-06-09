const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByActivity(activityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM result_publications WHERE activity_id = ? AND org_id = ?',
    [activityId, orgId]
  );
  return rows[0] || null;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM result_publications WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO result_publications (id, activity_id, is_published, published_at, published_by, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.activityId, data.isPublished ? 1 : 0, data.publishedAt || null, data.publishedBy || null, orgId]
  );
}

async function update(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE result_publications SET is_published = ?, published_at = ?, published_by = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [data.isPublished ? 1 : 0, data.publishedAt || null, data.publishedBy || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM result_publications WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByActivity, getById, create, update, remove };
