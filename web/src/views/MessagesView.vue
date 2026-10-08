<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.messages.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
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
          {{ isNotificationTab ? copy.messages.tabNotification : copy.messages.tabTodo }}
        </span>
        <span class="row row-wrap">
        <button
          v-if="activeTab === 'notifications' && unreadCount > 0"
          type="button"
          class="btn-quiet"
          @click="markAllRead"
        >
          {{ copy.messages.markAllRead }}
        </button>
        <button
          v-if="activeTab === 'notifications' && items.length"
          type="button"
          class="btn-quiet btn-quiet-danger"
          @click="clearAll"
        >
          {{ copy.messages.clearAll }}
        </button>
        </span>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading && !items.length" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!items.length" class="empty-state">
        {{ activeTab === 'todos' ? copy.messages.emptyTodo : copy.messages.emptyNotification }}
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
              {{ copy.messages.deleteOne }}
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
        {{ loading ? copy.common.loading : copy.messages.loadMore }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MessageRow from '@/components/MessageRow.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { notifyModuleBuilding } from '@/runtime/porting.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const PAGE_SIZE = 20;

const route = useRoute();
const router = useRouter();

const tabs = [
  { key: 'todos', label: copy.messages.tabTodo },
  { key: 'notifications', label: copy.messages.tabNotification }
];

const activeTab = ref(route.query.tab === 'notifications' ? 'notifications' : 'todos');
const items = ref([]);
const nextCursor = ref('');
const unreadCount = ref(0);
const loading = ref(false);
const loadNotice = ref('');
const loadedTabs = ref({});

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
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi(endpointFor(target), { limit: PAGE_SIZE, refresh: true });
    if (target !== activeTab.value) return;
    items.value = Array.isArray(result.items) ? result.items : [];
    nextCursor.value = result.nextCursor || '';
    unreadCount.value = Number(result.unreadCount || 0);
    loadedTabs.value = Object.assign({}, loadedTabs.value, { [target]: true });
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.retryLater);
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || !nextCursor.value) return;
  loading.value = true;
  const target = activeTab.value;
  try {
    const result = await callApi(endpointFor(target), {
      limit: PAGE_SIZE,
      cursor: nextCursor.value
    });
    if (target !== activeTab.value) return;
    const incoming = Array.isArray(result.items) ? result.items : [];
    items.value = items.value.concat(incoming);
    nextCursor.value = result.nextCursor || '';
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.retryLater);
  } finally {
    loading.value = false;
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

async function openMessage(item) {
  if (isNotificationTab.value && item && item.isRead === false) {
    try {
      await callApi('markNotificationRead', { id: item.id });
      item.isRead = true;
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    } catch (_) {
      // 已读写入失败不阻断打开目标，下一次刷新回到服务端真实状态。
    }
  }
  notifyModuleBuilding();
}

async function markAllRead() {
  try {
    await callApi('markAllNotificationsRead', {});
    items.value = items.value.map((item) => Object.assign({}, item, { isRead: true }));
    unreadCount.value = 0;
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.retryLater);
  }
}

async function removeNotification(item) {
  try {
    await callApi('deleteNotification', { id: item.id });
    items.value = items.value.filter((row) => row.id !== item.id);
    if (item.isRead === false) unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.deleteFailed);
  }
}

async function clearAll() {
  const confirmed = await confirmAction({
    title: copy.messages.clearAllConfirmTitle,
    body: copy.messages.clearAllConfirmBody,
    confirmText: copy.messages.clearAll,
    cancelText: copy.common.cancel,
    danger: true
  });
  if (!confirmed) return;
  try {
    await callApi('deleteAllNotifications', {});
    items.value = [];
    nextCursor.value = '';
    unreadCount.value = 0;
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.clearFailed);
  }
}

onMounted(() => loadFirstPage(activeTab.value));
</script>

<style scoped>
.tab-active {
  /* 与全局分段页签一致：激活项用蓝色渐变 + 白字，不用浅色描边。 */
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 58%, #3b82f6 100%);
  color: #ffffff;
  box-shadow: 0 8px 15px rgba(29, 78, 216, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.24);
}
</style>
