<template>
  <GlassDialog :title="copy.admin.memberDetailTitle" :busy="saving || governanceBusy" @close="!saving && !governanceBusy && $emit('close')">
    <AppLoading v-if="loading" :text="copy.common.loading" />
    <div v-else-if="notice" class="stack"><p class="notice-line">{{ notice }}</p><button class="btn btn-secondary" @click="load">{{ directory.retry }}</button></div>
    <div v-else-if="detail" class="stack">
      <div class="detail-identity"><h2>{{ detail.profile.name }}</h2><span class="muted">{{ detail.profile.studentId }}</span><span class="chip">{{ detail.auditStatusText }}</span></div>
      <div v-if="assignments.length" class="stack-tight"><span class="section-title">{{ copy.hr.assignmentLabel }}</span><div v-for="(assignment,index) in assignments" :key="index" class="chip chip-blue">{{ [assignment.identityCategoryName, assignment.department, assignment.workGroup].filter(Boolean).join(' · ') }}</div></div>
      <p v-else class="muted">{{ directory.noPosition }}</p>
      <form id="hr-person-profile" class="detail-fields" @submit.prevent="save">
        <label v-for="field in fields" :key="field.id" class="detail-field">
          <span class="muted">{{ field.label }}</span>
          <template v-if="field.writable">
            <select v-if="field.type === 'sequence'" v-model="values[field.id]" class="field-input" :disabled="saving" :required="field.required"><option value=""></option><option v-for="option in field.options || []" :key="option" :value="option">{{ option }}</option></select>
            <HrDateField v-else-if="['date', 'datetime'].includes(field.type)" v-model="values[field.id]" :label="field.label" :type="field.type" :disabled="saving" :required="field.required" />
            <input v-else v-model="values[field.id]" class="field-input" :type="field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'" :required="field.required" :disabled="saving" :maxlength="field.maxLength" :minlength="field.minLength" :min="field.minValue" :max="field.maxValue" :step="field.allowDecimal === false ? 1 : 'any'" />
          </template>
          <span v-else class="detail-value">{{ field.value || directory.blankValue }}</span>
        </label>
      </form>
      <p v-if="saveNotice" class="notice-line" role="alert">{{ saveNotice }}</p>
    </div>
    <HrAccountGovernance v-if="governanceRow?.personId" :row="governanceRow" @refresh="$emit('refresh', { governanceHrId: hrId })" @busy="governanceBusy=$event" />
    <template v-if="fields.some(field => field.writable) && !notice" #footer><button form="hr-person-profile" type="submit" class="btn btn-primary" :disabled="saving || loading || governanceBusy"><AppLoading v-if="saving" compact />{{ adminUi.copy_71db23a36b }}</button></template>
  </GlassDialog>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import HrDateField from './HrDateField.vue';
import HrAccountGovernance from './HrAccountGovernance.vue';
import adminUi from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import copy from '@/locales/zh-CN/index.js';
import directory from '@/locales/zh-CN/shared/contactDirectory.js';
import formatter from '@/runtime/hrProfileDate.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { personLinkScope } from '@/runtime/personLinks.js';
const props=defineProps({hrId:{type:String,required:true},assignments:{type:Array,default:()=>[]},governanceRow:{type:Object,default:null},canReadProfile:{type:Boolean,default:true}});
defineEmits(['close','refresh']);
const governanceBusy=ref(false);
const detail=ref(null),loading=ref(false),notice=ref('');
const values=ref({}),saving=ref(false),saveNotice=ref('');
const fields=computed(()=>(detail.value?.template?.fields||[]).map(field=>{const raw=detail.value.values?.[field.id];return {...field,writable:detail.value.membershipStatus!=='left'&&(detail.value.writableFieldIds||[]).includes(field.id),value:raw==null?'':field.type==='date'?formatter.formatDateTextOnly(raw):field.type==='datetime'?formatter.formatDateTimeText(raw):String(raw)};}));
let generation=0,alive=true;
async function load(){const request=++generation,scope=personLinkScope();detail.value=null;values.value={};notice.value='';if(document.hidden||!props.canReadProfile)return;loading.value=true;try{const result=requireSuccess(await callApi('getHrPersonDetail',{hrId:props.hrId}));if(alive&&request===generation&&scope===personLinkScope()&&!document.hidden){detail.value=result;values.value={...result.values};}}catch(error){if(alive&&request===generation&&scope===personLinkScope())notice.value=errorText(error,copy.errors.requestFailed);}finally{if(alive&&request===generation)loading.value=false;}}
async function save(){
  if(saving.value||loading.value||!fields.value.some(field=>field.writable))return;
  const expected=personLinkScope(),hrId=props.hrId,request=generation;
  const current=()=>alive&&!document.hidden&&request===generation&&expected===personLinkScope()&&hrId===props.hrId;
  const profileValues={};
  fields.value.filter(field=>field.writable).forEach(field=>{profileValues[field.id]=values.value[field.id]??'';});
  saving.value=true;saveNotice.value='';
  try{requireSuccess(await callApi('saveHrPersonFull',{hrId,profileValues}));if(current())await load();}
  catch(error){if(current())saveNotice.value=errorText(error,copy.errors.requestFailed);}
  finally{saving.value=false;}
}
watch([()=>props.hrId,personLinkScope],load,{immediate:true});
document.addEventListener('visibilitychange',load);
onBeforeUnmount(()=>{alive=false;generation++;detail.value=null;document.removeEventListener('visibilitychange',load);});
</script>
<style scoped>
.detail-identity{display:flex;align-items:center;gap:var(--ui-field-gap);flex-wrap:wrap}.detail-identity h2{font-size:var(--ui-type-section);margin:0}.detail-fields{display:grid;gap:var(--ui-card-gap)}.detail-field{display:flex;flex-direction:column;gap:var(--ui-field-gap);padding:var(--ui-card-padding-y) var(--ui-card-padding-x);background:var(--ui-field-bg);border:var(--ui-result-label-border);border-radius:var(--ui-field-radius)}.detail-value{white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--ui-type-value)}@media(min-width:520px){.detail-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
