'use strict';

// 纯规划器只计算问题与最终变更，所有权限和持久化由事务模型负责。
const crypto = require('crypto');
const copy = require('../../locales/zh-CN/hrImport');
const { format } = require('../../locales/runtime');
const { normalizeDateValue, normalizeDateTimeValue } = require('../../utils/dateValue');

const CATEGORIES = ['identity_conflict', 'unavailable', 'ambiguous', 'intent', 'incomplete', 'group_mismatch', 'dictionary', 'value_conflict', 'row_conflict', 'invalid', 'duplicate', 'stale'];
const BASIC = ['name', 'studentId', 'nature', 'department', 'identity', 'workGroup', 'assignmentId', 'assignmentVersion'];
const NATURES = ['staff', 'liaison', 'other'];
const text = (value) => String(value == null ? '' : value).trim();
const studentKey = (value) => text(value).toLowerCase();
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function assignmentVersion(member, assignment) {
  return hash({ personId: member.personId, name: member.name, studentId: member.studentId, status: member.status,
    profile: member.profile, pending: member.pending, recordStatus: member.recordStatus, assignment });
}
function dictKey(type, name, department) { return hash([type, name, department || '']); }
function tuple(value) { return JSON.stringify(['nature', 'department', 'identity', 'workGroup'].map(key => text(value[key]))); }
function label(value) { return [value.identity, value.department, value.workGroup].filter(Boolean).join(' · '); }
function fail(message) { const error = new Error(message); error.code = 'invalid_import'; throw error; }

function normalizePayload(payload) {
  if (!payload || payload.schemaVersion !== 2) fail(copy.upgrade);
  const { headers, rows } = payload;
  if (!Array.isArray(headers) || !headers.length || headers.length > 200 || !Array.isArray(rows) || rows.length > 5000) fail(copy.invalidFile);
  if (JSON.stringify(payload).length > 8 * 1024 * 1024) fail(copy.invalidFile);
  const basicMapping = {};
  const occupied = new Set();
  const column = (value) => {
    if (!Number.isInteger(value) || value < 0 || value >= headers.length || occupied.has(value)) fail(copy.invalidMapping);
    occupied.add(value); return value;
  };
  BASIC.forEach(key => { if (payload.basicMapping && payload.basicMapping[key] != null) basicMapping[key] = column(payload.basicMapping[key]); });
  if (basicMapping.name == null || basicMapping.studentId == null) fail(copy.invalidMapping);
  const fieldIds = new Set();
  const extensionMapping = (payload.extensionMapping || []).map(item => {
    if (!item || !text(item.fieldId) || fieldIds.has(item.fieldId)) fail(copy.invalidMapping);
    fieldIds.add(item.fieldId);
    return { fieldId: text(item.fieldId), columnIndex: column(item.columnIndex) };
  });
  const normalizeCell = value => {
    if (value != null && !['string', 'number', 'boolean'].includes(typeof value)) fail(copy.invalidFile);
    const result = text(value); if (Array.from(result).length > 10000) fail(copy.invalidFile); return result;
  };
  const normalizedRows = rows.map(row => {
    if (!Array.isArray(row) || row.length > headers.length) fail(copy.invalidFile);
    return headers.map((_, index) => normalizeCell(row[index]));
  });
  const rowNumbers = payload.rowNumbers || rows.map((_, index) => index + 2);
  if (!Array.isArray(rowNumbers) || rowNumbers.length !== rows.length || rowNumbers.some((value, index) => !Number.isInteger(value) || value < 2 || value > 1000000 || (index && value <= rowNumbers[index - 1]))) fail(copy.invalidFile);
  const decisions = payload.decisions || {};
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) fail(copy.invalidFile);
  if (payload.defaultNature && !NATURES.includes(payload.defaultNature)) fail(copy.invalidFile);
  return { schemaVersion: 2, headers: headers.map(normalizeCell), rows: normalizedRows, rowNumbers, basicMapping, extensionMapping,
    defaultNature: payload.defaultNature || '', decisions: JSON.parse(JSON.stringify(decisions)) };
}

