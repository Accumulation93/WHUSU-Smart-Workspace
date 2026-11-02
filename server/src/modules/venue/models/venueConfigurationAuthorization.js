'use strict';

const pool = require('../../../config/db');
const { createAuthorizationSession } = require('../../../core/services/authorizationSession');
const { requireLegacyWrite } = require('../../../core/models/authorizationBusinessRoute');
const { authorizationError } = require('../../../core/services/authorizationError');
const { generateId } = require('../../../utils/helpers');
const { normalizeBookingWindow } = require('../services/venueBookingWindow');
const candidates = require('./venueRuleCandidates');
const openRules = require('./venueOpenRule');
const activityRules = require('./venueActivityRule');
const flowSteps = require('./venueApprovalFlowStep');
const venueModel = require('./venue');
const SHARED_RULES = Object.freeze({
  openRules: { table: 'venue_open_rules', model: openRules, title: 'name', column: 'name' },
  activityRules: { table: 'venue_activity_rules', model: activityRules, title: 'activityName', column: 'activity_name' }
});

function sharedDefinition(kind) {
  if (!Object.hasOwn(SHARED_RULES, kind)) throw authorizationError('authorization_forbidden');
  return SHARED_RULES[kind];
}

async function sharedSession(connection, reference, organizationId) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return null;
  }
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  if (reference.organizationId !== organizationId || session.mode !== 'enforced') throw authorizationError('authorization_forbidden');
  return session;
}

function requireDecision(session, organizationId, resourceType, id, action, fields = []) {
  const decision = session.check({ capability: resourceType + '.' + action,
    resource: { id, type: resourceType, organizationId }, requestedFields: fields,
    businessAllowed: true, legacyAllowed: false });
  if (!decision.allowed) throw authorizationError('authorization_forbidden');
  return decision;
}

async function writeSharedRule(reference, organizationId, kind, id, data, remove = false) {
  const definition = sharedDefinition(kind);
  return pool.withTransaction(async connection => {
    const session = await sharedSession(connection, reference, organizationId);
    // 全局场地配置遵守场地锁顺序；规则不能被请求中的 venueId 搬到另一个场地。
    const [before] = await connection.query('SELECT venue_id FROM ' + definition.table + ' WHERE id=?', [id]);
    if (remove && !before.length && !session) return { id, existing: false };
    const venueId = before[0]?.venue_id || data?.venueId;
    if (!venueId || (before.length && data && data.venueId !== venueId)) throw authorizationError('venue_rule_invalid');
    const [venues] = await connection.query('SELECT id FROM venues WHERE id=? FOR UPDATE', [venueId]);
    if (!venues.length) throw authorizationError('venue_missing');
    const [rows] = await connection.query('SELECT * FROM ' + definition.table + ' WHERE id=? FOR UPDATE', [id]);
    const existing = rows[0];
    if ((existing && existing.venue_id !== venueId) || (remove && !existing)) throw authorizationError('venue_rule_invalid');
    const action = remove ? 'delete' : existing ? 'update' : 'create';
    if (session) {
      requireDecision(session, organizationId, 'venue.sharedConfiguration', venueId, 'configure');
      requireDecision(session, organizationId, 'venue.' + kind, id, action,
        remove ? [] : [definition.title, 'cycleType', 'cycleValues', 'timeStart', 'timeEnd']);
    }
    if (remove) await definition.model.remove(id, connection);
    else if (existing) await definition.model.update(id, data, connection);
    else await definition.model.create(id, data, connection);
    return { id, existing: Boolean(existing) };
  });
}

