'use strict';

const pool = require('../config/db');
const { toIsoUtc } = require('../utils/dateTime');

const MIGRATION_KEY = '20260823190000';
const DEFAULT_MAX_RESPONSE_NODES = 1000000;
const LOOKUP_CHUNK_SIZE = 500;
const ABSOLUTE_RESPONSE_FIELD = /(?:At|Until|TimeStart|TimeEnd|Starts|Ends|_at|_until|time_start|time_end)$/;
const RECORD_ID_FIELD = /(?:^id$|Id$|_id)$/;

class TimeReviewPresentationError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'TimeReviewPresentationError';
    this.code = code;
    this.detail = detail || null;
  }
}

function scalarRecordId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim();
  return text && text.length <= 191 ? text : '';
}

function maxResponseNodes(options) {
  const configured = Number(options && options.maxNodes
    || process.env.TIME_REVIEW_MAX_RESPONSE_NODES
    || DEFAULT_MAX_RESPONSE_NODES);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_RESPONSE_NODES;
}

function columnNameToResponseKeys(columnName) {
  const column = String(columnName || '').trim();
  if (!/^[a-z][a-z0-9_]{0,127}$/.test(column)) return [];
  const camel = column.replace(/_([a-z0-9])/g, (unused, part) => part.toUpperCase());
  return Array.from(new Set([column, camel]));
}

function recordLocatorIdKeys(row) {
  let locator = row && row.recordLocator;
  if (typeof locator === 'string') {
    try { locator = JSON.parse(locator || '{}'); } catch (_) { return []; }
  }
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) return [];
  const primaryColumn = Object.keys(locator)[0];
  if (!primaryColumn) return [];
  return columnNameToResponseKeys(primaryColumn).filter((key) => RECORD_ID_FIELD.test(key));
}

function collectPresentationCandidates(body, options) {
  const descriptors = [];
  const recordIds = new Set();
  const rawTimes = new Set();
  const stack = [body];
  let nodes = 0;
  const nodeLimit = maxResponseNodes(options);
  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > nodeLimit) {
      throw new TimeReviewPresentationError('time_review_presentation_node_limit_exceeded', {
        nodeLimit
      });
    }
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
          ids.push({ key, id });
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
  const exact = new Map();
  (reviewRows || []).forEach((row) => {
    const id = scalarRecordId(row.primaryRecordId);
    const iso = toIsoUtc(row.rawValue);
    const tableName = String(row.tableName || '').trim();
    const columnName = String(row.columnName || '').trim();
    if (!id || !iso || !tableName || row.reviewStatus !== 'review_required') return;
    const signature = `${tableName}\u0000${columnName}\u0000${id}\u0000${iso}`;
    recordLocatorIdKeys(row).forEach((idKey) => {
      columnNameToResponseKeys(columnName).forEach((responseKey) => {
        const key = `${idKey}\u0000${id}\u0000${responseKey}\u0000${iso}`;
        if (!exact.has(key)) exact.set(key, new Set());
        exact.get(key).add(signature);
      });
    });
  });
  return { exact };
}

function annotateCandidates(descriptors, reviewRows) {
  const lookup = buildReviewLookup(reviewRows);
  let mappedFieldCount = 0;
  (descriptors || []).forEach((descriptor) => {
    descriptor.times.forEach((time) => {
      const matches = new Set();
      descriptor.ids.forEach((identity) => {
        const signatures = lookup.exact.get(
          `${identity.key}\u0000${identity.id}\u0000${time.key}\u0000${time.iso}`
        );
        if (signatures) signatures.forEach((signature) => matches.add(signature));
      });
      if (matches.size > 1) {
        throw new TimeReviewPresentationError('time_review_presentation_mapping_ambiguous', {
          field: time.key,
          matchCount: matches.size
        });
      }
      if (matches.size !== 1) return;
      descriptor.target[`${time.key}ReviewStatus`] = 'review_required';
      mappedFieldCount += 1;
    });
  });
  return mappedFieldCount;
}

async function loadReviewRows(recordIds) {
  const rowsByIdentity = new Map();
  const appendRows = (batch) => {
    batch.forEach((row) => {
      const key = [String(row.tableName || ''), String(row.columnName || ''),
        scalarRecordId(row.primaryRecordId), toIsoUtc(row.rawValue) || ''].join('\u0000');
      rowsByIdentity.set(key, row);
    });
  };
  for (let start = 0; start < recordIds.length; start += LOOKUP_CHUNK_SIZE) {
    const chunk = recordIds.slice(start, start + LOOKUP_CHUNK_SIZE);
    const [batch] = await pool.query(
      `SELECT table_name AS tableName, column_name AS columnName,
              record_locator AS recordLocator,
              primary_record_id AS primaryRecordId, raw_value AS rawValue,
              review_status AS reviewStatus
         FROM absolute_time_record_reviews
        WHERE migration_key = ? AND review_status = 'review_required'
          AND primary_record_id IN (${chunk.map(() => '?').join(', ')})`,
      [MIGRATION_KEY, ...chunk]
    );
    appendRows(batch);
  }
  return Array.from(rowsByIdentity.values());
}

async function annotateTimeReviewPresentation(body) {
  const collected = collectPresentationCandidates(body);
  if (!collected.descriptors.length || !collected.rawTimes.length) return body;
  try {
    const rows = await loadReviewRows(collected.recordIds);
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
      .catch((error) => {
        if (req.logger) {
          req.logger.error('Time review presentation failed', {
            event: 'time.review.presentation_failed',
            code: error && error.code || 'time_review_presentation_failed',
            detail: error && error.detail || null
          });
        }
        next(error);
      });
    return res;
  };
  next();
}

module.exports = {
  MIGRATION_KEY,
  DEFAULT_MAX_RESPONSE_NODES,
  TimeReviewPresentationError,
  columnNameToResponseKeys,
  recordLocatorIdKeys,
  collectPresentationCandidates,
  buildReviewLookup,
  annotateCandidates,
  annotateTimeReviewPresentation,
  timeReviewPresentationMiddleware
};
