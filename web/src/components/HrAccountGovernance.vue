<template>
  <section class="stack">
    <span class="chip">{{ ({verified:ui.copy_8e4abe3d58,frozen:ui.copy_ddaba44b59,recovery_required:ui.copy_16399ef078,pending_verification:ui.accountPendingVerification})[row.auth?.status] || ui.accountStateUnknown }}</span>
    <AppLoading v-if="loading || busy" /><p v-if="notice" role="alert">{{ notice }}</p>
    <div v-if="row.canVerifyIdentity && verify" class="card-actions"><button class="btn btn-secondary" :disabled="busy" @click="verification(false)">{{ admin.copy_6b7249dab1 }}</button><button v-if="row.auth?.hasActiveClaimCode || row.auth?.hasActiveInvite" class="btn btn-secondary" :disabled="busy" @click="verification(true)">{{ admin.copy_265032194a }}</button></div>
    <div v-if="canManageRecovery && row.accountId" class="card-actions"><button class="btn btn-secondary" :disabled="busy" @click="recovery(false)">{{ admin.copy_2098fca507 }}</button><button v-if="row.auth?.hasRecoveryCode" class="btn btn-secondary" :disabled="busy" @click="recovery(true)">{{ admin.copy_1cda406196 }}</button></div>
    <button v-if="canApproveRecovery && row.auth?.pendingRecoveryId" class="btn btn-secondary" :disabled="busy" @click="approveRecovery">{{ admin.copy_a25637362e }}</button>
    <div v-if="can('freeze') && row.accountId" class="card-actions"><button class="btn btn-secondary" :disabled="busy" @click="freeze">{{ row.auth?.frozen || row.auth?.status==='frozen'?admin.copy_b059d32042:admin.copy_eb1ebe5d11 }}</button></div>
    <template v-if="security">
      <div class="row row-wrap" v-if="can('read') || can('unbindWechat') || can('resetPassphrase') || can('revokePassphrase')"><span v-if="can('read') || can('unbindWechat')" class="chip">{{ security.bindingStatus==='bound'?ui.copy_171e9799a7:security.bindingStatus==='unbound'?ui.copy_ba9b0425fd:ui.bindingStatusUnknown }}</span><span v-if="typeof security.passphraseSet === 'boolean' && (can('read') || can('resetPassphrase') || can('revokePassphrase'))" class="chip">{{ admin.copy_563acb4455 }} · {{ security.passphraseSet?admin.copy_02a2beb65d:admin.copy_2b4df49497 }}</span></div>
      <form v-if="can('resetPassphrase')" class="stack" @submit.prevent="savePassphrase"><label class="field"><span class="field-label">{{ admin.copy_10c21cf3bc }}</span><input v-model="passphrase" type="password" autocomplete="new-password" required class="field-input" :disabled="busy" /></label><button class="btn btn-primary" :disabled="busy">{{ admin.savePassphrase }}</button></form>
      <div class="card-actions" v-if="(can('revokePassphrase') && security.passphraseSet) || (can('unbindWechat') && security.bindingStatus==='bound')"><button v-if="can('revokePassphrase') && security.passphraseSet" class="btn btn-secondary" :disabled="busy" @click="clearPassphrase">{{ admin.copy_b92f43fb29 }}</button><button v-if="can('unbindWechat') && security.bindingStatus==='bound'" class="btn btn-secondary" :disabled="busy" @click="unbind">{{ admin.copy_b9d18e854e }}</button></div>
      <div v-for="login in can('revokeSession') ? (security.sessions || []) : []" :key="login.id" class="row row-wrap"><span>{{ login.deviceLabel }}</span><button class="btn btn-secondary" :disabled="busy" @click="revokeSession(login)">{{ ui.endSessionTitle }}</button></div>
    </template>
    <div v-if="issued" class="card stack"><strong>{{ issued.label }}</strong><span class="break-all">{{ issued.code }}</span><button class="btn-quiet" @click="issued=null">{{ common.common.close }}</button></div>
  </section>
