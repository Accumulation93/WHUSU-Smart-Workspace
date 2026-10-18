<template>
  <p v-if="loading" class="muted"><AppLoading :text="copy.common.loading" /></p>
  <template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template>
  <p v-if="notice && !editor" role="alert" class="notice-line">{{ notice }}</p>
  <button type="button" class="btn btn-secondary" :disabled="blocked" v-if="canWriteRecord" @click="editFlow()">+ {{ ui.copy_1aba371667 }}</button>
  <p v-if="!loading && !loadNotice && !flows.length" class="muted">{{ ui.copy_76c76a4d37 }}</p>
  <div v-for="flow in flows" :key="flow.id" class="list-row approval-row">
    <strong class="break-all">{{ flow.name }}</strong><span class="muted">{{ flow.steps.length }} {{ ui.copy_310413445b }}</span>
    <label v-for="flag in flags" :key="flag.key" class="row row-between"><span>{{ flag.label }}</span><UiSwitch :label="flag.label" :checked="Number(flow[flag.key]) === 1" :disabled="blocked" @change="toggleFlag(flow, flag.key, $event.target.checked)" /></label>
    <div class="row row-wrap"><button type="button" class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="editFlow(flow)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click="removeFlow(flow)">{{ ui.copy_acc985cabc }}</button></div>
  </div>
  <button type="button" class="btn btn-primary" :disabled="blocked" v-if="canWriteRecord" @click="editRule()">{{ ui.copy_c013e80e7c }}</button>
  <p v-if="!loading && !loadNotice && !rules.length" class="muted">{{ ui.copy_62a9684fcb }}</p>
  <div v-for="rule in rules" :key="rule.id" class="list-row approval-row"><strong>{{ ruleLabels[rule.rule_type] }}</strong><div class="row row-wrap"><button type="button" class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="editRule(rule)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click="removeRule(rule)">{{ ui.copy_acc985cabc }}</button></div></div>
  <VenueFlowEditor v-if="editor?.type === 'flow'" :value="editor" :busy="busy || awaitingRead" :disabled="blocked" @close="closeEditor" @save="saveFlow"><p v-if="notice" role="alert" class="notice-line">{{ notice }}</p><template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template></VenueFlowEditor>
  <GlassDialog v-if="editor?.type === 'rule'" :title="(editor.id ? ui.copy_20f94d2c18 : ui.copy_766176221d) + ui.copy_a9a18dd6e8" :busy="busy || awaitingRead" @close="closeEditor">
    <label class="field"><span class="field-label">{{ ui.copy_c5ec30e07d }}</span><select v-model="editor.ruleType" class="field-input" :disabled="blocked"><option value="admin">{{ ui.copy_af20193574 }}</option><option value="direct">{{ ui.copy_4f15bb9939 }}</option></select></label>
    <p v-if="notice" role="alert" class="notice-line">{{ notice }}</p><template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template>
    <template #footer><button type="button" class="btn btn-primary" :disabled="blocked" @click="saveRule">{{ ui.copy_f7597cecf5 }}</button></template>
  </GlassDialog>