async function listSharedRules(reference, organizationId, kind, venueId) {
  const definition = sharedDefinition(kind);
  return pool.withTransaction(async connection => {
    const session = await sharedSession(connection, reference, organizationId);
    if (!session) {
      const [rows] = await connection.query('SELECT * FROM ' + definition.table + ' WHERE venue_id=? ORDER BY cycle_type,time_start', [venueId]);
      return rows;
    }
    const type = 'venue.' + kind;
    const scope = session.queryScope({ resourceType: type, organization: 'context.org_id', id: 'r.id' }, type + '.read');
    const [rows] = await connection.query('SELECT r.* FROM ' + definition.table
      + ' r JOIN (SELECT ? AS org_id) context WHERE r.venue_id=? AND (' + scope.sql + ') ORDER BY r.cycle_type,r.time_start',
    [organizationId, venueId, ...scope.params]);
    const fields = { [definition.title]: definition.column, cycleType: 'cycle_type', cycleValues: 'cycle_values',
      timeStart: 'time_start', timeEnd: 'time_end', isActive: 'is_active' };
    return rows.map(row => {
      const decision = requireDecision(session, organizationId, type, row.id, 'read');
      const result = { id: row.id, venue_id: row.venue_id };
      for (const field of decision.fields) if (fields[field]) result[fields[field]] = row[fields[field]];
      return result;
    });
  });
}

async function authorize(connection, reference, organizationId, capability, id, fields = []) {
  if (!reference) {
    await requireLegacyWrite(connection, organizationId);
    return;
  }
  if (reference.organizationId !== organizationId) throw authorizationError('authorization_forbidden');
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  const resourceType = capability.slice(0, capability.lastIndexOf('.'));
  const decision = session.check({ capability, resource: { id, type: resourceType, organizationId },
    requestedFields: fields, businessAllowed: true, legacyAllowed: false });
  if (session.mode !== 'enforced' || !decision.allowed) throw authorizationError('authorization_forbidden');
}

async function readCandidates(reference, organizationId) {
  return pool.withTransaction(async connection => {
    await authorize(connection, reference, organizationId, 'venue.approvalCandidates.read', organizationId);
    return candidates.read(connection, organizationId);
  });
}

async function authorizeBookingWindow(connection, session, organizationId, venueId) {
  const [rows] = await connection.query('SELECT id FROM venue_booking_policies WHERE venue_id=? AND org_id=? FOR UPDATE',
    [venueId, organizationId]);
  const id = rows[0]?.id || generateId();
  if (session) requireDecision(session, organizationId, 'venue.bookingWindows', id, 'create',
    ['openAdvanceMode', 'openAdvanceDays', 'openAdvanceMinutes', 'deadlineAdvanceMode', 'deadlineAdvanceDays', 'deadlineAdvanceMinutes']);
  return id;
}

async function listOrganizationConfiguration(reference, organizationId, kind, venueId, includeInactive) {
  const definitions = {
    bookingRules: { table: 'venue_booking_rules', fields: { ruleType: 'rule_type', approverIdentityId: 'approver_identity_id',
      approverHrId: 'approver_hr_id', approverAssignmentId: 'approver_assignment_id', scopeDepartmentId: 'scope_department_id',
      scopeWorkGroupId: 'scope_work_group_id', sortOrder: 'sort_order', isActive: 'is_active' } },
    approvals: { table: 'venue_approval_flows', fields: { name: 'name', allowUserSelect: 'allow_user_select',
      allowDesignateFirst: 'allow_designate_first', allowDesignateNext: 'allow_designate_next', isActive: 'is_active' } }
  };
  if (!Object.hasOwn(definitions, kind)) throw authorizationError('authorization_forbidden');
  const definition = definitions[kind];
  return pool.withTransaction(async connection => {
    const session = await sharedSession(connection, reference, organizationId);
    const type = 'venue.' + kind;
    const scope = session ? session.queryScope({ resourceType: type, organization: 'r.org_id', id: 'r.id' }, type + '.read')
      : { sql: '1=1', params: [] };
    const [rows] = await connection.query('SELECT r.* FROM ' + definition.table
      + ' r WHERE r.org_id=? AND r.venue_id=?' + (includeInactive ? '' : ' AND r.is_active=1')
      + ' AND (' + scope.sql + ') ORDER BY ' + (includeInactive ? 'r.is_active DESC,' : '')
      + (kind === 'bookingRules' ? 'r.sort_order,r.id' : 'r.created_at,r.id'), [organizationId, venueId, ...scope.params]);
    const results = [];
    for (const row of rows) {
      const decision = session ? requireDecision(session, organizationId, type, row.id, 'read') : null;
      const result = session ? { id: row.id, org_id: organizationId, venue_id: venueId } : { ...row };
      if (session) for (const field of decision.fields) {
        if (definition.fields[field]) result[definition.fields[field]] = row[definition.fields[field]];
      }
      if (kind === 'approvals' && (!session || decision.fields.includes('steps'))) {
        result.steps = await flowSteps.getByFlowId(row.id, organizationId, connection);
      }
      results.push(result);
    }
    if (kind === 'approvals') return { flows: results };
    const [policies] = await connection.query('SELECT * FROM venue_booking_policies WHERE org_id=? AND venue_id=?', [organizationId, venueId]);
    let bookingWindow = null;
    if (policies[0]) {
      const value = require('../services/venueBookingWindow').fromRow(policies[0]);
      if (!session) bookingWindow = value;
      else {
        const decision = session.check({ capability: 'venue.bookingWindows.read', resource: {
          id: value.id, type: 'venue.bookingWindows', organizationId }, businessAllowed: true, legacyAllowed: false });
        if (decision.allowed) bookingWindow = { id: value.id, venueId, orgId: organizationId, ...session.project(value, decision) };
      }
    }
    return { rules: results, bookingWindow };
  });
}

