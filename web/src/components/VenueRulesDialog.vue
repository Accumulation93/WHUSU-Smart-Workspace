<template>
  <GlassDialog :title="ui.copy_ea512602ff + ' · ' + venue.name" :busy="busy || approvalBusy || awaitingRead" @close="close">
    <template #toolbar><nav class="tabs rule-tabs"><button v-for="tab in tabs" :key="tab.key" type="button" class="tab" :class="{ 'tab-active': active === tab.key }" :aria-pressed="active === tab.key" :disabled="busy || approvalBusy || awaitingRead" @click="active = tab.key; load()">{{ tab.label }}</button></nav></template>
    <h2 class="section-title">{{ tabs.find(tab => tab.key === active)?.title }}</h2>
    <VenueApprovalRules v-if="active === 'booking'" :venue="venue" :window-value="windowForm" @busy="approvalBusy = $event" @editing="approvalEditing = $event" />
    <template v-else>
      <p v-if="loading" class="muted"><AppLoading :text="copy.common.loading" /></p>
      <template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template>
      <p v-if="actionNotice && !editor" role="alert" class="notice-line">{{ actionNotice }}</p>
      <template v-if="active === 'bookingWindow'"><VenueBookingWindowFields :value="windowForm" :disabled="blocked" /></template>
      <template v-else>
        <button type="button" class="btn btn-primary" :disabled="blocked" v-if="canCreateRecord" @click="edit()">{{ active === 'open' ? ui.copy_61960b0ff3 : ui.copy_c38d25de0f }}</button>
        <p v-if="!loading && !loadNotice && !rows.length" class="muted">{{ active === 'open' ? ui.copy_5e2a277742 : ui.copy_06426d6c41 }}</p>
        <div v-for="row in rows" :key="row.id" class="list-row rule-row" :role="active === 'activity' ? 'button' : undefined" :tabindex="active === 'activity' ? 0 : undefined" @click="viewActivity(row)" @keydown.enter.self="viewActivity(row)">
          <strong class="break-all">{{ row.name || row.activity_name || (active === 'open' ? ui.copy_6e6ee2b747 : ui.copy_acd4c5c171) }}</strong>
          <span class="chip">{{ row.is_active === 0 ? flowCopy.disabled : flowCopy.enabled }}</span>
          <span class="muted break-all">{{ cycleLabel(row.cycle_type, row.cycle_values) }} · {{ row.time_start }} - {{ row.time_end }}</span>
          <div class="row row-wrap"><button type="button" class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click.stop="edit(row)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click.stop="remove(row)">{{ ui.copy_acc985cabc }}</button></div>
        </div>
      </template>
    </template>
    <template v-if="active === 'bookingWindow' && canWriteApprovals" #footer><button type="button" class="btn btn-primary" :disabled="blocked" @click="saveWindow">{{ ui.copy_ac9827b75d }}</button></template>
  </GlassDialog>
  <VenueCycleRuleEditor v-if="editor" :type="editor.type" :value="editor" :busy="busy || awaitingRead" :disabled="blocked" @close="editor = null" @save="saveRule">
    <p v-if="actionNotice" role="alert" class="notice-line">{{ actionNotice }}</p><template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template>
  </VenueCycleRuleEditor>
  <GlassDialog v-if="activity" :title="ui.copy_c4df6642e3" @close="activity = null"><VenueActivityDetail :source-id="activity.id" :name="activity.activity_name" :venue="venue.name" :time="activity.time_start + ' - ' + activity.time_end" :cycle="cycleLabel(activity.cycle_type, activity.cycle_values)" :period="activityPeriodLabel(activity.cycle_type, activity.cycle_values)" :note="ui.copy_e90ee137d6" /></GlassDialog>
