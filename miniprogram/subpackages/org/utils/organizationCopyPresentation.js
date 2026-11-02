'use strict';

// 只展示各适配器的明确字段；不把原始对象、内部编号或未知字段输出给用户。
function describeConfiguration(kind, payload, ui) {
  const text = ui.configurationCopy;
  const p = payload || {};
  const sections = [];
  const refs = new Map((p.references || []).map(item => [item.token, item.label]));
  const names = value => (Array.isArray(value) ? value : String(value || '').split(',')).filter(Boolean)
    .map(id => refs.get(id) || text.missingReference).join(text.listSeparator);
  const add = (title, lines) => sections.push({ key: 'section-' + sections.length, title,
    lines: lines.filter(value => value !== '' && value != null).map(String) });
  const row = (label, value) => text.summaryRow(label, value);
  const flag = value => value ? text.yes : text.no;
  const dimensions = [['department', 'Department'], ['identity', 'Identity'], ['workGroup', 'WorkGroup']];
  function flowCondition(c) {
    if (c.conditionType === 'submitter') return text.submitter;
    if (c.conditionType === 'person') return row(text.referenceKinds.assignments, names(c.assignmentIds));
    return dimensions.map(([lower, upper]) => row(text.referenceKinds[lower],
      c[lower + 'Scope'] === 'specific' ? names(c['specific' + upper + 'Id'])
        : c[lower + 'Scope'] === 'all' ? text.all : text.sameAsApplicant)).join(text.conditionAnd);
  }
  function audience(c) {
    if (c.type === 'self') return text.self;
    if (c.type === 'people') return row(text.referenceKinds.person, names(c.personIds));
    return [['departmentIds', 'sameDepartment', 'department'], ['identityCategoryIds', 'sameIdentity', 'identity'],
      ['workGroupIds', 'sameWorkGroup', 'workGroup']].filter(([key, same]) => c[same] || (c[key] || []).length)
      .map(([key, same, label]) => row(text.referenceKinds[label], c[same]
        ? (kind === 'calendar.rules' ? text.sameAsOrganizer : text.sameAsViewer) : names(c[key]))).join(text.conditionAnd);
  }
  if (p.description) add(text.description, [p.description]);
  if (kind === 'venue.purposes') add(text.content, [p.text, row(text.sortOrder, p.sortOrder)]);
  if (kind === 'hr.workGroups') add(text.sourceDepartment, [p.sourceDepartmentName]);
  if (kind === 'audit.templates') {
    add(text.starters, (p.starterConditions || []).map((c, index) => text.conditionGroup(index + 1, flowCondition(c))));
    (p.steps || []).forEach((step, index) => add(text.step(index + 1, step.name), [
      row(text.action, text.auditActions[step.actionType]), row(text.designation, flag(step.allowApproverDesignation)),
      ...(step.conditions || []).map((c, position) => text.conditionGroup(position + 1, flowCondition(c)))
    ]));
  }
  if (kind === 'venue.approvals') {
    add(text.flowOptions, [row(text.referenceKinds.venue, names(p.venueReference)), row(text.userSelect, flag(p.allowUserSelect)),
      row(text.designateFirst, flag(p.allowDesignateFirst)), row(text.designateNext, flag(p.allowDesignateNext))]);
    (p.steps || []).forEach((step, index) => add(text.step(index + 1, step.name), step.approvalMode === 'admin_any'
      ? [text.anyAdmin] : (step.rules || []).map((c, position) => text.conditionGroup(position + 1, flowCondition(c)))));
  }
  if (kind === 'venue.bookingRules') add(text.content, [row(text.bookingRuleType, text.bookingRuleTypes[p.ruleType]),
    row(text.referenceKinds.venue, names(p.venueReference)),
    ...[['identityReference', 'identity'], ['assignmentReference', 'assignments'], ['departmentReference', 'department'],
      ['workGroupReference', 'workGroup']].filter(([key]) => p[key]).map(([key, label]) => row(text.referenceKinds[label], names(p[key])))]);
  if (kind === 'venue.bookingWindows') {
    const advance = (value, fallback) => !value || value.mode === 'none' ? fallback
      : value.mode === 'days' ? text.advanceDays(value.days) : text.advanceDuration(value.hours, value.minutes);
    add(text.content, [row(text.sourceVenue, p.name), row(text.bookingOpen, advance(p.open, text.noOpenLimit)),
      row(text.bookingDeadline, advance(p.deadline, text.atBookingStart))]);
  }
  if (kind === 'scoring.templates') (p.questions || []).forEach((q, index) => add(text.question(index + 1), [
    q.question, q.scoreLabel, text.scoreRange(q.minValue, q.startValue, q.maxValue, q.stepValue)
  ]));
  if (kind === 'authorization.schemes') add(text.capabilities, (p.capabilities || []).map(key => {
    const position = key.lastIndexOf('.');
    return ui.capabilityLabel(ui.resources[key.slice(0, position)] || text.unknownCapability, ui.actions[key.slice(position + 1)] || text.unknownCapability);
  }));
  if (kind === 'hr.directoryRules' || kind === 'calendar.rules') {
    const rule = p.rule || {};
    add(text.audience, (rule.audience || []).map((c, index) => text.conditionGroup(index + 1, audience(c))));
    add(text.targets, (rule.targets || []).map((c, index) => text.conditionGroup(index + 1, audience(c))));
    if (kind === 'calendar.rules') add(text.action, (rule.actions || []).map(action => text.calendarActions[action] || text.unknownCapability));
    else add(text.fields, [(rule.fieldIds || []).length ? names(rule.fieldIds) : text.basicFieldsOnly]);
  }
  if (kind === 'venue.openRules' || kind === 'venue.activityRules') {
    const meta = Array.isArray(p.cycleValues) ? { values: p.cycleValues, periodMode: 'none' } : p.cycleValues || {};
    let days = '';
    if (p.cycleType === 'weekly') days = (meta.values || []).map(day => text.weekdays[day - 1]).join(text.listSeparator);
    if (p.cycleType === 'monthly') days = (meta.values || []).map(text.monthDay).join(text.listSeparator);
    if (p.cycleType === 'yearly') days = (meta.values || []).map(value => text.yearDays(value.m, value.dStart || value.d, value.dEnd || value.d)).join(text.listSeparator);
    const legacyPeriod = ['range', 'datetime_range', 'repeat'].includes(p.cycleType);
    const period = legacyPeriod ? text.periodRange(meta.startDate, meta.startTime || p.timeStart, meta.endDate, meta.endTime || p.timeEnd)
      : meta.periodMode === 'range' ? text.periodRange(meta.periodStartDate, meta.periodStartTime || '00:00', meta.periodEndDate, meta.periodEndTime || '23:59')
      : meta.periodMode === 'count' ? text.periodCount(meta.periodStartDate, meta.periodStartTime || '00:00', meta.repeatCount) : text.unlimitedPeriod;
    add(text.sharedTime, [row(text.sourceVenue, p.sourceVenueName), row(text.cycle, [text.cycles[p.cycleType], days].filter(Boolean).join(text.listSeparator)),
      ['datetime_range', 'repeat'].includes(p.cycleType) ? '' : row(text.dailyTime, text.timeRange(p.timeStart, p.timeEnd)),
      period, p.cycleType === 'repeat' ? text.legacyRepeat(meta.intervalValue, text.intervalUnits[meta.intervalUnit], meta.repeatCount) : '', text.sharedNotice]);
  }
  return { name: p.name || p.text || (p.rule && p.rule.name) || text.unnamed,
    notice: kind === 'venue.bookingWindows' ? text.windowNotice : kind === 'authorization.schemes' ? text.schemeNotice
      : ['audit.templates', 'venue.approvals', 'venue.bookingRules', 'venue.openRules', 'venue.activityRules', 'hr.directoryRules', 'calendar.rules'].includes(kind)
        ? text.draftNotice : text.configurationNotice, sections };
}

