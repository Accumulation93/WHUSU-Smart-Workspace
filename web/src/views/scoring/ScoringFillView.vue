<template>
  <div class="page stack score-page" :class="{ 'score-page-editable': form && !form.readOnly && !loading }" :style="{ '--score-keyboard-height': keyboardHeight + 'px' }">
    <WorkspaceHero
      :page-name="scoreCopy.copy_0c1a3a9fd9 + ' · ' + scoreCopy.copy_1f4d77229c"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section v-if="loading" class="card">
      <div class="empty-state">{{ copy.common.loading }}</div>
    </section>

    <div v-else-if="form" class="score-workspace stack">
      <section class="card score-info-grid">
        <div class="glass-panel score-info-full stack-tight">
          <span class="muted">{{ scoreCopy.copy_35fabd21a9 }}</span>
          <span class="value break-all">{{ activity.name || scoreCopy.copy_400aa44fd7 }}</span>
        </div>
        <div v-for="(person, index) in [form.scorer || {}, target]" :key="index" class="glass-panel stack-tight">
          <span class="muted">{{ index ? scoreCopy.copy_12cd162fda : scoreCopy.copy_b9b9929aee }}</span>
          <h2 class="score-person-name break-all">{{ person.name }}</h2>
          <span v-if="person.historicalAssignmentUnavailable" class="chip chip-orange">{{ scoreCopy.historicalAssignmentUnavailable }}</span>
          <span v-else-if="person.needsAssignmentDisambiguation" class="chip chip-blue break-all">{{ person.assignmentLabel }}</span>
          <span v-if="person.department" class="muted break-all">{{ person.department }}</span>
          <span v-if="person.identity" class="muted break-all">{{ person.identity }}</span>
          <span v-if="person.workGroup" class="muted break-all">{{ person.workGroup }}</span>
        </div>
      </section>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <p v-if="form.readOnly" class="notice-line">
        {{ copy.scoring.readOnlyNotice }}
        <span v-if="form.readOnlyReason"> {{ copy.scoring.readOnlyReason }}</span>
      </p>

      <section class="card stack">
        <div class="info-head">
          <span class="section-title">{{ scoreCopy.copy_ad5ba99be4 }}</span>
          <span v-if="form.readOnly" class="chip chip-orange">{{ scoreCopy.historicalReadOnlyShort }}</span>
        </div>
        <p v-if="form.readOnly && !questions.length" class="empty-state">{{ scoreCopy.historicalRecordEmpty }}</p>

        <div v-for="group in questionGroups" :key="group.templateId" class="stack">
          <div class="panel-head">
            <span class="field-label break-all">{{ group.templateName }}</span>
          </div>
          <div class="list">
            <div v-for="question in group.questions" :key="question.id" :ref="element => questionElements[question.id] = element" class="list-row score-question" :class="{ 'score-question-current': !form.readOnly && !keyboardCollapsed && currentQuestion?.id === question.id }" @click="focusQuestion(question)">
              <div class="list-row-main stack-tight">
                <span class="list-row-title break-all">
                  {{ questions.indexOf(question) + 1 }}. {{ question.question }}
                </span>
                <span class="soft">
                  {{ question.scoreLabel }} · {{ scoreCopy.copy_c3ec61e536 }}{{ question.minValue }} - {{ question.maxValue }} · {{ scoreCopy.copy_0e686e89bb }}{{ question.startValue }} · {{ scoreCopy.copy_8e8047cbd6 }}{{ question.stepValue }}
                </span>
              </div>
              <div class="score-value-row">
                <input
                  v-if="!form.readOnly"
                  class="field-input score-input"
                  type="text"
                  inputmode="none"
                  :aria-label="question.question"
                  :min="question.minValue"
                  :max="question.maxValue"
                  :step="question.stepValue"
                  :disabled="form.readOnly || submitting"
                  :value="answers[question.id]"
                  :placeholder="scoreCopy.copy_c30bcbbda9"
                  @focus="focusQuestion(question, false)"
                  @keydown="physicalKey"
                  @input="onAnswerInput(question, $event)"
                />
                <span v-else class="value">{{ answers[question.id] === '' ? scoreCopy.historicalScoreUnavailable : answers[question.id] + ' ' + scoreCopy.copy_717083eab1 }}</span>
                <span v-if="!form.readOnly && currentQuestion?.id === question.id" class="chip chip-blue">{{ keyboardCollapsed ? scoreCopy.copy_fa906e8178 : scoreCopy.copy_ea2892fd15 }}</span>
              </div>
            </div>
          </div>
          <div class="panel-head"><span class="muted">{{ scoreCopy.copy_3e5a801039 }}</span><strong>{{ sumScores(group.questions) }} / {{ sumMax(group.questions) }} {{ scoreCopy.copy_717083eab1 }}</strong></div>
        </div>
      </section>

      <section v-if="questions.length" class="card stack">
        <span class="section-title">{{ scoreCopy.copy_b3cbc0c509 }}</span>
        <div v-if="questionGroups.length > 1" class="stack-tight">
          <div v-for="group in questionGroups" :key="group.templateId" class="panel-head"><span class="break-all">{{ group.templateName }}</span><strong>{{ sumScores(group.questions) }} / {{ sumMax(group.questions) }} {{ scoreCopy.copy_717083eab1 }}</strong></div>
        </div>
        <div class="panel-head"><span>{{ scoreCopy.copy_75113404bc }}</span><strong>{{ totalScore }} / {{ sumMax(questions) }} {{ scoreCopy.copy_717083eab1 }}</strong></div>
      </section>

      <button v-if="!form.readOnly && questions.length" type="button" class="btn btn-primary" :disabled="submitting" @click="submit">
        {{ submitting ? copy.scoring.submitting : scoreCopy.copy_4d39b37cc5 }}
      </button>
    </div>

    <section v-else class="card stack">
      <div class="empty-state">{{ loadNotice || copy.scoring.loadFailed }}</div>
      <button type="button" class="btn btn-primary" @click="load">{{ scoreCopy.retryLoad }}</button>
      <button type="button" class="btn btn-secondary" @click="goBack">
        {{ copy.scoring.actionBackToTasks }}
      </button>
    </section>
    <ScoreKeyboard v-if="form && !form.readOnly && !loading && currentQuestion" :question="currentQuestion" :value="String(answers[currentQuestion.id] ?? '')" :index="currentIndex" :count="questions.length" :collapsed="keyboardCollapsed" :disabled="submitting" @height="resizeKeyboard" @collapse="keyboardCollapsed = true" @expand="focusQuestion(currentQuestion)" @navigate="navigateQuestion" @input="inputKey" @quick="chooseQuick" @submit="submit" @keydown="physicalKey" />
    <footer class="page-footer"><div class="footer-name">{{ copy.common.appName }}</div><div class="footer-org">{{ copy.common.organizationName }}</div></footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import ScoreKeyboard from '@/components/ScoreKeyboard.vue';
