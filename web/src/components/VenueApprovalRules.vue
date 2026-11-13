<template>
  <p v-if="loading" class="muted"><AppLoading :text="copy.common.loading" /></p>
  <template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template>
  <p v-if="notice && !editor" role="alert" class="notice-line">{{ notice }}</p>
  <button type="button" class="btn btn-secondary" :disabled="blocked" v-if="canCreateFlow" @click="editFlow()">+ {{ ui.copy_1aba371667 }}</button>
  <p v-if="!loading && !loadNotice && !flows.length" class="muted">{{ ui.copy_76c76a4d37 }}</p>
  <div v-for="flow in flows" :key="flow.id" class="list-row approval-row">
    <strong class="break-all">{{ flow.name }}</strong><span class="muted">{{ flow.steps.length }} {{ ui.copy_310413445b }}</span>
    <span class="chip">{{ Number(flow.is_active) === 0 ? flowCopy.disabled : flowCopy.enabled }}</span>
    <label v-for="flag in flags" :key="flag.key" class="row row-between"><span>{{ flag.label }}</span><UiSwitch :label="flag.label" :checked="Number(flow[flag.key]) === 1" :disabled="blocked || !canWriteRecord" @change="toggleFlag(flow, flag.key, $event.target.checked)" /></label>
    <div class="row row-wrap"><button type="button" class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="editFlow(flow)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click="removeFlow(flow)">{{ ui.copy_acc985cabc }}</button></div>
  </div>
  <button type="button" class="btn btn-primary" :disabled="blocked" v-if="canCreateRule" @click="editRule()">{{ ui.copy_c013e80e7c }}</button>
  <p v-if="!loading && !loadNotice && !rules.length" class="muted">{{ ui.copy_62a9684fcb }}</p>
  <div v-for="rule in rules" :key="rule.id" class="list-row approval-row"><strong>{{ ruleLabels[rule.rule_type] }}</strong><span class="chip">{{ Number(rule.is_active) === 0 ? flowCopy.disabled : flowCopy.enabled }}</span><div class="row row-wrap"><button type="button" class="btn-quiet" :disabled="blocked" v-if="canUpdateRule" @click="editRule(rule)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRule" @click="removeRule(rule)">{{ ui.copy_acc985cabc }}</button></div></div>
  <VenueFlowEditor v-if="editor?.type === 'flow'" :value="editor" :busy="busy || awaitingRead" :disabled="blocked" @close="closeEditor" @save="saveFlow"><p v-if="notice" role="alert" class="notice-line">{{ notice }}</p><template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template></VenueFlowEditor>
  <GlassDialog v-if="editor?.type === 'rule'" :title="(editor.id ? ui.copy_20f94d2c18 : ui.copy_766176221d) + ui.copy_a9a18dd6e8" :busy="busy || awaitingRead" @close="closeEditor">
    <label class="field"><span class="field-label">{{ ui.copy_c5ec30e07d }}</span><select v-model="editor.ruleType" class="field-input" :disabled="blocked"><option v-for="(label, type) in ruleLabels" :key="type" :value="type">{{ label }}</option></select></label>
    <AppLoading v-if="referencesLoading" :text="copy.common.loading" />
    <template v-if="referencesError"><p role="alert" class="notice-line">{{ referencesError }}</p><button type="button" class="btn-quiet" @click="loadRuleReferences">{{ copy.common.retry }}</button></template>
    <label v-if="editor.ruleType === 'identity'" class="field"><span class="field-label">{{ flowCopy.identity }}</span><select v-model="editor.approverIdentityId" class="field-input" :disabled="blocked || referencesLoading"><option value="">{{ flowCopy.chooseIdentity }}</option><option v-for="item in ruleReferences.identities" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
    <div v-if="editor.ruleType === 'person'" class="field"><span class="field-label">{{ flowCopy.approver }}</span><button type="button" class="field-input" :disabled="blocked || referencesLoading || !!referencesError" @click="approverPicker = true">{{ selectedApprover ? selectedApprover.name + ' · ' + selectedApprover.assignmentLabel : flowCopy.chooseApprover }}</button></div>
    <label class="field"><span class="field-label">{{ flowCopy.department }}</span><select v-model="editor.scopeDepartmentId" class="field-input" :disabled="blocked || referencesLoading" @change="editor.scopeWorkGroupId = ''"><option value="">{{ flowCopy.allDepartments }}</option><option v-for="item in ruleReferences.departments" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
    <label class="field"><span class="field-label">{{ flowCopy.workGroup }}</span><select v-model="editor.scopeWorkGroupId" class="field-input" :disabled="blocked || referencesLoading"><option value="">{{ flowCopy.allWorkGroups }}</option><option v-for="item in ruleReferences.workGroups.filter(item => !editor.scopeDepartmentId || item.departmentId === editor.scopeDepartmentId)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
    <p v-if="notice" role="alert" class="notice-line">{{ notice }}</p><template v-if="loadNotice"><p role="alert" class="notice-line">{{ loadNotice }}</p><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ copy.common.retry }}</button></template>
    <template #footer><button type="button" class="btn btn-primary" :disabled="blocked || referencesLoading || !!referencesError" @click="saveRule">{{ ui.copy_f7597cecf5 }}</button></template>
  </GlassDialog>
  <PersonnelPicker v-if="approverPicker && editor?.type === 'rule'" :title="flowCopy.chooseApprover" :multiple="false" :options="ruleReferences.assignments" :value="selectedApprover ? [selectedApprover] : []" @cancel="approverPicker = false" @confirm="chooseRuleApprover" />
