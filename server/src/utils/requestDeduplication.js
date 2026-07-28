const { safeString } = require('./helpers');

function normalizeClientRequestId(value) {
  const id = safeString(value).trim();
  if (!id) return '';
  if (id.length > 96 || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    const error = new Error('invalid_client_request_id');
    error.code = 'INVALID_CLIENT_REQUEST_ID';
    throw error;
  }
  return id;
}

async function claim(conn, data) {
  const clientRequestId = normalizeClientRequestId(data.clientRequestId);
  if (!clientRequestId) return { claimed: true, enabled: false };

  const [result] = await conn.query(
    `INSERT IGNORE INTO request_deduplication
      (org_id, actor_key, operation_type, client_request_id, resource_id, response_json)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [data.orgId, data.actorKey, data.operationType, clientRequestId, data.resourceId]
  );
  if (result.affectedRows === 1) {
    return { claimed: true, enabled: true, clientRequestId };
  }

  const [rows] = await conn.query(
    `SELECT resource_id, response_json FROM request_deduplication
     WHERE org_id = ? AND actor_key = ? AND operation_type = ? AND client_request_id = ?
     FOR UPDATE`,
    [data.orgId, data.actorKey, data.operationType, clientRequestId]
  );
  let response = null;
  try { response = rows[0] && rows[0].response_json ? JSON.parse(rows[0].response_json) : null; } catch (_) {}
  return { claimed: false, enabled: true, resourceId: rows[0] && rows[0].resource_id, response };
}

async function complete(conn, data, response) {
  if (!data || !data.enabled || !data.clientRequestId) return;
  await conn.query(
    `UPDATE request_deduplication SET resource_id = ?, response_json = ?
     WHERE org_id = ? AND actor_key = ? AND operation_type = ? AND client_request_id = ?`,
    [data.resourceId, JSON.stringify(response), data.orgId, data.actorKey, data.operationType, data.clientRequestId]
  );
}

async function cleanupOld(conn, options) {
  const config = options || {};
  const retentionDays = Math.max(1, Math.min(Number.parseInt(config.retentionDays, 10) || 90, 3650));
  const batchSize = Math.max(1, Math.min(Number.parseInt(config.batchSize, 10) || 500, 5000));
  const maxBatches = Math.max(1, Math.min(Number.parseInt(config.maxBatches, 10) || 20, 100));
  let removed = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const [result] = await conn.query(
      `DELETE FROM request_deduplication
        WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        LIMIT ?`,
      [retentionDays, batchSize]
    );
    const affected = Number(result.affectedRows || 0);
    removed += affected;
    if (affected < batchSize) break;
  }
  return removed;
}

module.exports = { normalizeClientRequestId, claim, complete, cleanupOld };
