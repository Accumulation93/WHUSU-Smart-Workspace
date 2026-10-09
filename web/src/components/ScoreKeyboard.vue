<template>
  <aside ref="surface" class="score-keyboard" :aria-label="ui.copy_acc0866449">
    <button v-if="collapsed" type="button" class="btn btn-secondary keyboard-expand" :disabled="disabled" @click="$emit('expand')">⌨ {{ ui.copy_fa906e8178 }} ▲</button>
    <template v-else>
      <div class="keyboard-row keyboard-navigation">
        <button type="button" class="btn btn-secondary" :disabled="disabled || index <= 0" @click="$emit('navigate', -1)">◀ {{ ui.copy_e00c90cadd }}</button>
        <output class="keyboard-value">{{ value === '' ? ui.copy_ef8b7ffa9b + ' ' + (index + 1) + ' ' + ui.copy_32ff7fb805 : value + ' ' + ui.copy_717083eab1 }}</output>
        <button type="button" class="btn btn-primary" :disabled="disabled || index >= count - 1" @click="$emit('navigate', 1)">{{ ui.copy_2699b9317a }} ▶</button>
      </div>
      <div class="keyboard-row keyboard-actions">
        <button v-if="scores.length" type="button" class="btn btn-secondary keyboard-toggle" role="switch" :aria-checked="mode === 'quick'" :disabled="disabled" @click="mode = mode === 'quick' ? 'numpad' : 'quick'"><span aria-hidden="true" class="keyboard-toggle-track"><span /></span>{{ ui.copy_acc0866449 }}</button>
        <span v-else />
        <button type="button" class="btn btn-primary" :disabled="disabled" @click="$emit('submit')">{{ ui.copy_e507a2cd28 }} ✓</button>
        <button type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('collapse')">▼ {{ ui.copy_8ec888d575 }}</button>
      </div>
      <div v-if="mode === 'quick' && scores.length" class="keyboard-quick">
        <div v-for="(row, rowIndex) in scoreRows" :key="rowIndex" class="keyboard-row">
          <button v-for="score in row" :key="score" type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('quick', score)">{{ score }}</button>
        </div>
      </div>
      <div v-else class="keyboard-numpad">
        <button v-for="key in keys" :key="key" type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('input', key)">{{ key === 'backspace' ? '⌫' : key }}</button>
      </div>
    </template>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/score/score.js';
import { quickScores } from '@/runtime/scoringInput.js';
const props = defineProps({ question: { type: Object, required: true }, value: { type: String, default: '' }, index: Number, count: Number, collapsed: Boolean, disabled: Boolean });
const emit = defineEmits(['navigate', 'submit', 'collapse', 'expand', 'quick', 'input', 'height']);
const surface = ref(null);
const mode = ref('quick');
const scores = computed(() => quickScores(props.question));
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];
const scoreRows = computed(() => {
  const count = Math.ceil(scores.value.length / 5);
  if (!count) return [];
  const base = Math.floor(scores.value.length / count);
  const remainder = scores.value.length % count;
  let position = 0;
  return Array.from({ length: count }, (_, index) => {
    const size = base + (index < remainder ? 1 : 0);
    const row = scores.value.slice(position, position + size); position += size; return row;
  });
});
watch(scores, values => { if (!values.length) mode.value = 'numpad'; }, { immediate: true });
let observer;
onMounted(() => { observer = new ResizeObserver(() => emit('height', surface.value?.getBoundingClientRect().height || 0)); observer.observe(surface.value); });
onBeforeUnmount(() => { observer?.disconnect(); emit('height', 0); });
</script>

<style scoped>
.score-keyboard { position: fixed; inset-inline: 0; bottom: 0; z-index: 80; background: var(--ui-score-keyboard-bg); border: var(--ui-score-keyboard-border); box-shadow: var(--ui-score-keyboard-shadow); backdrop-filter: var(--ui-surface-blur); padding-bottom: env(safe-area-inset-bottom); max-height: calc(100dvh - var(--ui-navbar-height)); overflow-y: auto; }
.keyboard-row { display: flex; gap: var(--ui-score-key-gap); padding: var(--ui-score-key-gap) var(--ui-score-key-padding); }
.keyboard-row > * { flex: 1; min-width: 0; }
.keyboard-row .btn { min-height: var(--ui-score-key-height); padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x); font-size: var(--ui-type-meta); }
.keyboard-value { display: flex; align-items: center; justify-content: center; background: var(--ui-field-bg); border-radius: var(--ui-field-radius); color: var(--ui-blue-700); font-size: var(--ui-type-value); overflow-wrap: anywhere; }
.keyboard-quick { max-height: var(--ui-score-quick-height); overflow-y: auto; }
.keyboard-numpad { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ui-score-key-gap); padding: var(--ui-score-key-padding); }
.keyboard-numpad .btn { min-height: var(--ui-score-number-height); font-size: var(--ui-type-value); }
.keyboard-expand { width: 100%; }
.keyboard-toggle { gap: var(--ui-score-key-gap); }
.keyboard-toggle-track { width: var(--ui-score-switch-width); height: var(--ui-score-switch-height); border-radius: var(--ui-score-switch-height); background: var(--ui-score-switch-off); flex-shrink: 0; padding: var(--ui-score-switch-inset); display: flex; }
.keyboard-toggle-track > span { width: var(--ui-score-switch-thumb); height: var(--ui-score-switch-thumb); border-radius: 50%; background: var(--ui-field-bg); }
.keyboard-toggle[aria-checked="true"] .keyboard-toggle-track { background: var(--ui-compact-primary-bg); justify-content: flex-end; }
@media (min-width: 900px) {
  .score-keyboard { position: sticky; inset: auto; top: calc(var(--ui-navbar-height) + var(--ui-card-gap)); grid-column: 2; grid-row: 2 / span 4; border-radius: var(--ui-score-keyboard-radius); max-height: calc(100dvh - var(--ui-navbar-height) - var(--ui-card-gap) * 2); }
}
</style>