</template>
<script setup>
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
const canDeleteRecord = useAdminCapability('venue.approvals.delete', 'venue.approvals.delete');
const canWriteRecord = useAdminCapability('venue.approvals', 'venue.approvals.update');
const canCreateFlow = useAdminCapability('venue.approvals', 'venue.approvals.create');
const canReadFlow = useAdminCapability('venue.approvals', 'venue.approvals.read');
const canCreateRule = useAdminCapability('venue.approvals', 'venue.bookingRules.create');
const canUpdateRule = useAdminCapability('venue.approvals', 'venue.bookingRules.update');
const canDeleteRule = useAdminCapability('venue.approvals.delete', 'venue.bookingRules.delete');
const canReadRule = useAdminCapability('venue.approvals', 'venue.bookingRules.read');
const canWriteWindow = useAdminCapability('venue.approvals', 'venue.bookingWindows.create');
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import UiSwitch from '@/components/UiSwitch.vue';
import PersonnelPicker from '@/components/PersonnelPicker.vue';
import VenueFlowEditor from '@/components/VenueFlowEditor.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import flowCopy from '@/locales/zh-CN/shared/venueFlowManagement.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { bookingWindowForm, clone } from '@/runtime/venueRules.js';
import { session } from '@/runtime/session.js';
import { useCopiedConfigurationEditor } from '@/runtime/copiedConfigurationEditor.js';
const props = defineProps({ venue: Object, windowValue: Object });
const emit = defineEmits(['busy', 'editing']);
const flows = ref([]), rules = ref([]), editor = ref(null), loading = ref(false), busy = ref(false), loadNotice = ref(''), notice = ref(''), awaitingRead = ref(false);
const ruleReferences = ref({ assignments: [], identities: [], departments: [], workGroups: [] });
const referencesLoading = ref(false), referencesError = ref(''), approverPicker = ref(false);
const selectedApprover = computed(() => ruleReferences.value.assignments.find(item => item.assignmentId === editor.value?.approverAssignmentId));
let referencesGeneration = 0;
const blocked = computed(() => busy.value || loading.value || !!loadNotice.value || awaitingRead.value);
const flags = [{ key: 'allow_user_select', label: ui.copy_6f806672e2 }, { key: 'allow_designate_first', label: ui.allowDesignateFirstApprover }, { key: 'allow_designate_next', label: ui.allowDesignateNextApprover }];
const ruleLabels = { direct: ui.copy_4f15bb9939, admin: ui.copy_af20193574, identity: ui.copy_fa045c9cde, person: ui.copy_777a6a2574 };
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|'); const originalScope = scope(); let disposed = false, generation = 0;
const current = () => !disposed && scope() === originalScope;
async function load() {
  const request = ++generation; loading.value = true;
  try {
    const [flowResult, ruleResult] = await Promise.all([
      canReadFlow.value ? callApi('listVenueApprovalFlows', { venueId: props.venue.id, includeInactive: true }).then(requireSuccess) : { flows: [] },
      canReadRule.value ? callApi('listVenueBookingRules', { venueId: props.venue.id, includeInactive: true }).then(requireSuccess) : { rules: [] }
    ]);
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
function closeEditor() { if (!busy.value && !awaitingRead.value) { editor.value = null; approverPicker.value = false; referencesGeneration++; } }
async function loadRuleReferences() {
  const request = ++referencesGeneration; referencesLoading.value = true; referencesError.value = '';
  try {
    const result = requireSuccess(await callApi('getVenueRuleCandidates', {}));
    if (!current() || request !== referencesGeneration || editor.value?.type !== 'rule') return;
    if (['assignments', 'identities', 'departments', 'workGroups'].some(key => !Array.isArray(result[key]))) throw new Error();
    ruleReferences.value = result;
  } catch (error) {
    if (current() && request === referencesGeneration) referencesError.value = errorText(error, ui.copy_e52119b17e);
  } finally { if (current() && request === referencesGeneration) referencesLoading.value = false; }
}
function chooseRuleApprover(items) {
  if (!editor.value || blocked.value) return;
  editor.value.approverAssignmentId = items[0]?.assignmentId || '';
  editor.value.approverHrId = items[0]?.hrId || '';
  approverPicker.value = false;
}
function editRule(rule = {}) {
  if (blocked.value || !(rule.id ? canUpdateRule.value : canCreateRule.value)) return;
  editor.value = { type: 'rule', id: rule.id || '', ruleType: rule.rule_type || 'admin',
    originalRuleType: rule.rule_type || 'admin', isActive: Number(rule.is_active) !== 0,
    approverIdentityId: rule.approver_identity_id || '', approverHrId: rule.approver_hr_id || '',
    approverAssignmentId: rule.approver_assignment_id || '',
    scopeDepartmentId: rule.scope_department_id || '', scopeWorkGroupId: rule.scope_work_group_id || '',
    sortOrder: rule.sort_order };
  notice.value = '';
  loadRuleReferences();
}
function readNatureIds(rule){const value=rule.natureIds==null?rule.nature_ids:rule.natureIds;if(value==null)return null;if(Array.isArray(value))return value;try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return [];}}
function editFlow(flow = {}) {
  if (blocked.value || !(flow.id ? canWriteRecord.value : canCreateFlow.value)) return;
  editor.value = { type: 'flow', id: flow.id || '', name: flow.name || ui.copy_9835b165c7, isActive: Number(flow.is_active) !== 0,
    allowUserSelect: Number(flow.allow_user_select) === 1, allowDesignateFirst: Number(flow.allow_designate_first) === 1, allowDesignateNext: Number(flow.allow_designate_next) === 1,
    steps: (flow.steps || []).map(step => ({ name: step.name || '', approvalMode: step.approval_mode, rules: (step.rules || []).map(rule => ({ natureIds:readNatureIds(rule),departmentScope: rule.department_scope || 'all', specificDepartmentId: rule.specific_department_id || '', workGroupScope: rule.work_group_scope || 'all', specificWorkGroupId: rule.specific_work_group_id || '', identityScope: rule.identity_scope || 'all', specificIdentityId: rule.specific_identity_id || '' })) })) };
  notice.value = '';
}
async function write(name, data, confirmation) {
  const permitted = () => ({ saveVenueApprovalWholeFlow: data.flowId ? canWriteRecord.value : canCreateFlow.value,
    saveVenueApprovalFlowMeta: canWriteRecord.value, saveVenueBookingRule: data.id ? canUpdateRule.value : canCreateRule.value,
    deleteVenueApprovalFlow: canDeleteRecord.value, deleteVenueBookingRule: canDeleteRule.value })[name] === true;
  if (blocked.value || !current() || !permitted()) return;
  busy.value = true; notice.value = '';
  try {
    if (confirmation && !await confirmAction({ title: confirmation.title || ui.copy_7f31eec657, body: confirmation.body, danger: true, confirmText: copy.common.confirm, cancelText: copy.common.cancel })) return;
    if (!current() || !permitted()) return;
    requireSuccess(await callApi(name, data)); if (!current()) return;
    awaitingRead.value = true; await load();
    const successText = { saveVenueApprovalWholeFlow: ui.approvalFlowSaved, saveVenueApprovalFlowMeta: ui.approvalFlowSaved,
      saveVenueBookingRule: ui.bookingRuleSaved, deleteVenueApprovalFlow: ui.approvalFlowDeleted, deleteVenueBookingRule: ui.bookingRuleDeleted }[name];
    if (current() && successText) showToast(successText);
  } catch (error) { if (current()) notice.value = errorText(error, ui.copy_215e3c57da); }
  finally { if (current()) busy.value = false; }
}
function saveFlow() {
  const value = clone(editor.value);
  if (!value.steps.length) { notice.value = ui.copy_7ae01e1929; return; }
  return write('saveVenueApprovalWholeFlow', { venueId: props.venue.id, flowId: value.id, flowName: value.name,
    allowUserSelect: value.allowUserSelect, allowDesignateFirst: value.allowDesignateFirst, allowDesignateNext: value.allowDesignateNext,
    steps: value.steps.map((step, index) => ({ name: step.name, sortOrder: index + 1, approvalMode: step.rules.length ? 'hr_rule' : 'admin_any', rules: step.rules })), ...(canWriteWindow.value ? { bookingWindow: clone(props.windowValue) } : {}) },
    value.isActive && rules.value.some(rule => rule.rule_type === 'direct' && Number(rule.is_active) !== 0) ? { title: flowCopy.switchTitle, body: flowCopy.directToFlow } : null);
}
function saveRule() {
  if (referencesLoading.value || referencesError.value) return;
  const value = clone(editor.value);
  return write('saveVenueBookingRule', { id: value.id, venueId: props.venue.id, ruleType: value.ruleType,
    approverIdentityId: value.approverIdentityId, approverHrId: value.approverHrId,
    approverAssignmentId: value.approverAssignmentId, scopeDepartmentId: value.scopeDepartmentId,
    scopeWorkGroupId: value.scopeWorkGroupId, sortOrder: value.sortOrder, ...(canWriteWindow.value ? { bookingWindow: clone(props.windowValue) } : {}) },
  value.isActive && value.ruleType === 'direct' && flows.value.some(flow => Number(flow.is_active) !== 0)
    ? { title: flowCopy.switchTitle, body: flowCopy.flowToDirect } : null);
}
function removeFlow(flow) { return write('deleteVenueApprovalFlow', { flowId: flow.id, venueId: props.venue.id }, { body: flow.name + '\n' + ui.copy_19aa0fdb46 }); }
function removeRule(rule) { return write('deleteVenueBookingRule', { id: rule.id }, { body: props.venue.name + ' · ' + ruleLabels[rule.rule_type] }); }
function toggleFlag(flow, key, checked) {
  const payload = { venueId: props.venue.id, flowId: flow.id, name: flow.name, allowUserSelect: Number(flow.allow_user_select) === 1, allowDesignateFirst: Number(flow.allow_designate_first) === 1, allowDesignateNext: Number(flow.allow_designate_next) === 1 };
  payload[{ allow_user_select: 'allowUserSelect', allow_designate_first: 'allowDesignateFirst', allow_designate_next: 'allowDesignateNext' }[key]] = checked;
  return write('saveVenueApprovalFlowMeta', payload);
}
useCopiedConfigurationEditor({ kind: () => 'venue.approvals', rows: flows, blocked: () => blocked.value || !canWriteRecord.value,
  ready: () => !loading.value && !loadNotice.value, edit: editFlow, notice });
useCopiedConfigurationEditor({ kind: () => 'venue.bookingRules', rows: rules, blocked: () => blocked.value || !canUpdateRule.value,
  ready: () => !loading.value && !loadNotice.value, edit: editRule, notice });
watch([busy, awaitingRead], () => emit('busy', busy.value || awaitingRead.value), { flush: 'sync' });
watch(editor, value => emit('editing', !!value), { flush: 'sync' });
load(); onBeforeUnmount(() => { disposed = true; generation++; emit('busy', false); emit('editing', false); });
</script>
<style scoped>
.approval-row { flex-direction: column; align-items: stretch; gap: var(--ui-field-gap); }
</style>