</template>
<script setup>
import { useAdminCapability, useAdminAuthorizationAccess } from '@/runtime/adminCapabilities.js';
const authorizationAccess = useAdminAuthorizationAccess();
const resource = () => active.value === 'open' ? 'venue.openRules' : 'venue.activityRules';
const canDeleteRecord = useAdminCapability('venue.resources.delete', () => resource() + '.delete');
const canWriteRecord = useAdminCapability('venue.resources', () => resource() + '.update');
const canCreateRecord = useAdminCapability('venue.resources', () => resource() + '.create');
const canReadApprovals = useAdminCapability('venue.approvals.delete', 'venue.approvals.read');
const canWriteApprovals = useAdminCapability('venue.approvals', 'venue.bookingWindows.create');
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import VenueActivityDetail from '@/components/VenueActivityDetail.vue';
import VenueCycleRuleEditor from '@/components/VenueCycleRuleEditor.vue';
import VenueBookingWindowFields from '@/components/VenueBookingWindowFields.vue';
import VenueApprovalRules from '@/components/VenueApprovalRules.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import flowCopy from '@/locales/zh-CN/shared/venueFlowManagement.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
import { useRoute } from 'vue-router';
import { useCopiedConfigurationEditor } from '@/runtime/copiedConfigurationEditor.js';
import { activityValues, activityPeriodLabel, advanceMinutes, bookingWindowForm, cycleLabel, parseValues } from '@/runtime/venueRules.js';
const props = defineProps({ venue: { type: Object, required: true }, canApprove: Boolean });
const emit = defineEmits(['close', 'busy', 'editing']);
const route = useRoute();
const copyTab = ({ 'venue.approvals': 'booking', 'venue.bookingRules': 'booking', 'venue.bookingWindows': 'bookingWindow', 'venue.openRules': 'open', 'venue.activityRules': 'activity' })[route.query.copyKind];
const active = ref(copyTab && route.query.venueId === props.venue.id ? copyTab : 'open'), records = ref({ open: [], activity: [] }), windowForm = ref(bookingWindowForm(null));
const editor = ref(null), activity = ref(null), loading = ref(false), busy = ref(false), loadNotice = ref(''), actionNotice = ref(''), awaitingRead = ref(false);
const approvalBusy = ref(false), approvalEditing = ref(false);
const tabs = computed(() => {
  const items = [{ key: 'open', label: ui.rulesTabOpen, title: ui.rulesSectionOpen }, { key: 'activity', label: ui.rulesTabActivity, title: ui.rulesSectionActivity }, { key: 'booking', label: ui.rulesTabApproval, title: ui.rulesSectionApproval }, { key: 'bookingWindow', label: ui.rulesTabWindow, title: ui.rulesSectionWindow }];
  if (authorizationAccess.value?.mode !== 'enforced') return items.filter(item => ['open', 'activity'].includes(item.key) || props.canApprove || canReadApprovals.value);
  const resources = { open: ['venue.openRules'], activity: ['venue.activityRules'], booking: ['venue.approvals', 'venue.bookingRules'], bookingWindow: ['venue.bookingWindows'] };
  return items.filter(item => resources[item.key].some(key => authorizationAccess.value.grantedCapabilities.some(capability => capability.startsWith(key + '.'))));
});
const blocked = computed(() => busy.value || loading.value || !!loadNotice.value || awaitingRead.value);
const rows = computed(() => records.value[active.value] || []);
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
const originalScope = scope(); let disposed = false, generation = 0;
const current = () => !disposed && originalScope === scope();
function close() { if (!busy.value && !approvalBusy.value && !awaitingRead.value) emit('close'); }
async function load() {
  if (!tabs.value.some(tab => tab.key === active.value)) active.value = tabs.value[0]?.key || '';
  if (!active.value) return;
  if (!current() || active.value === 'booking') return;
  const readResource = active.value === 'bookingWindow' ? 'venue.bookingWindows' : resource();
  if (authorizationAccess.value?.mode === 'enforced' && !authorizationAccess.value.grantedCapabilities.includes(readResource + '.read')) {
    awaitingRead.value = false; editor.value = null; loadNotice.value = ''; return;
  }
  const tab = active.value, request = ++generation; loading.value = true;
  try {
    const result = requireSuccess(await callApi(tab === 'open' ? 'listVenueOpenRules' : tab === 'activity' ? 'listVenueActivityRules' : 'listVenueBookingRules', { venueId: props.venue.id }));
    if (!current() || request !== generation) return false;
    if (!Array.isArray(result.rules)) throw new Error();
    result.rules.forEach(row => parseValues(row.cycle_values));
    if (tab === 'bookingWindow') { if (!awaitingRead.value && !windowLoaded) windowForm.value = bookingWindowForm(result.bookingWindow); windowLoaded = true; }
    else records.value[tab] = result.rules;
    loadNotice.value = '';
    if (awaitingRead.value) { awaitingRead.value = false; editor.value = null; if (tab === 'bookingWindow') windowForm.value = bookingWindowForm(result.bookingWindow); }
    return true;
  } catch (error) { if (current() && request === generation) loadNotice.value = errorText(error, ui.copy_e52119b17e); return false; }
  finally { if (current() && request === generation) loading.value = false; }
}
let windowLoaded = false;
function edit(row = {}) {
  if (blocked.value || !(row.id ? canWriteRecord.value : canCreateRecord.value)) return;
  try {
    const type = active.value, cycleType = row.cycle_type || 'weekly';
    const legacyInterval = type === 'activity' && ['datetime_range', 'repeat'].includes(cycleType);
    editor.value = { type, id: row.id || '', name: row.name || row.activity_name || '', legacyInterval,
      cycleType: type === 'activity' && !legacyInterval && !['daily', 'weekly', 'monthly', 'yearly'].includes(cycleType) ? 'daily' : cycleType,
      cycleValues: type === 'activity' && !legacyInterval ? activityValues(cycleType, row.cycle_values) : parseValues(row.cycle_values), timeStart: row.time_start || '09:00', timeEnd: row.time_end || '18:00' }; actionNotice.value = '';
  } catch (error) { actionNotice.value = errorText(error, ui.copy_e52119b17e); }
}
function viewActivity(row) { if (active.value === 'activity' && !busy.value) activity.value = row; }
async function write(endpoint, payload) {
  if (blocked.value || !current()) return;
  busy.value = true; actionNotice.value = '';
  try {
    requireSuccess(await callApi(endpoint, payload));
    if (!current()) return;
    awaitingRead.value = true; await load();
    const successText = { saveVenueActivityRule: ui.activityRuleSaved, saveVenueOpenRule: ui.openRuleSaved, saveVenueBookingWindow: ui.bookingWindowSaved }[endpoint];
    if (current() && successText) showToast(successText);
  }
  catch (error) { if (current()) actionNotice.value = errorText(error, ui.copy_215e3c57da); }
  finally { if (current()) busy.value = false; }
}
function saveRule() {
  if (!editor.value || blocked.value || !(editor.value.id ? canWriteRecord.value : canCreateRecord.value)) return;
  const value = editor.value;
  const timeValid = text => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text);
  if (!value.legacyInterval && (!timeValid(value.timeStart) || !timeValid(value.timeEnd) || value.timeStart >= value.timeEnd)) { actionNotice.value = ui.copy_0b091cba77; return; }
  if (value.type === 'activity' && !value.legacyInterval) {
    const meta = value.cycleValues;
    if (meta.periodMode !== 'none' && !meta.periodStartDate) { actionNotice.value = ui.copy_6ce770a0a6; return; }
    if (meta.periodMode === 'range' && !meta.periodEndDate) { actionNotice.value = ui.copy_9dfd1d5a78; return; }
    if (meta.periodMode === 'count' && (!Number.isInteger(meta.repeatCount) || meta.repeatCount < 1 || meta.repeatCount > 1000)) { actionNotice.value = ui.copy_bc3fac7db2; return; }
    if (meta.periodMode === 'range' && meta.periodStartDate + meta.periodStartTime >= meta.periodEndDate + meta.periodEndTime) { actionNotice.value = ui.copy_0b091cba77; return; }
  }
  const payload = { id: value.id, venueId: props.venue.id, cycleType: value.cycleType, cycleValues: value.cycleValues, timeStart: value.timeStart, timeEnd: value.timeEnd };
  payload[value.type === 'activity' ? 'activityName' : 'name'] = value.name;
  return write(value.type === 'activity' ? 'saveVenueActivityRule' : 'saveVenueOpenRule', payload);
}
function saveWindow() {
  if (!canWriteApprovals.value) return;
  const open = advanceMinutes(windowForm.value.open), deadline = advanceMinutes(windowForm.value.deadline);
  if (open !== null && deadline !== null && open < deadline) { actionNotice.value = ui.copy_b1545efd70; return; }
  return write('saveVenueBookingWindow', { venueId: props.venue.id, bookingWindow: windowForm.value });
}
async function remove(row) {
  if (blocked.value || !canDeleteRecord.value) return;
  const target = { id: row.id, name: row.name || row.activity_name }, type = active.value;
  busy.value = true; actionNotice.value = '';
  try {
    if (!await confirmAction({ title: ui.copy_7f31eec657, body: target.name, danger: true, confirmText: copy.common.confirm, cancelText: copy.common.cancel }) || !current() || !canDeleteRecord.value) return;
    requireSuccess(await callApi(type === 'open' ? 'deleteVenueOpenRule' : 'deleteVenueActivityRule', { id: target.id }));
    if (current()) { awaitingRead.value = true; await load(); if (current()) showToast(type === 'open' ? ui.openRuleDeleted : ui.activityRuleDeleted); }
  } catch (error) { if (current()) actionNotice.value = errorText(error, ui.copy_076bb5d383); }
  finally { if (current()) busy.value = false; }
}
useCopiedConfigurationEditor({ kind: () => active.value === 'open' ? 'venue.openRules' : active.value === 'activity' ? 'venue.activityRules' : '', rows,
  blocked: () => blocked.value || !canWriteRecord.value, ready: () => !loading.value && !loadNotice.value, edit, notice: actionNotice });
watch([busy, approvalBusy, awaitingRead], () => emit('busy', busy.value || approvalBusy.value || awaitingRead.value), { flush: 'sync' });
watch([editor, approvalEditing], () => emit('editing', !!editor.value || approvalEditing.value), { flush: 'sync' });
load();
onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); emit('editing', false); });
</script>
<style scoped>
.rule-row { flex-direction: column; align-items: stretch; gap: var(--ui-field-gap); }
.rule-tabs .tab { width: 0; min-width: 0; padding-inline: var(--ui-admin-tab-padding-x); white-space: nowrap; }
</style>
