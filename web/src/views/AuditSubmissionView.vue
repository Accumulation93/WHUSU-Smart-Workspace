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
        <div v-if="submission.status !== 'draft'" class="stack-tight audit-submitter">
          <div class="row row-wrap">
            <span class="chip chip-sky audit-submitter-label">
              {{ nativeCopy.submitterLabel }}
              <PersonLink v-if="submitter.name" :name="submitter.name" :hr-id="submitter.hrId" :person-id="submitter.personId" />
              <span v-else>{{ nativeCopy.submitterNameMissing }}</span>
            </span>
          </div>
          <p v-if="submittedAssignmentText" class="hero-subtitle audit-submitted-at">{{ submittedAssignmentText }}</p>
        </div>
        <div class="row row-wrap">
          <span v-if="submission.templateName" class="chip chip-sky">{{ submission.templateName }}</span>
          <span v-if="submission.status !== 'draft'" class="hero-subtitle audit-submitted-at">{{ copy.audit.submittedAtLabel }} {{ detailTimeText(submission.createdAt, submission.createdAtReviewStatus) }}</span>
        </div>
      </section>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }} <button class="btn-quiet" :disabled="loading || submitting" @click="load">{{ signing.retry }}</button></p>

      <section v-if="directSteps.length" class="card stack">
        <div v-if="directMaterialSteps.length" class="stack-tight">
          <div class="section-title">{{ directCopy.audit.directApprovePendingMaterials }}</div>
          <div class="row row-wrap">
            <button v-for="step in directMaterialSteps" :key="step.id" type="button" class="btn-quiet"
              :class="{ 'btn-quiet-primary': selectedDirectStep === step.id }" :aria-pressed="selectedDirectStep === step.id"
              :disabled="submitting || readFailed" @click="selectDirectStep(step.id)">{{ stepTitle(step) }}</button>
          </div>
        </div>
        <button type="button" class="btn btn-secondary" :disabled="submitting || readFailed" @click="onDirectApprove">{{ directCopy.directApproveAction }}</button>
      </section>

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
          <div v-if="!selectedDirectStep && nextStep?.allowApproverDesignation === true" class="stack-tight">
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
          <button v-if="!selectedDirectStep" type="button" class="btn btn-primary" :disabled="submitting || readFailed || !!(draft && draft.locked)" @click="onApprove">
            {{ copy.audit.actionApprove }}
          </button>
          <label v-if="!selectedDirectStep" class="field">
            <span class="field-label">{{ copy.audit.rejectReasonLabel }}</span>
            <textarea
              v-model="rejectReason"
              class="field-input field-textarea"
              :placeholder="copy.audit.rejectReasonPlaceholder"
            ></textarea>
          </label>
          <button v-if="!selectedDirectStep" type="button" class="btn btn-danger" :disabled="submitting || readFailed || !!draft?.locked" @click="onReject">
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
              <span class="row row-wrap">
                <span class="chip" :class="stepTone(step)"><span v-if="stepPresentation(step).state === 'active'" aria-hidden="true">◷ </span>{{ stepLabel(step) }}</span>
                <span v-if="step.comment" class="soft break-all">{{ step.comment }}</span>
                <span v-if="step.rejectionReason" class="soft break-all">{{ step.rejectionReason }}</span>
              </span>
              <span v-if="stepPresentation(step).hasActor" class="soft"><template v-if="stepPresentation(step).directApproval">{{ directCopy.directApprovalActor }} · </template>{{ stepPresentation(step).actorName }}</span>
              <span v-if="stepPresentation(step).directApproval && step.originalApproverNames?.length" class="soft">{{ directCopy.audit.originalApprover }} · {{ step.originalApproverNames.join(' · ') }}</span>
              <span v-if="stepAssignmentText(step)" class="soft break-all">{{ stepAssignmentText(step) }}</span>
            </div>
          </div>
          <div v-for="event in roundGroup.events" :key="event.id" class="list-row">
            <div class="list-row-main stack-tight">
              <span class="list-row-title">{{ eventTitle(event) }}</span>
              <span class="soft break-all"><PersonLink v-if="event.operatorName" :name="event.operatorName" :person-id="event.operatorPersonId" /><span v-else>{{ signing.actorUnknown }}</span> · {{ detailTimeText(event.createdAt, event.createdAtReviewStatus) }}</span>
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
              <template v-if="submission.status !== 'withdrawn'">
                <span v-for="label in fileSignatureLabels(file)" :key="label" class="soft break-all">{{ label }}</span>
              </template>
            </div>
            <div class="list-row-actions">
              <button type="button" class="btn-quiet" @click="download(file)">
                {{ copy.audit.actionDownload }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <AuditMaterialPicker v-if="materialFile" :kind="materialKind" :draft="draft" :seed="materialKind==='stamp' && !selectedDirectStep ? stampDirectory : undefined"
        :direct-stamps="materialKind === 'stamp' && !!selectedDirectStep" :stamp-assignment="selectedStampAssignment()"
        @cancel="materialFile=null" @draw="openBlankSignature" @select="addMaterial" />
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
import { clone, nextLayerOrder, prepareSignatureWidths } from '@/shared/auditInk.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import signing from '@/locales/zh-CN/shared/auditSigning.js';
import directCopy from '@/locales/zh-CN/shared/approvalDirect.js';
import { signingAssets } from '@/runtime/signingAssets.js';
import { addMaterial as recordMaterial, deleteLayer } from '@/shared/auditInk.js';
import { signingDrafts, stepDraft, setSigningHandoff } from '@/runtime/signingDrafts.js';
import { presentAuditSubmitter, presentAuditStep, groupAuditRounds, materialsOfAuditDraft, auditMaterialInput, missingAuditMaterial } from '@/shared/auditStepView.js';
import { auditAssignmentLabel, isAuditAdministrativeContext } from '@/runtime/auditAssignmentLabel.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import {
  detailTimeText,
  downloadAuditFile,
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
const draftMaterials = computed(() => materialsOfAuditDraft(draft.value));
function signingBackRoute() { return { name: 'auditSubmission', params: { id: route.params.id }, query: { ...route.query } }; }
function openSigning(file,mode,active,rollback){if(!draft.value || draft.value.locked || readFailed.value || submitting.value)return;setSigningHandoff({draft:draft.value,file,mode,active,rollback,submissionId:submission.value.id,stepId:activeStep.value.id,round:activeStep.value.round||1,directApproval:!!selectedDirectStep.value,back:signingBackRoute()});router.push({name:'auditSigning'});}
function openMaterial(file,kind){if(!draft.value || draft.value.locked || readFailed.value || submitting.value)return;materialFile.value=file;materialKind.value=kind;}
function openBlankSignature(){
  const target=draft.value,file=materialFile.value,step=activeStep.value;
  if(!target || target.locked || !file || !step)return;
  const handoff={draft:{files:{},materials:[],locked:false},file:{id:'blank-'+Date.now(),fileName:signing.padTitle},sourceFile:file,pad:true,allowSaveTemplate:true,mode:'pen',
    submissionId:submission.value.id,stepId:step.id,round:step.round||1,directApproval:!!selectedDirectStep.value,back:signingBackRoute()};
  handoff.confirm=exports=>{
    if(target.locked || !exports.length)return;
    recordMaterial(signingDrafts.file(target,file.id).history,target.materials,{_idx:'signature_'+nextLayerOrder(),fileId:file.id,
      signatureType:'signature',imageData:exports[0].imageData,positionX:0.5,positionY:0.3,size:1,rotation:0,page:1});
  };
  materialFile.value=null;setSigningHandoff(handoff);router.push({name:'auditSigning'});
}
function addMaterial(row){const file=materialFile.value,kind=materialKind.value,rollback=clone(draft.value);const material={layerOrder:nextLayerOrder(),_idx:kind+'_'+Date.now()+'_'+Math.random().toString(36).slice(2),fileId:file.id,signatureType:kind==='stamp'?'stamp':'signature',imageData:row.imageData,stampId:kind==='stamp'?row.id:'',stampName:kind==='stamp'?row.name:'',stampAssignmentId:row.assignmentId,positionX:0.5,positionY:0.3,size:1,rotation:0,page:1};recordMaterial(signingDrafts.file(draft.value,file.id).history,draft.value.materials,material);materialFile.value=null;openSigning(file,'move',material._idx,rollback);}
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
const events = computed(() => (detail.value && detail.value.events) || []);
const submitter = computed(() => presentAuditSubmitter(submission.value, events.value, nativeCopy.legacySubmitterNamePlaceholder));
const submittedAssignmentText = computed(() => {
  const snapshot = submitter.value.snapshot;
  if (isAuditAdministrativeContext(snapshot)) return '';
  const label = auditAssignmentLabel(snapshot);
  return label ? nativeCopy.submittedWithAssignment(label) : nativeCopy.submissionRoleMissing;
});
const steps = computed(() => (detail.value && detail.value.steps) || []);
const files = computed(() => (detail.value && detail.value.files) || []);
const directSteps = computed(() => detail.value?.canDirectApprove === true
  ? (detail.value.directApprovalSteps || []).map(entry => {
    const step = steps.value.find(item => item.id === entry.stepId);
    return step && { ...step, actionType: entry.actionType };
  }).filter(Boolean) : []);
const directMaterialSteps = computed(() => directSteps.value.filter(step => step.actionType !== 'pass'));
const selectedDirectStep = computed(() => directMaterialSteps.value.find(step => step.id === route.query.directStep)?.id || '');
const directDraft = step => stepDraft(submission.value, step, files.value, true);
function selectedStampAssignment() {
  return selectedDirectStep.value ? directMaterialSteps.value.flatMap(step => materialsOfAuditDraft(directDraft(step)))
    .find(item => item.signatureType === 'stamp' && item.stampAssignmentId)?.stampAssignmentId || '' : '';
}
function selectDirectStep(id) {
  if (submitting.value || readFailed.value) return;
  const target = { ...route.query };
  if (selectedDirectStep.value === id) delete target.directStep;
  else target.directStep = id;
  router.replace({ query: target });
}

const activeStep = computed(() => {
  if (selectedDirectStep.value) return directMaterialSteps.value.find(step => step.id === selectedDirectStep.value);
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
  if (!detail.value || detail.value.userIsSubmitter !== true || detail.value.canWithdrawSubmission === false) return false;
  return submission.value.status === 'in_progress' || submission.value.status === 'rejected';
});

function stepTitle(step) {
  const order = Number(step.sortOrder);
  return step.stepName || (Number.isInteger(order) && order > 0 ? nativeCopy.stepNumber(order) : nativeCopy.copy_265568fe85);
}

function stepTone(step) {
  if (stepPresentation(step).bypassed) return 'chip-sky';
  if (step.status === 'approved') return 'chip-green';
  if (step.status === 'rejected') return 'chip-orange';
  return stepPresentation(step).state === 'active' ? 'chip-blue' : 'chip-sky';
}
function stepPresentation(step){return presentAuditStep(submission.value,step,events.value,Math.max(1,...steps.value.map(item=>Number(item.round||1))));}
function stepAssignmentText(step) {
  const presentation = stepPresentation(step);
  if (!presentation.hasActor) return '';
  for (const snapshot of [presentation.snapshot, step.processedContextSnapshot]) {
    if (isAuditAdministrativeContext(snapshot)) return '';
    const label = auditAssignmentLabel(snapshot);
    if (label) return nativeCopy.processedWithAssignment(label);
  }
  return nativeCopy.approvalRoleMissing;
}
function stepLabel(step){const presentation=stepPresentation(step), state=presentation.state;return presentation.bypassed ? directCopy.audit.bypassedUntilDirectDecision : state==='active'?signing.processing:state==='future'?signing.future:state==='stopped'?signing.stopped:stepStatusLabel(state);}

function fileMeta(file) {
  const size = Number(file.fileSize || 0);
  if (!size) return file.mimeType || '';
  const text = size >= 1024 * 1024
    ? (size / (1024 * 1024)).toFixed(1) + 'MB'
    : Math.max(1, Math.round(size / 1024)) + 'KB';
  return file.mimeType ? file.mimeType + ' · ' + text : text;
}

function fileSignatureLabels(file) {
  const signatures = detail.value.signatures;
  const records = Array.isArray(signatures) ? signatures.filter((item) => item.fileId === file.id) : [];
  const labels = [];
  for (const [type, formatLabel] of [
    ['signature', nativeCopy.fileHandwrittenSigners],
    ['stamp', nativeCopy.fileStampOperators]
  ]) {
    const matches = records.filter((item) => item.signatureType === type);
    if (!matches.length) continue;
    const names = matches.map((item) => String(item.signerName || '').trim())
      .filter((name) => name && name !== nativeCopy.legacySubmitterNamePlaceholder);
    labels.push(formatLabel([...new Set(names)].join('、')));
  }
  if (records.some((item) => item.signatureType === 'digital')) labels.push(nativeCopy.fileDigitalSigningRecord);
  if (records.some((item) => !['signature', 'stamp', 'digital'].includes(item.signatureType))) {
    labels.push(nativeCopy.fileOtherSigningRecord);
  }
  return labels;
}

function eventTitle(event) {
  if (event.operatorContextSnapshot?.directApproval) return directCopy.directApprovalEvent;
  const map = {
    approve: copy.audit.eventApproved,
    reject: copy.audit.eventRejected,
    withdraw: copy.audit.eventWithdrawn,
    resubmit: copy.audit.eventResubmitted,
    edit: nativeCopy.copy_cacc39a0fd,
    submit: copy.audit.eventSubmitted
  };
  return Object.prototype.hasOwnProperty.call(map, event.eventType) ? map[event.eventType] : nativeCopy.eventTypeUnknown;
}

function activateStepDraft(request) {
  stampDirectory.value = null;
  if (!activeStep.value) {
    if (draft.value) draft.value.pendingRead = false;
    draft.value = null;
    return;
  }
  const assetDraft = reactive(stepDraft(submission.value, activeStep.value, files.value, !!selectedDirectStep.value));
  draft.value = assetDraft;
  approveComment.value = assetDraft.comment || '';
  selectedNext.value = assetDraft.designatedNext || [];
  assetDraft.pendingRead = false;
  const current = () => alive && request === requestSequence && draft.value === assetDraft;
  nextTick(() => { if (current()) signingAssets.warm(assetDraft, files.value, []); });
  if (!selectedDirectStep.value && ['estamp', 'stamp', 'both', 'either'].includes(activeStep.value.actionType)) {
    signingAssets.directory(assetDraft).then(({ response }) => {
      if (current() && response.status === 'success') {
        stampDirectory.value = response.stamps || [];
        signingAssets.warm(assetDraft, [], stampDirectory.value);
      }
    }).catch(() => {});
  }
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
    activateStepDraft(request);
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

async function onDirectApprove() {
  if (!directSteps.value.length || readFailed.value || submitting.value) return;
  const plans = directMaterialSteps.value.map(step => {
    const stepDraft = directDraft(step);
    return { step, stepDraft, materials: materialsOfAuditDraft(stepDraft) };
  });
  for (const item of plans) {
    const missing = missingAuditMaterial(item.step.actionType, files.value, item.materials);
    if (!missing) continue;
    const requirement = missing === 'stamp' ? signing.stamp : copy.audit.actionLabels[missing] || signing.either;
    loadNotice.value = directCopy.audit.directApproveMissing.replace('{stepTitle}', stepTitle(item.step)).replace('{requirement}', requirement);
    if (selectedDirectStep.value !== item.step.id) selectDirectStep(item.step.id);
    return;
  }
  const stepId = directSteps.value[0].id;
  const scope = session.context?.contextId;
  const current = () => alive && scope === session.context?.contextId;
  submitting.value = true;
  loadNotice.value = '';
  try {
    const confirmed = await confirmAction({ title: directCopy.directApproveAction, body: directCopy.audit.directApproveConfirm,
      confirmText: directCopy.directApproveAction, cancelText: signing.cancel });
    if (!confirmed || !current()) return;
    for (const item of plans) {
      await prepareSignatureWidths(item.materials, files.value, (file, page) => signingAssets.preview(item.stepDraft, file, page));
    }
    if (!current()) return;
    requireSuccess(await callApi('directApproveSubmission', { submissionId: submission.value.id, stepId,
      comment: approveComment.value, stampAssignmentId: selectedStampAssignment() || plans.flatMap(item => item.materials)
        .find(material => material.signatureType === 'stamp')?.stampAssignmentId,
      stepMaterials: plans.map(item => ({ stepId: item.step.id, signatures: item.materials.map(auditMaterialInput) })) }));
    if (!current()) return;
    plans.forEach(item => { item.stepDraft.locked = true; item.stepDraft.pendingRead = true; });
    if (draft.value) draft.value.locked = true;
    showToast(directCopy.audit.directApproveSucceeded);
    await load();
  } catch (error) { if (current()) loadNotice.value = errorText(error, directCopy.directApproveChanged); }
  finally { if (current()) submitting.value = false; }
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
    const target = draft.value;
    await prepareSignatureWidths(draftMaterials.value, files.value, (file, page) => signingAssets.preview(target, file, page));
    if (!alive || draft.value !== target || target?.locked) return;
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
watch(() => route.query.directStep, () => { if (detail.value && !readFailed.value) activateStepDraft(requestSequence); });
watch(approveComment,value=>{if(draft.value)draft.value.comment=value;});
onBeforeRouteLeave(()=>session.status!=='authenticated'||!submitting.value);
onBeforeUnmount(()=>{alive=false;requestSequence+=1;requests.dispose();});
</script>

<style scoped>
.audit-submitter-label { gap: var(--ui-inline-gap); max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.audit-submitted-at { margin-top: 0; font-size: var(--ui-type-caption); }
.audit-round-heading { display:flex; align-items:center; gap:var(--ui-inline-gap); width:100%; min-height:var(--ui-field-control-height); padding:var(--ui-control-padding-y) 0; background:transparent; border:0; color:var(--ui-text); text-align:left; }
.audit-round-title { flex:1; min-width:0; font-size:var(--ui-type-section); font-weight:700; line-height:1.4; }
.field-textarea {
  min-height: 84px;
  line-height: 1.5;
  resize: vertical;
}
</style>
