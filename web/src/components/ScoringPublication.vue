<template>
  <section class="section-control-card">
    <div class="tabs" role="tablist">
      <button v-for="item in tabs" :key="item.key" type="button" role="tab" class="tab" :class="{ 'tab-active': tab === item.key }"
        :aria-selected="tab === item.key" :disabled="saving" @click="selectTab(item.key)">{{ item.label }}</button>
    </div>
  </section>
  <section v-if="discoveryError" class="card row row-wrap">
    <p class="notice-line">{{ discoveryError }}</p><button type="button" class="btn-quiet" :disabled="loading" @click="discover">{{ home.reloadProfile }}</button>
  </section>
  <slot v-if="tab === 'scoring'" name="scoring" />
  <div v-else class="stack publication-panel">
    <section v-if="panelError" class="card row row-wrap">
      <p class="notice-line">{{ panelError }}</p><button type="button" class="btn-quiet" :disabled="loading || saving" @click="refresh">{{ home.reloadProfile }}</button>
    </section>
    <section v-if="loading && !panelData" class="card empty-state">{{ home.loadingDots }}</section>
    <template v-if="tab === 'results' && results?.status === 'success'">
      <section v-if="!members.length" class="card empty-state">{{ home.noVisibleResults }}</section>
      <section v-else class="card stack results-panel-card">
        <div class="info-head"><span class="section-title">{{ home.scoringResults }}</span><span class="chip">{{ home.totalPrefix }} {{ members.length }} {{ home.personSuffix }}</span></div>
        <div class="publication-stats">
          <div class="publication-stat"><strong>{{ filteredMembers.length }}</strong><span>{{ home.publicationCount }}</span></div>
          <template v-if="displayMode !== 'grade'">
            <div class="publication-stat"><strong>{{ scoreStats.max }}</strong><span>{{ home.maxScore }}</span></div>
            <div class="publication-stat"><strong>{{ scoreStats.average }}</strong><span>{{ home.averageScore }}</span></div>
          </template>
        </div>
        <div v-if="displayMode === 'grade'" class="row row-wrap">
          <button v-for="item in grades" :key="item.grade" type="button" class="btn-quiet" :class="{ 'chip-blue': filters.grade === item.grade }"
            :aria-pressed="filters.grade === item.grade" @click="toggleFilter('grade', item.grade)">{{ item.grade }} {{ item.count }}{{ home.personSuffix }}</button>
        </div>
        <div class="stack result-filters">
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
        <div v-for="group in filteredGroups" :key="group.clauseId" class="publication-group">
          <button type="button" class="publication-group-head" :aria-expanded="expanded === group.clauseId || filteredGroups.length === 1"
            @click="expanded = expanded === group.clauseId ? '' : group.clauseId">
            <span class="publication-group-label">{{ group.groupLabel }}</span>
            <span class="chip" :class="group.displayMode === 'grade' ? 'chip-orange' : 'chip-blue'">{{ group.displayMode === 'grade' ? home.grade : home.score }}</span>
            <span class="muted">{{ group.members.length }}{{ home.personSuffix }}</span><span>{{ expanded === group.clauseId ? '▲' : '▼' }}</span>
          </button>
          <div v-if="expanded === group.clauseId || filteredGroups.length === 1" class="stack publication-group-body">
            <ScoringResultRow v-for="(member, index) in group.members" :key="member.assignmentId || member.id || index" :member="member" :rank="index + 1" :mode="group.displayMode" />
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
          <div class="publication-stat"><strong>{{ merit.meritList.length }}</strong><span>{{ home.designatedCount }}</span></div>
          <div class="publication-stat"><strong>{{ departmentCount || meritGroups.length }}</strong><span>{{ home.involvedDepartments }}</span></div>
        </div>
      </section>
      <section v-for="group in meritGroups" :key="group.key" class="card stack merit-group">
        <div class="row row-wrap merit-group-head"><span class="chip chip-blue">{{ group.label }}</span><span class="muted">{{ group.quota }}</span>
          <button v-if="merit.canDesignate === true" type="button" class="btn-quiet" :disabled="loading || saving || !!meritError || !!discoveryError" @click="openPicker(group)">{{ home.edit }}</button>
        </div>
        <div v-for="member in group.members" :key="member.id" class="list-row merit-member">
          <div class="info-head"><strong>{{ member.name }}</strong><span class="chip chip-blue">{{ member.identity }}</span></div>
          <span class="muted">{{ [member.department, member.workGroup].filter(Boolean).join(' · ') }}</span>
        </div>
        <p v-if="!group.members.length" class="empty-state">{{ home.noDesignatedMember }}</p>
      </section>
    </template>
  </div>
  <PersonnelPicker v-if="picker" :title="home.designateMeritList" :options="picker.options" :value="picker.selected" :busy="saving"
    @cancel="picker = null" @confirm="saveDesignations">
    <p>{{ picker.quota }}</p><p v-if="saveError" class="notice-line">{{ saveError }}</p>
  </PersonnelPicker>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import PersonnelPicker from './PersonnelPicker.vue';
