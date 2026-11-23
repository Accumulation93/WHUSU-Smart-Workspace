<template>
  <section v-if="canReadCandidates && (directoryLoading || directoryNotice)" class="card stack" :aria-busy="directoryLoading">
    <AppLoading v-if="directoryLoading" :text="copy.common.loading" />
    <template v-else><p class="notice-line" role="alert">{{ directoryNotice }}</p><button class="btn-quiet" @click="loadDirectory">{{ text.retry }}</button></template>
  </section>
  <section v-if="canWriteRecord && directoryReady" class="card stack" ref="editor">
    <span class="section-title">{{ native.copy_7312ee863e }}</span>
    <label class="field"><span class="field-label">{{ native.copy_53adcabdff }}</span><input v-model="state.form.name" class="field-input" :disabled="blocked" /></label>
    <label class="field"><span class="field-label">{{ native.copy_e53f7aae11 }}</span><textarea v-model="state.form.description" class="field-input" :disabled="blocked"></textarea></label>
    <span class="field-label">{{ native.copy_e47b779507 }}</span>
    <template v-if="state.form.starterType !== 'conditions'"><p v-if="state.form.starterType === 'self'" class="muted">{{ messages.copy_44ce43b050 }}</p><ApprovalConditions v-else :value="conditionView([{conditionType:'identity_scope',departmentScope:'all',workGroupScope:'all',identityScope:'specific',specificIdentityId:state.form.starterIdentityId}],true)" /></template>
    <div v-for="(condition,index) in state.form.starterConditions" :key="index" class="list-row audit-row"><ApprovalConditions :value="conditionView([condition],true)" :show-group-title="false" /><div class="card-actions"><button class="btn-quiet" :disabled="blocked" @click="editStarter(index)">{{ native.copy_e040ae3016 }}</button><button class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="state.form.starterConditions.splice(index,1)">{{ native.copy_c3e182f0c6 }}</button></div></div>
    <button class="btn-quiet" :disabled="blocked" @click="editStarter(-1)">{{ native.copy_a59dd7ae8d }}</button>
    <div v-for="(step,index) in state.form.steps" :key="index" class="list-row audit-row"><strong>{{ step.name }}</strong><span>{{ actionName(step.actionType) }}</span><ApprovalConditions :value="conditionView(step.conditions)" /><div class="card-actions"><button class="btn-quiet" :disabled="blocked" @click="editStep(index)">{{ native.copy_16fc906860 }}</button><button class="btn-quiet" :disabled="blocked || index===0" @click="moveStep(index,-1)">↑</button><button class="btn-quiet" :disabled="blocked || index===state.form.steps.length-1" @click="moveStep(index,1)">↓</button><button class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="state.form.steps.splice(index,1)">{{ native.copy_c3e182f0c6 }}</button></div></div>
    <button class="btn-quiet" :disabled="blocked" @click="editStep(-1)">{{ native.copy_b79428bf57 }}</button>
    <p v-if="actionNotice" class="notice-line">{{ actionNotice }}</p>
    <div class="audit-actions"><button class="btn btn-secondary" :disabled="busy || state.pending" @click="reset">{{ copy.common.cancel }}</button><button class="btn btn-primary" :disabled="blocked" @click="save">{{ native.copy_c34e8a16c0 }}</button></div>
  </section>
  <section class="card stack">
    <span class="section-title">{{ native.copy_e12c6d6080 }}</span>
    <AppLoading v-if="loading" :text="copy.common.loading" />
    <template v-else-if="notice"><p class="notice-line" role="alert">{{ notice }}</p><button class="btn-quiet" :disabled="busy" @click="loadRows">{{ text.retry }}</button></template>
    <p v-else-if="!rows.length">{{ native.copy_c3ee16b49e }}</p>
    <p v-if="actionNotice && !(canWriteRecord && directoryReady)" class="notice-line">{{ actionNotice }}</p>
    <div v-for="row in rows" :key="row.id" class="list-row audit-row">
      <strong>{{ row.name }}</strong><span v-if="row.description" class="muted">{{ row.description }}</span>
      <div v-if="(canUpdateRecord && directoryReady) || canDeleteRecord" class="card-actions">
        <button v-if="canUpdateRecord && directoryReady" class="btn-quiet" :disabled="blocked" @click="edit(row)">{{ native.copy_e040ae3016 }}</button>
        <button v-if="canDeleteRecord" class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="remove(row)">{{ native.copy_acc985cabc }}</button>
      </div>
      <details v-if="row.steps?.length"><summary>{{ copy.audit.detailStepsTitle }}</summary><div v-for="step in row.steps" :key="step.id" class="stack-tight"><strong>{{ step.name }}</strong><span>{{ actionName(step.actionType) }}</span><ApprovalConditions :value="conditionView(step.conditions)" /></div></details>
    </div>
  </section>
  <GlassDialog v-if="stepForm" :title="native.copy_16fc906860" :busy="busy" @close="closeStep">
    <AuditConditionEditor v-if="conditionIndex !== null" allow-submitter :value="stepForm.conditions[conditionIndex]" :directory="directory" @cancel="conditionIndex=null" @confirm="confirmCondition" />
    <template v-else><label class="field"><span class="field-label">{{ native.copy_c5dd070c37 }}</span><input v-model="stepForm.name" class="field-input" /></label><div v-for="(condition,index) in stepForm.conditions" :key="index" class="list-row audit-row"><ApprovalConditions :value="conditionView([condition])" :show-group-title="false" /><div class="card-actions"><button class="btn-quiet" @click="conditionIndex=index">{{ native.copy_e040ae3016 }}</button><button class="btn-quiet btn-quiet-danger" @click="stepForm.conditions.splice(index,1)">{{ native.copy_c3e182f0c6 }}</button></div></div><button class="btn-quiet" @click="conditionIndex=-1">{{ native.copy_d3da0e164a }}</button><label class="field"><span class="field-label">{{ native.copy_6ce8bf8393 }}</span><select v-model="stepForm.actionType" class="field-input"><option v-for="action in actions" :key="action" :value="action">{{ actionName(action) }}</option></select></label><UiSwitch :label="native.copy_ec94756105" :checked="stepForm.allowApproverDesignation" @change="stepForm.allowApproverDesignation=$event.target.checked" /><p v-if="stepNotice" class="notice-line">{{ stepNotice }}</p></template>
    <template v-if="conditionIndex === null" #footer><button class="btn btn-secondary" @click="closeStep">{{ copy.common.cancel }}</button><button class="btn btn-primary" @click="confirmStep">{{ native.copy_bb0ad94473 }}</button></template>
  </GlassDialog>
  <GlassDialog v-if="starterIndex !== null" :title="native.copy_1dc07a45f9" @close="starterIndex=null"><AuditConditionEditor :value="state.form.starterConditions[starterIndex]" :directory="directory" @cancel="starterIndex=null" @confirm="confirmStarter" /></GlassDialog>
