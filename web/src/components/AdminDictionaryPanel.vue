<template>
  <div class="stack">
    <section class="card stack">
      <span class="section-title">{{ config.title }}</span>
      <div v-if="loadNotice" class="stack-tight" role="alert">
        <span class="notice-line">{{ loadNotice }}</span>
        <button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button>
      </div>
    </section>
    <form ref="editor" class="card stack" @submit.prevent="save">
      <span class="section-title">{{ form.id ? config.edit : config.create }}</span>
      <label class="field">
        <span class="field-label">{{ config.name }}</span>
        <input v-model="form.name" class="field-input" :placeholder="config.namePlaceholder" :disabled="blocked" />
      </label>
      <label v-if="kind === 'workGroups'" class="field">
        <span class="field-label">{{ ui.copy_7ee1272d5b }}</span>
        <select v-model="form.departmentId" class="field-input" :disabled="blocked">
          <option value="" disabled>{{ ui.copy_eada426deb }}</option>
          <option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">{{ config.description }}</span>
        <textarea v-model="form.description" class="field-input" :placeholder="config.descriptionPlaceholder" :disabled="blocked" />
      </label>
      <p v-if="actionNotice" class="notice-line" role="alert">{{ actionNotice }}</p>
      <div class="button-row">
        <button type="submit" class="btn btn-primary" :disabled="blocked">{{ busy ? copy.common.loading : config.save }}</button>
        <button type="button" class="btn btn-secondary" :disabled="blocked" @click="reset">{{ config.create }}</button>
      </div>
    </form>
    <section class="card stack">
      <span class="section-title">{{ config.list }}</span>
      <div v-if="loading && !rows.length" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!loadNotice && !rows.length" class="empty-state">{{ config.empty }}</div>
      <div v-else class="list">
        <article v-for="row in rows" :key="row.id" class="list-row dictionary-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ row.name }}</span>
            <span v-if="kind === 'workGroups'" class="muted break-all">{{ ui.copy_405f619b06 }}{{ row.departmentName }}</span>
            <span v-if="row.description" class="muted break-all">{{ row.description }}</span>
          </div>
          <div class="card-actions">
            <button type="button" class="btn-quiet" :disabled="blocked" @click="edit(row)">{{ ui.copy_e040ae3016 }}</button>
            <button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="remove(row)">{{ ui.copy_acc985cabc }}</button>
          </div>
        </article>
      </div>
    </section>
    <GlassDialog v-if="usage" :title="personnel.dictionaryUsageDialogTitle" @close="usage = null">
      <div class="stack">
        <p class="notice-line">{{ personnel.dictionaryUsageDialogDescription }}</p>
        <span class="break-all">{{ personnel.dictionaryUsageTargetLabel }} · {{ usage.name }}</span>
        <div v-for="(item, index) in usage.items" :key="index" class="panel-head">
          <span>{{ personnel.dictionaryUsageCategories[item.category] || personnel.dictionaryUsageCategories.unknown }}</span>
          <span>{{ personnel.dictionaryUsageCount(item.count) }}</span>
        </div>
      </div>
      <template #footer><button type="button" class="btn btn-primary" @click="usage = null">{{ personnel.dictionaryUsageClose }}</button></template>
    </GlassDialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import dept from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/departmentBehavior.js';
import identity from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/identityBehavior.js';
import group from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/workGroupBehavior.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';

