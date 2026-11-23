<template>
    <div class="tabs" :class="secondary ? 'workspace-secondary-tabs' : 'workspace-primary-tabs'" role="tablist">
      <button v-for="item in tabs" :key="item.key" type="button" role="tab" class="tab" :class="{ 'tab-active': tab === item.key }"
        :aria-selected="tab === item.key" :disabled="saving" @click="selectTab(item.key)">{{ item.label }}</button>
    </div>
  <section v-if="discoveryError" class="card row row-wrap">
    <p class="notice-line">{{ discoveryError }}</p><button type="button" class="btn-quiet" :disabled="loading" @click="discover">{{ home.reloadProfile }}</button>
  </section>
  <slot v-if="tab === 'scoring'" name="scoring" />
  <div v-else class="stack publication-panel">
    <section v-if="panelError" class="card row row-wrap">
      <p class="notice-line">{{ panelError }}</p><button type="button" class="btn-quiet" :disabled="loading || saving" @click="refresh">{{ home.reloadProfile }}</button>
    </section>
    <section v-if="tab === 'meritList' && savedMeritRefreshFailed" class="card row row-wrap">
      <p class="notice-line" role="status">{{ award.savedNotRefreshed }}</p><button type="button" class="btn-quiet" :disabled="meritReloading" @click="refreshMeritAfterSave">{{ home.reloadProfile }}</button>
    </section>
    <section v-if="loading && !panelData" class="card empty-state"><AppLoading :text="home.loadingDots" /></section>
    <template v-if="tab === 'results' && results?.status === 'success'">
      <section v-if="!memberCount" class="card empty-state">{{ home.noVisibleResults }}</section>
      <section v-else class="card stack results-panel-card">
        <div class="info-head"><span class="section-title">{{ home.scoringResults }}</span><span class="chip">{{ home.totalPrefix }} {{ memberCount }} {{ home.personSuffix }}</span></div>
        <div class="publication-stats">
          <div class="publication-stat"><strong>{{ publicationStats.count }}</strong><span>{{ home.publicationCount }}</span></div>
          <template v-if="displayMode !== 'grade'">
            <div class="publication-stat"><strong>{{ publicationStats.max }}</strong><span>{{ home.maxScore }}</span></div>
            <div class="publication-stat"><strong>{{ publicationStats.average }}</strong><span>{{ home.averageScore }}</span></div>
          </template>
        </div>
        <div v-if="displayMode === 'grade' && !receivingResults" class="row row-wrap">
          <button v-for="item in grades" :key="item.grade" type="button" class="btn-quiet" :class="{ 'chip-blue': filters.grade === item.grade }"
            :aria-pressed="filters.grade === item.grade" @click="toggleFilter('grade', item.grade)">{{ item.grade }} {{ item.count }}{{ home.personSuffix }}</button>
        </div>
        <div v-if="!receivingResults" class="stack result-filters">
          <input v-model="filters.search" class="field-input" :placeholder="home.resultSearchPlaceholder" :aria-label="home.resultSearchPlaceholder" />
          <span class="field-label">{{ home.filter }}</span>
          <div v-for="field in filterFields" :key="field.key" class="publication-filter-row">
            <span class="field-label">{{ field.label }}</span>
            <div class="publication-filter-scroll">
              <button type="button" class="btn-quiet" :aria-pressed="!filters[field.key]" @click="filters[field.key] = ''">{{ home.all }}</button>
              <button v-for="value in options(field.key)" :key="value" type="button" class="btn-quiet" :aria-pressed="filters[field.key] === value"
                @click="toggleFilter(field.key, value)">{{ value }}</button>
            </div>
          </div>
          <button v-if="Object.values(filters).some(Boolean)" type="button" class="btn-quiet" @click="clearFilters">{{ home.clearAllFilters }}</button>
        </div>
        <div v-for="group in visibleGroups" :id="'publication-group-' + group.clauseId" :key="group.clauseId" class="publication-group">
          <button type="button" class="publication-group-head" :aria-expanded="expanded === group.clauseId || filteredGroups.length === 1"
            @click="expanded = expanded === group.clauseId ? '' : group.clauseId">
            <span class="publication-group-label">{{ group.groupLabel }}</span>
            <span v-if="group.identityLabel" class="chip chip-sky">{{ group.identityLabel }}</span>
            <span class="chip" :class="group.displayMode === 'grade' ? 'chip-orange' : 'chip-blue'">{{ group.displayMode === 'grade' ? home.grade : home.score }}</span>
            <span class="muted">{{ group.memberCount }}{{ home.personSuffix }}</span><span>{{ expanded === group.clauseId ? '▲' : '▼' }}</span>
          </button>
          <div v-if="expanded === group.clauseId || filteredGroups.length === 1" class="stack publication-group-body">
            <ScoringResultRow v-for="member in group.members" :key="member.assignmentId || member.id || member.rank" :member="member" :rank="member.rank" :mode="group.displayMode" />
            <AppLoading v-if="group.awaitingPage && !resultsError" :text="home.loadingDots" />
            <div v-if="group.hasPrevious || group.hasNext" class="row row-wrap">
              <button class="btn-quiet" type="button" :disabled="!group.hasPrevious" @click="changeResultPage(group, -1)">{{ calendarCopy.previous }}</button>
              <button class="btn-quiet" type="button" :disabled="!group.hasNext || group.awaitingPage" @click="changeResultPage(group, 1)">{{ calendarCopy.next }}</button>
            </div>
          </div>
        </div>
        <div v-if="!groups.length" class="stack">
          <ScoringResultRow v-for="(member, index) in filteredMembers" :key="member.assignmentId || member.id || index" :member="member" :rank="index + 1" :mode="displayMode" />
        </div>
        <p v-if="!filteredMembers.length" class="empty-state">{{ home.noMatchingResults }}</p>
      </section>
    </template>
    <template v-if="tab === 'meritList' && merit?.status === 'success' && hasMerit">
      <section class="section-control-card stack">
        <div class="info-head"><span class="section-title">{{ home.meritList }}</span><span class="chip">{{ home.totalPrefix }} {{ meritGroups.length }} {{ home.groupSuffix }}</span></div>
        <div class="publication-stats">
          <div class="publication-stat"><strong>{{ meritGroups.length }}</strong><span>{{ home.meritGroup }}</span></div>
          <div class="publication-stat merit-saved-stat"><strong>{{ meritSummary.savedCount }}</strong><span>{{ home.designatedCount }}</span><span v-if="meritSummary.requiredCount">{{ meritSummary.requiredCount }}</span></div>
          <div class="publication-stat"><strong>{{ meritSummary.departmentCount }}</strong><span>{{ home.involvedDepartments }}</span></div>
        </div>
      </section>
      <section v-for="group in meritGroups" :key="group.key" class="card stack merit-group">
        <div class="row row-wrap merit-group-head"><span class="chip chip-blue">{{ group.label }}</span>
          <span v-if="group.quota" class="muted">{{ group.quota }}</span>
          <button v-if="merit.canDesignate === true && group.clauses.length" type="button" class="btn-quiet" :disabled="saving || meritReloading || savedMeritRefreshFailed || !!meritError || !!discoveryError" @click="openPicker(group)">{{ home.edit }}</button>
        </div>
        <div class="row row-wrap merit-group-facts">
          <span class="muted">{{ group.savedCount }}</span><span v-if="group.overCount" class="merit-group-over">{{ group.overCount }}</span>
        </div>
        <div v-for="member in group.members" :key="member.id" class="list-row person-summary-row merit-member">
          <div class="info-head"><strong><PersonLink :name="member.name" :assignment-id="member.targetAssignmentId || member.assignmentId" :hr-id="member.targetHrId" /></strong><span class="chip chip-blue">{{ member.identity }}</span></div>
          <span class="muted">{{ [member.department, member.workGroup].filter(Boolean).join(' · ') }}</span>
        </div>
        <p v-if="!group.members.length" class="empty-state">{{ home.noDesignatedMember }}</p>
      </section>
    </template>
  </div>
  <PersonnelPicker v-if="picker" :title="home.designateMeritList" :options="picker.options" :value="picker.selected" :busy="saving"
    :confirm-disabled="saveUnknown !== null" emit-selection-change @cancel="picker = null" @confirm="saveDesignations" @selectionchange="clearSaveError">
    <template #default="{ selectedCount }">
      <p>{{ picker.quota }}</p><p v-if="saveError || selectionNotice(selectedCount)" class="notice-line" role="status">{{ saveError || selectionNotice(selectedCount) }}</p>
      <button v-if="saveUnknown !== null" type="button" class="btn-quiet" :disabled="meritReloading" @click="refreshMeritAfterSave">{{ home.reloadProfile }}</button>
    </template>
    <template v-if="validationAttempt" #footerFeedback>
      <p :key="validationAttempt.id" class="notice-line" role="alert">{{ validationAttempt.message }}</p>
    </template>
  </PersonnelPicker>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import PersonnelPicker from './PersonnelPicker.vue';
