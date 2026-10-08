<template>
  <div class="list-row">
    <span v-if="unread" class="unread-dot" aria-hidden="true"></span>
    <div class="list-row-main">
      <button type="button" class="message-open" @click="$emit('open', item)">
        <span class="list-row-title break-all">{{ item.title }}</span>
        <span v-if="item.description" class="muted break-all">{{ item.description }}</span>
        <span class="row row-wrap">
          <span class="list-row-time">{{ timeText }}</span>
          <span v-if="categoryText" class="chip chip-sky">{{ categoryText }}</span>
        </span>
      </button>
    </div>
    <div class="list-row-actions">
      <slot name="actions" :item="item"></slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import copy from '@/locales/zh-CN/index.js';
import { formatListTime } from '@/runtime/dateTime.js';

const props = defineProps({
  item: { type: Object, required: true },
  kind: { type: String, default: 'todo' }
});

defineEmits(['open']);

const unread = computed(() => props.kind === 'notification' && props.item.isRead === false);

const timeText = computed(() => formatListTime(
  props.item.createdAt,
  props.item.createdAtReviewStatus
));

const categoryText = computed(() => copy.messages.categoryLabels[props.item.category] || '');
</script>

<style scoped>
/*
 * 整行点击区使用块级按钮：文字左对齐、自然增高，长内容换行后仍可点。
 * 操作按钮放在独立区域，避免与打开动作互相触发。
 */
.message-open {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