const props = defineProps({ kind: { type: String, required: true }, disabled: Boolean });
const emit = defineEmits(['busy']);
const configs = {
  departments: {
    title: ui.copy_c15260b37c, edit: ui.copy_c97f4e1c21, create: ui.copy_81888e3e1d,
    name: ui.copy_ff6a3c2862, namePlaceholder: ui.copy_46b1f83a99,
    description: ui.copy_c0a872bff0, descriptionPlaceholder: ui.copy_91459a2ebc,
    save: ui.copy_9d34006a03, list: ui.copy_ca89208b18, empty: ui.copy_5dd52b59e7,
    listApi: 'listDepartments', saveApi: 'saveDepartment', deleteApi: 'deleteDepartment',
    missingName: dept.copy_2531b7527d, saved: dept.copy_89017791b3,
    deleteTitle: dept.copy_21cc5de126, deleteBody: dept.copy_8fe7c4c171, deleted: dept.copy_e7dcd6f241
  },
  workGroups: {
    title: ui.copy_303b7a8611, edit: ui.copy_a530f9158a, create: ui.copy_8860e9ad76,
    name: ui.copy_7a4ac1ad99, namePlaceholder: ui.copy_9cf9a2961b,
    description: ui.copy_aa523247a6, descriptionPlaceholder: ui.copy_88ae76e6fe,
    save: ui.copy_397a0808d4, list: ui.copy_26fc004670, empty: ui.copy_52daff6e5d,
    listApi: 'listWorkGroups', saveApi: 'saveWorkGroup', deleteApi: 'deleteWorkGroup',
    missingName: group.copy_ce1f5597c6, saved: group.copy_4fdb08add2,
    deleteTitle: group.copy_2bc5d4cf83, deleteBody: group.copy_e9870f418c, deleted: group.copy_1d828c61a6
  },
  identities: {
    title: ui.copy_2079e402f3, edit: ui.copy_018d741992, create: ui.copy_7e6fe80a00,
    name: ui.copy_827d50f428, namePlaceholder: ui.copy_5056ad7eb7,
    description: ui.copy_07d8551536, descriptionPlaceholder: ui.copy_14671f2231,
    save: ui.copy_637d8a9907, list: ui.copy_88898b98bf, empty: ui.copy_177c107dbc,
    listApi: 'listIdentities', saveApi: 'saveIdentity', deleteApi: 'deleteIdentity',
    missingName: identity.copy_f5b2fb24f1, saved: identity.copy_437b04668d,
    deleteTitle: identity.copy_9167d1395d, deleteBody: identity.copy_30267845ce, deleted: identity.copy_e000ed06dd
  }
};
const config = computed(() => configs[props.kind]);
const editor = ref(null);
const rows = ref([]);
const departments = ref([]);
const loading = ref(false);
const busy = ref(false);
const loadNotice = ref('');
const actionNotice = ref('');
const usage = ref(null);
const form = reactive({ id: '', name: '', description: '', departmentId: '' });
const blocked = computed(() => props.disabled || loading.value || busy.value || !!loadNotice.value);
let generation = 0;
let disposed = false;
let resetAfterRead = false;
const scope = () => [session.context?.contextId, session.context?.organizationId, props.kind].join('|');
function reset() { Object.assign(form, { id: '', name: '', description: '', departmentId: '' }); actionNotice.value = ''; }
async function edit(row) {
  if (blocked.value) return;
  Object.assign(form, { id: row.id, name: row.name, description: row.description || '', departmentId: row.departmentId || '' });
  actionNotice.value = '';
  await nextTick();
  editor.value?.scrollIntoView({ block: 'start' });
}
async function load() {
  const request = ++generation;
  const expected = scope();
  const current = () => !disposed && request === generation && expected === scope();
  loading.value = true;
  try {
    const results = await Promise.all([
      callApi(config.value.listApi, {}).then(requireSuccess),
      props.kind === 'workGroups' ? callApi('listDepartments', {}).then(requireSuccess) : Promise.resolve(null)
    ]);
    if (!current()) return false;
    if (!Array.isArray(results[0][props.kind]) || (results[1] && !Array.isArray(results[1].departments))) throw new Error();
    rows.value = results[0][props.kind];
    if (results[1]) departments.value = results[1].departments;
    loadNotice.value = '';
    if (resetAfterRead) { resetAfterRead = false; reset(); }
    return true;
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, personnel.dictionaryLoadFailed[props.kind].description);
    return false;
  } finally { if (current()) loading.value = false; }
}
async function save() {
  if (blocked.value) return;
  if (!form.name.trim()) { actionNotice.value = config.value.missingName; return; }
  if (props.kind === 'workGroups' && !departments.value.some(row => row.id === form.departmentId)) {
    actionNotice.value = ui.copy_eada426deb; return;
  }
  const expected = scope();
  const current = () => !disposed && expected === scope();
  const payload = { id: form.id, name: form.name.trim(), description: form.description };
  if (props.kind === 'workGroups') {
    payload.departmentId = form.departmentId;
    payload.departmentCode = departments.value.find(row => row.id === form.departmentId)?.code || '';
  }
  busy.value = true;
  actionNotice.value = '';
  try {
    requireSuccess(await callApi(config.value.saveApi, payload));
    if (!current()) return;
    resetAfterRead = true;
    const refreshed = await load();
    if (!current()) return;
    if (refreshed) reset();
    showToast(config.value.saved);
  } catch (error) { if (current()) actionNotice.value = errorText(error, dept.copy_215e3c57da); }
  finally { if (current()) busy.value = false; }
}
async function remove(row) {
  if (blocked.value) return;
  const expected = scope();
  const current = () => !disposed && expected === scope();
  const target = { id: row.id, name: row.name };
  busy.value = true;
  actionNotice.value = '';
  try {
    const confirmed = await confirmAction({ title: config.value.deleteTitle,
      body: config.value.deleteBody + '\n' + target.name, confirmText: dept.copy_7f31eec657,
      cancelText: dept.copy_4b213fd88a, danger: true });
    if (!confirmed || !current() || props.disabled) return;
    const result = await callApi(config.value.deleteApi, { id: target.id });
    if (!current()) return;
    if (result.status === 'in_use') {
      usage.value = { name: target.name, items: (Array.isArray(result.usages) ? result.usages : [])
        .map(item => ({ category: item.category, count: Math.max(0, Number(item.count) || 0) })).filter(item => item.count > 0) };
      return;
    }
    requireSuccess(result);
    await load();
    if (!current()) return;
    if (form.id === target.id) reset();
    showToast(config.value.deleted);
  } catch (error) { if (current()) actionNotice.value = errorText(error, dept.copy_076bb5d383); }
  finally { if (current()) busy.value = false; }
}
watch(busy, value => emit('busy', value), { flush: 'sync' });
watch(scope, () => { generation++; resetAfterRead = false; reset(); rows.value = []; departments.value = []; usage.value = null; busy.value = false; loadNotice.value = ''; load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); });
</script>

<style scoped>
.dictionary-row { flex-direction: column; align-items: stretch; }
.button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
form { scroll-margin-top: var(--ui-navbar-height); }
</style>
