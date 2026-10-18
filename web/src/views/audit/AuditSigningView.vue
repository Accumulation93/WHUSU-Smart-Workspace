<template>
  <div class="page signing-page stack">
    <AuditSigningWorkspace v-if="valid" :draft="handoff.draft" :file="handoff.file" :initial-mode="handoff.mode" :active="handoff.active" :pad="handoff.pad" :rollback="handoff.rollback" :initial-preview="initialPreview" @confirm="done" @cancel="back" />
    <section v-else class="card stack"><AppLoading v-if="checking" :text="text.loading" /><p v-else>{{ notice }}</p><button v-if="retryable" class="btn-quiet" @click="validate">{{ text.retry }}</button><button class="btn btn-secondary" @click="back">{{ text.back }}</button></section>
  </div>
</template>
<script setup>
import { signingAssets } from '@/runtime/signingAssets.js';
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import AuditSigningWorkspace from '@/components/AuditSigningWorkspace.vue';
import { getSigningHandoff } from '@/runtime/signingDrafts.js';
import { signingStepCurrent } from '@/shared/auditStepView.js';
import { requireSuccess } from '@/runtime/api.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import text from '@/locales/zh-CN/shared/auditSigning.js';
const router=useRouter(), handoff=getSigningHandoff();
const requests=auditRequests(), valid=ref(false), checking=ref(false), retryable=ref(false), notice=ref(text.draftLost);
let initialPreview=null;
let alive=true;
async function validate(){
  if(!handoff || handoff!==getSigningHandoff() || handoff.draft.locked)return;
  checking.value=true;retryable.value=false;
  try {
    if(handoff.pad){valid.value=true;return;}
    const page=handoff.draft.files[handoff.file.id]?.currentPage||1;
    initialPreview={page,promise:signingAssets.preview(handoff.draft,handoff.file,page).then(value=>value.response,()=>null)};
    const detail=requireSuccess(await requests.call('getSubmissionDetail',{submissionId:handoff.submissionId}));
    if(!alive || handoff!==getSigningHandoff())return;
    if(!signingStepCurrent(detail,handoff)){handoff.draft.locked=true;notice.value=text.stale;return;}
    valid.value=true;
  }catch(_){if(alive){notice.value=text.failed;retryable.value=true;}}
  finally{if(alive)checking.value=false;}
}
function back(){if(handoff && handoff.back)router.replace(handoff.back);else router.replace({name:'auditMySubmissions'});}
function done(exports){if(handoff && handoff.confirm)handoff.confirm(exports);back();}
onMounted(validate);
onBeforeUnmount(()=>{alive=false;requests.dispose();});
</script>
<style scoped>.signing-page{animation:none;transform:none;height:calc(100dvh - var(--ui-navbar-height));min-height:0;box-sizing:border-box;padding:var(--ui-inline-gap);display:flex;flex-direction:column}</style>
