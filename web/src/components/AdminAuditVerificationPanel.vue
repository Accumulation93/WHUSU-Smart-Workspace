<template>
  <section class="card stack"><span class="section-title">{{ native.copy_edef2184fb }}</span><button class="btn-quiet" :disabled="blocked" @click="choose">{{ state.grantee?.name || native.copy_0afb532e6f }}</button><p v-if="notice || actionNotice" class="notice-line">{{ notice || actionNotice }}<button v-if="notice" class="btn-quiet" :disabled="busy || loading" @click="load">{{ text.retry }}</button></p><button class="btn btn-primary" :disabled="blocked || !state.grantee" @click="grant">{{ native.copy_0d4cc3a70e }}</button></section>
  <section class="card stack"><span class="section-title">{{ native.copy_2aaf72c584 }}</span><p v-if="loading">{{ copy.common.loading }}</p><p v-else-if="!notice && !rows.length">{{ native.copy_3239064773 }}</p><div v-for="row in rows" :key="row.id" class="list-row"><span>{{ row.granteeName }}</span><button class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="revoke(row)">{{ native.copy_3f75d366b0 }}</button></div></section>
  <AuditVerificationView embedded @busy="verificationBusy=$event" />
  <PersonnelPicker v-if="picker" mode="person" :multiple="false" :title="native.copy_0afb532e6f" :options="candidates" :value="state.grantee ? [state.grantee] : []" @cancel="picker=false" @confirm="state.grantee=$event[0]||null;picker=false" />
</template>
<script setup>
import { computed,ref,watch,onMounted,onBeforeUnmount } from 'vue';
import AuditVerificationView from '@/views/audit/AuditVerificationView.vue';
import PersonnelPicker from './PersonnelPicker.vue';
import copy from '@/locales/zh-CN/index.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/auditBehavior.js';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import { callApi,requireSuccess,errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
const props=defineProps({state:Object,disabled:Boolean});const emit=defineEmits(['busy']);
const rows=ref([]),candidates=ref([]),loading=ref(true),busy=ref(false),verificationBusy=ref(false),picker=ref(false),notice=ref(''),actionNotice=ref('');
const requests=auditRequests();let alive=true,sequence=0;
const blocked=computed(()=>props.disabled||loading.value||busy.value||verificationBusy.value||!!notice.value||props.state.pending);
async function load(){const request=++sequence;loading.value=true;try{const response=requireSuccess(await requests.call('listVerificationPermissions',{}));if(!alive||request!==sequence)return;rows.value=response.permissions||[];notice.value='';if(props.state.pending){props.state.pending=false;props.state.grantee=null;}}catch(error){if(alive&&request===sequence)notice.value=errorText(error,copy.errors.requestFailed);}finally{if(alive&&request===sequence)loading.value=false;}}
async function choose(){if(blocked.value)return;busy.value=true;try{const response=requireSuccess(await requests.call('listAuditVerificationCandidates',{}));if(alive){candidates.value=response.candidates||[];picker.value=true;}}catch(error){if(alive)actionNotice.value=errorText(error,copy.errors.requestFailed);}finally{if(alive)busy.value=false;}}
async function write(id,action){requireSuccess(await callApi('saveVerificationPermission',{granteeHrId:id,action}));if(!alive)return;props.state.pending=true;await load();}
async function grant(){if(blocked.value||!props.state.grantee)return;busy.value=true;actionNotice.value='';try{await write(props.state.grantee.id,'grant');}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_5a0e81ddd2);}finally{if(alive)busy.value=false;}}
async function revoke(row){if(blocked.value)return;busy.value=true;actionNotice.value='';try{if(!await confirmAction({title:messages.copy_d6c748ac95,body:row.granteeName+'\n'+messages.copy_c73a8aa49d,confirmText:native.copy_3f75d366b0,cancelText:copy.common.cancel,danger:true})||!alive)return;await write(row.granteeHrId,'revoke');}catch(error){if(alive)actionNotice.value=errorText(error,messages.copy_8351ecc192);}finally{if(alive)busy.value=false;}}
watch([busy,verificationBusy],()=>emit('busy',busy.value||verificationBusy.value),{flush:'sync'});onMounted(load);onBeforeUnmount(()=>{alive=false;sequence++;requests.dispose();emit('busy',false);});
</script>
