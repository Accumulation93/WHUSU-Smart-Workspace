'use strict';

const assert = require('assert');

process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';

const {
  collectPresentationCandidates,
  annotateCandidates
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
    primaryRecordId: 'record-1',
    rawValue: new Date('2026-08-23T11:10:16.000Z'),
    reviewStatus: 'review_required'
  },
  {
    primaryRecordId: 'record-2',
    rawValue: '2026-08-23 12:00:00.000',
    reviewStatus: 'review_required'
  },
  {
    primaryRecordId: 'record-4',
    rawValue: '2026-08-23 13:00:00.000',
    reviewStatus: 'review_required'
  },
  {
    primaryRecordId: 'internal-record-5',
    rawValue: '2026-08-23 14:00:00.000',
    reviewStatus: 'review_required'
  }
]);
assert.strictEqual(mapped, 4);
assert.strictEqual(body.records[0].createdAtReviewStatus, 'review_required');
assert.strictEqual(body.records[1].submittedAtReviewStatus, 'review_required');
assert.strictEqual(body.records[2].createdAtReviewStatus, undefined);
assert.strictEqual(body.records[3].processed_atReviewStatus, 'review_required');
assert.strictEqual(body.records[4].completedAtReviewStatus, 'review_required');
assert.strictEqual(body.records[0].createdAt, '2026-08-23T11:10:16.000Z');

console.log('time review presentation tests passed');
