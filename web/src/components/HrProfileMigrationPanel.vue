<template>
  <section class="card stack">
    <div class="panel-head"><strong class="section-title">{{ ui.requestSection }}</strong><div class="card-actions"><button v-if="canRequest || canExecute" class="btn btn-secondary" :disabled="busy" @click="open">{{ ui.entry }}</button><button class="btn-quiet" :disabled="busy" @click="load">{{ common.common.retry }}</button></div></div>
    <AppLoading v-if="loading || busy" /><p v-if="notice" role="alert">{{ notice }}</p>
    <article v-for="row in requests" :key="row.id" class="list-row stack"><div class="row row-wrap"><strong>{{ row.sourceOrgName }} → {{ row.targetOrgName }}</strong><span class="chip">{{ statusLabel(row.status) }}</span></div><span>{{ ui.peoplePrefix }}{{ row.personCount }}{{ ui.peopleSuffix }}</span><span v-if="row.rejectReason">{{ row.rejectReason }}</span><div class="card-actions"><button v-if="row.pendingForMe && canApprove" class="btn-quiet" :disabled="busy" @click="review(row,'approve')">{{ ui.approve }}</button><button v-if="row.pendingForMe && canApprove" class="btn-quiet btn-quiet-danger" :disabled="busy" @click="rejecting=row">{{ ui.reject }}</button><button v-if="row.canCancel && canRequest" class="btn-quiet" :disabled="busy" @click="cancel(row)">{{ ui.cancelRequest }}</button></div></article>
    <span v-if="!loading && !requests.length" class="empty-state">{{ ui.emptyRequests }}</span>
  </section>
  <form v-if="draft" ref="editor" class="card stack" @submit.prevent="preview">
    <strong class="section-title">{{ ui.title }}</strong>
    <p class="muted">{{ ui.transferScopeNotice }}</p><p>{{ ui.targetOrg }}{{ ui.sep }}{{ session.context?.organizationName }}</p>
    <label class="field"><span class="field-label">{{ ui.sourceOrg }}</span><select v-model="draft.sourceOrgId" required class="field-input" :disabled="busy" @change="sourceChanged"><option value="">{{ ui.sourceOrgPlaceholder }}</option><option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option></select></label>
    <button type="button" class="btn btn-secondary" :disabled="busy || !draft.sourceOrgId" @click="picker=true">{{ ui.selectMembers }} · {{ ui.selectedCount(draft.people.length) }}</button>
    <span v-if="draft.sourceOrgId && !draft.fields.length" class="muted">{{ ui.noSourceFields }}</span>
    <article v-for="field in draft.fields" :key="field.sourceFieldId" class="list-row stack"><strong>{{ field.label }}</strong><label class="field"><span class="field-label">{{ ui.fieldPlanTitle }}</span><select v-model="field.action" class="field-input" :disabled="busy" @change="invalidate"><option value="skip">{{ ui.actionSkip }}</option><option value="copy">{{ ui.actionCopy }}</option></select></label><template v-if="field.action==='copy'"><label class="field"><span class="field-label">{{ ui.targetField }}</span><select v-model="field.targetTemplateFieldId" required class="field-input" :disabled="busy" @change="invalidate"><option value="">—</option><option v-for="target in field.targets" :key="target.id" :value="target.id">{{ target.label }}</option></select></label><label class="field"><span class="field-label">{{ ui.conflictTitle }}</span><select v-model="field.conflictPolicy" class="field-input" :disabled="busy" @change="invalidate"><option value="keep">{{ ui.keep }}</option><option value="overwrite">{{ ui.overwrite }}</option></select></label></template></article>
    <section v-if="draft.blockers.length" class="stack"><strong>{{ ui.reportTitle }}</strong><HrValueIssue v-for="(row,index) in draft.blockers" :key="[row.personId,row.sourceFieldId,index].join(':')" :item="row" /></section>
    <section v-if="draft.conflicts.length" class="stack"><strong>{{ ui.conflictTitle }}</strong><span v-for="(row,index) in draft.conflicts" :key="index">{{ row.personName || row.memberName }} · {{ row.fieldLabel || row.sourceLabel }}</span></section>
    <p v-if="notice" role="alert">{{ notice }}</p><div class="card-actions"><button type="submit" class="btn btn-secondary" :disabled="busy || !draft.people.length">{{ ui.preview }}</button><button v-if="draft.token && !draft.blockers.length && (draft.direct ? canExecute : canRequest)" type="button" class="btn btn-primary" :disabled="busy" @click="submit">{{ draft.direct ? ui.applyDirect : ui.submitRequest }}</button><button type="button" class="btn btn-secondary" :disabled="busy" @click="draft=null">{{ ui.cancelText }}</button></div>
  </form>
  <PersonnelPicker v-if="picker && draft" mode="person" :title="ui.selectMembers" :options="members" :value="draft.people" @cancel="picker=false" @confirm="peopleSelected" />
  <GlassDialog v-if="rejecting" :title="ui.reject" :busy="busy" @close="rejecting=null"><label class="field"><span class="field-label">{{ ui.rejectReasonPlaceholder }}</span><textarea v-model="reason" class="field-input" :disabled="busy" /></label><template #footer><button class="btn btn-danger" :disabled="busy || !reason.trim()" @click="review(rejecting,'reject')">{{ ui.reject }}</button></template></GlassDialog>
