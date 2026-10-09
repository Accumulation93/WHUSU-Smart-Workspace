<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.portal.messages"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <label class="field">
        <span class="field-label">{{ copy.messages.organizationScope }}</span>
        <select v-model="organizationId" class="field-input" @change="changeScope">
          <option value="">{{ copy.messages.allOrganizations }}</option>
          <option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option>
        </select>
      </label>
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

      <div class="panel-head">
        <span class="section-title">
          {{ isNotificationTab ? copy.messages.view.notifications : copy.messages.view.todos }}
        </span>
        <span class="row row-wrap">
        <button
          v-if="activeTab === 'notifications' && unreadCount > 0"
          type="button"
          class="btn-quiet"
          @click="markAllRead"
        >
          {{ copy.messages.view.markAllRead }}
        </button>
        <button
          v-if="activeTab === 'notifications' && items.length"
          type="button"
          class="btn-quiet btn-quiet-danger"
          @click="clearAll"
        >
          {{ copy.messages.view.clearAll }}
        </button>
        </span>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading && !items.length" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!items.length" class="empty-state">
        {{ activeTab === 'todos' ? copy.messages.view.noTodos : copy.messages.view.noNotifications }}
      </div>
      <div v-else class="list">
        <MessageRow
          v-for="item in items"
          :key="item.id"
          :item="item"
          :kind="activeTab === 'notifications' ? 'notification' : 'todo'"
          @open="openMessage"
        >
          <template #actions="{ item: row }">
            <button
              v-if="activeTab === 'notifications'"
              type="button"
              class="btn-quiet btn-quiet-danger"
              @click="removeNotification(row)"
            >
              {{ copy.messages.view.deleteNotification }}
            </button>
          </template>
        </MessageRow>
      </div>

      <button
        v-if="items.length && nextCursor"
        type="button"
        class="btn btn-secondary"
        :disabled="loading"
        @click="loadMore"
      >
        {{ loading ? copy.common.loading : copy.messages.view.loading }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MessageRow from '@/components/MessageRow.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { openMessageTarget } from '@/runtime/messageNavigation.js';
import { showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const PAGE_SIZE = 20;

const route = useRoute();
const router = useRouter();

const tabs = [
  { key: 'todos', label: copy.messages.view.todos },
  { key: 'notifications', label: copy.messages.view.notifications }
];

const activeTab = ref(route.query.tab === 'notifications' ? 'notifications' : 'todos');
const items = ref([]);
const nextCursor = ref('');
const unreadCount = ref(0);
const loading = ref(false);
const loadNotice = ref('');
const organizationId = ref('');
const organizations = ref(session.organizations);
let generation = 0;
let actionBusy = false;
onBeforeUnmount(() => { generation++; });

const isNotificationTab = computed(() => activeTab.value === 'notifications');

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

function endpointFor(tab) {
  return tab === 'notifications' ? 'listNotifications' : 'listTodos';
}

async function loadFirstPage(tab) {
  const target = tab || activeTab.value;
  const request = ++generation;
  const context = session.context?.contextId;
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = requireSuccess(await callApi(endpointFor(target), { limit: PAGE_SIZE, refresh: true, organizationId: organizationId.value }));
    if (request !== generation || context !== session.context?.contextId) return;
    if (Array.isArray(result.organizations)) organizations.value = result.organizations;
    if (result.partial) loadNotice.value = copy.messages.partialOrganizationLoading;
    items.value = Array.isArray(result.items) ? result.items : [];
    nextCursor.value = result.nextCursor || '';
    unreadCount.value = Number(result.unreadCount || 0);

  } catch (error) {
    if (request !== generation) return;
    loadNotice.value = errorText(error, copy.messages.view.retryLater);
  } finally {
    if (request === generation) loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || !nextCursor.value) return;
  loading.value = true;
  const target = activeTab.value;
  const request = generation;
  const context = session.context?.contextId;
  try {
    const result = requireSuccess(await callApi(endpointFor(target), {
      limit: PAGE_SIZE,
      cursor: nextCursor.value, organizationId: organizationId.value
    }));
    if (request !== generation || context !== session.context?.contextId) return;
    const incoming = Array.isArray(result.items) ? result.items : [];
    items.value = items.value.concat(incoming);
    nextCursor.value = result.nextCursor || '';
  } catch (error) {
    if (request !== generation) return;
    if (error.status === 'cursor_expired') { await loadFirstPage(); return; }
    loadNotice.value = errorText(error, copy.messages.view.retryLater);
  } finally {
    if (request === generation) loading.value = false;
  }
}

function selectTab(tab) {
  if (tab === activeTab.value) return;
  activeTab.value = tab;
  items.value = [];
  nextCursor.value = '';
  loadNotice.value = '';
  router.replace({ name: 'messages', query: { tab } });
  loadFirstPage(tab);
}

function changeScope() {
  items.value = [];
  nextCursor.value = '';
  loadFirstPage();
}

async function openMessage(item) {
  try { await openMessageTarget(router, item, isNotificationTab.value); }
  catch (error) { showToast(errorText(error, copy.messages.notificationReadFailed)); }
}

async function mutateNotifications(endpoint, data = {}) {
  if (actionBusy) return;
  actionBusy = true;
  const request = generation;
  try {
    const result = requireSuccess(await callApi(endpoint, { organizationId: organizationId.value, ...data }));
    if (request !== generation) return;
    await loadFirstPage();
    if (result.partial) loadNotice.value = copy.messages.partialBulkAction;
  } catch (error) {
    if (request === generation) loadNotice.value = errorText(error, copy.messages.deleteFailed);
  } finally { actionBusy = false; }
}

function markAllRead() { return mutateNotifications('markAllNotificationsRead'); }
function removeNotification(item) {
  return mutateNotifications('deleteNotification', { id: item.id, organizationId: item.organizationId });
}
async function clearAll() {
  const scope = organizationId.value;
  const request = generation;
  const confirmed = await confirmAction({
    title: copy.messages.clearTitle, body: copy.messages.clearDescription,
    confirmText: copy.messages.clearAll, cancelText: copy.common.cancel, danger: true
  });
  if (confirmed && scope === organizationId.value && request === generation) {
    await mutateNotifications('deleteAllNotifications');
  }
}

onMounted(() => loadFirstPage(activeTab.value));
</script>
