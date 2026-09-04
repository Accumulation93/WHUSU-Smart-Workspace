'use strict';

const SUPPORTED_ASSIGNMENT_NATURES = Object.freeze(['staff', 'liaison', 'other']);

function countUserCharacters(value) {
  return Array.from(String(value == null ? '' : value)).length;
}

function normalizeAssignmentNature(value) {
  const normalized = String(value == null ? '' : value).trim();
  return SUPPORTED_ASSIGNMENT_NATURES.indexOf(normalized) >= 0 ? normalized : '';
}

module.exports = {
  SUPPORTED_ASSIGNMENT_NATURES,
  countUserCharacters,
  normalizeAssignmentNature
};
