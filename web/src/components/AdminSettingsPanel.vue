<template>
  <div class="stack">
    <section class="card stack">
      <span class="section-title">{{ ui.copy_a8792b30e7 }}</span>
      <div v-if="notice" class="stack-tight" role="alert"><span>{{ notice }}</span><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button></div>
      <p v-if="loading && !ready" class="empty-state"><AppLoading :text="copy.common.loading" /></p>
    </section>
    <section v-if="canManageOrganizations" class="card stack">
      <span class="list-row-title">{{ ui.copy_dfe3ef46ab }}</span>
      <div v-if="defaultId" class="field"><span class="field-label">{{ ui.copy_e74c96dd07 }}</span><span class="break-all">{{ defaultName }}</span></div>
      <button type="button" class="btn btn-secondary" :disabled="blocked" @click="openOrganization()">{{ ui.copy_6a843c55ad }}</button>
      <section v-if="organizations.length" class="list-row organization-list stack">
        <span class="list-row-title">{{ ui.copy_8cf734b362 }}</span>
        <article v-for="organization in organizations" :key="organization.id" class="list-row organization-row stack-tight">
          <strong class="break-all">{{ organization.name }}</strong>
          <div v-if="organization.id === defaultId" class="row"><span class="chip chip-blue">{{ ui.copy_e74c96dd07 }}</span></div>
          <div class="card-actions">
            <button v-if="organization.id !== defaultId" type="button" class="btn-quiet" :disabled="blocked" @click="setDefault(organization)">{{ ui.copy_fda919de66 }}</button>
            <button type="button" class="btn-quiet" :disabled="blocked" @click="openOrganization(organization)">{{ ui.copy_e040ae3016 }}</button>
            <button v-if="organization.id !== defaultId" type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="deleteOrganization(organization)">{{ ui.copy_acc985cabc }}</button>
          </div>
        </article>
      </section>
    </section>
    <form v-if="canManageSettings" class="card stack" @submit.prevent="saveTimezone">
      <span class="list-row-title">{{ ui.copy_150ec897d6 }}</span>
      <label class="field"><span class="field-label">{{ ui.copy_bed2e70b8f }}</span><select class="field-input" :aria-label="ui.copy_bed2e70b8f" :value="state.timezone" :disabled="blocked" @change="state.timezone=Number($event.target.value);state.dirty=true"><option v-if="state.timezone > 12" :value="state.timezone">{{ 'UTC+' + state.timezone }}</option><option v-for="option in timezoneOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <button type="submit" class="btn btn-primary" :disabled="blocked"><AppLoading v-if="busy" compact />{{ ui.copy_71db23a36b }}</button>
    </form>
    <p v-if="actionNotice && !state.form" class="notice-line" role="alert">{{ actionNotice }}</p>
    <GlassDialog v-if="state.form" compact :busy="busy || loading || state.pending" :title="state.form.id ? ui.copy_363e007ade : ui.copy_447b221a5e" @close="closeOrganization">
      <div class="stack"><label class="field"><span class="field-label">{{ ui.copy_2deb5cbfc9 }}</span><input v-model="state.form.name" class="field-input" :placeholder="ui.copy_f3bb9fa262" :disabled="blocked || !!state.created" /></label><div v-if="notice" class="stack-tight" role="alert"><span>{{ notice }}</span><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button></div><p v-if="actionNotice" role="alert">{{ actionNotice }}</p></div>
      <template #footer><div class="dialog-actions"><button v-if="!state.created" type="button" class="btn btn-primary" :disabled="blocked" @click="saveOrganization(false)">{{ ui.copy_0ee803a476 }}</button><button v-if="!state.form.id" type="button" class="btn btn-secondary" :disabled="blocked" @click="saveOrganization(true)">{{ ui.copy_f489226f00 }}</button></div></template>
    </GlassDialog>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/settingsBehavior.js';
