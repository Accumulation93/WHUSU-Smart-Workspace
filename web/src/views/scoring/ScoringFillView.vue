<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.scoring.fillTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section v-if="loading" class="card">
      <div class="empty-state">{{ copy.common.loading }}</div>
    </section>

    <template v-else-if="form">
      <section class="hero stack-tight">
        <div class="hero-badge">{{ activity.name }}</div>
        <h1 class="hero-title break-all">{{ target.name }}</h1>
        <p class="hero-subtitle">
          <span v-if="target.department">{{ target.department }}</span>
          <span v-if="target.identity"> · {{ target.identity }}</span>
          <span v-if="target.workGroup"> · {{ target.workGroup }}</span>
        </p>
      </section>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <p v-if="form.readOnly" class="notice-line">
        {{ copy.scoring.readOnlyNotice }}
        <span v-if="form.readOnlyReason"> {{ copy.scoring.readOnlyReason }}</span>
      </p>
      <p v-else-if="existingRecord" class="notice-line notice-line-info">
        {{ copy.scoring.existingRecordNotice }}
      </p>

      <section class="card stack">
        <div class="info-head">
          <span class="section-title">{{ form.templateBundle.name || copy.scoring.fillTitle }}</span>
          <span v-if="totalScore !== ''" class="chip chip-blue">
            {{ copy.scoring.totalLabel }} {{ totalScore }}
          </span>
        </div>

        <div v-for="group in questionGroups" :key="group.templateId" class="stack">
          <div class="panel-head">
            <span class="field-label break-all">{{ group.templateName }}</span>
            <span v-if="group.weight !== null" class="soft">
              {{ copy.scoring.templateWeightLabel }} {{ group.weight }}
            </span>
          </div>
          <div class="list">
            <div v-for="question in group.questions" :key="question.id" class="list-row">
              <div class="list-row-main stack-tight">
                <span class="list-row-title break-all">
                  {{ question.questionIndex }}. {{ question.question }}
                </span>
                <span class="soft">
                  {{ question.scoreLabel }} {{ question.minValue }} - {{ question.maxValue }}
                </span>
              </div>
              <div class="list-row-actions">
                <input
                  class="field-input score-input"
                  type="number"
                  inputmode="decimal"
                  :min="question.minValue"
                  :max="question.maxValue"
                  :step="question.stepValue"
                  :disabled="form.readOnly || submitting"
                  :value="answers[question.id]"
                  @input="onAnswerInput(question, $event)"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <button v-if="!form.readOnly" type="button" class="btn btn-primary" :disabled="submitting" @click="submit">
        {{ submitting ? copy.scoring.submitting : copy.scoring.actionSubmit }}
      </button>
      <button type="button" class="btn btn-secondary" @click="goBack">
        {{ copy.scoring.actionBackToTasks }}
      </button>
    </template>

    <section v-else class="card stack">
      <div class="empty-state">{{ loadNotice || copy.scoring.loadFailed }}</div>
      <button type="button" class="btn btn-secondary" @click="goBack">
        {{ copy.scoring.actionBackToTasks }}
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
import { formatTemplate } from '@/runtime/audit.js';
import { showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const route = useRoute();
const router = useRouter();

const form = ref(null);
const loading = ref(true);
const submitting = ref(false);
const loadNotice = ref('');
const answers = ref({});

const activity = computed(() => (form.value && form.value.currentActivity) || {});
const target = computed(() => (form.value && form.value.target) || {});
const existingRecord = computed(() => (form.value && form.value.existingRecord) || null);

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

/** 按模板分组展示，同一模板的题目归到一组，与小程序的分组一致。 */
const questionGroups = computed(() => {
  const questions = (form.value && form.value.templateBundle && form.value.templateBundle.questions) || [];
  const groups = [];
  const index = new Map();
  questions.forEach((question) => {
    const key = question.templateId || question.templateName || 'default';
    if (!index.has(key)) {
      index.set(key, {
        templateId: key,
        templateName: question.templateName || '',
        weight: question.templateWeight === undefined ? null : question.templateWeight,
        questions: []
      });
      groups.push(index.get(key));
    }
    index.get(key).questions.push(question);
  });
  return groups;
});

const totalScore = computed(() => {
  const questions = (form.value && form.value.templateBundle && form.value.templateBundle.questions) || [];
  let hasValue = false;
  let sum = 0;
  questions.forEach((question) => {
    const raw = answers.value[question.id];
    if (raw === undefined || raw === '') return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    hasValue = true;
    sum += value;
  });
  if (!hasValue) return '';
  return Math.round(sum * 100) / 100;
});

function onAnswerInput(question, event) {
  answers.value = Object.assign({}, answers.value, { [question.id]: event.target.value });
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function goBack() {
  router.push({ name: 'scoringTasks' });
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('getScoreFormData', { targetId: route.params.id });
    if (result.status !== 'success') {
      form.value = null;
      loadNotice.value = result.message || '';
      return;
    }
    form.value = result;
    const questions = (result.templateBundle && result.templateBundle.questions) || [];
    const seeded = {};
    questions.forEach((question) => {
      seeded[question.id] = question.score === undefined || question.score === null || question.score === ''
        ? ''
        : String(question.score);
    });
    answers.value = seeded;
  } catch (error) {
    form.value = null;
    loadNotice.value = errorText(error, copy.scoring.loadFailed);
  } finally {
    loading.value = false;
  }
}

/** 校验口径与小程序一致：必填、上下限、按步长对齐。 */
function validate() {
  const questions = (form.value && form.value.templateBundle && form.value.templateBundle.questions) || [];
  const list = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const raw = answers.value[question.id];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return { ok: false, message: copy.scoring.questionRequired };
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) return { ok: false, message: copy.scoring.questionRequired };
    const min = Number(question.minValue);
    const max = Number(question.maxValue);
    if (Number.isFinite(min) && Number.isFinite(max) && (value < min || value > max)) {
      return {
        ok: false,
        message: formatTemplate(copy.scoring.questionRange, [index + 1, min, max])
      };
    }
    const step = Number(question.stepValue);
    if (Number.isFinite(step) && step > 0) {
      const start = Number(question.startValue) || 0;
      const diff = (value - start) / step;
      if (Math.abs(diff - Math.round(diff)) > 1e-8) {
        return {
          ok: false,
          message: formatTemplate(copy.scoring.questionStep, [index + 1, step])
        };
      }
    }
    list.push({ questionIndex: index + 1, score: value });
  }
  return { ok: true, answers: list };
}

