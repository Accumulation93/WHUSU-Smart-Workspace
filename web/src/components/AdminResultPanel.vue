<template>
  <div class="stack result-panel">
    <section class="card stack">
      <span class="section-title">{{ ui.copy_1a5cfb71ab }}</span>
      <div v-if="notice.main" class="stack-tight" role="alert"><span class="notice-line">{{ notice.main }}</span><button type="button" class="btn-quiet" :disabled="loading.main || busy" @click="refresh">{{ personnel.dictionaryRetry }}</button></div>
    </section>
    <section class="card stack-tight"><strong>{{ ui.copy_35fabd21a9 }}</strong><span>{{ activity?.name || ui.copy_79b2d9fea4 }}</span></section>
    <div class="result-summary">
      <section v-for="item in statFields" :key="item[0]" class="card stack-tight"><span class="muted">{{ item[1] }}</span><strong class="stat-value">{{ stats[item[0]] || 0 }}</strong></section>
    </div>
    <section class="card stack">
      <strong>{{ ui.copy_fa119a1829 }}</strong>
      <div class="result-fields">
        <label class="field"><span class="field-label">{{ ui.copy_7ee1272d5b }}</span><select class="field-input" :aria-label="ui.copy_7ee1272d5b" :value="filters.department" :disabled="controlsBlocked" @change="change('department', $event.target.value)"><option :value="all">{{ all }}</option><option v-for="row in departments" :key="row.id" :value="row.name">{{ row.name }}</option></select></label>
        <label class="field"><span class="field-label">{{ ui.copy_c1965e0690 }}</span><select class="field-input" :aria-label="ui.copy_c1965e0690" :value="filters.identity" :disabled="controlsBlocked" @change="change('identity', $event.target.value)"><option :value="all">{{ all }}</option><option v-for="row in identities" :key="row.id" :value="row.name">{{ row.name }}</option></select></label>
        <label class="field"><span class="field-label">{{ ui.copy_303b7a8611 }}</span><select class="field-input" :aria-label="ui.copy_303b7a8611" :value="filters.workGroup" :disabled="controlsBlocked || filters.department === all" @change="change('workGroup', $event.target.value)"><option :value="all">{{ filters.department === all ? messages.copy_5327cd39d0 : all }}</option><option v-for="row in groupOptions" :key="row.id" :value="row.name">{{ row.name }}</option></select></label>
        <label class="field"><span class="field-label">{{ ui.copy_27d5123777 }}</span><select class="field-input" :aria-label="ui.copy_27d5123777" :value="filters.viewMode" :disabled="controlsBlocked" @change="change('viewMode', $event.target.value)"><option value="overview">{{ ui.copy_a6f7e5f124 }}</option><option value="completion">{{ ui.copy_9d954432df }}</option></select></label>
      </div>
      <label class="field"><span class="field-label">{{ ui.copy_caeab5d89c }}</span><select class="field-input" :aria-label="ui.copy_caeab5d89c" :value="filters.sortMode" :disabled="controlsBlocked" @change="change('sortMode', $event.target.value)"><option v-for="item in sorts" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select></label>
      <button type="button" class="btn btn-secondary" :disabled="props.disabled || loading.main || busy" @click="refresh">{{ ui.copy_e15d9ac2ee }}</button>
      <span v-if="loading.main" class="muted" role="status"><AppLoading :text="ui.copy_be942e85d1" /></span>
    </section>
    <template v-if="canExport"><section v-for="item in reports" :key="item[0]" class="card stack"><strong>{{ item[1] }}</strong><button type="button" class="btn btn-secondary" :disabled="blocked || !activity" @click="exportReport = item">{{ item[1] }}</button></section></template>
    <section v-if="filters.viewMode === 'overview'" class="card stack">
      <strong>{{ ui.copy_e29aac1957 }}</strong>
      <div class="result-scroll list">
        <ScoringResultRow v-for="(row, index) in sortedRows" :key="row.targetId || row.id" :member="row" :rank="index + 1" interactive :disabled="blocked" @open="openTarget(row)"><ScoringProgress :submitted="safeSubmitted(row)" :expected="count(row.expectedScorerCount)" inline /></ScoringResultRow>
        <span v-if="!loading.main && !notice.main && !sortedRows.length" class="empty-state">{{ ui.copy_8a479a4213 }}</span>
      </div>
    </section>
    <section v-if="filters.viewMode === 'overview' && state.target" ref="targetPanel" class="card stack">
      <div class="panel-head"><strong>{{ state.target.name }}{{ ui.copy_a859dc349b }} {{ targetRows.length }}</strong><button type="button" class="btn-quiet" :disabled="busy" @click="closeTarget">{{ ui.copy_8ec888d575 }}</button></div>
      <div v-if="notice.target" class="stack-tight" role="alert"><span class="notice-line">{{ notice.target }}</span><button type="button" class="btn-quiet" :disabled="loading.target || busy" @click="retry('target')">{{ personnel.dictionaryRetry }}</button></div>
      <span v-if="loading.target" class="muted"><AppLoading :text="ui.copy_80c4bdb2f5" /></span>
      <div class="result-scroll list">
        <button v-for="row in targetRows" :key="row.scorerKey" type="button" class="list-row result-record" :disabled="blocked || loading.target || !!notice.target || !canView(row)" @click="openDetail(row.recordId)">
          <UiIcon name="user" /><span class="list-row-main stack-tight"><span class="panel-head"><strong>{{ row.scorerName }}</strong><span class="chip" :class="statusClass(row)">{{ row.statusText }}</span></span><span class="row row-wrap"><span v-if="row.departmentText" class="chip chip-blue">{{ row.departmentText }}</span><span v-if="row.identityText" class="chip chip-sky">{{ row.identityText }}</span><span v-if="row.workGroupText" class="chip chip-orange">{{ row.workGroupText }}</span></span><span v-if="row.submittedAt" class="muted">{{ formatListTime(row.submittedAt, row.submittedAtReviewStatus) }}</span></span><UiIcon v-if="canView(row)" name="chevron-right" />
        </button>
        <span v-if="!loading.target && !notice.target && !targetRows.length" class="empty-state">{{ ui.copy_600dad22eb }}</span>
      </div>
    </section>
    <section v-if="filters.viewMode === 'completion'" class="card stack">
      <strong>{{ ui.copy_da7c6bfe5c }}</strong>
      <div class="list"><button v-for="row in sortedBoards" :key="row.groupName" type="button" class="list-row result-board" :class="{ selected: state.department === row.groupName }" :disabled="blocked" @click="openDepartment(row.groupName)"><span class="panel-head"><strong>{{ row.groupName }}</strong><strong class="stat-value">{{ Math.round(rate(row.completedCount, row.memberCount)) }}%</strong></span><ScoringProgress :submitted="count(row.completedCount)" :expected="count(row.memberCount)" count-only /></button></div>
      <span v-if="!loading.main && !notice.main && !sortedBoards.length" class="empty-state">{{ ui.copy_c3d0b2b161 }}</span>
    </section>
    <section v-if="filters.viewMode === 'completion' && state.department" ref="departmentPanel" class="card stack">
      <div class="panel-head"><strong>{{ state.department }}{{ ui.copy_49237813f2 }}</strong><button type="button" class="btn-quiet" :disabled="busy" @click="closeDepartment">{{ ui.copy_8ec888d575 }}</button></div>
      <div v-if="notice.department" class="stack-tight" role="alert"><span class="notice-line">{{ notice.department }}</span><button type="button" class="btn-quiet" :disabled="loading.department || busy" @click="retry('department')">{{ personnel.dictionaryRetry }}</button></div>
      <span v-if="loading.department" class="muted"><AppLoading :text="copy.common.loading" /></span>
      <div class="result-table-head"><strong>{{ ui.copy_b9b9929aee }}</strong><strong>{{ ui.copy_4727505bbd }}</strong><strong>{{ ui.copy_12b44cbb96 }}</strong><strong>{{ ui.copy_8aee737e64 }}</strong></div>
      <button v-for="row in departmentRows" :key="row.scorerKey" type="button" class="list-row result-table-row result-data-row" :disabled="blocked || loading.department || !!notice.department" @click="openScorer(row)">
        <span class="stack-tight"><span class="cell-label">{{ ui.copy_b9b9929aee }}</span><strong>{{ row.scorerName }}</strong></span><span class="stack-tight"><span class="cell-label">{{ ui.copy_4727505bbd }}</span><span>{{ row.detailText }}</span></span><span class="stack-tight"><span class="cell-label">{{ ui.copy_12b44cbb96 }}</span><ScoringProgress :submitted="count(row.submittedCount)" :expected="count(row.expectedCount)" /></span><span class="stack-tight"><span class="cell-label">{{ ui.copy_8aee737e64 }}</span><span class="chip" :class="row.pendingCount ? 'chip-orange' : 'chip-green'">{{ row.statusText }}</span></span>
      </button>
      <span v-if="!loading.department && !notice.department && !departmentRows.length" class="empty-state">{{ ui.copy_9f4c79680e }}</span>
    </section>
    <GlassDialog v-if="state.scorer" :title="messages.copy_abb0a3f46c.replace('{0}', state.scorer.scorerName)" :busy="busy" @close="closeScorer">
      <div class="stack">
        <div v-if="notice.scorer" class="stack-tight" role="alert"><span class="notice-line">{{ notice.scorer }}</span><button type="button" class="btn-quiet" :disabled="loading.scorer || busy" @click="retry('scorer')">{{ personnel.dictionaryRetry }}</button></div>
        <span v-if="loading.scorer" class="muted"><AppLoading :text="copy.common.loading" /></span>
        <div class="scorer-target-head"><strong>{{ ui.copy_00ed459adb }}</strong><strong>{{ ui.copy_4727505bbd }}</strong><strong>{{ ui.copy_8aee737e64 }}</strong></div>
        <button v-for="row in scorerRows" :key="row.targetId" type="button" class="list-row scorer-target-row result-data-row" :disabled="blocked || loading.scorer || !!notice.scorer || row.status !== 'submitted' || !row.recordId" @click="openDetail(row.recordId)"><span class="stack-tight"><span class="cell-label">{{ ui.copy_00ed459adb }}</span><strong>{{ row.targetName }}</strong></span><span class="stack-tight"><span class="cell-label">{{ ui.copy_4727505bbd }}</span><span>{{ row.detailText }}</span></span><span class="stack-tight"><span class="cell-label">{{ ui.copy_8aee737e64 }}</span><span class="chip" :class="statusClass(row)">{{ row.statusText }}</span></span></button>
        <span v-if="!loading.scorer && !notice.scorer && !scorerRows.length" class="empty-state">{{ ui.copy_11ca2ae839 }}</span>
      </div>
    </GlassDialog>
    <GlassDialog v-if="recordId" :title="ui.copy_0e17af2227" :busy="busy" @close="closeDetail">
      <div class="stack">
        <div v-if="notice.detail" class="stack-tight" role="alert"><span class="notice-line">{{ notice.detail }}</span><button type="button" class="btn-quiet" :disabled="loading.detail || busy" @click="readDetail">{{ personnel.dictionaryRetry }}</button></div>
        <span v-if="loading.detail" class="muted"><AppLoading :text="copy.common.loading" /></span>
        <template v-if="detail">
          <section class="list-row stack"><div class="result-fields"><div class="stack-tight"><span class="muted">{{ ui.copy_b9b9929aee }}</span><strong>{{ detail.scorer.name }}</strong></div><div class="stack-tight"><span class="muted">{{ ui.copy_12cd162fda }}</span><strong>{{ detail.target.name }}</strong></div></div><span class="muted">{{ formatDetailTime(detail.submittedAt, detail.submittedAtReviewStatus) }}</span><button v-if="canRevoke" type="button" class="btn btn-secondary" :disabled="blocked || loading.detail || !!notice.detail" @click="revoke">{{ ui.copy_96380cec9a }}</button><span v-if="actionNotice" class="notice-line" role="alert">{{ actionNotice }}</span></section>
          <section v-for="template in detail.templates" :key="template.templateId" class="list-row stack"><strong>{{ template.templateName }}</strong><div class="row row-wrap"><span class="chip chip-blue">{{ ui.copy_4675a7e226 }} {{ template.score }}</span><span class="chip chip-sky">{{ ui.copy_30e235fb56 }} {{ template.weight }}</span><span class="chip chip-green">{{ ui.copy_01fb465b6e }} {{ template.weightedScore }}</span></div><article v-for="question in template.questions" :key="question.questionIndex" class="detail-question stack-tight"><div class="panel-head"><strong>{{ question.question }}</strong><span>{{ question.score }} / {{ question.maxValue }}</span></div><button v-if="question.scoreLabel" type="button" class="btn-quiet" :disabled="busy" :aria-expanded="question.expanded" @click="question.expanded = !question.expanded">{{ question.expanded ? ui.copy_1e28fe0260 : ui.copy_b66760c55a }}</button><span v-if="question.scoreLabel && question.expanded" class="score-label-box preserve-lines">{{ question.scoreLabel }}</span></article></section>
        </template>
      </div>
    </GlassDialog>
    <GlassDialog v-if="exportReport" :title="exportReport[1]" :busy="busy" compact @close="exportReport = null">
      <div class="stack"><span v-if="exportNotice" class="notice-line" role="alert">{{ exportNotice }}</span><button type="button" class="btn btn-secondary" :disabled="busy" @click="download('csv')">{{ messages.copy_7ffcbc33aa }}</button><button type="button" class="btn btn-secondary" :disabled="busy" @click="download('excel')">{{ messages.copy_5503123f4c }}</button></div>
    </GlassDialog>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/resultBehavior.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import copy from '@/locales/zh-CN/index.js';
