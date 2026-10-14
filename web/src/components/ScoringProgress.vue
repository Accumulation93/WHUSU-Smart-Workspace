<template>
  <div class="scoring-progress" :class="{ inline }">
    <span v-if="!inline" class="progress-count">{{ countText }}</span>
    <span class="progress-track"><span class="progress-fill" :style="{ width: percent + '%', '--ui-progress-color': color }" /></span>
    <span v-if="inline" class="progress-count">{{ countText }}</span>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ submitted: Number, expected: Number, inline: Boolean, countOnly: Boolean });
const percent = computed(() => Math.max(0, Math.min(100, props.expected ? props.submitted / props.expected * 100 : 100)));
const countText = computed(() => `${props.submitted}/${props.expected}` + (props.countOnly ? '' : ` (${Math.round(percent.value)}%)`));
const color = computed(() => {
  const t = percent.value / 100;
  const hue = t < 0.35 ? t / 0.35 * 30 : t < 0.65 ? 30 + (t - 0.35) / 0.30 * 25 : 55 + (t - 0.65) / 0.35 * 85;
  return `hsl(${Math.round(hue)}, ${Math.round(85 + Math.sin(t * Math.PI) * 10)}%, ${Math.round(50 + Math.sin(t * Math.PI) * 8)}%)`;
});
</script>
<style scoped>
.scoring-progress { display: flex; flex-direction: column; gap: var(--ui-label-gap); min-width: 0; width: 100%; }
.progress-track { display: block; flex: none; min-width: 0; height: var(--ui-result-progress-height); border-radius: var(--ui-compact-radius); overflow: hidden; background: var(--ui-result-progress-bg); box-shadow: var(--ui-result-progress-shadow); }
.progress-fill { display: block; height: 100%; background: linear-gradient(90deg, var(--ui-result-progress-highlight), var(--ui-progress-color)); box-shadow: var(--ui-result-progress-glow); }
.progress-count { font-size: var(--ui-type-caption); color: var(--ui-text-soft); overflow-wrap: anywhere; }
.inline { flex-direction: row; align-items: center; flex-wrap: wrap; }
.inline .progress-track { flex: 1 1 var(--ui-result-progress-inline-height); max-width: var(--ui-result-progress-inline-width); height: var(--ui-result-progress-inline-height); }
</style>
