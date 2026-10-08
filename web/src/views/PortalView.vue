<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.portal.pageName"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="go({ name: 'workRole' })"
    />

    <section class="card stack">
      <div class="info-head">
        <span class="section-title">{{ copy.portal.todos }}</span>
        <span class="message-head-actions">
          <span v-if="todoTotal > 0" class="todo-count">
            {{ copy.portal.totalPrefix }} {{ todoTotal > 99 ? '99+' : todoTotal }} {{ copy.portal.itemSuffix }}
          </span>
          <button type="button" class="message-text-action" @click="goMessages('todos')">
            {{ copy.portal.viewAll }}
          </button>
        </span>
      </div>
      <div v-if="todosLoading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!todos.length" class="notification-empty">
        <span class="notification-empty-text">{{ copy.portal.emptyTodos }}</span>
      </div>
      <div v-else class="message-preview-scroll">
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
      <div class="info-head">
        <span class="section-title">{{ copy.portal.notifications }}</span>
        <span class="message-head-actions">
          <button
            v-if="unreadCount > 0"
            type="button"
            class="message-text-action"
            @click="markAllRead"
          >
            {{ copy.portal.markAllRead }}
          </button>
          <span v-if="unreadCount > 0" class="notification-badge">
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </span>
          <button type="button" class="message-text-action" @click="goMessages('notifications')">
            {{ copy.portal.viewAll }}
          </button>
        </span>
      </div>
      <div v-if="notificationsLoading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!notifications.length" class="notification-empty">
        <span class="notification-empty-text">{{ copy.portal.emptyNotifications }}</span>
      </div>
      <div v-else class="message-preview-scroll">
        <MessageRow
          v-for="item in notifications"
          :key="item.id"
          :item="item"
          kind="notification"
          @open="openMessage"
        >
          <template #actions="{ item: row }">
            <button
              type="button"
              class="btn-quiet btn-quiet-danger"
              @click="removeNotification(row)"
            >
              {{ copy.messages.deleteOne }}
            </button>
          </template>
        </MessageRow>
      </div>
    </section>

    <section class="card stack">
      <div class="info-head">
        <span class="section-title">{{ copy.portal.servicesTitle }}</span>
        <span class="compact-segmented">
          <button
            type="button"
            class="compact-segmented-item"
            :class="{ 'compact-segmented-item-active': appViewMode === 'grid' }"
            @click="appViewMode = 'grid'"
          >
            {{ copy.portal.viewGrid }}
          </button>
          <button
            type="button"
            class="compact-segmented-item"
            :class="{ 'compact-segmented-item-active': appViewMode === 'list' }"
            @click="appViewMode = 'list'"
          >
            {{ copy.portal.viewList }}
          </button>
        </span>
      </div>

      <div class="app-search-bar">
        <span class="app-search-icon" aria-hidden="true">
          <UiIcon name="search" tone="muted" size-role="row-leading" />
        </span>
        <input
          v-model="appSearchKeyword"
          class="app-search-input"
          type="search"
          :placeholder="copy.portal.searchPlaceholder"
        />
        <button
          v-if="appSearchKeyword"
          type="button"
          class="app-search-clear"
          :aria-label="copy.common.cancel"
          @click="appSearchKeyword = ''"
        >
          ×
        </button>
      </div>

      <div v-if="!filteredCards.length" class="notification-empty">
        <span class="notification-empty-text">
          {{ appSearchKeyword ? copy.portal.noMatchingApps : copy.portal.noApps }}
        </span>
      </div>

      <div v-else-if="appViewMode === 'grid'" class="app-grid">
        <button
          v-for="(card, index) in filteredCards"
          :key="card.key"
          type="button"
          class="app-grid-item"
          :class="{ 'app-grid-item-disabled': card.status === 'building' }"
          :style="{ animation: 'serviceCardIn 0.28s ' + (0.04 * index) + 's ease-out both' }"
          @click="openCard(card)"
        >
          <span class="app-grid-icon" aria-hidden="true">
            <UiIcon :name="card.iconName" tone="primary" size-role="feature-leading" />
          </span>
          <span class="app-grid-label">{{ card.label }}</span>
          <span v-if="card.status === 'building'" class="app-grid-badge">
            {{ copy.portal.developing }}
          </span>
        </button>
      </div>

      <div v-else class="nav-list">
        <button
          v-for="(card, index) in filteredCards"
          :key="card.key"
          type="button"
          class="nav-row"
          :class="{ 'tile-disabled': card.status === 'building' }"
          :style="{ animation: 'serviceCardIn 0.28s ' + (0.04 * index) + 's ease-out both' }"
          @click="openCard(card)"
        >
          <span class="app-grid-icon" aria-hidden="true">
            <UiIcon :name="card.iconName" tone="primary" size-role="feature-leading" />
          </span>
          <span class="nav-row-body">
            <span class="nav-row-label">{{ card.label }}</span>
          </span>
          <span v-if="card.status === 'building'" class="app-grid-badge app-grid-badge-inline">
            {{ copy.portal.developing }}
          </span>
          <UiIcon v-else name="chevron-right" tone="muted" size-role="message-trailing" />
        </button>
      </div>
    </section>

    <div class="portal-session-footer">
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="go({ name: 'workRole' })">
          {{ copy.portal.workContextSwitch }}
        </button>
        <button type="button" class="btn btn-danger" @click="onLogout">
          {{ copy.common.logout }}
        </button>
      </div>

      <div class="page-footer">
        <span class="footer-name">{{ copy.common.appName }}</span>
        <span class="footer-org">{{ orgName }}</span>
      </div>
    </div>

    <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MessageRow from '@/components/MessageRow.vue';
