'use strict';

const crypto = require('node:crypto');
const pool = require('../../config/db');
const dictionaryCopy = require('./organizationDictionaryCopy');
const audienceRuleCopy = require('./organizationAudienceRuleCopy');
const directory = require('./contactDirectory');
const venueCopied = require('./venueCopiedConfiguration');
const { requireOrganizationStorage } = require('../../modules/venue/models/venuePurposeStorage');

const SOURCE_TABLES = Object.freeze({
  'audit.templates': ['audit_flow_templates', 'name'], 'hr.directoryRules': ['hr_contact_directory_rules', 'name'],
  'calendar.rules': ['calendar_rules', 'name'], 'scoring.templates': ['score_question_templates', 'name'],
  'authorization.schemes': ['authorization_schemes', 'name'], 'hr.departments': ['departments', 'name'],
  'hr.identities': ['identities', 'name'], 'hr.workGroups': ['work_groups', 'name'],
  'hr.assignmentNatures': ['assignment_natures', 'name'], 'venue.purposes': ['organization_venue_booking_purposes', 'text'],
  'venue.approvals': ['venue_approval_flows', 'name'],
  'venue.bookingRules': ['venue_booking_rules', null],
  'venue.bookingWindows': ['venue_booking_policies', null],
  'venue.openRules': ['venue_open_rules', 'name'], 'venue.activityRules': ['venue_activity_rules', 'activity_name']
});

