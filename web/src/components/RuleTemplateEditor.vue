<template>
  <section class="list-row template-editor stack">
    <label class="field"><span class="field-label">{{ ui.copy_5a49161fd7 }}</span><select v-model="form.clauseTemplateId" class="field-input" :aria-label="ui.copy_5a49161fd7" :disabled="disabled" @change="form.clauseTemplateName=templates.find(row=>row.id===form.clauseTemplateId)?.name || ''"><option value="">{{ ui.copy_961b3afe6a }}</option><option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option></select></label>
    <label class="field"><span class="field-label">{{ ui.copy_30e235fb56 }}</span><input v-model="form.clauseTemplateWeight" class="field-input" inputmode="decimal" :disabled="disabled" /></label>
    <label class="field"><span class="field-label">{{ ui.copy_02151fbb6a }}</span><select v-model="form.clauseCalculationMethod" class="field-input" :aria-label="ui.copy_02151fbb6a" :disabled="disabled" @change="form.clauseTrimHighCount=0;form.clauseTrimLowCount=0"><option value="weighted_average">{{ ui.copy_cd3540aaf7 }}</option><option value="trim_extremes">{{ ui.copy_7cf822347d }}</option></select></label>
    <div v-if="form.clauseCalculationMethod === 'trim_extremes'" class="number-fields"><label class="field"><span class="field-label">{{ ui.copy_413624a39e }}</span><input v-model="form.clauseTrimHighCount" class="field-input" inputmode="numeric" :disabled="disabled" /></label><label class="field"><span class="field-label">{{ ui.copy_061e85a1bb }}</span><input v-model="form.clauseTrimLowCount" class="field-input" inputmode="numeric" :disabled="disabled" /></label></div>
    <div class="editor-actions"><button type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('save')">{{ ui.copy_7e4100d002 }}</button><button type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('cancel')">{{ ui.copy_06dbb49961 }}</button></div>
  </section>
</template>
<script setup>
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
defineProps({form:{type:Object,required:true},templates:Array,disabled:Boolean});defineEmits(['save','cancel']);
</script>
<style scoped>
.template-editor { flex-direction:column;align-items:stretch;min-width:0; }
.number-fields,.editor-actions { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-inline-gap); }
</style>
