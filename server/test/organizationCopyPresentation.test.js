'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { describeConfiguration } = require('../../shared/organizationCopyPresentation');
const { copiedConfigurationDestination } = require('../../shared/organizationCopyPresentation');
const ui = require('../../shared/locales/zh-CN/authorization');
const text = ui.configurationCopy;
const render = (kind, value) => describeConfiguration(kind, value, ui);
const lines = value => value.sections.flatMap(section => section.lines).join('\n');

test('15 类副本只进入白名单编辑入口，场地使用目标场地而不是来源场地', () => {
  const kinds = ['venue.purposes','hr.departments','hr.identities','hr.workGroups','hr.assignmentNatures','audit.templates',
    'scoring.templates','venue.approvals','venue.bookingRules','venue.bookingWindows','venue.openRules','venue.activityRules',
    'hr.directoryRules','calendar.rules','authorization.schemes'];
  for (const kind of kinds) {
    const target = copiedConfigurationDestination({kind,state:'applied',resultId:'result',payload:{venueId:'source'},activation:{venueId:'target'}});
    assert.ok(target,kind); assert.match(target.path,/^\/subpackages\//);
    if (target.query.venueId) assert.equal(target.query.venueId,'target');
  }
  assert.equal(copiedConfigurationDestination({kind:'venue.openRules',state:'applied',resultId:'result',payload:{venueId:'source'}}),null);
  assert.equal(copiedConfigurationDestination({kind:'hr.departments',state:'draft',resultId:'result'}),null);
  assert.equal(copiedConfigurationDestination({kind:'unknown',state:'applied',resultId:'result'}),null);
  assert.equal(copiedConfigurationDestination({kind:'hr.departments',state:'applied',resultId:'../invalid'}),null);
});

test('共享周期预览保留每天时间、日期边界和次数，明确影响全部组织', () => {
  const base = { name: '', sourceVenueName: '会议室', timeStart: '16:30', timeEnd: '18:30' };
  const monthly = render('venue.activityRules', { ...base, cycleType: 'monthly', cycleValues: {
    values: [4, 20], periodMode: 'count', periodStartDate: '2026-11-01', periodStartTime: '08:00', repeatCount: 12 } });
  assert.equal(monthly.name, text.unnamed);
  assert.ok(lines(monthly).includes('4 日、20 日'));
  assert.ok(lines(monthly).includes(text.periodCount('2026-11-01', '08:00', 12)));
  assert.ok(lines(monthly).includes('16:30—18:30'));
  assert.ok(lines(monthly).includes(text.sharedNotice));
  const yearly = render('venue.openRules', { ...base, cycleType: 'yearly', cycleValues: { values: [{ m: 2, dStart: 28, dEnd: 29 }],
    periodMode: 'range', periodStartDate: '2026-01-01', periodEndDate: '2028-12-31' } });
  assert.ok(lines(yearly).includes('2 月 28—29 日'));
  assert.ok(lines(yearly).includes(text.periodRange('2026-01-01', '00:00', '2028-12-31', '23:59')));
  const weekly = render('venue.openRules', { ...base, cycleType: 'weekly', cycleValues: [1, 7] });
  assert.ok(lines(weekly).includes('周一、周日'));
  assert.ok(lines(weekly).includes(text.unlimitedPeriod));
});

test('审核及场地流程显示每步动作和条件，不泄漏内部关联编号', () => {
  const scope = { conditionType: 'identity_scope', departmentScope: 'specific', specificDepartmentId: 'ref-1', identityScope: 'own', workGroupScope: 'all' };
  const preview = render('audit.templates', { name: '报销', description: '审批说明', references: [{ token: 'ref-1', label: '事务部' }],
    starterConditions: [scope], steps: [{ name: '复核', actionType: 'either', allowApproverDesignation: false,
      conditions: [scope, { conditionType: 'submitter' }] }] });
  assert.ok(lines(preview).includes('签名或盖章'));
  assert.ok(lines(preview).includes('事务部'));
  assert.ok(lines(preview).includes(text.submitter));
  assert.ok(!lines(preview).includes('ref-1'));
  const venue = render('venue.approvals', { venueReference: 'ref-venue', references: [{ token: 'ref-venue', label: '会议室' }],
    allowUserSelect: true, allowDesignateFirst: false, allowDesignateNext: true, steps: [{ name: '审批', approvalMode: 'admin_any', rules: [] }] });
  assert.ok(lines(venue).includes(text.anyAdmin));
  assert.ok(lines(venue).includes(text.summaryRow(text.designateFirst, text.no)));
  assert.ok(lines(venue).includes(text.summaryRow(text.designateNext, text.yes)));
});

test('通讯录和日程明确展示不同人群、资料列和动作', () => {
  const rule = { name: '成员规则', audience: [{ type: 'people', personIds: ['ref-person'] }],
    targets: [{ type: 'scope', sameDepartment: true }, { type: 'self' }], fieldIds: ['ref-field'], actions: ['assign', 'cancel'] };
  const references = [{ token: 'ref-person', label: '甲' }, { token: 'ref-field', label: '联系电话' }];
  const directory = render('hr.directoryRules', { rule, references });
  assert.ok(lines(directory).includes('甲'));
  assert.ok(lines(directory).includes('联系电话'));
  assert.ok(lines(directory).includes(text.sameAsViewer));
  const calendar = render('calendar.rules', { rule, references });
  assert.ok(lines(calendar).includes(text.sameAsOrganizer));
  assert.ok(lines(calendar).includes(text.calendarActions.cancel));
  assert.ok(!lines(calendar).includes('联系电话'));
});

test('字典、事由、题目、权限方案各自保留内容和正确的生效提示', () => {
  for (const kind of ['hr.departments', 'hr.identities', 'hr.workGroups', 'hr.assignmentNatures']) {
    assert.equal(render(kind, { name: '字典', description: '说明' }).notice, text.configurationNotice);
  }
  assert.ok(lines(render('venue.purposes', { text: '会议', sortOrder: 3 })).includes(text.summaryRow(text.sortOrder, 3)));
  assert.ok(lines(render('scoring.templates', { questions: [{ question: '题目', scoreLabel: '标准', minValue: 0, startValue: 5, maxValue: 10, stepValue: 0.5 }] }))
    .includes(text.scoreRange(0, 5, 10, 0.5)));
  const scheme = render('authorization.schemes', { capabilities: ['venue.bookings.read'] });
  assert.equal(scheme.notice, text.schemeNotice);
  assert.ok(lines(scheme).includes(ui.capabilityLabel(ui.resources['venue.bookings'], ui.actions.read)));
  assert.equal(render('', undefined).name, text.unnamed);
});
