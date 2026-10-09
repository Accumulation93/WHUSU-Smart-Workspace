<template>
  <div class="shell">
    <header class="shell-bar">
      <div class="shell-bar-inner">
        <button v-if="route.name !== 'portal'" type="button" class="shell-back"
          :aria-label="navbarCopy.backAria" @click="goBack">
          <UiIcon name="chevron-left" tone="primary" size-role="row-leading" />
        </button>
        <span class="shell-heading">{{ currentTitle }}</span>
      </div>
    </header>
    <main class="shell-main"><slot /></main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import navbarCopy from '@/locales/zh-CN/shared/uiNavbar.js';
import UiIcon from '@/components/UiIcon.vue';
import { adminModule } from '@/runtime/adminNavigation.js';

const route = useRoute();
const router = useRouter();
const currentTitle = computed(() => {
  const title = String((route.name === 'adminConsole' ? adminModule(route.query.subApp).label : route.meta.title) || navbarCopy.brandName).trim();
  return title.includes(navbarCopy.brandName) ? title : title + ' - ' + navbarCopy.brandName;
});

function goBack() {
  const previous = router.options.history.state.back;
  if (typeof previous === 'string' && previous !== '/login' && previous !== route.fullPath) router.back();
  else router.replace({ name: 'portal' });
}
</script>
