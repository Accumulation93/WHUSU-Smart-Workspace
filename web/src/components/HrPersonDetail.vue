<template>
  <GlassDialog :title="copy.admin.memberDetailTitle" @close="$emit('close')">
    <AppLoading v-if="loading" :text="copy.common.loading" />
    <div v-else-if="notice" class="stack"><p class="notice-line">{{ notice }}</p><button class="btn btn-secondary" @click="load">{{ directory.retry }}</button></div>
    <div v-else-if="detail" class="stack">
      <div class="detail-identity"><h2>{{ detail.profile.name }}</h2><span class="muted">{{ detail.profile.studentId }}</span><span class="chip">{{ detail.auditStatusText }}</span></div>
      <div v-if="assignments.length" class="stack-tight"><span class="section-title">{{ copy.hr.assignmentLabel }}</span><div v-for="(assignment,index) in assignments" :key="index" class="chip chip-blue">{{ [assignment.identityCategoryName, assignment.department, assignment.workGroup].filter(Boolean).join(' · ') }}</div></div>
      <p v-else class="muted">{{ directory.noPosition }}</p>
      <div class="detail-fields"><div v-for="field in fields" :key="field.id" class="detail-field"><span class="muted">{{ field.label }}</span><span class="detail-value">{{ field.value || directory.blankValue }}</span></div></div>
    </div>
  </GlassDialog>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import copy from '@/locales/zh-CN/index.js';
import directory from '@/locales/zh-CN/shared/contactDirectory.js';
import formatter from '@/runtime/hrProfileDate.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { personLinkScope } from '@/runtime/personLinks.js';
const props=defineProps({hrId:{type:String,required:true},assignments:{type:Array,default:()=>[]}});
defineEmits(['close']);
const detail=ref(null),loading=ref(false),notice=ref('');
const fields=computed(()=>(detail.value?.template?.fields||[]).map(field=>{const raw=detail.value.values?.[field.id];return {...field,value:raw==null?'':field.type==='date'?formatter.formatDateTextOnly(raw):field.type==='datetime'?formatter.formatDateTimeText(raw):String(raw)};}));
let generation=0,alive=true;
async function load(){const request=++generation,scope=personLinkScope();detail.value=null;notice.value='';if(document.hidden)return;loading.value=true;try{const result=requireSuccess(await callApi('getHrPersonDetail',{hrId:props.hrId}));if(alive&&request===generation&&scope===personLinkScope()&&!document.hidden)detail.value=result;}catch(error){if(alive&&request===generation&&scope===personLinkScope())notice.value=errorText(error,copy.errors.requestFailed);}finally{if(alive&&request===generation)loading.value=false;}}
watch([()=>props.hrId,personLinkScope],load,{immediate:true});
document.addEventListener('visibilitychange',load);
onBeforeUnmount(()=>{alive=false;generation++;detail.value=null;document.removeEventListener('visibilitychange',load);});
</script>
<style scoped>
.detail-identity{display:flex;align-items:center;gap:var(--ui-field-gap);flex-wrap:wrap}.detail-identity h2{font-size:var(--ui-type-section);margin:0}.detail-fields{display:grid;gap:var(--ui-card-gap)}.detail-field{display:flex;flex-direction:column;gap:var(--ui-field-gap);padding:var(--ui-card-padding-y) var(--ui-card-padding-x);background:var(--ui-field-bg);border:var(--ui-result-label-border);border-radius:var(--ui-field-radius)}.detail-value{white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--ui-type-value)}@media(min-width:520px){.detail-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
