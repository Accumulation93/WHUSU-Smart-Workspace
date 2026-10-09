<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.scoring.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="info-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.scoring.taskTitle }}</span>
          <span class="panel-note">{{ copy.scoring.taskNote }}</span>
        </div>
        <button v-if="loadNotice" type="button" class="btn-quiet" :disabled="loading" @click="load">{{ scoreCopy.retryLoad }}</button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="activityName" class="glass-panel stack-tight">
        <span class="field-label">{{ copy.scoring.activityLabel }}</span>
        <span class="value break-all">{{ activityName }}</span>
        <span v-if="progressTotal" class="muted">
          {{ formatTemplate(copy.scoring.progressText, [scoredCount, progressTotal]) }}
        </span>
      </div>

      <div v-if="loading && !targets.length" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!loadNotice && !targets.length" class="empty-state">
        {{ activityName ? copy.scoring.targetListEmpty : copy.scoring.activityEmpty }}
      </div>
      <div v-else class="list">
        <div v-for="target in targets" :key="target.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ target.name }}</span>
            <span class="row row-wrap">
              <span v-if="target.department" class="chip chip-sky">{{ target.department }}</span>
              <span v-if="target.identity" class="chip chip-sky">{{ target.identity }}</span>
              <span v-if="target.workGroup" class="chip chip-sky">{{ target.workGroup }}</span>
              <span class="chip" :class="target.isScored ? 'chip-green' : 'chip-blue'">
                {{ target.isScored ? copy.scoring.scoreStatusScored : copy.scoring.scoreStatusPending }}
              </span>
            </span>
          </div>
          <div class="list-row-actions">
            <button type="button" class="btn-quiet" :disabled="loading || !!loadNotice" @click="openScore(target)">
              {{ target.isScored ? copy.scoring.actionRewriteScore : copy.scoring.actionOpenScore }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <div class="page-footer">
      <span class="footer-name">{{ copy.common.appName }}</span>
      <span class="footer-org">{{ copy.common.organizationName }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import scoreCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/score/score.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { formatTemplate } from '@/runtime/audit.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const targets = ref([]);
const activityName = ref('');
const scoredCount = ref(0);
const progressTotal = ref(0);
const loading = ref(true);
const loadNotice = ref('');
let generation = 0;
let disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');

const displayName = computed(() => {
  const context = session.context || {};
  return context.name || (session.user && session.user.name) || '';
});

const orgName = computed(() => (session.context && session.context.organizationName) || '');

const roleLine = computed(() => {
  const context = session.context;
  if (!context) return '';
  return context.assignmentLabel || context.identityName || roleLabelOf(context);
});

function goWorkRole() {
  router.push({ name: 'workRole' });
}

async function load() {
  const request = ++generation;
  const expected = scope();
  const current = () => !disposed && request === generation && expected === scope();
  loading.value = true;
  try {
    const result = requireSuccess(await callApi('getRateTargets', {}));
    if (!current()) return;
    if (!Array.isArray(result.targets)) throw new Error();
    const activity = result.currentActivity || {};
    activityName.value = activity.name || '';
    const list = Array.isArray(result.targets) ? result.targets : [];
    targets.value = list;
    progressTotal.value = list.length;
    scoredCount.value = list.filter((item) => item.isScored === true).length;
    loadNotice.value = '';
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, copy.scoring.loadFailed);
  } finally {
    if (current()) loading.value = false;
  }
}

function openScore(target) {
  if (loading.value || loadNotice.value || !target.id) return;
  router.push({ name: 'scoringFill', params: { id: target.id } });
}

watch(scope, () => {
  targets.value = []; activityName.value = ''; scoredCount.value = 0; progressTotal.value = 0; loadNotice.value = '';
  load();
}, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; });
</script>
