'use strict';

const crypto = require('node:crypto');
const templates = require('../../modules/scoring/models/scoreTemplate');
const questions = require('../../modules/scoring/models/scoreQuestion');

function fail(code) { throw Object.assign(new Error(code), { code }); }
function text(value, limit, required = false) {
  if (typeof value !== 'string' || Array.from(value).length > limit || (required && !value.trim())) fail('config_copy_invalid');
  return value;
}
function normalize(raw) {
  if (!raw || !Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 1000) fail('config_copy_invalid');
  return {
    name: text(raw.name, 200, true).trim(), description: text(raw.description, 16000),
    questions: raw.questions.map(item => {
      if (!item) fail('config_copy_invalid');
      const result = { question: text(item.question, 16000, true), scoreLabel: text(item.scoreLabel, 16000) };
      for (const key of ['minValue', 'startValue', 'maxValue', 'stepValue']) {
        const value = item[key];
        // 与持久化的两位小数保持一致，禁止复制时截断或舍入评分依据。
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= 100000000
          || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) fail('config_copy_invalid');
        result[key] = value;
      }
      if (result.stepValue <= 0 || result.minValue > result.maxValue
        || result.startValue < result.minValue || result.startValue > result.maxValue) fail('config_copy_invalid');
      return result;
    })
  };
}

module.exports = {
  normalize,
  references(raw) {
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length)) fail('config_copy_reference');
    return {};
  },
  async source(connection, orgId, id) {
    const [rows] = await connection.query('SELECT name, description FROM score_question_templates WHERE org_id = ? AND id = ? FOR SHARE', [orgId, id]);
    if (!rows.length) fail('config_copy_missing');
    const [items] = await connection.query(`SELECT question, score_label, min_value, start_value, max_value, step_value
      FROM score_questions WHERE template_id = ? ORDER BY sort_order, id FOR SHARE`, [id]);
    return normalize({ name: rows[0].name, description: rows[0].description || '', questions: items.map(item => ({
      question: item.question || '', scoreLabel: item.score_label || '', minValue: Number(item.min_value),
      startValue: Number(item.start_value), maxValue: Number(item.max_value), stepValue: Number(item.step_value)
    })) });
  },
  async create(connection, orgId, raw, _mapping, reference) {
    const payload = normalize(raw);
    const [duplicates] = await connection.query('SELECT id FROM score_question_templates WHERE org_id = ? AND name = ? FOR UPDATE', [orgId, payload.name]);
    if (duplicates.length) fail('config_copy_duplicate');
    const id = crypto.randomUUID();
    await templates.create(id, orgId, { name: payload.name, description: payload.description, createdBy: reference.contextId }, connection);
    for (let index = 0; index < payload.questions.length; index += 1) {
      await questions.create(crypto.randomUUID(), id, index + 1, payload.questions[index], connection);
    }
    return id;
  }
};
