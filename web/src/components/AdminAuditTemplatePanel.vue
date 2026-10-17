<template>
  <section v-if="canWriteRecord" class="card stack" ref="editor">
    <span class="section-title">{{ native.copy_7312ee863e }}</span>
    <label class="field"><span class="field-label">{{ native.copy_53adcabdff }}</span><input v-model="state.form.name" class="field-input" :disabled="blocked" /></label>
    <label class="field"><span class="field-label">{{ native.copy_e53f7aae11 }}</span><textarea v-model="state.form.description" class="field-input" :disabled="blocked"></textarea></label>
    <label class="field"><span class="field-label">{{ native.copy_a8c395216d }}</span><select v-model="state.form.resubmitMode" class="field-input" :disabled="blocked"><option value="fresh">{{ native.copy_3cd3d7a8c2 }}</option><option value="from_rejector">{{ native.copy_7897981e63 }}</option></select></label>
    <span class="field-label">{{ native.copy_e47b779507 }}</span>
    <p v-if="state.form.starterType !== 'conditions'" class="muted">{{ state.form.starterType === 'self' ? native.copy_ea0c75f8dd : conditionText({conditionType:'identity_scope',departmentScope:'all',workGroupScope:'all',identityScope:'specific',specificIdentityId:state.form.starterIdentityId}) }}</p>
    <div v-for="(condition,index) in state.form.starterConditions" :key="index" class="list-row audit-row"><span>{{ conditionText(condition) }}</span><div class="card-actions"><button class="btn-quiet" :disabled="blocked" @click="editStarter(index)">{{ native.copy_e040ae3016 }}</button><button class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="state.form.starterConditions.splice(index,1)">{{ native.copy_c3e182f0c6 }}</button></div></div>
    <button class="btn-quiet" :disabled="blocked" @click="editStarter(-1)">{{ native.copy_a59dd7ae8d }}</button>
    <div v-for="(step,index) in state.form.steps" :key="index" class="list-row audit-row"><strong>{{ step.name }}</strong><span>{{ actionName(step.actionType) }}</span><span v-for="(condition,position) in step.conditions" :key="position" class="muted">{{ conditionText(condition) }}</span><div class="card-actions"><button class="btn-quiet" :disabled="blocked" @click="editStep(index)">{{ native.copy_16fc906860 }}</button><button class="btn-quiet" :disabled="blocked || index===0" @click="moveStep(index,-1)">↑</button><button class="btn-quiet" :disabled="blocked || index===state.form.steps.length-1" @click="moveStep(index,1)">↓</button><button class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="state.form.steps.splice(index,1)">{{ native.copy_c3e182f0c6 }}</button></div></div>
    <button class="btn-quiet" :disabled="blocked" @click="editStep(-1)">{{ native.copy_b79428bf57 }}</button>
    <p v-if="notice || actionNotice" class="notice-line">{{ notice || actionNotice }} <button v-if="notice" class="btn-quiet" :disabled="busy || loading" @click="load">{{ text.retry }}</button></p>
    <div class="audit-actions"><button class="btn btn-secondary" :disabled="busy || state.pending" @click="reset">{{ copy.common.cancel }}</button><button class="btn btn-primary" :disabled="blocked" @click="save">{{ native.copy_c34e8a16c0 }}</button></div>
  </section>
  <section class="card stack"><span class="section-title">{{ native.copy_e12c6d6080 }}</span><p v-if="loading">{{ copy.common.loading }}</p><p v-else-if="!notice && !rows.length">{{ native.copy_c3ee16b49e }}</p><div v-for="row in rows" :key="row.id" class="list-row audit-row"><strong>{{ row.name }}</strong><span v-if="row.description" class="muted">{{ row.description }}</span><div class="card-actions"><button class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="edit(row)">{{ native.copy_e040ae3016 }}</button><button class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click="remove(row)">{{ native.copy_acc985cabc }}</button></div><details><summary>{{ copy.audit.detailStepsTitle }}</summary><div v-for="step in row.steps" :key="step.id" class="stack-tight"><strong>{{ step.name }}</strong><span>{{ actionName(step.actionType) }}</span><span v-for="(condition,index) in step.conditions" :key="index" class="muted">{{ conditionText(condition) }}</span></div></details></div></section>
  <GlassDialog v-if="stepForm" :title="native.copy_16fc906860" :busy="busy" @close="closeStep">
    <AuditConditionEditor v-if="conditionIndex !== null" allow-submitter :value="stepForm.conditions[conditionIndex]" :directory="directory" @cancel="conditionIndex=null" @confirm="confirmCondition" />
    <template v-else><label class="field"><span class="field-label">{{ native.copy_c5dd070c37 }}</span><input v-model="stepForm.name" class="field-input" /></label><div v-for="(condition,index) in stepForm.conditions" :key="index" class="list-row audit-row"><span>{{ conditionText(condition) }}</span><div class="card-actions"><button class="btn-quiet" @click="conditionIndex=index">{{ native.copy_e040ae3016 }}</button><button class="btn-quiet btn-quiet-danger" @click="stepForm.conditions.splice(index,1)">{{ native.copy_c3e182f0c6 }}</button></div></div><button class="btn-quiet" @click="conditionIndex=-1">{{ native.copy_d3da0e164a }}</button><label class="field"><span class="field-label">{{ native.copy_6ce8bf8393 }}</span><select v-model="stepForm.actionType" class="field-input"><option v-for="action in actions" :key="action" :value="action">{{ actionName(action) }}</option></select></label><UiSwitch :label="native.copy_ec94756105" :checked="stepForm.allowApproverDesignation" @change="stepForm.allowApproverDesignation=$event" /><p v-if="stepNotice" class="notice-line">{{ stepNotice }}</p></template>
    <template v-if="conditionIndex === null" #footer><button class="btn btn-secondary" @click="closeStep">{{ copy.common.cancel }}</button><button class="btn btn-primary" @click="confirmStep">{{ native.copy_bb0ad94473 }}</button></template>
  </GlassDialog>
  <GlassDialog v-if="starterIndex !== null" :title="native.copy_1dc07a45f9" @close="starterIndex=null"><AuditConditionEditor :value="state.form.starterConditions[starterIndex]" :directory="directory" @cancel="starterIndex=null" @confirm="confirmStarter" /></GlassDialog>