import ScoringResultRow from './ScoringResultRow.vue';
import homeCopy from '@/locales/zh-CN/shared/home.js';
import publicationCopy from '@/locales/zh-CN/shared/scoringPublication.js';
import calendarCopy from '@/locales/zh-CN/shared/calendar.js';
import publicationView from '@/shared/scoringPublicationView.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { showToast } from '@/runtime/notify.js';
defineProps({ secondary: Boolean });
const home = homeCopy.text;
const award = publicationCopy.awardSelection;
const tab = ref('scoring');
const activityId = ref('');
const results = ref(null);
const merit = ref(null);
const loading = ref(true);
const discoveryError = ref('');
const resultsError = ref('');
const meritError = ref('');
const saving = ref(false);
const meritReloading = ref(false);
const savedMeritRefreshFailed = ref(false);
const picker = ref(null);
const saveError = ref('');
const saveUnknown = ref(null);
const validationAttempt = ref(null);
const expanded = ref('');
const filters = reactive({ search: '', identity: '', department: '', workGroup: '', grade: '' });
const groupPages = ref({});
let active = false;
let generation = 0;
let meritGeneration = 0;
let meritReadGeneration = 0;
let validationSequence = 0;
const scope = () => [session.user?.id, session.context?.organizationId, session.context?.contextId].join('|');
const hasMerit = computed(() => merit.value?.canDesignate === true || merit.value?.canViewMeritList === true);
const tabs = computed(() => [
  { key: 'scoring', label: home.scoring },
  ...(loading.value || resultsError.value || results.value?.status === 'success' ? [{ key: 'results', label: home.results }] : []),
  ...(loading.value || meritError.value || hasMerit.value ? [{ key: 'meritList', label: home.meritList }] : [])
]);
const panelError = computed(() => tab.value === 'results' ? resultsError.value : meritError.value);
const panelData = computed(() => tab.value === 'results' ? results.value : merit.value);
const displayMode = computed(() => results.value?.displayMode || 'score');
const sorted = rows => rows.map(item => ({ ...item, sortScore: typeof item.sortScore === 'number' ? item.sortScore : parseFloat(item.finalScore) || 0 }))
  .sort((a, b) => b.sortScore - a.sortScore);
