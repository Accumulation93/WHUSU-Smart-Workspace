'use strict';

function normalize(value) {
  if (value === undefined || value === null) return null;
  let values = value;
  if (typeof value === 'string') {
    try { values = JSON.parse(value); }
    catch (_) { throw Object.assign(new Error('identity_natures_required'), { code: 'identity_natures_required' }); }
  }
  if (!Array.isArray(values) || !values.length || values.length > 256
    || values.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(id))) {
    throw Object.assign(new Error('identity_natures_required'), { code: 'identity_natures_required' });
  }
  return [...new Set(values)].sort();
}

function matches(value, assignmentNature) {
  try {
    const values = normalize(value);
    return values === null || values.includes(assignmentNature);
  } catch (_) {
    return false;
  }
}

// 旧编辑器未回传新列时，仅在条件仍可唯一对应时继承，不能把已有范围改成不限。
function preserveMissing(incoming, existing, keyOf) {
  const scoped = existing.filter(item => normalize(item.natureIds) !== null);
  if (!scoped.length) return incoming;
  for (const item of incoming) {
    if (normalize(item.natureIds) !== null) continue;
    const candidates = existing.filter(previous => keyOf(previous) === keyOf(item));
    const choices = [...new Set(candidates.map(previous => JSON.stringify(normalize(previous.natureIds))))];
    if (choices.length !== 1) {
      throw Object.assign(new Error('identity_natures_required'), { code: 'identity_natures_required' });
    }
    item.natureIds = JSON.parse(choices[0]);
  }
  return incoming;
}

module.exports = { normalize, matches, preserveMissing };
