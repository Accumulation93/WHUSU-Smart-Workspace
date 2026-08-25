const crypto = require('crypto');
const { safeString } = require('./helpers');

function stableResourceId(operationType, parts) {
  const operation = safeString(operationType).trim();
  const normalizedParts = Array.isArray(parts) ? parts.map((part) => safeString(part)) : [];
  if (!operation || normalizedParts.some((part) => !part)) {
    const error = new Error('invalid_idempotency_resource');
    error.code = 'INVALID_IDEMPOTENCY_RESOURCE';
    throw error;
  }
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify([operation, ...normalizedParts]))
    .digest('hex');
  return digest;
}

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
  const storedResourceId = safeString(rows[0] && rows[0].resource_id);
  const requestedResourceId = safeString(data.resourceId);
  if (!storedResourceId || storedResourceId !== requestedResourceId) {
    const error = new Error('idempotency_resource_conflict');
    error.code = 'IDEMPOTENCY_RESOURCE_CONFLICT';
    error.httpStatus = 409;
    throw error;
  }
  let response = null;
  try { response = rows[0] && rows[0].response_json ? JSON.parse(rows[0].response_json) : null; } catch (_) {}
  return { claimed: false, enabled: true, clientRequestId, resourceId: storedResourceId, response };
}

async function complete(conn, data, response) {
  if (!data || !data.enabled || !data.clientRequestId) return;
  const [result] = await conn.query(
    `UPDATE request_deduplication SET response_json = ?
     WHERE org_id = ? AND actor_key = ? AND operation_type = ? AND client_request_id = ?
       AND resource_id = ?`,
    [JSON.stringify(response), data.orgId, data.actorKey, data.operationType,
      data.clientRequestId, data.resourceId]
  );
  if (Number(result && result.affectedRows || 0) !== 1) {
    const error = new Error('idempotency_resource_conflict');
    error.code = 'IDEMPOTENCY_RESOURCE_CONFLICT';
    error.httpStatus = 409;
    throw error;
  }
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

module.exports = { stableResourceId, normalizeClientRequestId, claim, complete, cleanupOld };
