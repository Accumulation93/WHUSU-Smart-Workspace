<template>
  <div class="shell">
    <aside class="shell-sidebar">
      <div class="sidebar-brand">
        <span class="shell-brand">{{ copy.common.appName }}</span>
        <span class="soft">{{ copy.common.webVersionLabel }} {{ WEB_CLIENT_VERSION }}</span>
      </div>
      <button
        v-for="entry in SIDEBAR_ENTRIES"
        :key="entry.key"
        type="button"
        class="nav-item"
        :class="{ 'nav-item-active': isActive(entry) }"
        @click="go(entry.route)"
      >
        {{ entry.label }}
      </button>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-user">
        <div class="value break-all">{{ displayName }}</div>
        <div class="soft break-all">{{ roleText }}</div>
        <button type="button" class="btn-quiet" @click="onLogout">{{ copy.common.logout }}</button>
      </div>
    </aside>

    <main class="shell-main">
      <header class="shell-topbar">
        <button type="button" class="btn-quiet" @click="go({ name: 'portal' })">
          {{ copy.common.goPortal }}
        </button>
        <span class="shell-brand grow">{{ currentTitle }}</span>
        <button type="button" class="btn-quiet btn-quiet-danger" @click="onLogout">
          {{ copy.common.logout }}
        </button>
      </header>
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { SIDEBAR_ENTRIES } from '@/runtime/modules.js';
import { logout, roleLabelOf, session } from '@/runtime/session.js';
import { WEB_CLIENT_VERSION } from '@/runtime/version.js';

const route = useRoute();
const router = useRouter();

const displayName = computed(() => {
  const user = session.user || {};
  const context = session.context || {};
  return user.name || context.name || '';
});

const roleText = computed(() => {
  const context = session.context;
  if (!context) return '';
  const label = context.assignmentLabel || context.identityName || roleLabelOf(context);
  const organization = context.organizationName || '';
  return organization ? organization + ' · ' + label : label;
});

const currentTitle = computed(() => route.meta.title || copy.common.appName);

function isActive(entry) {
  return route.path === entry.match || route.path.startsWith(entry.match + '/');
}

function go(target) {
  router.push(target);
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
</script>
