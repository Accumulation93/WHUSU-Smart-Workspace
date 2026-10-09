<template>
  <div class="page stack">
    <WorkspaceHero tone="admin" :page-name="ui.copy_02719d6557" :person-name="displayName" :identity-name="roleLine" :organization-name="orgName" @switch="goWorkRole" />
    <section v-if="permissionLoading || permissionNotice || !allowed" class="card stack">
      <p v-if="permissionLoading" class="muted">{{ copy.common.loading }}</p>
      <template v-else-if="permissionNotice"><p role="alert">{{ permissionNotice }}</p><button type="button" class="btn btn-secondary" @click="loadPermissions">{{ copy.common.retry }}</button></template>
      <p v-else class="muted">{{ ui.copy_0de5656de5 }}</p>
    </section>
    <section v-if="allowed" class="card stack">
      <div class="panel-head">
        <div class="stack-tight"><span class="section-title">{{ ui.copy_efffdc0050 }}</span><p class="muted">{{ ui.copy_257b230e01 }}</p></div>
        <button type="button" class="btn btn-primary venue-add" :disabled="blocked" @click="edit()">{{ ui.copy_4fd7b5de41 }}</button>
      </div>
      <p v-if="loadNotice" role="alert" class="notice-line">{{ loadNotice }}</p>
      <button v-if="loadNotice" type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button>
      <p v-if="actionNotice && !editing" role="alert" class="notice-line">{{ actionNotice }}</p>
      <div v-if="loading && !venues.length" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!loading && !loadNotice && !venues.length" class="empty-state">{{ ui.copy_5e9f82c1cf }}</div>
      <div class="list">
        <div v-for="venue in venues" :key="venue.id" class="list-row venue-resource">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ venue.name }}</span>
            <span v-if="venue.location" class="muted break-all">{{ venue.location }}</span>
            <span v-if="venue.description" class="muted break-all">{{ venue.description }}</span>
          </div>
          <div class="row row-wrap">
            <button type="button" class="btn-quiet" :disabled="blocked" @click="edit(venue)">{{ ui.copy_e040ae3016 }}</button>
            <button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" @click="remove(venue)">{{ ui.copy_acc985cabc }}</button>
          </div>
        </div>
      </div>
    </section>
    <footer class="page-footer"><div class="footer-name">{{ copy.common.appName }}</div><div class="footer-org">{{ copy.common.organizationName }}</div></footer>
  </div>
  <GlassDialog v-if="editing" :title="form.id ? ui.copy_1ba7eec34e : ui.copy_a78ce83cab" :busy="busy" @close="closeEditor">
    <label class="field"><span class="field-label">{{ ui.copy_70ae057f15 }}</span><input v-model="form.name" class="field-input" :placeholder="ui.copy_8ed5dab532" :disabled="blocked" /></label>
    <label class="field"><span class="field-label">{{ ui.copy_b9966da09b }}</span><input v-model="form.location" class="field-input" :placeholder="ui.copy_2cae5f609b" :disabled="blocked" /></label>
    <label class="field"><span class="field-label">{{ ui.copy_25e1199dc3 }}</span><textarea v-model="form.description" class="field-input" rows="3" :placeholder="ui.copy_8516d4b714" :disabled="blocked" /></label>
    <p v-if="actionNotice" role="alert" class="notice-line">{{ actionNotice }}</p>
    <p v-if="loadNotice" role="alert" class="notice-line">{{ loadNotice }}</p>
    <button v-if="loadNotice" type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button>
    <template #footer><div class="venue-editor-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="closeEditor">{{ ui.copy_06dbb49961 }}</button><button type="button" class="btn btn-primary" :disabled="blocked" @click="save">{{ ui.copy_c701dd2fcc }}</button></div></template>
  </GlassDialog>
  <GlassDialog v-if="switchGuard" compact :title="ui.copy_40859eeee7" @close="switchGuard = false"><p>{{ ui.copy_2406186d54 }}</p></GlassDialog>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import GlassDialog from '@/components/GlassDialog.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';