const resultMembers = (rows, mode) => {
  const visible = rows.map(publicationView.memberView);
  return mode === 'grade' ? visible : sorted(visible);
};
const groups = computed(() => (results.value?.groups || []).map(group => ({ ...group,
  groupLabel: publicationView.groupTitle(group, home), identityLabel: publicationView.groupIdentity(group),
  members: resultMembers(group.members || [], group.displayMode) })));
const members = computed(() => groups.value.length ? groups.value.flatMap(group => group.members)
  : resultMembers(results.value?.results || [], displayMode.value));
const memberCount = computed(() => results.value?.page?.total ?? members.value.length);
const receivingResults = computed(() => Boolean(results.value?.page?.next));
function matches(member) {
  return ['identity', 'department', 'workGroup'].every(key => !filters[key] || member[key] === filters[key])
    && (!filters.grade || (member.grade || home.unrated) === filters.grade)
    && ['name', 'identity', 'department', 'workGroup'].some(key => String(member[key] || '').toLowerCase().includes(filters.search.trim().toLowerCase()));
}
const filteredMembers = computed(() => members.value.filter(matches));
const filteredGroups = computed(() => Object.values(filters).some(Boolean) ? groups.value.map(group => {
  const rows = group.members.filter(matches);
  return { ...group, members: rows, memberCount: rows.length };
}).filter(group => group.memberCount) : groups.value);
const visibleGroups = computed(() => filteredGroups.value.map(group => publicationView.resultPage(group, groupPages.value[group.clauseId])));
watch(filters, () => { groupPages.value = {}; });
const filterFields = [{ key: 'identity', label: home.identity }, { key: 'department', label: home.department }, { key: 'workGroup', label: home.workGroup }];
const options = key => [...new Set(members.value.map(member => member[key]).filter(Boolean))].sort();
const grades = computed(() => {
  const counts = new Map();
  for (const member of members.value) { const grade = member.grade || home.unrated; counts.set(grade, (counts.get(grade) || 0) + 1); }
  return Array.from(counts, ([grade, count]) => ({ grade, count }));
});
const scoreStats = computed(() => {
  if (!filteredMembers.value.length || displayMode.value === 'grade'
    || filteredGroups.value.some(group => group.displayMode === 'grade') || filteredMembers.value.some(member => member.grade)) {
    return { max: '--', average: '--' };
  }
  const scores = filteredMembers.value.map(member => parseFloat(member.finalScore) || 0);
  return { max: scores.reduce((max, score) => Math.max(max, score), -Infinity).toFixed(1), average: (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1) };
});
const publicationStats = computed(() => {
  const stats = results.value?.page?.stats;
  if (stats && !Object.values(filters).some(Boolean)) return { count: stats.count, max: stats.maxScore, average: stats.avgScore };
  return { count: filteredMembers.value.length, ...scoreStats.value };
});
const meritGroups = computed(() => publicationView.awardGroups(merit.value || {}, homeCopy, award));
const meritSummary = computed(() => publicationView.awardSummary(meritGroups.value, merit.value?.meritList || [], homeCopy));
function clearFilters() { for (const key of Object.keys(filters)) filters[key] = ''; }
function toggleFilter(key, value) { filters[key] = filters[key] === value ? '' : value; }
async function changeResultPage(group, step) {
  groupPages.value[group.clauseId] = group.page + step;
  await nextTick();
  document.getElementById('publication-group-' + group.clauseId)?.scrollIntoView({ block: 'start' });
}
function selectTab(key) { if (!saving.value) tab.value = key; }
function normalizeTab() { if (!tabs.value.some(item => item.key === tab.value)) tab.value = 'scoring'; }
async function discover() {
  const request = ++generation;
  const expected = scope();
  const current = () => active && request === generation && expected === scope();
  loading.value = true;
  try {
    const response = requireSuccess(await callApi('getLatestPublishedScoreActivity', {}));
    if (!current()) return;
    if (!Object.hasOwn(response, 'activity')) throw new Error();
    const id = response.activity?.id || '';
    if (id !== activityId.value) { results.value = null; merit.value = null; savedMeritRefreshFailed.value = false; clearFilters(); expanded.value = ''; }
    activityId.value = id; discoveryError.value = ''; resultsError.value = ''; meritError.value = '';
    if (id) { await refresh(); return; }
  } catch (error) {
    if (current()) discoveryError.value = errorText(error, copy.scoring.loadFailed);
  } finally {
    if (current()) { loading.value = false; normalizeTab(); }
  }
}
async function refresh() {
  if (!activityId.value) return;
  const request = ++generation;
  const expected = scope();
  const id = activityId.value;
  const current = () => active && request === generation && expected === scope() && id === activityId.value;
  loading.value = true;
  await Promise.allSettled([
    ['getPublicResults', results, resultsError], ['getPublicMeritList', merit, meritError]
  ].map(async ([name, value, notice]) => {
    try {
      const isResults = name === 'getPublicResults';
      let response = await callApi(name, isResults ? { activityId: id, batch: true } : { activityId: id });
      if (!current()) return;
      if (!['no_permission', 'not_published'].includes(response.status)) requireSuccess(response);
      if (response.status === 'success' && (name === 'getPublicResults' ? !Array.isArray(response.groups) && !Array.isArray(response.results) : !Array.isArray(response.meritList))) throw new Error();
      value.value = response; notice.value = '';
      if (!isResults) savedMeritRefreshFailed.value = false;
      if (isResults) groupPages.value = {};
      while (isResults && response.page?.next) {
        const next = await callApi(name, { activityId: id, batch: true, cursor: response.page.next });
        if (!current()) return;
        if (['no_permission', 'not_published'].includes(next.status)) { value.value = next; break; }
        requireSuccess(next);
        if (next.page && !next.page.offset) { groupPages.value = {}; clearFilters(); }
        response = publicationView.appendResultBatch(response, next);
        value.value = response;
      }
    } catch (error) {
      if (!current()) return;
      if (error.status === 'forbidden' || error.status === 'no_permission') {
        value.value = { status: 'no_permission' };
        notice.value = '';
      } else {
        notice.value = errorText(error, copy.scoring.loadFailed);
      }
    }
  }));
  if (current()) { loading.value = false; normalizeTab(); }
}
function openPicker(group) {
  if (saving.value || meritReloading.value || savedMeritRefreshFailed.value || meritError.value || discoveryError.value || merit.value?.canDesignate !== true) return;
  picker.value = { ...group, ...publicationView.awardPicker(group, merit.value.designationCandidates || []), publicationId: merit.value.publicationId };
  saveError.value = '';
  saveUnknown.value = null;
  validationAttempt.value = null;
}
function selectionNotice(count) { return publicationView.awardSelectionNotice(picker.value, count, award); }
function clearSaveError() {
  validationAttempt.value = null;
  if (saveUnknown.value === null) saveError.value = '';
}
async function refreshMeritAfterSave() {
  if (meritReloading.value || !activityId.value) return;
  const expected = scope();
  const id = activityId.value;
  const request = ++meritReadGeneration;
  const current = () => active && expected === scope() && id === activityId.value && request === meritReadGeneration;
  const unknown = saveUnknown.value;
  const editor = picker.value;
  meritReloading.value = true;
  try {
    const response = await callApi('getPublicMeritList', { activityId: id });
    if (!current()) return;
    if (!['no_permission', 'not_published'].includes(response.status)) requireSuccess(response);
    if (response.status === 'success' && !Array.isArray(response.meritList)) throw new Error();
    merit.value = response;
    meritError.value = '';
    savedMeritRefreshFailed.value = false;
    if (unknown && editor && editor === picker.value) {
      const group = meritGroups.value.find(item => item.key === editor.key);
      if (!group || response.canDesignate !== true || response.publicationId !== editor.publicationId) picker.value = null;
      else if (publicationView.awardSavedMatches(group, unknown)) {
        picker.value = null;
        showToast(award.saveSuccess);
      } else {
        Object.assign(editor, group, { clauseIds: group.clauses.map(clause => clause.id) });
        saveError.value = award.savedListDiffers;
      }
      saveUnknown.value = null;
    }
    normalizeTab();
  } catch (error) {
    if (!current()) return;
    if (['forbidden', 'no_permission'].includes(error.status)) {
      merit.value = { status: 'no_permission' };
      savedMeritRefreshFailed.value = false;
      picker.value = null;
      saveUnknown.value = null;
      normalizeTab();
    } else if (!unknown) savedMeritRefreshFailed.value = true;
  } finally { if (current()) meritReloading.value = false; }
}
async function saveDesignations(selected) {
  const editor = picker.value;
  if (saving.value || saveUnknown.value !== null || !editor?.publicationId) return;
  const designationAssignmentIds = [...new Set(selected.map(item => item.assignmentId))];
  const mismatch = selectionNotice(designationAssignmentIds.length);
  if (mismatch) {
    saveError.value = '';
    validationAttempt.value = { id: ++validationSequence, message: mismatch };
    showToast(mismatch);
    return;
  }
  const expected = scope();
  const id = activityId.value;
  const request = ++meritGeneration;
  const current = () => active && expected === scope() && id === activityId.value && request === meritGeneration;
  const { clauseIds, publicationId } = editor;
  saving.value = true;
  try {
    const result = await callApi('submitMeritListDesignations', { clauseIds, clauseId: clauseIds[0], publicationId, designationAssignmentIds });
    if (!current()) return;
    if (result.status !== 'success') { saveError.value = publicationView.awardSaveNotice(result, editor, designationAssignmentIds.length, award); return; }
    picker.value = null;
    showToast(award.saveSuccess);
    await refreshMeritAfterSave();
  } catch (error) {
    if (current() && !error.silent) {
      if (publicationView.awardSaveIsUnknown(error)) {
        saveUnknown.value = designationAssignmentIds;
        saveError.value = award.saveResultUnknown;
      } else saveError.value = publicationView.awardSaveNotice(error, editor, designationAssignmentIds.length, award);
    }
  }
  finally { if (current()) saving.value = false; }
}
function clearMeritEditor() {
  meritGeneration++;
  meritReadGeneration++;
  picker.value = null;
  saveUnknown.value = null;
  validationAttempt.value = null;
  saving.value = false;
  meritReloading.value = false;
}
watch(scope, () => {
  clearMeritEditor();
  results.value = null;
  merit.value = null;
  activityId.value = '';
  if (active) discover();
});
onBeforeRouteLeave(() => !saving.value);
onActivated(() => { active = true; discover(); });
onDeactivated(() => { active = false; generation++; clearMeritEditor(); });
onBeforeUnmount(() => { active = false; generation++; clearMeritEditor(); results.value = null; merit.value = null; });
</script>