</template>
<script setup>
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
const canDeleteRecord = useAdminCapability('venue.approvals.delete');
const canWriteRecord = useAdminCapability('venue.approvals');
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import UiSwitch from '@/components/UiSwitch.vue';
import VenueFlowEditor from '@/components/VenueFlowEditor.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import flowCopy from '@/locales/zh-CN/shared/venueFlowManagement.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { bookingWindowForm, clone } from '@/runtime/venueRules.js';
import { session } from '@/runtime/session.js';
const props = defineProps({ venue: Object, windowValue: Object });
const emit = defineEmits(['busy', 'editing']);
const flows = ref([]), rules = ref([]), editor = ref(null), loading = ref(false), busy = ref(false), loadNotice = ref(''), notice = ref(''), awaitingRead = ref(false);
const blocked = computed(() => busy.value || loading.value || !!loadNotice.value || awaitingRead.value);
const flags = [{ key: 'allow_user_select', label: ui.copy_6f806672e2 }, { key: 'allow_designate_first', label: ui.allowDesignateFirstApprover }, { key: 'allow_designate_next', label: ui.allowDesignateNextApprover }];
const ruleLabels = { direct: ui.copy_4f15bb9939, admin: ui.copy_af20193574, identity: ui.copy_fa045c9cde, person: ui.copy_777a6a2574 };
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|'); const originalScope = scope(); let disposed = false, generation = 0;
const current = () => !disposed && scope() === originalScope;
async function load() {
  const request = ++generation; loading.value = true;
  try {
    const [flowResult, ruleResult] = await Promise.all(['listVenueApprovalFlows', 'listVenueBookingRules'].map(name => callApi(name, { venueId: props.venue.id }).then(requireSuccess)));
    if (!current() || request !== generation) return;
    if (!Array.isArray(flowResult.flows) || !Array.isArray(ruleResult.rules) || ruleResult.rules.some(rule => !ruleLabels[rule.rule_type]) || flowResult.flows.some(flow => !Array.isArray(flow.steps)
      || flow.steps.some(step => !Array.isArray(step.rules) || !['admin_any', 'hr_rule'].includes(step.approval_mode)
        || step.approval_mode === 'admin_any' && step.rules.length || step.approval_mode === 'hr_rule' && !step.rules.length
        || step.rules.some(rule => ['department_scope', 'work_group_scope', 'identity_scope'].some(key => !['all', 'same', 'specific'].includes(rule[key])))))) throw new Error();
    flows.value = flowResult.flows; rules.value = ruleResult.rules; Object.assign(props.windowValue, bookingWindowForm(ruleResult.bookingWindow)); loadNotice.value = '';
    if (awaitingRead.value) { awaitingRead.value = false; editor.value = null; }
  } catch (error) { if (current() && request === generation) loadNotice.value = errorText(error, ui.copy_e52119b17e); }
  finally { if (current() && request === generation) loading.value = false; }
}
function closeEditor() { if (!busy.value && !awaitingRead.value) editor.value = null; }
function editRule(rule = {}) { if (!blocked.value) { editor.value = { type: 'rule', id: rule.id || '', ruleType: rule.rule_type === 'direct' ? 'direct' : 'admin' }; notice.value = ''; } }
function editFlow(flow = {}) {
  if (blocked.value) return;
  editor.value = { type: 'flow', id: flow.id || '', name: flow.name || ui.copy_9835b165c7,
    allowUserSelect: Number(flow.allow_user_select) === 1, allowDesignateFirst: Number(flow.allow_designate_first) === 1, allowDesignateNext: Number(flow.allow_designate_next) === 1,
    steps: (flow.steps || []).map(step => ({ name: step.name || '', approvalMode: step.approval_mode, rules: (step.rules || []).map(rule => ({ departmentScope: rule.department_scope || 'all', specificDepartmentId: rule.specific_department_id || '', workGroupScope: rule.work_group_scope || 'all', specificWorkGroupId: rule.specific_work_group_id || '', identityScope: rule.identity_scope || 'all', specificIdentityId: rule.specific_identity_id || '' })) })) };
  notice.value = '';
}
async function write(name, data, confirmation) {
  if (blocked.value || !current()) return;
  busy.value = true; notice.value = '';
  try {
    if (confirmation && !await confirmAction({ title: confirmation.title || ui.copy_7f31eec657, body: confirmation.body, danger: true, confirmText: copy.common.confirm, cancelText: copy.common.cancel })) return;
    if (!current()) return;
    const result = requireSuccess(await callApi(name, data)); if (!current()) return;
    awaitingRead.value = true; await load(); if (current()) showToast(result.message || ui.copy_5398fec054);
  } catch (error) { if (current()) notice.value = errorText(error, ui.copy_215e3c57da); }
  finally { if (current()) busy.value = false; }
}
function saveFlow() {
  const value = clone(editor.value);
  if (!value.steps.length) { notice.value = ui.copy_7ae01e1929; return; }
  return write('saveVenueApprovalWholeFlow', { venueId: props.venue.id, flowId: value.id, flowName: value.name,
    allowUserSelect: value.allowUserSelect, allowDesignateFirst: value.allowDesignateFirst, allowDesignateNext: value.allowDesignateNext,
    steps: value.steps.map((step, index) => ({ name: step.name, sortOrder: index + 1, approvalMode: step.rules.length ? 'hr_rule' : 'admin_any', rules: step.rules })), bookingWindow: clone(props.windowValue) },
    rules.value.some(rule => rule.rule_type === 'direct') ? { title: flowCopy.switchTitle, body: flowCopy.directToFlow } : null);
}
function saveRule() { return write('saveVenueBookingRule', { id: editor.value.id, venueId: props.venue.id, ruleType: editor.value.ruleType, bookingWindow: clone(props.windowValue) }, editor.value.ruleType === 'direct' && flows.value.length ? { title: flowCopy.switchTitle, body: flowCopy.flowToDirect } : null); }
function removeFlow(flow) { return write('deleteVenueApprovalFlow', { flowId: flow.id, venueId: props.venue.id }, { body: flow.name + '\n' + ui.copy_19aa0fdb46 }); }
function removeRule(rule) { return write('deleteVenueBookingRule', { id: rule.id }, { body: props.venue.name + ' · ' + ruleLabels[rule.rule_type] }); }
function toggleFlag(flow, key, checked) {
  const payload = { venueId: props.venue.id, flowId: flow.id, name: flow.name, allowUserSelect: Number(flow.allow_user_select) === 1, allowDesignateFirst: Number(flow.allow_designate_first) === 1, allowDesignateNext: Number(flow.allow_designate_next) === 1 };
  payload[{ allow_user_select: 'allowUserSelect', allow_designate_first: 'allowDesignateFirst', allow_designate_next: 'allowDesignateNext' }[key]] = checked;
  return write('saveVenueApprovalFlowMeta', payload);
}
watch([busy, awaitingRead], () => emit('busy', busy.value || awaitingRead.value), { flush: 'sync' });
watch(editor, value => emit('editing', !!value), { flush: 'sync' });
load(); onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); emit('editing', false); });
</script>
<style scoped>
.approval-row { flex-direction: column; align-items: stretch; gap: var(--ui-field-gap); }
</style>
