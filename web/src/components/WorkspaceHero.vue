<template>
  <section class="workspace-hero" :class="{ 'workspace-hero-admin': tone === 'admin' }">
    <div class="workspace-hero-heading">
      <span class="workspace-app-name">{{ appName || copy.common.appName }}</span>
      <span v-if="pageName" class="workspace-page-name">{{ pageName }}</span>
    </div>

    <template v-if="signedIn">
      <h1 class="workspace-person-name">{{ personName }}</h1>
      <div class="workspace-person-summary">
        <span class="workspace-identity">{{ identityName }}</span>
        <span v-if="identityDetail" class="workspace-person-detail">{{ identityDetail }}</span>
      </div>

      <button type="button" class="workspace-context-card" @click="$emit('switch')">
        <span class="workspace-context-icon" aria-hidden="true">
          <UiIcon name="grid" tone="white" size-role="context-leading" />
        </span>
        <span class="workspace-context-copy">
          <span class="workspace-context-label">{{ copy.hero.currentContext }}</span>
          <span class="workspace-organization break-all">{{ organizationName }}</span>
          <span v-if="identityName" class="workspace-context-identity break-all">{{ identityName }}</span>
        </span>
        <span class="workspace-switch-action">
          <span>{{ copy.hero.switchAction }}</span>
          <UiIcon name="chevron-right" tone="white" size-role="context-trailing" />
        </span>
      </button>
    </template>
  </section>
</template>

<script setup>
import UiIcon from '@/components/UiIcon.vue';
import copy from '@/locales/zh-CN/index.js';

/**
 * 共享工作区 Hero，结构与小程序 components/workspace-hero 一致：
 * 顶部是应用名与当前页面名，主体是本人姓名（主标题），下面一行是身份与部门/职能组，
 * 最下面是一条可点击的玻璃行用于切换组织与工作角色。
 * tone="admin" 时使用管理端深蓝渐变，其余页面使用门户亮蓝渐变。
 */
defineProps({
  appName: { type: String, default: '' },
  pageName: { type: String, default: '' },
  tone: { type: String, default: 'blue' },
  signedIn: { type: Boolean, default: true },
  personName: { type: String, default: '' },
  identityName: { type: String, default: '' },
  identityDetail: { type: String, default: '' },
  organizationName: { type: String, default: '' }
});

defineEmits(['switch']);
</script>

<style scoped>
/*
 * 工作角色玻璃行左侧的图标槽：小程序是 50rpx 方形圆角块（手机折半 25px），
 * Pad 竖屏 40px、Pad 横屏 38px，三档都保持同一语义角色。
 */
.workspace-context-icon {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
}

@media (min-width: 520px) {
  .workspace-context-icon {
    width: 40px;
    height: 40px;
    border-radius: 13px;
  }
}

@media (min-width: 900px) {
  .workspace-context-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
  }
}
</style>