function validateProfile(field, value) {
  if (!field || (field.required && !value)) return false;
  if (!value) return true;
  const count = Array.from(value).length;
  if (field.type === 'text') return (field.minLength == null || count >= field.minLength) && (field.maxLength == null || count <= field.maxLength);
  if (field.type === 'number') {
    if (!Number.isFinite(Number(value)) || (!field.allowDecimal && !/^[+-]?\d+$/.test(value))) return false;
    if (field.numberRule === 'length_range') {
      const digits = value.replace(/^[+-]/, '').replace('.', '').length;
      return (field.minDigits == null || digits >= field.minDigits) && (field.maxDigits == null || digits <= field.maxDigits);
    }
    return (field.minValue == null || Number(value) >= field.minValue) && (field.maxValue == null || Number(value) <= field.maxValue);
  }
  if (field.type === 'sequence') return !field.options.length || field.options.includes(value);
  if (field.type === 'date') return Boolean(normalizeDateValue(value));
  if (field.type === 'datetime') return Boolean(normalizeDateTimeValue(value));
  if (field.type === 'phone') return /^1[3-9]\d{9}$/.test(value);
  if (field.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  return true;
}

function profileRequirement(field) {
  if (!field) return '';
  const range = (key, low, high) => format(copy[key], [low == null ? copy.noLimit : low, high == null ? copy.noLimit : high]);
  if (field.type === 'text') return range('requirementLength', field.minLength, field.maxLength);
  if (field.type === 'sequence') return format(copy.requirementOptions, [field.options.join(' / ')]);
  if (field.type === 'number') return [field.allowDecimal ? copy.requirementDecimal : copy.requirementInteger,
    field.numberRule === 'length_range' ? range('requirementDigits', field.minDigits, field.maxDigits) : range('requirementNumber', field.minValue, field.maxValue)].join(' · ');
  return '';
}

function buildPlan(payload, context) {
  const input = normalizePayload(payload);
  const decisions = input.decisions;
  const rowDecisions = decisions.rows || {};
  const members = new Map(context.members.map(member => [studentKey(member.studentId), member]));
  const fields = new Map(context.fields.map(field => [field.id, field]));
  const dicts = { department: new Map(context.departments.map(item => [item.name, item])), identity: new Map(context.identities.map(item => [item.name, item])) };
  const groupKeys = new Set(context.workGroups.map(item => JSON.stringify([item.department, item.name])));
  const issues = [];
  const issueById = new Map();
  const rowViews = [];
  const people = new Map();
  const dictionaries = new Map();
  const proposals = new Map();
  const excluded = [];
  const action = (type, extra) => Object.assign({ type }, extra || {});
  function issue(category, reason, rows, extra, resolved) {
    const data = extra || {};
    const rowNumbers = Array.from(new Set(rows)).sort((a, b) => a - b);
    const id = hash([category, reason, rowNumbers, data.targetId || '', data.field || '', data.dictionaryKey || '']).slice(0, 32);
    if (issueById.has(id)) return issueById.get(id);
    const result = Object.assign({ id, category, reason, message: copy[reason], rowNumbers, blocking: !resolved,
      state: resolved ? 'resolved' : 'open', actions: [], before: '', after: '' }, data);
    if (category === 'invalid' && reason !== 'missingIdentity') result.actions.push(action('edit', { rowNumber: rowNumbers[0] }));
    if (category !== 'dictionary') result.actions.push(action('exclude', { rowNumbers }));
    issues.push(result); issueById.set(id, result); return result;
  }
  function resolveValue(row, field, oldValue, newValue, targetId, canClear) {
    const policies = row.decision.policies || {};
    const policyKey = targetId ? targetId + ':' + field : field;
    const policy = policies[policyKey] || policies[field] || '';
    if (policy && !['keep', 'replace', 'clear'].includes(policy)) fail(copy.invalidFile);
    if (policy === 'clear' && !canClear) { issue('invalid', 'invalidValue', [row.rowNumber], { field, targetId }); return oldValue; }
    if (policy === 'clear') {
      issue('value_conflict', 'differentValue', [row.rowNumber], { field, targetId, before: oldValue, after: '', operation: 'clear', actions: [action('undo', { rowNumber: row.rowNumber })] }, true);
      return '';
    }
    if (!newValue || newValue === oldValue || !oldValue) return newValue || oldValue;
    issue('value_conflict', 'differentValue', [row.rowNumber], {
      field, targetId, before: oldValue, after: newValue, resolutionLabel: copy[policy] || '',
      actions: [action('policy', { rowNumber: row.rowNumber, field: policyKey, value: 'keep' }), action('policy', { rowNumber: row.rowNumber, field: policyKey, value: 'replace' })]
    }, policy === 'keep' || policy === 'replace');
    return policy === 'replace' ? newValue : oldValue;
  }
  function ensureDictionary(type, name, department, rowNumber) {
    if (!name) return;
    const exists = type === 'workGroup'
      ? groupKeys.has(JSON.stringify([department, name]))
      : dicts[type].has(name);
    if (exists) return;
    const key = dictKey(type, name, department);
    if (!dictionaries.has(key)) dictionaries.set(key, { key, type, name, department: department || '', rowNumbers: [] });
    dictionaries.get(key).rowNumbers.push(rowNumber);
  }

  input.rows.forEach((cells, index) => {
    if (!cells.some(Boolean)) return;
    const rowNumber = input.rowNumbers[index];
    const decision = rowDecisions[rowNumber] || {};
    if (decision.exclude === true) { excluded.push(rowNumber); return; }
    if (decision.mode && !['person', 'new', 'update'].includes(decision.mode)) fail(copy.invalidFile);
    const values = Object.fromEntries(BASIC.map(key => [key, input.basicMapping[key] == null ? '' : cells[input.basicMapping[key]]]));
    for (const [key, value] of Object.entries(decision.values || {})) {
      if (!['nature', 'department', 'identity', 'workGroup'].includes(key)) fail(copy.invalidFile);
      values[key] = text(value);
    }
    const natureLabel = NATURES.find(key => copy[key] === values.nature);
    values.nature = natureLabel || values.nature;
    values.studentId = studentKey(values.studentId);
    const existing = members.get(values.studentId);
    const row = { rowNumber, name: values.name, studentId: values.studentId, values, decision };
    rowViews.push(row);
    if (/^#(?:N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!|SPILL!|CALC!)$/i.test(values.studentId)) {
      issue('invalid', 'spreadsheetIdentityError', [rowNumber], { field: 'studentId', after: cells[input.basicMapping.studentId],
        message: format(copy.spreadsheetIdentityError, [cells[input.basicMapping.studentId]]), actions: [] });
      return;
    }
    if (!values.studentId || !values.name || Array.from(values.studentId).length > 32 || Array.from(values.name).length > 100) {
      issue('invalid', 'missingIdentity', [rowNumber]); return;
    }
    if (existing && existing.name !== values.name) { issue('identity_conflict', 'identityMismatch', [rowNumber], { field: 'name', before: existing.name, after: values.name,
      message: format(copy.nameDifference, [existing.name, values.name]) }); return; }
    if (existing && (existing.personStatus !== 'active' || (existing.membershipId && existing.status !== 'active'))) {
      issue('unavailable', 'unavailableMember', [rowNumber]); return;
    }
    let person = people.get(values.studentId);
    if (!person) {
      person = { studentId: values.studentId, name: values.name, existing: existing || null, rowNumbers: [], profileSources: {}, profile: {} };
      people.set(values.studentId, person);
    }
    person.rowNumbers.push(rowNumber);
    if (person.name !== values.name) issue('identity_conflict', 'identityMismatch', person.rowNumbers);

    input.extensionMapping.forEach(mapping => {
      const field = fields.get(mapping.fieldId);
      let value = cells[mapping.columnIndex];
      const profileEdit = decision.profileValues || {};
      if (Object.prototype.hasOwnProperty.call(profileEdit, mapping.fieldId)) value = text(profileEdit[mapping.fieldId]);
      if (!field || !validateProfile(field, value || (existing && existing.profile[mapping.fieldId]) || '')) {
        const finalValue = value || (existing && existing.profile[mapping.fieldId]) || '';
        const reason = field && field.required && !finalValue ? 'requiredValue' : ({ text: 'lengthValue', number: 'numberValue', sequence: 'sequenceValue', date: 'dateValue', datetime: 'datetimeValue', phone: 'phoneValue', email: 'emailValue' }[field && field.type] || 'invalidValue');
        issue('invalid', reason, [rowNumber], { field: mapping.fieldId, after: value, requirements: profileRequirement(field) }); return;
      }
      if (field.type === 'date' && value) value = normalizeDateValue(value);
      if (field.type === 'datetime' && value) value = normalizeDateTimeValue(value);
      const before = text(existing && existing.profile[mapping.fieldId]);
      const next = resolveValue(row, mapping.fieldId, before, value, '', !field.required);
      if (!person.profileSources[mapping.fieldId]) person.profileSources[mapping.fieldId] = [];
      // 空白且没有显式操作不参与多行竞争，避免把保留原值当成另一种导入值。
      if (value || (decision.policies || {})[mapping.fieldId]) person.profileSources[mapping.fieldId].push({ rowNumber, value: next });
    });

    const active = (existing && existing.assignments || []).filter(item => item.status === 'active');
    const hasAssignment = Boolean(values.assignmentId || values.nature || values.department || values.identity || values.workGroup || decision.mode === 'new' || decision.mode === 'update'
      || Object.keys(decision.policies || {}).some(key => key === 'workGroup' || key.endsWith(':workGroup')));
    if (!hasAssignment || (decision.mode === 'person' && !values.assignmentId)) return;
    let targets = [];
    if (values.assignmentId) {
      const target = active.find(item => item.id === values.assignmentId);
      if (!target) { issue('unavailable', 'unavailableAssignment', [rowNumber], { targetId: values.assignmentId }); return; }
      const currentVersion = assignmentVersion(existing, target);
      if (values.assignmentVersion !== currentVersion) {
        const accepted = decision.acceptVersion === currentVersion;
        issue('stale', 'staleAssignment', [rowNumber], { targetId: target.id, before: label(target), after: label(values),
          actions: [action('rebase', { rowNumber, value: currentVersion })] }, accepted);
      }
      targets = [target];
    } else if (decision.mode === 'new') {
      targets = [null];
    } else if (decision.mode === 'update') {
      const ids = Array.isArray(decision.assignmentIds) ? Array.from(new Set(decision.assignmentIds)) : [];
      targets = ids.map(id => active.find(item => item.id === id));
      if (!ids.length || targets.some(item => !item)) { issue('unavailable', 'unavailableAssignment', [rowNumber]); return; }
    } else if (!active.length) {
      const reason = values.department && values.identity && (values.nature || input.defaultNature) ? 'confirmNewAssignment' : 'missingAssignment';
      issue('incomplete', reason, [rowNumber], { after: label(values), before: copy.noAssignment,
        actions: [action('mode', { rowNumber, value: 'new' }), action('mode', { rowNumber, value: 'person' }), action('edit', { rowNumber })] });
      return;
    } else {
      const exact = active.filter(item => values.nature && values.department && values.identity && tuple(item) === tuple(values));
      const candidates = active.filter(item => ['nature', 'department', 'identity'].every(key => !values[key] || values[key] === item[key]));
      if (exact.length === 1) targets = exact;
      else if (candidates.length === 1 && !(values.nature && values.department && values.identity)) targets = candidates;
      else {
        const ambiguous = candidates.length > 1 && !(values.nature && values.department && values.identity);
        issue(ambiguous ? 'ambiguous' : 'intent', ambiguous ? 'ambiguousAssignment' : 'chooseIntent', [rowNumber], {
          before: active.map(label).join('\n'), after: label(values),
          message: ambiguous ? copy.assignmentAmbiguous : format(copy.assignmentDifference, [
            ['nature', 'department', 'identity', 'workGroup'].filter(key => values[key] && !active.some(item => item[key] === values[key])).map(key => copy[key]).join(copy.listSeparator) || copy.target]),
          actions: [action('select', { rowNumber }), action('mode', { rowNumber, value: 'new' }), action('mode', { rowNumber, value: 'person' })]
        }); return;
      }
    }
    if (decision.mode === 'person') return;
    targets.forEach(target => {
      const targetId = target ? target.id : '';
      const next = {};
      ['nature', 'department', 'identity', 'workGroup'].forEach(key => {
        next[key] = resolveValue(row, key, text(target && target[key]), values[key] || (key === 'nature' && !target ? input.defaultNature : ''), targetId, key === 'workGroup');
      });
      if (!NATURES.includes(next.nature) || !next.department || !next.identity) {
        issue('incomplete', 'missingAssignment', [rowNumber], { targetId, actions: [action('edit', { rowNumber }), action('mode', { rowNumber, value: 'person' })] }); return;
      }
      const longField = ['department', 'identity', 'workGroup'].find(key => Array.from(next[key]).length > 100);
      if (longField) {
        issue('invalid', 'invalidValue', [rowNumber], { targetId, field: longField, message: format(copy.longCell, [copy[longField], 100]) }); return;
      }
      const key = targetId || values.studentId + ':' + tuple(next);
      if (!proposals.has(key)) proposals.set(key, []);
      const touched = ['nature', 'department', 'identity', 'workGroup'].filter(field => values[field] || (decision.policies || {})[targetId + ':' + field] || (decision.policies || {})[field]);
      proposals.get(key).push({ studentId: values.studentId, targetId, before: target, next, touched, rowNumber });
    });
  });

  const assignments = [];
  proposals.forEach((sources, key) => {
    let chosen = sources[0];
    const conflicting = ['nature', 'department', 'identity', 'workGroup'].some(field => new Set(sources.filter(item => item.touched.includes(field)).map(item => item.next[field])).size > 1);
    if (conflicting) {
      const selection = (decisions.sources || {})[key];
      const selected = sources.find(item => item.rowNumber === selection);
      issue('row_conflict', 'multipleValues', sources.map(item => item.rowNumber), { targetId: key,
        before: sources.map(item => ({ rowNumber: item.rowNumber, value: label(item.next) })),
        actions: sources.map(item => action('source', { key, value: item.rowNumber })) }, Boolean(selected));
      if (selected) chosen = selected;
    } else if (chosen.before) {
      const next = Object.assign({}, chosen.next);
      sources.forEach(item => item.touched.forEach(field => { next[field] = item.next[field]; }));
      chosen = Object.assign({}, chosen, { next });
    }
    const person = people.get(chosen.studentId);
    const other = (person.existing && person.existing.assignments || []).find(item => item.status === 'active' && item.id !== chosen.targetId && tuple(item) === tuple(chosen.next));
    if (other && chosen.targetId) {
      issue('duplicate', 'duplicateAssignment', sources.map(item => item.rowNumber), { targetId: chosen.targetId, before: label(other), after: label(chosen.next),
        actions: [action('select', { rowNumber: chosen.rowNumber }), action('edit', { rowNumber: chosen.rowNumber })] });
    }
    // 新增完全相同的已有岗位按无变化处理，不新增副本。
    if (other && !chosen.targetId) chosen = Object.assign({}, chosen, { targetId: other.id, before: other });
    assignments.push(Object.assign({}, chosen, { rowNumbers: sources.map(item => item.rowNumber), changed: !chosen.before || tuple(chosen.before) !== tuple(chosen.next) }));
  });
  const finalTuples = new Map();
  assignments.forEach(item => {
    item.rowNumbers.forEach(rowNumber => {
      ensureDictionary('department', item.next.department, '', rowNumber);
      ensureDictionary('identity', item.next.identity, '', rowNumber);
      ensureDictionary('workGroup', item.next.workGroup, item.next.department, rowNumber);
    });
    const key = item.studentId + ':' + tuple(item.next);
    const prior = finalTuples.get(key);
    if (prior && prior.targetId !== item.targetId) issue('duplicate', 'duplicateAssignment', prior.rowNumbers.concat(item.rowNumbers), { targetId: item.targetId, after: label(item.next) });
    else finalTuples.set(key, item);
  });
  people.forEach(person => {
    Object.entries(person.profileSources).forEach(([field, sources]) => {
      if (!sources.length) return;
      let selected = sources[0];
      if (new Set(sources.map(item => item.value)).size > 1) {
        const key = person.studentId + ':' + field;
        const choice = sources.find(item => item.rowNumber === (decisions.sources || {})[key]);
        issue('row_conflict', 'multipleValues', sources.map(item => item.rowNumber), { field, targetId: key, before: sources,
          actions: sources.map(item => action('source', { key, value: item.rowNumber })) }, Boolean(choice));
        if (choice) selected = choice;
      }
      if (selected.value !== text(person.existing && person.existing.profile[field])) person.profile[field] = selected.value;
    });
  });
  dictionaries.forEach(item => {
    const permission = { department: 'hr.departments', identity: 'hr.identities', workGroup: 'hr.work_groups' }[item.type];
    const allowed = context.permissions.includes(permission);
    item.approved = allowed && (decisions.dictionaries || []).includes(item.key);
    issue('dictionary', allowed ? 'newDictionary' : 'dictionaryForbidden', item.rowNumbers, { dictionaryKey: item.key, field: item.type, before: copy.noRegisteredValue, after: item.name,
      message: format(copy[allowed ? 'newDictionary' : 'dictionaryForbidden'], [copy[item.type], item.name, item.department ? format(copy.departmentScope, [item.department]) : '']),
      actions: allowed ? [action('dictionary', { value: item.key }), action('exclude', { rowNumbers: item.rowNumbers })] : [action('exclude', { rowNumbers: item.rowNumbers })] }, item.approved);
  });
  const rowsByNumber = new Map(rowViews.map(row => [row.rowNumber, row]));
  const extensionColumns = new Map(input.extensionMapping.map(item => [item.fieldId, item.columnIndex]));
  const columnLabel = key => {
    const index = input.basicMapping[key] == null ? extensionColumns.get(key) : input.basicMapping[key];
    return index == null ? format(copy.unmappedColumn, [copy[key] || (fields.get(key) || {}).label || key])
      : format(copy.issueColumn, [index + 1, input.headers[index]]);
  };
  const assignmentLabels = new Map(context.members.flatMap(member => member.assignments.map(item => [item.id, label(item)])));
  issues.forEach(item => {
    const first = rowsByNumber.get(item.rowNumbers[0]);
    item.name = first ? first.name : '';
    item.studentId = first ? first.studentId : '';
    item.fieldLabel = copy[item.field] || (fields.get(item.field) || {}).label || '';
    item.targetLabel = assignmentLabels.get(item.targetId) || '';
    if (item.reason === 'spreadsheetIdentityError') item.actions = item.actions.filter(entry => entry.type !== 'edit');
    if (item.reason === 'confirmNewAssignment') item.message = copy.newAssignmentDetails;
    if (item.reason === 'missingAssignment' && first) {
      const member = members.get(first.studentId);
      const target = member && member.assignments.find(entry => entry.id === item.targetId);
      const missing = ['nature', 'department', 'identity'].filter(key => !(first.values[key] || (target && target[key]) || (key === 'nature' && input.defaultNature)));
      item.message = format(copy.missingAssignmentFields, [missing.map(key => input.basicMapping[key] == null && key !== 'nature' ? format(copy.missingColumn, [copy[key]]) : copy[key]).join(copy.listSeparator) || copy.nature]);
      item.after = label(first.values);
    }
    if (item.reason === 'differentValue') item.message = format(copy.fieldValueDifference, [item.fieldLabel]);
    if (item.category === 'invalid' && item.fieldLabel && item.reason !== 'spreadsheetIdentityError') item.message = format(copy.fieldInvalid, [item.fieldLabel, item.message]);
    if (item.reason === 'identityMismatch' && !item.field) {
      item.message = format(copy.rowNameDifference, [item.rowNumbers.map(number => { const row = rowsByNumber.get(number); return format(copy.rowLabel, [number]) + ' ' + (row ? row.name : ''); }).join(copy.listSeparator)]);
    }
    let issueFields = item.field ? [item.field] : ['department', 'identity', 'workGroup'].filter(key => input.basicMapping[key] != null);
    if (item.reason === 'missingAssignment' && first) {
      const member = members.get(first.studentId);
      const target = member && member.assignments.find(entry => entry.id === item.targetId);
      issueFields = ['nature', 'department', 'identity'].filter(key => !(first.values[key] || target && target[key] || key === 'nature' && input.defaultNature));
    }
    if (item.reason === 'unavailableMember' && first) {
      const member = members.get(first.studentId);
      item.message = member && member.personStatus !== 'active' ? copy.inactivePerson : copy.departedMember;
      issueFields = ['name', 'studentId'];
    }
    if (item.reason === 'staleAssignment' || item.reason === 'unavailableAssignment') issueFields = ['assignmentId'];
    if (item.reason === 'spreadsheetIdentityError') item.showComparison = false;
    if (item.reason === 'missingIdentity' && first) {
      issueFields = ['name', 'studentId'].filter(key => !first.values[key] || Array.from(first.values[key]).length > (key === 'name' ? 100 : 32));
      item.message = issueFields.map(key => !first.values[key] ? format(copy.missingCell, [copy[key]])
        : format(copy.longCell, [copy[key], key === 'name' ? 100 : 32])).join(copy.listSeparator);
    }
    if (item.reason === 'identityMismatch') issueFields = ['name', 'studentId'];
    if (item.reason === 'chooseIntent' && first) {
      const member = members.get(first.studentId);
      const active = member ? member.assignments.filter(entry => entry.status === 'active') : [];
      issueFields = ['nature', 'department', 'identity', 'workGroup'].filter(key => first.values[key] && !active.some(entry => entry[key] === first.values[key]));
      if (!issueFields.length) issueFields = ['department', 'identity', 'workGroup'].filter(key => first.values[key]);
      item.message = format(copy.assignmentDifference, [issueFields.map(key => format(copy.valueDifference, [copy[key],
        [...new Set(active.map(entry => key === 'nature' ? copy[entry[key]] : entry[key]))].filter(Boolean).join(copy.listSeparator) || copy.cellEmpty,
        key === 'nature' ? copy[first.values[key]] : first.values[key]])).join(copy.listSeparator)]);
    }
    if (item.reason === 'wrongGroup') issueFields = ['department', 'workGroup'];
    if (item.reason === 'multipleValues' && Array.isArray(item.before)) {
      item.message = format(copy.conflictingRows, [item.before.map(entry => format(copy.rowContents, [entry.rowNumber,
        entry.value == null ? label(entry.next || entry) : entry.value])).join(copy.listSeparator)]);
    }
    if (item.reason === 'duplicateAssignment') item.message = format(copy.duplicateDetails, [item.after || item.before]);
    if (!issueFields.length) issueFields = ['name', 'studentId'];
    item.message = format(copy.issueLocation, [item.rowNumbers.map(number => {
      const row = rowsByNumber.get(number); return format(copy.issuePerson, [number, row && row.name || copy.unnamedPerson]);
    }).join(copy.listSeparator), issueFields.map(columnLabel).join(copy.listSeparator), item.message]);
    item.showComparison = item.showComparison !== false && Boolean(item.before || item.after);
    if (['intent', 'ambiguous', 'incomplete'].includes(item.category)) {
      item.beforeLabel = copy.existingAssignments; item.afterLabel = copy.importedAssignment;
    }
    if (item.state === 'resolved') {
      let undo = { rowNumbers: item.rowNumbers };
      if (item.category === 'value_conflict') undo.policyKey = item.targetId ? item.targetId + ':' + item.field : item.field;
      if (item.category === 'dictionary') undo.dictionaryKey = item.dictionaryKey;
      if (item.category === 'row_conflict') undo.sourceKey = item.targetId;
      if (item.category === 'stale') undo.version = true;
      item.actions = [action('undo', undo)];
      if (item.operation === 'clear') item.resolutionLabel = copy.clear;
    }
  });
  const open = issues.filter(item => item.blocking);
  const categories = CATEGORIES.map(category => {
    const items = issues.filter(item => item.category === category);
    const pending = items.filter(item => item.blocking);
    return { key: category, title: copy[category], count: pending.length, rowCount: new Set(pending.flatMap(item => item.rowNumbers)).size,
      resolved: items.length - pending.length, total: items.length };
  }).filter(item => item.total);
  const personList = Array.from(people.values());
  const changes = [];
  personList.forEach(person => {
    if (!person.existing || !person.existing.membershipId) changes.push({ type: 'changeMember', name: person.name, rowNumbers: person.rowNumbers, before: '', after: person.name });
    Object.entries(person.profile).forEach(([field, value]) => changes.push({ type: 'changeProfile', name: person.name, rowNumbers: person.rowNumbers,
      fieldLabel: fields.get(field).label, before: text(person.existing && person.existing.profile[field]), after: value }));
  });
  assignments.forEach(item => changes.push({ type: !item.changed ? 'unchanged' : item.targetId ? 'changeUpdate' : 'changeAssignment', name: people.get(item.studentId).name,
    rowNumbers: item.rowNumbers, before: item.before ? label(item.before) : '', after: label(item.next), nature: item.next.nature }));
  const summary = { problemCount: open.length, problemRowCount: new Set(open.flatMap(item => item.rowNumbers)).size,
    resolvedCount: issues.length - open.length, newMembers: changes.filter(item => item.type === 'changeMember').length,
    newAssignments: changes.filter(item => item.type === 'changeAssignment').length, updatedAssignments: changes.filter(item => item.type === 'changeUpdate').length,
    profileValues: changes.filter(item => item.type === 'changeProfile').length, newDictionaries: dictionaries.size, excludedRows: excluded.length,
    totalRows: rowViews.length + excluded.length, canExecute: open.length === 0 && rowViews.length > 0 };
  return { input, issues, categories, summary, changes, rows: rowViews, excluded, people: personList, assignments, dictionaries: Array.from(dictionaries.values()) };
}

module.exports = { CATEGORIES, BASIC, NATURES, text, studentKey, hash, assignmentVersion, dictKey, tuple, label, normalizePayload, validateProfile, buildPlan };