</template>
<script setup>
import { ref,watch,nextTick,onBeforeUnmount } from 'vue';
import PersonnelPicker from './PersonnelPicker.vue';
import GlassDialog from './GlassDialog.vue';
import HrValueIssue from './HrValueIssue.vue';
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
import { callApi,requireSuccess,errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
import ui from '@/locales/zh-CN/shared/hrProfileMigration.js';
import common from '@/locales/zh-CN/index.js';
const emit=defineEmits(['busy']);
const statusLabel=status=>({pending:ui.statusPending,executed:ui.statusExecuted,rejected:ui.statusRejected,cancelled:ui.statusCancelled}[status]||ui.statusUnknown);
const canRequest=useAdminCapability('hr.people','hr.profileMigration.request'),canExecute=useAdminCapability('hr.profileMigration.execute','hr.profileMigration.execute'),canApprove=useAdminCapability('hr.profile_review','hr.profileMigration.approve');
const requests=ref([]),organizations=ref([]),members=ref([]),draft=ref(null),picker=ref(false),rejecting=ref(null),reason=ref(''),editor=ref(null),notice=ref(''),busy=ref(false),loading=ref(false);
let generation=0,alive=true;
const scope=()=>[session.context?.organizationId,session.context?.contextId].join('|');
async function load(){const request=++generation,expected=scope();loading.value=true;try{const result=requireSuccess(await callApi('listCrossOrgMigrationRequests',{}));if(!alive||request!==generation||scope()!==expected)return;const own=result.myRequests||[],pending=(result.pendingForMe||[]).map(row=>({...row,pendingForMe:true}));requests.value=[...pending,...own.filter(row=>!pending.some(item=>item.id===row.id))];notice.value='';}catch(error){if(alive&&request===generation)notice.value=errorText(error,ui.failed);}finally{if(alive&&request===generation)loading.value=false;}}
async function operation(action){if(busy.value)return;const expected=scope(),request=generation;busy.value=true;notice.value='';try{await action(()=>alive&&scope()===expected&&request===generation);}catch(error){if(alive&&scope()===expected)notice.value=errorText(error,ui.failed);}finally{busy.value=false;}}
async function open(){if(!canRequest.value&&!canExecute.value)return;await operation(async current=>{const result=requireSuccess(await callApi('getCrossOrgMigrationContext',{}));if(!current())return;organizations.value=result.visibleOrgs||[];draft.value={sourceOrgId:'',people:[],fields:[],token:'',blockers:[],conflicts:[],direct:result.canDirect===true};await nextTick();editor.value?.scrollIntoView({block:'start'});});}
function invalidate(){if(!draft.value)return;draft.value.token='';draft.value.blockers=[];draft.value.conflicts=[];}
async function sourceChanged(){invalidate();draft.value.people=[];draft.value.fields=[];members.value=[];if(!draft.value.sourceOrgId)return;const id=draft.value.sourceOrgId;await operation(async current=>{const result=requireSuccess(await callApi('getCrossOrgMigrationContext',{sourceOrgId:id}));if(!current()||!draft.value||draft.value.sourceOrgId!==id)return;members.value=(result.members||[]).map(row=>({id:row.personId,personId:row.personId,name:row.name}));draft.value.fields=(result.sourceFields||[]).map(field=>({sourceFieldId:field.id,label:field.label,action:'skip',targetTemplateFieldId:'',conflictPolicy:'keep',targets:(result.targetFields||[]).filter(target=>target.type==='text'||target.type===field.type||field.type==='text')}));});}
function peopleSelected(rows){draft.value.people=rows;picker.value=false;invalidate();}
function payload(){return {sourceOrgId:draft.value.sourceOrgId,personIds:draft.value.people.map(row=>row.personId),fieldActions:draft.value.fields.map(field=>({sourceFieldId:field.sourceFieldId,action:field.action,targetTemplateFieldId:field.action==='copy'?field.targetTemplateFieldId:'',conflictPolicy:field.conflictPolicy}))};}
async function preview(){if(!draft.value?.people.length||(!canRequest.value&&!canExecute.value))return;await operation(async current=>{const result=await callApi('previewCrossOrgMigration',payload());if(result.status!=='mapping_blocked')requireSuccess(result);if(!current())return;Object.assign(draft.value,{token:result.switchToken||'',blockers:result.blockers||[],conflicts:result.conflicts||[]});});}
async function submit(){
  if(!draft.value?.token||draft.value.blockers.length||!(draft.value.direct?canExecute.value:canRequest.value))return;
  const expected=scope(),value={...payload(),switchToken:draft.value.token},direct=draft.value.direct;
  const source=organizations.value.find(org=>org.id===value.sourceOrgId);
  const lines=[ui.sourceOrg+ui.sep+(source?.name||''),ui.targetOrg+ui.sep+(session.context?.organizationName||''),ui.transferScopeNotice,ui.confirmTransferPeople(value.personIds.length),draft.value.people.map(row=>row.name).join('、')];
  for(const field of draft.value.fields){
    const target=field.targets.find(item=>item.id===field.targetTemplateFieldId);
    lines.push(field.label+ui.sep+(field.action==='skip'?ui.actionSkip:ui.actionCopy+' · '+(target?.label||'')+' · '+(field.conflictPolicy==='overwrite'?ui.overwrite:ui.keep)));
  }
  if(!await confirmAction({title:ui.confirmTransferTitle,body:lines.join('\n'),confirmText:direct?ui.applyDirect:ui.submitRequest}))return;
  if(!alive||expected!==scope()||draft.value?.token!==value.switchToken||!(direct?canExecute.value:canRequest.value))return;
  await operation(async current=>{requireSuccess(await callApi(direct?'applyCrossOrgMigration':'submitCrossOrgMigrationRequest',value));if(!current())return;draft.value=null;await load();});
}
async function review(row,action){if(!canApprove.value||(action==='reject'&&!reason.value.trim()))return;await operation(async current=>{requireSuccess(await callApi('reviewCrossOrgMigrationRequest',{id:row.id,action,reason:action==='reject'?reason.value.trim():''}));if(!current())return;rejecting.value=null;reason.value='';await load();});}
async function cancel(row){if(!row.canCancel||!canRequest.value||!await confirmAction({title:ui.cancelRequest,body:row.sourceOrgName+' → '+row.targetOrgName}))return;await operation(async current=>{requireSuccess(await callApi('cancelCrossOrgMigrationRequest',{id:row.id}));if(current())await load();});}
watch(busy,value=>emit('busy',value));watch(scope,()=>{generation++;requests.value=[];members.value=[];draft.value=null;picker.value=false;rejecting.value=null;load();});onBeforeUnmount(()=>{alive=false;generation++;emit('busy',false);});load();
</script>
