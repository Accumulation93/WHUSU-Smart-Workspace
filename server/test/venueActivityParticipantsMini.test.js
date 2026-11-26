'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const loadPage = require('../../scripts/lib/loadVenueManagementPage');
const source = path.resolve(__dirname, '../../miniprogram/subpackages/venue/pages/venueManage/venueManagementBehavior.js');
const sourceRequire = createRequire(source);
const flowCopy = require('../../shared/locales/zh-CN/venueFlowManagement');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const event = (dataset, value) => ({ currentTarget: { dataset }, detail: { value } });
const people = [{ type: 'people', personIds: ['person-a'] }];
function setup() {
  const calls = [], toasts = [];
  const state = { targets: [], version: 0, rules: [], canEdit: true, failure: false, missingCandidates: false, saveFailure: false, epoch: 0 };
  const metadata = () => ({ status: 'success', canEdit: state.canEdit, targets: clone(state.targets), version: state.version,
    people: state.missingCandidates ? undefined : [{ personId: 'person-a', name: 'Person A', assignments: [] }], natures: [], departments: [], identities: [], workGroups: [] });
  const definition = loadPage({ console, setTimeout, clearTimeout, wx: { nextTick: callback => callback(), hideLoading() {} },
    require(name) {
      if (name.endsWith('/utils/api')) return {
        async callFunction(options) {
          calls.push(clone(options));
          if (options.name === 'getVenueActivityParticipantConfiguration') {
            if (state.waitMetadata) return state.waitMetadata;
            if (state.failure) throw new Error('network');
            return metadata();
          }
          if (options.name === 'listVenueActivityRules') return { status: 'success', rules: clone(state.rules) };
          if (options.name === 'saveVenueActivityRule') {
            if (state.waitSave) await state.waitSave;
            if (state.saveFailure) return { status: 'error', code: 'calendar_invalidRule' };
            const data = options.data;
            state.rules = [{ id: data.id || 'saved-activity', activity_name: data.activityName, cycle_type: data.cycleType,
              cycle_values: clone(data.cycleValues), time_start: data.timeStart, time_end: data.timeEnd }];
            if (Object.hasOwn(data, 'participantTargets')) {
              assert.equal(data.participantVersion, state.version);
              state.targets = clone(data.participantTargets); state.version++;
            }
            return { status: 'success', id: state.rules[0].id };
          }
          return { status: 'success', rules: [], flows: [] };
        },
        createResultError(result) { return Object.assign(new Error('result'), { code: result.code }); },
        getErrorText(error, fallback) { return fallback; }, showShortToast(text) { toasts.push(text); }
      };
      if (name.endsWith('/utils/orgSession')) return {
        beginRequest() { return { epoch: state.epoch }; }, isRequestCurrent(page, request) { return request.epoch === state.epoch; },
        invalidateRequests() { state.epoch++; }
      };
      if (name.includes('/locales/')) return sourceRequire(name);
      if (name.endsWith('/utils/dialogKeyboard')) return { dialogKeyboardBehavior: {} };
      if (name.endsWith('/utils/venueRuleDisplay')) return { buildBookingRuleDisplayList: list => list || [] };
      return {};
    }
  });
  const page = { ...definition, data: clone(definition.data), setData(patch, callback) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let object = this.data;
      for (const part of parts.slice(0, -1)) object = object[part];
      object[parts[parts.length - 1]] = value;
    }
    if (callback) callback();
  } };
  page.data.rulesVenueId = 'venue-a'; page.data.authorizationEnforced = true;
  page.data.actionCapabilities = { 'venue.activityRules.create': true, 'venue.activityRules.update': true, 'venue.activityRules.read': true };
  const open = async (id = '') => { page.openRuleEditor(event({ type: 'activity', id })); await tick(); };
  return { page, state, calls, toasts, metadata, open, writes: () => calls.filter(call => call.name === 'saveVenueActivityRule') };
}
async function main() {
  const first = setup(), { page, state } = first;
  await first.open();
  assert.equal(page.data.activityParticipantState, 'loaded'); assert.deepEqual(clone(page.data.activityParticipantTargets), []);
  page.onRuleFormField(event({ field: 'name' }, 'Activity with people'));
  page.onCycleTypeChange(event({}, '0'));
  page.changeActivityParticipants({ detail: { value: people } });
  await page.saveRule();
  assert.deepEqual(first.writes()[0].data.participantTargets, people);
  assert.deepEqual(clone(page.data.activityParticipantMetadata), {});
  assert.deepEqual(clone(page.data.activityParticipantTargets), []);
  assert.equal(page.data.activityRules[0].activity_name, 'Activity with people');
  await first.open('saved-activity'); assert.deepEqual(clone(page.data.activityParticipantTargets), people);
  page.onRuleFormField(event({ field: 'name' }, 'Only rename')); await page.saveRule();
  assert.equal(Object.hasOwn(first.writes()[1].data, 'participantTargets'), false);
  await first.open('saved-activity'); page.changeActivityParticipants({ detail: { value: [] } }); await page.saveRule();
  assert.deepEqual(first.writes()[2].data.participantTargets, []);
  await first.open('saved-activity'); assert.deepEqual(clone(page.data.activityParticipantTargets), []);

  state.failure = true; await page.loadActivityParticipantConfiguration();
  page.onRuleFormField(event({ field: 'name' }, 'Preserved draft'));
  assert.equal(page.data.activityParticipantState, 'failed');
  state.failure = false; state.missingCandidates = true; await page.loadActivityParticipantConfiguration();
  assert.equal(page.data.activityParticipantState, 'failed');
  state.missingCandidates = false; await page.loadActivityParticipantConfiguration();
  assert.equal(page.data.ruleForm.name, 'Preserved draft');
  state.canEdit = false; await page.loadActivityParticipantConfiguration();
  page.changeActivityParticipants({ detail: { value: people } }); await page.saveRule();
  assert.equal(Object.hasOwn(first.writes().at(-1).data, 'participantTargets'), false);

  const late = setup(); let releaseMetadata;
  late.state.waitMetadata = new Promise(resolve => { releaseMetadata = resolve; });
  await late.open(); late.page.closeRuleEditor();
  late.state.waitMetadata = null; late.state.canEdit = false; await late.open();
  releaseMetadata({ ...late.metadata(), canEdit: true, targets: people }); await tick();
  assert.equal(late.page.data.activityParticipantCanEdit, false);
  late.state.canEdit = true; await late.page.loadActivityParticipantConfiguration();
  late.page.closeRuleEditor(); assert.equal(late.writes().length, 0);
  assert.deepEqual(clone(late.page.data.activityParticipantMetadata), {});
  assert.deepEqual(clone(late.page.data.activityParticipantTargets), []);
  assert.equal(late.page.data.activityParticipantCanEdit, false);
  late.page.data.actionCapabilities['venue.activityRules.create'] = false; await late.open();
  assert.equal(late.page.data.ruleEditorVisible, false);
  const changedRole = setup(); let releaseRole;
  changedRole.state.waitMetadata = new Promise(resolve => { releaseRole = resolve; });
  await changedRole.open(); changedRole.state.epoch++;
  releaseRole(changedRole.metadata()); await tick();
  assert.equal(changedRole.page.data.activityParticipantState, 'loading');
  assert.equal(changedRole.page.data.activityParticipantCanEdit, false);

  const hidden = setup(); await hidden.open();
  hidden.page.releaseDialogScrollLock = () => {};
  hidden.page.unbindDialogKeyboard = () => {};
  hidden.page.managementHide();
  assert.deepEqual(clone(hidden.page.data.activityParticipantMetadata), {});
  assert.deepEqual(clone(hidden.page.data.activityParticipantTargets), []);
  assert.equal(hidden.page.data.activityParticipantCanEdit, false);
  assert.equal(hidden.page.data.activityParticipantState, 'unused');

  state.canEdit = true; await first.open('saved-activity');
  const beforeInvalid = first.writes().length;
  page.changeActivityParticipants({ detail: { value: [{ type: 'scope', natureIds: [] }] } });
  await page.saveRule(); assert.equal(first.writes().length, beforeInvalid);
  page.changeActivityParticipants({ detail: { value: people } });
  let releaseSave; state.waitSave = new Promise(resolve => { releaseSave = resolve; }); state.saveFailure = true;
  const saving = page.saveRule(); assert.equal(page.data.ruleSaving, true);
  const draft = JSON.stringify(page.data.ruleForm), writeCount = first.writes().length;
  for (const handler of ['onRuleFormField', 'onCycleTypeChange', 'onToggleWeekDay', 'onToggleMonthDay', 'onYearlyRangeStartMonthChange',
    'onYearlyRangeStartDayChange', 'onYearlyRangeEndMonthChange', 'onYearlyRangeEndDayChange', 'onAddYearlyRange', 'onRemoveYearlyRange',
    'onRangeStartDateChange', 'onRangeEndDateChange', 'onActivityCycleDateChange', 'onActivityCycleTimeChange', 'onActivityPeriodModeTap',
    'onActivityIntervalUnitChange', 'onActivityRepeatField']) page[handler](event({ field: 'name', idx: 0, mode: 'range' }, 'changed'));
  page.closeRuleEditor(); await page.saveRule();
  assert.equal(page.data.ruleEditorVisible, true); assert.equal(JSON.stringify(page.data.ruleForm), draft); assert.equal(first.writes().length, writeCount);
  releaseSave(); await saving;
  assert.equal(page.data.ruleSaving, false); assert.equal(page.data.ruleEditorVisible, true);
  assert.deepEqual(clone(page.data.activityParticipantTargets), people); assert.equal(first.toasts.at(-1), flowCopy.incomplete);
  state.waitSave = null; state.saveFailure = false; await page.saveRule();
  assert.equal(page.data.ruleEditorVisible, false); assert.deepEqual(state.targets, people);
  console.log('PASS 场地活动参会人：真实页面保存读回、未改省略、明确清空、候选失败重试、迟到响应、取消和权限、保存冻结与失败重试');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
