<template>
  <div class="stack">
    <section class="card stack">
      <span class="section-title">{{ ui.copy_2e6a7d24f3 }}</span>
      <label class="field"><span class="field-label">{{ ui.copy_5aa4cb13ec }}</span><select v-model="activityId" class="field-input" :disabled="busy || loading" @change="loadPublication"><option value="">{{ ui.copy_6d3911624a }}</option><option v-for="activity in activities" :key="activity.id" :value="activity.id">{{ activity.name }}</option></select></label>
      <AppLoading v-if="loading || busy" /><p v-if="notice" role="alert">{{ notice }}</p><button v-if="notice" class="btn-quiet" :disabled="busy || loading" @click="load">{{ copy.common.retry }}</button>
      <p v-if="publicationLoadFailed" role="alert">{{ messages.publicationLoadFailed }}</p><button v-if="publicationLoadFailed" class="btn-quiet" :disabled="busy || loading" @click="loadPublication">{{ messages.publicationRetry }}</button>
      <label v-if="activityId" class="row"><input v-model="published" type="checkbox" :disabled="busy || loading || publicationLoadFailed || !(publication?.id ? canUpdate : canCreate)" />{{ ui.copy_e5c0e22c49 }}</label>
      <button v-if="activityId && (publication?.id ? canUpdate : canCreate)" class="btn btn-primary" :disabled="busy || loading || publicationLoadFailed" @click="savePublication">{{ ui.copy_a7cce01d43 }}</button>
    </section>
    <template v-if="publication?.id">
      <section v-for="kind in kinds" :key="kind.key" class="card stack">
        <div class="panel-head"><strong class="section-title">{{ kind.label }}</strong><div v-if="!publicationLoadFailed && !loading" class="card-actions"><button v-if="canCreate" class="btn-quiet" :disabled="busy" @click="edit(kind.key)">{{ kind.key === 'view' ? ui.newResultViewRule : ui.newMeritDesignationRule }}</button><button v-if="canCreate" class="btn-quiet" :disabled="busy" @click="generate(kind.key)">{{ kind.key === 'view' ? ui.generateViewRules : ui.generateMeritRules }}</button></div></div>
        <p v-if="canCreate && !publicationLoadFailed && !loading" class="muted">{{ kind.key === 'view' ? ui.generateViewRulesHelp : ui.generateMeritRulesHelp }}</p>
        <div v-if="!publicationLoadFailed && !loading && (canDelete || canUpdate) && rules[kind.key].length" class="card-actions"><button class="btn-quiet" :disabled="busy" @click="toggleAll(kind.key)">{{ selected[kind.key].length === rules[kind.key].length ? ui.copy_961862242a : ui.copy_00c8a8f256 }}</button><button v-if="canDelete" class="btn-quiet btn-quiet-danger" :disabled="busy || !selected[kind.key].length" @click="remove(kind.key,selected[kind.key])">{{ ui.copy_acc985cabc }} · {{ selected[kind.key].length }}</button><button v-if="canUpdate && form?.kind===kind.key" class="btn-quiet" :disabled="busy || !selected[kind.key].length || !form.clauses.length" @click="batchApply">{{ kind.key === 'view' ? ui.applySelectedViewRules : ui.applySelectedMeritRules }}</button></div>
        <article v-for="rule in rules[kind.key]" :key="rule.id" class="list-row stack">
          <span class="muted">{{ natureLabel(rule.natureIds) }}</span>
          <label class="row"><input v-if="canDelete || canUpdate" v-model="selected[kind.key]" type="checkbox" :value="rule.id" :disabled="busy || loading || publicationLoadFailed" /><strong>{{ rule.granteeDepartment }} · {{ rule.granteeIdentity }}</strong></label>
          <details v-for="clause in rule.clauses" :key="clause.id">
            <summary>{{ scopeLabel(clause.scopeType, kind.key) }}<template v-if="clause.targetIdentity && (kind.key === 'merit' || identityScopes.includes(clause.scopeType))"> · {{ clause.targetIdentity }}</template></summary>
            <div class="stack-tight">
              <span class="muted">{{ natureLabel(clause.natureIds) }}</span>
              <span v-if="kind.key === 'view'">{{ clause.displayMode === 'grade' ? ui.copy_23eefbcaad : ui.copy_8a8b68c027 }}</span>
              <span v-for="(band,index) in clause.gradeBands || []" :key="index">{{ band.gradeName }} · {{ band.minScore }}–{{ band.maxScore }}</span>
              <span v-if="kind.key === 'merit'">{{ ui.copy_f1dc48a65c }} · {{ clause.quotaLimit }}</span>
              <button v-if="kind.key === 'merit' && canUpdate" class="btn-quiet" :disabled="busy || loading || publicationLoadFailed" @click="openDesignations(rule,clause)">{{ ui.copy_74b0241999 }}</button>
              <span v-for="person in designations.filter(item=>item.clauseId === clause.id)" :key="person.id">{{ person.name || person.targetName }} · {{ person.assignmentLabel }}</span>
            </div>
          </details>
          <div v-if="!publicationLoadFailed && !loading" class="card-actions"><button v-if="canUpdate" class="btn-quiet" :disabled="busy" @click="edit(kind.key,rule)">{{ ui.copy_e040ae3016 }}</button><button v-if="canDelete" class="btn-quiet btn-quiet-danger" :disabled="busy" @click="remove(kind.key,[rule.id])">{{ ui.copy_acc985cabc }}</button></div>
        </article>
      </section>
      <section class="card stack"><div class="panel-head"><strong class="section-title">{{ ui.copy_17a784c758 }}</strong><button v-if="canExport" class="btn-quiet" :disabled="busy" @click="exportSummary">{{ ui.copy_49a7fb10d7 }}</button></div><article v-for="(group,index) in summary" :key="group.clauseId || index" class="list-row stack"><strong>{{ group.granteeDepartment }} · {{ group.granteeIdentity }} · {{ group.targetIdentity }}</strong><span v-for="person in group.members" :key="person.assignmentId || person.id">{{ person.name }} · {{ [person.identity,person.department,person.workGroup].filter(Boolean).join(' · ') }}</span></article></section>
    </template>
    <form v-if="form" ref="editor" class="card stack" @submit.prevent="saveRule">
      <strong>{{ kinds.find(kind=>kind.key===form.kind).label }}</strong>
      <p v-if="form.legacyNatureScope" class="muted">{{ natureCopy.legacyScopeHelp }}</p>
      <div class="field"><span class="field-label">{{ form.kind === 'view' ? natureCopy.resultViewerNatures : natureCopy.meritDesignatorNatures }}</span><div class="chip-group"><button v-for="item in natures" :key="item.id" type="button" class="chip" :class="{'is-active':form.natureIds.includes(item.id)}" :aria-pressed="form.natureIds.includes(item.id)" :disabled="busy" @click="toggleNature(form,item.id,false)">{{ item.name }}</button></div></div>
      <label class="field"><span class="field-label">{{ form.kind === 'view' ? ui.resultViewerDepartments : ui.meritDesignatorDepartments }}</span><select v-model="form.granteeDepartmentId" required class="field-input" :disabled="busy"><option value="">—</option><option v-for="item in departments" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label class="field"><span class="field-label">{{ form.kind === 'view' ? ui.resultViewerIdentity : ui.meritDesignatorIdentity }}</span><select v-model="form.granteeIdentityId" required class="field-input" :disabled="busy || !form.natureIds.length"><option value="">{{ natureCopy.selectIdentity }}</option><option v-for="item in applicableIdentities(form.natureIds)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <p v-if="form.kind === 'merit'" class="muted">{{ ui.meritScopeHelp }}</p>
      <article v-for="(clause,index) in form.clauses" :key="index" class="list-row stack">
        <p v-if="clause.legacyNatureScope" class="muted">{{ natureCopy.legacyScopeHelp }}</p>
        <div class="field"><span class="field-label">{{ form.kind === 'view' ? natureCopy.resultTargetNatures : natureCopy.meritTargetNatures }}</span><div class="chip-group"><button v-for="item in natures" :key="item.id" type="button" class="chip" :class="{'is-active':clause.natureIds.includes(item.id)}" :aria-pressed="clause.natureIds.includes(item.id)" :disabled="busy" @click="toggleNature(clause,item.id,true)">{{ item.name }}</button></div></div>
        <label class="field"><span class="field-label">{{ form.kind === 'view' ? ui.resultViewScopeTitle : ui.meritTargetScopeTitle }}</span><select v-model="clause.scopeType" class="field-input" :disabled="busy"><option v-for="scope in clauseScopes(form.kind, clause.scopeType)" :key="scope.value" :value="scope.value">{{ scope.label }}</option></select></label>
        <label v-if="form.kind==='merit'||identityScopes.includes(clause.scopeType)" class="field"><span class="field-label">{{ form.kind === 'view' ? ui.resultTargetIdentity : ui.meritTargetIdentity }}</span><select v-model="clause.targetIdentityId" required class="field-input" :disabled="busy || !clause.natureIds.length"><option value="">{{ natureCopy.selectIdentity }}</option><option v-for="item in applicableIdentities(clause.natureIds)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <template v-if="form.kind==='view'"><label class="field"><span class="field-label">{{ ui.copy_41f0769610 }}</span><select v-model="clause.displayMode" class="field-input" :disabled="busy"><option value="score">{{ ui.copy_8a8b68c027 }}</option><option value="grade">{{ ui.copy_23eefbcaad }}</option></select></label><template v-if="clause.displayMode==='grade'"><article v-for="(band,bandIndex) in clause.gradeBands" :key="bandIndex" class="stack-tight"><label class="field"><span class="field-label">{{ ui.copy_23eefbcaad }}</span><input v-model="band.gradeName" required class="field-input" :disabled="busy" /></label><label v-for="key in ['minScore','maxScore']" :key="key" class="field"><span class="field-label">{{ key==='minScore'?ui.copy_c536f98c27:ui.copy_c7710f6c1e }}</span><input v-model.number="band[key]" required type="number" step="any" class="field-input" :disabled="busy" /></label><button type="button" class="btn-quiet btn-quiet-danger" :disabled="busy" @click="clause.gradeBands.splice(bandIndex,1)">{{ ui.copy_acc985cabc }}</button></article><button type="button" class="btn-quiet" :disabled="busy" @click="clause.gradeBands.push({gradeName:'',minScore:0,maxScore:100})">{{ ui.copy_5c1dc295d8 }}</button></template></template>
        <template v-else><label class="field"><span class="field-label">{{ ui.copy_f1dc48a65c }}</span><input v-model.number="clause.quotaLimit" type="number" min="0" step="1" required class="field-input" :disabled="busy" /></label><label class="row"><input v-model="clause.requireExactQuota" type="checkbox" :disabled="busy" />{{ ui.copy_063079dbec }}</label></template>
        <button type="button" class="btn-quiet btn-quiet-danger" :disabled="busy" @click="form.clauses.splice(index,1)">{{ ui.copy_acc985cabc }}</button>
      </article>
      <div class="card-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="form.clauses.push(newClause(form.kind))">{{ form.kind==='view'?ui.copy_7ab8854c73:ui.copy_7844b14771 }}</button><button type="submit" class="btn btn-primary" :disabled="busy || !form.clauses.length">{{ form.kind === 'view' ? ui.saveResultViewRule : ui.saveMeritDesignationRule }}</button><button type="button" class="btn btn-secondary" :disabled="busy" @click="form=null">{{ copy.common.cancel }}</button></div>
    </form>
    <PersonnelPicker v-if="picker" mode="assignment" :title="ui.copy_74b0241999" :options="picker.options" :value="picker.selected" @cancel="picker=null" @confirm="saveDesignations" />
  </div>
