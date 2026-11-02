<template>
  <form class="card stack" @submit.prevent="save">
    <strong class="section-title">{{ labels.copy_aef40f4a64 }}</strong><AppLoading v-if="loading || busy" /><p v-if="notice" role="alert">{{ notice }}</p><button v-if="notice" type="button" class="btn-quiet" :disabled="busy" @click="load">{{ common.common.retry }}</button>
    <template v-if="policy"><label v-for="field in switches" :key="field.key" class="row"><input v-model="policy[field.key]" type="checkbox" :disabled="busy || !canWrite" />{{ field.label }}</label><label v-for="field in instants" :key="field.key" class="field"><span class="field-label">{{ field.label }}</span><HrDateField v-model="policy[field.key]" type="datetime" :label="field.label" :disabled="busy || !canWrite" /><button v-if="canWrite && policy[field.key]" type="button" class="btn-quiet" :disabled="busy" @click="policy[field.key]=''">{{ labels.copy_5cde2d7c64 }}</button></label><button v-if="canWrite" class="btn btn-primary" :disabled="busy || loading">{{ ui.copy_7e4100d002 }}</button></template>
  </form>
</template>
<script setup>
import { ref,watch,onBeforeUnmount } from 'vue';
import HrDateField from './HrDateField.vue';
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
import { callApi,requireSuccess,errorText } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import labels from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js';
import common from '@/locales/zh-CN/index.js';
const emit=defineEmits(['busy']),canWrite=useAdminCapability('auth.policy.manage','auth.policy.update');
const policy=ref(null),loading=ref(false),busy=ref(false),notice=ref('');
const switches=[{key:'initialClaimEnabled',label:ui.copy_549147dd7b},{key:'allowRecoveryCode',label:ui.copy_c318ac62ef},{key:'allowPassphrase',label:ui.copy_563acb4455}],instants=[{key:'claimStartsAt',label:ui.copy_a97ad1165b},{key:'claimEndsAt',label:ui.copy_1d7bd8535a}];
let alive=true,generation=0;
const scope=()=>[session.context?.organizationId,session.context?.contextId].join('|');
async function load(){const request=++generation,expected=scope();loading.value=true;policy.value=null;try{const result=requireSuccess(await callApi('admin/auth/policy',{action:'get'}));if(!alive||request!==generation||expected!==scope())return;const source=result.policy||{};policy.value={initialClaimEnabled:!!(source.initial_claim_enabled??source.initialClaimEnabled),allowRecoveryCode:!!(source.allow_recovery_code??source.allowRecoveryCode),allowPassphrase:!!(source.allow_passphrase??source.allowPassphrase),claimStartsAt:source.claim_starts_at||source.claimStartsAt||'',claimEndsAt:source.claim_ends_at||source.claimEndsAt||''};notice.value='';}catch(error){if(alive&&request===generation)notice.value=errorText(error,labels.copy_439c4fcf37);}finally{if(alive&&request===generation)loading.value=false;}}
async function save(){if(!canWrite.value||busy.value||!policy.value)return;const expected=scope();busy.value=true;try{requireSuccess(await callApi('admin/auth/policy',{...policy.value}));if(alive&&expected===scope())await load();}catch(error){if(alive&&expected===scope())notice.value=errorText(error,labels.copy_215e3c57da);}finally{busy.value=false;}}
watch(busy,value=>emit('busy',value));watch(scope,load,{immediate:true});onBeforeUnmount(()=>{alive=false;generation++;policy.value=null;emit('busy',false);});
</script>
