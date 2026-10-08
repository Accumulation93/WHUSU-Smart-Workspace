<template>
  <div class="shell">
    <div class="shell-bar">
      <div class="shell-bar-inner">
        <span class="shell-bar-brand">
          {{ copy.common.appName }}
          <span class="shell-bar-version">{{ copy.common.webVersionLabel }} {{ WEB_CLIENT_VERSION }}</span>
        </span>
        <span class="shell-bar-title">{{ currentTitle }}</span>
        <span class="shell-bar-user">
          <span class="shell-bar-user-name">{{ displayName }}</span>
          <span class="shell-bar-user-role">{{ roleText }}</span>
        </span>
        <button type="button" class="btn-quiet" @click="go({ name: 'portal' })">
          {{ copy.common.goPortal }}
        </button>
        <button type="button" class="btn-quiet btn-quiet-danger" @click="onLogout">
          {{ copy.common.logout }}
        </button>
      </div>

      <nav class="shell-tabs">
        <div class="shell-tabs-inner" :class="{ 'shell-tabs-inner-scroll': tabs.length > 5 }">
          <button
            v-for="entry in tabs"
            :key="entry.key"
            type="button"
            class="shell-tab"
            :class="{ 'shell-tab-active': isActive(entry) }"
            @click="go(entry.route)"
          >
            {{ entry.label }}
          </button>
        </div>
      </nav>
    </div>

    <main class="shell-main">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { shellTabsForRole } from '@/runtime/modules.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { logout, roleLabelOf, session } from '@/runtime/session.js';
import { WEB_CLIENT_VERSION } from '@/runtime/version.js';

const route = useRoute();
const router = useRouter();

// 吸顶玻璃条把品牌、当前页名、当前用户与页签放在同一层玻璃表面上。
const tabs = computed(() => shellTabsForRole(session.activeRole));

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
