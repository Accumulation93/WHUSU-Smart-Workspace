import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditAssignmentLabel } from '../src/runtime/auditAssignmentLabel.js';
import { presentAuditStep } from '../src/shared/auditStepView.js';

test('historical event fields remain visible without changing the snapshot', () => {
  const snapshot = Object.freeze({ identity: 'Chair', department: 'Committee', workGroup: '', role: 'user' });
  const event = { eventType: 'approve', round: 1, stepIndex: 1, operatorName: 'Actor', operatorContextSnapshot: snapshot };
  const view = presentAuditStep({ status: 'approved' }, { id: 's1', status: 'approved', round: 1, sortOrder: 1 }, [event], 1);
  assert.equal(auditAssignmentLabel(view.snapshot), 'Chair · Committee');
  assert.equal(view.snapshot, snapshot);
  assert.equal(snapshot.assignmentId, undefined);
});

test('explicit historical labels take priority over component fields', () => {
  assert.equal(auditAssignmentLabel({ assignmentLabel: 'Recorded role', identity: 'Other' }), 'Recorded role');
  assert.equal(auditAssignmentLabel({ assignmentName: 'Recorded name' }), 'Recorded name');
});

test('current snapshot aliases and serialized snapshots are supported', () => {
  assert.equal(auditAssignmentLabel({ identityCategoryName: 'Member', departmentName: 'Office', workGroupName: 'Team' }), 'Member · Office · Team');
  assert.equal(auditAssignmentLabel('{"identity":"Member","department":"Office"}'), 'Member · Office');
});

test('missing roles never derive a label from identifiers or administrative context', () => {
  for (const source of [null, {}, [], '{invalid', { assignmentId: 'a1', role: 'admin', contextId: 'c1' }]) {
    assert.equal(auditAssignmentLabel(source), '');
  }
});
