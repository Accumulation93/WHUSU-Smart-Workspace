'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const feedback = require('../../shared/responseFeedback');
const copy = require('../../shared/locales/zh-CN/requestFeedback');
const messages = require('../../shared/locales/zh-CN/responseMessages');
const { toEsm } = require('../../scripts/sync-shared-modules');
const { protocolResponse, protectPublicMessage } = require('../src/utils/publicMessage');
const { isReadOnly } = require('../../shared/apiContracts');

test('前端只按结果码展示提示，不采纳后端自由文本', () => {
  const result = { status: 'forbidden', message: 'UNTRUSTED_DATABASE_DETAIL' };
  assert.equal(feedback.feedbackText(result, copy), copy.forbidden);
  assert.equal(feedback.presentResult(result, copy).message, copy.forbidden);
  assert.equal(result.message, 'UNTRUSTED_DATABASE_DETAIL');
  assert.equal(feedback.feedbackText({ message: 'UNTRUSTED' }, copy), copy.writeResultUnknown);
});

test('未知提交结果不冒充失败，已知只读失败可提示重试', () => {
  assert.equal(feedback.feedbackText({ status: 'error' }, copy), copy.writeResultUnknown);
  assert.equal(feedback.feedbackText({ status: 'error' }, copy, { readOnly: true }), copy.readFailed);
  assert.equal(feedback.feedbackText({}, copy, { readOnly: true, timedOut: true }), copy.readTimeout);
  assert.equal(feedback.feedbackText({ status: 'not_found' }, copy), copy.writeResultUnknown);
  assert.equal(feedback.feedbackText({ status: 'not_found' }, copy, { readOnly: true }), copy.resourceUnavailable);
});

test('活动重复、历史引用与删除前记录变化使用具体本地拒绝说明', () => {
  for (const code of ['scoring_activity_duplicate', 'scoring_activity_referenced', 'record_changed']) {
    assert.equal(feedback.feedbackText({ code, message: 'UNTRUSTED' }, copy, { messages }), messages[code]);
  }
  assert.equal(feedback.feedbackText({ status: 'conflict' }, copy, { messages }), copy.writeResultUnknown);
  for (const name of ['listScoreActivities', 'getRateTargets', 'getScoreFormData', 'listDepartments', 'listIdentities', 'listWorkGroups', 'getSystemConfig']) {
    assert.equal(isReadOnly(name), true);
  }
  assert.equal(isReadOnly('saveScoreActivity'), false);
  assert.equal(isReadOnly('deleteScoreActivity'), false);
});

test('混合接口只将已核对的读取动作作为读取，空策略动作仍按写入', () => {
  assert.equal(isReadOnly('admin/auth/policy'), false);
  assert.equal(isReadOnly('admin/auth/policy', { action: 'get' }), true);
  assert.equal(isReadOnly('admin/auth/policy', { action: 'save' }), false);
  assert.equal(isReadOnly('admin/auth/accounts', {}), true);
  assert.equal(isReadOnly('admin/auth/accounts', { action: 'freeze' }), false);
  assert.equal(isReadOnly('admin/auth/claims', { action: 'eligible' }), true);
  assert.equal(isReadOnly('admin/auth/claims', { action: 'approve' }), false);
  assert.equal(isReadOnly('admin/auth/recoveries', { action: 'eligible_accounts' }), true);
  assert.equal(isReadOnly('admin/auth/recoveries', { action: 'revoke' }), false);
  assert.equal(isReadOnly('previewAuditSubmissionDeletion'), true);
  assert.equal(isReadOnly('deleteAuditSubmission'), false);
  assert.equal(isReadOnly('listPendingVenueApprovals'), false);
  assert.equal(isReadOnly('unknownReadLookingName'), false);
});

test('业务事实和成功结构保留，成功消息不从后端显示', () => {
  const data = { name: 'USER_NAME', opinion: 'USER_OPINION', rows: [2, 9] };
  const output = feedback.presentResult({ status: 'success', message: 'SERVER_SUCCESS', data }, copy);
  assert.equal(output.status, 'success');
  assert.equal(output.message, '');
  assert.equal(output.data, data);
  assert.equal(feedback.presentResult(null, copy).status, 'unrecognized_response');
});

test('场地借用明确冲突按已审结果码说明，不解析后端句子', () => {
  for (const code of ['venue_booking_outside_open_hours', 'venue_booking_activity_conflict', 'venue_booking_existing_conflict', 'venue_booking_request_changed']) {
    assert.equal(feedback.feedbackText({ status: 'conflict', code, message: 'UNTRUSTED' }, copy, { messages }), messages[code]);
    assert.ok(messages[code]);
  }
  assert.equal(feedback.feedbackText({ status: 'conflict', message: messages.venue_booking_existing_conflict }, copy, { messages }), copy.writeResultUnknown);
});

test('HTTP认证和限流优先，等待时间只接收受约束整数', () => {
  assert.equal(feedback.feedbackText({ status: 'unknown' }, copy, { statusCode: 401 }), copy.sessionExpired);
  assert.equal(feedback.feedbackText({}, copy, { statusCode: 403 }), copy.forbidden);
  assert.equal(feedback.feedbackText({}, copy, { statusCode: 426 }), copy.outdatedClient);
  assert.equal(feedback.feedbackText({ retryAfterSeconds: 12 }, copy, { statusCode: 429 }), copy.retryAfterSeconds(12));
  for (const retryAfterSeconds of ['12', -1, Infinity, 100000, 'SERVER_TEXT']) {
    assert.equal(feedback.feedbackText({ retryAfterSeconds }, copy, { statusCode: 429 }), copy.rateLimited);
  }
});

test('语言生成支持父目录引用，不重复扩展名', () => {
  const source = "const parent = require('../../common');\nconst sibling = require('./copy.js');\nmodule.exports = { parent, sibling };";
  const output = toEsm(source, 'fixture');
  assert.ok(output.includes("import parent from '../../common.js';"));
  assert.ok(output.includes("import sibling from './copy.js';"));
  assert.ok(!output.includes('require('));
});

test('新协议响应不提供展示消息，旧客户端仍可读取兼容消息', () => {
  const body = { status: 'forbidden', message: 'SERVER_MESSAGE', data: { name: 'USER_NAME' } };
  const modern = protocolResponse(body, 'codes-v1');
  assert.equal(modern.message, undefined);
  assert.equal(modern.status, 'forbidden');
  assert.equal(modern.data.name, 'USER_NAME');
  assert.equal(modern.feedbackVersion, 1);
  assert.deepEqual(protocolResponse(body, undefined), protectPublicMessage(body));
  assert.equal(body.message, 'SERVER_MESSAGE');
});
