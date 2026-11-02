<template>
  <section class="card stack">
    <div class="panel-head"><span class="section-title">{{ ui.copy_72d3c6f7c2 }}</span><div class="row row-wrap">
      <button v-if="canCreate" class="btn btn-primary" :disabled="busy || loading" @click="edit()">{{ ui.copy_a6b6f71690 }}</button>
      <button v-if="canExport" class="btn btn-secondary" :disabled="busy || loading" @click="exportRows">{{ ui.copy_49a7fb10d7 }}</button>
    </div></div>
    <AppLoading v-if="loading" :text="copy.common.loading" />
    <div v-if="notice" class="stack-tight"><p role="alert" class="notice-line">{{ notice }}</p><button class="btn-quiet" :disabled="busy || loading" @click="load">{{ copy.common.retry }}</button></div>
    <article v-for="row in rows" :key="row.id" class="list-row">
      <div class="list-row-main stack-tight"><strong>{{ row.name }}</strong><span class="chip">{{ row.adminLevelLabel }}</span><span class="muted">{{ row.authenticationStatusLabel }}</span></div>
      <div class="row row-wrap"><button v-if="row.canEdit" class="btn-quiet" :disabled="busy || loading" @click="edit(row)">{{ ui.copy_e040ae3016 }}</button><button v-if="row.canDelete" class="btn-quiet btn-quiet-danger" :disabled="busy || loading" @click="remove(row)">{{ ui.copy_acc985cabc }}</button></div>
    </article>
  </section>
  <GlassDialog v-if="form" :title="form.id ? ui.copy_13fbac1d6c : ui.copy_632d07e81f" :busy="busy || savedAwaitingRead" @close="form = null">
    <form id="admin-account-form" class="stack" @submit.prevent="save">
      <div v-if="!form.id && enforced" class="field"><span class="field-label">{{ ui.copy_e7c1936709 }}</span><button type="button" class="field-input" :disabled="busy || candidatesLoading" @click="picker = true">{{ form.name || ui.copy_809f3d3dd3 }}</button><AppLoading v-if="candidatesLoading" :text="copy.common.loading" /></div>
      <label v-else class="field"><span class="field-label">{{ ui.copy_7a4d5ab30f }}</span><input v-model="form.name" class="field-input" required :disabled="busy" /></label>
      <label v-if="!enforced" class="field"><span class="field-label">{{ ui.copy_80fba348b7 }}</span><input v-model="form.studentId" class="field-input" required :disabled="busy" /></label>
      <label v-if="!form.id" class="field"><span class="field-label">{{ ui.copy_b96baa9918 }}</span><select v-model="form.adminLevel" class="field-input" :disabled="busy" required><option v-for="level in levels" :key="level.value" :value="level.value">{{ level.label }}</option></select></label>
      <p v-if="actionNotice" role="alert" class="notice-line">{{ actionNotice }}</p>
      <div v-if="notice" class="stack-tight"><p role="alert" class="notice-line">{{ notice }}</p><button class="btn-quiet" type="button" :disabled="busy || loading" @click="load">{{ copy.common.retry }}</button></div>
    </form>
    <template #footer><button class="btn btn-secondary" :disabled="busy || savedAwaitingRead" @click="form = null">{{ copy.common.cancel }}</button><button form="admin-account-form" type="submit" class="btn btn-primary" :disabled="busy || savedAwaitingRead || candidatesLoading || (!form.id && enforced && !form.hrId)">{{ form.id ? ui.copy_cc7425f62e : ui.copy_cc6356670c }}</button></template>
  </GlassDialog>
  <PersonnelPicker v-if="picker" :title="ui.copy_809f3d3dd3" mode="person" :multiple="false" :options="candidates" :value="candidates.filter(item => item.hrId === form?.hrId)" @cancel="picker = false" @confirm="selectPerson" />
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import PersonnelPicker from './PersonnelPicker.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import { useAdminAuthorizationAccess, useAdminCapability } from '@/runtime/adminCapabilities.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { outputFile } from '@/runtime/fileIO.js';
import { session } from '@/runtime/session.js';
const emit = defineEmits(['busy']);
const access = useAdminAuthorizationAccess(), canExport = useAdminCapability('system.admin_accounts.read', 'system.adminAccounts.export');
const enforced = computed(() => access.value?.mode === 'enforced');
const rows = ref([]), levels = ref([]), canCreate = ref(false), loading = ref(false), busy = ref(false), notice = ref(''), actionNotice = ref(''), form = ref(null);
const candidates = ref([]), candidatesLoading = ref(false), picker = ref(false);
const savedAwaitingRead = ref(false);
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
const originalScope = scope(); let disposed = false, generation = 0;
const current = () => !disposed && !document.hidden && originalScope === scope();
async function load() {
  const request = ++generation; loading.value = true; notice.value = '';
  try { const result = requireSuccess(await callApi('listAdmins', {})); if (!current() || request !== generation) return;
    rows.value = result.list || []; levels.value = result.creatableLevels || []; canCreate.value = enforced.value ? result.canCreate === true : result.canWrite === true;
    if (savedAwaitingRead.value) { form.value = null; savedAwaitingRead.value = false; }
  } catch (error) { if (current() && request === generation) notice.value = errorText(error, copy.errors.requestFailed); }
  finally { if (current() && request === generation) loading.value = false; }
}
async function edit(row) {
  if (busy.value || loading.value || (row ? !row.canEdit : !canCreate.value)) return;
  form.value = row ? { id: row.id, name: row.name || '', studentId: row.studentId || '', adminLevel: row.adminLevel }
    : { id: '', hrId: '', name: '', studentId: '', adminLevel: levels.value[0]?.value || '' };
  actionNotice.value = '';
  if (!row && enforced.value) {
    const draft = form.value;
    candidatesLoading.value = true; candidates.value = [];
    try { const result = requireSuccess(await callApi('getAdminAccountCandidates', {})); if (current() && form.value === draft) candidates.value = (result.list || []).map(item => ({ ...item, id: item.hrId, personId: item.hrId })); }
    catch (error) { if (current() && form.value === draft) actionNotice.value = errorText(error, copy.errors.requestFailed); }
    finally { if (current() && form.value === draft) candidatesLoading.value = false; }
  }
}
function selectPerson(items) { if (!form.value || busy.value) return; Object.assign(form.value, { hrId: items[0]?.hrId || '', name: items[0]?.name || '' }); picker.value = false; }
async function save() {
  if (!form.value || busy.value || savedAwaitingRead.value || !(form.value.id ? rows.value.some(row => row.id === form.value.id && row.canEdit) : canCreate.value)) return;
  const value = { ...form.value }, payload = enforced.value ? value.id ? { id: value.id, name: value.name, adminLevel: value.adminLevel } : { hrId: value.hrId, adminLevel: value.adminLevel } : value;
  busy.value = true; actionNotice.value = '';
  try { requireSuccess(await callApi('saveAdmin', payload)); if (!current()) return; savedAwaitingRead.value = true; await load(); }
  catch (error) { if (current()) actionNotice.value = errorText(error, copy.errors.requestFailed); }
  finally { if (current()) busy.value = false; }
}
async function remove(row) {
  if (busy.value || loading.value || !row.canDelete) return;
  busy.value = true;
  try { if (!await confirmAction({ title: ui.copy_acc985cabc, body: row.name, danger: true, confirmText: copy.common.confirm, cancelText: copy.common.cancel }) || !current()) return;
    requireSuccess(await callApi('deleteAdmin', { id: row.id })); if (current()) await load();
  } catch (error) { if (current()) notice.value = errorText(error, copy.errors.requestFailed); }
  finally { if (current()) busy.value = false; }
}
async function exportRows() {
  if (busy.value || !canExport.value) return;
  busy.value = true;
  try { const result = requireSuccess(await callApi('exportAdmins', {})); if (current()) await outputFile({ blob: new Blob([result.csvContent], { type: 'text/csv;charset=utf-8' }), fileName: 'admins.csv' }); }
  catch (error) { if (current()) notice.value = errorText(error, copy.errors.requestFailed); }
  finally { if (current()) busy.value = false; }
}
watch(() => busy.value || Boolean(form.value), value => emit('busy', value), { flush: 'sync' });
load();
onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); });
</script>
