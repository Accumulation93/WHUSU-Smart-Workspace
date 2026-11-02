<template>
  <section v-if="organizations.length" class="stack">
    <article v-for="organization in organizations" :key="organization.organizationId" class="list-row stack">
      <strong>{{ organization.organizationName }}</strong>
      <div v-for="assignment in organization.assignments" :key="assignment.id" class="row row-wrap">
        <span>{{ [assignment.assignmentNatureLabel,assignment.identityCategoryName||assignment.identity,assignment.department,assignment.workGroup].filter(Boolean).join(' · ') }}</span>
        <button v-if="editable(organization,assignment)" type="button" class="btn-quiet" :disabled="busy" @click="edit(organization,assignment)">{{ ui.copy_e040ae3016 }}</button>
      </div>
      <button v-if="organization.canAddAssignment ?? organization.canEditAssignments" type="button" class="btn-quiet" :disabled="busy" @click="edit(organization)">{{ ui.copy_9242c7c6e4 }}</button>
    </article>
    <AppLoading v-if="busy" /><p v-if="notice" role="alert">{{ notice }}</p>
    <form v-if="draft" class="card stack" @submit.prevent="save">
      <label class="field"><span class="field-label">{{ ui.hrAssignmentNature }}</span><select v-model="draft.assignmentKind" required class="field-input" :disabled="busy || !writable('assignmentNature')"><option value="">{{ personnel.chooseAssignmentNature }}</option><option v-for="item in dictionaries.assignmentNatures" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <button v-if="canCreateNature && writable('assignmentNature') && !natureOpen" type="button" class="btn-quiet" :disabled="busy" @click="natureOpen=true">{{ personnel.addAssignmentNature }}</button>
      <section v-if="natureOpen" class="stack-tight">
        <label class="field"><span class="field-label">{{ personnel.assignmentNatureName }}</span><input v-model="natureName" maxlength="80" class="field-input" :disabled="busy || !!savedNatureId" /></label>
        <div class="card-actions"><button type="button" class="btn btn-secondary" :disabled="busy || !natureName.trim()" @click="saveNature">{{ savedNatureId?personnel.dictionaryRetry:personnel.createAndSelectNature }}</button><button type="button" class="btn-quiet" :disabled="busy" @click="natureOpen=false;natureName='';savedNatureId=''">{{ ui.copy_06dbb49961 }}</button></div>
      </section>
      <label class="field"><span class="field-label">{{ ui.copy_7ee1272d5b }}</span><select v-model="draft.departmentId" required class="field-input" :disabled="busy || !writable('departmentId')" @change="draft.workGroupId=''"><option value="">{{ ui.copy_eada426deb }}</option><option v-for="item in dictionaries.departments" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label class="field"><span class="field-label">{{ ui.hrIdentityCategory }}</span><select v-model="draft.identityId" required class="field-input" :disabled="busy || !writable('identityCategoryId')"><option value="">{{ ui.copy_d1856227b6 }}</option><option v-for="item in dictionaries.identities" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label class="field"><span class="field-label">{{ ui.copy_97a5c04e0f }}</span><select v-model="draft.workGroupId" class="field-input" :disabled="busy || !writable('workGroupId')"><option value="">{{ ui.copy_fe59d1afcd }}</option><option v-for="item in dictionaries.workGroups.filter(item=>item.departmentId===draft.departmentId)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <div class="card-actions"><button type="submit" class="btn btn-primary" :disabled="busy || natureOpen || savedAssignment">{{ ui.copy_1b38edadcc }}</button><button type="button" class="btn btn-secondary" :disabled="busy" @click="draft=null">{{ ui.copy_06dbb49961 }}</button><button v-if="savedAssignment" type="button" class="btn-quiet" :disabled="busy" @click="reloadSaved">{{ personnel.dictionaryRetry }}</button></div>
    </form>
  </section>
