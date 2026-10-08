<template>
  <div class="toast-layer" aria-live="polite">
    <div v-for="toast in notices.toasts" :key="toast.id" class="toast">{{ toast.text }}</div>
  </div>
</template>

<script setup>
import { notices } from '@/runtime/notify.js';
</script>
