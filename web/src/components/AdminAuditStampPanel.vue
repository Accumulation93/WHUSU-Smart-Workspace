<template>
  <section v-if="canWriteRecord" ref="editor" class="card stack">
    <span class="section-title">{{ native.copy_82f17ccbef }}</span>
    <label class="field"><span class="field-label">{{ native.copy_9395b8661f }}</span><input v-model="state.form.name" class="field-input" :disabled="blocked" /></label>
    <FileInput ref="fileInput" hidden  accept="image/*" class="visually-hidden" :disabled="blocked" @change="readImage" />
    <button class="btn-quiet" :disabled="blocked" @click="fileInput.click()">{{ native.copy_393f873d06 }}</button>
    <img v-if="state.form.imageData" :src="state.form.imageData" :alt="state.form.name || text.stamp" class="stamp-preview" />
    <p v-if="notice || actionNotice" class="notice-line">{{ notice || actionNotice }} <button v-if="notice" class="btn-quiet" :disabled="busy || loading" @click="load">{{ text.retry }}</button></p>
    <div class="stamp-actions"><button class="btn btn-secondary" :disabled="busy || state.pending" @click="reset">{{ copy.common.cancel }}</button><button class="btn btn-primary" :disabled="blocked" @click="save">{{ native.copy_2278d2da18 }}</button></div>
  </section>
  <section class="card stack"><span class="section-title">{{ native.copy_8ef1f4695c }}</span><p v-if="loading"><AppLoading :text="copy.common.loading" /></p><p v-else-if="!notice && !rows.length">{{ native.copy_0596fc0dc8 }}</p><div v-for="row in rows" :key="row.id" class="list-row stamp-row"><strong>{{ row.name }}</strong><img :src="row.imageData" :alt="row.name" class="stamp-preview" /><span v-for="grant in row.assignedPeople" :key="grant.assignmentId" class="muted">{{ grant.name }} · {{ grant.assignmentLabel }}<span v-if="grant.available===false"> · {{ stamps.inactive }}</span></span><div class="card-actions"><button class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="edit(row)">{{ native.copy_e040ae3016 }}</button><button class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="openGrants(row)">{{ stamps.configure }}</button><button class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click="remove(row)">{{ native.copy_acc985cabc }}</button></div></div></section>
  <PersonnelPicker v-if="grantTarget" :title="stamps.title" :options="candidates" :value="grantTarget.assignedPeople.filter(item=>item.available!==false)" :busy="busy" @cancel="grantTarget=null" @confirm="saveGrants"><p>{{ stamps.editorContext(grantTarget.name) }}</p><p v-if="grantTarget.assignedPeople.some(item=>item.available===false)" class="notice-line">{{ stamps.invalidRemoved }}</p><p v-if="actionNotice" class="notice-line">{{ actionNotice }}</p></PersonnelPicker>
</template>
<script setup>
import FileInput from '@/components/FileInput.vue';
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
const canDeleteRecord = useAdminCapability('audit.stamps.delete');
const canWriteRecord = useAdminCapability('audit.stamps');
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import PersonnelPicker from './PersonnelPicker.vue';
import copy from '@/locales/zh-CN/index.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/auditBehavior.js';
import stamps from '@/locales/zh-CN/shared/stampAuthorization.js';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
const props=defineProps({state:Object,disabled:Boolean});const emit=defineEmits(['busy']);
const rows=ref([]),candidates=ref([]),grantTarget=ref(null),loading=ref(true),busy=ref(false),notice=ref(''),actionNotice=ref(''),fileInput=ref(null);
const editor=ref(null);
const requests=auditRequests();let alive=true,sequence=0;
const blocked=computed(()=>props.disabled||loading.value||busy.value||!!notice.value||props.state.pending);
function reset(){props.state.form={id:'',name:'',imageData:''};actionNotice.value='';}
async function load(){const request=++sequence;loading.value=true;try{const response=requireSuccess(await requests.call('listStamps',{}));if(!Array.isArray(response.stamps))throw Error('invalid_list');if(!alive||request!==sequence)return;rows.value=response.stamps;notice.value='';if(props.state.pending){props.state.pending=false;grantTarget.value=null;if(props.state.resetAfterRead){props.state.resetAfterRead=false;reset();}}}catch(error){if(alive&&request===sequence)notice.value=errorText(error,stamps.loadingFailed);}finally{if(alive&&request===sequence)loading.value=false;}}
async function edit(row){if(!blocked.value){props.state.form={id:row.id,name:row.name,imageData:row.imageData};actionNotice.value='';await nextTick();editor.value?.scrollIntoView({block:'start'});}}
async function readImage(event){const file=event.target.files?.[0];event.target.value='';if(!file||blocked.value)return;if(file.size>2*1024*1024){actionNotice.value=stamps.imageTooLarge;return;}busy.value=true;try{const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});if(alive)props.state.form.imageData=value;}catch(_){if(alive)actionNotice.value=stamps.imageReadFailed;}finally{if(alive)busy.value=false;}}
async function save(){if(blocked.value)return;if(!props.state.form.name.trim()){actionNotice.value=messages.copy_76f2662073;return;}if(!props.state.form.imageData){actionNotice.value=messages.copy_9cf20101c9;return;}busy.value=true;actionNotice.value='';try{requireSuccess(await callApi('saveStamp',{...props.state.form,name:props.state.form.name.trim()}));if(!alive)return;props.state.pending=true;props.state.resetAfterRead=true;await load();}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_215e3c57da);}finally{if(alive)busy.value=false;}}
async function openGrants(row){if(blocked.value)return;busy.value=true;actionNotice.value='';try{const response=requireSuccess(await requests.call('listStampCandidates',{}));if(!alive)return;candidates.value=(response.candidates||[]).map(item=>({...item,department:item.departmentName,identity:item.identityCategoryName,workGroup:item.workGroupName}));grantTarget.value=row;}catch(error){if(alive)actionNotice.value=errorText(error,stamps.candidatesFailed);}finally{if(alive)busy.value=false;}}
async function saveGrants(selected){if(busy.value||props.state.pending||props.disabled||!grantTarget.value)return;busy.value=true;actionNotice.value='';try{requireSuccess(await callApi('saveStampGrants',{stampId:grantTarget.value.id,assignmentIds:selected.map(item=>item.assignmentId)}));if(!alive)return;props.state.pending=true;await load();}catch(error){if(alive)actionNotice.value=errorText(error,stamps.saveFailed);}finally{if(alive)busy.value=false;}}
async function remove(row){if(blocked.value)return;busy.value=true;try{if(!await confirmAction({title:messages.copy_7f31eec657,body:row.name+'\n'+messages.copy_22a8323f15,confirmText:native.copy_acc985cabc,cancelText:copy.common.cancel,danger:true})||!alive)return;requireSuccess(await callApi('deleteStamp',{id:row.id}));if(!alive)return;props.state.pending=true;props.state.resetAfterRead=props.state.form.id===row.id;await load();}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_076bb5d383);}finally{if(alive)busy.value=false;}}
watch(busy,value=>emit('busy',value),{flush:'sync'});onMounted(load);onBeforeUnmount(()=>{alive=false;sequence++;requests.dispose();emit('busy',false);});
</script>
<style scoped>.stamp-row{flex-direction:column;align-items:stretch}.stamp-preview{max-width:var(--ui-signing-width-control);max-height:var(--ui-signing-width-control);object-fit:contain;align-self:flex-start}.stamp-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-action-gap)}.card-actions{display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap)}.visually-hidden{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}</style>
