<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.hr.profileTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.hr.profileTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p class="muted">{{ homeCopy.profileManagedByAdmin }}</p>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else class="list">
        <div v-for="field in fields" :key="field.key" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="soft">{{ field.label }}</span>
            <span class="list-row-title break-all">{{ field.value || copy.common.empty }}</span>
          </div>
        </div>
      </div>
    </section>
    <form v-if="profileData" class="card stack" @submit.prevent="save">
      <p v-if="profileData.template?.description" class="muted">{{ profileData.template.description }}</p>
      <span v-if="profileData.statusText" class="chip chip-sky">{{ profileData.statusText }}</span>
      <p v-if="profileData.rejectionReason" class="notice-line">{{ homeCopy.rejectionReasonPrefix }}{{ profileData.rejectionReason }}</p>
      <p v-if="!profileData.template?.fields?.length" class="empty-state">{{ homeCopy.noTemplate }}</p>
      <label v-for="field in profileData.template?.fields || []" :key="field.id" class="field">
        <span class="field-label">{{ field.label }} <span v-if="field.required">*</span></span>
        <select v-if="field.type === 'sequence'" v-model="values[field.id]" class="field-input" :required="field.required" :disabled="readonly || saving || loading || !!loadNotice">
          <option value="">{{ homeCopy.select }}</option>
          <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input v-else v-model="values[field.id]" class="field-input" :type="inputType(field)"
          :required="field.required" :disabled="readonly || saving || loading || !!loadNotice" :step="field.type === 'number' ? (field.allowDecimal ? 'any' : '1') : undefined"
          :min="field.type === 'number' ? field.minValue : undefined" :max="field.type === 'number' ? field.maxValue : undefined" />
        <span v-if="field.hint" class="muted">{{ field.hint }}</span>
      </label>
      <p v-if="saveNotice" class="notice-line" role="status">{{ saveNotice }}</p>
      <button v-if="!readonly && profileData.template?.fields?.length" class="btn btn-primary" type="submit" :disabled="saving || loading || !!loadNotice">
        {{ saving ? copy.common.loading : profileData.template.editMode === 'audit' ? homeCopy.submitReview : homeCopy.saveProfile }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import homeLocale from '@/locales/zh-CN/shared/home.js';
import { formatListTime, getSystemTimezoneConfig } from '@/runtime/dateTime.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const homeCopy = homeLocale.text;
const loading = ref(true);
const loadNotice = ref('');
const fields = ref([]);
const profileData = ref(null);
const values = ref({});
const saving = ref(false);
const saveNotice = ref('');
const readonly = computed(() => profileData.value?.template?.editMode === 'readonly');
let generation = 0;
onBeforeUnmount(() => { generation++; });
function inputType(field) {
  return { date: 'date', datetime: 'datetime-local', number: 'number', phone: 'tel', email: 'email' }[field.type] || 'text';
}
async function save() {
  if (saving.value || readonly.value || loading.value || loadNotice.value || !profileData.value) return;
  const request = generation;
  const context = session.context?.contextId;
  saving.value = true;
  saveNotice.value = '';
  try {
    const submitted = { ...values.value };
    for (const field of profileData.value.template.fields) {
      if (field.type === 'datetime' && submitted[field.id]) {
        const utc = Date.parse(submitted[field.id] + 'Z') - getSystemTimezoneConfig().offset * 3600000;
        submitted[field.id] = new Date(utc).toISOString();
      }
    }
    const result = requireSuccess(await callApi('submitUserHrProfile', { values: submitted }));
    if (request !== generation || context !== session.context?.contextId) return;
    await load();
    if (!loadNotice.value && context === session.context?.contextId) saveNotice.value = result.message || homeCopy.saved;
  } catch (error) {
    if (context === session.context?.contextId) saveNotice.value = errorText(error, homeCopy.saveFailed);
  } finally { saving.value = false; }
}

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

async function load() {
  const request = ++generation;
  const contextId = session.context?.contextId;
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('getUserHrProfile', {});
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.errors.requestFailed;
      return;
    }
    if (request !== generation || contextId !== session.context?.contextId) return;
    profileData.value = result;
    values.value = { ...result.values, ...(result.auditStatus === 'pending' ? result.pendingValues : {}) };
    for (const field of result.template?.fields || []) {
      if (field.type === 'datetime' && values.value[field.id]) values.value[field.id] = formatListTime(values.value[field.id]).replace(' ', 'T');
    }
    const profile = result.profile || result.user || {};
    const context = session.context || {};
    fields.value = [
      { key: 'name', label: copy.hr.nameLabel, value: profile.name || displayName.value },
      { key: 'department', label: copy.hr.departmentLabel, value: profile.department || context.department || '' },
      { key: 'identity', label: copy.hr.identityLabel, value: profile.identity || profile.identityName || context.identityCategoryName || context.identityName || '' },
      { key: 'workGroup', label: copy.hr.workGroupLabel, value: profile.workGroup || context.workGroup || '' },
      { key: 'assignment', label: copy.hr.assignmentLabel, value: profile.assignmentLabel || context.assignmentLabel || '' }
    ].filter(field => field.key !== 'workGroup' || field.value);
  } catch (error) {
    loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
