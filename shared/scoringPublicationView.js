'use strict';

function groupTitle(group, copy) {
  const source = group || {};
  return ({ own_results: copy.publicationGroupOwn,
    same_department_identity: copy.publicationGroupDepartment, same_department_all: copy.publicationGroupDepartment,
    same_work_group_identity: copy.publicationGroupWorkGroup, same_work_group_all: copy.publicationGroupWorkGroup,
    all_people: copy.publicationGroupOrganization })[source.scopeType] || copy.publicationGroupUnknown;
}

function groupIdentity(group) {
  return ['same_department_identity', 'same_work_group_identity'].includes(group.scopeType)
    ? String(group.targetIdentityName || '').trim() : '';
}

function memberView(member) {
  const facts = member.displayFacts || {};
  return Object.assign({}, member, { department: facts.departmentName || '', identity: facts.identityCategoryName || '',
    workGroup: facts.workGroupName || '', grade: facts.gradeName || '' });
}

const ROWS_PER_PAGE = 16;

function appendResultBatch(previous, response) {
  if (!response.page || !response.page.offset) return response;
  const prior = new Map(previous.groups.map(group => [group.clauseId, group.members]));
  return Object.assign({}, response, { page: Object.assign({}, response.page, { stats: previous.page.stats }),
    groups: response.groups.map(group => Object.assign({}, group, {
      members: (prior.get(group.clauseId) || []).concat(group.members)
    })) });
}

function resultPage(group, pageIndex) {
  const members = group.members;
  const count = Number.isSafeInteger(group.memberCount) ? group.memberCount : members.length;
  const page = Math.max(0, Math.min(pageIndex || 0, Math.ceil(count / ROWS_PER_PAGE) - 1));
  const start = page * ROWS_PER_PAGE;
  const shown = members.slice(start, start + ROWS_PER_PAGE).map((member, index) => Object.assign({}, member, { rank: start + index + 1 }));
  return Object.assign({}, group, { members: shown, memberCount: count, page, hasPrevious: page > 0, hasNext: start + ROWS_PER_PAGE < count,
    awaitingPage: shown.length < Math.min(ROWS_PER_PAGE, count - start) });
}

function formatAward(template, values) {
  return template.replace(/\{([a-z]+)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match);
}

function targetIdentityOf(item) {
  return item.targetIdentityId || item.targetIdentity || '';
}

function awardGroups(merit, home, copy) {
  const groups = new Map();
  const byClause = new Map();
  const byIdentity = new Map();
  for (const clause of merit.clauses || []) {
    const identity = targetIdentityOf(clause);
    const key = clause.ruleId ? JSON.stringify([clause.ruleId, identity]) : clause.id;
    let group = groups.get(key);
    if (!group) {
      group = { key: clause.id || key, label: clause.targetIdentity || home.text.unclassified, clauses: [], members: [], limit: 0, exact: false };
      groups.set(key, group);
      const matches = byIdentity.get(identity) || [];
      matches.push(group);
      byIdentity.set(identity, matches);
    }
    group.clauses.push(clause);
    group.limit = Math.max(group.limit, Number(clause.quotaLimit) || 0);
    group.exact = group.exact || Boolean(clause.requireExactQuota);
    if (clause.id) byClause.set(clause.id, group);
  }

  for (const member of merit.meritList || []) {
    const identity = member.identityCategoryId || member.identityId || member.identity || '';
    const matches = byIdentity.get(identity) || [];
    let group = byClause.get(member.clauseId);
    if (!group && !member.clauseId && matches.length === 1) group = matches[0];
    if (!group) {
      const key = 'saved:' + (member.clauseId || identity);
      group = groups.get(key);
      if (!group) {
        group = { key, label: member.identity || home.text.unclassified, clauses: [], members: [], limit: 0, exact: false };
        groups.set(key, group);
      }
    }
    group.members.push(member);
  }

  return Array.from(groups.values(), group => ({ ...group,
    quota: group.limit ? (group.exact ? home.format.exactQuota(group.limit) : home.format.maximumQuota(group.limit)) : group.clauses.length ? home.text.unlimitedPeople : '',
    savedCount: formatAward(copy.savedCount, { saved: group.members.length }),
    overCount: group.limit && group.members.length > group.limit ? formatAward(copy.savedOverCount, { extra: group.members.length - group.limit }) : ''
  }));
}

function awardSummary(groups, roster, home, copy) {
  return {
    savedCount: formatAward(copy.savedCount, { saved: roster.length }),
    requiredCount: groups.length && groups.every(group => group.exact && group.limit)
      ? home.format.exactQuota(groups.reduce((total, group) => total + group.limit, 0)) : '',
    departmentCount: new Set(roster.map(member => member.departmentId || member.department).filter(Boolean)).size
  };
}

function awardPicker(group, candidates) {
  const clauseIds = group.clauses.map(clause => clause.id);
  const identity = targetIdentityOf(group.clauses[0] || {});
  const saved = new Set(group.members.map(member => member.targetAssignmentId || member.assignmentId).filter(Boolean));
  const options = candidates.filter(item => Array.isArray(item.clauseIds) ? item.clauseIds.some(id => clauseIds.includes(id)) : targetIdentityOf(item) === identity)
    .map(item => ({ ...item, assignmentId: item.assignmentId || item.targetAssignmentId || item.id }));
  return { clauseIds, options, selected: options.filter(item => saved.has(item.assignmentId)
    || (!Array.isArray(item.clauseIds) && !saved.size && group.members.length && item.isSelected)) };
}

function awardSelectionNotice(group, selected, copy) {
  if (group.limit && selected > group.limit) return formatAward(copy.selectFewer, { extra: selected - group.limit });
  if (group.exact && selected < group.limit) return formatAward(copy.selectMore, { missing: group.limit - selected });
  return '';
}

function awardSaveNotice(result, group, selected, copy) {
  const codes = [result.code, result.status];
  if (codes.includes('quota_mismatch') || codes.includes('quota_exceeded')) {
    const required = Number(result.quotaLimit) || group.limit;
    if (!required || selected === required) return copy.saveRulesChanged;
    if (codes.includes('quota_exceeded')) return selected > required
      ? formatAward(copy.saveOverMaximum, { required, extra: selected - required }) : copy.saveRulesChanged;
    return selected < required ? formatAward(copy.saveTooFew, { required, missing: required - selected })
      : formatAward(copy.saveTooMany, { required, extra: selected - required });
  }
  if (codes.includes('duplicate_hr') || codes.includes('designation_conflict')) return copy.saveAlreadyAssigned;
  if (['invalid_hr', 'out_of_scope'].some(code => codes.includes(code))) return copy.saveCandidateChanged;
  if (['invalid_params', 'invalid_clause', 'not_found'].some(code => codes.includes(code))) return copy.saveRulesChanged;
  if (codes.includes('not_published')) return copy.savePublicationClosed;
  if (['forbidden', 'no_permission', 'authorization_forbidden', 'work_context_required'].some(code => codes.includes(code))) return copy.saveNoPermission;
  return copy.saveFailed;
}

function awardSaveIsUnknown(error) {
  return !error.status || error.status === 'network_failed' || error.statusCode >= 500;
}

function awardSavedMatches(group, selected) {
  const saved = new Set(group.members.map(member => member.targetAssignmentId || member.assignmentId));
  return group.members.length === selected.length && selected.every(id => saved.has(id));
}

module.exports = { groupTitle, groupIdentity, memberView, appendResultBatch, resultPage,
  awardGroups, awardSummary, awardPicker, awardSelectionNotice, awardSaveNotice, awardSaveIsUnknown, awardSavedMatches };
