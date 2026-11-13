'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const schema = require('../src/modules/scoring/utils/calculationSnapshotSchema');
const signature = require('../src/modules/scoring/utils/calculationSnapshotSignature');

test('旧 v2 快照保持原字段及签名，不添加空性质条件', () => {
  const snapshot = schema.canonicalizeCalculationSnapshot({ rule: { id: 'r' }, clause: { id: 'c' } });
  assert.equal(snapshot.version, 2);
  assert.equal(Object.hasOwn(snapshot.rule, 'natureIds'), false);
  assert.equal(Object.hasOwn(snapshot.clause, 'natureIds'), false);
  const originalProjection = {
    rule: { id: 'r', scorerDepartmentId: '', scorerIdentityCategoryId: '', allowSelfAssessment: false },
    clause: { id: 'c', scopeType: '', targetIdentityCategoryId: '', requireAllComplete: false, requiredTargets: [] },
    templates: []
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(originalProjection)).digest('hex');
  assert.equal(snapshot.calculationPolicySignature, 'v2:' + digest);
  assert.equal(schema.isCanonicalCalculationSnapshot(snapshot), true);
});

test('新性质条件使用 v3 并绑定双方范围，JSON 重排不影响验证', () => {
  const snapshot = schema.canonicalizeCalculationSnapshot({ rule: { natureIds: ['staff', 'liaison'] }, clause: { natureIds: ['staff'] } });
  assert.equal(snapshot.version, 3);
  assert.deepEqual(snapshot.rule.natureIds, ['liaison', 'staff']);
  assert.equal(signature.validateCalculationPolicySignature(snapshot, snapshot.calculationPolicySignature), true);
  const order = value => Array.isArray(value) ? value.map(order) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, order(value[key])])) : value;
  assert.equal(schema.isCanonicalCalculationSnapshot(order(snapshot)), true);
  assert.equal(signature.validateCalculationPolicySignature(order(snapshot), snapshot.calculationPolicySignature), true);
  snapshot.clause.natureIds = ['liaison'];
  assert.equal(signature.validateCalculationPolicySignature(snapshot, snapshot.calculationPolicySignature), false);
});

test('v3 非法或被删除的性质集合无法通过规范校验', () => {
  const snapshot = schema.canonicalizeCalculationSnapshot({ rule: { natureIds: ['staff'] } });
  snapshot.rule.natureIds = [];
  assert.equal(schema.isCanonicalCalculationSnapshot(snapshot), false);
  assert.equal(schema.isSupportedCalculationSnapshotVersion(3), true);
  assert.equal(schema.isSupportedCalculationSnapshotVersion(4), false);
});
