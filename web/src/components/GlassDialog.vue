<template>
  <Teleport to="body">
    <div class="dialog-layer" @click.self="close">
      <section ref="panel" class="dialog glass-dialog" :class="{ 'glass-dialog-compact': compact }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
        <header class="dialog-header">
          <span class="dialog-heading stack-tight"><span v-if="eyebrow" class="dialog-eyebrow">{{ eyebrow }}</span><span class="dialog-title">{{ title }}</span></span>
          <button type="button" class="btn-quiet" :disabled="busy" @click="close">{{ ui.close }}</button>
        </header>
        <div class="dialog-body"><slot /></div>
        <footer v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<script>
const stack = [];
let previousOverflow = '';
</script>
<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ui from '@/locales/zh-CN/shared/personnelPicker.js';
const props = defineProps({ title: { type: String, required: true }, eyebrow: String, busy: Boolean, compact: Boolean });
const emit = defineEmits(['close']);
const panel = ref(null);
const identity = {};
let previousFocus;
function close() { if (!props.busy) emit('close'); }
function keyboard(event) {
  if (stack.at(-1) !== identity) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); }
  if (event.key !== 'Tab') return;
  const elements = [...panel.value.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
    .filter(element => element.getClientRects().length);
  if (!elements.length) { event.preventDefault(); panel.value.focus(); return; }
  const first = elements[0];
  const last = elements.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.value)) {
    event.preventDefault(); first.focus();
  }
}
onMounted(async () => {
  previousFocus = document.activeElement;
  if (!stack.length) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  stack.push(identity);
  document.addEventListener('keydown', keyboard);
  await nextTick();
  panel.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboard);
  const index = stack.indexOf(identity);
  if (index >= 0) stack.splice(index, 1);
  if (!stack.length) document.body.style.overflow = previousOverflow;
  if (previousFocus?.isConnected) previousFocus.focus();
});
</script>

<style scoped>
.glass-dialog { overflow: hidden; max-height: calc(100dvh - 2 * var(--ui-page-padding-x)); }
.glass-dialog-compact { max-width: var(--ui-dialog-compact-max-width); }
.dialog-body { overscroll-behavior: contain; }
.dialog-body > :deep(*) { flex-shrink: 0; }
.dialog-heading { min-width: 0; }
.dialog-eyebrow { color: var(--ui-blue-700); font-size: var(--ui-type-caption); }
</style>
