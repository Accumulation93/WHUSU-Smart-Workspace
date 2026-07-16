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

module.exports = { normalizeClientRequestId, claim, complete };
