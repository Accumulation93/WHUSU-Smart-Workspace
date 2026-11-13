<template>
  <div class="stack">
    <section class="card stack">
      <span class="section-title">{{ config.title }}</span>
      <label v-if="kind === 'identities' && relationEnabled" class="field"><span class="field-label">{{ relations.nature }}</span><select v-model="natureFilter" class="field-input"><option value="">{{ relations.allNatures }}</option><option value="pending">{{ relations.pendingFilter }}</option><option v-for="nature in natures" :key="nature.id" :value="nature.id">{{ nature.name }}</option></select></label>
      <div v-if="kind === 'identities' && !loading && !loadNotice && !relationEnabled" class="stack-tight"><p class="notice-line">{{ relations.configurationNotEnabled }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button></div>
      <div v-if="loadNotice" class="stack-tight" role="alert">
        <span class="notice-line">{{ loadNotice }}</span>
        <button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button>
      </div>
    </section>
    <form v-if="canWriteRecord && (kind !== 'identities' || relationEnabled)" ref="editor" class="card stack" @submit.prevent="save">
      <span class="section-title">{{ form.id ? config.edit : config.create }}</span>
      <div v-if="kind === 'identities'" class="field"><span class="field-label">{{ relations.applicableNatures }}</span><div class="stack-tight"><button v-for="nature in natures" :key="nature.id" type="button" class="selection-option-card" :class="{'is-selected': (form.natureIds || []).includes(nature.id)}" :aria-pressed="(form.natureIds || []).includes(nature.id)" :disabled="blocked" @click="toggleNature(nature.id)">{{ nature.name }}</button></div></div>
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
        <button type="submit" class="btn btn-primary" :disabled="blocked"><AppLoading v-if="busy" compact />{{ config.save }}</button>
        <button type="button" class="btn btn-secondary" :disabled="blocked" @click="reset">{{ config.create }}</button>
      </div>
    </form>
    <section class="card stack">
      <span class="section-title">{{ config.list }}</span>
      <div v-if="loading && !rows.length" class="empty-state"><AppLoading :text="copy.common.loading" /></div>
      <div v-else-if="!loadNotice && !rows.length" class="empty-state">{{ config.empty }}</div>
      <div v-else class="list">
        <article v-for="row in visibleRows" :key="row.id" class="list-row dictionary-row">
          <div class="list-row-main stack-tight">
            <span v-if="kind === 'identities' && relationEnabled" class="chip">{{ natureNames(row.natureIds) || relations.pending }}</span>
            <span class="list-row-title break-all">{{ row.name }}</span>
            <span v-if="kind === 'workGroups'" class="muted break-all">{{ ui.copy_405f619b06 }}{{ row.departmentName }}</span>
            <span v-if="row.description" class="muted break-all">{{ row.description }}</span>
          </div>
          <div class="card-actions">
            <button type="button" class="btn-quiet" :disabled="blocked" v-if="canUpdateRecord && row.canUpdate !== false" @click="edit(row)">{{ ui.copy_e040ae3016 }}</button>
            <button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord && row.canDelete !== false" @click="remove(row)">{{ ui.copy_acc985cabc }}</button>
          </div>
        </article>
      </div>
    </section>
    <GlassDialog v-if="identityPreview" :title="forceStage ? relations.forceTitle : identityPreview.mode === 'merge' ? relations.mergeTitle : identityPreview.removedNatureIds?.length ? relations.unlinkTitle : relations.affectedTitle" @close="closePreview">
      <div class="stack">
        <strong>{{ pendingPayload.name }}</strong>
        <p v-if="identityPreview.mode === 'merge'">{{ relations.mergeHelp(pendingPayload.name) }}</p>
        <div class="stack-tight"><span class="field-label">{{ identityPreview.mode === 'merge' ? relations.mergedNatures : relations.applicableNatures }}</span><span>{{ natureNames(identityPreview.natureIds) }}</span></div>
        <div v-if="identityPreview.addedNatureIds?.length" class="stack-tight"><span class="field-label">{{ relations.addedNatures }}</span><span>{{ natureNames(identityPreview.addedNatureIds) }}</span><p class="notice-line">{{ relations.addedNatureHelp }}</p></div>
        <section v-if="identityPreview.descriptionConflict" class="stack"><strong>{{ relations.descriptionConflictTitle }}</strong><button type="button" class="selection-option-card stack-tight" :class="{'is-selected': descriptionChoice === 'existing'}" :disabled="busy" @click="descriptionChoice='existing'"><strong>{{ relations.keepExisting }}</strong><span class="break-all">{{ identityPreview.existingDescription || relations.emptyDescription }}</span></button><button type="button" class="selection-option-card stack-tight" :class="{'is-selected': descriptionChoice === 'incoming'}" :disabled="busy" @click="descriptionChoice='incoming'"><strong>{{ relations.useIncoming }}</strong><span class="break-all">{{ identityPreview.incomingDescription || relations.emptyDescription }}</span></button></section>
        <section v-if="identityPreview.usages?.length" class="stack-tight"><strong>{{ relations.affectedTitle }}</strong><section v-for="(item,index) in identityPreview.usages" :key="index" class="glass-panel stack-tight"><div class="panel-head"><span>{{ usageLabel(item.kind) }}</span><span>{{ item.count }}</span></div><div v-for="detail in item.details || []" :key="detail.id" class="stack-tight break-all"><span v-if="detail.natureName" class="muted">{{ detail.natureName }}</span><span v-if="detail.assignmentLabel">{{ detail.assignmentLabel }}</span><span v-if="detail.title">{{ detail.title }}</span></div><p v-if="item.hiddenCount > 0" class="muted">{{ relations.hiddenDetailCount(item.hiddenCount) }}</p></section></section>
        <p v-if="forceStage" class="notice-line">{{ relations.forceHelp(natureNames(identityPreview.removedNatureIds), pendingPayload.name) }}</p>
        <p v-if="actionNotice" class="notice-line" role="alert">{{ actionNotice }}</p>
      </div>
      <template #footer><button type="button" class="btn btn-secondary" :disabled="busy" @click="closePreview">{{ dept.copy_4b213fd88a }}</button><button type="button" class="btn" :class="forceStage?'btn-danger':'btn-primary'" :disabled="busy || (identityPreview.descriptionConflict && !descriptionChoice)" @click="confirmIdentity"><AppLoading v-if="busy" compact />{{ forceStage ? relations.forceConfirm : identityPreview.mode === 'merge' ? relations.mergeConfirm : identityPreview.removedNatureIds?.length ? relations.unlinkConfirm : config.save }}</button></template>
    </GlassDialog>
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
import { useAdminCapability, useAdminAuthorizationAccess } from '@/runtime/adminCapabilities.js';
const authorizationAccess = useAdminAuthorizationAccess();
const resource = () => ({ departments: 'hr.departments', workGroups: 'hr.workGroups', identities: 'hr.identities' })[props.kind];
const legacyPermission = () => ({ departments: 'hr.departments', workGroups: 'hr.work_groups', identities: 'hr.identities' })[props.kind];
const canDeleteRecord = useAdminCapability(() => legacyPermission() + '.delete', () => resource() + '.delete');
const canUpdateRecord = useAdminCapability(legacyPermission, () => resource() + '.update');
const canWriteRecord = useAdminCapability(legacyPermission, () => resource() + (props.state.form.id ? '.update' : '.create'));
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import dept from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/departmentBehavior.js';
import identity from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/identityBehavior.js';
import group from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/workGroupBehavior.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import relations from '@/locales/zh-CN/shared/identityNatureRelations.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
import { useCopiedConfigurationEditor } from '@/runtime/copiedConfigurationEditor.js';

const props = defineProps({ kind: { type: String, required: true }, state: { type: Object, required: true }, disabled: Boolean });
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
const natures = ref([]), relationEnabled=ref(false),natureFilter = ref(''), identityPreview = ref(null), pendingPayload = ref(null), descriptionChoice = ref(''), forceStage = ref(false);
const visibleRows = computed(() => props.kind !== 'identities' || !natureFilter.value ? rows.value : rows.value.filter(row => natureFilter.value === 'pending' ? !(row.natureIds || []).length : (row.natureIds || []).includes(natureFilter.value)));
function natureNames(ids) { return (ids || []).map(id => natures.value.find(item => item.id === id)?.name).filter(Boolean).join(' · '); }
function toggleNature(id) { const values = form.value.natureIds || []; form.value.natureIds = values.includes(id) ? values.filter(value => value !== id) : [...values,id]; }
function usageLabel(kind) { return ({audit_history:relations.affectedApprovals,stamp_bindings:relations.affectedStamps,positions:relations.affectedPositions,assignments:relations.affectedPositions,approvals:relations.affectedApprovals,stamps:relations.affectedStamps,copy_drafts:relations.affectedCopyDrafts,copyDrafts:relations.affectedCopyDrafts})[kind] || personnel.dictionaryUsageCategories[kind] || relations.affectedRules; }
function closePreview() { if(busy.value)return; identityPreview.value=null;pendingPayload.value=null;forceStage.value=false;descriptionChoice.value=''; }
const loading = ref(false);
const busy = ref(false);
const loadNotice = ref('');
const actionNotice = ref('');
const usage = ref(null);
const form = computed(() => props.state.form);
const blocked = computed(() => props.disabled || loading.value || busy.value || !!loadNotice.value || (props.kind==='identities'&&!relationEnabled.value));
let generation = 0;
let disposed = false;
const scope = () => [session.context?.contextId, session.context?.organizationId, props.kind].join('|');
function reset() { Object.assign(form.value, { id: '', name: '', description: '', departmentId: '', natureIds: [], version: undefined }); actionNotice.value = ''; }
async function edit(row) {
  if (blocked.value || !canUpdateRecord.value || row.canUpdate === false) return;
  Object.assign(form.value, { id: row.id, name: row.name, description: row.description || '', departmentId: row.departmentId || '', natureIds: [...(row.natureIds || [])], version: row.version });
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
    const enforced = authorizationAccess.value?.mode === 'enforced';
    const results = await Promise.all([
      enforced ? callApi('listAuthorizedDictionary', { kind: { departments: 'department', identities: 'identity', workGroups: 'work_group' }[props.kind] }).then(requireSuccess)
        : callApi(config.value.listApi, {}).then(requireSuccess),
      props.kind === 'workGroups' ? callApi('listDepartments', {}).then(requireSuccess) : Promise.resolve(null)
    ]);
    if (!current()) return false;
    const list = enforced ? results[0].list : results[0][props.kind];
    if (!Array.isArray(list) || (results[1] && !Array.isArray(results[1].departments))) throw new Error();
    rows.value = list;
    if (results[1]) departments.value = results[1].departments;
    if (props.kind === 'identities') {natures.value = results[0].natureOptions || [];relationEnabled.value=results[0].relationEnabled===true;if(!relationEnabled.value)natureFilter.value='';}
    loadNotice.value = '';
    if (props.state.resetAfterRead) { props.state.resetAfterRead = false; reset(); }
    return true;
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, personnel.dictionaryLoadFailed[props.kind].description);
    return false;
  } finally { if (current()) loading.value = false; }
}
async function save() {
  if (blocked.value || !canWriteRecord.value) return;
  if (!form.value.name.trim()) { actionNotice.value = config.value.missingName; return; }
  if (props.kind === 'identities' && !form.value.id && !(form.value.natureIds || []).length) { actionNotice.value = relations.selectNatureRequired; return; }
  if (props.kind === 'workGroups' && !departments.value.some(row => row.id === form.value.departmentId)) {
    actionNotice.value = ui.copy_eada426deb; return;
  }
  const expected = scope();
  const current = () => !disposed && expected === scope();
  const payload = { id: form.value.id, name: form.value.name.trim(), description: form.value.description };
  if (props.kind === 'identities') { payload.natureIds=[...form.value.natureIds]; payload.version=form.value.version; }
  if (props.kind === 'workGroups') {
    payload.departmentId = form.value.departmentId;
    payload.departmentCode = departments.value.find(row => row.id === form.value.departmentId)?.code || '';
  }
  busy.value = true;
  actionNotice.value = '';
  try {
    if (props.kind === 'identities') {
      const result=requireSuccess(await callApi(config.value.saveApi,{...payload,preview:true}));
      if(!current())return;
      if(!result.preview)throw new Error();
      pendingPayload.value=payload;identityPreview.value=result.preview;descriptionChoice.value='';forceStage.value=false;
      return;
    }
    requireSuccess(await callApi(config.value.saveApi, payload));
    if (!current()) return;
    props.state.resetAfterRead = true;
    const refreshed = await load();
    if (!current()) return;
    if (refreshed) reset();
    showToast(config.value.saved);
  } catch (error) { if (current()) actionNotice.value = errorText(error, dept.copy_215e3c57da); }
  finally { if (current()) busy.value = false; }
}
async function confirmIdentity() {
  if(busy.value || !identityPreview.value || !pendingPayload.value)return;
  const preview=identityPreview.value;
  if(preview.descriptionConflict&&!descriptionChoice.value){actionNotice.value=relations.chooseDescription;return;}
  if(preview.removedNatureIds?.length&&preview.usages?.some(item=>Number(item.count)>0)&&!forceStage.value){forceStage.value=true;return;}
  const expected=scope();busy.value=true;actionNotice.value='';
  try {
    requireSuccess(await callApi('saveIdentity',{...pendingPayload.value,impactToken:preview.impactToken,mergeVersion:preview.version,descriptionChoice:descriptionChoice.value,forceDetach:forceStage.value}));
    if(disposed||expected!==scope())return;
    identityPreview.value=null;pendingPayload.value=null;props.state.resetAfterRead=true;
    await load();if(disposed||expected!==scope())return;showToast(relations.saved);
  } catch(error){if(!disposed&&expected===scope())actionNotice.value=errorText(error,dept.copy_215e3c57da);}
  finally{if(!disposed&&expected===scope())busy.value=false;}
}
async function remove(row) {
  if (blocked.value || !canDeleteRecord.value || row.canDelete === false) return;
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
    if (form.value.id === target.id) reset();
    showToast(config.value.deleted);
  } catch (error) { if (current()) actionNotice.value = errorText(error, dept.copy_076bb5d383); }
  finally { if (current()) busy.value = false; }
}
useCopiedConfigurationEditor({ kind: () => ({ departments: 'hr.departments', identities: 'hr.identities', workGroups: 'hr.workGroups' })[props.kind], rows,
  blocked: () => blocked.value || !canUpdateRecord.value, ready: () => !loading.value && !loadNotice.value, edit, notice: actionNotice });
watch(busy, value => emit('busy', value), { flush: 'sync' });
watch(scope, () => { generation++; rows.value = []; departments.value = []; natures.value=[];identityPreview.value=null;pendingPayload.value=null;usage.value = null; busy.value = false; loadNotice.value = ''; actionNotice.value = ''; load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); });
</script>

<style scoped>
.dictionary-row { flex-direction: column; align-items: stretch; }
.selection-option-card { text-align: left; padding: var(--ui-control-padding-y) var(--ui-control-padding-x); border: var(--ui-field-border); border-radius: var(--ui-control-radius); background: var(--ui-card-bg); min-height: var(--ui-control-height); }
.selection-option-card.is-selected { border-color: var(--ui-blue-700); background: var(--ui-chip-blue-bg); }
.button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
form { scroll-margin-top: var(--ui-navbar-height); }
</style>
