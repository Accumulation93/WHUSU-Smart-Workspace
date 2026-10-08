<template>
  <div class="page stack">
    <section class="card stack">
      <div class="row row-wrap">
        <span class="card-title grow">{{ copy.audit.title }}</span>
        <button type="button" class="btn-quiet" @click="goCreate">{{ copy.audit.actionCreate }}</button>
        <button type="button" class="btn-quiet" @click="goSignatures">{{ copy.audit.signatureTitle }}</button>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>

      <div class="row row-wrap">
        <button
          v-for="option in statusOptions"
          :key="option.value"
          type="button"
          class="btn-quiet"
          :class="{ 'tab-active': status === option.value }"
          @click="selectStatus(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!rows.length" class="empty-state">{{ copy.audit.emptySubmissions }}</div>
      <div v-else class="list">
        <div v-for="row in rows" :key="row.id" class="list-row">
          <span v-if="row.isUnread" class="unread-dot" aria-hidden="true"></span>
          <div class="list-row-main">
            <button type="button" class="audit-row-open" @click="openDetail(row.id)">
              <span class="list-row-title break-all">{{ row.title || row.submissionNumber }}</span>
              <span v-if="row.description" class="muted break-all">{{ row.description }}</span>
              <span class="row row-wrap">
                <span class="chip" :class="statusTone(row.status)">{{ statusLabel(row.status) }}</span>
                <span class="soft">{{ row.submissionNumber }}</span>
                <span class="list-row-time">{{ listTimeText(row) }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <button
        v-if="rows.length && unreadCount > 0"
        type="button"
        class="btn btn-secondary"
        @click="markAllRead"
      >
        {{ copy.audit.markAllRead }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { listTimeText, statusLabel, statusTone } from '@/runtime/audit.js';

const router = useRouter();
const status = ref('');
const rows = ref([]);
const loading = ref(true);
const loadNotice = ref('');

const statusOptions = computed(() => [
  { value: '', label: copy.audit.statusAll },
  { value: 'in_progress', label: copy.audit.statusLabels.in_progress },
  { value: 'approved', label: copy.audit.statusLabels.approved },
  { value: 'rejected', label: copy.audit.statusLabels.rejected },
  { value: 'withdrawn', label: copy.audit.statusLabels.withdrawn }
]);

const unreadCount = computed(() => rows.value.filter((row) => row.isUnread).length);

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const payload = {};
    if (status.value) payload.status = status.value;
    const result = await callApi('listMySubmissions', payload);
    rows.value = Array.isArray(result.submissions) ? result.submissions : [];
  } catch (error) {
    rows.value = [];
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  } finally {
    loading.value = false;
  }
}

function selectStatus(value) {
  if (status.value === value) return;
  status.value = value;
  load();
}

function goCreate() {
  router.push({ name: 'auditCreate' });
}

function goSignatures() {
  router.push({ name: 'auditSignatures' });
}

function openDetail(id) {
  router.push({ name: 'auditSubmission', params: { id } });
}

async function markAllRead() {
  try {
    await callApi('markAllSubmissionsRead', {});
    rows.value = rows.value.map((row) => Object.assign({}, row, { isUnread: false }));
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  }
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

.tab-active {
  background: var(--ui-chip-blue-bg);
  color: var(--ui-chip-blue-text);
  font-weight: 600;
}
</style>
