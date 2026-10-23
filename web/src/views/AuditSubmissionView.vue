<template>
  <div class="page stack">
    <section v-if="loading" class="card">
      <div class="empty-state"><AppLoading :text="copy.common.loading" /></div>
    </section>

    <template v-else-if="detail">
      <WorkspaceHero
        :page-name="copy.audit.detailTitle"
        :person-name="displayName"
        :identity-name="roleLine"
        :organization-name="orgName"
        @switch="goWorkRole"
      />

      <section class="hero stack-tight">
        <div class="row row-wrap">
          <span class="chip chip-sky">{{ statusLabel(submission.status) }}</span>
          <span class="soft">{{ submission.submissionNumber }}</span>
        </div>
        <h1 class="hero-title break-all">{{ submission.title }}</h1>
        <p class="hero-subtitle break-all">
          {{ submission.description || copy.audit.detailEmptyDescription }}
        </p>
        <div class="row row-wrap">
          <span class="chip chip-sky">{{ copy.audit.submitterLabel }} <PersonLink :name="submission.submitterName" :hr-id="submission.submittedBy" /></span>
          <span v-if="submission.templateName" class="chip chip-sky">{{ submission.templateName }}</span>
          <span class="soft">{{ copy.audit.submittedAtLabel }} {{ detailTimeText(submission.createdAt, submission.createdAtReviewStatus) }}</span>
        </div>
      </section>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }} <button class="btn-quiet" :disabled="loading || submitting" @click="load">{{ signing.retry }}</button></p>

      <section v-if="activeStep" class="card stack">
        <div class="card-title">{{ actionCardTitle }}</div>
        <p v-if="blockedReason" class="notice-line">{{ blockedReason }}</p>
        <template v-else>
          <div v-if="activeStep.actionType !== 'pass'" class="stack">
            <div v-for="file in files" :key="file.id" class="list-row stack">
              <strong>{{ file.fileName }}</strong>
              <div class="row row-wrap">
                <button v-if="['sign','both','either'].includes(activeStep.actionType)" class="btn-quiet" @click="openMaterial(file,'signature')">{{ signing.signature }}</button>
                <button v-if="['estamp','stamp','both','either'].includes(activeStep.actionType)" class="btn-quiet" @click="openMaterial(file,'stamp')">{{ signing.stamp }}</button>
                <button v-if="['sign','both','either'].includes(activeStep.actionType)" class="btn-quiet" @click="openSigning(file,'pen')">{{ signing.addInk }}</button>
                <button class="btn-quiet" @click="openSigning(file,'browse')">{{ signing.browse }}</button>
              </div>
              <div v-for="material in draftMaterials.filter(item=>item.fileId===file.id).reverse()" :key="material._idx" class="row row-wrap">
                <span>{{ material.stampName || signing.signature }} · {{ signing.page }} {{ material.page || 1 }}</span>
                <button class="btn-quiet" @click="openSigning(file,String(material._idx).startsWith('ink_')?'pen':'move',material._idx)">{{ String(material._idx).startsWith('ink_') ? signing.signAgain : signing.move }}</button>
                <button class="btn-quiet btn-quiet-danger" @click="removeMaterial(material._idx)">{{ signing.remove }}</button>
              </div>
            </div>
          </div>
          <div v-if="nextStep?.allowApproverDesignation === true" class="stack-tight">
            <span class="field-label">{{ nativeCopy.copy_3fc6899daa }}</span>
            <button class="btn-quiet" :disabled="submitting || readFailed || !!draft?.locked" @click="openNextPicker">{{ nativeCopy.copy_759682a69b }}</button>
            <span v-for="item in selectedNext" :key="item.assignmentId" class="chip chip-blue">{{ item.name }} · {{ item.assignmentLabel }}</span>
            <p v-if="pickerNotice" class="notice-line">{{ pickerNotice }}</p>
          </div>
          <label class="field">
            <span class="field-label">{{ copy.audit.approveCommentLabel }}</span>
            <textarea
              v-model="approveComment"
              class="field-input field-textarea"
              :placeholder="copy.audit.approveCommentPlaceholder"
            ></textarea>
          </label>
          <p v-if="draft && draft.pendingRead" class="notice-line">{{ signing.pendingRead }} <button class="btn-quiet" @click="load">{{ signing.retry }}</button></p>
          <button type="button" class="btn btn-primary" :disabled="submitting || readFailed || !!(draft && draft.locked)" @click="onApprove">
            {{ copy.audit.actionApprove }}
          </button>
          <label class="field">
            <span class="field-label">{{ copy.audit.rejectReasonLabel }}</span>
            <textarea
              v-model="rejectReason"
              class="field-input field-textarea"
              :placeholder="copy.audit.rejectReasonPlaceholder"
            ></textarea>
          </label>
          <button type="button" class="btn btn-danger" :disabled="submitting || readFailed || !!draft?.locked" @click="onReject">
            {{ copy.audit.actionReject }}
          </button>
        </template>
      </section>

      <section class="card stack">
        <div class="section-title">{{ copy.audit.detailStepsTitle }}</div>
        <div v-if="!steps.length" class="empty-state">{{ copy.audit.detailEmptySteps }}</div>
        <div v-for="roundGroup in flowRounds" :key="roundGroup.round" class="audit-round">
          <button class="audit-round-heading" :aria-expanded="roundExpanded[roundGroup.round] ?? roundGroup.expanded" @click="roundExpanded[roundGroup.round] = !(roundExpanded[roundGroup.round] ?? roundGroup.expanded)">
            <span class="audit-round-title">{{ signing.roundTitle.replace('{0}', roundGroup.round) }}</span>
            <span class="chip chip-sky">{{ signing.roundStates[roundGroup.status] || signing.stopped }}</span>
            <span aria-hidden="true">{{ (roundExpanded[roundGroup.round] ?? roundGroup.expanded) ? '⌄' : '›' }}</span>
          </button>
        <div v-if="roundExpanded[roundGroup.round] ?? roundGroup.expanded" class="list">
          <div v-for="step in roundGroup.steps" :key="step.id" class="list-row">
            <div class="list-row-main stack-tight">
              <span class="list-row-title">{{ stepTitle(step) }}</span>
              <span v-if="!['approved','rejected'].includes(step.status)" class="muted break-all">{{ step.approverDesc }}</span>
              <span class="row row-wrap">
                <span class="chip" :class="stepTone(step)"><span v-if="stepPresentation(step).state === 'active'" aria-hidden="true">◷ </span>{{ stepLabel(step) }}</span>
                <span v-if="step.comment" class="soft break-all">{{ step.comment }}</span>
                <span v-if="step.rejectionReason" class="soft break-all">{{ step.rejectionReason }}</span>
              </span>
              <span v-if="stepPresentation(step).hasActor" class="soft">{{ stepPresentation(step).actorName }}</span>
              <span v-if="stepPresentation(step).hasActor" class="soft">{{ stepPresentation(step).snapshot?.assignmentLabel || signing.assignmentUnknown }}</span>
            </div>
          </div>
          <div v-for="event in roundGroup.events" :key="event.id" class="list-row">
            <div class="list-row-main stack-tight">
              <span class="list-row-title">{{ eventTitle(event) }}</span>
              <span class="soft break-all"><PersonLink :name="event.operatorName || copy.audit.submitterLabel" :person-id="event.operatorPersonId" /> · {{ detailTimeText(event.createdAt, event.createdAtReviewStatus) }}</span>
              <span v-if="event.comment" class="muted break-all">{{ event.comment }}</span>
            </div>
          </div>
        </div>
        </div>
      </section>

      <section class="card stack">
        <div class="section-title">{{ copy.audit.detailFilesTitle }}</div>
        <div v-if="!files.length" class="empty-state">{{ copy.audit.detailEmptyFiles }}</div>
        <div v-else class="list">
          <div v-for="file in files" :key="file.id" class="list-row">
            <div class="list-row-main stack-tight">
              <span class="list-row-title break-all">{{ file.fileName }}</span>
              <span class="soft">{{ fileMeta(file) }}</span>
              <span v-if="submission.status !== 'withdrawn' && fileSignatureText(file)" class="soft break-all">{{ fileSignatureText(file) }}</span>
            </div>
            <div class="list-row-actions">
              <button type="button" class="btn-quiet" @click="download(file)">
                {{ copy.audit.actionDownload }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <AuditMaterialPicker v-if="materialFile" :kind="materialKind" :draft="draft" :seed="materialKind==='stamp' ? stampDirectory : undefined" @cancel="materialFile=null" @draw="openBlankSignature" @select="addMaterial" />
      <PersonnelPicker v-if="pickerVisible" :title="nativeCopy.copy_759682a69b" :options="pickerOptions" :value="selectedNext" :busy="pickerLoading" @cancel="pickerVisible=false" @confirm="confirmNextPicker"><p v-if="pickerLoading"><AppLoading :text="copy.common.loading" /></p></PersonnelPicker>

      <section v-if="canWithdraw" class="card stack">
        <button type="button" class="btn btn-secondary" :disabled="submitting" @click="onWithdraw">
          {{ copy.audit.actionWithdraw }}
        </button>
      </section>

      <button type="button" class="btn btn-secondary" @click="goBack">
        {{ copy.audit.actionBackToList }}
      </button>
    </template>

    <section v-else class="card stack">
      <div class="empty-state">{{ loadNotice || copy.audit.loadFailed }}</div>
      <button class="btn-quiet" @click="load">{{ signing.retry }}</button>
      <button type="button" class="btn btn-secondary" @click="goBack">
        {{ copy.audit.actionBackToList }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { nextTick, computed, onMounted, ref, onBeforeUnmount, reactive, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AuditMaterialPicker from '@/components/AuditMaterialPicker.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import nativeCopy from '@/locales/zh-CN/shared/generated/subpackages/audit/pages/submissionDetail/submissionDetail.js';
import { clone, nextLayerOrder } from '@/shared/auditInk.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import signing from '@/locales/zh-CN/shared/auditSigning.js';
import { signingAssets } from '@/runtime/signingAssets.js';
import { addMaterial as recordMaterial, deleteLayer } from '@/shared/auditInk.js';
import { signingDrafts, stepDraft, setSigningHandoff } from '@/runtime/signingDrafts.js';
import { presentAuditStep, groupAuditRounds } from '@/shared/auditStepView.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import {
  detailTimeText,
  downloadAuditFile,
  formatTemplate,
  statusLabel,
  statusTone,
  stepStatusLabel
} from '@/runtime/audit.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';
import { completeMessageReceipt, cancelMessageReceipt } from '@/runtime/messageReceipt.js';

const route = useRoute();
const router = useRouter();

const detail = ref(null);
const loading = ref(true);
const submitting = ref(false);
const loadNotice = ref('');
const readFailed = ref(false);
const approveComment = ref('');
const rejectReason = ref('');
const draft=ref(null), materialFile=ref(null), materialKind=ref(''), stampDirectory=ref(null), roundExpanded=ref({});
const flowRounds=computed(()=>groupAuditRounds(submission.value,steps.value,events.value));
const pickerVisible=ref(false), pickerLoading=ref(false), pickerNotice=ref(''), pickerOptions=ref([]), selectedNext=ref([]);
const requests=auditRequests();
let alive=true,requestSequence=0;
const draftMaterials=computed(()=>draft.value ? draft.value.materials.concat(...Object.values(draft.value.files).map(file=>file.exports||[])).sort((a,b)=>(a.layerOrder||0)-(b.layerOrder||0)) : []);
function openSigning(file,mode,active,rollback){if(!draft.value || draft.value.locked || readFailed.value || submitting.value)return;setSigningHandoff({draft:draft.value,file,mode,active,rollback,submissionId:submission.value.id,stepId:activeStep.value.id,round:activeStep.value.round||1,back:{name:'auditSubmission',params:{id:route.params.id}}});router.push({name:'auditSigning'});}
function openMaterial(file,kind){if(!draft.value || draft.value.locked || readFailed.value || submitting.value)return;materialFile.value=file;materialKind.value=kind;}
function openBlankSignature(){
  const target=draft.value,file=materialFile.value,step=activeStep.value;
  if(!target || target.locked || !file || !step)return;
  const handoff={draft:{files:{},materials:[],locked:false},file:{id:'blank-'+Date.now(),fileName:signing.padTitle},sourceFile:file,pad:true,allowSaveTemplate:true,mode:'pen',
    submissionId:submission.value.id,stepId:step.id,round:step.round||1,back:{name:'auditSubmission',params:{id:route.params.id}}};
  handoff.confirm=exports=>{
    if(target.locked || !exports.length)return;
    recordMaterial(signingDrafts.file(target,file.id).history,target.materials,{_idx:'signature_'+nextLayerOrder(),fileId:file.id,
      signatureType:'signature',imageData:exports[0].imageData,positionX:0.5,positionY:0.3,size:1,rotation:0,page:1});
  };
  materialFile.value=null;setSigningHandoff(handoff);router.push({name:'auditSigning'});
}
function addMaterial(row){const file=materialFile.value,kind=materialKind.value,rollback=clone(draft.value);const material={layerOrder:nextLayerOrder(),_idx:kind+'_'+Date.now()+'_'+Math.random().toString(36).slice(2),fileId:file.id,signatureType:kind==='stamp'?'stamp':'signature',imageData:row.imageData,stampId:kind==='stamp'?row.id:'',stampName:kind==='stamp'?row.name:'',positionX:0.5,positionY:0.3,size:1,rotation:0,page:1};recordMaterial(signingDrafts.file(draft.value,file.id).history,draft.value.materials,material);materialFile.value=null;openSigning(file,'move',material._idx,rollback);}
function removeMaterial(id){const material=draftMaterials.value.find(item=>item._idx===id);if(!material)return;const file=signingDrafts.file(draft.value,material.fileId);deleteLayer(file.history,draft.value.materials,material.page||1,String(id).startsWith('ink_')?material.inkLayerId||id.slice(('ink_'+material.fileId+'_').length):id);file.exports=file.exports.filter(item=>item._idx!==id);}

const displayName = computed(() => {
  const context = session.context || {};
  return context.name || (session.user && session.user.name) || '';
});

const orgName = computed(() => (session.context && session.context.organizationName) || '');

const roleLine = computed(() => {
  const context = session.context;
  if (!context) return '';
  return context.assignmentLabel || context.identityName || roleLabelOf(context);
});

function goWorkRole() {
  router.push({ name: 'workRole' });
}

const submission = computed(() => (detail.value && detail.value.submission) || {});
const steps = computed(() => (detail.value && detail.value.steps) || []);
const events = computed(() => (detail.value && detail.value.events) || []);
const files = computed(() => (detail.value && detail.value.files) || []);

const activeStep = computed(() => {
  if (!detail.value || detail.value.canApproveCurrentStep !== true) return null;
  if (submission.value.status !== 'in_progress') return null;
  const currentIndex = Number(submission.value.currentStepIndex || 0);
  const candidates = steps.value.filter(
    (step) => step.status === 'pending' && Number(step.sortOrder) === currentIndex
  );
  return candidates.length ? candidates[candidates.length - 1] : null;
});

const actionCardTitle = computed(() => (activeStep.value ? stepTitle(activeStep.value) : ''));

const blockedReason = computed(() => '');
const nextStep = computed(()=>activeStep.value ? steps.value.find(step=>Number(step.round||1)===Number(activeStep.value.round||1) && Number(step.sortOrder)===Number(activeStep.value.sortOrder)+1) : null);
async function openNextPicker(){
  if(!nextStep.value?.allowApproverDesignation || submitting.value || draft.value?.locked)return;
  pickerLoading.value=true;pickerNotice.value='';
  try{const result=requireSuccess(await requests.call('listEligibleApprovers',{submissionId:submission.value.id}));if(!alive)return;
    pickerOptions.value=(result.approvers||[]).flatMap(person=>(person.eligibleAssignments||[]).map(assignment=>({...assignment,id:person.id,name:person.name,identity:assignment.identityCategory})));
    pickerVisible.value=true;
  }catch(error){if(alive)pickerNotice.value=errorText(error,copy.audit.loadFailed);}
  finally{if(alive)pickerLoading.value=false;}
}
function confirmNextPicker(rows){selectedNext.value=rows;if(draft.value)draft.value.designatedNext=clone(rows);pickerVisible.value=false;}

const canWithdraw = computed(() => {
  if (!detail.value || detail.value.userIsSubmitter !== true) return false;
  return submission.value.status === 'in_progress' || submission.value.status === 'rejected';
});

function stepTitle(step) {
  return step.stepName || formatTemplate(copy.audit.stepNumber, [Number(step.sortOrder || 0) + 1]);
}

function stepTone(step) {
  if (step.status === 'approved') return 'chip-green';
  if (step.status === 'rejected') return 'chip-orange';
  return stepPresentation(step).state === 'active' ? 'chip-blue' : 'chip-sky';
}
function stepPresentation(step){return presentAuditStep(submission.value,step,events.value,Math.max(1,...steps.value.map(item=>Number(item.round||1))));}
function stepLabel(step){const state=stepPresentation(step).state;return state==='active'?signing.processing:state==='future'?signing.future:state==='stopped'?signing.stopped:stepStatusLabel(state);}

function fileMeta(file) {
  const size = Number(file.fileSize || 0);
  if (!size) return file.mimeType || '';
  const text = size >= 1024 * 1024
    ? (size / (1024 * 1024)).toFixed(1) + 'MB'
    : Math.max(1, Math.round(size / 1024)) + 'KB';
  return file.mimeType ? file.mimeType + ' · ' + text : text;
}

function fileSignatureText(file) {
  const list = Array.isArray(detail.value.signatures) ? detail.value.signatures : [];
  const names = list.filter((item) => item.fileId === file.id).map((item) => item.signerName);
  if (!names.length) return '';
  return copy.audit.actionLabels.sign + '：' + Array.from(new Set(names)).join('、');
}

function eventTitle(event) {
  const map = {
    approve: copy.audit.eventApproved,
    reject: copy.audit.eventRejected,
    withdraw: copy.audit.eventWithdrawn,
    resubmit: copy.audit.eventResubmitted,
    submit: copy.audit.eventSubmitted
  };
  return map[event.eventType] || event.eventType;
}

async function load() {
  const request=++requestSequence;
  loading.value = !detail.value;
  readFailed.value = true;
  loadNotice.value = '';
  try {
    const result = await requests.call('getSubmissionDetail', { submissionId: route.params.id });
    if(!alive || request!==requestSequence)return;
    if (result.status !== 'success') {
      cancelMessageReceipt();
      loadNotice.value = result.message || copy.audit.loadFailed;
      return;
    }
    detail.value = result;
    readFailed.value = false;
    if(activeStep.value){draft.value=reactive(stepDraft(submission.value,activeStep.value,files.value));
      approveComment.value=draft.value.comment||'';selectedNext.value=draft.value.designatedNext||[];
      if(draft.value.pendingRead){draft.value.pendingRead=false;}
      const assetDraft=draft.value;
      nextTick(()=>{if(alive&&request===requestSequence)signingAssets.warm(assetDraft,files.value,[]);});
      if(['estamp','stamp','both','either'].includes(activeStep.value.actionType)){signingAssets.directory(assetDraft).then(({response:value})=>{if(alive&&request===requestSequence&&value.status==='success'){stampDirectory.value=value.stamps||[];signingAssets.warm(assetDraft,[],stampDirectory.value);}}).catch(()=>{});}}
    else if(draft.value)draft.value.pendingRead=false;
    await completeMessageReceipt(route);
    try {
      await callApi('markSubmissionRead', { submissionId: route.params.id });
    } catch (_) {}
  } catch (error) {
    cancelMessageReceipt();
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  } finally {
    if(alive && request===requestSequence)loading.value = false;
  }
}

async function onApprove() {
  const step = activeStep.value;
  if (!step || readFailed.value || submitting.value || (draft.value && draft.value.locked)) return;
  const hasSignature=draftMaterials.value.some(item=>item.signatureType==='signature'),hasStamp=draftMaterials.value.some(item=>item.signatureType==='stamp');
  if((step.actionType==='sign' && !hasSignature)||(step.actionType==='both' && !hasSignature && hasStamp)){loadNotice.value=nativeCopy.copy_a6f8fa4809;return;}
  if((['stamp','estamp'].includes(step.actionType) && !hasStamp)||(step.actionType==='both' && hasSignature && !hasStamp)){loadNotice.value=nativeCopy.copy_472d3dfdab;return;}
  if(step.actionType==='either' && !hasSignature && !hasStamp){loadNotice.value=signing.eitherRequired;return;}
  if(step.actionType==='both' && !hasSignature && !hasStamp){loadNotice.value=nativeCopy.copy_448b029911;return;}
  submitting.value = true;
  loadNotice.value = '';
  try {
    requireSuccess(await callApi('approveStep', {
      submissionId: route.params.id,
      stepId: step.id,
      comment: approveComment.value,
      designatedNextPersonIds: [...new Set(selectedNext.value.map(item=>item.id))],
      designatedNextAssignmentIds: selectedNext.value.map(item=>item.assignmentId),
      signatures: draftMaterials.value.map(material=>({fileId:material.fileId,signatureType:material.signatureType,
        positionX:material.positionX,positionY:material.positionY,size:material.size||1,rotation:material.rotation||0,page:material.page||1,
        ...(material.widthRatio==null?{}:{widthRatio:material.widthRatio}),
        ...(material.signatureType==='stamp'?{stampId:material.stampId}:{imageData:material.imageData})}))
    }));
    if(draft.value){draft.value.locked=true;draft.value.pendingRead=true;}
    showToast(copy.audit.approveDone);
    approveComment.value = '';
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.actionFailed);
  } finally {
    submitting.value = false;
  }
}

async function onReject() {
  const step = activeStep.value;
  if (!step || readFailed.value || submitting.value || draft.value?.locked) return;
  const reason = rejectReason.value.trim();
  if (!reason) {
    loadNotice.value = copy.audit.rejectReasonRequired;
    return;
  }
  submitting.value = true;
  loadNotice.value = '';
  try {
    requireSuccess(await callApi('rejectStep', {
      submissionId: route.params.id,
      stepId: step.id,
      rejectionReason: reason
    }));
    showToast(copy.audit.rejectDone);
    if(draft.value){draft.value.locked=true;draft.value.pendingRead=true;}
    rejectReason.value = '';
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.actionFailed);
  } finally {
    submitting.value = false;
  }
}

