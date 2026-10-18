<template>
  <div class="stack">
    <section v-if="loadNotice || loading || !activity" class="card stack"><AppLoading v-if="loading && !loadNotice" /><p v-else role="alert">{{ loadNotice || messages.copy_4e36c10a9e }}</p><button v-if="loadNotice" type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button></section>
    <section v-if="canWriteRecord" ref="categoryEditor" class="card stack">
      <span class="list-row-title">{{ ui.copy_557a7fc9dc }}</span>
      <label class="field"><span class="field-label">{{ ui.copy_2c2a412327 }}</span><select v-model="form.scorerDepartmentId" class="field-input" :aria-label="ui.copy_2c2a412327" :disabled="blocked" @change="form.scorerDepartment=departments.find(row=>row.id===form.scorerDepartmentId)?.name || ''"><option value="">{{ ui.copy_eada426deb }}</option><option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option></select></label>
      <label class="field"><span class="field-label">{{ ui.copy_bf4cf396ad }}</span><select v-model="form.scorerIdentityId" class="field-input" :aria-label="ui.copy_bf4cf396ad" :disabled="blocked" @change="form.scorerIdentity=identities.find(row=>row.id===form.scorerIdentityId)?.name || ''"><option value="">{{ ui.copy_d1856227b6 }}</option><option v-for="identity in identities" :key="identity.id" :value="identity.id">{{ identity.name }}</option></select></label>
      <div class="rule-actions"><button type="button" class="btn btn-primary" :disabled="blocked" @click="save">{{ ui.copy_04d8c1a10d }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="reset">{{ ui.copy_32d3256b22 }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="apply">{{ ui.copy_08b30a529d }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="generate">{{ ui.copy_40f8a2873c }}</button></div>
      <div class="switch-row"><div class="stack-tight"><span class="field-label">{{ ui.copy_b2c24eb575 }}</span><span class="muted">{{ ui.copy_47cdc1cd32 }}</span></div><UiSwitch :checked="form.allowSelfAssessment" :label="ui.copy_b2c24eb575" :disabled="blocked" @change="form.allowSelfAssessment=$event.target.checked" /></div>
      <p v-if="actionNotice" role="alert">{{ actionNotice }}</p>
    </section>
    <section v-if="canWriteRecord" class="card stack">
      <div class="panel-head"><span class="list-row-title">{{ ui.copy_ec62916da5 }}</span><button type="button" class="btn-quiet" :disabled="blocked" @click="openClause()">{{ ui.copy_80708ed559 }}</button></div>
      <p v-if="!form.clauses.length" class="muted">{{ ui.copy_1f4cbedfa9 }}</p>
      <article v-for="(clause,index) in form.clauses" :key="index" class="list-row rule-row stack">
        <strong>{{ clause.targetIdentity || ui.copy_c2453e59bf }}</strong><div class="row row-wrap"><span class="chip chip-blue">{{ scopeLabel(clause.scopeType) }}</span><span class="chip chip-sky">{{ clause.targetIdentity || ui.copy_05686d877c }}</span><span class="chip" :class="clause.requireAllComplete ? 'chip-orange' : 'chip-green'">{{ clause.requireAllComplete ? ui.copy_096f7b8d26 : ui.copy_cfe99b2433 }}</span></div>
        <div v-for="config in clause.templateConfigs" :key="config.templateId" class="stack-tight"><strong>{{ config.templateName }}</strong><div class="row row-wrap"><span class="chip chip-blue">{{ ui.copy_30e235fb56 }} {{ config.weight }}</span><span class="chip chip-sky">{{ ui.copy_b06b169d19 }} {{ config.sortOrder }}</span><span v-if="config.calculationMethod==='trim_extremes'" class="chip chip-orange">{{ ui.copy_5dc621d7b8 }} {{ ui.copy_92b82a2c4b }}{{ config.trimHighCount }}{{ ui.copy_1e53bfa3db }}{{ config.trimLowCount }})</span></div></div>
        <div class="card-actions"><button type="button" class="btn-quiet" :disabled="blocked" @click="openClause(index)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="removeClause(index)">{{ ui.copy_acc985cabc }}</button></div>
      </article>
    </section>
    <section v-if="form.isRuleClauseEditorVisible" ref="clauseEditor" class="card stack">
      <div class="panel-head"><div class="stack-tight"><span class="list-row-title">{{ ui.copy_7616809fea }}</span><span class="muted">{{ form.clauseEditingIndex>=0 ? ui.copy_75d14ce844 : ui.copy_67055d67dc }}</span></div><button type="button" class="btn-quiet" :disabled="blocked" @click="openConfig(form.clauseTemplateConfigs.length)">{{ ui.copy_104a8f33bb }}</button></div>
      <label class="field"><span class="field-label">{{ ui.copy_4a52d5ce73 }}</span><select v-model="form.clauseScope" class="field-input" :aria-label="ui.copy_4a52d5ce73" :disabled="blocked"><option v-for="scope in RULE_SCOPE_OPTIONS" :key="scope.value" :value="scope.value">{{ scope.label }}</option></select></label>
      <label class="field"><span class="field-label">{{ ui.copy_ca92a29121 }}</span><select v-model="form.clauseTargetIdentityId" class="field-input" :aria-label="ui.copy_ca92a29121" :disabled="blocked" @change="form.clauseTargetIdentity=identities.find(row=>row.id===form.clauseTargetIdentityId)?.name || ''"><option value="">{{ ui.copy_6de6e1f11f }}</option><option v-for="identity in identities" :key="identity.id" :value="identity.id">{{ identity.name }}</option></select></label>
      <div class="switch-row"><div class="stack-tight"><span class="field-label">{{ ui.copy_6a286f4221 }}</span><span class="muted">{{ ui.copy_4cf8cbfee4 }}</span></div><UiSwitch :checked="form.clauseRequireAllComplete" :label="ui.copy_6a286f4221" :disabled="blocked" @change="form.clauseRequireAllComplete=$event.target.checked" /></div>
      <span v-if="configs.length || state.configIndex>=0" class="list-row-title">{{ ui.copy_2f04d84ba3 }}</span>
      <div ref="configPane" class="config-pane stack">
        <div v-for="(config,index) in configs" :key="config.key" class="stack">
          <article class="list-row rule-row stack-tight" :data-question-key="config.key" :class="{'rule-dragging':drag.state.active && drag.state.source===index}">
            <div class="row"><button type="button" class="btn-quiet drag-handle" :disabled="blocked" :aria-label="config.templateName" @pointerdown="drag.down($event,index)" @pointermove="drag.move" @pointerup="drag.up" @pointercancel="drag.cancel" @lostpointercapture="drag.cancel">≡</button><button type="button" class="btn-quiet" :disabled="blocked || index===0" @click="moveConfig(index,index-1)">↑</button><button type="button" class="btn-quiet" :disabled="blocked || index===configs.length-1" @click="moveConfig(index,index+1)">↓</button></div>
            <strong>{{ config.templateName }}</strong><div class="row row-wrap"><span class="chip chip-blue">{{ ui.copy_30e235fb56 }} {{ config.weight }}</span><span class="chip chip-sky">{{ ui.copy_b06b169d19 }} {{ config.sortOrder }}</span></div>
            <div class="card-actions"><button type="button" class="btn-quiet" :disabled="blocked" @click="openConfig(index)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="removeConfig(index)">{{ ui.copy_acc985cabc }}</button></div>
          </article>
          <RuleTemplateEditor v-if="state.configIndex===index" :form="form" :templates="templates" :disabled="blocked" @save="saveConfig" @cancel="cancelConfig" />
        </div>
      </div>
      <RuleTemplateEditor v-if="state.configIndex===configs.length" :form="form" :templates="templates" :disabled="blocked" @save="saveConfig" @cancel="cancelConfig" />
      <p v-if="editNotice" role="alert">{{ editNotice }}</p>
      <div class="rule-actions"><button type="button" class="btn btn-secondary" :disabled="blocked" @click="saveClause">{{ form.clauseEditingIndex>=0 ? ui.copy_374780cd3d : ui.copy_8d32562588 }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="cancelClause">{{ ui.copy_6dd2900f2a }}</button></div>
    </section>
    <section class="card stack">
      <div class="panel-head"><span class="list-row-title">{{ ui.copy_fd2708bef0 }}</span><span class="muted">{{ filtered.length }} / {{ rows.length }}</span></div>
      <div class="rule-actions"><label class="field"><span class="field-label">{{ ui.copy_1a978b0d52 }}</span><select v-model="state.filters.department" class="field-input" :aria-label="ui.copy_1a978b0d52" :disabled="blocked"><option value="">{{ messages.copy_31d4595959 }}</option><option v-for="name in filterDepartments" :key="name">{{ name }}</option></select></label><label class="field"><span class="field-label">{{ ui.copy_12367d56b7 }}</span><select v-model="state.filters.identity" class="field-input" :aria-label="ui.copy_12367d56b7" :disabled="blocked"><option value="">{{ messages.copy_31d4595959 }}</option><option v-for="name in filterIdentities" :key="name">{{ name }}</option></select></label></div>
      <div class="rule-actions"><button type="button" class="btn btn-secondary" :disabled="blocked" @click="toggleAll">{{ allSelected ? ui.copy_cc82c2aee6 : ui.copy_e1d94e445d }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="invert">{{ ui.copy_cf96ec6e3a }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="state.filters={department:'',identity:''}">{{ ui.copy_cec32bdb96 }}</button></div>
      <div class="list"><article v-for="row in filtered" :key="row.id" class="selection-option-card rule-row stack-tight" :class="{'selection-option-card-selected':state.selected.includes(row.id)}" role="checkbox" :aria-checked="state.selected.includes(row.id)" :aria-disabled="blocked" tabindex="0" @click="toggle(row.id)" @keydown.enter.self.prevent="toggle(row.id)" @keydown.space.self.prevent="toggle(row.id)"><strong>{{ row.scorerDepartment }} / {{ row.scorerIdentity }}</strong><span class="chip chip-blue">{{ row.clauses.length }} {{ ui.copy_7c4117217c }}</span><div class="card-actions" @click.stop><button type="button" class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="edit(row)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click="remove(row)">{{ ui.copy_acc985cabc }}</button></div></article><p v-if="!filtered.length && !loadNotice && !loading" class="empty-state">{{ ui.copy_9511306804 }}</p></div>
    </section>
    <Teleport to="body"><article v-if="drag.state.active" class="list-row question-ghost rule-row" :style="drag.state.style"><strong>{{ drag.state.question.templateName }}</strong></article></Teleport>
  </div>
</template>
<script setup>
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
const canDeleteRecord = useAdminCapability('scoring.rules.delete');
const canWriteRecord = useAdminCapability('scoring.rules');
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import UiSwitch from './UiSwitch.vue';
import RuleTemplateEditor from './RuleTemplateEditor.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/ruleBehavior.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { showToast, confirmAction } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
import { RULE_SCOPE_OPTIONS, emptyRuleForm, normalizeClauseForEdit, createTemplateConfig, buildRuleClausesForSave, buildRuleClausesForBatchApply, buildPendingTemplateConfigForSave, refreshTemplateConfigSortOrder, getScopeLabel } from '@/runtime/scoringRuleForm.js';
import { useQuestionDrag } from '@/runtime/questionDrag.js';
const props=defineProps({disabled:Boolean,state:{type:Object,required:true}});const emit=defineEmits(['busy']);
const form=computed(()=>props.state.form),configs=computed(()=>form.value.clauseTemplateConfigs);
const rows=ref([]),departments=ref([]),identities=ref([]),templates=ref([]),activity=ref(null),loading=ref(false),busy=ref(false),loadNotice=ref(''),actionNotice=ref(''),editNotice=ref('');
const categoryEditor=ref(null),clauseEditor=ref(null),configPane=ref(null);
const blocked=computed(()=>props.disabled || loading.value || busy.value || !!loadNotice.value || !activity.value || props.state.pending);
const drag=useQuestionDrag(configPane,configs,blocked,moveConfig,{pageScroll:true});
const filtered=computed(()=>rows.value.filter(row=>(!props.state.filters.department || row.scorerDepartment===props.state.filters.department) && (!props.state.filters.identity || row.scorerIdentity===props.state.filters.identity)));
const filterDepartments=computed(()=>[...new Set(rows.value.map(row=>row.scorerDepartment))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-CN')));
const filterIdentities=computed(()=>[...new Set(rows.value.map(row=>row.scorerIdentity))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-CN')));
const allSelected=computed(()=>filtered.value.length>0 && filtered.value.every(row=>props.state.selected.includes(row.id)));
const scopeLabel=getScopeLabel;let generation=0,disposed=false,seed=0;
const scope=()=>[session.context?.organizationId,session.context?.contextId].join('|');const current=expected=>!disposed && expected===scope();
function withKey(config){return {...createTemplateConfig(config),key:++seed};}
function reset(){Object.assign(form.value,emptyRuleForm());props.state.configIndex=-1;actionNotice.value='';editNotice.value='';}
async function reveal(editor){await nextTick();editor.value?.scrollIntoView({block:'nearest'});}
async function load(){
  const request=++generation,expected=scope();loading.value=true;
  try{
    const [activities,departmentData,identityData,templateData]=await Promise.all(['listScoreActivities','listDepartments','listIdentities','listScoreTemplates'].map(name=>callApi(name,{}).then(requireSuccess)));if(!current(expected)||request!==generation)return;
    if(!Array.isArray(activities.list)||!Array.isArray(departmentData.departments)||!Array.isArray(identityData.identities)||!Array.isArray(templateData.list))throw new Error();
    const active=activities.list.find(row=>row.id===activities.currentActivityId || row.isCurrent===true) || null;
    const result=active?requireSuccess(await callApi('listRateRules',{activityId:active.id})):{rules:[]};if(!current(expected)||request!==generation)return;
    if(!Array.isArray(result.rules)||result.rules.some(row=>!row?.id || !Array.isArray(row.clauses)||row.clauses.some(clause=>!RULE_SCOPE_OPTIONS.some(option=>option.value===clause?.scopeType)||!Array.isArray(clause.templateConfigs))))throw new Error();
    if(props.state.activityId!==active?.id){reset();props.state.activityId=active?.id||'';props.state.selected=[];props.state.filters={department:'',identity:''};}
    activity.value=active;departments.value=departmentData.departments;identities.value=identityData.identities;templates.value=templateData.list;rows.value=result.rules;props.state.selected=props.state.selected.filter(id=>rows.value.some(row=>row.id===id));loadNotice.value='';
    if(props.state.pending){props.state.pending=false;if(props.state.resetAfterRead){reset();props.state.resetAfterRead=false;}}
  }catch(error){if(current(expected)&&request===generation)loadNotice.value=errorText(error,messages.copy_58d149dfbb);}finally{if(current(expected)&&request===generation)loading.value=false;}
}
function toggle(id){if(blocked.value)return;props.state.selected=props.state.selected.includes(id)?props.state.selected.filter(value=>value!==id):props.state.selected.concat(id);}
function toggleAll(){if(blocked.value)return;const selected=new Set(props.state.selected);for(const row of filtered.value){if(allSelected.value)selected.delete(row.id);else selected.add(row.id);}props.state.selected=[...selected];}
function invert(){if(blocked.value)return;for(const row of filtered.value)toggle(row.id);}
function clearConfig(){Object.assign(form.value,{clauseTemplateId:'',clauseTemplateName:'',clauseTemplateWeight:'1',clauseCalculationMethod:'weighted_average',clauseTrimHighCount:0,clauseTrimLowCount:0,clauseTemplateConfigEditingIndex:-1});props.state.configIndex=-1;}
function cancelConfig(){if(blocked.value)return;clearConfig();editNotice.value='';}
function cancelClause(){if(blocked.value)return;const blank=emptyRuleForm();for(const key of Object.keys(blank).filter(key=>(key.startsWith('clause') && key!=='clauses')||key.startsWith('is')))form.value[key]=blank[key];clearConfig();editNotice.value='';}
async function openClause(index=-1){if(blocked.value)return;cancelClause();form.value.isRuleClauseEditorVisible=true;if(index>=0){const clause=normalizeClauseForEdit(form.value.clauses[index]);Object.assign(form.value,{clauseEditingIndex:index,clauseScope:clause.scopeType,clauseTargetIdentityId:clause.targetIdentityId,clauseTargetIdentity:clause.targetIdentity,clauseRequireAllComplete:clause.requireAllComplete,clauseTemplateConfigs:clause.templateConfigs.map(withKey)});}await reveal(clauseEditor);}
async function openConfig(index){if(blocked.value)return;clearConfig();props.state.configIndex=index;const config=configs.value[index];if(config)Object.assign(form.value,{clauseTemplateId:config.templateId,clauseTemplateName:config.templateName,clauseTemplateWeight:config.weight,clauseCalculationMethod:config.calculationMethod,clauseTrimHighCount:config.trimHighCount,clauseTrimLowCount:config.trimLowCount,clauseTemplateConfigEditingIndex:index});await nextTick();clauseEditor.value?.querySelector('.template-editor')?.scrollIntoView({block:'nearest'});}
function saveConfig(){
  if(blocked.value)return;const pending=buildPendingTemplateConfigForSave(form.value);if(pending.status!=='ready'){editNotice.value=pending.message||messages.copy_0752b95158;return;}const config=pending.config,index=props.state.configIndex;
  if(configs.value.some((item,i)=>i!==index && item.templateId===config.templateId)){editNotice.value=messages.copy_6a36edd369;return;}
  if(!Number.isInteger(config.trimHighCount)||config.trimHighCount<0||!Number.isInteger(config.trimLowCount)||config.trimLowCount<0){editNotice.value=copy.errors.requestFailed;return;}
  if(index<configs.value.length)configs.value[index]=withKey(config);else configs.value.push(withKey(config));form.value.clauseTemplateConfigs=refreshTemplateConfigSortOrder(configs.value);clearConfig();editNotice.value='';
}
function moveConfig(from,to){if(blocked.value)return;const [config]=configs.value.splice(from,1);configs.value.splice(to,0,config);form.value.clauseTemplateConfigs=refreshTemplateConfigSortOrder(configs.value);clearConfig();}
function removeConfig(index){if(blocked.value)return;configs.value.splice(index,1);form.value.clauseTemplateConfigs=refreshTemplateConfigSortOrder(configs.value);clearConfig();}
function saveClause(){if(blocked.value)return;if(form.value.clauseScope!=='all_people' && !form.value.clauseScope.endsWith('_all') && !form.value.clauseTargetIdentityId){editNotice.value=messages.copy_7151fd51a0;return;}const result=buildRuleClausesForSave(form.value);if(!result.ok){editNotice.value=result.message;return;}if(form.value.clauseEditingIndex<0 && result.clauses.length===form.value.clauses.length){editNotice.value=messages.copy_7aed7111ba;return;}const added=result.clauses[form.value.clauseEditingIndex>=0?form.value.clauseEditingIndex:result.clauses.length-1];if(!added?.templateConfigs.length){editNotice.value=messages.copy_0752b95158;return;}form.value.clauses=result.clauses;cancelClause();}
function removeClause(index){if(blocked.value)return;form.value.clauses.splice(index,1);if(form.value.clauseEditingIndex===index)cancelClause();else if(form.value.clauseEditingIndex>index)form.value.clauseEditingIndex--;}
async function edit(row){if(blocked.value)return;reset();Object.assign(form.value,{id:row.id,scorerDepartmentId:row.scorerDepartmentId,scorerDepartment:row.scorerDepartment,scorerIdentityId:row.scorerIdentityId,scorerIdentity:row.scorerIdentity,allowSelfAssessment:row.allowSelfAssessment!==false,clauses:row.clauses.map(normalizeClauseForEdit)});await reveal(categoryEditor);}
async function write(name,data,{resetForm=false,success=messages.copy_d2758f01a6}={}){if(blocked.value)return;const expected=scope();busy.value=true;actionNotice.value='';try{requireSuccess(await callApi(name,data));if(!current(expected))return;props.state.pending=true;props.state.resetAfterRead=resetForm;await load();if(current(expected))showToast(success);}catch(error){if(current(expected))actionNotice.value=errorText(error,messages.copy_215e3c57da);}finally{if(current(expected))busy.value=false;}}
function save(){if(blocked.value)return;const result=buildRuleClausesForSave(form.value);if(!form.value.scorerDepartmentId||!form.value.scorerIdentityId){actionNotice.value=messages.copy_f6ace868f2;return;}if(!result.ok||!result.clauses.length){actionNotice.value=result.message||messages.copy_b9e48da987;return;}return write('saveRateRule',{id:form.value.id,activityId:activity.value.id,activityName:activity.value.name,scorerDepartmentId:form.value.scorerDepartmentId,scorerIdentityId:form.value.scorerIdentityId,allowSelfAssessment:form.value.allowSelfAssessment,clauses:result.clauses},{resetForm:true});}
function apply(){if(blocked.value)return;const result=buildRuleClausesForBatchApply(form.value);const selected=rows.value.filter(row=>props.state.selected.includes(row.id));if(!selected.length){actionNotice.value=messages.copy_78e3986a7f;return;}if(!result.ok){actionNotice.value=result.message;return;}return write('batchSaveRateRules',{rules:selected.map(row=>({id:row.id,activityId:activity.value.id,activityName:activity.value.name,scorerDepartmentId:row.scorerDepartmentId,scorerIdentityId:row.scorerIdentityId,allowSelfAssessment:row.allowSelfAssessment!==false,clauses:result.clauses,mode:'replace'}))},{success:messages.copy_3bf6e80d99});}
function generate(){return write('generateRateTargetRules',{activityId:activity.value?.id},{success:messages.copy_7ca6a5ec8a});}
async function remove(row){if(blocked.value)return;const target={id:row.id,label:row.scorerDepartment+' / '+row.scorerIdentity},expected=scope();busy.value=true;let confirmed=false;try{confirmed=await confirmAction({title:messages.copy_492761e445,body:target.label+'\n'+messages.copy_06219d4706,danger:true,confirmText:copy.common.confirm,cancelText:copy.common.cancel});}finally{if(current(expected))busy.value=false;}if(confirmed && current(expected) && !props.disabled)return write('deleteRateRule',{id:target.id},{success:messages.copy_5398fec054});}
watch(()=>busy.value||drag.state.active,value=>emit('busy',value),{flush:'sync'});watch(scope,load,{immediate:true});onBeforeUnmount(()=>{disposed=true;generation++;emit('busy',false);});
</script>
<style scoped>
.rule-row { flex-direction:column;align-items:stretch;flex:none;min-width:0; }
.rule-actions { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-inline-gap); }
.switch-row { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-inline-gap); }
.switch-row > .stack-tight { min-width:0; }
.config-pane { min-width:0; }
.drag-handle { touch-action:none; }
.rule-dragging { opacity:var(--ui-disabled-opacity); }
.question-ghost { position:fixed;z-index:var(--ui-template-drag-layer);pointer-events:none;box-sizing:border-box; }
</style>
