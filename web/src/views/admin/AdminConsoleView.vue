<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="module.label"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section v-if="permissionLoading || permissionNotice || !tabs.length" class="card stack">
      <span class="notice-line">{{ permissionLoading ? copy.common.loading : permissionNotice || copy.errors.permissionDenied }}</span>
      <button v-if="permissionNotice" type="button" class="btn-quiet" @click="loadPermissions">{{ personnel.dictionaryRetry }}</button>
    </section>
    <div v-if="tabs.length" class="tabs admin-tabs" role="tablist" :aria-label="module.label">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :disabled="permissionLoading || !!permissionNotice || actionBusy"
        :class="{ 'tab-active': activeTab === tab.key }"
        @click="selectTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <AdminActivityPanel v-if="activeTab === 'activities'" :state="activityState" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AdminDictionaryPanel v-else-if="['departments', 'workGroups', 'identities'].includes(activeTab)" :key="activeTab" :kind="activeTab" :state="dictionaryStates[activeTab]" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <section v-else-if="activeTab === 'hrInfo'" class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.admin.tabHr }}</span>
          <span class="panel-note">
            {{ rows.length }} {{ copy.admin.memberCountSuffix }}
          </span>
        </div>
        <button v-if="loadNotice" type="button" class="btn-quiet" :disabled="loading" @click="load">{{ personnel.dictionaryRetry }}</button>
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

      <div v-if="loading && !rows.length" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!loadNotice && !filteredRows.length" class="empty-state">{{ copy.admin.memberEmpty }}</div>
      <div v-else class="list">
        <div v-for="row in filteredRows" :key="row.hrId || row.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ row.name }}</span>
            <span class="row row-wrap">
              <span v-if="row.studentId" class="muted">{{ row.studentId }}</span>
              <span class="chip" :class="row.auth?.status === 'verified' ? 'chip-green' : 'chip-orange'">
                {{ accountState(row) }}
              </span>
            </span>
            <details v-if="row.assignments?.length" class="stack-tight">
              <summary>{{ copy.hr.assignmentLabel }} {{ row.assignments.length }}</summary>
              <span v-for="assignment in row.assignments" :key="assignment.assignmentId" class="muted break-all">{{ [assignment.identityCategoryName, assignment.department, assignment.workGroup].filter(Boolean).join(' · ') }}</span>
            </details>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab" class="card stack">
      <span class="section-title">{{ activeLabel }}</span>
      <p class="notice-line">{{ copy.admin.consoleNote }}</p>
    </section>
    <footer class="page-footer"><div class="footer-name">{{ copy.common.appName }}</div><div class="footer-org">{{ copy.common.organizationName }}</div></footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AdminDictionaryPanel from '@/components/AdminDictionaryPanel.vue';
import AdminActivityPanel from '@/components/AdminActivityPanel.vue';
import copy from '@/locales/zh-CN/index.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import accountCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { adminModule, adminTabs } from '@/runtime/adminNavigation.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const route = useRoute();
const activeTab = ref('');
const keyword = ref('');
const rows = ref([]);
const loading = ref(false);
const loadNotice = ref('');
const permissionLoading = ref(false);
const permissionNotice = ref('');
const profile = ref(null);
const actionBusy = ref(false);
const activityState = reactive({ form: { id: '', name: '', description: '', startDate: '', endDate: '' }, resetAfterRead: false });
const dictionaryStates = reactive(Object.fromEntries(['departments', 'workGroups', 'identities'].map(kind => [kind, {
  form: { id: '', name: '', description: '', departmentId: '' }, resetAfterRead: false
}])));
const module = computed(() => adminModule(route.query.subApp));
const tabs = computed(() => adminTabs(route.query.subApp, profile.value));
let generation = 0;
let permissionGeneration = 0;
let disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId, route.query.subApp].join('|');

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

function accountState(row) {
  const auth = row.auth;
  if (!auth) return accountCopy.accountStateUnknown;
  const labels = {
    verified: accountCopy.copy_8e4abe3d58,
    frozen: accountCopy.copy_f6eb285e87,
    recovery_required: accountCopy.copy_16399ef078
  };
  if (labels[auth.status]) return labels[auth.status];
  if (!row.accountId) return accountCopy.accountNotCreated;
  if (auth.status === 'pending_verification') return accountCopy.accountPendingVerification;
  return accountCopy.accountStateUnknown;
}

function goWorkRole() {
  if (actionBusy.value) return;
  router.push({ name: 'workRole' });
}

function selectTab(key) {
  if (actionBusy.value || permissionLoading.value || permissionNotice.value || !tabs.value.some(tab => tab.key === key)) return;
  activeTab.value = key;
  router.replace({ name: 'adminConsole', query: { subApp: route.query.subApp || 'scoring', tab: key } });
}

async function load() {
  if (activeTab.value !== 'hrInfo' || permissionNotice.value || permissionLoading.value) return;
  const request = ++generation;
  const expected = scope();
  const current = () => !disposed && request === generation && expected === scope() && activeTab.value === 'hrInfo';
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = requireSuccess(await callApi('listHrGovernance', { organizationId: session.context?.organizationId }));
    if (!current()) return;
    if (!Array.isArray(result.rows)) throw new Error();
    rows.value = Array.isArray(result.rows) ? result.rows : [];
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    if (current()) loading.value = false;
  }
}

async function loadPermissions() {
  const request = ++permissionGeneration;
  const expected = scope();
  const current = () => !disposed && request === permissionGeneration && expected === scope();
  permissionLoading.value = true;
  permissionNotice.value = '';
  try {
    if (session.context?.role !== 'admin') throw new Error(copy.errors.permissionDenied);
    const result = requireSuccess(await callApi('getMyAdminPermissions', {}));
    if (!current()) return;
    if (result.organizationId && result.organizationId !== session.context?.organizationId) throw new Error(copy.errors.permissionDenied);
    profile.value = result;
    const requested = route.query.tab;
    activeTab.value = tabs.value.some(tab => tab.key === requested) ? requested
      : tabs.value.some(tab => tab.key === activeTab.value) ? activeTab.value : tabs.value[0]?.key || '';
  } catch (error) { if (current()) permissionNotice.value = errorText(error, copy.errors.permissionDenied); }
  finally { if (current()) permissionLoading.value = false; }
}
watch(scope, () => {
  generation++; profile.value = null; activeTab.value = ''; rows.value = []; keyword.value = ''; loadNotice.value = '';
  Object.assign(activityState.form, { id: '', name: '', description: '', startDate: '', endDate: '' }); activityState.resetAfterRead = false;
  for (const state of Object.values(dictionaryStates)) {
    Object.assign(state.form, { id: '', name: '', description: '', departmentId: '' }); state.resetAfterRead = false;
  }
  loadPermissions();
}, { immediate: true });
watch(() => route.query.tab, key => { if (tabs.value.some(tab => tab.key === key)) activeTab.value = key; });
watch([activeTab, permissionLoading], () => { generation++; if (activeTab.value === 'hrInfo' && !permissionLoading.value) load(); });
onBeforeUnmount(() => { disposed = true; generation++; permissionGeneration++; });
onBeforeRouteLeave(() => session.status !== 'authenticated' || !actionBusy.value);
onBeforeRouteUpdate(() => session.status !== 'authenticated' || !actionBusy.value);
</script>

<style scoped>
.admin-tabs .tab { min-width: 0; width: 0; padding-inline: var(--ui-admin-tab-padding-x); font-size: var(--ui-admin-tab-font-size); white-space: nowrap; }
</style>
