<template>
  <div class="page stack">
    <section class="card stack">
      <div class="card-title">{{ copy.common.notFoundTitle }}</div>
      <p class="muted">{{ copy.common.notFoundBody }}</p>
      <div class="tiles">
        <button
          v-for="entry in SIDEBAR_ENTRIES"
          :key="entry.key"
          type="button"
          class="tile"
          @click="go(entry.route)"
        >
          {{ entry.label }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { SIDEBAR_ENTRIES } from '@/runtime/modules.js';

const router = useRouter();

function go(target) {
  router.replace(target);
}
</script>