function fail(code) { throw Object.assign(new Error(code), { code }); }
function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) fail('config_copy_invalid');
  return value;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('config_copy_conflict');
  return value;
}
function parse(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

// 每一类型显式投影字段；不允许客户端提供表名、列名或原始分享内容。
const ADAPTERS = Object.freeze({
  'venue.openRules': require('./venueSharedRuleCopy').createAdapter('venue.openRules'),
  'venue.activityRules': require('./venueSharedRuleCopy').createAdapter('venue.activityRules'),
  'venue.approvals': require('./venueApprovalCopy'),
  'venue.bookingRules': require('./venueBookingRuleCopy'),
  'venue.bookingWindows': require('./venueBookingWindowCopy'),
  'audit.templates': require('./auditTemplateCopy'),
  'hr.directoryRules': audienceRuleCopy.createAdapter('hr.directoryRules'),
  'calendar.rules': audienceRuleCopy.createAdapter('calendar.rules'),
  'scoring.templates': require('./scoringTemplateCopy'),
  'authorization.schemes': require('./authorizationSchemeCopy'),
  'hr.departments': dictionaryCopy.createAdapter('hr.departments'),
  'hr.identities': dictionaryCopy.createAdapter('hr.identities'),
  'hr.workGroups': dictionaryCopy.createAdapter('hr.workGroups'),
  'hr.assignmentNatures': dictionaryCopy.createAdapter('hr.assignmentNatures'),
  'venue.purposes': Object.freeze({
    async source(connection, orgId, id) {
      await requireOrganizationStorage(connection);
      const [rows] = await connection.query(`SELECT text, sort_order FROM organization_venue_booking_purposes
        WHERE org_id = ? AND id = ? FOR SHARE`, [orgId, id]);
      if (!rows.length) fail('config_copy_missing');
      return { text: rows[0].text, sortOrder: rows[0].sort_order };
    },
    normalize(raw) {
      if (!raw || typeof raw.text !== 'string' || !raw.text.trim() || Array.from(raw.text.trim()).length > 200
        || !Number.isSafeInteger(raw.sortOrder)) fail('config_copy_invalid');
      return { text: raw.text.trim(), sortOrder: raw.sortOrder };
    },
    references(raw) {
      if (raw != null && (typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length)) fail('config_copy_reference');
      return {};
    },
    async create(connection, orgId, payload) {
      await requireOrganizationStorage(connection);
      const id = crypto.randomUUID();
      const [duplicates] = await connection.query(`SELECT id FROM organization_venue_booking_purposes
        WHERE org_id = ? AND text = ? FOR UPDATE`, [orgId, payload.text]);
      if (duplicates.length) fail('config_copy_duplicate');
      await connection.query(`INSERT INTO organization_venue_booking_purposes (org_id, id, text, sort_order)
        VALUES (?, ?, ?, ?)`, [orgId, id, payload.text, payload.sortOrder]);
      return id;
    }
  })
});

function adapter(kind) {
  if (typeof kind !== 'string' || !Object.hasOwn(ADAPTERS, kind)) fail('config_copy_unsupported');
  return ADAPTERS[kind];
}

function checkReference(reference, guard) {
  if (!reference || typeof guard !== 'function') fail('config_copy_guard_required');
  identifier(reference.organizationId);
  identifier(reference.contextId);
}

async function audit(connection, reference, action, id) {
  await connection.query(`INSERT INTO organization_config_copy_changes
    (id, org_id, actor_context_id, action, target_id) VALUES (?, ?, ?, ?, ?)`,
  [crypto.randomUUID(), reference.organizationId, reference.contextId, action, id]);
}

// guard由服务端组装，并在本事务中重新核验当前账号、工作角色和该项能力。
async function share(input, reference, guard) {
  checkReference(reference, guard);
  const kind = input.kind;
  const selected = adapter(kind);
  const targetOrgId = identifier(input.targetOrganizationId);
  const sourceId = identifier(input.sourceRecordId);
  if (targetOrgId === reference.organizationId) fail('config_copy_invalid');
  return pool.withTransaction(async connection => {
    await guard(connection, reference, kind, 'share', sourceId);
    await guard(connection, reference, kind, 'read', sourceId);
    const [orgs] = await connection.query('SELECT id FROM organizations WHERE id = ? FOR SHARE', [targetOrgId]);
    if (!orgs.length) fail('config_copy_missing');
    const payload = selected.normalize(await selected.source(connection, reference.organizationId, sourceId));
    if (selected.globalVenue) await guard(connection, reference, 'venue.sharedConfiguration', 'configure', payload.sourceVenueId);
    const id = crypto.randomUUID();
    await connection.query(`INSERT INTO organization_config_shares
      (id, source_org_id, target_org_id, kind, source_record_id, payload_json, payload_hash, created_by_context_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, reference.organizationId, targetOrgId, kind, sourceId,
      JSON.stringify(payload), digest(payload), reference.contextId]);
    await audit(connection, reference, 'share', id);
    return { id, version: 1 };
  });
}

async function revoke(input, reference, guard) {
  checkReference(reference, guard);
  const id = identifier(input.id);
  const expectedVersion = version(input.version);
  return pool.withTransaction(async connection => {
    const [rows] = await connection.query(`SELECT kind, source_record_id, version FROM organization_config_shares
      WHERE source_org_id = ? AND id = ? FOR UPDATE`, [reference.organizationId, id]);
    if (!rows.length) fail('config_copy_missing');
    await guard(connection, reference, rows[0].kind, 'share', rows[0].source_record_id);
    if (Number(rows[0].version) !== expectedVersion) fail('config_copy_conflict');
    await connection.query(`UPDATE organization_config_shares SET enabled = 0, version = version + 1,
      updated_at = UTC_TIMESTAMP(3) WHERE source_org_id = ? AND id = ?`, [reference.organizationId, id]);
    await audit(connection, reference, 'revoke', id);
    return { id, version: expectedVersion + 1 };
  });
}

async function receive(input, reference, guard) {
  checkReference(reference, guard);
  const shareId = identifier(input.shareId);
  const shareVersion = version(input.shareVersion);
  const requestId = identifier(input.requestId);
  return pool.withTransaction(async connection => {
    const [rows] = await connection.query(`SELECT * FROM organization_config_shares
      WHERE target_org_id = ? AND id = ? FOR SHARE`, [reference.organizationId, shareId]);
    const source = rows[0];
    if (!source || source.enabled !== 1 || Number(source.version) !== shareVersion) fail('config_copy_unavailable');
    await guard(connection, reference, source.kind, 'receive', '');
    const payload = adapter(source.kind).normalize(parse(source.payload_json));
    if (digest(payload) !== source.payload_hash) fail('config_copy_invalid');
    const [existing] = await connection.query(`SELECT id, share_id, share_version, version, state FROM organization_config_copy_drafts
      WHERE org_id = ? AND request_id = ? FOR UPDATE`, [reference.organizationId, requestId]);
    if (existing.length) {
      if (existing[0].share_id !== shareId || Number(existing[0].share_version) !== shareVersion) fail('config_copy_conflict');
      return { id: existing[0].id, version: Number(existing[0].version), state: existing[0].state };
    }
    const id = crypto.randomUUID();
    await connection.query(`INSERT INTO organization_config_copy_drafts
      (id, org_id, share_id, share_version, kind, payload_json, payload_hash, request_id, created_by_context_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, reference.organizationId, shareId, shareVersion, source.kind,
      JSON.stringify(payload), source.payload_hash, requestId, reference.contextId]);
    await audit(connection, reference, 'receive_draft', id);
    return { id, version: 1, state: 'draft' };
  });
}

async function apply(input, reference, guard) {
  checkReference(reference, guard);
  const id = identifier(input.id);
  const expectedVersion = version(input.version);
  return pool.withTransaction(async connection => {
    const [drafts] = await connection.query(`SELECT * FROM organization_config_copy_drafts
      WHERE org_id = ? AND id = ? FOR UPDATE`, [reference.organizationId, id]);
    const draft = drafts[0];
    if (!draft) fail('config_copy_missing');
    await guard(connection, reference, draft.kind, 'receive', '');
    await guard(connection, reference, draft.kind, 'create', '');
    const selected = adapter(draft.kind);
    const references = selected.references(input.references);
    if (selected.globalVenue) await guard(connection, reference, 'venue.sharedConfiguration', 'configure', references.venueId);
    const applicationHash = digest({ payloadHash: draft.payload_hash, references });
    if (draft.state === 'applied' && Number(draft.version) === expectedVersion + 1 && draft.application_hash === applicationHash) {
      return { id, resultId: draft.result_id, state: 'applied' };
    }
    if (draft.state !== 'draft' || Number(draft.version) !== expectedVersion) fail('config_copy_conflict');
    const [shares] = await connection.query(`SELECT enabled, version, payload_hash FROM organization_config_shares
      WHERE target_org_id = ? AND id = ? FOR SHARE`, [reference.organizationId, draft.share_id]);
    if (!shares.length || shares[0].enabled !== 1 || Number(shares[0].version) !== Number(draft.share_version)
      || shares[0].payload_hash !== draft.payload_hash) fail('config_copy_unavailable');
    const payload = selected.normalize(parse(draft.payload_json));
    if (digest(payload) !== draft.payload_hash) fail('config_copy_invalid');
    const resultId = await selected.create(connection, reference.organizationId, payload, references, reference);
    await connection.query(`UPDATE organization_config_copy_drafts SET state = 'applied', result_id = ?,
      application_hash = ?, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE org_id = ? AND id = ?`, [resultId, applicationHash, reference.organizationId, id]);
    await audit(connection, reference, 'apply', id);
    return { id, resultId, state: 'applied' };
  });
}

async function available(input, reference, guard) {
  checkReference(reference, guard);
  adapter(input.kind);
  const after = input.after == null || input.after === '' ? '' : identifier(input.after);
  return pool.withTransaction(async connection => {
    await guard(connection, reference, input.kind, 'receive', '');
    const [rows] = await connection.query(`SELECT s.id, s.kind, s.version, s.payload_json, s.payload_hash, o.name AS source_name
      FROM organization_config_shares s JOIN organizations o ON o.id = s.source_org_id
      WHERE s.target_org_id = ? AND s.kind = ? AND s.enabled = 1 AND s.id > ?
      ORDER BY s.id LIMIT 31`, [reference.organizationId, input.kind, after]);
    const items = rows.slice(0, 30).map(row => {
      const payload = adapter(row.kind).normalize(parse(row.payload_json));
      if (digest(payload) !== row.payload_hash) fail('config_copy_invalid');
      return { id: row.id, kind: row.kind, version: Number(row.version), sourceOrganizationName: row.source_name, payload };
    });
    return { items, next: rows.length > 30 ? items[items.length - 1].id : '' };
  });
}

async function detail(input, reference, guard) {
  checkReference(reference, guard);
  const id = identifier(input.id);
  return pool.withTransaction(async connection => {
    const [rows] = await connection.query(`SELECT d.*, s.enabled AS share_enabled, s.version AS current_share_version,
      o.name AS source_name FROM organization_config_copy_drafts d
      JOIN organization_config_shares s ON s.id = d.share_id AND s.target_org_id = d.org_id
      JOIN organizations o ON o.id = s.source_org_id WHERE d.org_id = ? AND d.id = ?`, [reference.organizationId, id]);
    if (!rows.length) fail('config_copy_missing');
    const draft = rows[0];
    await guard(connection, reference, draft.kind, 'receive', '');
    const payload = adapter(draft.kind).normalize(parse(draft.payload_json));
    if (digest(payload) !== draft.payload_hash) fail('config_copy_invalid');
    let activation = null;
    if (draft.state === 'applied' && venueCopied.supported(draft.kind)
      && await permitted(guard, connection, reference, draft.kind, 'read', draft.result_id)
      && await permitted(guard, connection, reference, draft.kind, 'update', draft.result_id)) {
      const current = await venueCopied.read(connection, reference.organizationId, draft.kind, draft.result_id, adapter(draft.kind));
      if (!adapter(draft.kind).globalVenue || await permitted(guard, connection, reference, 'venue.sharedConfiguration', 'configure', current.venueId)) {
        activation = { enabled: current.enabled, revision: current.revision, venueId: current.venueId, venueName: current.venueName,
          shared: adapter(draft.kind).globalVenue === true, payload: current.payload };
      }
    }
    return { id, kind: draft.kind, state: draft.state, version: Number(draft.version), payload,
      sourceOrganizationName: draft.source_name, resultId: draft.result_id || null, activation,
      shareAvailable: draft.share_enabled === 1 && Number(draft.current_share_version) === Number(draft.share_version) };
  });
}

async function enable(input, reference, guard) {
  checkReference(reference, guard);
  const id = identifier(input.id);
  if (typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) fail('config_copy_conflict');
  return pool.withTransaction(async connection => {
    const [rows] = await connection.query(`SELECT kind,result_id,state FROM organization_config_copy_drafts
      WHERE org_id=? AND id=? FOR UPDATE`, [reference.organizationId, id]);
    if (!rows.length || rows[0].state !== 'applied' || !venueCopied.supported(rows[0].kind)) fail('config_copy_missing');
    const draft = rows[0], selected = adapter(draft.kind);
    await guard(connection, reference, draft.kind, 'read', draft.result_id);
    await guard(connection, reference, draft.kind, 'update', draft.result_id);
    const state = await venueCopied.read(connection, reference.organizationId, draft.kind, draft.result_id, selected, true);
    if (selected.globalVenue) await guard(connection, reference, 'venue.sharedConfiguration', 'configure', state.venueId);
    if (state.revision !== input.revision) fail('config_copy_conflict');
    await venueCopied.enable(connection, reference.organizationId, draft.kind, draft.result_id, state);
    if (!state.enabled) await audit(connection, reference, 'enable', id);
    return { id, resultId: draft.result_id, enabled: true };
  });
}

async function permitted(guard, connection, reference, kind, action, id) {
  try { await guard(connection, reference, kind, action, id); return true; }
  catch (error) { if (error.code === 'authorization_forbidden') return false; throw error; }
}

async function workspace(input, reference, guard) {
  checkReference(reference, guard);
  adapter(input.kind);
  if (!['source', 'outgoing', 'drafts'].includes(input.tab)) fail('config_copy_invalid');
  const after = input.after == null || input.after === '' ? '' : identifier(input.after);
  return pool.withTransaction(async connection => {
    if (input.kind === 'venue.purposes') await requireOrganizationStorage(connection);
    const canReceive = await permitted(guard, connection, reference, input.kind, 'receive', '');
    const canCreate = canReceive && await permitted(guard, connection, reference, input.kind, 'create', '');
    let rows;
    if (input.tab === 'source') {
      const [table, name] = SOURCE_TABLES[input.kind];
      if (input.kind === 'venue.bookingRules' || input.kind === 'venue.bookingWindows') {
        [rows] = await connection.query(`SELECT r.id,v.name FROM ${table} r JOIN venues v ON v.id=r.venue_id
          WHERE r.org_id=? AND r.id>? ORDER BY r.id LIMIT 31`, [reference.organizationId, after]);
      } else if (adapter(input.kind).globalVenue) {
        [rows] = await connection.query(`SELECT id, ${name} AS name,venue_id FROM ${table}
          WHERE id>? ORDER BY id LIMIT 31`, [after]);
      } else {
        const published = input.kind === 'authorization.schemes' ? ' AND published_version > 0' : '';
        [rows] = await connection.query(`SELECT id, ${name} AS name FROM ${table}
          WHERE org_id=? AND id>?${published} ORDER BY id LIMIT 31`, [reference.organizationId, after]);
      }
    } else if (input.tab === 'outgoing') {
      [rows] = await connection.query(`SELECT s.id,s.source_record_id,s.version,s.enabled,s.payload_json,o.name AS organizationName
        FROM organization_config_shares s JOIN organizations o ON o.id=s.target_org_id
        WHERE s.source_org_id=? AND s.kind=? AND s.id>? ORDER BY s.id LIMIT 31`, [reference.organizationId, input.kind, after]);
    } else {
      if (!canReceive) fail('authorization_forbidden');
      [rows] = await connection.query(`SELECT d.id,d.version,d.state,d.payload_json,o.name AS organizationName
        FROM organization_config_copy_drafts d JOIN organization_config_shares s ON s.id=d.share_id AND s.target_org_id=d.org_id
        JOIN organizations o ON o.id=s.source_org_id WHERE d.org_id=? AND d.kind=? AND d.id>? ORDER BY d.id LIMIT 31`,
      [reference.organizationId, input.kind, after]);
    }
    const items = [];
    for (const row of rows.slice(0, 30)) {
      if (input.tab !== 'drafts') {
        const sourceId = input.tab === 'source' ? row.id : row.source_record_id;
        if (!await permitted(guard, connection, reference, input.kind, 'share', sourceId)
          || !await permitted(guard, connection, reference, input.kind, 'read', sourceId)) continue;
      }
      const payload = row.payload_json ? adapter(input.kind).normalize(parse(row.payload_json)) : null;
      if (input.tab !== 'drafts' && adapter(input.kind).globalVenue
        && !await permitted(guard, connection, reference, 'venue.sharedConfiguration', 'configure',
          payload ? payload.sourceVenueId : row.venue_id)) continue;
      items.push({ id: row.id, name: payload ? payload.name || payload.text || (payload.rule && payload.rule.name) || '' : row.name,
        version: row.version ? Number(row.version) : null, state: row.state || null,
        enabled: row.enabled === undefined ? null : row.enabled === 1, organizationName: row.organizationName || '' });
    }
    const organizations = input.tab === 'source' && items.length
      ? (await connection.query('SELECT id,name FROM organizations WHERE id<>? ORDER BY name,id', [reference.organizationId]))[0] : [];
    // 游标取扫描到的末记录，而非末个获授权结果；不能因一页被过滤而永久漏掉后续记录。
    return { items, organizations, canReceive, canCreate, kinds: Object.keys(ADAPTERS),
      next: rows.length > 30 ? rows[29].id : '' };
  });
}

async function candidates(input, reference, guard) {
  checkReference(reference, guard);
  const id = identifier(input.id);
  return pool.withTransaction(async connection => {
    const [rows] = await connection.query('SELECT kind,payload_json,state FROM organization_config_copy_drafts WHERE org_id=? AND id=?', [reference.organizationId, id]);
    if (!rows.length) fail('config_copy_missing');
    const draft = rows[0];
    await guard(connection, reference, draft.kind, 'receive', '');
    await guard(connection, reference, draft.kind, 'create', '');
    if (draft.state !== 'draft') fail('config_copy_conflict');
    const payload = adapter(draft.kind).normalize(parse(draft.payload_json));
    if (draft.kind === 'hr.identities') {
      const [natures] = await connection.query('SELECT id,name FROM assignment_natures WHERE org_id=? ORDER BY name,id', [reference.organizationId]);
      return { references: (payload.natureReferences || []).map(item => ({ token: item.id, kind: 'nature', label: item.name })),
        choices: { nature: natures }, people: [], assignments: [], requiresNatureSelection: true };
    }
    const rawReferences = draft.kind === 'hr.workGroups'
      ? [{ token: 'departmentId', kind: 'department', label: payload.sourceDepartmentName }] : payload.references || [];
    const aliases = { personIds: 'person', departmentIds: 'department', identityCategoryIds: 'identity', workGroupIds: 'workGroup', fieldIds: 'field', natureIds: 'nature' };
    const references = rawReferences.map(item => Object.assign({}, item, { kind: aliases[item.kind] || item.kind }));
    const kinds = new Set(references.map(item => item.kind));
    const result = { references, choices: {}, people: [], assignments: [] };
    if (!kinds.size) return result;
    const needsDirectory = [...kinds].some(kind => kind !== 'venue');
    const data = needsDirectory ? await directory.catalog(connection, reference.organizationId)
      : { departments: [], identities: [], workGroups: [], fields: [], people: [] };
    const departments = new Map(data.departments.map(item => [item.id, item.name]));
    if (kinds.has('department')) result.choices.department = data.departments;
    if (kinds.has('identity')) result.choices.identity = data.identities;
    if (kinds.has('nature')) result.choices.nature = data.natures;
    if (kinds.has('workGroup')) result.choices.workGroup = data.workGroups.map(item => ({ id: item.id,
      name: [item.name, departments.get(item.departmentId)].filter(Boolean).join(' · ') }));
    if (kinds.has('field')) result.choices.field = data.fields.map(item => ({ id: item.id, name: item.label, fieldType: item.type }));
    if (kinds.has('venue')) {
      const venues = (await connection.query('SELECT id,name FROM venues ORDER BY name,id'))[0];
      result.choices.venue = [];
      for (const venue of venues) {
        if (adapter(draft.kind).globalVenue && (venue.id === payload.sourceVenueId
          || !await permitted(guard, connection, reference, 'venue.sharedConfiguration', 'configure', venue.id))) continue;
        result.choices.venue.push(venue);
      }
    }
    if (kinds.has('person') || kinds.has('assignments')) {
      for (const person of data.people) {
        const jobs = person.assignments.map(job => ({ id: job.id, assignmentId: job.id, name: person.name,
          departmentId: job.departmentId, identityCategoryId: job.identityCategoryId, workGroupId: job.workGroupId,
          departmentName: job.departmentName, identityCategoryName: job.identityCategoryName, workGroupName: job.workGroupName,
          assignmentLabel: [job.identityCategoryName, job.departmentName, job.workGroupName].filter(Boolean).join(' · ') }));
        if (kinds.has('person')) result.people.push({ id: person.personId, personId: person.personId, name: person.name, assignments: jobs });
        if (kinds.has('assignments')) result.assignments.push(...jobs);
      }
    }
    return result;
  });
}

module.exports = { share, revoke, receive, apply, available, detail, workspace, candidates, enable };
