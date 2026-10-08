<template>
  <img
    class="ui-icon"
    :class="['ui-icon-' + tone, sizeRole ? 'ui-icon-size-' + sizeRole : '']"
    :src="src"
    :style="sizeRole ? null : { width: size + 'px', height: size + 'px' }"
    :alt="ariaLabel || ''"
    :aria-hidden="ariaLabel ? null : 'true'"
  />
</template>

<script setup>
import { computed } from 'vue';

/**
 * 与小程序 components/ui-icon 同一个图标体系：直接复用小程序 assets/icons 下的
 * 同一批 SVG（字节一致），色调也沿用小程序的三组滤镜，保证两端的图形与颜色不再有差异。
 *
 * sizeRole 使用语义档位：message-leading / message-meta / message-trailing /
 * context-leading / context-trailing / feature-leading / row-leading。
 * 未传 sizeRole 时按 size（px）渲染，对应小程序的数值 size 用法。
 */

const ICON_NAMES = [
  'bell', 'calendar', 'check', 'chevron-left', 'chevron-right', 'clock', 'edit', 'file',
  'grid', 'home', 'list', 'logout', 'plus', 'search', 'shield', 'signature', 'toast-check',
  'scan', 'toast-info', 'toast-x', 'trash', 'user', 'venue', 'x'
];

const props = defineProps({
  name: { type: String, default: 'home' },
  tone: { type: String, default: 'primary' },
  size: { type: Number, default: 16 },
  sizeRole: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
});

const src = computed(() => {
  const safeName = ICON_NAMES.indexOf(props.name) >= 0 ? props.name : 'home';
  return `${import.meta.env.BASE_URL}icons/${safeName}.svg`;
});
</script>

<style scoped>
/*
 * 尺寸与小程序 components/ui-icon/ui-icon.wxss 逐条对应：
 * 手机档把 rpx 折半为 px，平板竖屏与平板横屏沿用小程序已有的 px 值。
 */
.ui-icon {
  display: block;
  flex-shrink: 0;
  max-width: 100%;
  max-height: 100%;
}

.ui-icon-size-message-leading {
  width: 20px;
  height: 20px;
}

.ui-icon-size-message-meta {
  width: 11px;
  height: 11px;
}

.ui-icon-size-message-trailing {
  width: 15px;
  height: 15px;
}

.ui-icon-size-context-leading {
  width: 14px;
  height: 14px;
}

.ui-icon-size-context-trailing {
  width: 11px;
  height: 11px;
}

.ui-icon-size-feature-leading {
  width: 21px;
  height: 21px;
}

.ui-icon-size-row-leading {
  width: 17px;
  height: 17px;
}

@media (min-width: 520px) {
  .ui-icon-size-message-leading {
    width: 28px;
    height: 28px;
  }

  .ui-icon-size-message-meta {
    width: 15px;
    height: 15px;
  }

  .ui-icon-size-message-trailing {
    width: 18px;
    height: 18px;
  }

  .ui-icon-size-context-leading {
    width: 20px;
    height: 20px;
  }

  .ui-icon-size-context-trailing {
    width: 16px;
    height: 16px;
  }

  .ui-icon-size-feature-leading {
    width: 28px;
    height: 28px;
  }

  .ui-icon-size-row-leading {
    width: 22px;
    height: 22px;
  }
}

@media (min-width: 900px) {
  .ui-icon-size-message-leading {
    width: 24px;
    height: 24px;
  }

  .ui-icon-size-message-meta {
    width: 14px;
    height: 14px;
  }

  .ui-icon-size-message-trailing {
    width: 16px;
    height: 16px;
  }

  .ui-icon-size-context-leading {
    width: 18px;
    height: 18px;
  }

  .ui-icon-size-context-trailing {
    width: 14px;
    height: 14px;
  }

  .ui-icon-size-feature-leading {
    width: 26px;
    height: 26px;
  }

  .ui-icon-size-row-leading {
    width: 20px;
    height: 20px;
  }
}

/* 色调沿用小程序 ui-icon.wxss 的滤镜定义，保证图形颜色一致。 */
.ui-icon-primary {
  filter: none;
}

.ui-icon-muted {
  filter: grayscale(1) saturate(0.2) opacity(0.72);
}

.ui-icon-white {
  filter: brightness(0) invert(1);
}

.ui-icon-danger {
  filter: hue-rotate(112deg) saturate(1.9) brightness(0.98);
}
</style>
