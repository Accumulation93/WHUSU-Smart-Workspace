'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { describeProfile } = require('../../shared/hrProfileStatusView');
const copy = require('../../shared/locales/zh-CN/home').text;

test('review status is independent of required-field completeness', () => {
  const view = describeProfile({ reviewStatus: 'approved', auditStatus: 'none', isComplete: false, template: { editMode: 'audit' } }, copy);
  assert.equal(view.statusText, copy.profileReviewApproved);
  assert.equal(view.completenessText, copy.profileIncomplete);
  assert.equal(view.editable, true);
});

test('hidden facts stay hidden and unknown modes do not allow editing', () => {
  const hidden = describeProfile({ statusText: 'server display', auditStatusText: 'server display' }, copy);
  assert.equal(hidden.statusText, '');
  assert.equal(hidden.completenessText, '');
  const legacy = describeProfile({ auditStatus: 'none', template: { editMode: 'unrecognized' } }, copy);
  assert.equal(legacy.statusText, copy.profileStatusUnknown);
  assert.equal(legacy.modeText, copy.profileModeUnknown);
  assert.equal(legacy.editable, false);
});
