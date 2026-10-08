<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.workbench.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <div class="columns">
      <section class="card stack">
        <div class="section-title">{{ copy.portal.view.todoTitle }}</div>
        <div class="row row-wrap">
          <span class="value">{{ todoTotal }}</span>
          <span class="muted">{{ copy.workbench.pendingLabel }}</span>
        </div>
        <div v-if="!todoPreview.length" class="empty-state">{{ copy.workbench.pendingEmpty }}</div>
        <div v-else class="list">
          <MessageRow
            v-for="item in todoPreview"
            :key="item.id"
            :item="item"
            kind="todo"
            @open="openMessage"
          />
        </div>
        <button type="button" class="btn btn-secondary" @click="goMessages('todos')">
          {{ copy.portal.view.viewAll }}
        </button>
      </section>

      <section class="card stack">
        <div class="section-title">{{ copy.portal.view.notificationTitle }}</div>
        <div class="row row-wrap">
          <span class="value">{{ unreadCount }}</span>
          <span class="muted">{{ copy.workbench.unreadLabel }}</span>
        </div>
        <button type="button" class="btn btn-secondary" @click="goMessages('notifications')">
          {{ copy.portal.view.viewAll }}
        </button>
      </section>
    </div>

    <section class="card stack">
      <div class="section-title">{{ moduleTitle }}</div>
      <div v-if="moduleKey" class="stack-tight">
        <p class="muted">{{ MODULE_BUILDING_TITLE }}</p>
        <p class="soft">{{ MODULE_BUILDING_BODY }}</p>
      </div>
      <div v-else class="tiles">
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

    <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

    <div class="page-footer">
      <span class="footer-name">{{ copy.common.appName }}</span>
      <span class="footer-org">{{ copy.common.organizationName }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MessageRow from '@/components/MessageRow.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { cardsForRole } from '@/runtime/modules.js';
import {
  MODULE_BUILDING_BODY,
  MODULE_BUILDING_TITLE,
  notifyModuleBuilding
} from '@/runtime/porting.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const PREVIEW_LIMIT = 5;

const route = useRoute();
const router = useRouter();
const todoPreview = ref([]);
const todoTotal = ref(0);
const unreadCount = ref(0);
const loadNotice = ref('');

const cards = computed(() => cardsForRole(session.activeRole));

const moduleKey = computed(() => String(route.query.subApp || ''));

const moduleTitle = computed(() => {
  if (!moduleKey.value) return copy.portal.view.servicesTitle;
  const card = cards.value.find((item) => item.key === moduleKey.value);
  return card ? card.label : copy.portal.view.servicesTitle;
});

const orgName = computed(() => (session.context && session.context.organizationName) || '');

const displayName = computed(() => {
  const context = session.context || {};
  return context.name || (session.user && session.user.name) || '';
});

const roleLine = computed(() => {
  const context = session.context;
  if (!context) return '';
  return context.assignmentLabel || context.identityName || roleLabelOf(context);
});

function goMessages(tab) {
  router.push({ name: 'messages', query: { tab } });
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function openCard(card) {
  if (card.status === 'building') {
    router.replace({ name: 'workbench', query: { subApp: card.key } });
    return;
  }
  router.push(card.route);
}

function openMessage() {
  notifyModuleBuilding();
}

async function loadSummary() {
  loadNotice.value = '';
  try {
    const result = await callApi('listTodos', { limit: PREVIEW_LIMIT });
    todoPreview.value = Array.isArray(result.items) ? result.items : [];
    todoTotal.value = Number(result.total || 0);
  } catch (error) {
    loadNotice.value = errorText(error, copy.portal.retryLater);
  }
  try {
    const result = await callApi('listNotifications', { limit: 1 });
    unreadCount.value = Number(result.unreadCount || 0);
  } catch (error) {
    loadNotice.value = loadNotice.value || errorText(error, copy.portal.retryLater);
  }
}

onMounted(loadSummary);
watch(() => session.context && session.context.contextId, () => { loadSummary(); });
</script>
