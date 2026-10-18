<template>
  <GlassDialog :title="ui.copy_20f94d2c18 + ui.copy_a9a18dd6e8" :busy="busy" @close="$emit('close')">
    <p class="muted">{{ ui.copy_9c9358d025 }}</p>
    <div v-for="(item, index) in value.steps" :key="index" class="list-row step-card">
      <div class="row row-wrap"><strong>{{ ui.copy_ef8b7ffa9b }}{{ index + 1 }}{{ ui.copy_9e545997b0 }}</strong><strong class="break-all">{{ item.name }}</strong></div>
      <div class="row row-wrap"><button v-if="index > 0" type="button" class="btn-quiet" :disabled="disabled" @click="move(index, -1)">{{ ui.copy_79b93c0b36 }}</button><button v-if="index + 1 < value.steps.length" type="button" class="btn-quiet" :disabled="disabled" @click="move(index, 1)">{{ ui.copy_7df1ffb06a }}</button><button type="button" class="btn-quiet" :disabled="disabled" @click="editStep(index)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="disabled" @click="value.steps.splice(index, 1)">{{ ui.copy_acc985cabc }}</button></div>
      <p v-if="!item.rules.length" class="muted">{{ ui.copy_b856d92ba6 }}</p>
      <div v-for="(rule, ruleIndex) in item.rules" :key="ruleIndex" class="condition-summary"><strong>{{ ui.copy_96aab98a23 }}</strong><div v-for="field in fields" :key="field.key" class="condition-line"><span class="muted">{{ field.label }}</span><span class="break-all">{{ summary(rule, field) }}</span></div></div>
    </div>
    <button type="button" class="btn btn-secondary" :disabled="disabled" @click="editStep(-1)">+ {{ ui.copy_7963fb24a5 }}</button>
    <div v-if="step && !condition" ref="stepEditor" class="list-row step-card">
      <strong>{{ stepIndex < 0 ? ui.copy_904f6072c4 : ui.copy_16fc906860 }}</strong>
      <label class="field"><span class="field-label">{{ ui.copy_c5dd070c37 }}</span><input v-model="step.name" class="field-input" :placeholder="ui.copy_ac4d7a45e0" :disabled="disabled" /></label>
      <span class="field-label">{{ ui.copy_97d10704ef }}</span>
      <p v-if="!step.rules.length" class="muted">{{ ui.copy_7ae01e1929 }}</p>
      <div v-for="(rule, index) in step.rules" :key="index" class="condition-summary"><strong>{{ ui.copy_7de8083e58 }}</strong><div v-for="field in fields" :key="field.key" class="condition-line"><span class="muted">{{ field.label }}</span><span class="break-all">{{ summary(rule, field) }}</span></div><div class="row row-wrap"><button type="button" class="btn-quiet" :disabled="disabled" @click="editCondition(index)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="disabled" @click="step.rules.splice(index, 1)">{{ ui.copy_acc985cabc }}</button></div></div>
      <button type="button" class="btn btn-secondary" :disabled="disabled" @click="editCondition(-1)">+ {{ ui.copy_e36c6c6875 }}</button>
      <div class="editor-actions"><button type="button" class="btn btn-secondary" :disabled="disabled" @click="step = null">{{ ui.copy_06dbb49961 }}</button><button type="button" class="btn btn-primary" :disabled="disabled" @click="saveStep">{{ ui.copy_2fda3d6579 }}</button></div>
    </div>
    <div v-if="condition" ref="conditionEditor" class="list-row step-card">
      <strong>{{ conditionIndex < 0 ? ui.copy_64af7c9964 : ui.copy_49c0b6fb34 }}</strong><span>{{ step.name }}</span>
      <div v-for="field in fields" :key="field.key" class="field">
        <span class="field-label">{{ field.label }}</span><span class="muted">{{ field.hint }}</span>
        <select :value="condition[field.scope]" class="field-input" :aria-label="field.label" :disabled="disabled" @change="condition[field.scope] = $event.target.value; condition[field.ids] = ''"><option value="all">{{ ui.copy_31d4595959 }}</option><option value="same">{{ field.same }}</option><option value="specific">{{ field.specific }}</option></select>
        <div v-if="condition[field.scope] === 'specific'" class="row"><button type="button" class="field-input scope-picker" :disabled="disabled || referenceLoading || !!referenceNotice" @click="picker = field">{{ summary(condition, field) || field.choose }}</button><button type="button" class="btn-quiet" :disabled="disabled" @click="condition[field.ids] = ''">{{ ui.copy_2a0e50c5f6 }}</button></div>
      </div>
      <div class="editor-actions"><button type="button" class="btn btn-secondary" :disabled="disabled" @click="condition = null">{{ ui.copy_06dbb49961 }}</button><button type="button" class="btn btn-primary" :disabled="disabled || referenceLoading || !!referenceNotice" @click="saveCondition">{{ ui.copy_f7597cecf5 }}</button></div>
    </div>
    <p v-if="referenceLoading" class="muted"><AppLoading :text="copy.common.loading" /></p><template v-if="referenceNotice"><p role="alert" class="notice-line">{{ referenceNotice }}</p><button type="button" class="btn-quiet" :disabled="referenceLoading || busy" @click="loadReferences">{{ copy.common.retry }}</button></template>
    <p v-if="notice" role="alert" class="notice-line">{{ notice }}</p><slot />
    <template #footer><button type="button" class="btn btn-primary" :disabled="disabled || !!step || !!condition || referenceLoading || !!referenceNotice" @click="$emit('save')">{{ ui.copy_f7597cecf5 }}</button></template>
  </GlassDialog>
  <DictionaryPicker v-if="picker" :title="picker.title" :options="references[picker.key]" :value="ids(condition[picker.ids])" :departments="picker.key === 'workGroups' && condition.departmentScope === 'specific' ? references.departments.filter(item => ids(condition.specificDepartmentId).includes(item.id)) : []" @cancel="picker = null" @confirm="condition[picker.ids] = $event.join(','); picker = null" />
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue';
import GlassDialog from '@/components/GlassDialog.vue';
import DictionaryPicker from '@/components/DictionaryPicker.vue';
import copy from '@/locales/zh-CN/index.js';
import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import controls from '@/locales/zh-CN/shared/controlLayout.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { clone } from '@/runtime/venueRules.js';
import { session } from '@/runtime/session.js';
const props = defineProps({ value: { type: Object, required: true }, busy: Boolean, disabled: Boolean });
defineEmits(['close', 'save']);
const fields = [
  { key: 'departments', scope: 'departmentScope', ids: 'specificDepartmentId', label: ui.copy_02419589be, hint: ui.copy_1557dfea5c, same: ui.copy_bb2dcb8a98, specific: ui.copy_b3604f443f, choose: ui.copy_42c145fb7a, title: ui.copy_6ee8d85d0a },
  { key: 'workGroups', scope: 'workGroupScope', ids: 'specificWorkGroupId', label: ui.copy_303b7a8611, hint: ui.copy_89a1221d70, same: ui.copy_9384e056f9, specific: ui.copy_258347beac, choose: ui.copy_e5b5701d94, title: ui.copy_eed7859498 },
  { key: 'identities', scope: 'identityScope', ids: 'specificIdentityId', label: ui.copy_c1965e0690, hint: ui.copy_af50edfca3, same: ui.copy_1deb0dba7e, specific: ui.copy_640342a015, choose: ui.copy_0cedad90e4, title: ui.copy_43c26e4c16 }
];
const references = ref({ departments: [], workGroups: [], identities: [] }), referenceLoading = ref(false), referenceNotice = ref('');
const step = ref(null), stepIndex = ref(null), condition = ref(null), conditionIndex = ref(null), picker = ref(null), notice = ref('');
const stepEditor = ref(null), conditionEditor = ref(null);
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|'); const originalScope = scope(); let disposed = false, generation = 0;
const ids = text => String(text || '').split(',').map(value => value.trim()).filter(Boolean);
function summary(rule, field) {
  if (rule[field.scope] === 'same') return field.same;
  if (rule[field.scope] !== 'specific') return ui.copy_62676bc383;
  return ids(rule[field.ids]).map(id => references.value[field.key].find(item => String(item.id) === id)?.name || ui.copy_8bc3aa5b58).join(controls.listSeparator);
}
async function reveal(element) { await nextTick(); element.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
function editStep(index) { stepIndex.value = index; step.value = index < 0 ? { name: '', rules: [] } : clone(props.value.steps[index]); condition.value = null; notice.value = ''; reveal(stepEditor); }
function saveStep() {
  if (!step.value.name.trim()) { notice.value = ui.copy_1376e7cf03; return; }
  const value = clone(step.value); value.name = value.name.trim(); value.approvalMode = value.rules.length ? 'hr_rule' : 'admin_any';
  if (stepIndex.value < 0) props.value.steps.push(value); else props.value.steps[stepIndex.value] = value;
  step.value = null; stepIndex.value = null; notice.value = '';
}
function move(index, delta) { const items = props.value.steps; [items[index], items[index + delta]] = [items[index + delta], items[index]]; }
function editCondition(index) {
  conditionIndex.value = index; condition.value = index < 0 ? { departmentScope: 'all', specificDepartmentId: '', workGroupScope: 'all', specificWorkGroupId: '', identityScope: 'all', specificIdentityId: '' } : clone(step.value.rules[index]); notice.value = ''; reveal(conditionEditor);
}
function saveCondition() {
  if (fields.some(field => condition.value[field.scope] === 'specific' && !ids(condition.value[field.ids]).length)) { notice.value = ui.copy_8bc3aa5b58; return; }
  if (conditionIndex.value < 0) step.value.rules.push(clone(condition.value)); else step.value.rules[conditionIndex.value] = clone(condition.value);
  condition.value = null; conditionIndex.value = null; notice.value = ''; reveal(stepEditor);
}
async function loadReferences() {
  const request = ++generation; referenceLoading.value = true;
  try {
    const results = await Promise.all(['listDepartments', 'listWorkGroups', 'listIdentities'].map(name => callApi(name, {}).then(requireSuccess)));
    if (disposed || originalScope !== scope() || request !== generation) return;
    const next = { departments: results[0].departments, workGroups: results[1].workGroups, identities: results[2].identities };
    if (Object.values(next).some(list => !Array.isArray(list))) throw new Error();
    references.value = next; referenceNotice.value = '';
  } catch (error) { if (!disposed && originalScope === scope() && request === generation) referenceNotice.value = errorText(error, ui.copy_e52119b17e); }
  finally { if (!disposed && request === generation) referenceLoading.value = false; }
}
loadReferences(); onBeforeUnmount(() => { disposed = true; generation++; });
</script>
<style scoped>
.step-card { flex-direction: column; align-items: stretch; gap: var(--ui-field-gap); }
.condition-summary { display: flex; flex-direction: column; gap: var(--ui-label-gap); border-left: var(--ui-field-border); padding-left: var(--ui-control-padding-x); }
.condition-line { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--ui-inline-gap); }
.editor-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.scope-picker { flex: 1; min-width: 0; text-align: left; cursor: pointer; white-space: normal; }
</style>