</template>
<script setup>
import { computed,ref,watch,onBeforeUnmount } from 'vue';
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
import { callApi,requireSuccess,errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js';
import admin from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import common from '@/locales/zh-CN/index.js';
import authorization from '@/locales/zh-CN/shared/authorization.js';
const props=defineProps({row:{type:Object,required:true}}),emit=defineEmits(['refresh','busy']);
const verify=useAdminCapability('auth.identity.verify','auth.identity.verify'),recover=useAdminCapability('auth.accounts.recover','auth.recovery.update'),manage=useAdminCapability('auth.accounts.global_manage','auth.accounts.update'),readAccounts=useAdminCapability('auth.accounts.global_manage','auth.accounts.read');
const security=ref(null),loading=ref(false),busy=ref(false),notice=ref(''),passphrase=ref(''),issued=ref(null);
const accountCopy = authorization.unified;
function can(action) {
  const accountOperations = props.row.accountOperations;
  if (accountOperations) return accountOperations[action] === true && (!security.value?.accountOperations || security.value.accountOperations[action] === true);
  if (action === 'read') return readAccounts.value;
  return Boolean(manage.value && props.row.canGlobalAccountManage && (!security.value || security.value.canGlobalManage));
}
const canManageRecovery = computed(() => props.row.accountOperations ? can('manageRecoveryCode') : recover.value && props.row.canRecoverAccount);
const canApproveRecovery = computed(() => props.row.accountOperations ? can('approveRecovery') : can('manageRecoveryCode') && canManageRecovery.value);
const requestsSecurity = computed(() => props.row.accountOperations
  ? ['read', 'unbindWechat', 'resetPassphrase', 'revokePassphrase', 'revokeSession'].some(action => props.row.accountOperations[action] === true)
  : readAccounts.value);
let generation=0,alive=true;
const scope=()=>[session.context?.organizationId,session.context?.contextId,props.row.personId].join('|');
async function load(){const request=++generation,expected=scope();security.value=null;if(!requestsSecurity.value||!props.row.personId){loading.value=false;return;}loading.value=true;try{const result=requireSuccess(await callApi('admin/auth/security',{personId:props.row.personId}));if(alive&&request===generation&&expected===scope())security.value=result;}catch(error){if(alive&&request===generation)notice.value=errorText(error,ui.copy_bff49f783f);}finally{if(alive&&request===generation)loading.value=false;}}
async function act(name,data,allowed,label){if(busy.value||!allowed)return;const expected=scope();busy.value=true;notice.value='';try{const result=requireSuccess(await callApi(name,data));if(!alive||expected!==scope())return;if(label){const code=result.verificationCode||result.issued?.[0]?.code;if(code)issued.value={label,code};}emit('refresh');await load();}catch(error){if(alive&&expected===scope())notice.value=errorText(error,ui.copy_bff49f783f);}finally{busy.value=false;}}
function verification(revoke){const claimId=props.row.auth?.pendingClaimId,organizationId=session.context?.organizationId;const data=revoke?(claimId?{action:'revoke_codes',claimIds:[claimId]}:{action:'revoke_invites',personIds:[props.row.personId],organizationId}):(claimId?{action:'issue_code',claimId,expiresInHours:24}:{action:'issue_invites',personIds:[props.row.personId],organizationId,expiresInHours:24});return act('admin/auth/claims',data,verify.value&&props.row.canVerifyIdentity,revoke?'':admin.copy_c195d59710);}
function recovery(revoke){return act('admin/auth/recoveries',{action:revoke?'revoke_codes':'issue_codes',accountIds:[props.row.accountId],organizationId:session.context?.organizationId},canManageRecovery.value,revoke?'':admin.authCodeDialogTitleRecovery);}
async function confirmWithinScope(options) { const expected=scope(); return await confirmAction(options) && alive && expected===scope(); }
async function approveRecovery(){const id=props.row.auth?.pendingRecoveryId;if(!id||!canApproveRecovery.value||!await confirmWithinScope({title:admin.copy_d98f6ae430,body:props.row.name}))return;return act('admin/auth/recoveries',{action:'approve',recoveryRequestId:id},canApproveRecovery.value);}
async function freeze(){const frozen=props.row.auth?.frozen||props.row.auth?.status==='frozen';if(!await confirmWithinScope({title:frozen?admin.copy_b059d32042:admin.copy_eb1ebe5d11,body:frozen?accountCopy.unfreezeAccountConfirmation:accountCopy.freezeAccountConfirmation,danger:!frozen}))return;return act('admin/auth/accounts',{action:frozen?'unfreeze':'freeze',personId:props.row.personId},can('freeze'));}
async function savePassphrase(){const value=passphrase.value;if(!value||!await confirmWithinScope({title:admin.savePassphrase,body:accountCopy.resetPassphraseConfirmation}))return;await act('admin/auth/security/passphrase',{personId:props.row.personId,value},can('resetPassphrase'));passphrase.value='';}
async function clearPassphrase(){if(!await confirmWithinScope({title:ui.copy_f8990cda8e,body:accountCopy.revokePassphraseConfirmation,danger:true}))return;return act('admin/auth/security/passphrase/revoke',{personId:props.row.personId},can('revokePassphrase'));}
async function unbind(){if(!await confirmWithinScope({title:admin.copy_b9d18e854e,body:accountCopy.unbindWechatConfirmation,danger:true}))return;return act('unbindHrWechat',{hrId:props.row.hrId||props.row.id,organizationId:session.context?.organizationId},can('unbindWechat'));}
async function revokeSession(login){if(!login.id||!await confirmWithinScope({title:ui.endSessionTitle,body:ui.endSessionBody(login.deviceLabel || props.row.name),danger:true}))return;return act('admin/auth/security/sessions/revoke',{personId:props.row.personId,sessionId:login.id},can('revokeSession'));}
watch(busy,value=>emit('busy',value));watch([scope,requestsSecurity],()=>{issued.value=null;passphrase.value='';load();},{immediate:true});onBeforeUnmount(()=>{alive=false;generation++;issued.value=null;passphrase.value='';emit('busy',false);});
</script>