async function saveBookingWindow(reference, organizationId, venueId, input) {
  const data = normalizeBookingWindow(input);
  return pool.withTransaction(async connection => {
    // 先锁定权威角色与授权状态，再锁定场地配置；旧请求不能跨越授权模式切换。
    if (!reference) await requireLegacyWrite(connection, organizationId);
    const session = reference ? await createAuthorizationSession(connection, reference, { lock: true }) : null;
    if (reference && (reference.organizationId !== organizationId || session.mode !== 'enforced')) {
      throw authorizationError('authorization_forbidden');
    }
    const [venues] = await connection.query('SELECT id FROM venues WHERE id=? FOR UPDATE', [venueId]);
    if (!venues.length) throw authorizationError('venue_missing');
    const [policies] = await connection.query(
      'SELECT id FROM venue_booking_policies WHERE venue_id=? AND org_id=? FOR UPDATE', [venueId, organizationId]);
    const id = policies[0]?.id || generateId();
    if (session) {
      const decision = session.check({ capability: 'venue.bookingWindows.create',
        resource: { id, type: 'venue.bookingWindows', organizationId },
        requestedFields: ['openAdvanceMode', 'openAdvanceDays', 'openAdvanceMinutes',
          'deadlineAdvanceMode', 'deadlineAdvanceDays', 'deadlineAdvanceMinutes'],
        businessAllowed: true, legacyAllowed: false });
      if (!decision.allowed) throw authorizationError('authorization_forbidden');
    }
    await connection.query(`INSERT INTO venue_booking_policies
      (id,venue_id,org_id,open_advance_mode,open_advance_days,open_advance_minutes,
       deadline_advance_mode,deadline_advance_days,deadline_advance_minutes)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
       open_advance_mode=VALUES(open_advance_mode),open_advance_days=VALUES(open_advance_days),
       open_advance_minutes=VALUES(open_advance_minutes),deadline_advance_mode=VALUES(deadline_advance_mode),
       deadline_advance_days=VALUES(deadline_advance_days),deadline_advance_minutes=VALUES(deadline_advance_minutes)`,
    [id, venueId, organizationId, data.openAdvanceMode, data.openAdvanceDays, data.openAdvanceMinutes,
      data.deadlineAdvanceMode, data.deadlineAdvanceDays, data.deadlineAdvanceMinutes]);
    return { id };
  });
}

