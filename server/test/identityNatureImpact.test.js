'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { referencesCombination } = require('../src/core/models/identityNatureImpact');
test('授权维度按同一条件性质与身份匹配，保留其他分支', () => {
  const check = value => referencesCombination(value, 'identity', ['liaison'], ['assignment']);
  assert.equal(check({ dimensions: { natureId: ['staff'], identityCategoryId: ['identity'] } }), false);
  assert.equal(check({ dimensions: { natureId: ['liaison'], identityCategoryId: ['identity'] } }), true);
  assert.equal(check([{ natureIds: ['staff'], identityIds: ['identity'] }, { natureIds: ['liaison'], identityIds: ['other'] }]), false);
  assert.equal(check({ natureIds: null, identityIds: ['identity'] }), true);
  assert.equal(check({ assignmentIds: ['assignment'] }), true);
});