async function submit() {
  if (submitting.value || !form.value) return;
  const validation = validate();
  if (!validation.ok) {
    loadNotice.value = validation.message;
    return;
  }
  submitting.value = true;
  loadNotice.value = '';
  try {
    const record = existingRecord.value;
    const result = await callApi('submitScoreRecord', {
      scorerId: (form.value.scorer && form.value.scorer.id) || '',
      scorerAssignmentId: (form.value.scorer && form.value.scorer.assignmentId) || '',
      targetId: target.value.assignmentId || route.params.id,
      activityId: activity.value.id,
      activityName: activity.value.name,
      templateConfigSignature: form.value.rule && form.value.rule.templateConfigSignature,
      answers: validation.answers,
      existingRecordId: record ? record.id : '',
      existingRecordRevision: record ? record.revisionNumber : 0
    });
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.scoring.submitFailed;
      if (result.status === 'score_revision_conflict') {
        loadNotice.value = copy.scoring.revisionConflict;
        await load();
      }
      return;
    }
    showToast(copy.scoring.submitDone);
    router.replace({ name: 'scoringTasks' });
  } catch (error) {
    loadNotice.value = errorText(error, copy.scoring.submitFailed);
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.score-input {
  width: 92px;
  min-width: 92px;
  text-align: center;
}
</style>
