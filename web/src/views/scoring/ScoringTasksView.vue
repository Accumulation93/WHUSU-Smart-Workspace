<template>
  <div class="page stack scoring-directory">
    <WorkspaceHero :page-name="copy.scoring.title" :person-name="displayName" :identity-name="roleLine" :organization-name="orgName" @switch="goWorkRole" />
    <ScoringPublication>
    <template #scoring>
    <section class="card stack">
      <span class="section-title">{{ home.currentActivity }}</span>
      <span v-if="activity" class="activity-name break-all">{{ activity.name }}</span>
      <span v-else-if="!loading && !loadNotice" class="muted">{{ home.noActivity }}</span>
      <span v-if="activity?.description" class="muted break-all">{{ activity.description }}</span>
    </section>
    <div class="scoring-stats">
      <div v-for="stat in stats" :key="stat.label" class="card scoring-stat">
        <span class="stat-value" :class="stat.tone">{{ stat.value }}</span><span class="stat-label">{{ stat.label }}</span>
      </div>
    </div>
    <section class="card stack targets-card">
      <div class="info-head"><span class="section-title">{{ home.scoreTarget }}</span>
        <button v-if="loadNotice" type="button" class="btn-quiet" :disabled="loading" @click="load">{{ scoreCopy.retryLoad }}</button>
      </div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <p v-if="activityNotice" class="notice-line">{{ activityNotice }}</p>
      <div v-if="loading && !targets.length" class="empty-state">{{ home.loadingTargets }}</div>
      <div v-else-if="!loadNotice && !activityNotice && !targets.length" class="empty-state">{{ home.noTargets }}</div>
      <div v-for="group in groups" :key="group.identity" class="stack target-group">
        <span class="chip target-group-label">{{ group.identity }}</span>
        <div v-for="target in group.targets" :key="target.id" class="list-row target-card" role="button"
          :tabindex="blocked ? -1 : 0" :aria-disabled="blocked" @click="openScore(target)"
          @keydown.enter.prevent="openScore(target)" @keydown.space.prevent="openScore(target)">
          <div class="target-main"><span class="target-name break-all">{{ target.name }}</span>
            <span class="target-tags"><span v-if="target.identity" class="chip chip-blue">{{ target.identity }}</span>
              <span class="chip" :class="isScored(target) ? 'chip-green' : 'chip-orange'">{{ isScored(target) ? copy.scoring.scoreStatusScored : copy.scoring.scoreStatusPending }}</span>
            </span>
          </div>
          <span v-if="target.department" class="target-meta break-all">{{ target.department }}</span>
          <span v-if="target.workGroup" class="target-meta break-all">{{ target.workGroup }}</span>
          <span v-if="target.needsAssignmentDisambiguation && target.assignmentId" class="chip chip-sky assignment-chip">{{ assignmentText(target) }}</span>
        </div>
      </div>
    </section>
    </template>
    </ScoringPublication>
    <div class="page-footer"><span class="footer-name">{{ copy.common.appName }}</span><span class="footer-org">{{ copy.common.organizationName }}</span></div>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import ScoringPublication from '@/components/ScoringPublication.vue';
