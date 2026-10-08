<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.admin.consoleTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab"
        :class="{ 'tab-active': activeTab === tab.key }"
        @click="selectTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'hr'" class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.admin.tabHr }}</span>
          <span class="panel-note">
            {{ rows.length }} {{ copy.admin.memberCountSuffix }}
          </span>
        </div>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>

      <label class="field">
        <input
          v-model="keyword"
          class="field-input"
          type="search"
          :placeholder="copy.admin.memberSearchPlaceholder"
        />
      </label>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!filteredRows.length" class="empty-state">{{ copy.admin.memberEmpty }}</div>
      <div v-else class="list">
        <div v-for="row in filteredRows" :key="row.hrId || row.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ row.name }}</span>
            <span class="row row-wrap">
              <span v-if="assignmentText(row)" class="chip chip-sky break-all">{{ assignmentText(row) }}</span>
              <span class="chip" :class="row.isActive === false ? 'chip-orange' : 'chip-green'">
                {{ accountState(row) }}
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="card stack">
      <span class="section-title">{{ activeLabel }}</span>
      <p class="notice-line">{{ copy.admin.consoleNote }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const activeTab = ref('hr');
const keyword = ref('');
const rows = ref([]);
const loading = ref(true);
const loadNotice = ref('');

const tabs = computed(() => [
  { key: 'hr', label: copy.admin.tabHr },
  { key: 'scoring', label: copy.admin.tabScoring },
  { key: 'audit', label: copy.admin.tabAudit },
  { key: 'system', label: copy.admin.tabSystem }
]);

const activeLabel = computed(() => {
  const tab = tabs.value.find((item) => item.key === activeTab.value);
  return tab ? tab.label : '';
});

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

const filteredRows = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return rows.value;
  return rows.value.filter((row) => String(row.name || '').toLowerCase().indexOf(query) >= 0);
});

function assignmentText(row) {
  const assignments = Array.isArray(row.assignments) ? row.assignments : [];
  const label = assignments.map((item) => item.assignmentLabel || item.label).filter(Boolean);
  return label.slice(0, 2).join('、');
}

function accountState(row) {
  const account = row.account || {};
  const status = String(account.status || row.accountStatus || '');
  const map = {
    verified: copy.audit.statusLabels.approved,
    frozen: copy.audit.statusLabels.withdrawn
  };
  return map[status] || status || copy.common.empty;
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function selectTab(key) {
  activeTab.value = key;
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listHrGovernance', {});
    if (result.status !== 'success') {
      rows.value = [];
      loadNotice.value = result.message || copy.errors.permissionDenied;
      return;
    }
    rows.value = Array.isArray(result.rows) ? result.rows : [];
  } catch (error) {
    rows.value = [];
    loadNotice.value = errorText(error, copy.errors.permissionDenied);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