</template>
<script setup>
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
const canDeleteRecord = useAdminCapability('audit.templates.delete');
const canWriteRecord = useAdminCapability('audit.templates');
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import GlassDialog from './GlassDialog.vue';
import AuditConditionEditor from './AuditConditionEditor.vue';
import UiSwitch from './UiSwitch.vue';
import copy from '@/locales/zh-CN/index.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/auditBehavior.js';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import governance from '@/locales/zh-CN/shared/adminGovernance.js';
import { clone } from '@/shared/auditInk.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
const props=defineProps({state:Object,disabled:Boolean});const emit=defineEmits(['busy']);
const rows=ref([]),directory=ref({people:[],departments:[],identities:[],workGroups:[]}),loading=ref(true),busy=ref(false),notice=ref(''),actionNotice=ref(''),editor=ref(null);
const stepForm=ref(null),stepIndex=ref(-1),conditionIndex=ref(null),starterIndex=ref(null),stepNotice=ref('');
const requests=auditRequests(),actions=['pass','sign','estamp','both'];let alive=true,sequence=0;
const blocked=computed(()=>props.disabled||loading.value||busy.value||!!notice.value||props.state.pending);
const empty=()=>({id:'',name:'',description:'',starterType:'conditions',starterIdentityId:'',starterHrId:'',starterConditions:[],resubmitMode:'fresh',steps:[]});
function reset(){props.state.form=empty();actionNotice.value='';}
function actionName(action){return({pass:native.copy_8e2f75159e,sign:native.copy_49cbf30d6b,estamp:native.copy_7e6630535d,both:native.copy_a63d02480e})[action];}
function conditionText(condition){
  if(condition.conditionType==='submitter')return governance.auditSubmitter;
  if(condition.conditionType==='person'){const wanted=String(condition.assignmentIds||'').split(',');return directory.value.people.flatMap(person=>person.assignments.filter(item=>wanted.includes(item.assignmentId)).map(item=>person.name+' · '+item.assignmentLabel)).join(messages.copy_17bcc41217)||messages.copy_b9283ec054;}
  const values=[['department','specificDepartmentId','departments',messages.copy_37ad645951],['workGroup','specificWorkGroupId','workGroups',messages.copy_2c67faf1c7],['identity','specificIdentityId','identities',messages.copy_c84650778a]].map(([key,id,list,own])=>condition[key+'Scope']==='own'?own:condition[key+'Scope']==='specific'?directory.value[list].filter(item=>String(condition[id]||'').split(',').includes(item.id)).map(item=>item.name).join(' · '):'').filter(Boolean);
  return values.join(' · ')||native.copy_9a2854d17d;
}
async function load(){const request=++sequence;loading.value=true;try{const [list,metadata]=await Promise.all([requests.call('listAuditFlowTemplates',{}),requests.call('getAuditTemplateEditorData',{})]);requireSuccess(list);requireSuccess(metadata);if(!alive||request!==sequence)return;rows.value=list.templates||[];directory.value=metadata.data;notice.value='';if(props.state.pending){props.state.pending=false;if(props.state.resetAfterRead){props.state.resetAfterRead=false;reset();}}}catch(error){if(alive&&request===sequence)notice.value=errorText(error,copy.errors.requestFailed);}finally{if(alive&&request===sequence)loading.value=false;}}
async function edit(row){if(blocked.value)return;props.state.form=Object.assign(empty(),clone(row));await nextTick();editor.value.scrollIntoView({block:'start'});}
function editStep(index){if(blocked.value)return;stepIndex.value=index;stepForm.value=index<0?{name:'',actionType:'sign',conditions:[],allowApproverDesignation:false}:clone(props.state.form.steps[index]);conditionIndex.value=null;stepNotice.value='';}
function closeStep(){stepForm.value=null;conditionIndex.value=null;}
function confirmStep(){if(!stepForm.value.name.trim()){stepNotice.value=messages.copy_1376e7cf03;return;}if(!stepForm.value.conditions.length){stepNotice.value=messages.copy_b07e47ba3f;return;}const value=clone(stepForm.value);if(stepIndex.value<0)props.state.form.steps.push(value);else props.state.form.steps[stepIndex.value]=value;closeStep();}
function confirmCondition(value){if(conditionIndex.value<0)stepForm.value.conditions.push(value);else stepForm.value.conditions[conditionIndex.value]=value;conditionIndex.value=null;}
function editStarter(index){if(!blocked.value)starterIndex.value=index;}
function confirmStarter(value){props.state.form.starterType='conditions';if(starterIndex.value<0)props.state.form.starterConditions.push(value);else props.state.form.starterConditions[starterIndex.value]=value;starterIndex.value=null;}
function moveStep(index,direction){const list=props.state.form.steps;[list[index],list[index+direction]]=[list[index+direction],list[index]];}
async function save(){if(blocked.value)return;if(!props.state.form.name.trim()){actionNotice.value=messages.copy_cf05c2ba56;return;}if(!props.state.form.steps.length){actionNotice.value=messages.copy_6dc1d42f93;return;}busy.value=true;actionNotice.value='';try{requireSuccess(await callApi('saveAuditFlowTemplate',clone(props.state.form)));if(!alive)return;props.state.pending=true;props.state.resetAfterRead=true;await load();}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_215e3c57da);}finally{if(alive)busy.value=false;}}
async function remove(row){if(blocked.value)return;busy.value=true;try{if(!await confirmAction({title:messages.copy_7f31eec657,body:row.name+'\n'+messages.copy_e32406217a,danger:true,confirmText:native.copy_acc985cabc,cancelText:copy.common.cancel})||!alive)return;requireSuccess(await callApi('deleteAuditFlowTemplate',{id:row.id}));if(!alive)return;props.state.pending=true;props.state.resetAfterRead=props.state.form.id===row.id;await load();}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_076bb5d383);}finally{if(alive)busy.value=false;}}
watch(busy,value=>emit('busy',value),{flush:'sync'});onMounted(load);onBeforeUnmount(()=>{alive=false;sequence++;requests.dispose();emit('busy',false);});
</script>
<style scoped>.audit-row{flex-direction:column;align-items:stretch}.audit-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-action-gap)}.card-actions{display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap)}</style>
