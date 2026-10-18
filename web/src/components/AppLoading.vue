<template>
  <span class="app-loading" role="status" :aria-label="text || copy.common.loading">
    <span class="spinner" aria-hidden="true"></span>
    <span v-if="!compact">{{ text || copy.common.loading }}</span>
  </span>
</template>
<script setup>
import copy from '@/locales/zh-CN/index.js';
defineProps({ text: { type: String, default: '' }, compact: Boolean });
</script>
