<template><a v-if="target" class="person-link" :href="router.resolve(personLinkRoute(target)).href" @click.stop.prevent="open" @keydown.stop>{{ name }}</a><span v-else>{{ name }}</span></template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { personLinkScope, personLinkRoute, resolvePersonLink } from '@/runtime/personLinks.js';
const props = defineProps({ name: String, hrId: String, assignmentId: String, personId: String, reference: String });
const router = useRouter(), target = ref(null);
const reference = computed(() => props.reference ? { kind: 'reference', id: props.reference } : props.assignmentId ? { kind: 'assignment', id: props.assignmentId } : props.hrId ? { kind: 'hr', id: props.hrId } : props.personId ? { kind: 'person', id: props.personId } : null);
let generation = 0, alive = true;
async function refresh() {
  const request = ++generation, scope = personLinkScope(); target.value = null;
  if (!reference.value || document.hidden) return;
  const value = await resolvePersonLink(reference.value);
  if (alive && !document.hidden && request === generation && scope === personLinkScope()) target.value = value;
}
async function open() { await refresh(); if (target.value) router.push(personLinkRoute(target.value)); }
watch([reference, personLinkScope], refresh, { immediate: true });
document.addEventListener('visibilitychange', refresh);
onBeforeUnmount(() => { alive = false; generation++; target.value = null; document.removeEventListener('visibilitychange', refresh); });
</script>
<style scoped>.person-link{color:var(--ui-blue-700);text-decoration:underline;text-underline-offset:0.2em;cursor:pointer}.person-link:focus-visible{outline:2px solid var(--ui-blue-700);outline-offset:2px}</style>