const router = useRouter();
const venues = ref([]), loading = ref(false), loadNotice = ref(''), actionNotice = ref('');
const permissionLoading = ref(true), permissionNotice = ref(''), profile = ref(null);
const editing = ref(false), busy = ref(false), switchGuard = ref(false), savedAwaitingRead = ref(false);
const form = reactive({ id: '', name: '', location: '', description: '' });
const allowed = computed(() => profile.value?.adminLevel === 'super_admin' || profile.value?.permissions?.['venue.resources'] === true);
const blocked = computed(() => busy.value || loading.value || permissionLoading.value || !!permissionNotice.value || !!loadNotice.value || savedAwaitingRead.value || !allowed.value);
const displayName = computed(() => session.context?.name || session.user?.name || '');
const orgName = computed(() => session.context?.organizationName || '');
const roleLine = computed(() => session.context?.assignmentLabel || session.context?.identityName || roleLabelOf(session.context));
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
let disposed = false, generation = 0, permissionGeneration = 0;
function goWorkRole() {
  if (busy.value) return;
  if (editing.value) { switchGuard.value = true; return; }
  router.push({ name: 'workRole' });
}
function edit(row = {}) {
  if (blocked.value) return;
  Object.assign(form, { id: row.id || '', name: row.name || '', location: row.location || '', description: row.description || '' });
  actionNotice.value = ''; editing.value = true;
}
function closeEditor() { if (!busy.value) editing.value = false; }
async function load() {
  if (!allowed.value || permissionNotice.value || permissionLoading.value) return false;
  const request = ++generation, expected = scope();
  const current = () => !disposed && request === generation && expected === scope();
  loading.value = true;
  try {
    const result = requireSuccess(await callApi('listVenues', {}));
    if (!current()) return false;
    if (!Array.isArray(result.venues)) throw new Error();
    venues.value = result.venues; loadNotice.value = '';
    if (savedAwaitingRead.value) { savedAwaitingRead.value = false; editing.value = false; }
    return true;
  } catch (error) { if (current()) loadNotice.value = errorText(error, ui.copy_e52119b17e); return false; }
  finally { if (current()) loading.value = false; }
}
async function loadPermissions() {
  const request = ++permissionGeneration, expected = scope();
  const current = () => !disposed && request === permissionGeneration && expected === scope();
  permissionLoading.value = true; permissionNotice.value = '';
  try {
    if (session.context?.role !== 'admin') throw new Error(copy.errors.permissionDenied);
    const result = requireSuccess(await callApi('getMyAdminPermissions', {}));
    if (!current()) return;
    if (result.organizationId && result.organizationId !== session.context?.organizationId) throw new Error(copy.errors.permissionDenied);
    profile.value = result;
  } catch (error) { if (current()) permissionNotice.value = errorText(error, copy.errors.permissionDenied); }
  finally { if (current()) permissionLoading.value = false; }
  if (current() && !permissionNotice.value && allowed.value) await load();
}
async function save() {
  if (blocked.value) return;
  if (!form.name.trim()) { actionNotice.value = ui.copy_4514e50856; return; }
  const expected = scope();
  const current = () => !disposed && expected === scope();
  const payload = { ...form, name: form.name.trim() };
  busy.value = true; actionNotice.value = '';
  try {
    const result = requireSuccess(await callApi('saveVenue', payload));
    if (!current()) return;
    savedAwaitingRead.value = true;
    await load();
    if (current()) showToast(result.message);
  } catch (error) { if (current()) actionNotice.value = errorText(error, ui.copy_215e3c57da); }
  finally { if (current()) busy.value = false; }
}
async function remove(row) {
  if (blocked.value) return;
  const target = { id: row.id, name: row.name }, expected = scope();
  const current = () => !disposed && expected === scope();
  busy.value = true; actionNotice.value = '';
  try {
    const confirmed = await confirmAction({ title: ui.copy_7f31eec657, body: target.name + '\n' + ui.copy_8ec6962e84, danger: true, confirmText: copy.common.confirm, cancelText: copy.common.cancel });
    if (!confirmed || !current()) return;
    requireSuccess(await callApi('deleteVenue', { id: target.id }));
    if (!current()) return;
    await load();
    if (current()) showToast(ui.copy_5398fec054);
  } catch (error) { if (current()) actionNotice.value = errorText(error, ui.copy_076bb5d383); }
  finally { if (current()) busy.value = false; }
}
watch(scope, () => {
  generation++; venues.value = []; profile.value = null; editing.value = false; loadNotice.value = ''; actionNotice.value = ''; savedAwaitingRead.value = false;
  loadPermissions();
}, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; permissionGeneration++; });
onBeforeRouteLeave(() => session.status !== 'authenticated' || !busy.value);
onBeforeRouteUpdate(() => session.status !== 'authenticated' || !busy.value);
</script>

<style scoped>
.venue-resource { flex-direction: column; align-items: stretch; }
.panel-head > .stack-tight { flex: 1; min-width: 0; }
.venue-add { flex: none; width: auto; white-space: nowrap; }
.venue-editor-actions { display: grid; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
</style>
