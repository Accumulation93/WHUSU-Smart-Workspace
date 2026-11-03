'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { describe } = require('../../shared/hrTemplateValidationView');
const copy = require('../../shared/locales/zh-CN/hrTemplateSave');

test('template rejection uses submitted index even when labels repeat', () => {
  const fields = [{ label: 'same' }, { label: 'same' }];
  const result = describe({ reasonCode: 'field_name_duplicate', fieldIndex: 1, duplicateOfIndex: 0, message: 'untrusted' }, fields, copy);
  assert.equal(result.fieldIndex, 1);
  assert.equal(result.message, copy.fieldIssue(2, 'same', copy.fieldNameDuplicateAt(1)));
});

test('unknown or invalid field indices never target a different field', () => {
  const result = describe({ reasonCode: 'field_length_invalid', bound: 'max', fieldIndex: 9 }, [{ label: 'a' }], copy);
  assert.equal(result.fieldIndex, -1);
  assert.equal(result.message, copy.fieldMaxLengthInvalid);
  assert.equal(describe({ reasonCode: 'other', message: 'untrusted' }, [], copy).message, copy.templateIssueUnknown);
  assert.equal(describe({ reasonCode: 'field_name_required', fieldIndex: 0 }, [{ label: '' }], copy).message, copy.unnamedFieldIssue(1, copy.field_name_required));
});
