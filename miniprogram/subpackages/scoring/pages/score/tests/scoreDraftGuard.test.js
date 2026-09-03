'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createScoreSignature,
  isScoreDraftDirty
} = require('../scoreDraftGuard');

test('评分草稿只比较题目分数，不受校验展示状态影响', function () {
  const baseline = createScoreSignature([
    { score: 8, touched: false, errorText: '' },
    { score: '5.00', touched: false, errorText: '' }
  ]);

  assert.equal(isScoreDraftDirty([
    { score: '8', touched: true, errorText: '展示用错误' },
    { score: '5.00', touched: true, errorText: '' }
  ], baseline), false);
});

test('任意题目分数变化都会标记为未提交草稿', function () {
  const baseline = createScoreSignature([{ score: '8' }, { score: '5' }]);
  assert.equal(isScoreDraftDirty([{ score: '9' }, { score: '5' }], baseline), true);
});

test('分数恢复为载入值后清除草稿状态', function () {
  const baseline = createScoreSignature([{ score: '8.00' }, { score: '' }]);
  assert.equal(isScoreDraftDirty([{ score: 9 }, { score: '' }], baseline), true);
  assert.equal(isScoreDraftDirty([{ score: 8 }, { score: null }], baseline), false);
});

test('数值相同但显示精度不同的分数视为原值', function () {
  const baseline = createScoreSignature([{ score: '8.00' }, { score: '5.0' }]);
  assert.equal(isScoreDraftDirty([{ score: '8' }, { score: 5 }], baseline), false);
});
