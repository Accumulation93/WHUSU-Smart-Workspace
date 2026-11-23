<template>
  <section class="card stack">
    <button type="button" class="btn-quiet usability-head" :aria-expanded="opened" :disabled="busy" @click="toggle">
      {{ copy.title }}
    </button>
    <template v-if="opened">
      <div v-if="loading"><AppLoading :text="common.loading" /></div>
      <p v-if="notice" class="notice-line" :role="reloadRequired ? 'alert' : 'status'">{{ notice }}</p>
      <div v-if="reloadRequired" class="applicability-actions">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="reload">{{ copy.reload }}</button>
        <button v-if="dirty && !savedAwaitingRead" type="button" class="btn btn-secondary" :disabled="busy" @click="discard">{{ copy.discard }}</button>
      </div>
      <template v-if="snapshot && snapshot.fields.length">
        <p class="muted">{{ copy.description }}</p>
        <p v-if="!canEdit" class="muted">{{ copy.readonly }}</p>
        <label class="field"><span class="field-label">{{ copy.field }}</span>
          <select class="field-input" :value="fieldId" :disabled="busy || reloadRequired" @change="selectField">
            <option v-for="field in snapshot.fields" :key="field.id" :value="field.id">{{ field.label }}</option>
          </select>
        </label>
        <p v-if="!rules.length && !reloadRequired" class="muted">{{ copy.unrestricted }}</p>
        <section v-for="(rule, index) in rules" :key="index" class="glass-panel stack">
          <div class="card-actions applicability-group-head">
            <button type="button" class="btn-quiet" :aria-expanded="activeGroup === index" @click="activeGroup = activeGroup === index ? -1 : index">{{ copy.group(index + 1) }}</button>
            <button v-if="canEdit" type="button" class="btn-quiet" :disabled="editingBlocked" @click="removeGroup(index)">{{ copy.removeGroup }}</button>
          </div>
          <AuthorizationDimensions v-if="activeGroup === index" v-model="rules[index]" :directory="snapshot" independent-nature :disabled="editingBlocked" />
        </section>
        <div v-if="canEdit" class="applicability-actions">
          <button type="button" class="btn btn-secondary" :disabled="editingBlocked || rules.length >= 32" @click="addGroup">{{ copy.addGroup }}</button>
          <button type="button" class="btn btn-primary" :disabled="editingBlocked || !dirty" @click="save">{{ copy.save }}</button>
        </div>
      </template>
      <p v-else-if="snapshot && !loading" class="muted">{{ copy.noFields }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import AuthorizationDimensions from './AuthorizationDimensions.vue';
import copy from '@/locales/zh-CN/shared/hrProfileApplicability.js';
import common from '@/locales/zh-CN/shared/common.js';
import feedback from '@/locales/zh-CN/shared/requestFeedback.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';

const props = defineProps({ snapshotId: String, canEdit: Boolean, parentBusy: Boolean });
const emit = defineEmits(['busy']);
const opened = ref(false);
const snapshot = ref(null);
const fieldId = ref('');
const rules = ref([]);
const activeGroup = ref(-1);
const loading = ref(false);
const saving = ref(false);
const reloadRequired = ref(false);
const savedAwaitingRead = ref(false);
const notice = ref('');
const busy = computed(() => loading.value || saving.value);
const editingBlocked = computed(() => !props.canEdit || props.parentBusy || busy.value || reloadRequired.value);
const currentField = computed(() => snapshot.value?.fields.find(field => field.id === fieldId.value));
const dirty = computed(() => Boolean(currentField.value && JSON.stringify(rules.value) !== JSON.stringify(currentField.value.rules)));
let requestVersion = 0;

function setField(field) {
  fieldId.value = field?.id || '';
  rules.value = (field?.rules || []).map(rule => Object.fromEntries(Object.entries(rule).map(([key, values]) => [key, [...values]])));
  activeGroup.value = rules.value.length === 1 ? 0 : -1;
}

async function load() {
  const request = ++requestVersion;
  loading.value = true;
  try {
    const result = await callApi('getHrProfileFieldApplicability', {});
    if (request !== requestVersion) return;
    if (result.status === 'missing_template') {
      snapshot.value = null;
      setField(null);
      notice.value = copy.noTemplate;
      reloadRequired.value = false;
      savedAwaitingRead.value = false;
      return;
    }
    requireSuccess(result);
    if (!result.snapshotId || (props.snapshotId && result.snapshotId !== props.snapshotId)
      || !Array.isArray(result.fields) || !result.version || !result.dimensions) throw new Error();
    snapshot.value = result;
    setField(result.fields.find(field => field.id === fieldId.value) || result.fields[0]);
    notice.value = savedAwaitingRead.value ? copy.saved : '';
    savedAwaitingRead.value = false;
    reloadRequired.value = false;
  } catch (error) {
    if (request !== requestVersion) return;
    reloadRequired.value = true;
    notice.value = savedAwaitingRead.value ? copy.savedReadFailed : errorText(error, copy.loadFailed);
  } finally {
    if (request === requestVersion) loading.value = false;
  }
}

async function canDiscard() {
  return !dirty.value || savedAwaitingRead.value || confirmAction({ title: copy.discardTitle, body: copy.discardBody,
    confirmText: copy.discard, cancelText: copy.cancel });
}
async function toggle() {
  if (busy.value || props.parentBusy) return;
  const request = requestVersion;
  if (opened.value && !await canDiscard()) return;
  if (request !== requestVersion) return;
  opened.value = !opened.value;
  if (opened.value) await load();
  else setField(currentField.value);
}
async function reload() {
  if (busy.value) return;
  const request = requestVersion;
  if (!await canDiscard() || request !== requestVersion) return;
  await load();
}
async function discard() {
  const request = requestVersion;
  if (busy.value || !await canDiscard() || request !== requestVersion) return;
  setField(currentField.value);
  await load();
}
async function selectField(event) {
  const next = snapshot.value?.fields.find(field => field.id === event.target.value);
  if (!next || next.id === fieldId.value) return;
  event.target.value = fieldId.value;
  const request = requestVersion;
  if (!await canDiscard() || request !== requestVersion) return;
  setField(next);
  notice.value = '';
}
function addGroup() {
  if (editingBlocked.value || rules.value.length >= 32) return;
  rules.value.push({});
  activeGroup.value = rules.value.length - 1;
}
function removeGroup(index) {
  if (editingBlocked.value) return;
  rules.value.splice(index, 1);
  activeGroup.value = -1;
}
async function save() {
  if (editingBlocked.value || !dirty.value) return;
  if (rules.value.some(rule => !Object.keys(rule).length)) {
    notice.value = copy.invalidGroup;
    return;
  }
  const request = requestVersion;
  saving.value = true;
  notice.value = '';
  try {
    const result = await callApi('saveHrProfileFieldApplicability', {
      snapshotId: snapshot.value.snapshotId, version: snapshot.value.version, fieldIds: [fieldId.value],
      rules: rules.value, operation: 'replace'
    });
    if (request !== requestVersion) return;
    if (result.status === 'authorization_conflict' || result.status === 'authorization_stale_reference') {
      reloadRequired.value = true;
      notice.value = feedback.conflict;
      return;
    }
    requireSuccess(result);
    savedAwaitingRead.value = true;
    await load();
  } catch (error) {
    if (request === requestVersion) {
      reloadRequired.value = true;
      notice.value = errorText(error, copy.saveFailed);
    }
  } finally {
    saving.value = false;
  }
}

watch(busy, value => emit('busy', value), { flush: 'sync' });
watch(() => [props.snapshotId, session.context?.contextId], () => {
  requestVersion++;
  opened.value = false;
  snapshot.value = null;
  setField(null);
  loading.value = false;
  saving.value = false;
  reloadRequired.value = false;
  savedAwaitingRead.value = false;
  notice.value = '';
});
onBeforeUnmount(() => { requestVersion++; emit('busy', false); });
</script>

<style scoped>
.usability-head { justify-self: start; }
.applicability-group-head { justify-content: space-between; }
.applicability-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.applicability-actions > button { min-width: 0; }
</style>