import UiIcon from '@/components/UiIcon.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { cardsForRole } from '@/runtime/modules.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { notifyModuleBuilding } from '@/runtime/porting.js';
import { logout, roleLabelOf, session } from '@/runtime/session.js';

const PORTAL_PREVIEW_LIMIT = 6;

/*
 * 顺序与小程序门户一致：待办与通知排在应用服务之前；
 * 应用服务卡内含搜索栏与宫格/列表二态切换。
 * 模板里不写中文注释，用户可见文案审计会把模板里的中文当成界面文案。
 */
const router = useRouter();
const todos = ref([]);
const notifications = ref([]);
const todoTotal = ref(0);
const unreadCount = ref(0);
const todosLoading = ref(true);
const notificationsLoading = ref(true);
const loadNotice = ref('');
const appViewMode = ref('grid');
const appSearchKeyword = ref('');

const cards = computed(() => cardsForRole(session.activeRole));

const filteredCards = computed(() => {
  const keyword = appSearchKeyword.value.trim().toLowerCase();
  if (!keyword) return cards.value;
  return cards.value.filter((card) => card.label.toLowerCase().indexOf(keyword) >= 0);
});

const displayName = computed(() => {
  const context = session.context || {};
  return context.name || (session.user && session.user.name) || '';
});

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
    todoTotal.value = Number(result.total || todos.value.length);
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
  const target = item && item.targetUrl;
  if (typeof target === 'string' && target.indexOf('/subpackages/') === 0) {
    // 服务端下发的目标地址仍是小程序路由，网页端没有对应页面时明确说明。
    notifyModuleBuilding();
    return;
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
  // 小程序门户的删除通知是滑动即删、不再弹确认层，网页端保持同一交互语言。
  try {
    await callApi('deleteNotification', { id: item.id });
    notifications.value = notifications.value.filter((row) => row.id !== item.id);
    if (item.isRead === false) unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch (error) {
    loadNotice.value = errorText(error, copy.messages.loadFailed);
  }
}

async function onLogout() {
  const confirmed = await confirmAction({
    title: copy.common.logoutConfirmTitle,
    body: copy.common.logoutConfirmBody,
    confirmText: copy.common.logout,
    cancelText: copy.common.cancel,
    danger: true
  });
  if (!confirmed) return;
  await logout();
  showToast(copy.common.logoutDone);
  router.replace({ name: 'login' });
}

onMounted(loadPreview);
</script>

<style scoped>
/* 列表视图里的「制作中」气泡按内容收缩，不像宫格那样固定在右上角。 */
.app-grid-badge-inline {
  position: static;
  flex: 0 0 auto;
}
</style>