async function onWithdraw() {
  const confirmed = await confirmAction({
    title: copy.audit.withdrawConfirmTitle,
    body: copy.audit.withdrawConfirmBody,
    confirmText: copy.audit.actionWithdraw,
    cancelText: copy.common.cancel,
    danger: true
  });
  if (!confirmed) return;
  submitting.value = true;
  loadNotice.value = '';
  try {
    requireSuccess(await callApi('withdrawSubmission', { submissionId: route.params.id }));
    showToast(copy.audit.withdrawDone);
    if(draft.value){draft.value.locked=true;draft.value.pendingRead=true;}
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.withdrawFailed);
  } finally {
    submitting.value = false;
  }
}

async function download(file) {
  try {
    await downloadAuditFile(file.id, file.fileName);
  } catch (_) {
    loadNotice.value = copy.audit.actionFailed;
  }
}

function goBack() {
  router.push({ name: 'auditMySubmissions' });
}

onMounted(load);
watch(approveComment,value=>{if(draft.value)draft.value.comment=value;});
onBeforeRouteLeave(()=>session.status!=='authenticated'||!submitting.value);
onBeforeUnmount(()=>{alive=false;requestSequence+=1;requests.dispose();});
</script>

<style scoped>
.audit-round-heading { display:flex; align-items:center; gap:var(--ui-inline-gap); width:100%; min-height:var(--ui-field-control-height); padding:var(--ui-control-padding-y) 0; background:transparent; border:0; color:var(--ui-text); text-align:left; }
.audit-round-title { flex:1; min-width:0; font-size:var(--ui-type-section); font-weight:700; line-height:1.4; }
.field-textarea {
  min-height: 84px;
  line-height: 1.5;
  resize: vertical;
}
</style>
