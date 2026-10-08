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
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="activityName" class="glass-panel stack-tight">
        <span class="field-label">{{ copy.scoring.activityLabel }}</span>
        <span class="value break-all">{{ activityName }}</span>
        <span v-if="progressTotal" class="muted">
          {{ formatTemplate(copy.scoring.progressText, [scoredCount, progressTotal]) }}
        </span>
      </div>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!targets.length" class="empty-state">
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
            <button type="button" class="btn-quiet" @click="openScore(target)">
              {{ target.isScored ? copy.scoring.actionRewriteScore : copy.scoring.actionOpenScore }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { formatTemplate } from '@/runtime/audit.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const targets = ref([]);
const activityName = ref('');
const scoredCount = ref(0);
const progressTotal = ref(0);
const loading = ref(true);
const loadNotice = ref('');

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
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('getRateTargets', {});
    if (result.status !== 'success') {
      targets.value = [];
      loadNotice.value = result.message || '';
      return;
    }
    const activity = result.currentActivity || {};
    activityName.value = activity.name || '';
    const list = Array.isArray(result.targets) ? result.targets : [];
    targets.value = list;
    progressTotal.value = list.length;
    scoredCount.value = list.filter((item) => item.isScored === true).length;
  } catch (error) {
    targets.value = [];
    loadNotice.value = errorText(error, copy.scoring.loadFailed);
  } finally {
    loading.value = false;
  }
}

function openScore(target) {
  router.push({ name: 'scoringFill', params: { targetId: target.id } });
}

onMounted(load);
</script>
