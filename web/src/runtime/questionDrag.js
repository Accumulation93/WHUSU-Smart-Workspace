import { onBeforeUnmount, onMounted, reactive, watch } from 'vue';

export function useQuestionDrag(pane, questions, blocked, reorder) {
  const state = reactive({ active: false, source: -1, target: -1, question: null, style: {} });
  let pending = null, timer = null, frame = null, pointer = null, originY = 0, latestY = 0, fingerOffset = 0;
  const clear = () => {
    clearTimeout(timer); timer = null; cancelAnimationFrame(frame); frame = null; pending = null; pointer = null;
    Object.assign(state, { active: false, source: -1, target: -1, question: null, style: {} });
  };
  function measure() {
    if (!state.active || !pane.value) return;
    const bounds = pane.value.getBoundingClientRect();
    const edge = Math.min(70, bounds.height * 0.22);
    const delta = latestY < bounds.top + edge ? -Math.min(15, (bounds.top + edge - latestY) / 5)
      : latestY > bounds.bottom - edge ? Math.min(15, (latestY - bounds.bottom + edge) / 5) : 0;
    if (delta) pane.value.scrollTop += delta;
    const cards = Array.from(pane.value.querySelectorAll('[data-question-key]'));
    let insertion = cards.length;
    for (let index = 0; index < cards.length; index++) {
      const rect = cards[index].getBoundingClientRect();
      if (latestY < rect.top + rect.height / 2) { insertion = index; break; }
    }
    state.target = insertion > state.source ? insertion - 1 : insertion;
    const ghostHeight = document.querySelector('.question-ghost')?.getBoundingClientRect().height || 0;
    state.style.top = Math.max(bounds.top, Math.min(bounds.bottom - ghostHeight, latestY - fingerOffset)) + 'px';
    frame = requestAnimationFrame(measure);
  }
  function down(event, index) {
    if (blocked.value || event.button !== 0) return;
    clear(); pointer = event.pointerId; originY = latestY = event.clientY;
    const handle = event.currentTarget;
    pending = index;
    handle.setPointerCapture?.(event.pointerId);
    timer = setTimeout(() => {
      if (blocked.value || pending !== index || !pane.value) { clear(); return; }
      const card = handle.closest('[data-question-key]');
      if (!card) { clear(); return; }
      const rect = card.getBoundingClientRect();
      fingerOffset = originY - rect.top;
      Object.assign(state, { active: true, source: index, target: index, question: { ...questions.value[index] },
        style: { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px' } });
      frame = requestAnimationFrame(measure);
    }, 350);
  }
  function move(event) {
    if (event.pointerId !== pointer) return;
    latestY = event.clientY;
    if (!state.active && Math.abs(latestY - originY) > 10) { clear(); return; }
    if (state.active) event.preventDefault();
  }
  function up(event) {
    if (event.pointerId !== pointer) return;
    if (state.active && !blocked.value && state.target !== state.source) reorder(state.source, state.target);
    clear();
  }
  function visibility() { if (document.hidden) clear(); }
  onMounted(() => { document.addEventListener('visibilitychange', visibility); });
  onBeforeUnmount(() => { clear(); document.removeEventListener('visibilitychange', visibility); });
  watch(blocked, value => { if (value) clear(); });
  return { state, down, move, up, cancel: clear };
}