import ScoringResultRow from './ScoringResultRow.vue';
import homeCopy from '@/locales/zh-CN/shared/home.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { showToast } from '@/runtime/notify.js';
const home = homeCopy.text;
const tab = ref('scoring');
const activityId = ref('');
const results = ref(null);
const merit = ref(null);
const loading = ref(true);
const discoveryError = ref('');
const resultsError = ref('');
const meritError = ref('');
const saving = ref(false);
const picker = ref(null);
const saveError = ref('');
const expanded = ref('');
const filters = reactive({ search: '', identity: '', department: '', workGroup: '', grade: '' });
let active = false;
let generation = 0;
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
const groups = computed(() => (results.value?.groups || []).map(group => ({ ...group, members: sorted(group.members || []) })));
const members = computed(() => groups.value.length ? sorted(groups.value.flatMap(group => group.members)) : sorted(results.value?.results || []));
function matches(member) {
  return ['identity', 'department', 'workGroup'].every(key => !filters[key] || member[key] === filters[key])
    && (!filters.grade || (member.grade || home.unrated) === filters.grade)
    && ['name', 'identity', 'department', 'workGroup'].some(key => String(member[key] || '').toLowerCase().includes(filters.search.trim().toLowerCase()));
}
const filteredMembers = computed(() => members.value.filter(matches));
const filteredGroups = computed(() => groups.value.map(group => ({ ...group, members: group.members.filter(matches) })).filter(group => group.members.length));
const filterFields = [{ key: 'identity', label: home.identity }, { key: 'department', label: home.department }, { key: 'workGroup', label: home.workGroup }];
const options = key => [...new Set(members.value.map(member => member[key]).filter(Boolean))].sort();
const grades = computed(() => {
  const counts = new Map();
  for (const member of members.value) { const grade = member.grade || home.unrated; counts.set(grade, (counts.get(grade) || 0) + 1); }
  return Array.from(counts, ([grade, count]) => ({ grade, count }));
});
const scoreStats = computed(() => {
  if (!filteredMembers.value.length || filteredMembers.value.some(member => member.grade)) return { max: '--', average: '--' };
  const scores = filteredMembers.value.map(member => parseFloat(member.finalScore) || 0);
  return { max: scores.reduce((max, score) => Math.max(max, score), -Infinity).toFixed(1), average: (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1) };
});
const meritGroups = computed(() => {
  const map = new Map();
  for (const clause of merit.value?.clauses || []) {
    const key = clause.targetIdentityId || clause.targetIdentity;
    if (!map.has(key)) map.set(key, { key, label: clause.targetIdentity || home.unclassified, clauses: [] });
    map.get(key).clauses.push(clause);
  }
  return Array.from(map.values(), group => {
    const quotas = group.clauses.map(clause => clause.quotaLimit || 0).filter(value => value > 0);
    const exact = group.clauses.some(clause => clause.requireExactQuota);
    return { ...group, quota: quotas.length ? (exact ? homeCopy.format.exactQuota(quotas[0]) : homeCopy.format.maximumQuota(Math.max(...quotas))) : home.unlimitedPeople,
      members: (merit.value?.meritList || []).filter(member => (member.identityCategoryId || member.identityId || member.identity) === group.key) };
  });
});
const departmentCount = computed(() => new Set((merit.value?.meritList || []).map(member => member.department).filter(Boolean)).size);
function clearFilters() { for (const key of Object.keys(filters)) filters[key] = ''; }
function toggleFilter(key, value) { filters[key] = filters[key] === value ? '' : value; }
function selectTab(key) { if (saving.value) return; tab.value = key; if (key !== 'scoring' && activityId.value) refresh(); }
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
    if (id !== activityId.value) { results.value = null; merit.value = null; clearFilters(); expanded.value = ''; }
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
      const response = await callApi(name, { activityId: id });
      if (!current()) return;
      if (!['no_permission', 'not_published'].includes(response.status)) requireSuccess(response);
      if (response.status === 'success' && (name === 'getPublicResults' ? !Array.isArray(response.groups) && !Array.isArray(response.results) : !Array.isArray(response.meritList))) throw new Error();
      value.value = response; notice.value = '';
    } catch (error) { if (current()) notice.value = errorText(error, copy.scoring.loadFailed); }
  }));
  if (current()) { loading.value = false; normalizeTab(); }
}
function openPicker(group) {
  if (loading.value || saving.value || meritError.value || discoveryError.value || merit.value?.canDesignate !== true) return;
  const ids = new Set(group.clauses.map(clause => clause.targetIdentityId));
  const options = (merit.value.designationCandidates || []).filter(item => ids.has(item.targetIdentityId)).map(item => ({ ...item, assignmentId: item.assignmentId || item.id }));
  picker.value = { ...group, options, selected: options.filter(item => item.isSelected), publicationId: merit.value.publicationId };
  saveError.value = '';
}
async function saveDesignations(selected) {
  if (saving.value || !picker.value) return;
  const expected = scope();
  const current = () => active && expected === scope();
  const clauseIds = picker.value.clauses.map(clause => clause.id);
  saving.value = true;
  try {
    requireSuccess(await callApi('submitMeritListDesignations', { clauseIds, clauseId: clauseIds[0], publicationId: picker.value.publicationId,
      designationAssignmentIds: [...new Set(selected.map(item => item.assignmentId))] }));
    if (!current()) return;
    picker.value = null; showToast(home.saved); await refresh();
  } catch (error) { if (current()) saveError.value = errorText(error, home.saveFailed); }
  finally { if (current()) saving.value = false; }
}
onBeforeRouteLeave(() => !saving.value);
onActivated(() => { active = true; discover(); });
onDeactivated(() => { active = false; generation++; picker.value = null; });
onBeforeUnmount(() => { active = false; generation++; results.value = null; merit.value = null; });
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
.merit-member { display: flex; flex-direction: column; align-items: stretch; gap: var(--ui-label-gap); }
</style>
