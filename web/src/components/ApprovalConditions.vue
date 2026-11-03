<template>
  <div v-if="value.groups.length" class="stack">
    <p v-if="value.hint" class="muted">{{ value.hint }}</p><p v-if="value.valuesHint" class="muted">{{ value.valuesHint }}</p>
    <section v-for="group in value.groups" :key="group.title" class="list-row stack-tight">
      <strong v-if="showGroupTitle">{{ group.title }}</strong><p>{{ group.text }}</p>
      <div v-for="row in group.rows" :key="row.key" class="field"><span class="field-label">{{ row.label }}</span><span>{{ row.value }}</span></div>
      <p v-if="group.notice" class="notice-line">{{ group.notice }}</p>
    </section>
  </div>
</template>
<script setup>
defineProps({value:{type:Object,required:true},showGroupTitle:{type:Boolean,default:true}});
</script>
