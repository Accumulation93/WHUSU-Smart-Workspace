<template>
  <div class="stack">
    <section class="card stack"><span class="section-title">{{ ui.copy_5a49161fd7 }}</span><div v-if="loadNotice" class="stack-tight" role="alert"><span>{{ loadNotice }}</span><button type="button" class="btn-quiet" :disabled="loading || busy" @click="load">{{ personnel.dictionaryRetry }}</button></div></section>
    <form v-if="canWriteRecord" ref="editor" class="card stack" @submit.prevent="save">
      <span class="list-row-title">{{ form.id ? ui.copy_eab3f6240f : ui.copy_f288d821cd }}</span>
      <label class="field"><span class="field-label">{{ ui.copy_a8f6e57e29 }}</span><input v-model="form.name" class="field-input" :placeholder="ui.copy_83a484a00c" :disabled="blocked" /></label>
      <label class="field"><span class="field-label">{{ ui.copy_512d095db5 }}</span><textarea v-model="form.description" class="field-input" :placeholder="ui.copy_26488e08c1" :disabled="blocked" /></label>
      <span class="list-row-title">{{ ui.copy_2dec661391 }}</span>
      <p v-if="!form.questions.length" class="muted">{{ ui.copy_5e053dd2d0 }}</p>
      <div ref="pane" class="question-pane stack">
        <article v-for="(question,index) in form.questions" :key="question.key" class="list-row question-card" :data-question-key="question.key" :class="{'question-dragging':drag.state.source === index,'question-target':drag.state.active && drag.state.target === index}">
          <div class="question-head">
            <button type="button" class="btn-quiet drag-handle" :aria-label="ui.copy_6efebc1cc6 + ' ' + (index + 1)" :disabled="blocked" @pointerdown="drag.down($event,index)" @pointermove="drag.move" @pointerup="drag.up" @pointercancel="drag.cancel" @lostpointercapture="drag.cancel">≡</button>
            <button type="button" class="btn-quiet question-expand" :disabled="blocked || drag.state.active" :aria-expanded="expanded === question.key" @click="expanded = expanded === question.key ? null : question.key">{{ ui.copy_6efebc1cc6 }} {{ index + 1 }} {{ expanded === question.key ? '▲' : '▼' }}</button>
            <div class="row"><button type="button" class="btn-quiet" :disabled="blocked || index === 0 || drag.state.active" @click="move(index,index-1)">↑</button><button type="button" class="btn-quiet" :disabled="blocked || index === form.questions.length-1 || drag.state.active" @click="move(index,index+1)">↓</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked || drag.state.active" @click="remove(index)">{{ ui.copy_acc985cabc }}</button></div>
          </div>
          <div v-if="expanded !== question.key" class="stack-tight">
            <button type="button" class="question-preview" :disabled="blocked || drag.state.active" @click="expanded = question.key">{{ question.question || ui.copy_bbaa4d5edb }}</button>
            <div class="row row-wrap"><span v-for="field in numericFields" :key="field.key" class="chip chip-blue">{{ field.short }} {{ question[field.key] }}</span></div>
          </div>
          <div v-else class="stack">
            <label class="field"><span class="field-label">{{ ui.copy_f7736be7ba }}</span><input v-model="question.question" class="field-input" :placeholder="ui.copy_3a1a234d95" :disabled="blocked" /></label>
            <label class="field"><span class="field-label">{{ ui.copy_354e8c46c3 }}</span><textarea v-model="question.scoreLabel" class="field-input" :placeholder="ui.copy_988fd3b654" :disabled="blocked" /></label>
            <div class="question-numbers"><label v-for="field in numericFields" :key="field.key" class="field"><span class="field-label">{{ field.label }}</span><input v-model="question[field.key]" class="field-input" inputmode="decimal" :placeholder="field.placeholder" :disabled="blocked" /></label></div>
          </div>
        </article>
      </div>
      <p v-if="actionNotice && !exportOpen" role="alert">{{ actionNotice }}</p>
      <div class="template-actions"><button type="button" class="btn btn-secondary" :disabled="blocked" @click="add">{{ ui.copy_9d31093860 }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="fileInput.click()">{{ ui.copy_47f9d64667 }}</button><button type="button" class="btn btn-secondary" :disabled="blocked || !form.questions.length" @click="startExport">{{ ui.copy_37b2d47dd4 }}</button><button type="submit" class="btn btn-primary" :disabled="blocked || drag.state.active">{{ busy ? copy.common.loading : ui.copy_7e4100d002 }}</button><button type="button" class="btn btn-secondary" :disabled="blocked" @click="reset">{{ ui.copy_6888d59833 }}</button></div>
      <input ref="fileInput" class="file-input" type="file" accept=".csv,.xlsx" @change="importFile" />
    </form>
    <section class="card stack"><span class="section-title">{{ ui.copy_c0ad13da27 }}</span><p v-if="loading && !rows.length" class="empty-state">{{ copy.common.loading }}</p><div class="list"><article v-for="row in rows" :key="row.id" class="list-row question-card"><strong>{{ row.name }}</strong><span v-if="row.description" class="muted break-all">{{ row.description }}</span><span class="muted">{{ ui.copy_5b54c6c107 }}{{ row.questionCount }}</span><div class="card-actions"><button type="button" class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="act(row,'duplicate')">{{ ui.copy_fbf1856932 }}</button><button type="button" class="btn-quiet" :disabled="blocked" v-if="canWriteRecord" @click="edit(row)">{{ ui.copy_e040ae3016 }}</button><button type="button" class="btn-quiet btn-quiet-danger" :disabled="blocked" v-if="canDeleteRecord" @click="act(row,'delete')">{{ ui.copy_acc985cabc }}</button></div></article></div></section>
    <GlassDialog v-if="sheets.length" :title="sourceName" @close="sheets=[]"><div class="stack"><button v-for="(sheet,index) in sheets" :key="index" type="button" class="selection-option-card" @click="chooseSheet(sheet)">{{ sheet.name }}</button></div></GlassDialog>
    <GlassDialog v-if="table" :title="ui.copy_0601453416" @close="table=null"><div class="stack"><p>{{ ui.copy_03cf7db777 }}</p><article v-for="(header,index) in table.headers" :key="index" class="list-row question-card mapping-row"><strong>{{ header }}</strong><span class="muted">{{ ui.copy_51996ace76 }} · {{ questionFields.find(field=>field.key === mapping[index])?.label || '—' }}</span><button type="button" class="question-preview" :aria-label="ui.copy_84c222ed0d" @click="sample=sampleFor(index)">{{ ui.copy_7efbce059c }} · {{ sampleFor(index) || '—' }}</button><label class="field"><span class="field-label">{{ ui.copy_9c0e348f1b }} · {{ header }}</span><select v-model="mapping[index]" class="field-input" :aria-label="ui.copy_9c0e348f1b + ' · ' + header"><option value="">{{ messages.copy_26eba7c49d }}</option><option v-for="field in questionFields" :key="field.key" :value="field.key">{{ field.label }}</option></select></label></article><div class="row"><span>{{ ui.copy_c1f37f0512 }}</span><UiSwitch :checked="replaceMode" :label="ui.copy_c1f37f0512" @change="replaceMode = $event.target.checked" /></div><span class="muted">{{ ui.copy_6b529b32de }}</span><p v-if="importNotice" role="alert">{{ importNotice }}</p></div><template #footer><div class="template-actions"><button type="button" class="btn btn-secondary" @click="table=null">{{ ui.copy_06dbb49961 }}</button><button type="button" class="btn btn-primary" @click="confirmImport">{{ ui.copy_b35531a5fd }}</button></div></template></GlassDialog>
    <GlassDialog v-if="sample !== null" compact :title="ui.copy_84c222ed0d" @close="sample=null"><p class="break-all">{{ sample }}</p></GlassDialog>
    <GlassDialog v-if="exportOpen" compact :busy="busy" :title="ui.copy_37b2d47dd4" @close="exportOpen=false"><div class="stack"><p v-if="actionNotice" role="alert">{{ actionNotice }}</p><button type="button" class="btn btn-secondary" :disabled="busy" @click="exportFile('csv')">{{ messages.copy_7ffcbc33aa }}</button><button type="button" class="btn btn-secondary" :disabled="busy" @click="exportFile('xlsx')">{{ messages.copy_5503123f4c }}</button></div></GlassDialog>
    <Teleport to="body"><article v-if="drag.state.active" class="list-row question-card question-ghost" :style="drag.state.style"><strong>{{ ui.copy_6efebc1cc6 }} {{ drag.state.source + 1 }}</strong><span class="break-all">{{ drag.state.question.question || ui.copy_bbaa4d5edb }}</span></article></Teleport>
  </div>
</template>
<script setup>
import { useAdminCapability } from '@/runtime/adminCapabilities.js';
const canDeleteRecord = useAdminCapability('scoring.templates.delete');
const canWriteRecord = useAdminCapability('scoring.templates');
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import GlassDialog from './GlassDialog.vue';
import UiSwitch from './UiSwitch.vue';
import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/templateBehavior.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import fileCopy from '@/locales/zh-CN/shared/generated/utils/tableFile.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
import { emptyTemplateForm, questionForForm, questionPayload, questionFields, mapQuestionColumns, questionsFromTable } from '@/runtime/templateQuestions.js';
import { buildCsv, readTable, downloadTable } from '@/runtime/tableFiles.js';
import { useQuestionDrag } from '@/runtime/questionDrag.js';
const props = defineProps({ disabled: Boolean, state: { type: Object, required: true } });
const emit = defineEmits(['busy']);
const form = computed(() => props.state.form), questions = computed(() => form.value.questions);
const rows = ref([]), loading = ref(false), busy = ref(false), loadNotice = ref(''), actionNotice = ref('');
const expanded = computed({get:()=>props.state.expanded,set:value=>{props.state.expanded=value;}}), editor = ref(null), pane = ref(null), fileInput = ref(null);
const sheets = ref([]), table = ref(null), mapping = ref({}), replaceMode = ref(true), importNotice = ref(''), sample = ref(null), exportOpen = ref(false), sourceName = ref('');
const blocked = computed(() => props.disabled || loading.value || busy.value || !!loadNotice.value || props.state.resetAfterRead);
const drag = useQuestionDrag(pane, questions, blocked, move);
const numericFields = [
  {key:'minValue',label:ui.copy_14be892ef9,short:ui.copy_6c0ce64188,placeholder:ui.numericZeroPlaceholder},
  {key:'startValue',label:ui.copy_6cc2ee6bc8,short:ui.copy_237b08549b,placeholder:ui.numericZeroPlaceholder},
  {key:'maxValue',label:ui.copy_ee368e39ca,short:ui.copy_97dcf751c6,placeholder:ui.numericTenPlaceholder},
  {key:'stepValue',label:ui.copy_a9da08c33e,short:ui.copy_358c64db1a,placeholder:ui.numericHalfPlaceholder}
];
let generation = 0, disposed = false;
const scope = () => [session.context?.organizationId,session.context?.contextId].join('|');
async function reveal(key) { await nextTick(); pane.value?.querySelector('[data-question-key="'+key+'"]')?.scrollIntoView({block:'nearest'}); }
function reset() { Object.assign(form.value,emptyTemplateForm()); expanded.value=null; actionNotice.value=''; }
async function add() { if(blocked.value)return; const question=questionForForm(); form.value.questions.push(question); expanded.value=question.key; await reveal(question.key); }
function remove(index) { if(blocked.value)return; if(expanded.value === form.value.questions[index]?.key)expanded.value=null; form.value.questions.splice(index,1); }
function move(from,to) { if(blocked.value || to<0 || to>=questions.value.length)return; const [question]=questions.value.splice(from,1); questions.value.splice(to,0,question); reveal(question.key); }
async function edit(row) { if(blocked.value)return; Object.assign(form.value,{id:row.id,name:row.name,description:row.description||'',questions:row.questions.length ? row.questions.map(questionForForm) : [questionForForm()]}); expanded.value=null; actionNotice.value=''; await nextTick(); editor.value?.scrollIntoView({block:'start'}); }
async function load() {
  const request=++generation,expected=scope(); const current=()=>!disposed && request===generation && expected===scope(); loading.value=true;
  try { const result=requireSuccess(await callApi('listScoreTemplates',{})); if(!current())return false;
    if(!Array.isArray(result.list) || result.list.some(row=>!row || !Array.isArray(row.questions) || row.questions.some(question=>!question || typeof question !== 'object' || Array.isArray(question))))throw new Error();
    rows.value=result.list; loadNotice.value=''; if(props.state.resetAfterRead){props.state.resetAfterRead=false;reset();} return true;
  } catch(error){if(current())loadNotice.value=errorText(error,messages.copy_d6b9c2f034);return false;} finally{if(current())loading.value=false;}
}
async function save() {
  if(blocked.value || drag.state.active)return;
  if(!form.value.name.trim()){actionNotice.value=messages.copy_9a51765619;return;}
  if(!questions.value.length){actionNotice.value=messages.copy_d976fb44d6;return;}
  const payload=questions.value.map(questionPayload);
  for(let index=0;index<payload.length;index++){
    const q=payload[index]; let error=!q.question ? messages.copy_e6653bb300 : !q.maxValue || !Number.isFinite(Number(q.maxValue)) || Number(q.maxValue)<=0 ? messages.copy_17bbfdd98a : !q.minValue || !Number.isFinite(Number(q.minValue)) || Number(q.minValue)>=Number(q.maxValue) ? messages.copy_232398a03b : !q.stepValue || !Number.isFinite(Number(q.stepValue)) || Number(q.stepValue)<=0 ? messages.copy_5746413c3a : '';
    if(error){expanded.value=questions.value[index].key;actionNotice.value=messages.copy_93c50c01c0+(index+1)+messages.copy_266a08601e+error;await reveal(expanded.value);return;}
  }
  const expected=scope();busy.value=true;actionNotice.value='';
  try{requireSuccess(await callApi('saveScoreTemplate',{id:form.value.id,name:form.value.name.trim(),description:form.value.description,questions:payload}));if(disposed || expected!==scope())return;props.state.resetAfterRead=true;await load();if(!disposed && expected===scope())showToast(messages.copy_743b13ea1b);}
  catch(error){if(!disposed && expected===scope())actionNotice.value=errorText(error,messages.copy_215e3c57da);}finally{if(!disposed && expected===scope())busy.value=false;}
}
async function act(row,action){
  if(blocked.value)return;const target={id:row.id,name:row.name},expected=scope();const current=()=>!disposed && expected===scope();busy.value=true;actionNotice.value='';
  try{if(action==='delete'){const confirmed=await confirmAction({title:messages.copy_697796da96,body:target.name+'\n'+messages.copy_4e5413a807,danger:true,confirmText:copy.common.confirm,cancelText:copy.common.cancel});if(!confirmed || !current() || props.disabled)return;}
    requireSuccess(await callApi(action==='delete'?'deleteScoreTemplate':'duplicateScoreTemplate',{id:target.id}));if(!current())return;
    if(action==='delete' && form.value.id===target.id)reset();await load();if(current())showToast(action==='delete'?messages.copy_cf540b4349:messages.copy_e1035ed73b);
  }catch(error){if(current())actionNotice.value=errorText(error,action==='delete'?messages.copy_076bb5d383:messages.copy_b433d31323);}finally{if(current())busy.value=false;}
}
async function importFile(event){
  const file=event.target.files?.[0];event.target.value='';if(!file || blocked.value)return;const expected=scope();busy.value=true;actionNotice.value='';
  try{const choices=await readTable(file);if(disposed || expected!==scope())return;if(!choices.length)throw new Error(messages.copy_d2791c48ce);sourceName.value=file.name;
    const name=file.name.replace(/\.(xlsx?|xls|csv)$/i,'');if(!form.value.name.trim())form.value.name=name;if(!form.value.description.trim())form.value.description=name;
    if(choices.length===1)chooseSheet(choices[0]);else sheets.value=choices;
  }catch(error){if(!disposed && expected===scope())actionNotice.value=error.status || Object.values(fileCopy).includes(error.message) ? errorText(error,messages.copy_03d69a9d28) : messages.copy_03d69a9d28;}finally{if(!disposed && expected===scope())busy.value=false;}
}
function chooseSheet(sheet){sheets.value=[];table.value=sheet;mapping.value=mapQuestionColumns(sheet.headers);replaceMode.value=true;importNotice.value='';}
function sampleFor(index){return table.value?.rows.slice(0,5).map(row=>String(row[index]??'')).filter(Boolean).slice(0,3).join(', ')||'';}
function confirmImport(){
  const imported=questionsFromTable(table.value.rows,mapping.value);if(!imported){importNotice.value=messages.copy_da19b42124;return;}if(!imported.length){importNotice.value=messages.copy_d1f2f20702;return;}
  form.value.questions=replaceMode.value?imported:form.value.questions.concat(imported);expanded.value=null;table.value=null;showToast(messages.copy_4c8603086a+imported.length+messages.copy_9ff661a507);
}
function startExport(){if(!blocked.value){actionNotice.value='';exportOpen.value=true;}}
async function exportFile(extension){
  if(blocked.value)return;const expected=scope(),payload=questions.value.map(questionPayload);busy.value=true;
  try{const content=extension==='csv'?buildCsv(questionFields,payload):requireSuccess(await callApi('buildTableFile',{headers:questionFields.map(({key,label})=>({key,label})),rows:payload,sheetName:messages.copy_fac1711a09})).fileBase64;
    if(disposed || expected!==scope())return;if(!content)throw new Error();downloadTable(content,messages.copy_44db0286b0,extension);exportOpen.value=false;
  }catch(error){if(!disposed && expected===scope())actionNotice.value=error.status ? errorText(error,messages.copy_2b61466286) : messages.copy_2b61466286;}finally{if(!disposed && expected===scope())busy.value=false;}
}
watch(()=>busy.value || drag.state.active,value=>emit('busy',value),{flush:'sync'});
watch(scope,load,{immediate:true});onBeforeUnmount(()=>{disposed=true;generation++;emit('busy',false);});
</script>
<style scoped>
.question-card { flex:none;flex-direction:column;align-items:stretch;gap:var(--ui-inline-gap);min-width:0; }
.question-pane { max-height:var(--ui-template-list-max-height);overflow-y:auto;overscroll-behavior:contain; }
.question-head { display:flex;align-items:center;gap:var(--ui-inline-gap);min-width:0; }
.question-head .row { gap:var(--ui-score-key-gap);flex:none; }
.question-expand { flex:1;min-width:0; }
.drag-handle { touch-action:none;flex:none; }
.question-preview { background:transparent;border:0;padding:0;text-align:left;color:var(--ui-text);font:inherit;line-height:var(--ui-leading-body);cursor:pointer;overflow-wrap:anywhere; }
.question-numbers,.template-actions { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-inline-gap); }
.question-dragging { opacity:var(--ui-disabled-opacity); }
.question-target { border-color:var(--ui-blue-700); }
.question-ghost { position:fixed;z-index:var(--ui-template-drag-layer);pointer-events:none;box-sizing:border-box; }
.file-input { display:none; }
.mapping-row > * { min-width:0;overflow-wrap:anywhere; }
form { scroll-margin-top:var(--ui-navbar-height); }
@media (min-width:520px) { .mapping-row { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:start; } }
</style>
