<template>
  <div class="stack">
    <div class="row row-wrap">
      <span class="chip" :class="policy.effect === 'deny' ? 'chip-orange' : 'chip-blue'">{{ sections.effectText }}</span>
      <span class="chip chip-sky">{{ sections.enabledText }}</span>
    </div>
    <div v-if="!inspection" class="row row-wrap"><span v-for="(label, index) in sections.capabilityLabels" :key="index" class="chip chip-blue">{{ label }}</span></div>
    <div class="policy-groups">
      <section v-if="!hideSubjects && sections.subjects.length" class="stack-tight">
        <h3 class="field-label">{{ delegation ? ui.delegationSubjects : ui.subjects }}</h3>
        <div v-for="section in sections.subjects" :key="section.key" class="stack-tight">
          <strong>{{ section.label }}</strong>
          <span v-for="line in section.lines" :key="line.key" class="muted">{{ line.label ? ui.dimensionLabel(line.label, line.value) : line.value }}</span>
        </div>
      </section>
      <section class="stack-tight">
        <h3 class="field-label">{{ delegation ? ui.delegationScopeTitle : ui.scopes }}</h3>
        <div v-for="section in sections.scopes" :key="section.key" class="stack-tight">
          <strong>{{ section.label }}</strong>
          <span v-for="line in section.lines" :key="line.key" class="muted">{{ ui.dimensionLabel(line.label, line.value) }}</span>
        </div>
      </section>
    </div>
    <div class="stack-tight">
      <span class="field-label">{{ ui.conditions }}</span>
      <span v-if="!policy.startsAt && !policy.endsAt" class="muted">{{ ui.noConditions }}</span>
      <span v-if="policy.startsAt">{{ ui.startsAt }} · {{ formatListTime(policy.startsAt) }}</span>
      <span v-if="policy.endsAt">{{ ui.endsAt }} · {{ formatListTime(policy.endsAt) }}</span>
    </div>
    <div v-if="!inspection || supportsFields" class="stack-tight">
      <span class="field-label">{{ delegation ? ui.delegationFieldsTitle : ui.fields }}</span>
      <span v-if="inspection && !policy.displayFields?.length" class="muted">{{ ui.effectiveNoVisibleFields }}</span>
      <span v-else-if="!inspection && policy.fields === null" class="muted">{{ ui.allFields }}</span>
      <span v-else v-for="(label, index) in sections.fieldLabels" :key="index">{{ label }}</span>
      <span v-if="inspection" class="muted">{{ ui.effectiveFieldsHelp }}</span>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import presentation from '@/shared/authorizationPresentation.js';
import ui from '@/locales/zh-CN/shared/authorization.js';
import { formatListTime } from '@/runtime/dateTime.js';
const props = defineProps({ policy: { type: Object, required: true }, delegation: { type: Boolean, default: false }, inspection: { type: Boolean, default: false }, supportsFields: { type: Boolean, default: false },
  hideSubjects: { type: Boolean, default: false },
  directory: { type: Object, required: true }, catalog: { type: Array, required: true },
  fieldLabels: { type: Object, default: () => ({}) } });
const sections = computed(() => presentation.policySections(props.inspection ? { ...props.policy, fields: props.policy.displayFields || [] } : props.policy, props.directory, props.catalog, ui));
</script>
<style scoped>
.policy-groups { display: grid; gap: var(--ui-list-gap); grid-template-columns: minmax(0, 1fr); }
.policy-groups section { min-width: 0; overflow-wrap: anywhere; }
.field-label { margin: 0; }
@media (min-width: 520px) { .policy-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
