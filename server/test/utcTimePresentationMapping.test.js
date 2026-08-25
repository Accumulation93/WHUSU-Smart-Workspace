'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const materializer = require('../scripts/materializeUtcTimeReviews');

async function testProvableMappingAnalysis() {
  const calls = [];
  const result = await materializer.analyzeProvablePresentationMappings({
    async query(sql, params) {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      return [[
        {
          id: 'review-1', tableName: 'audit_submissions', columnName: 'created_at',
          recordLocator: { id: 'record-1' }, primaryRecordId: 'record-1',
          rawValue: '2026-08-23 11:10:16.000'
        },
        {
          id: 'review-2', tableName: 'audit_submissions', columnName: 'processed_at',
          recordLocator: { id: 'shared-id' }, primaryRecordId: 'shared-id',
          rawValue: '2026-08-23 12:00:00.000'
        },
        {
          id: 'review-3', tableName: 'venue_bookings', columnName: 'processed_at',
          recordLocator: { id: 'shared-id' }, primaryRecordId: 'shared-id',
          rawValue: '2026-08-23 12:00:00.000'
        },
        {
          id: 'review-4', tableName: 'audit_steps', columnName: 'completed_at',
          recordLocator: { id: '' }, primaryRecordId: '', rawValue: '2026-08-23 13:00:00.000'
        }
      ]];
    }
  });
  assert.deepStrictEqual(result, {
    total: 4,
    mappedCount: 1,
    ambiguousCount: 2,
    unmappedCount: 3
  });
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].sql, /primary_record_id AS primaryRecordId/);
  assert.strictEqual(materializer.isProvablePresentationColumn('created_at'), true);
  assert.strictEqual(materializer.isProvablePresentationColumn('plain_value'), false);

  const source = fs.readFileSync(
    path.join(__dirname, '../scripts/materializeUtcTimeReviews.js'), 'utf8'
  );
  assert.match(source, /presentationMapping\.mappedCount/);
  assert.match(source, /presentationUnmappedReviewCount/);
  assert.match(source, /mapping_incomplete/);
  assert.doesNotMatch(
    source,
    /\[cutoverStatus,\s*recordCount,\s*unresolvedReviewCount,\s*unresolvedReviewCount/
  );
}

testProvableMappingAnalysis().then(() => {
  console.log('UTC 展示映射可证明性测试通过');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
