'use strict';

const crypto = require('node:crypto');
const pool = require('../../config/db');
const { authorizePermission } = require('../services/adminTransactionAuthorization');

const TYPES = Object.freeze({
  audit: { permission: 'audit.submissions_delete', targetType: 'submission' },
  booking: { permission: 'venue.bookings_delete', targetType: 'booking' },
  score: { permission: 'scoring.results_revoke', targetType: 'score' }
});

function fail(code) { throw Object.assign(new Error(code), { code }); }

async function authorize(db, actor, type) {
  return authorizePermission(db, actor, TYPES[type] && TYPES[type].permission);
}

async function readRecord(db, actor, type, id) {
  let rows;
  if (type === 'audit') {
    [rows] = await db.query('SELECT * FROM audit_submissions WHERE id = ? AND org_id = ? FOR UPDATE', [id, actor.orgId]);
  } else if (type === 'booking') {
    [rows] = await db.query('SELECT * FROM venue_bookings WHERE id = ? AND (creator_org_id = ? OR approval_org_id = ?) FOR UPDATE', [id, actor.orgId, actor.orgId]);
  } else {
    [rows] = await db.query('SELECT * FROM score_records WHERE id = ? AND org_id = ? FOR UPDATE', [id, actor.orgId]);
  }
  if (!rows[0]) return null;
  const record = rows[0];
  const files = [], evidence = [], steps = [];
  if (type === 'audit') {
    const [fileRows] = await db.query('SELECT id, file_path, file_hash, original_file_path FROM audit_submission_files WHERE submission_id = ? AND org_id = ? ORDER BY id FOR UPDATE', [id, actor.orgId]);
    const [evidenceRows] = await db.query('SELECT id, input_file_path, output_file_path FROM audit_signing_evidence WHERE submission_id = ? AND org_id = ? ORDER BY id FOR UPDATE', [id, actor.orgId]);
    files.push(...fileRows); evidence.push(...evidenceRows);
    const [stepRows] = await db.query('SELECT * FROM audit_submission_steps WHERE submission_id = ? AND org_id = ? ORDER BY id FOR UPDATE', [id, actor.orgId]);
    steps.push(...stepRows);
  }
  const revision = crypto.createHash('sha256').update(JSON.stringify({ record, files, evidence, steps })).digest('hex');
  return { record, files, evidence, revision };
}

async function preview(actor, type, id) {
  return pool.withTransaction(async db => {
    await authorize(db, actor, type);
    const value = await readRecord(db, actor, type, id);
    if (!value) fail('not_found');
    return { id, type, title: value.record.title || value.record.submission_number || id,
      revision: value.revision, attachmentCount: value.files.length };
  });
}

async function remove(actor, type, id, revision) {
  if (!/^[a-f0-9]{64}$/.test(revision || '')) fail('invalid_params');
  return pool.withTransaction(async db => {
    await authorize(db, actor, type);
    const value = await readRecord(db, actor, type, id);
    if (!value) {
      const [previous] = await db.query('SELECT id FROM admin_record_deletions WHERE org_id = ? AND record_type = ? AND record_id = ?', [actor.orgId, type, id]);
      if (previous[0]) return { deletionId: previous[0].id, deleted: true };
      fail('not_found');
    }
    if (value.revision !== revision) fail('record_changed');
    const deletionId = crypto.randomUUID();
    await db.query('INSERT INTO admin_record_deletions (id, org_id, record_type, record_id, operator_person_id, operator_grant_id) VALUES (?, ?, ?, ?, ?, ?)',
      [deletionId, actor.orgId, type, id, actor.personId, actor.grantId]);
    if (type === 'audit') {
      const paths = new Set(value.files.flatMap(row => [row.file_path, row.original_file_path]));
      value.evidence.forEach(row => { paths.add(row.input_file_path); paths.add(row.output_file_path); });
      for (const filePath of paths) {
        if (!filePath) continue;
        await db.query('INSERT INTO admin_record_file_cleanup (id, deletion_id, org_id, file_path) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), deletionId, actor.orgId, filePath]);
      }
      await db.query('DELETE FROM audit_signing_evidence WHERE submission_id = ? AND org_id = ?', [id, actor.orgId]);
      await db.query('DELETE FROM audit_read_cursors WHERE submission_id = ? AND org_id = ?', [id, actor.orgId]);
      await db.query('DELETE FROM audit_submissions WHERE id = ? AND org_id = ?', [id, actor.orgId]);
    } else if (type === 'booking') {
      await db.query('DELETE FROM venue_bookings WHERE id = ? AND (creator_org_id = ? OR approval_org_id = ?)', [id, actor.orgId, actor.orgId]);
    } else {
      await db.query('DELETE FROM score_answers WHERE record_id = ? AND org_id = ?', [id, actor.orgId]);
      await db.query('DELETE FROM score_records WHERE id = ? AND org_id = ?', [id, actor.orgId]);
    }
    // 与通知投递共用记录行锁；删除后迟到任务不能重新生成通知。
    const organizations = type === 'booking' ? [...new Set([value.record.creator_org_id, value.record.approval_org_id].filter(Boolean))] : [actor.orgId];
    await db.query('DELETE FROM notifications WHERE org_id IN (?) AND target_type = ? AND target_id = ?', [organizations, TYPES[type].targetType, id]);
    await db.query("DELETE FROM notification_outbox WHERE org_id IN (?) AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.targetType')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.targetId')) = ?", [organizations, TYPES[type].targetType, id]);
    return { deletionId, deleted: true };
  });
}

module.exports = { TYPES, preview, remove, authorize, readRecord };