</template>
<script setup>
import { ref,computed,watch,onBeforeUnmount } from 'vue';
import { callApi,requireSuccess,errorText } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import common from '@/locales/zh-CN/index.js';
const props=defineProps({hrId:{type:String,required:true}}),emit=defineEmits(['busy','refresh']);
const organizations=ref([]),draft=ref(null),busy=ref(false),notice=ref(''),canCreateNature=ref(false),natureOpen=ref(false),natureName=ref(''),savedNatureId=ref(''),savedAssignment=ref(false);
const empty={departments:[],identities:[],workGroups:[],assignmentNatures:[]};
const dictionaries=computed(()=>({...empty,...organizations.value.find(row=>row.organizationId===draft.value?.organizationId)?.dictionaries}));
const scope=()=>[session.context?.organizationId,session.context?.contextId,props.hrId].join('|');
let alive=true,generation=0;
function editable(org,row){return org.canEditAssignments && (row.canEdit ?? true);}
function writable(field){return !draft.value?.id || !draft.value.writableFields || draft.value.writableFields.includes('*') || draft.value.writableFields.includes(field);}
async function read(){const result=requireSuccess(await callApi('listPersonIdentities',{hrId:props.hrId}));return result.organizations||[];}
async function load(){const version=++generation,expected=scope();organizations.value=[];draft.value=null;try{const rows=await read();if(alive&&version===generation&&scope()===expected)organizations.value=rows;}catch(error){if(alive&&version===generation)notice.value=errorText(error,common.errors.requestFailed);}}
async function edit(org,row){if(busy.value||!(row?editable(org,row):(org.canAddAssignment??org.canEditAssignments)))return;generation++;const version=generation,expected=scope();draft.value={id:row?.id||'',hrId:org.hrId,organizationId:org.organizationId,assignmentKind:row?.assignmentKind||'',departmentId:row?.departmentId||'',identityId:row?.identityCategoryId||row?.identityId||'',workGroupId:row?.workGroupId||'',writableFields:row?.writableFields};natureOpen.value=false;natureName.value='';savedNatureId.value='';savedAssignment.value=false;canCreateNature.value=false;notice.value='';if(org.organizationId!==session.context?.organizationId)return;try{const result=requireSuccess(await callApi('listAssignmentNatures',{}));if(alive&&version===generation&&scope()===expected&&draft.value)canCreateNature.value=result.canCreate===true;}catch{}}
async function operation(action){if(busy.value)return;const version=generation,expected=scope();busy.value=true;notice.value='';try{await action(()=>alive&&version===generation&&scope()===expected&&!!draft.value);}catch(error){if(alive&&version===generation&&scope()===expected)notice.value=errorText(error,common.errors.requestFailed);}finally{busy.value=false;}}
async function saveNature(){if(!canCreateNature.value||!writable('assignmentNature')||!natureName.value.trim())return;await operation(async current=>{let id=savedNatureId.value;if(!id){const result=requireSuccess(await callApi('saveAssignmentNature',{name:natureName.value.trim()}));if(!current())return;id=result.nature?.id;if(!id)throw new Error(common.errors.requestFailed);savedNatureId.value=id;}const rows=await read();if(!current())return;const choices=rows.find(row=>row.organizationId===draft.value.organizationId)?.dictionaries?.assignmentNatures||[];if(!choices.some(row=>row.id===id))throw new Error(personnel.chooseAssignmentNature);organizations.value=rows;draft.value.assignmentKind=id;natureOpen.value=false;natureName.value='';savedNatureId.value='';});}
async function reloadSaved(){await operation(async current=>{const rows=await read();if(!current())return;organizations.value=rows;draft.value=null;savedAssignment.value=false;emit('refresh');});}
async function save(){if(!draft.value||natureOpen.value||savedAssignment.value)return;await operation(async current=>{const {writableFields,...payload}=draft.value;requireSuccess(await callApi('saveMembershipAssignment',payload));if(!current())return;savedAssignment.value=true;const rows=await read();if(!current())return;organizations.value=rows;draft.value=null;savedAssignment.value=false;emit('refresh');});}
watch(busy,value=>emit('busy',value));watch(scope,load,{immediate:true});onBeforeUnmount(()=>{alive=false;generation++;draft.value=null;organizations.value=[];emit('busy',false);});
</script>
