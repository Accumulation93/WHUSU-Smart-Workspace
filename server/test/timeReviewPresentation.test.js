'use strict';

const assert = require('assert');

process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';

const {
  collectPresentationCandidates,
  annotateCandidates,
  TimeReviewPresentationError
} = require('../src/middleware/timeReviewPresentation');

const body = {
  records: [
    { id: 'record-1', createdAt: '2026-08-23T11:10:16.000Z' },
    { submissionId: 'record-2', submittedAt: '2026-08-23T12:00:00.000Z' },
    { id: 'record-3', createdAt: '2026-08-23T11:10:16.000Z' },
    { id: 'record-4', processed_at: '2026-08-23T13:00:00.000Z' },
    { completedAt: '2026-08-23T14:00:00.000Z' }
  ]
};
const collected = collectPresentationCandidates(body);
assert.deepStrictEqual(collected.recordIds.sort(), ['record-1', 'record-2', 'record-3', 'record-4']);
const mapped = annotateCandidates(collected.descriptors, [
  {
    tableName: 'audit_records',
    columnName: 'created_at',
    recordLocator: { id: 'record-1' },
    primaryRecordId: 'record-1',
    rawValue: new Date('2026-08-23T11:10:16.000Z'),
    reviewStatus: 'review_required'
  },
  {
    tableName: 'audit_submissions',
    columnName: 'submitted_at',
    recordLocator: { submission_id: 'record-2' },
    primaryRecordId: 'record-2',
    rawValue: '2026-08-23 12:00:00.000',
    reviewStatus: 'review_required'
  },
  {
    tableName: 'audit_steps',
    columnName: 'processed_at',
    recordLocator: { id: 'record-4' },
    primaryRecordId: 'record-4',
    rawValue: '2026-08-23 13:00:00.000',
    reviewStatus: 'review_required'
  },
  {
    tableName: 'audit_steps',
    columnName: 'completed_at',
    recordLocator: { id: 'internal-record-5' },
    primaryRecordId: 'internal-record-5',
    rawValue: '2026-08-23 14:00:00.000',
    reviewStatus: 'review_required'
  }
]);
assert.strictEqual(mapped, 3);
assert.strictEqual(body.records[0].createdAtReviewStatus, 'review_required');
assert.strictEqual(body.records[1].submittedAtReviewStatus, 'review_required');
assert.strictEqual(body.records[2].createdAtReviewStatus, undefined);
assert.strictEqual(body.records[3].processed_atReviewStatus, 'review_required');
assert.strictEqual(body.records[4].completedAtReviewStatus, undefined);
assert.strictEqual(body.records[0].createdAt, '2026-08-23T11:10:16.000Z');

const ambiguousBody = {
  id: 'shared-id',
  createdAt: '2026-08-23T11:10:16.000Z'
};
const ambiguousDescriptors = collectPresentationCandidates(ambiguousBody).descriptors;
assert.throws(() => annotateCandidates(ambiguousDescriptors, [
  {
    tableName: 'audit_submissions', columnName: 'created_at', recordLocator: { id: 'shared-id' }, primaryRecordId: 'shared-id',
    rawValue: '2026-08-23T11:10:16.000Z', reviewStatus: 'review_required'
  },
  {
    tableName: 'venue_bookings', columnName: 'created_at', recordLocator: { id: 'shared-id' }, primaryRecordId: 'shared-id',
    rawValue: '2026-08-23T11:10:16.000Z', reviewStatus: 'review_required'
  }
]), (error) => error instanceof TimeReviewPresentationError
  && error.code === 'time_review_presentation_mapping_ambiguous');
assert.strictEqual(ambiguousBody.createdAtReviewStatus, undefined);

const columnScopedBody = {
  id: 'same-id-and-time',
  createdAt: '2026-08-23T11:10:16.000Z',
  processedAt: '2026-08-23T11:10:16.000Z'
};
const columnMapped = annotateCandidates(
  collectPresentationCandidates(columnScopedBody).descriptors,
  [{
    tableName: 'audit_steps', columnName: 'processed_at',
    recordLocator: { id: 'same-id-and-time' }, primaryRecordId: 'same-id-and-time',
    rawValue: '2026-08-23T11:10:16.000Z', reviewStatus: 'review_required'
  }]
);
assert.strictEqual(columnMapped, 1);
assert.strictEqual(columnScopedBody.createdAtReviewStatus, undefined);
assert.strictEqual(columnScopedBody.processedAtReviewStatus, 'review_required');

assert.throws(() => collectPresentationCandidates({ rows: [{ id: 'one' }, { id: 'two' }] }, {
  maxNodes: 2
}), (error) => error instanceof TimeReviewPresentationError
  && error.code === 'time_review_presentation_node_limit_exceeded');

const regularLargeDirectory = {
  rows: Array.from({ length: 100005 }, (unused, index) => ({ id: `record-${index}` }))
};
assert.doesNotThrow(() => collectPresentationCandidates(regularLargeDirectory));

console.log('time review presentation tests passed');
