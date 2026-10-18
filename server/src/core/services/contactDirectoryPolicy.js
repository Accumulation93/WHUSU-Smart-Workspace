'use strict';

// 授权始终在同一个岗位元组上判断；未知条件不能退化为全员。
const DIMENSIONS = [
  ['departmentIds', 'departmentId', 'sameDepartment'],
  ['identityCategoryIds', 'identityCategoryId', 'sameIdentity'],
  ['workGroupIds', 'workGroupId', 'sameWorkGroup']
];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
class DirectoryError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function fail(code = 'invalidRule') { throw new DirectoryError(code); }
function ids(value) {
  if (!Array.isArray(value) || value.length > 5000 || value.some(id => typeof id !== 'string' || !ID.test(id))) fail();
  return Array.from(new Set(value)).sort();
}
function normalizeClauses(value, target) {
  if (!Array.isArray(value) || !value.length || value.length > 64) fail();
  return value.map(clause => {
    if (!clause || typeof clause !== 'object' || Array.isArray(clause)) fail();
    const allowed = clause.type === 'people' ? ['type', 'personIds']
      : clause.type === 'self' && target ? ['type']
        : clause.type === 'scope' ? ['type'].concat(DIMENSIONS.flatMap(d => target ? [d[0], d[2]] : [d[0]])) : [];
    if (!allowed.length || Object.keys(clause).some(key => !allowed.includes(key))) fail();
    if (clause.type === 'self') return { type: 'self' };
    if (clause.type === 'people') {
      const personIds = ids(clause.personIds);
      if (!personIds.length) fail();
      return { type: 'people', personIds };
    }
    const result = { type: 'scope' };
    let constrained = false;
    DIMENSIONS.forEach(([plural, , same]) => {
      result[plural] = ids(clause[plural] || []);
      if (target) {
        if (clause[same] !== undefined && typeof clause[same] !== 'boolean') fail();
        result[same] = clause[same] === true;
        if (result[same] && result[plural].length) fail();
      }
      constrained = constrained || result[plural].length > 0 || result[same] === true;
    });
    if (!constrained) fail();
    return result;
  });
}
function normalizeRule(input) {
  if (!input || typeof input !== 'object') fail();
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || Array.from(name).length > 80 || typeof input.enabled !== 'boolean') fail();
  if (input.id && (typeof input.id !== 'string' || !ID.test(input.id) || !Number.isSafeInteger(input.version) || input.version < 1)) fail();
  return { id: input.id || '', version: input.id ? input.version : 0, name, enabled: input.enabled,
    audience: normalizeClauses(input.audience, false), targets: normalizeClauses(input.targets, true), fieldIds: ids(input.fieldIds) };
}
function matches(clause, personId, assignment, viewer) {
  if (clause.type === 'self') return personId === viewer.personId;
  if (clause.type === 'people') return clause.personSet ? clause.personSet.has(personId) : clause.personIds.includes(personId);
  if (clause.type !== 'scope' || !assignment) return false;
  return DIMENSIONS.every(([plural, singular, same]) => {
    if (clause[same]) return Boolean(viewer.assignment && viewer.assignment[singular]) && assignment[singular] === viewer.assignment[singular];
    return !clause[plural].length || (clause.valueSets ? clause.valueSets[plural].has(assignment[singular]) : clause[plural].includes(assignment[singular]));
  });
}
function referenceIds(rule) {
  return Array.from(new Set(rule.audience.concat(rule.targets).flatMap(clause => clause.type === 'people' ? clause.personIds : []))).sort();
}
function referenceIndex(catalog) {
  return { people: new Set(catalog.people.map(person => person.personId)), fields: new Set(catalog.fields.map(field => field.id)),
    departmentIds: new Set(catalog.departmentIds), identityCategoryIds: new Set(catalog.identityCategoryIds), workGroupIds: new Set(catalog.workGroupIds) };
}
function validateReferences(rule, catalog, index = referenceIndex(catalog)) {
  const people = index.people;
  if (referenceIds(rule).some(id => !people.has(id))) fail('staleReferences');
  for (const clause of rule.audience.concat(rule.targets)) {
    if (clause.type !== 'scope') continue;
    for (const [plural] of DIMENSIONS) {
      const allowed = index[plural];
      if (clause[plural].some(id => !allowed.has(id))) fail('staleReferences');
    }
  }
  const fields = index.fields;
  if (rule.fieldIds.some(id => !fields.has(id))) fail('staleReferences');
}
function grants(rules, people, viewer, catalog) {
  const matched = [];
  const index = referenceIndex(catalog);
  const activePeople = index.people;
  const prepare = clause => Object.assign({}, clause, clause.type === 'people' ? { personSet: new Set(clause.personIds) }
    : clause.type === 'scope' ? { valueSets: Object.fromEntries(DIMENSIONS.map(([plural]) => [plural, new Set(clause[plural])])) } : {});
  const activeClauses = clauses => clauses.map(clause => clause.type === 'people'
    ? Object.assign({}, clause, { personIds: clause.personIds.filter(id => activePeople.has(id)) }) : clause)
    .filter(clause => clause.type !== 'people' || clause.personIds.length);
  for (const raw of rules) {
    if (!raw.enabled) continue;
    try {
      const rule = normalizeRule(raw);
      rule.audience = activeClauses(rule.audience);
      rule.targets = activeClauses(rule.targets);
      validateReferences(rule, catalog, index);
      rule.audience = rule.audience.map(prepare);
      rule.targets = rule.targets.map(prepare);
      if (rule.audience.some(clause => matches(clause, viewer.personId, viewer.assignment, viewer))) matched.push(rule);
    } catch (error) {
      if (!(error instanceof DirectoryError)) throw error;
    }
  }
  const output = [];
  for (const person of people) {
    for (const assignment of person.assignments.length ? person.assignments : [null]) {
      const fields = new Set();
      let visible = false;
      for (const rule of matched) {
        if (!rule.targets.some(clause => matches(clause, person.personId, assignment, viewer))) continue;
        visible = true;
        rule.fieldIds.forEach(id => fields.add(id));
      }
      if (visible) output.push({ person, assignment, fieldIds: Array.from(fields) });
    }
  }
  return output;
}
function removePerson(rule, personId) {
  const clean = clauses => clauses.map(clause => clause.type === 'people'
    ? Object.assign({}, clause, { personIds: clause.personIds.filter(id => id !== personId) }) : clause)
    .filter(clause => clause.type !== 'people' || clause.personIds.length);
  const audience = clean(rule.audience);
  const targets = clean(rule.targets);
  return Object.assign({}, rule, { audience, targets, enabled: Boolean(rule.enabled && audience.length && targets.length) });
}
module.exports = { DirectoryError, normalizeRule, normalizeClauses, validateReferences, referenceIds, grants, removePerson };