import utils from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/adminUtils.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
const props=defineProps({disabled:Boolean,profile:Object,state:{type:Object,required:true}});
const emit=defineEmits(['busy']);
const timezoneKeys=['f9cadda36d','4570b42d70','757124dc6b','7cd25c7e87','55c5b5ff7b','ec688c2a7c','a0e4ae632c','4462cb7b00','72c79414ae','cf2edf4e91','657e432e78','2952640fa0','609094214c','d13ebf61e8','2f4c345a3b','ab805e8327','484de22700','b0e703c2d3','467bc10285','e2418cf46c','05746fc036','5f0a93e6d5','9d0e9da601','04e6a36058','570fa0981d'];
const timezoneOptions=timezoneKeys.map((key,index)=>({value:index-12,label:utils['copy_'+key]}));
const canManageOrganizations=computed(()=>props.profile?.adminLevel==='super_admin');
const canManageSettings=computed(()=>canManageOrganizations.value || props.profile?.permissions?.['system.settings']===true);
const organizations=ref([]),defaultId=ref(''),loading=ref(false),busy=ref(false),ready=ref(false),notice=ref(''),actionNotice=ref('');
const blocked=computed(()=>props.disabled || !ready.value || loading.value || busy.value || !!notice.value || props.state.pending);
const defaultName=computed(()=>organizations.value.find(row=>row.id===defaultId.value)?.name || '');
let disposed=false,generation=0;
const scope=()=>[session.context?.organizationId,session.context?.contextId].join('|');
const current=expected=>!disposed && expected===scope();
async function load(){
  const request=++generation,expected=scope();loading.value=true;
  try{
    const [config,list]=await Promise.all([callApi('getSystemConfig',{}).then(requireSuccess),canManageOrganizations.value?callApi('listOrganizations',{}).then(requireSuccess):Promise.resolve({list:[]})]);
    if(!current(expected) || request!==generation)return;
    if(!config.config || !Number.isInteger(config.config.timezone) || config.config.timezone < -12 || config.config.timezone > 14 || !Array.isArray(list.list) || list.list.some(row=>!row?.id || typeof row.name!=='string'))throw new Error();
    organizations.value=list.list;defaultId.value=config.config.currentOrganization || '';ready.value=true;notice.value='';
    if(!props.state.dirty || props.state.pending){props.state.timezone=config.config.timezone;props.state.dirty=false;}
    if(props.state.pending){props.state.pending=false;if(props.state.closeAfterRead){props.state.form=null;props.state.created=null;props.state.closeAfterRead=false;}}
  }catch(error){if(current(expected) && request===generation)notice.value=errorText(error,copy.errors.requestFailed);}
  finally{if(current(expected) && request===generation)loading.value=false;}
}
async function run(write,fallback,success){
  if(blocked.value)return;const expected=scope();busy.value=true;actionNotice.value='';
  try{await write(expected);if(!current(expected))return;props.state.pending=true;await load();if(current(expected))showToast(success);}
  catch(error){if(current(expected))actionNotice.value=errorText(error,fallback);}
  finally{if(current(expected))busy.value=false;}
}
function saveTimezone(){if(!canManageSettings.value)return;return run(()=>callApi('saveSystemConfig',{timezone:props.state.timezone}).then(requireSuccess),messages.copy_215e3c57da,messages.copy_c1add6c36e);}
function openOrganization(row){if(blocked.value || !canManageOrganizations.value)return;props.state.form={id:row?.id||'',name:row?.name||''};props.state.created=null;actionNotice.value='';}
function closeOrganization(){if(busy.value || loading.value || props.state.pending)return;props.state.form=null;props.state.created=null;actionNotice.value='';}
async function confirmDefault(name,create=false){return confirmAction({title:create?messages.copy_fcc6193afc:messages.copy_a58d703333,body:messages.copy_e7e3787584+name+'」。',confirmText:create?messages.copy_d5f0842283:messages.copy_6616a4de3c,cancelText:messages.copy_4b213fd88a});}
async function saveOrganization(makeDefault){
  if(blocked.value || !canManageOrganizations.value || !props.state.form)return;
  const target={id:props.state.form.id,name:props.state.form.name.trim()},expected=scope();
  if(!target.name){actionNotice.value=messages.copy_a032183564;return;}
  busy.value=true;actionNotice.value='';
  try{
    if(makeDefault && !(await confirmDefault(target.name,true)))return;if(!current(expected) || props.disabled)return;
    let saved=props.state.created;
    if(!saved){const result=requireSuccess(await callApi('saveOrganization',target));if(!current(expected))return;if(makeDefault){if(!result.organization?.id)throw new Error();saved={id:result.organization.id,name:target.name};props.state.created=saved;}}
    if(makeDefault)requireSuccess(await callApi('switchOrganization',{organizationId:saved.id,organizationName:saved.name}));
    if(!current(expected))return;props.state.pending=true;props.state.closeAfterRead=true;await load();if(current(expected))showToast(makeDefault?messages.copy_0a1deb4187:messages.copy_d41345ef29);
  }catch(error){if(current(expected)){actionNotice.value=errorText(error,props.state.created?messages.copy_53d5e0a0c8:messages.copy_215e3c57da);if(props.state.created)await load();}}
  finally{if(current(expected))busy.value=false;}
}
async function setDefault(row){
  if(blocked.value || !canManageOrganizations.value)return;const target={id:row.id,name:row.name},expected=scope();busy.value=true;actionNotice.value='';
  try{if(!(await confirmDefault(target.name)) || !current(expected) || props.disabled)return;requireSuccess(await callApi('switchOrganization',{organizationId:target.id,organizationName:target.name}));if(!current(expected))return;props.state.pending=true;await load();if(current(expected))showToast(messages.copy_0a1deb4187);}
  catch(error){if(current(expected))actionNotice.value=errorText(error,messages.copy_53d5e0a0c8);}finally{if(current(expected))busy.value=false;}
}
async function deleteOrganization(row){
  if(blocked.value || !canManageOrganizations.value)return;const target={id:row.id,name:row.name},expected=scope();busy.value=true;actionNotice.value='';
  try{if(!(await confirmAction({title:messages.copy_96a69f21ff,body:target.name+'\n'+messages.copy_c1360f875d,danger:true,confirmText:messages.copy_292043f789,cancelText:messages.copy_4b213fd88a})) || !current(expected) || props.disabled)return;requireSuccess(await callApi('deleteOrganization',{organizationId:target.id}));if(!current(expected))return;props.state.pending=true;await load();if(current(expected))showToast(messages.copy_770ca6e54d);}
  catch(error){if(current(expected))actionNotice.value=errorText(error,messages.copy_076bb5d383);}finally{if(current(expected))busy.value=false;}
}
watch(busy,value=>emit('busy',value),{flush:'sync'});watch(scope,load,{immediate:true});onBeforeUnmount(()=>{disposed=true;generation++;emit('busy',false);});
</script>
<style scoped>
.organization-list,.organization-row { flex-direction:column;align-items:stretch;min-width:0; }
.organization-row { flex:none; }
.dialog-actions { width:100%; }
</style>
