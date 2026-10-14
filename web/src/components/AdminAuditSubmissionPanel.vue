<template><section class="card stack"><span class="section-title">{{ native.copy_be547ba4c7 }}</span><label class="field"><span class="field-label">{{ copy.audit.detailStepsTitle }}</span><select v-model="status" class="field-input" :disabled="loading" @change="load(false)"><option value="">{{ native.copy_31d4595959 }}</option><option v-for="value in statuses" :key="value" :value="value">{{ statusLabel(value) }}</option></select></label><p v-if="notice" class="notice-line">{{ notice }}<button class="btn-quiet" @click="load(false)">{{ text.retry }}</button></p><p v-if="loading">{{ copy.common.loading }}</p><p v-else-if="!notice && !rows.length">{{ copy.audit.emptySubmissions }}</p><button v-for="row in rows" :key="row.id" class="list-row audit-submission" @click="router.push({name:'auditSubmission',params:{id:row.id}})"><span class="stack-tight"><strong>{{ row.title }}</strong><span>{{ row.submitterName }} · {{ row.submissionNumber }}</span><span class="soft">{{ detailTimeText(row.createdAt,row.createdAtReviewStatus) }}</span></span><span class="chip chip-blue">{{ statusLabel(row.status) }}</span></button><button v-if="hasMore" class="btn-quiet" :disabled="loading" @click="load(true)">{{ text.more }}</button></section></template>
<script setup>
import { ref,onMounted,onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { statusLabel,detailTimeText } from '@/runtime/audit.js';
import { requireSuccess,errorText } from '@/runtime/api.js';
import { auditRequests } from '@/runtime/auditRequests.js';
const router=useRouter(),requests=auditRequests(),rows=ref([]),status=ref(''),loading=ref(false),notice=ref(''),hasMore=ref(false);
const statuses=['in_progress','approved','rejected','withdrawn'];let alive=true,sequence=0;
async function load(append){if(loading.value)return;const request=++sequence;loading.value=true;try{const result=requireSuccess(await requests.call('listAllAuditSubmissions',{status:status.value,limit:50,offset:append?rows.value.length:0}));if(!alive||request!==sequence)return;const found=result.submissions||[];rows.value=append?rows.value.concat(found):found;hasMore.value=found.length===50;notice.value='';}catch(error){if(alive)notice.value=errorText(error,copy.audit.loadFailed);}finally{if(alive&&request===sequence)loading.value=false;}}
onMounted(()=>load(false));onBeforeUnmount(()=>{alive=false;sequence++;requests.dispose();});
</script>
<style scoped>.audit-submission{width:100%;color:var(--ui-text);font:inherit;text-align:left}</style>
