<template>
  <div class="page stack">
    <section class="hero stack-tight">
      <span class="soft">{{ copy.common.webVersionLabel }} {{ WEB_CLIENT_VERSION }}</span>
      <h1 class="login-title">{{ greeting }}</h1>
      <div class="row row-wrap">
        <span class="chip chip-blue">{{ roleLine }}</span>
        <span v-if="orgName" class="chip chip-sky">{{ orgName }}</span>
      </div>
      <button type="button" class="btn btn-secondary" @click="go({ name: 'workRole' })">
        {{ copy.portal.switchRole }}
      </button>
    </section>

    <section class="card stack">
      <div class="card-title">{{ copy.portal.modules }}</div>
      <div class="tiles">
        <button
          v-for="card in cards"
          :key="card.key"
          type="button"
          class="tile"
          @click="openCard(card)"
        >
          <span class="row">
            <span class="grow">{{ card.label }}</span>
            <span v-if="card.status === 'building'" class="chip chip-orange">{{ copy.common.building }}</span>
          </span>
        </button>
      </div>
    </section>

    <div class="columns">
      <section class="card stack">
        <div class="row">
          <span class="card-title grow">{{ copy.portal.todos }}</span>
          <button type="button" class="btn-quiet" @click="goMessages('todos')">
            {{ copy.portal.viewAll }}
          </button>
        </div>
        <div v-if="todosLoading" class="empty-state">{{ copy.common.loading }}</div>
        <div v-else-if="!todos.length" class="empty-state">{{ copy.portal.emptyTodos }}</div>
        <div v-else class="list">
          <MessageRow
            v-for="item in todos"
            :key="item.id"
            :item="item"
            kind="todo"
            @open="openMessage"
          />
        </div>
      </section>

      <section class="card stack">
        <div class="row">
          <span class="card-title grow">{{ copy.portal.notifications }}</span>
          <button
            v-if="unreadCount > 0"
            type="button"
            class="btn-quiet"
            @click="markAllRead"
          >
            {{ copy.portal.markAllRead }}
          </button>
          <button type="button" class="btn-quiet" @click="goMessages('notifications')">
            {{ copy.portal.viewAll }}
          </button>
        </div>
        <div v-if="notificationsLoading" class="empty-state">{{ copy.common.loading }}</div>
        <div v-else-if="!notifications.length" class="empty-state">{{ copy.portal.emptyNotifications }}</div>
        <div v-else class="list">
          <MessageRow
            v-for="item in notifications"
            :key="item.id"
            :item="item"
            kind="notification"
            @open="openMessage"
          >
            <template #actions="{ item: row }">
              <button type="button" class="btn-quiet btn-quiet-danger" @click="removeNotification(row)">
                {{ copy.messages.deleteOne }}
              </button>
            </template>
          </MessageRow>
        </div>
      </section>
    </div>

    <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MessageRow from '@/components/MessageRow.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { cardsForRole } from '@/runtime/modules.js';
import { notifyModuleBuilding } from '@/runtime/porting.js';
import { roleLabelOf, session } from '@/runtime/session.js';
import { WEB_CLIENT_VERSION } from '@/runtime/version.js';

const PORTAL_PREVIEW_LIMIT = 6;

const router = useRouter();
const todos = ref([]);
const notifications = ref([]);
const unreadCount = ref(0);
const todosLoading = ref(true);
const notificationsLoading = ref(true);
const loadNotice = ref('');

const cards = computed(() => cardsForRole(session.activeRole));

const displayName = computed(() => {
  const context = session.context || {};
  return context.name || (session.user && session.user.name) || '';
});

const greeting = computed(() => displayName.value
  ? copy.portal.greetingPrefix + displayName.value
  : copy.portal.heroTitle);

const orgName = computed(() => (session.context && session.context.organizationName) || session.activeOrg.name || '');

const roleLine = computed(() => {
  const context = session.context;
  if (!context) return '';
  return context.assignmentLabel || context.identityName || roleLabelOf(context);
});

function go(target) {
  router.push(target);
}

function goMessages(tab) {
  router.push({ name: 'messages', query: { tab } });
}

function openCard(card) {
  if (card.status === 'building') {
    notifyModuleBuilding();
    return;
  }
  go(card.route);
}

async function loadPreview() {
  const failures = [];
  try {
    const result = await callApi('listTodos', { limit: PORTAL_PREVIEW_LIMIT });
    todos.value = Array.isArray(result.items) ? result.items : [];
  } catch (error) {
    failures.push(errorText(error, copy.portal.loadFailed));
  } finally {
    todosLoading.value = false;
  }
  try {
    const result = await callApi('listNotifications', { limit: PORTAL_PREVIEW_LIMIT });
    notifications.value = Array.isArray(result.items) ? result.items : [];
    unreadCount.value = Number(result.unreadCount || 0);
  } catch (error) {
    failures.push(errorText(error, copy.portal.loadFailed));
  } finally {
    notificationsLoading.value = false;
  }
  const visible = failures.filter(Boolean);
  loadNotice.value = visible.length ? visible[0] : '';
}

async function openMessage(item) {
  if (item && item.isRead === false) {
    try {
      await callApi('markNotificationRead', { id: item.id });
      item.isRead = true;
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    } catch (_) {
      // 已读标记失败不影响用户继续查看内容，下一次刷新会回到服务端真实状态。
    }
  }
  notifyModuleBuilding();
}

async function markAllRead() {
  try {
    await callApi('markAllNotificationsRead', {});
    notifications.value = notifications.value.map((item) => Object.assign({}, item, { isRead: true }));
    unreadCount.value = 0;
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.loadFailed);
  }
}

async function removeNotification(item) {
  try {
    await callApi('deleteNotification', { id: item.id });
    notifications.value = notifications.value.filter((row) => row.id !== item.id);
    if (item.isRead === false) unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.loadFailed);
  }
}

onMounted(loadPreview);
</script>
