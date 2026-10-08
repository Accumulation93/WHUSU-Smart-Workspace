<template>
  <div class="page stack">
    <section class="card stack">
      <div class="row row-wrap">
        <span class="card-title grow">{{ copy.audit.tabHistory }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!rows.length" class="empty-state">{{ copy.audit.emptyHistory }}</div>
      <div v-else class="list">
        <div v-for="row in rows" :key="row.id" class="list-row">
          <div class="list-row-main">
            <button type="button" class="audit-row-open" @click="openDetail(row.id)">
              <span class="list-row-title break-all">{{ row.title || row.submissionNumber }}</span>
              <span class="row row-wrap">
                <span class="chip" :class="statusTone(row.status)">{{ statusLabel(row.status) }}</span>
                <span class="chip chip-sky">{{ copy.audit.submitterLabel }} {{ row.submitterName }}</span>
              </span>
              <span class="soft">{{ row.submissionNumber }} · {{ myActionText(row) }}</span>
              <span class="list-row-time">{{ listTimeText({ updatedAt: row.myLastActionAt }) }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { formatTemplate, listTimeText, statusLabel, statusTone } from '@/runtime/audit.js';

const router = useRouter();
const rows = ref([]);
const loading = ref(true);
const loadNotice = ref('');

function myActionText(row) {
  const steps = Array.isArray(row.mySteps) ? row.mySteps : [];
  if (!steps.length) return '';
  return steps.map((step) => {
    const action = step.status === 'rejected' ? copy.audit.eventRejected : copy.audit.eventApproved;
    return formatTemplate(copy.audit.stepNumber, [Number(step.sortOrder || 0) + 1]) + ' ' + action;
  }).join('、');
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listMyApprovalHistory', {});
    rows.value = Array.isArray(result.items) ? result.items : [];
  } catch (error) {
    rows.value = [];
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  } finally {
    loading.value = false;
  }
}

function openDetail(id) {
  router.push({ name: 'auditSubmission', params: { id } });
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