import copy from '@/locales/zh-CN/index.js';
import homeCopy from '@/locales/zh-CN/shared/home.js';
import scoreCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/score/score.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { formatAbsoluteDate } from '@/runtime/dateTime.js';
import { showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

defineOptions({ name: 'ScoringTasksView' });
const home = homeCopy.text;
const router = useRouter();
const targets = ref([]);
const activity = ref(null);
const activityNotice = ref('');
const loading = ref(true);
const loadNotice = ref('');
let generation = 0;
let active = false;
const scope = () => [session.user?.id, session.context?.organizationId, session.context?.contextId].join('|');
const displayName = computed(() => session.context?.name || session.user?.name || '');
const orgName = computed(() => session.context?.organizationName || '');
const roleLine = computed(() => session.context?.assignmentLabel || session.context?.identityName || roleLabelOf(session.context));
const blocked = computed(() => loading.value || !!loadNotice.value || !!activityNotice.value);
const isScored = target => target.scoreStatus ? target.scoreStatus === 'scored' : target.isScored === true;
const stats = computed(() => {
  const scored = targets.value.filter(isScored).length;
  return [{ label: home.totalTargets, value: targets.value.length }, { label: home.completed, value: scored, tone: 'stat-completed' },
    { label: home.pendingScore, value: targets.value.length - scored, tone: 'stat-pending' }];
});
const groups = computed(() => {
  const result = new Map();
  for (const target of targets.value) {
    const identity = target.identity || home.unclassified;
    if (!result.has(identity)) result.set(identity, []);
    result.get(identity).push(target);
  }
  return Array.from(result, ([identity, items]) => ({ identity, targets: items }));
});
function assignmentText(target) {
  const label = typeof target.assignmentLabel === 'object' && target.assignmentLabel ? target.assignmentLabel : {};
  const nature = label.assignmentNature || target.assignmentNature || target.assignmentKind;
  return [{ staff: home.assignmentNatureStaff, liaison: home.assignmentNatureLiaison, other: home.assignmentNatureOther }[nature] || nature,
    label.department || target.department, label.identityCategory || target.identityCategory || target.identity,
    label.workGroup || target.workGroup].filter(Boolean).join(' · ');
}
function goWorkRole() { router.push({ name: 'workRole' }); }
async function load() {
  const request = ++generation;
  const expected = scope();
  const current = () => active && request === generation && expected === scope();
  loading.value = true;
  try {
    const [activityRead, targetRead] = await Promise.allSettled([callApi('getCurrentScoreActivity', {}), callApi('getRateTargets', {})]);
    if (!current()) return;
    if (activityRead.status === 'rejected') throw activityRead.reason;
    const info = requireSuccess(activityRead.value);
    if (!Object.hasOwn(info, 'activity')) throw new Error();
    activity.value = info.activity || null;
    activityNotice.value = '';
    if (targetRead.status === 'rejected') throw targetRead.reason;
    const result = targetRead.value;
    if (['activity_paused', 'activity_not_started', 'activity_ended'].includes(result.status)) {
      activityNotice.value = result.message || ({ activity_paused: home.activityPaused, activity_not_started: home.activityNotStarted, activity_ended: home.activityEnded })[result.status];
      targets.value = []; loadNotice.value = ''; return;
    }
    requireSuccess(result);
    if (!Array.isArray(result.targets)) throw new Error();
    if (activity.value?.id && result.currentActivity?.id && activity.value.id !== result.currentActivity.id) throw new Error();
    if (!activity.value && result.currentActivity) throw new Error();
    targets.value = result.targets;
    activityNotice.value = activity.value?.isPaused ? home.activityPaused : '';
    loadNotice.value = '';
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, copy.scoring.loadFailed);
  } finally {
    if (current()) loading.value = false;
  }
}
function openScore(target) {
  if (blocked.value || !target.id) return;
  const today = formatAbsoluteDate(new Date());
  if (activity.value?.startDate && today < activity.value.startDate) return showToast(home.activityNotStarted);
  if (activity.value?.endDate && today > activity.value.endDate) return showToast(home.activityEnded);
  router.push({ name: 'scoringFill', params: { id: target.id } });
}
onActivated(() => { active = true; load(); });
onDeactivated(() => { active = false; generation++; loading.value = true; });
onBeforeUnmount(() => { active = false; generation++; targets.value = []; activity.value = null; });
</script>

<style scoped>
.scoring-directory { max-width: var(--ui-score-page-width); }
.activity-name { font-size: var(--ui-type-value); font-weight: 700; line-height: var(--ui-leading-heading); }
.scoring-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ui-list-gap); }
.scoring-stat { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-width: 0; padding: var(--ui-list-padding-y) var(--ui-list-padding-x); }
.stat-value { font-size: var(--ui-type-page); font-weight: 800; line-height: var(--ui-leading-heading); }
.stat-label { color: var(--ui-text-muted); font-size: var(--ui-type-meta); }
.stat-completed { color: var(--ui-chip-orange-text); background: var(--ui-stat-completed-bg); background-clip: text; -webkit-text-fill-color: transparent; }
.stat-pending { color: var(--ui-blue-700); }
.target-group-label, .assignment-chip { align-self: flex-start; justify-self: start; }
.target-group-label { background: var(--ui-target-group-bg); border: var(--ui-target-group-border); color: var(--ui-target-group-text); }
.target-card { display: flex; flex-direction: column; align-items: stretch; gap: var(--ui-label-gap); cursor: pointer; }
.target-card[aria-disabled="true"] { cursor: default; }
.target-main { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-list-gap); }
.target-name { min-width: 0; font-size: var(--ui-type-value); font-weight: 700; }
.target-tags { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-inline-gap); min-width: 0; }
.target-meta { color: var(--ui-text-muted); font-size: var(--ui-type-label); line-height: var(--ui-leading-body); }
.target-card:focus-visible { outline: var(--ui-line-blue) solid 2px; outline-offset: 2px; }
</style>