import GlassDialog from './GlassDialog.vue';
import ScoringResultRow from './ScoringResultRow.vue';
import ScoringProgress from './ScoringProgress.vue';
import UiIcon from './UiIcon.vue';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { formatListTime, formatDetailTime, getSystemTimezoneConfig } from '@/runtime/dateTime.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { downloadTable } from '@/runtime/tableFiles.js';
const props = defineProps({ state: { type: Object, required: true }, profile: Object, disabled: Boolean });
const emit = defineEmits(['busy']);
const state = props.state, filters = state.filters, all = messages.copy_31d4595959;
const activity = ref(null), departments = ref([]), identities = ref([]), groups = ref([]), stats = ref({}), rows = ref([]), boards = ref([]);
const targetRows = ref([]), departmentRows = ref([]), scorerRows = ref([]), recordId = ref(''), detail = ref(null);
const targetPanel = ref(null), departmentPanel = ref(null), busy = ref(false), actionNotice = ref(''), exportReport = ref(null), exportNotice = ref('');
const loading = reactive({ main: false, target: false, department: false, scorer: false, detail: false });
const notice = reactive({ main: '', target: '', department: '', scorer: '', detail: '' });
const seq = { main: 0, target: 0, department: 0, scorer: 0, detail: 0 };
const requests = new Set();
let disposed = false, initialized = false;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
const stamp = channel => scope() + JSON.stringify([activity.value?.id, filters, { target: state.target?.id, department: state.department, scorer: state.scorer?.scorerKey, detail: recordId.value }[channel]]);
const controlsBlocked = computed(() => props.disabled || loading.main || busy.value || !!notice.main || state.pending);
const blocked = computed(() => controlsBlocked.value || Object.values(notice).some(Boolean));
const canExport = computed(() => props.profile?.adminLevel === 'super_admin' || props.profile?.permissions?.['scoring.results_export'] === true);
const canRevoke = computed(() => props.profile?.adminLevel === 'super_admin' || props.profile?.permissions?.['scoring.results_revoke'] === true);
const statFields = [['totalMembers', ui.copy_54f375d40f], ['scoredMembers', ui.copy_4adc175789], ['recordCount', ui.copy_4b11a94d96], ['completedMembers', ui.copy_e067049fe8]];
const sorts = [['score_desc', ui.copy_60c630a885], ['name_asc', ui.copy_99f2be3030], ['department_asc', ui.copy_d379421477], ['workGroup_asc', ui.copy_8438adbb77]];
const reports = [['overview', ui.copy_03f903662b], ['detail', ui.copy_8b73330188], ['completion', ui.copy_779db553f1]];
const count = value => Math.max(0, Math.floor(Number(value) || 0));
const rate = (submitted, expected) => Math.max(0, Math.min(100, expected ? submitted / expected * 100 : 100));
const safeSubmitted = row => count(row.expectedScorerCount) ? Math.min(count(row.expectedScorerCount), count(row.submittedScorerCount)) : count(row.submittedScorerCount);
const canView = row => ['completed', 'inactive'].includes(row.status) && !!row.recordId;
const statusClass = row => ['completed', 'submitted'].includes(row.status) ? 'chip-green' : row.status === 'inactive' ? 'chip-sky' : 'chip-orange';
const groupOptions = computed(() => { const dep = departments.value.find(row => row.name === filters.department); return groups.value.filter(row => row.departmentId === dep?.id || row.departmentName === filters.department); });
const sortedRows = computed(() => rows.value.filter(row => ['department', 'identity', 'workGroup'].every(key => filters[key] === all || (row[key] || '') === filters[key])).slice().sort((a, b) => {
  if (filters.sortMode === 'score_desc') return (Number(b.finalScore) || 0) - (Number(a.finalScore) || 0);
  const key = { name_asc: 'name', department_asc: 'department', workGroup_asc: 'workGroup' }[filters.sortMode] || 'name';
  return String(a[key] || '').localeCompare(String(b[key] || ''), 'zh-CN') || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
}));
const sortedBoards = computed(() => boards.value.slice().sort((a, b) => rate(b.completedCount, b.memberCount) - rate(a.completedCount, a.memberCount) || String(a.groupName).localeCompare(String(b.groupName), 'zh-CN')));
function payload(dataType, extra = {}, withFilters = true) { return { activityId: activity.value.id, timezone: getSystemTimezoneConfig().offset, dataType, ...(withFilters ? { filters: { department: filters.department, identity: filters.identity, workGroup: filters.workGroup } } : {}), ...extra }; }
async function request(name, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const entry = { controller, timer }; requests.add(entry);
  try { return requireSuccess(await callApi(name, data, { signal: controller.signal })); }
  catch (error) { if (!disposed && controller.signal.aborted) throw new Error(copy.errors.networkFailed); throw error; }
  finally { clearTimeout(timer); requests.delete(entry); }
}
async function read(channel, data, apply) {
  const id = ++seq[channel], expected = stamp(channel); loading[channel] = true;
  const current = () => !disposed && id === seq[channel] && expected === stamp(channel);
  try { const result = await request('getScoreResults', data); if (!current()) return false; apply(result); notice[channel] = ''; return true; }
  catch (error) { if (current()) notice[channel] = errorText(error, messages.copy_c59ab1ce4a); return false; }
  finally { if (current()) loading[channel] = false; }
}
function array(value) { if (!Array.isArray(value)) throw new Error(); return value; }
function clearChannel(channel) { seq[channel]++; loading[channel] = false; notice[channel] = ''; }
function closeDetail() { if (busy.value) return; clearChannel('detail'); recordId.value = ''; detail.value = null; actionNotice.value = ''; }
function closeScorer() { if (busy.value) return; closeDetail(); clearChannel('scorer'); state.scorer = null; scorerRows.value = []; }
function closeTarget() { if (busy.value) return; closeDetail(); clearChannel('target'); state.target = null; targetRows.value = []; }
function closeDepartment() { if (busy.value) return; closeScorer(); clearChannel('department'); state.department = ''; departmentRows.value = []; }
async function initialize() {
  const id = ++seq.main, expected = scope(); loading.main = true;
  try {
    const results = await Promise.all(['getCurrentScoreActivity', 'listDepartments', 'listIdentities', 'listWorkGroups'].map(name => request(name, {})));
    if (disposed || id !== seq.main || expected !== scope()) return false;
    const [current, dep, identity, group] = results;
    const nextDepartments = array(dep.departments), nextIdentities = array(identity.identities), nextGroups = array(group.workGroups);
    if (current.activity !== null && (!current.activity?.id || !current.activity.name)) throw new Error();
    if (state.activityId && state.activityId !== current.activity?.id) { state.target = null; state.department = ''; state.scorer = null; rows.value = []; boards.value = []; stats.value = {}; targetRows.value = []; departmentRows.value = []; scorerRows.value = []; recordId.value = ''; detail.value = null; for (const channel of ['target', 'department', 'scorer', 'detail']) clearChannel(channel); }
    state.activityId = current.activity?.id || '';
    activity.value = current.activity; departments.value = nextDepartments; identities.value = nextIdentities; groups.value = nextGroups;
    initialized = true; notice.main = ''; return true;
  } catch (error) { if (!disposed && id === seq.main && expected === scope()) notice.main = errorText(error, messages.copy_c59ab1ce4a); return false; }
  finally { if (!disposed && id === seq.main && expected === scope()) loading.main = false; }
}
async function readMain(nocache = false) {
  if (!activity.value) { rows.value = []; boards.value = []; stats.value = {}; notice.main = ''; state.pending = false; return true; }
  return read('main', payload(filters.viewMode, { nocache }), result => {
    const next = filters.viewMode === 'overview' ? array(result.overviewRows) : array(result.completionBoards?.departments);
    if (!result.stats || typeof result.stats !== 'object') throw new Error();
    if (filters.viewMode === 'overview') rows.value = next.map(row => ({ ...row, finalScore: Number(row.finalScore) || 0 })); else boards.value = next;
    stats.value = result.stats;
  });
}
async function readTarget() {
  if (!state.target || !activity.value) return true;
  return read('target', payload('targetRecords', { targetId: state.target.id }, false), result => { targetRows.value = array(result.targetRecordRows).map(row => ({ ...row, status: row.excludedByRequireAll ? 'inactive' : row.status, departmentText: row.scorerHistoricalAssignmentUnavailable ? messages.historicalAssignmentUnavailable : row.scorerDepartment || messages.copy_0fe86822a1, identityText: row.scorerHistoricalAssignmentUnavailable ? '' : row.scorerIdentityCategory || row.scorerIdentity || messages.copy_ad183b164d, workGroupText: row.scorerHistoricalAssignmentUnavailable ? '' : row.scorerWorkGroup || row.workGroup || '' })); });
}
async function readDepartment() {
  if (!state.department || !activity.value) return true;
  return read('department', payload('completion', { departmentName: state.department }), result => { departmentRows.value = array(result.scorerCompletionRows).map(row => { const pendingCount = Math.max(count(row.expectedCount) - count(row.submittedCount), 0); return { ...row, pendingCount, detailText: [row.identity, row.workGroup].filter(Boolean).join(' / ') || messages.copy_2b4df49497, statusText: pendingCount ? messages.copy_8d112a0e5f : messages.copy_2220286f1c }; }); });
}
async function readScorer() {
  if (!state.scorer || !activity.value) return true;
  return read('scorer', payload('scorerTargets', { scorerKey: state.scorer.scorerKey }, false), result => { scorerRows.value = array(result.scorerTargetRows).map(row => ({ ...row, detailText: row.targetHistoricalAssignmentUnavailable ? messages.historicalAssignmentUnavailable : [row.targetDepartment, row.targetIdentityCategory || row.targetIdentity, row.targetWorkGroup].filter(Boolean).join(' / ') || messages.copy_2b4df49497 })); });
}
async function readDetail() {
  if (!recordId.value || !activity.value) return false;
  return read('detail', payload('recordDetail', { recordId: recordId.value }, false), result => { const value = result.recordDetail; if (value?.recordId !== recordId.value || !value.scorer || !value.target) throw new Error(); detail.value = { ...value, templates: array(value.templates).map(template => ({ ...template, questions: array(template.questions).map(question => ({ ...question, expanded: false })) })) }; });
}
async function refresh() {
  if (busy.value || loading.main || props.disabled) return;
  if (!await initialize()) return;
  const ok = await readMain(true); if (!ok || disposed) return;
  const target = await readTarget(), department = await readDepartment(), scorer = await readScorer();
  if (!disposed && target && department && scorer) state.pending = false;
}
async function retry(channel) { if (state.pending) return refresh(); return { target: readTarget, department: readDepartment, scorer: readScorer }[channel]?.(); }
async function change(key, value) {
  if (controlsBlocked.value) return; closeTarget(); closeDepartment(); filters[key] = value;
  if (key === 'department') filters.workGroup = all;
  await readMain();
}
async function openTarget(row) {
  if (blocked.value) return; closeTarget(); state.target = { id: row.targetId || row.id, name: row.name }; await readTarget(); await nextTick(); if (!disposed) targetPanel.value?.scrollIntoView({ block: 'nearest' });
}
async function openDepartment(name) {
  if (blocked.value) return; if (state.department === name) { closeDepartment(); return; } closeDepartment(); state.department = name; await readDepartment(); await nextTick(); if (!disposed) departmentPanel.value?.scrollIntoView({ block: 'nearest' });
}
async function openScorer(row) { if (blocked.value) return; closeScorer(); state.scorer = { scorerKey: row.scorerKey, scorerName: row.scorerName }; await readScorer(); }
async function openDetail(id) { if (blocked.value || !id) return; closeDetail(); recordId.value = id; await readDetail(); }
async function download(format) {
  if (busy.value || blocked.value || !canExport.value || !activity.value || !exportReport.value) return;
  const expected = scope(), report = exportReport.value[0]; busy.value = true; exportNotice.value = '';
  try {
    const { dataType, nocache, ...data } = payload('', { reportType: report, format });
    const result = await request('exportScoreResults', data);
    if (disposed || expected !== scope()) return;
    if (typeof result.fileContent !== 'string' || !result.fileContent || typeof result.fileName !== 'string' || !result.fileName || !['xlsx', 'csv'].includes(result.extension)) throw new Error();
    downloadTable(result.fileContent, result.fileName, result.extension); exportReport.value = null;
  } catch (error) { if (!disposed && expected === scope()) exportNotice.value = errorText(error, messages.copy_2b61466286); }
  finally { if (!disposed && expected === scope()) busy.value = false; }
}
async function revoke() {
  if (blocked.value || loading.detail || notice.detail || !canRevoke.value || !detail.value?.recordId) return;
  const expected = scope(), target = { id: detail.value.recordId, scorer: detail.value.scorer.name, name: detail.value.target.name };
  const current = () => !disposed && expected === scope(); busy.value = true; actionNotice.value = '';
  try {
    const accepted = await confirmAction({ title: messages.copy_a000713b84, body: target.scorer + ' → ' + target.name + '\n' + messages.copy_7647264e2a, confirmText: messages.copy_d6c748ac95, cancelText: messages.copy_4b213fd88a, danger: true });
    if (!accepted || !current() || props.disabled || !canRevoke.value) return;
    await request('revokeScoreRecord', { recordId: target.id }); if (!current()) return;
    state.pending = true; recordId.value = ''; detail.value = null; clearChannel('detail');
    const main = await readMain(true), targetOk = await readTarget(), department = await readDepartment(), scorer = await readScorer();
    if (current()) { if (main && targetOk && department && scorer) state.pending = false; showToast(messages.copy_d08849e510); }
  } catch (error) { if (current()) actionNotice.value = errorText(error, messages.copy_8351ecc192); }
  finally { if (current()) busy.value = false; }
}
watch(busy, value => emit('busy', value), { flush: 'sync' });
watch(() => props.disabled, value => { if (!value && !initialized) refresh(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; for (const channel of Object.keys(seq)) seq[channel]++; for (const entry of requests) { clearTimeout(entry.timer); entry.controller.abort(); } requests.clear(); emit('busy', false); });
</script>
<style scoped>
.result-summary, .result-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-field-gap); width: 100%; }
.stat-value { font-size: var(--ui-type-dialog); color: var(--ui-blue-700); }
.result-scroll { max-height: var(--ui-result-list-max-height); overflow-y: auto; overscroll-behavior: contain; }
.result-record, .result-board, .result-data-row { width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.result-record:disabled, .result-data-row:disabled { cursor: default; }
.result-board { flex-direction: column; align-items: stretch; }
.selected { border-color: var(--ui-line-blue); background: var(--ui-filter-bg); }
.panel-head { gap: var(--ui-inline-gap); margin: 0; min-width: 0; overflow-wrap: anywhere; }
.panel-head > .btn-quiet, .panel-head > .chip { flex: none; }
.result-table-head, .scorer-target-head { display: none; }
.result-data-row { display: block; }
.result-data-row > .stack-tight { display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); gap: var(--ui-field-gap); width: 100%; align-items: center; text-align: right; padding-block: var(--ui-field-gap); border-bottom: var(--ui-list-border); }
.result-data-row > .stack-tight:last-child { border-bottom: 0; }
.result-data-row .cell-label { text-align: left; }
.result-data-row .chip { justify-self: end; align-self: flex-start; }
.cell-label { font-size: var(--ui-type-caption); color: var(--ui-text-muted); }
.detail-question { width: 100%; border-top: var(--ui-list-border); padding-top: var(--ui-field-gap); }
.preserve-lines { white-space: pre-wrap; }
.score-label-box { padding: var(--ui-list-padding-y) var(--ui-list-padding-x); border-radius: var(--ui-compact-radius); color: var(--ui-text-body); background: var(--ui-result-label-bg); border: var(--ui-result-label-border); font-size: var(--ui-type-meta); line-height: var(--ui-leading-relaxed); }
.list-row.stack { align-items: stretch; }
.list-row.stack > .btn-secondary { align-self: flex-end; width: auto; min-width: var(--ui-result-revoke-min-width); min-height: var(--ui-compact-height); padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x); border-radius: var(--ui-compact-radius); font-size: var(--ui-type-meta); color: var(--ui-result-revoke-text); background: var(--ui-result-revoke-bg); border: var(--ui-result-revoke-border); box-shadow: var(--ui-result-revoke-shadow); }
.detail-question > .btn-quiet { align-self: flex-start; width: auto; font-size: var(--ui-type-caption); }
.detail-question .panel-head > span { flex: none; padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x); border-radius: var(--ui-compact-radius); background: var(--ui-field-bg); border: var(--ui-field-border); color: var(--ui-blue-700); font-weight: 800; }
.result-record .list-row-main { min-width: 0; overflow-wrap: anywhere; }
.result-fields .field-input { min-width: 0; width: 100%; }
section { scroll-margin-top: var(--ui-navbar-height); }
@media (min-width: 520px) {
  .result-table-head, .result-table-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1.2fr) minmax(0, 0.7fr); gap: var(--ui-inline-gap); }
  .result-table-head { padding-inline: var(--ui-list-padding-x); }
  .scorer-target-head, .scorer-target-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr) minmax(0, 0.7fr); gap: var(--ui-inline-gap); }
  .scorer-target-head { padding-inline: var(--ui-list-padding-x); }
  .result-data-row > .stack-tight { display: flex; flex-direction: column; align-items: stretch; border: 0; padding: 0; text-align: left; }
  .result-data-row .cell-label { display: none; }
}
</style>