</template>
<script setup>
import { ref, reactive, nextTick, watch, onBeforeUnmount } from 'vue';
import PersonnelPicker from './PersonnelPicker.vue';
import { useAdminCapability, useAdminAuthorizationAccess } from '@/runtime/adminCapabilities.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { downloadTable } from '@/runtime/tableFiles.js';
import { session } from '@/runtime/session.js';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/publicationBehavior.js';
import utilityCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/adminUtils.js';
import homeCopy from '@/locales/zh-CN/shared/home.js';
import natureCopy from '@/locales/zh-CN/shared/identityNatureRelations.js';
const emit=defineEmits(['busy']),access=useAdminAuthorizationAccess();
const canCreate=useAdminCapability('scoring.publications','scoring.publications.create'),canUpdate=useAdminCapability('scoring.publications','scoring.publications.update'),canDelete=useAdminCapability('scoring.publications.delete','scoring.publications.delete'),canExport=useAdminCapability('scoring.publications','scoring.publications.export');
const activities=ref([]),activityId=ref(''),publication=ref(null),published=ref(false),loading=ref(false),busy=ref(false),notice=ref(''),departments=ref([]),identities=ref([]),summary=ref([]),designations=ref([]),candidates=ref([]),form=ref(null),editor=ref(null),picker=ref(null);
const rules=reactive({view:[],merit:[]}),selected=reactive({view:[],merit:[]});
const publicationLoadFailed=ref(false);
const natures=ref([]);
function natureLabel(ids){return ids?natures.value.filter(item=>ids.includes(item.id)).map(item=>item.name).join(' · ')||natureCopy.mappingInvalid:natureCopy.legacyScope;}
function applicableIdentities(ids){return identities.value.filter(item=>(item.natureIds||[]).some(id=>ids.includes(id)));}
async function toggleNature(target,id,clause){
  const ids=target.natureIds.includes(id)?target.natureIds.filter(value=>value!==id):[...target.natureIds,id];
  const field=clause?'targetIdentityId':'granteeIdentityId',selected=target[field];
  if(selected&&!applicableIdentities(ids).some(item=>item.id===selected)){
    const expected=scope();
    if(!await confirmAction({title:natureCopy.incompatibleSelectionTitle,body:[natureCopy.incompatibleSelectionHelp,identities.value.find(item=>item.id===selected)?.name||''].join('\n')}))return;
    if(disposed||scope()!==expected||!form.value)return;
    target[field]='';
  }
  target.natureIds=ids;
}
async function confirmNatureScopes(value){
  const entries=[value,...value.clauses];
  if(entries.some(item=>!item.natureIds?.length)){notice.value=natureCopy.selectNatureRequired;return false;}
  const expected=scope();
  for(const item of entries.filter(row=>row.legacyNatureScope)){
    if(!await confirmAction({title:natureCopy.legacyScopeChangeTitle,body:natureCopy.legacyScopeChangeHelp(natures.value.filter(row=>item.natureIds.includes(row.id)).map(row=>row.name))}))return false;
    if(disposed||scope()!==expected||form.value!==value)return false;
  }
  return true;
}
let loadedActivityId='';
const kinds=[{key:'view',label:ui.copy_17903d1b98},{key:'merit',label:ui.copy_09bf239b61}],identityScopes=['identity_only','same_department_identity','same_work_group_identity'];
const scopes=[['own_results','copy_9a4a6e8793'],['same_work_group_identity','copy_3787c80077'],['same_work_group_all','copy_fd80cc149b'],['same_department_identity','copy_c70c40dae1'],['same_department_all','copy_8e7c345003'],['all_people','copy_1580e09c5c']].map(([value,key])=>({value,label:utilityCopy[key]}));
const meritScopes=[{value:'all_people',aliases:['all_people','identity_only'],label:ui.meritScopeOrganization},{value:'same_department_identity',aliases:['same_department_identity','same_department_all'],label:ui.meritScopeDepartment},{value:'same_work_group_identity',aliases:['same_work_group_identity','same_work_group_all'],label:ui.meritScopeWorkGroup}];
const scopeLabel=(value,kind)=>kind==='merit'?(meritScopes.find(item=>item.aliases.includes(value))?.label||ui.meritScopeUnknown):(scopes.find(item=>item.value===value)?.label||homeCopy.publicationGroupUnknown);
const clauseScopes=(kind,current)=>kind==='view'?scopes:meritScopes.map(item=>({value:item.aliases.includes(current)?current:item.value,label:item.label}));
let generation=0,disposed=false;
const scope=()=>[session.context?.organizationId,session.context?.contextId].join('|');
async function load(){const request=++generation,expected=scope();loading.value=true;try{const result=requireSuccess(await callApi('listScoreActivities',{}));if(disposed||request!==generation||expected!==scope())return;activities.value=result.list||[];if(!activities.value.some(row=>row.id===activityId.value))activityId.value=result.currentActivityId||activities.value[0]?.id||'';if(access.value?.mode!=='enforced'){const [deps,ids]=await Promise.all([callApi('listDepartments',{}).then(requireSuccess),callApi('listIdentities',{}).then(requireSuccess)]);if(disposed||request!==generation||expected!==scope())return;departments.value=deps.departments||[];identities.value=ids.identities||[];}await loadPublication();}catch(error){if(!disposed&&request===generation)notice.value=errorText(error,messages.copy_e52119b17e);}finally{loading.value=false;}}
async function loadPublication(){
  const request=++generation,expected=scope(),id=activityId.value;
  form.value=null;picker.value=null;
  if(loadedActivityId!==id){publication.value=null;rules.view=[];rules.merit=[];summary.value=[];candidates.value=[];designations.value=[];natures.value=[];}
  if(!id){publicationLoadFailed.value=false;return;}
  loading.value=true;let configurationLoaded=false;
  try{
    const result=requireSuccess(await callApi('getResultPublication',{activityId:id}));
    if(disposed||request!==generation||expected!==scope())return;
    configurationLoaded=true;loadedActivityId=id;publicationLoadFailed.value=false;
    publication.value=result.publication;published.value=!!result.publication?.isPublished;
    rules.view=result.viewRules||[];rules.merit=result.meritRules||[];selected.view=[];selected.merit=[];
    candidates.value=result.assignmentCandidates||[];designations.value=result.meritListDesignations||[];
    natures.value=result.configurationCandidates?.natures||[];
    if(result.configurationCandidates){departments.value=result.configurationCandidates.departments||[];identities.value=result.configurationCandidates.identities||[];}
    notice.value='';
    if(publication.value){const response=requireSuccess(await callApi('getMeritListSummary',{activityId:id}));if(!disposed&&request===generation&&expected===scope())summary.value=response.groups||[];}
  }catch(error){if(!disposed&&request===generation){publicationLoadFailed.value=!configurationLoaded;notice.value=configurationLoaded?errorText(error,messages.copy_e52119b17e):'';}}
  finally{if(!disposed&&request===generation)loading.value=false;}
}
async function write(name,data,allowed){if(busy.value||loading.value||publicationLoadFailed.value||loadedActivityId!==activityId.value||!allowed)return;const expected=scope(),id=activityId.value;busy.value=true;notice.value='';try{requireSuccess(await callApi(name,data));if(disposed||scope()!==expected||activityId.value!==id)return;await loadPublication();}catch(error){if(!disposed&&scope()===expected)notice.value=errorText(error,messages.copy_215e3c57da);}finally{busy.value=false;}}
function savePublication(){return write('saveResultPublication',{activityId:activityId.value,isPublished:published.value},publication.value?.id?canUpdate.value:canCreate.value);}
function newClause(kind){return {natureIds:[],scopeType:kind==='view'?'own_results':'all_people',targetIdentityId:'',displayMode:'score',gradeBands:[],quotaLimit:0,requireExactQuota:false};}
async function edit(kind,row){
  if(busy.value||!(row?canUpdate.value:canCreate.value))return;
  form.value={kind,id:row?.id||'',publicationId:publication.value.id,granteeDepartmentId:row?.granteeDepartmentId||'',granteeIdentityId:row?.granteeIdentityId||'',natureIds:[...(row?.natureIds||[])],legacyNatureScope:!!row&&!row.natureIds,
    clauses:row?JSON.parse(JSON.stringify(row.clauses)).map(clause=>({...clause,natureIds:clause.natureIds||[],legacyNatureScope:!clause.natureIds})):[newClause(kind)]};
  await nextTick();editor.value?.scrollIntoView({block:'start'});
}
function ruleClauses(value){return value.clauses.map(clause=>({...(value.kind==='view'?{scopeType:clause.scopeType,targetIdentityId:identityScopes.includes(clause.scopeType)?clause.targetIdentityId:'',displayMode:clause.displayMode,gradeBands:clause.displayMode==='grade'?clause.gradeBands:[]}:{scopeType:clause.scopeType,targetIdentityId:clause.targetIdentityId,quotaLimit:Number(clause.quotaLimit),requireExactQuota:clause.requireExactQuota}),natureIds:clause.natureIds}));}
async function saveRule(){const value=form.value;if(!value||!await confirmNatureScopes(value))return;return write(value.kind==='view'?'savePubViewRule':'savePubMeritRule',{id:value.id,publicationId:value.publicationId,natureIds:value.natureIds,granteeDepartmentId:value.granteeDepartmentId,granteeIdentityId:value.granteeIdentityId,clauses:ruleClauses(value)},value.id?canUpdate.value:canCreate.value);}
function toggleAll(kind){selected[kind]=selected[kind].length===rules[kind].length?[]:rules[kind].map(row=>row.id);}
async function batchApply(){
  const value=form.value;if(!value||!canUpdate.value||busy.value)return;
  const expected=scope(),chosen=rules[value.kind].filter(row=>selected[value.kind].includes(row.id));if(!chosen.length)return;
  const title=value.kind==='view'?ui.applySelectedViewRules:ui.applySelectedMeritRules;
  const explanation=value.kind==='view'?ui.replaceViewRuleClausesConfirm:ui.replaceMeritRuleClausesConfirm;
  if(!await confirmAction({title,body:[explanation,...chosen.map(row=>row.granteeDepartment+' · '+row.granteeIdentity)].join('\n')}))return;
  if(disposed||scope()!==expected||form.value!==value)return;
  if(!await confirmNatureScopes(value))return;
  const clauses=ruleClauses(value);
  if(chosen.some(row=>!row.natureIds)&&!await confirmAction({title:natureCopy.legacyScopeChangeTitle,body:natureCopy.legacyScopeChangeHelp(natures.value.filter(row=>value.natureIds.includes(row.id)).map(row=>row.name))}))return;
  if(disposed||scope()!==expected||form.value!==value)return;
  return write(value.kind==='view'?'batchSavePubViewRules':'batchSavePubMeritRules',{rules:chosen.map(row=>({id:row.id,publicationId:publication.value.id,natureIds:row.natureIds||value.natureIds,granteeDepartmentId:row.granteeDepartmentId,granteeIdentityId:row.granteeIdentityId,clauses}))},canUpdate.value);
}
async function remove(kind,ids){if(!canDelete.value||busy.value)return;const values=ids.slice();if(!await confirmAction({title:messages.copy_7f31eec657,body:messages.copy_80406a7947.replace('{0}',values.length),danger:true}))return;return write(kind==='view'?'batchDeletePubViewRules':'batchDeletePubMeritRules',{ruleIds:values},canDelete.value);}
function generate(kind){return write(kind==='view'?'generatePubViewRules':'generatePubMeritRules',{publicationId:publication.value.id},canCreate.value);}
function openDesignations(rule,clause){if(!canUpdate.value||busy.value)return;const workGroups=new Set(candidates.value.filter(item=>item.departmentId===rule.granteeDepartmentId&&item.identityId===rule.granteeIdentityId&&item.workGroupId).map(item=>item.workGroupId));const options=candidates.value.filter(item=>(!clause.targetIdentityId||item.identityId===clause.targetIdentityId)&&(clause.scopeType==='all_people'||clause.scopeType==='identity_only'||((clause.scopeType==='same_department_identity'||clause.scopeType==='same_department_all')&&item.departmentId===rule.granteeDepartmentId)||((clause.scopeType==='same_work_group_identity'||clause.scopeType==='same_work_group_all')&&item.departmentId===rule.granteeDepartmentId&&workGroups.has(item.workGroupId)))).map(item=>({...item,id:item.assignmentId}));const ids=new Set(designations.value.filter(item=>item.clauseId===clause.id).map(item=>item.targetAssignmentId||item.assignmentId));picker.value={clauseId:clause.id,options,selected:options.filter(item=>ids.has(item.assignmentId))};}
async function saveDesignations(items){if(!picker.value)return;const data={clauseId:picker.value.clauseId,publicationId:publication.value.id,designationAssignmentIds:items.map(item=>item.assignmentId)};picker.value=null;await write('saveMeritListDesignations',data,canUpdate.value);}
async function exportSummary(){if(!canExport.value||busy.value)return;const expected=scope();busy.value=true;try{const result=requireSuccess(await callApi('exportMeritListSummary',{activityId:activityId.value,filterDepartment:'',filterIdentity:'',filterWorkGroup:''}));if(!disposed&&expected===scope())downloadTable(result.fileContent,result.fileName,result.extension);}catch(error){if(!disposed)notice.value=errorText(error,messages.copy_2b61466286);}finally{busy.value=false;}}
watch(busy,value=>emit('busy',value));watch(scope,()=>{generation++;loadedActivityId='';publicationLoadFailed.value=false;activityId.value='';activities.value=[];publication.value=null;rules.view=[];rules.merit=[];selected.view=[];selected.merit=[];summary.value=[];candidates.value=[];designations.value=[];form.value=null;picker.value=null;load();});onBeforeUnmount(()=>{disposed=true;generation++;emit('busy',false);});load();
</script>
