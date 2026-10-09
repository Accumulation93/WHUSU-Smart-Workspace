<template>
  <GlassDialog v-if="notices.dialog" :title="notices.dialog.title" compact @close="settle(false)">
        <p v-if="notices.dialog.body" class="dialog-desc break-all">{{ notices.dialog.body }}</p>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="settle(false)">
          {{ notices.dialog.cancelText || copy.common.cancel }}
        </button>
        <button
          type="button"
          class="btn"
          :class="notices.dialog.danger ? 'btn-danger' : 'btn-primary'"
          @click="settle(true)"
        >
          {{ notices.dialog.confirmText || copy.common.confirm }}
        </button>
      </template>
  </GlassDialog>
</template>

<script setup>
import copy from '@/locales/zh-CN/index.js';
import GlassDialog from './GlassDialog.vue';
import { notices, settleDialog } from '@/runtime/notify.js';

function settle(confirmed) {
  settleDialog(confirmed);
}
</script>