async function configurationVenueCandidates(connection, session, organizationId) {
  const [venues] = await connection.query('SELECT id,name FROM venues WHERE is_active=1 ORDER BY name,id');
  if (!session) return venues;
  const definitions = [
    { type: 'venue.approvals', table: 'venue_approval_flows' },
    { type: 'venue.bookingRules', table: 'venue_booking_rules' },
    { type: 'venue.bookingWindows', table: 'venue_booking_policies', actions: ['read', 'create'] },
    { type: 'venue.openRules', table: 'venue_open_rules', shared: true },
    { type: 'venue.activityRules', table: 'venue_activity_rules', shared: true }
  ];
  const allowed = new Set();
  const check = (type, id, action) => session.check({ capability: type + '.' + action,
    resource: { id, type, organizationId }, businessAllowed: true, legacyAllowed: false }).allowed;
  for (const definition of definitions) {
    const actions = definition.actions || ['read', 'create', 'update', 'delete'];
    if (!actions.some(action => session.hasExplicitEntry(definition.type + '.' + action))) continue;
    const mayOperate = (venueId, id, action) => check(definition.type, id, action)
      && (!definition.shared || action === 'read' || check('venue.sharedConfiguration', venueId, 'configure'));
    // 组织范围权限可以选择尚无配置的场地，指定记录权限只能看到该记录真正所属的场地。
    for (const venue of venues) {
      if (actions.some(action => mayOperate(venue.id, '', action))) allowed.add(venue.id);
    }
    const existingActions = actions.filter(action => action !== 'create' || definition.type === 'venue.bookingWindows');
    const scopes = existingActions.map(action => session.queryScope({ resourceType: definition.type,
      organization: definition.shared ? 'context.org_id' : 'r.org_id', id: 'r.id' }, definition.type + '.' + action));
    const sql = scopes.map(scope => '(' + scope.sql + ')').join(' OR ');
    const [rows] = await connection.query('SELECT r.id,r.venue_id FROM ' + definition.table + ' r'
      + (definition.shared ? ' JOIN (SELECT ? AS org_id) context WHERE ' : ' WHERE r.org_id=? AND ')
      + '(' + sql + ')', [organizationId, ...scopes.flatMap(scope => scope.params)]);
    for (const row of rows) if (existingActions.some(action => mayOperate(row.venue_id, row.id, action))) allowed.add(row.venue_id);
  }
  return venues.filter(venue => allowed.has(venue.id));
}

async function listVenues(reference, organizationId, options = {}) {
  return pool.withTransaction(async connection => {
    const session = await sharedSession(connection, reference, organizationId);
    const configurationVenues = options.includeConfiguration
      ? await configurationVenueCandidates(connection, session, organizationId) : [];
    if (options.purpose === 'configuration') return { venues: configurationVenues, configurationVenues };
    if (!session) {
      const venues = (await connection.query('SELECT * FROM venues WHERE is_active=1 ORDER BY name'))[0];
      return options.includeConfiguration ? { venues, configurationVenues } : venues;
    }
    const scope = session.queryScope({ resourceType: 'venue.resources', organization: 'context.org_id', id: 'v.id' }, 'venue.resources.read');
    const [rows] = await connection.query('SELECT v.* FROM venues v JOIN (SELECT ? AS org_id) context WHERE v.is_active=1 AND ('
      + scope.sql + ') ORDER BY v.name', [organizationId, ...scope.params]);
    const fields = { name: 'name', location: 'location', description: 'description', imageUrl: 'image_url', isActive: 'is_active' };
    const venues = rows.map(row => {
      const decision = requireDecision(session, organizationId, 'venue.resources', row.id, 'read');
      const result = { id: row.id };
      for (const field of decision.fields) if (fields[field]) result[fields[field]] = row[fields[field]];
      return result;
    });
    return options.includeConfiguration ? { venues, configurationVenues } : venues;
  });
}

async function writeVenue(reference, organizationId, id, data, remove = false) {
  return pool.withTransaction(async connection => {
    const session = await sharedSession(connection, reference, organizationId);
    const existing = await venueModel.getByIdForUpdate(id, connection);
    if (session) requireDecision(session, organizationId, 'venue.resources', id,
      remove ? 'delete' : existing ? 'update' : 'create', remove ? [] : ['name', 'location', 'description', 'imageUrl']);
    // 保留原接口停用场地的语义，历史借用及共享时间记录不随此动作删除。
    if (remove) await venueModel.remove(id, connection);
    else if (existing) await venueModel.update(id, data, connection);
    else await venueModel.create(id, data, connection);
    return { id, existing: Boolean(existing) };
  });
}

module.exports = { readCandidates, saveBookingWindow, writeSharedRule, listSharedRules, listVenues, writeVenue,
  begin: sharedSession, requireDecision, authorizeBookingWindow, listOrganizationConfiguration };