function copiedConfigurationDestination(draft) {
  if (!draft || draft.state !== 'applied' || !/^[A-Za-z0-9_-]{1,64}$/.test(draft.resultId || '')) return null;
  const query = { copyKind: draft.kind, copyId: draft.resultId };
  const adminKinds = {
    'hr.departments': ['hr', 'departments'], 'hr.identities': ['hr', 'identities'],
    'hr.workGroups': ['hr', 'workGroups'], 'audit.templates': ['audit', 'auditTemplates'],
    'scoring.templates': ['scoring', 'templates'], 'hr.directoryRules': ['hr', 'hrInfo']
  };
  if (adminKinds[draft.kind]) {
    query.subApp = adminKinds[draft.kind][0]; query.tab = adminKinds[draft.kind][1];
    return { name: 'adminConsole', path: '/subpackages/scoring/pages/admin/admin', query };
  }
  if (draft.kind === 'authorization.schemes') return { name: 'authorizationEditor',
    path: '/subpackages/org/pages/authorizationEditor/authorizationEditor', query: { kind: 'scheme', id: draft.resultId } };
  if (draft.kind === 'calendar.rules') return { name: 'calendar', path: '/subpackages/workspace/pages/calendarRules/calendarRules', query };
  if (draft.kind === 'hr.assignmentNatures') return { name: 'assignmentNatures', path: '/subpackages/org/pages/assignmentNatures/assignmentNatures', query };
  if (draft.kind === 'venue.purposes') return { name: 'venueManage', path: '/subpackages/venue/pages/venueManage/venueManage', query: Object.assign(query, { tab: 'purposes' }) };
  const venueTabs = { 'venue.approvals': 'booking', 'venue.bookingRules': 'booking', 'venue.bookingWindows': 'bookingWindow',
    'venue.openRules': 'open', 'venue.activityRules': 'activity' };
  if (venueTabs[draft.kind] && draft.activation && /^[A-Za-z0-9_-]{1,64}$/.test(draft.activation.venueId || '')) {
    return { name: 'venueManage', path: '/subpackages/venue/pages/venueManage/venueManage',
      query: Object.assign(query, { tab: 'venue', venueId: draft.activation.venueId, rulesTab: venueTabs[draft.kind] }) };
  }
  return null;
}
module.exports = { describeConfiguration, copiedConfigurationDestination };