import { scoreKey } from '@/runtime/scoringInput.js';
import copy from '@/locales/zh-CN/index.js';
import scoreCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/score/score.js';
import { callApi, errorText } from '@/runtime/api.js';
import { formatTemplate } from '@/runtime/audit.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const route = useRoute();
const router = useRouter();

const form = ref(null);
const loading = ref(true);
const submitting = ref(false);
const loadNotice = ref('');
const answers = ref({});
const baseline = ref({});
const keyboardHeight = ref(0);
const keyboardCollapsed = ref(false);
const currentIndex = ref(0);
const questionElements = {};
const questions = computed(() => form.value?.templateBundle?.questions || []);
const currentQuestion = computed(() => questions.value[currentIndex.value]);
function comparableScore(value) {
  const text = String(value ?? '').trim();
  return text && Number.isFinite(Number(text)) ? Number(text) : text;
}
const dirty = computed(() => !!form.value && !form.value.readOnly
  && Object.keys(answers.value).some(key => comparableScore(answers.value[key]) !== comparableScore(baseline.value[key])));
let generation = 0;
let disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId, route.params.id].join('|');

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

function sumScores(items) {
  return Math.round(items.reduce((sum, question) => sum + (Number.isFinite(Number(answers.value[question.id])) ? Number(answers.value[question.id]) : 0), 0) * 1000) / 1000;
}
function sumMax(items) { return Math.round(items.reduce((sum, question) => sum + (Number(question.maxValue) || 0), 0) * 1000) / 1000; }
const totalScore = computed(() => sumScores(questions.value));

async function focusQuestion(question, scroll = true) {
  if (form.value?.readOnly || submitting.value) return;
  const index = questions.value.indexOf(question);
  if (index < 0) return;
  currentIndex.value = index;
  keyboardCollapsed.value = false;
  if (scroll) {
    await nextTick();
    if (!disposed) {
      const element = questionElements[question.id];
      element?.querySelector('input')?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'nearest' });
    }
  }
}
async function resizeKeyboard(height) {
  keyboardHeight.value = height;
  await nextTick();
  const element = questionElements[currentQuestion.value?.id];
  if (!disposed && !keyboardCollapsed.value && element?.contains(document.activeElement)) element.scrollIntoView({ block: 'nearest' });
}
function navigateQuestion(delta) {
  const question = questions.value[currentIndex.value + delta];
  if (question) focusQuestion(question);
}
function inputKey(key) {
  if (submitting.value || form.value?.readOnly || !currentQuestion.value) return;
  const id = currentQuestion.value.id;
  answers.value = { ...answers.value, [id]: scoreKey(answers.value[id], key) };
}
function chooseQuick(value) {
  if (submitting.value || form.value?.readOnly || !currentQuestion.value) return;
  answers.value = { ...answers.value, [currentQuestion.value.id]: value };
  navigateQuestion(1);
}
function physicalKey(event) {
  if (keyboardCollapsed.value || submitting.value || form.value?.readOnly || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter') {
    event.preventDefault();
    if (event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey)) navigateQuestion(-1);
    else if (event.key === 'Enter' && currentIndex.value === questions.value.length - 1) submit();
    else navigateQuestion(1);
  } else if (event.target.tagName !== 'INPUT' && (/^[\d.-]$/.test(event.key) || event.key === 'Backspace')) {
    event.preventDefault(); inputKey(event.key === 'Backspace' ? 'backspace' : event.key);
  }
}

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
  const request = ++generation;
  const expected = scope();
  const current = () => !disposed && request === generation && expected === scope();
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('getScoreFormData', { targetId: route.params.id });
    if (!current()) return;
    if (result.status !== 'success') {
      form.value = null;
      loadNotice.value = result.message || copy.scoring.loadFailed;
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
    baseline.value = { ...seeded };
    currentIndex.value = Math.max(0, questions.findIndex(question => seeded[question.id] === ''));
    keyboardCollapsed.value = false;
  } catch (error) {
    if (!current()) return;
    form.value = null;
    loadNotice.value = errorText(error, copy.scoring.loadFailed);
  } finally {
    if (current()) {
      loading.value = false;
      await nextTick();
      if (current() && currentQuestion.value) focusQuestion(currentQuestion.value);
    }
  }
}

