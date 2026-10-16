'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const state = { record: null, audit: [], queue: [], statements: [], permission: true, session: true, failure: false };
const database = {
  async withTransaction(work) {
    const before = structuredClone(state);
    try { return await work(this); }
    catch (error) { Object.assign(state, before); throw error; }
  },
  async query(sql, params) {
    state.statements.push(sql);
    if (sql.includes('FROM persons')) return [[{ status: 'active' }]];
    if (sql.includes('FROM accounts')) return [[{ status: 'verified', token_version: 1 }]];
    if (sql.includes('FROM auth_sessions')) return [state.session ? [{ token_version: 1 }] : []];
    if (sql.includes('FROM admin_grants')) return [[{ id: 'grant', legacy_admin_id: 'admin', org_id: 'org', status: 'active', admin_level: 'admin' }]];
    if (sql.startsWith('SELECT * FROM audit_submissions')) return [state.record && params[1] === 'org' ? [state.record] : []];
    if (sql.startsWith('SELECT id, file_path, file_hash')) return [[{ id: 'file', file_path: '/fixture/original.pdf', file_hash: 'digest' }]];
    if (sql.startsWith('SELECT id, input_file_path')) return [[{ id: 'evidence', input_file_path: '/fixture/original.pdf', output_file_path: '/fixture/signed.pdf' }]];
    if (sql.startsWith('SELECT * FROM audit_submission_steps')) return [[{ id: 'step', status: 'approved' }]];
    if (sql.startsWith('SELECT id FROM admin_record_deletions')) return [state.audit];
    if (sql.startsWith('INSERT INTO admin_record_deletions')) { state.audit.push({ id: params[0] }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO admin_record_file_cleanup')) { state.queue.push(params[3]); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE FROM audit_submissions')) {
      if (state.failure) throw new Error('fixture_transaction_failure');
      state.record = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM ')) return [{ affectedRows: 1 }];
    throw new Error('未处理 SQL: ' + sql);
  }
};
function replace(relative, exports) {
  const id = require.resolve(relative);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
replace('../src/config/db', database);
replace('../src/core/models/adminPermission', { async getOverrides() { return [{ permission_key: 'audit.submissions_delete', granted: state.permission ? 1 : 0 }]; } });
replace('../src/core/services/adminRecordFileCleanup', { async processPending() { return { pending: 0 }; } });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.logger = { error() {} };
  req.authAccount = { id: 'account', personId: 'person' };
  req.authSession = { id: 'session' };
  req.authContext = { role: req.get('X-Test-Role') || 'admin', personId: 'person', adminGrantId: 'grant', organizationId: req.get('X-Test-Org') || 'org', contextId: 'context' };
  next();
});
app.use(require('../src/core/routes/adminRecordDeletion'));

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  async function post(route, body = {}, headers = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + route, {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body)
    });
    return { code: response.status, body: await response.json() };
  }
  try {
    state.record = { id: 'record', org_id: 'org', title: '隔离审核申请', status: 'approved' };
    const preview = await post('/previewAuditSubmissionDeletion', { id: 'record' });
    assert.equal(preview.code, 200);
    assert.equal(preview.body.record.attachmentCount, 1);
    const body = { id: 'record', revision: preview.body.record.revision };
    assert.equal((await post('/deleteAuditSubmission', body, { 'X-Test-Role': 'user' })).code, 403);
    assert.equal((await post('/deleteAuditSubmission', body, { 'X-Test-Org': 'other' })).code, 403);
    state.permission = false;
    assert.equal((await post('/deleteAuditSubmission', body)).code, 403);
    state.permission = true; state.session = false;
    assert.equal((await post('/deleteAuditSubmission', body)).code, 403);
    state.session = true;
    state.record.status = 'withdrawn';
    assert.equal((await post('/deleteAuditSubmission', body)).code, 409);
    state.record.status = 'approved'; state.failure = true;
    assert.equal((await post('/deleteAuditSubmission', body)).code, 500);
    assert.equal(state.audit.length, 0);
    assert.equal(state.queue.length, 0);
    assert.ok(state.record);
    state.failure = false;
    assert.equal((await post('/deleteAuditSubmission', body)).body.deleted, true);
    assert.equal(state.record, null);
    assert.equal(state.audit.length, 1);
    assert.deepEqual(state.queue.sort(), ['/fixture/original.pdf', '/fixture/signed.pdf']);
    assert.equal((await post('/deleteAuditSubmission', body)).body.deleted, true);
    assert.equal(state.audit.length, 1);
    assert.equal((await post('/previewAuditSubmissionDeletion', { id: 'record' })).code, 404);
    assert.ok(state.statements.some(sql => sql.startsWith('DELETE FROM notification_outbox')));
    assert.ok(state.statements.some(sql => sql.startsWith('DELETE FROM audit_signing_evidence')));
    console.log('管理员删除 HTTP 参数、授权撤销、会话撤销、版本变化、回滚、附件队列与重复提交测试通过（隔离存储替身）');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
