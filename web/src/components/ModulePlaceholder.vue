<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <section class="card stack">
      <div class="section-title">{{ title }}</div>
      <p class="muted">{{ copy.common.building }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { roleLabelOf, session } from '@/runtime/session.js';

/**
 * 尚未迁入网页版的页面占位。它保证路由与构建在模块开发期间始终可用，
 * 模块实现完成后对应的视图文件会替换掉这个占位。
 */

defineProps({
  title: { type: String, default: '' }
});

const router = useRouter();

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
</script>
