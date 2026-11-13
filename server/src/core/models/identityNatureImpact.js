'use strict';

const crypto = require('node:crypto');

const IDENTITY_KEYS = new Set(['identityId', 'identity_id', 'identityIds', 'identity_ids', 'identityCategoryId',
  'identityCategoryIds', 'specificIdentityId', 'specific_identity_id', 'targetIdentityId', 'target_identity_id',
  'approverIdentityId', 'approver_identity_id', 'scorer_identity_id', 'grantee_identity_id']);
const ASSIGNMENT_KEYS = new Set(['assignmentId', 'assignmentIds', 'assignment_id', 'assignment_ids',
  'personAssignmentIds', 'approver_assignment_id', 'starter_assignment_id']);
const NATURE_KEYS = ['natureIds', 'nature_ids', 'assignmentNatureIds', 'natureId'];

function tokens(value) {
  if (Array.isArray(value)) return value.flatMap(tokens);
  return typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
}
function parse(value) {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return null;
  try { return JSON.parse(value); } catch (_) {
    throw Object.assign(new Error('identity_change_conflict'), { code: 'identity_change_conflict' });
  }
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function referencesCombination(value, identityId, removedNatureIds, assignmentIds) {
  const removed = new Set(removedNatureIds), assignments = new Set(assignmentIds);
  const visit = (node, inheritedNatures) => {
    if (Array.isArray(node)) return node.some(item => visit(item, inheritedNatures));
    if (!node || typeof node !== 'object') return false;
    let natures = inheritedNatures;
    for (const key of NATURE_KEYS) {
      if (!Object.hasOwn(node, key) || node[key] == null) continue;
      const raw = key === 'natureId' ? node[key] : typeof node[key] === 'string' ? parse(node[key]) : node[key];
      if (raw === 'same') { natures = null; break; }
      natures = tokens(raw);
      break;
    }
    const relevantNature = natures == null || natures.some(id => removed.has(id));
    if (relevantNature && Object.entries(node).some(([key, child]) =>
      IDENTITY_KEYS.has(key) && tokens(child).includes(identityId))) return true;
    if (Object.entries(node).some(([key, child]) => ASSIGNMENT_KEYS.has(key)
      && tokens(child).some(id => assignments.has(id)))) return true;
    return Object.entries(node).some(([key, child]) => !IDENTITY_KEYS.has(key) && !ASSIGNMENT_KEYS.has(key)
      && !NATURE_KEYS.includes(key) && visit(child, natures));
  };
  return visit(parse(value), null);
}

// 每项是当前可修改的业务配置；历史事件、签章、评分依据和已结束轮次不参与解除阻断。
const SPECS = [
  { table: 'rate_target_rules', kind: 'scoring_rules', type: 'scoring.rules', direct: true },
  { table: 'rate_rule_clauses', kind: 'scoring_rules', type: 'scoring.rules', direct: true, parent: ['rate_target_rules', 'rule_id'] },
  { table: 'pub_view_rules', kind: 'publication_rules', type: 'scoring.publications', direct: true, resource: 'publication_id' },
  { table: 'pub_view_rule_clauses', kind: 'publication_rules', type: 'scoring.publications', direct: true, parent: ['pub_view_rules', 'rule_id'], resource: 'publication_id' },
  { table: 'pub_merit_rules', kind: 'publication_rules', type: 'scoring.publications', direct: true, resource: 'publication_id' },
  { table: 'pub_merit_rule_clauses', kind: 'publication_rules', type: 'scoring.publications', direct: true, parent: ['pub_merit_rules', 'rule_id'], resource: 'publication_id' },
  { table: 'audit_flow_templates', kind: 'audit_templates', type: 'audit.templates', json: ['starter_conditions_json'], legacy: 'starter_identity_id' },
  { table: 'audit_flow_template_steps', kind: 'audit_templates', type: 'audit.templates', direct: true, parent: ['audit_flow_templates', 'template_id'] },
  { table: 'audit_flow_template_step_conditions', kind: 'audit_templates', type: 'audit.templates', direct: true, parent: ['audit_flow_template_steps', 'template_step_id'] },
  { table: 'identity_stamp_assignments', kind: 'stamp_bindings', type: 'audit.stamps', direct: true, resource: 'stamp_id' },
  { table: 'stamp_assignment_grants', kind: 'stamp_bindings', type: 'audit.stamps', direct: true, resource: 'stamp_id' },
  { table: 'venue_booking_rules', kind: 'venue_rules', type: 'venue.bookingRules', direct: true },
  { table: 'venue_approval_flow_step_rules', kind: 'venue_rules', type: 'venue.approvals', direct: true, parent: ['venue_approval_flow_steps', 'step_id'] },
  { table: 'hr_contact_directory_rules', kind: 'directory_rules', type: 'hr.directoryRules', json: ['audience_json', 'targets_json'] },
  { table: 'calendar_rules', kind: 'calendar_rules', type: 'calendar.rules', json: ['audience_json', 'targets_json'] },
  { table: 'calendar_events', kind: 'calendar_events', type: 'calendar.events', json: ['targets_json'], active: true },
  { table: 'authorization_rules', kind: 'authorization_rules', type: 'authorization.rules', json: ['policy_json'] },
  { table: 'authorization_delegations', kind: 'authorization_rules', type: 'authorization.delegations', json: ['subjects_json', 'envelope_json'] }
];
const PARENTS = { audit_submission_steps: ['audit_submissions', 'submission_id'],
  venue_approval_flow_steps: ['venue_approval_flows', 'flow_id'] };

async function collect(connection, orgId, identityId, removedNatureIds, reference) {
  const { createAuthorizationSession } = require('../services/authorizationSession');
  if (!removedNatureIds.length) return { usages: [], records: [], affectedAssignmentIds: [] };
  const [assignments] = await connection.query('SELECT * FROM membership_assignments WHERE org_id=? AND identity_id=? AND assignment_kind IN (?) FOR UPDATE', [orgId, identityId, removedNatureIds]);
  const affectedAssignmentIds = assignments.map(item => item.id).sort();
  const [schema] = await connection.query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema=DATABASE()');
  const tables = new Map();
  for (const row of schema) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const loaded = new Map();
  async function rows(table) {
    if (!loaded.has(table)) {
      if (!tables.has(table)) return [];
      const spec = SPECS.find(item => item.table === table);
      const parent = spec?.parent || PARENTS[table];
      let result;
      if (tables.get(table).has('org_id')) [result] = await connection.query('SELECT * FROM ' + table + ' WHERE org_id=? FOR UPDATE', [orgId]);
      else if (parent) {
        const parents = await rows(parent[0]);
        if (!parents.length) return [];
        [result] = await connection.query('SELECT * FROM ' + table + ' WHERE ' + parent[1] + ' IN (?) FOR UPDATE', [parents.map(item => item.id)]);
      } else throw Object.assign(new Error(), { code: 'identity_change_conflict' });
      loaded.set(table, result);
    }
    return loaded.get(table);
  }
  const session = reference ? await createAuthorizationSession(connection, reference, { lock: true }) : null;
  const actor = reference && session?.mode === 'enforced' ? await require('./authorizationIdentity').loadActor(connection, reference, true) : null;
  const groups = new Map(), records = new Map();
  function add(kind, table, row, detail) {
    const key = table + ':' + row.id;
    if (records.has(key)) return;
    records.set(key, { key, digest: crypto.createHash('sha256').update(JSON.stringify(stable(row))).digest('hex') });
    if (!groups.has(kind)) groups.set(kind, { kind, count: 0, details: [], hiddenCount: 0 });
    const group = groups.get(kind);group.count++;
    if (detail) group.details.push(detail); else group.hiddenCount++;
  }
  let visibleAssignments = new Map();
  if (reference && session?.mode === 'enforced') {
    const directory = await require('./hrAuthorization').directory(reference, { connection, requestedFields: ['name', 'assignments'] });
    for (const member of directory.members.values()) {
      for (const assignment of member.assignments) visibleAssignments.set(assignment.assignmentId,
        { id: assignment.assignmentId, title: member.fields.has('name') ? member.row.name : '', assignmentLabel: assignment.assignmentLabel,
          natureName: assignment.assignmentNatureLabel });
    }
  }
  for (const row of assignments) add('positions', 'membership_assignments', row, visibleAssignments.get(row.id));
  for (const spec of SPECS) {
    for (const row of await rows(spec.table)) {
      if (spec.active && row.status !== 'active') continue;
      const jsonValues = (spec.json || []).map(key => parse(row[key])).filter(value => value != null);
      let matches = jsonValues.some(value => referencesCombination(value, identityId, removedNatureIds, affectedAssignmentIds));
      if (spec.direct) matches = referencesCombination(row, identityId, removedNatureIds, affectedAssignmentIds);
      if (spec.legacy && !jsonValues.some(value => Array.isArray(value) ? value.length : true)) {
        matches = tokens(row[spec.legacy]).includes(identityId);
      }
      if (!matches) continue;
      let owner = row;
      if (spec.parent) owner = (await rows(spec.parent[0])).find(item => item.id === row[spec.parent[1]]) || row;
      if (spec.table === 'audit_flow_template_step_conditions') owner = (await rows('audit_flow_templates')).find(item => item.id === owner.template_id) || owner;
      if (spec.table === 'venue_approval_flow_step_rules') owner = (await rows('venue_approval_flows')).find(item => item.id === owner.flow_id) || owner;
      const resourceId = spec.resource ? owner[spec.resource] || row[spec.resource] : owner.id;
      let title = row.name || owner.name || '';
      if (!title && spec.type === 'scoring.rules') title = (await rows('score_activities')).find(item => item.id === owner.activity_id)?.name || '';
      if (!title && spec.type === 'scoring.publications') {
        const publication = (await rows('result_publications')).find(item => item.id === resourceId);
        title = (await rows('score_activities')).find(item => item.id === publication?.activity_id)?.name || '';
      }
      if (!title && spec.type === 'audit.stamps') title = (await rows('stamps')).find(item => item.id === resourceId)?.name || '';
      let allowed = session?.mode === 'enforced' && session.check({ capability: spec.type + '.read',
        resource: { id: resourceId, type: spec.type, organizationId: orgId }, businessAllowed: true,
        requestedFields: ['audit.templates', 'audit.stamps'].includes(spec.type) ? ['name'] : [] }).allowed;
      if (spec.type === 'calendar.events') {
        allowed = Boolean(actor && require('../services/calendarEventAuthorization').eventAuthorization(session, actor).can('read', {
          id: row.id, creatorPersonId: row.creator_person_id, creator: parse(row.creator_context_json), visibility: row.visibility
        }));
      }
      if (allowed && ['scoring.rules', 'scoring.publications'].includes(spec.type)) {
        const publication = spec.type === 'scoring.publications'
          ? (await rows('result_publications')).find(item => item.id === resourceId) : null;
        const activityId = publication ? publication.activity_id : owner.activity_id;
        allowed = session.check({ capability: 'scoring.activities.read', resource: {
          id: activityId, type: 'scoring.activities', organizationId: orgId
        }, requestedFields: ['name'], businessAllowed: true }).allowed;
      }
      add(spec.kind, spec.table, row, allowed && title ? { id: row.id, title } : null);
    }
  }
  const submissions = await rows('audit_submissions');
  const steps = await rows('audit_submission_steps');
  for (const submission of submissions.filter(item => item.status === 'pending')) {
    const ownSteps = steps.filter(item => item.submission_id === submission.id);
    const currentRound = Math.max(0, ...ownSteps.map(item => Number(item.round || 1)));
    for (const step of ownSteps.filter(item => item.status === 'pending' && Number(item.round || 1) === currentRound)) {
      const conditions = parse(step.step_conditions_json);
      const hasConditions = Array.isArray(conditions) && conditions.length > 0;
      const matches = hasConditions ? referencesCombination(conditions, identityId, removedNatureIds, affectedAssignmentIds)
        : referencesCombination({ approver_identity_id: step.approver_identity_id }, identityId, removedNatureIds, affectedAssignmentIds);
      if (!matches) continue;
      const allowed = session?.mode === 'enforced' && session.check({ capability: 'audit.submissions.read',
        resource: { id: submission.id, type: 'audit.submissions', organizationId: orgId }, businessAllowed: true }).allowed;
      add('audit_history', 'audit_submission_steps', step, allowed ? { id: step.id, title: submission.title || submission.submission_number } : null);
    }
  }
  if (tables.has('organization_config_copy_drafts') && tables.has('organization_config_shares')) {
    const [drafts] = await connection.query(`SELECT d.*,s.id AS source_share_id
      FROM organization_config_copy_drafts d JOIN organization_config_shares s ON s.id=d.share_id
      WHERE s.source_org_id=? AND s.kind=? AND s.source_record_id=? AND d.state='draft' FOR UPDATE`, [orgId,'hr.identities',identityId]);
    for (const draft of drafts) {
      const payload = parse(draft.payload_json);
      const natureIds = (payload?.natureReferences || []).map(item => item.id);
      if (!natureIds.some(id => removedNatureIds.includes(id))) continue;
      const allowed = session?.mode === 'enforced' && ['read','share'].every(action => session.check({
        capability:'hr.identities.'+action,resource:{id:identityId,type:'hr.identities',organizationId:orgId},
        requestedFields:action==='read'?['name']:[],businessAllowed:true }).allowed);
      add('copy_drafts','organization_config_copy_drafts',draft,
        allowed && payload.name ? {id:draft.source_share_id,title:payload.name}:null);
    }
  }
  return { usages: Array.from(groups.values()).sort((a, b) => a.kind.localeCompare(b.kind)),
    records: Array.from(records.values()).sort((a, b) => a.key.localeCompare(b.key)), affectedAssignmentIds };
}

module.exports = { collect, referencesCombination };
