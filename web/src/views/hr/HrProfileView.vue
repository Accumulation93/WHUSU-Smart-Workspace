<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="homeCopy.hr"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <form class="card stack" @submit.prevent="save">
      <div class="panel-head">
        <span class="section-title">{{ homeCopy.hr }}</span>
        <span v-if="profileData && !loadNotice" class="chip chip-sky">{{ profileData.template?.modeText || homeCopy.noTemplate }}</span>
      </div>
      <p v-if="profileData?.template?.description" class="muted">{{ profileData.template.description }}</p>
      <span v-if="profileData?.statusText && !loadNotice" class="chip chip-sky">{{ profileData.statusText }}</span>
      <p v-if="profileData?.auditStatus === 'pending' && !loadNotice" class="muted">{{ homeCopy.profilePending }}</p>
      <p v-if="profileData?.rejectionReason" class="notice-line">{{ homeCopy.rejectionReasonPrefix }}{{ profileData.rejectionReason }}</p>
      <div v-if="fields.length" class="profile-fields">
        <div v-for="field in fields" :key="field.key" class="list-row" :class="{ 'profile-field-wide': !['name', 'studentId'].includes(field.key) }">
          <div class="list-row-main stack-tight">
            <span class="soft">{{ field.label }}</span>
            <span class="list-row-title break-all">{{ field.value }}</span>
          </div>
        </div>
      </div>
      <p class="muted">{{ homeCopy.profileManagedByAdmin }}</p>
      <div v-if="loading" class="empty-state">{{ homeCopy.loadingProfile }}</div>
      <p v-if="loadNotice" class="notice-line" role="alert">{{ loadNotice }}</p>
      <button v-if="loadNotice" type="button" class="btn btn-secondary" @click="load">{{ homeCopy.reloadProfile }}</button>
      <div v-if="profileData" class="stack">
      <p v-if="!loading && !loadNotice && !profileData.template?.fields?.length" class="empty-state">{{ homeCopy.noExtraProfile }}</p>
      <div v-for="field in profileData.template?.fields || []" :key="field.id" class="field">
        <label class="field-label" :for="['date', 'datetime'].includes(field.type) ? undefined : 'profile-' + field.id">{{ field.label }} <span v-if="field.required">*</span></label>
        <HrDateField v-if="['date', 'datetime'].includes(field.type)" v-model="values[field.id]" :type="field.type" :label="field.label" :required="field.required" :disabled="readonly || saving || loading || !!loadNotice" />
        <select v-else-if="field.type === 'sequence'" :id="'profile-' + field.id" v-model="values[field.id]" class="field-input" :required="field.required" :disabled="readonly || saving || loading || !!loadNotice">
          <option value="">{{ homeCopy.select }}</option>
          <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input v-else :id="'profile-' + field.id" v-model="values[field.id]" class="field-input" :type="inputType(field)"
          :required="field.required" :disabled="readonly || saving || loading || !!loadNotice" :step="field.type === 'number' ? (field.allowDecimal ? 'any' : '1') : undefined"
          :min="field.type === 'number' ? field.minValue : undefined" :max="field.type === 'number' ? field.maxValue : undefined" />
        <span v-if="field.hint" class="muted">{{ field.hint }}</span>
      </div>
      <p v-if="saveNotice" class="notice-line" role="status">{{ saveNotice }}</p>
      <button v-if="!readonly && profileData.template?.fields?.length" class="btn btn-primary" type="submit" :disabled="saving || loading || !!loadNotice">
        {{ saving ? copy.common.loading : profileData.template.editMode === 'audit' ? homeCopy.submitReview : homeCopy.saveProfile }}
      </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import HrDateField from '@/components/HrDateField.vue';
import copy from '@/locales/zh-CN/index.js';
import homeLocale from '@/locales/zh-CN/shared/home.js';
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
  return { number: 'number', phone: 'tel', email: 'email' }[field.type] || 'text';
}
async function save() {
  if (saving.value || readonly.value || loading.value || loadNotice.value || !profileData.value) return;
  const request = generation;
  const context = session.context?.contextId;
  saving.value = true;
  saveNotice.value = '';
  try {
    const submitted = { ...values.value };
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
    if (request !== generation || contextId !== session.context?.contextId) return;
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.errors.requestFailed;
      return;
    }
    if (request !== generation || contextId !== session.context?.contextId) return;
    profileData.value = result;
    values.value = { ...result.values, ...(result.auditStatus === 'pending' ? result.pendingValues : {}) };
    const profile = result.profile || result.user || {};
    const context = session.context || {};
    fields.value = [
      { key: 'name', label: copy.hr.nameLabel, value: profile.name || displayName.value },
      { key: 'studentId', label: homeCopy.studentId, value: profile.studentId || '' },
      { key: 'department', label: homeCopy.belongingDepartment, value: profile.department || context.department || '' },
      { key: 'identity', label: copy.hr.identityLabel, value: profile.identity || profile.identityName || context.identityCategoryName || context.identityName || '' },
      { key: 'workGroup', label: homeCopy.workDivision, value: profile.workGroup || context.workGroup || '' }
    ].filter(field => !['workGroup', 'department'].includes(field.key) || field.value);
  } catch (error) {
    if (request === generation && contextId === session.context?.contextId) loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    if (request === generation) loading.value = false;
  }
}

watch(() => session.context?.contextId, () => { fields.value = []; profileData.value = null; values.value = {}; saveNotice.value = ''; load(); }, { immediate: true });
</script>
<style scoped>
.profile-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-field-gap); }
.profile-field-wide { grid-column: 1 / -1; }
</style>
