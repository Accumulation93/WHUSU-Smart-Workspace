'use strict';

function normalizeScore(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? String(numericValue) : text;
}

function createScoreSignature(questionList) {
  return (Array.isArray(questionList) ? questionList : []).map(function (question) {
    return normalizeScore(question && question.score);
  }).join('\u001f');
}

function isScoreDraftDirty(questionList, baselineSignature) {
  return createScoreSignature(questionList) !== String(baselineSignature == null ? '' : baselineSignature);
}

module.exports = {
  createScoreSignature,
  isScoreDraftDirty
};
