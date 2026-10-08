<template>
  <div class="notification-item" :class="rowClass">
    <span v-if="unread" class="notification-dot" aria-hidden="true"></span>
    <span class="notification-icon" aria-hidden="true">
      <UiIcon :name="iconName" tone="primary" size-role="message-leading" />
    </span>
    <div class="notification-body">
      <div class="portal-message-metadata">
        <div class="portal-message-context-line">
          <span v-if="categoryText" class="chip chip-sky notification-tag">{{ categoryText }}</span>
          <span
            v-if="contextName"
            class="portal-identity-meta"
            :class="{ 'portal-identity-meta-current': item.isCurrentContext === true }"
          >{{ contextName }}</span>
        </div>
        <div
          v-if="organizationName"
          class="portal-organization-meta"
          :class="{ 'portal-organization-meta-current': item.isCurrentOrganization === true }"
        >
          <UiIcon name="home" tone="primary" size-role="message-meta" />
          <span class="portal-organization-name">{{ organizationName }}</span>
          <span v-if="item.isCurrentOrganization === true" class="portal-organization-current">
            {{ copy.portal.current }}
          </span>
        </div>
      </div>
      <button type="button" class="message-open" @click="$emit('open', item)">
        <span class="notification-title">{{ item.title }}</span>
        <span v-if="item.description" class="notification-desc">{{ item.description }}</span>
        <span class="notification-time">{{ timeText }}</span>
      </button>
    </div>
    <div class="list-row-actions">
      <slot name="actions" :item="item"></slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import UiIcon from '@/components/UiIcon.vue';
import copy from '@/locales/zh-CN/index.js';
import { formatListTime } from '@/runtime/dateTime.js';

/**
 * 待办与通知行。
 *
 * 结构与小程序门户一致：左侧图标槽 + 两行元数据（类别与工作角色、组织气泡）
 * + 标题/描述/时间，尾部留出操作区。元数据两行分别独占一行，组织名不拆字，
 * 「当前」固定不收缩。
 */

const props = defineProps({
  item: { type: Object, required: true },
  kind: { type: String, default: 'todo' }
});

defineEmits(['open']);

const unread = computed(() => props.kind === 'notification' && props.item.isRead === false);

const rowClass = computed(() => ({
  'notification-item-todo': props.kind === 'todo',
  'notification-unread': unread.value,
  'notification-read': props.kind === 'notification' && props.item.isRead !== false
}));

const timeText = computed(() => formatListTime(
  props.item.createdAt,
  props.item.createdAtReviewStatus
));

const categoryText = computed(() => {
  if (props.item.categoryLabel) return props.item.categoryLabel;
  return copy.messages.categoryLabels[props.item.category] || '';
});

const contextName = computed(() => props.item.workContextName || '');

const organizationName = computed(() => props.item.organizationName || '');

const iconName = computed(() => {
  const category = props.item.category;
  if (category === 'venue') return 'venue';
  if (category === 'scoring') return 'grid';
  if (props.kind === 'todo') return 'clock';
  return 'bell';
});
</script>

<style scoped>
/*
 * 整行点击区使用块级按钮：文字左对齐、自然增高，长内容换行后仍可点。
 * 尾部操作放在独立区域，避免与打开动作互相触发。
 */
.message-open {
  display: flex;
  flex-direction: column;
  gap: 1px;
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