</template>
<script setup>
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
const canDeleteRecord = useAdminCapability('audit.templates.delete', 'audit.templates.delete');
const canUpdateRecord = useAdminCapability('audit.templates', 'audit.templates.update');
const canWriteRecord = useAdminCapability('audit.templates', () => props.state.form.id ? 'audit.templates.update' : 'audit.templates.create');
const canReadCandidates = useAdminCapability('audit.templates', 'audit.templateCandidates.read');
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import GlassDialog from './GlassDialog.vue';
import AuditConditionEditor from './AuditConditionEditor.vue';
import ApprovalConditions from './ApprovalConditions.vue';
import conditionBuilder from '@/shared/auditConditionView.js';
import conditionCopy from '@/locales/zh-CN/shared/auditConditions.js';
import UiSwitch from './UiSwitch.vue';
import copy from '@/locales/zh-CN/index.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/auditBehavior.js';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { clone } from '@/shared/auditInk.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { useCopiedConfigurationEditor } from '@/runtime/copiedConfigurationEditor.js';
const props=defineProps({state:Object,disabled:Boolean});const emit=defineEmits(['busy']);
const rows=ref([]),directory=ref({}),loading=ref(true),busy=ref(false),notice=ref(''),actionNotice=ref(''),editor=ref(null);
const directoryLoading = ref(false), directoryNotice = ref(''), directoryLoaded = ref(false);
const directoryReady = computed(() => canReadCandidates.value && directoryLoaded.value);
const stepForm=ref(null),stepIndex=ref(-1),conditionIndex=ref(null),starterIndex=ref(null),stepNotice=ref('');
const requests=auditRequests(),actions=['pass','sign','estamp','both','either'];let alive=true,sequence=0;
const blocked=computed(()=>props.disabled||loading.value||busy.value||!!notice.value||props.state.pending);
const empty=()=>({id:'',name:'',description:'',starterType:'conditions',starterIdentityId:'',starterHrId:'',starterConditions:[],steps:[]});
function templateForm(row){const value=Object.assign(empty(),clone(row));delete value.resubmitMode;return value;}
function reset(){props.state.form=empty();actionNotice.value='';}
function actionName(action){return({pass:native.copy_8e2f75159e,sign:native.copy_49cbf30d6b,estamp:native.copy_7e6630535d,both:native.copy_a63d02480e,either:text.either})[action];}
function conditionView(conditions, starter=false){
  const facts=(conditions||[]).map(condition=>{
    const fact={conditionType:condition.conditionType,unresolved:false};
    fact.natureIds=condition.natureIds;
    fact.natureNames=(directory.value.natures||[]).filter(item=>(condition.natureIds||[]).includes(item.id)).map(item=>item.name);
    const ids=value=>String(value||'').split(',').map(value=>value.trim()).filter(Boolean);
    if(condition.conditionType==='person'){
      const wanted=ids(condition.assignmentIds);
      fact.personKind='assignment';
      fact.personNames=(directory.value.people||[]).flatMap(person=>(person.assignments||[]).filter(item=>wanted.includes(String(item.assignmentId))).map(item=>[person.name,item.assignmentLabel].filter(Boolean).join(' · ')));
      fact.unresolved=!wanted.length||fact.personNames.length!==wanted.length;
    }
    for(const [key,id,list] of [['department','specificDepartmentId','departments'],['workGroup','specificWorkGroupId','workGroups'],['identity','specificIdentityId','identities']]){
      fact[key+'Scope']=condition[key+'Scope'];
      const wanted=ids(condition[id]);
      fact[key+'Names']=(directory.value[list]||[]).filter(item=>wanted.includes(String(item.id))).map(item=>item.name);
      if(fact[key+'Scope']==='specific'&&(!wanted.length||fact[key+'Names'].length!==wanted.length))fact.unresolved=true;
    }
    return fact;
  });
  return starter?conditionBuilder.buildStarterConditions({conditionFacts:facts},conditionCopy,true):conditionBuilder.buildConditions({conditionFacts:facts},conditionCopy);
}
async function loadRows() {
  const request = ++sequence;
  loading.value = true;
  try {
    const result = requireSuccess(await requests.call('listAuditFlowTemplates', {}));
    if (!alive || request !== sequence) return;
    rows.value = result.templates || [];
    notice.value = '';
    if (props.state.pending) {
      props.state.pending = false;
      if (props.state.resetAfterRead) {
        props.state.resetAfterRead = false;
        reset();
      }
    }
  } catch (error) {
    if (alive && request === sequence) notice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    if (alive && request === sequence) loading.value = false;
  }
}
async function loadDirectory() {
  if (!canReadCandidates.value || directoryLoading.value) return;
  directoryLoading.value = true;
  directoryNotice.value = '';
  try {
    const result = requireSuccess(await requests.call('getAuditTemplateEditorData', {}));
    if (!result.data) throw new Error('invalid_directory');
    if (!alive || !canReadCandidates.value) return;
    directory.value = result.data;
    directoryLoaded.value = true;
  } catch (error) {
    if (alive) directoryNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    if (alive) directoryLoading.value = false;
  }
}
async function edit(row){if(blocked.value || !directoryReady.value)return;props.state.form=templateForm(row);await nextTick();editor.value?.scrollIntoView({block:'start'});}
function editStep(index){if(blocked.value)return;stepIndex.value=index;stepForm.value=index<0?{name:'',actionType:'sign',conditions:[],allowApproverDesignation:false}:clone(props.state.form.steps[index]);conditionIndex.value=null;stepNotice.value='';}
function closeStep(){stepForm.value=null;conditionIndex.value=null;}
function confirmStep(){if(!stepForm.value.name.trim()){stepNotice.value=messages.copy_1376e7cf03;return;}if(!stepForm.value.conditions.length){stepNotice.value=messages.copy_b07e47ba3f;return;}const value=clone(stepForm.value);if(stepIndex.value<0)props.state.form.steps.push(value);else props.state.form.steps[stepIndex.value]=value;closeStep();}
function confirmCondition(value){if(conditionIndex.value<0)stepForm.value.conditions.push(value);else stepForm.value.conditions[conditionIndex.value]=value;conditionIndex.value=null;}
function editStarter(index){if(!blocked.value)starterIndex.value=index;}
function confirmStarter(value){props.state.form.starterType='conditions';if(starterIndex.value<0)props.state.form.starterConditions.push(value);else props.state.form.starterConditions[starterIndex.value]=value;starterIndex.value=null;}
function moveStep(index,direction){const list=props.state.form.steps;[list[index],list[index+direction]]=[list[index+direction],list[index]];}
async function save(){if(blocked.value || !directoryReady.value)return;if(!props.state.form.name.trim()){actionNotice.value=messages.copy_cf05c2ba56;return;}if(!props.state.form.steps.length){actionNotice.value=messages.copy_6dc1d42f93;return;}busy.value=true;actionNotice.value='';try{requireSuccess(await callApi('saveAuditFlowTemplate',templateForm(props.state.form)));if(!alive)return;props.state.pending=true;props.state.resetAfterRead=true;await loadRows();}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_215e3c57da);}finally{if(alive)busy.value=false;}}
async function remove(row){if(blocked.value)return;busy.value=true;try{if(!await confirmAction({title:messages.copy_7f31eec657,body:row.name+'\n'+messages.copy_e32406217a,danger:true,confirmText:native.copy_acc985cabc,cancelText:copy.common.cancel})||!alive)return;requireSuccess(await callApi('deleteAuditFlowTemplate',{id:row.id}));if(!alive)return;props.state.pending=true;props.state.resetAfterRead=props.state.form.id===row.id;await loadRows();}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_076bb5d383);}finally{if(alive)busy.value=false;}}
useCopiedConfigurationEditor({ kind: () => 'audit.templates', rows, blocked: () => blocked.value || !canUpdateRecord.value,
  ready: () => !loading.value && !notice.value && directoryReady.value, edit, notice: actionNotice });
watch(busy,value=>emit('busy',value),{flush:'sync'});
watch(canReadCandidates, allowed => {
  if (allowed) {
    loadDirectory();
  } else {
    directory.value = {};
    directoryLoaded.value = false;
    directoryNotice.value = '';
  }
});
onMounted(() => { loadRows(); loadDirectory(); });
onBeforeUnmount(()=>{alive=false;sequence++;requests.dispose();emit('busy',false);});
</script>
<style scoped>.audit-row{flex-direction:column;align-items:stretch}.audit-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-action-gap)}.card-actions{display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap)}</style>
