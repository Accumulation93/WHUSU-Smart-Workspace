<template>
  <div class="page stack">
    <section v-if="loading" class="card">
      <div class="empty-state">{{ copy.common.loading }}</div>
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
          <span class="chip chip-sky">{{ copy.audit.submitterLabel }} {{ submission.submitterName }}</span>
          <span v-if="submission.templateName" class="chip chip-sky">{{ submission.templateName }}</span>
          <span class="soft">{{ copy.audit.submittedAtLabel }} {{ detailTimeText(submission.createdAt, submission.createdAtReviewStatus) }}</span>
        </div>
      </section>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <section v-if="activeStep" class="card stack">
        <div class="card-title">{{ actionCardTitle }}</div>
        <p v-if="blockedReason" class="notice-line">{{ blockedReason }}</p>
        <template v-else>
          <label class="field">
            <span class="field-label">{{ copy.audit.approveCommentLabel }}</span>
            <textarea
              v-model="approveComment"
              class="field-input field-textarea"
              :placeholder="copy.audit.approveCommentPlaceholder"
            ></textarea>
          </label>
          <button type="button" class="btn btn-primary" :disabled="submitting" @click="onApprove">
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
          <button type="button" class="btn btn-danger" :disabled="submitting" @click="onReject">
            {{ copy.audit.actionReject }}
          </button>
        </template>
      </section>

      <section class="card stack">
        <div class="section-title">{{ copy.audit.detailStepsTitle }}</div>
        <div v-if="!steps.length" class="empty-state">{{ copy.audit.detailEmptySteps }}</div>
        <div v-else class="list">
          <div v-for="step in steps" :key="step.id" class="list-row">
            <div class="list-row-main stack-tight">
              <span class="list-row-title">{{ stepTitle(step) }}</span>
              <span class="muted break-all">{{ step.approverDesc }}</span>
              <span class="row row-wrap">
                <span class="chip" :class="stepTone(step)">{{ stepStatusLabel(step.status) }}</span>
                <span v-if="step.actionType === 'sign'" class="chip chip-orange">{{ copy.audit.actionLabels.sign }}</span>
                <span v-if="step.comment" class="soft break-all">{{ step.comment }}</span>
                <span v-if="step.rejectionReason" class="soft break-all">{{ step.rejectionReason }}</span>
              </span>
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
              <span v-if="fileSignatureText(file)" class="soft break-all">{{ fileSignatureText(file) }}</span>
            </div>
            <div class="list-row-actions">
              <button type="button" class="btn-quiet" @click="download(file)">
                {{ copy.audit.actionDownload }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="card stack">
        <div class="section-title">{{ copy.audit.detailEventsTitle }}</div>
        <div v-if="!events.length" class="empty-state">{{ copy.audit.emptyHistory }}</div>
        <div v-else class="list">
          <div v-for="event in events" :key="event.id" class="list-row">
            <div class="list-row-main stack-tight">
              <span class="list-row-title">{{ eventTitle(event) }}</span>
              <span class="soft break-all">
                {{ event.operatorName || copy.audit.submitterLabel }} ·
                {{ detailTimeText(event.createdAt, event.createdAtReviewStatus) }}
              </span>
              <span v-if="event.comment" class="muted break-all">{{ event.comment }}</span>
            </div>
          </div>
        </div>
      </section>

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
      <button type="button" class="btn btn-secondary" @click="goBack">
        {{ copy.audit.actionBackToList }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
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

const route = useRoute();
const router = useRouter();

const detail = ref(null);
const loading = ref(true);
const submitting = ref(false);
const loadNotice = ref('');
const approveComment = ref('');
const rejectReason = ref('');

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

/** 当前待处理步骤：服务端只把「当前步骤是否归我处理」算好，具体步骤要对齐序号取最后一条。 */
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

/**
 * 需要签名或需要指定下一步审批人的步骤，网页版还没有对应的操作界面，
 * 这里明确告诉用户去小程序办理，不做半截动作。
 */
const blockedReason = computed(() => {
  const step = activeStep.value;
  if (!step) return '';
  if (step.actionType === 'sign') {
    return copy.audit.signatureRequiredTitle + '：' + copy.audit.signatureRequiredBody;
  }
  if (step.allowApproverDesignation === true) return copy.audit.designateRequiredBody;
  return '';
});

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
  return 'chip-blue';
}

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
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('getSubmissionDetail', { submissionId: route.params.id });
    if (result.status !== 'success') {
      detail.value = null;
      loadNotice.value = result.message || copy.audit.loadFailed;
      return;
    }
    detail.value = result;
    // 打开详情即代表已读，与小程序行为一致；失败不影响查看。
    try {
      await callApi('markSubmissionRead', { submissionId: route.params.id });
    } catch (_) {}
  } catch (error) {
    detail.value = null;
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  } finally {
    loading.value = false;
  }
}

async function onApprove() {
  const step = activeStep.value;
  if (!step || submitting.value) return;
  submitting.value = true;
  loadNotice.value = '';
  try {
    await callApi('approveStep', {
      submissionId: route.params.id,
      stepId: step.id,
      comment: approveComment.value
    });
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
  if (!step || submitting.value) return;
  const reason = rejectReason.value.trim();
  if (!reason) {
    loadNotice.value = copy.audit.rejectReasonRequired;
    return;
  }
  submitting.value = true;
  loadNotice.value = '';
  try {
    await callApi('rejectStep', {
      submissionId: route.params.id,
      stepId: step.id,
      rejectionReason: reason
    });
    showToast(copy.audit.rejectDone);
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
    await callApi('withdrawSubmission', { submissionId: route.params.id });
    showToast(copy.audit.withdrawDone);
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
</script>

<style scoped>
.field-textarea {
  min-height: 84px;
  line-height: 1.5;
  resize: vertical;
}
</style>
