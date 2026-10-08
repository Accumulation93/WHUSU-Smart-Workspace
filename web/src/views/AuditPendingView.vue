<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.audit.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <AuditNav active="pending" />

    <section class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.audit.tabPending }}</span>
          <span class="panel-note">{{ copy.audit.pendingNote }}</span>
        </div>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!rows.length" class="empty-state">{{ copy.audit.emptyPending }}</div>
      <div v-else class="list">
        <div v-for="row in rows" :key="row.id" class="list-row">
          <div class="list-row-main">
            <button type="button" class="audit-row-open" @click="openDetail(row.submissionId)">
              <span class="list-row-title break-all">{{ row.title || row.submissionNumber }}</span>
              <span class="row row-wrap">
                <span class="chip chip-sky">{{ stepText(row) }}</span>
                <span v-if="isSignatureStep(row)" class="chip chip-orange">{{ copy.audit.actionLabels.sign }}</span>
              </span>
              <span class="soft">
                {{ copy.audit.submitterLabel }} {{ row.submitterName }} · {{ row.submissionNumber }}
              </span>
              <span class="list-row-time">{{ detailTimeText(row.createdAt, row.createdAtReviewStatus) }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AuditNav from '@/components/AuditNav.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { detailTimeText, formatTemplate } from '@/runtime/audit.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const rows = ref([]);
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

function stepText(row) {
  const order = Number(row.sortOrder || 0) + 1;
  return formatTemplate(copy.audit.stepProgress, [order, order]);
}

function isSignatureStep(row) {
  return row.actionType === 'sign';
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listPendingApprovals', {});
    rows.value = Array.isArray(result.pending) ? result.pending : [];
  } catch (error) {
    rows.value = [];
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  } finally {
    loading.value = false;
  }
}

function openDetail(submissionId) {
  router.push({ name: 'auditSubmission', params: { id: submissionId } });
}

onMounted(load);
</script>

<style scoped>
.audit-row-open {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
