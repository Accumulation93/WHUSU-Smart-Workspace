'use strict';

const pool = require('../config/db');
const { toIsoUtc } = require('../utils/dateTime');

const MIGRATION_KEY = '20260823190000';
const MAX_RESPONSE_NODES = 100000;
const LOOKUP_CHUNK_SIZE = 500;
const ABSOLUTE_RESPONSE_FIELD = /(?:At|Until|TimeStart|TimeEnd|Starts|Ends|_at|_until|time_start|time_end)$/;
const RECORD_ID_FIELD = /(?:^id$|Id$)/;

function scalarRecordId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim();
  return text && text.length <= 191 ? text : '';
}

function collectPresentationCandidates(body) {
  const descriptors = [];
  const recordIds = new Set();
  const rawTimes = new Set();
  const stack = [body];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > MAX_RESPONSE_NODES) break;
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
      continue;
    }
    const ids = [];
    const times = [];
    Object.entries(current).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        stack.push(value);
        return;
      }
      if (RECORD_ID_FIELD.test(key)) {
        const id = scalarRecordId(value);
        if (id) {
          ids.push(id);
          recordIds.add(id);
        }
      }
      if (ABSOLUTE_RESPONSE_FIELD.test(key) && !key.endsWith('Text') && !key.endsWith('ReviewStatus')) {
        const iso = toIsoUtc(value);
        if (iso) {
          times.push({ key, iso });
          rawTimes.add(iso);
        }
      }
    });
    if (times.length) descriptors.push({ target: current, ids, times });
  }
  return { descriptors, recordIds: Array.from(recordIds), rawTimes: Array.from(rawTimes) };
}

function buildReviewLookup(reviewRows) {
  const exact = new Set();
  const rawTimes = new Set();
  (reviewRows || []).forEach((row) => {
    const id = scalarRecordId(row.primaryRecordId);
    const iso = toIsoUtc(row.rawValue);
    if (!iso || row.reviewStatus !== 'review_required') return;
    rawTimes.add(iso);
    if (id) exact.add(`${id}\u0000${iso}`);
  });
  return { exact, rawTimes };
}

function annotateCandidates(descriptors, reviewRows) {
  const lookup = buildReviewLookup(reviewRows);
  let mappedFieldCount = 0;
  (descriptors || []).forEach((descriptor) => {
    descriptor.times.forEach((time) => {
      const requiresReview = descriptor.ids.length
        ? descriptor.ids.some((id) => lookup.exact.has(`${id}\u0000${time.iso}`))
        : lookup.rawTimes.has(time.iso);
      if (!requiresReview) return;
      descriptor.target[`${time.key}ReviewStatus`] = 'review_required';
      mappedFieldCount += 1;
    });
  });
  return mappedFieldCount;
}

async function loadReviewRows(recordIds, rawTimes) {
  const rowsById = new Map();
  const appendRows = (batch) => {
    batch.forEach((row) => {
      const key = `${scalarRecordId(row.primaryRecordId)}\u0000${toIsoUtc(row.rawValue) || ''}`;
      rowsById.set(key, row);
    });
  };
  for (let start = 0; start < recordIds.length; start += LOOKUP_CHUNK_SIZE) {
    const chunk = recordIds.slice(start, start + LOOKUP_CHUNK_SIZE);
    const [batch] = await pool.query(
      `SELECT primary_record_id AS primaryRecordId, raw_value AS rawValue,
              review_status AS reviewStatus
         FROM absolute_time_record_reviews
        WHERE migration_key = ? AND review_status = 'review_required'
          AND primary_record_id IN (${chunk.map(() => '?').join(', ')})`,
      [MIGRATION_KEY, ...chunk]
    );
    appendRows(batch);
  }
  for (let start = 0; start < rawTimes.length; start += LOOKUP_CHUNK_SIZE) {
    const chunk = rawTimes.slice(start, start + LOOKUP_CHUNK_SIZE).map((value) => new Date(value));
    const [batch] = await pool.query(
      `SELECT primary_record_id AS primaryRecordId, raw_value AS rawValue,
              review_status AS reviewStatus
         FROM absolute_time_record_reviews
        WHERE migration_key = ? AND review_status = 'review_required'
          AND raw_value IN (${chunk.map(() => '?').join(', ')})`,
      [MIGRATION_KEY, ...chunk]
    );
    appendRows(batch);
  }
  return Array.from(rowsById.values());
}

async function annotateTimeReviewPresentation(body) {
  const collected = collectPresentationCandidates(body);
  if (!collected.descriptors.length || !collected.rawTimes.length) return body;
  try {
    const rows = await loadReviewRows(collected.recordIds, collected.rawTimes);
    annotateCandidates(collected.descriptors, rows);
  } catch (error) {
    // 兼容迁移尚未创建审计表的滚动发布窗口；部署健康门禁会阻止该状态长期存在。
    if (!error || error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  return body;
}

function timeReviewPresentationMiddleware(req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = function(body) {
    annotateTimeReviewPresentation(body)
      .then((annotated) => sendJson(annotated))
      .catch((error) => next(error));
    return res;
  };
  next();
}

module.exports = {
  MIGRATION_KEY,
  collectPresentationCandidates,
  buildReviewLookup,
  annotateCandidates,
  annotateTimeReviewPresentation,
  timeReviewPresentationMiddleware
};
