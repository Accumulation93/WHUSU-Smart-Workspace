<template>
  <div v-if="notices.dialog" class="dialog-layer" role="dialog" aria-modal="true">
    <div class="dialog">
      <div class="card-title">{{ notices.dialog.title }}</div>
      <p v-if="notices.dialog.body" class="muted break-all">{{ notices.dialog.body }}</p>
      <div class="dialog-actions">
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
      </div>
    </div>
  </div>
</template>

<script setup>
import copy from '@/locales/zh-CN/index.js';
import { notices, settleDialog } from '@/runtime/notify.js';

function settle(confirmed) {
  settleDialog(confirmed);
}
</script>
