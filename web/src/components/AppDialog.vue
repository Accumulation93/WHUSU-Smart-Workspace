<template>
  <div v-if="notices.dialog" class="dialog-layer" role="dialog" aria-modal="true">
    <div class="dialog">
      <div class="dialog-header">
        <span class="dialog-title">{{ notices.dialog.title }}</span>
      </div>
      <div class="dialog-body">
        <p v-if="notices.dialog.body" class="dialog-desc break-all">{{ notices.dialog.body }}</p>
      </div>
      <div class="dialog-footer">
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

/**
 * 与小程序一致的三段结构：固定标题、独立滚动正文、固定操作栏。
 * 模板里不写中文注释，用户可见文案审计会把模板里的中文当成界面文案。
 */
function settle(confirmed) {
  settleDialog(confirmed);
}
</script>
