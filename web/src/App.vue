<template>
  <AppShell v-if="showShell">
    <RouterView v-slot="{ Component }">
      <KeepAlive :key="directoryScope" :include="retainedPages" :max="1">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </AppShell>
  <RouterView v-else />
  <AppToaster />
  <AppDialog />
</template>

<script setup>
import { computed, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import AppDialog from '@/components/AppDialog.vue';
import AppShell from '@/components/AppShell.vue';
import AppToaster from '@/components/AppToaster.vue';
import { session } from '@/runtime/session.js';

const route = useRoute();
const router = useRouter();
const directoryScope = computed(() => [session.status, session.user?.id, session.context?.organizationId, session.context?.contextId].join('|'));
const retainedPages = computed(() => ['scoringTasks', 'scoringFill'].includes(route.name) ? ['ScoringTasksView'] : []);

// 登录页和"页面不存在"不套导航外壳，其余页面统一进入工作区布局。
const showShell = computed(() => session.status === 'authenticated'
  && route.name !== 'login'
  && route.name !== 'notFound');

// 登录状态在页面使用过程中失效时，回到登录页由用户重新认证，不自动重试。
watch(() => session.status, (status) => {
  if (status === 'anonymous' && route.name !== 'login' && route.meta.requiresAuth) {
    router.replace({ name: 'login', query: { reason: 'expired' } });
  }
});
</script>
