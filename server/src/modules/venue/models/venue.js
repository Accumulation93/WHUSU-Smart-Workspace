const pool = require('../../../config/db');

// 场地已解绑组织 — 所有场地为跨组织全局数据
async function getAll() {
  const [rows] = await pool.query(
    'SELECT * FROM venues WHERE is_active = 1 ORDER BY name'
  );
  return rows;
}

async function getAllByOrg(_orgId) {
  // 保留此方法签名以兼容旧调用方，但不再按组织过滤
  return getAll();
}

async function getById(id) {
  const [rows] = await pool.query(
    'SELECT * FROM venues WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function getByIdForUpdate(id, conn) {
  const [rows] = await conn.query(
    'SELECT * FROM venues WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { name, location, description, imageUrl } = data;
  const db = conn || pool;
  await db.query(
    `INSERT INTO venues (id, name, location, description, image_url)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name || '', location || '', description || '', imageUrl || '']
  );
}

async function update(id, data, conn) {
  const { name, location, description, imageUrl, isActive } = data;
  const db = conn || pool;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (location !== undefined) { fields.push('location = ?'); values.push(location); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (imageUrl !== undefined) { fields.push('image_url = ?'); values.push(imageUrl); }
  if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (!fields.length) return;
  values.push(id);
  await db.query(`UPDATE venues SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function remove(id, conn) {
  const db = conn || pool;
  await db.query('UPDATE venues SET is_active = 0 WHERE id = ?', [id]);
}

module.exports = { getAll, getAllByOrg, getById, getByIdForUpdate, create, update, remove };