<style scoped>
.publication-panel { min-width: 0; }
.publication-stats { display: flex; justify-content: space-around; gap: var(--ui-list-gap); }
.publication-stat { display: flex; flex-direction: column; align-items: center; text-align: center; min-width: 0; }
.publication-stat strong { font-size: var(--ui-type-page); color: var(--ui-blue-700); }
.publication-stat span { color: var(--ui-text-muted); font-size: var(--ui-type-meta); }
.publication-filter-row { display: flex; align-items: center; gap: var(--ui-inline-gap); min-width: 0; }
.publication-filter-row > .field-label { flex: none; }
.publication-filter-scroll { display: flex; gap: var(--ui-inline-gap); overflow-x: auto; min-width: 0; }
.publication-filter-scroll > button { flex: none; }
.publication-filter-scroll > button[aria-pressed="true"] { color: var(--ui-chip-blue-text); background: var(--ui-chip-blue-bg); border-color: var(--ui-blue-700); }
.publication-group { border: var(--ui-card-border); border-radius: var(--ui-card-radius); background: var(--ui-card-bg); box-shadow: var(--ui-card-shadow); }
.publication-group-head { width: 100%; display: flex; align-items: center; gap: var(--ui-inline-gap); padding: var(--ui-list-padding-y) var(--ui-list-padding-x); color: var(--ui-text); font: inherit; border: 0; border-radius: var(--ui-card-radius); background: transparent; cursor: pointer; text-align: left; }
.publication-group-label { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 700; }
.publication-group-head > .chip, .publication-group-head > .muted { flex: none; }
.publication-group-body { padding: 0 var(--ui-inline-gap) var(--ui-list-padding-y); }
.merit-group-head > button { margin-left: auto; }
.merit-group-facts { font-size: var(--ui-type-meta); }
.merit-group-over { color: var(--ui-chip-orange-text); }
</style>