function validate() {
  const questions = (form.value && form.value.templateBundle && form.value.templateBundle.questions) || [];
  const list = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const raw = answers.value[question.id];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return { ok: false, question, message: copy.scoring.questionRequired };
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) return { ok: false, question, message: copy.scoring.questionRequired };
    const min = Math.max(Number(question.minValue), Number(question.startValue));
    const max = Number(question.maxValue);
    if (Number.isFinite(min) && Number.isFinite(max) && (value < min || value > max)) {
      return {
        ok: false, question,
        message: formatTemplate(copy.scoring.questionRange, [index + 1, min, max])
      };
    }
    const step = Number(question.stepValue);
    if (Number.isFinite(step) && step > 0) {
      const start = Number(question.startValue) || 0;
      const diff = (value - start) / step;
      if (Math.abs(diff - Math.round(diff)) > 1e-8) {
        return {
          ok: false, question,
          message: formatTemplate(copy.scoring.questionStep, [index + 1, step])
        };
      }
    }
    list.push({ questionIndex: index + 1, score: value });
  }
  return { ok: true, answers: list };
}

async function submit() {
  if (submitting.value || loading.value || !form.value || form.value.readOnly) return;
  const expected = scope();
  const current = () => !disposed && expected === scope();
  const validation = validate();
  if (!validation.ok) {
    loadNotice.value = validation.message;
    focusQuestion(validation.question);
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
    if (!current()) return;
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.scoring.submitFailed;
      if (result.status === 'score_revision_conflict') {
        loadNotice.value = copy.scoring.revisionConflict;
        await load();
      }
      return;
    }
    showToast(copy.scoring.submitDone);
    baseline.value = { ...answers.value };
    router.replace({ name: 'scoringTasks' });
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, copy.scoring.submitFailed);
  } finally {
    if (current()) submitting.value = false;
  }
}

function warnBeforeUnload(event) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onBeforeRouteLeave(() => {
  if (session.status !== 'authenticated') return true;
  if (submitting.value) return false;
  if (!dirty.value) return true;
  return confirmAction({ title: copy.common.notice, body: scoreCopy.unsavedScoreLeaveWarning,
    confirmText: copy.common.confirm, cancelText: copy.common.cancel });
});
window.addEventListener('beforeunload', warnBeforeUnload);
watch(scope, () => { form.value = null; answers.value = {}; baseline.value = {}; submitting.value = false; load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; window.removeEventListener('beforeunload', warnBeforeUnload); });
</script>

<style scoped>
.score-page { max-width: var(--ui-score-page-width); animation: none; }
.score-page-editable { padding-bottom: calc(var(--ui-page-padding-bottom) + var(--score-keyboard-height)); }
.score-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-field-gap); text-align: center; }
.score-info-full { grid-column: 1 / -1; }
.score-info-grid .glass-panel { min-width: 0; }
.score-person-name { margin: 0; font-size: var(--ui-type-value); line-height: var(--ui-leading-heading); }
.score-question { flex-direction: column; align-items: stretch; cursor: pointer; scroll-margin-top: calc(var(--ui-navbar-height) + var(--ui-card-gap)); scroll-margin-bottom: calc(var(--score-keyboard-height) + var(--ui-card-gap)); }
.score-question-current { border-color: var(--ui-blue-500); }
.score-value-row { display: flex; align-items: center; gap: var(--ui-inline-gap); }
.score-input { flex: 1; min-width: 0; width: 0; text-align: center; appearance: textfield; }
.score-input::-webkit-inner-spin-button, .score-input::-webkit-outer-spin-button { appearance: none; margin: 0; }
@media (min-width: 900px) {
  .score-page-editable { display: grid; grid-template-columns: minmax(0, 1fr) var(--ui-score-keyboard-width); align-items: start; gap: var(--ui-card-gap); padding-bottom: var(--ui-page-padding-bottom); }
  .score-page-editable > :first-child { grid-column: 1 / -1; }
  .score-workspace, .page-footer { grid-column: 1; min-width: 0; }
  .score-question { scroll-margin-bottom: var(--ui-card-gap); }
}
</style>
