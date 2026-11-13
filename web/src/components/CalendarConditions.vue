<template>
  <section class="calendar-condition-stack">
    <p v-if="participants" class="muted">{{ copy.participantSourcesHelp }}</p>
    <div v-for="(clause,index) in modelValue" :id="'calendar-source-' + index" :key="index" class="list-row calendar-condition-card">
      <template v-if="participants"><span v-for="line in summary(clause)" :key="line" class="muted">{{ line }}</span><div class="card-actions calendar-source-actions"><button v-if="activeIndex !== index" type="button" class="btn btn-secondary calendar-condition-action" :disabled="disabled" @click="activeIndex = index">{{ copy.editParticipantSource }}</button><button type="button" class="btn btn-secondary calendar-condition-action" :disabled="disabled || modelValue.length === 1" @click="remove(index)">{{ copy.removeParticipantSource }}</button></div></template>
      <template v-if="!participants || activeIndex === index">
      <div class="calendar-condition-toolbar">
      <select class="field-input" :value="clause.type" :disabled="disabled" :aria-label="copy.conditions" @change="changeType(index,$event.target.value)">
        <option value="people">{{ copy.choosePeople }}</option><option value="scope">{{ copy.chooseScope }}</option><option v-if="!audience" value="self">{{ copy.self }}</option>
      </select>
      <button v-if="!participants" type="button" class="btn btn-secondary calendar-condition-action" :disabled="disabled || modelValue.length===1" @click="remove(index)">{{ copy.delete }}</button>
      </div>
      <template v-if="clause.type==='people'"><p v-if="names(clause.personIds)" class="muted break-all">{{ names(clause.personIds) }}</p><button type="button" class="btn btn-secondary calendar-condition-action" :disabled="disabled" @click="picker=index">{{ copy.choosePeople }}</button></template>
      <template v-if="clause.type==='scope'">
        <p v-if="clause.natureIds == null && !clause.sameNature" class="notice-line">{{ relations.legacyScopeHelp }}</p>
        <label v-if="!audience" class="row"><input type="checkbox" :checked="clause.sameNature" :disabled="disabled" @change="setSame(index,{same:'sameNature',key:'natureIds'},$event.target.checked)" />{{ relations.calendarSameNatureSummary }}</label>
        <div class="field"><span class="field-label">{{ relations.nature }}</span><div class="calendar-options"><label v-for="option in metadata.natures || []" :key="option.id" class="selection-option-card" :class="{'personnel-option-selected':(clause.natureIds || []).includes(option.id)}"><input type="checkbox" :checked="(clause.natureIds || []).includes(option.id)" :disabled="disabled" @change="toggle(index,'natureIds',option.id)" /><span>{{ option.name }}</span></label></div></div>
        <details v-for="dimension in dimensions" :key="dimension.key" class="calendar-condition">
          <summary><span>{{ copy[dimension.label] }}</span><span class="muted">{{ dimensionSummary(dimension,clause) }}</span></summary>
          <label v-if="!audience" class="row"><input type="checkbox" :checked="clause[dimension.same]" :disabled="disabled" @change="setSame(index,dimension,$event.target.checked)" />{{ copy[dimension.same] }}</label>
          <div v-if="!clause[dimension.same]" class="calendar-options">
            <label v-for="option in dimensionOptions(dimension,clause)" :key="option.id" class="selection-option-card" :class="{'personnel-option-selected':(clause[dimension.key] || []).includes(option.id)}">
              <input type="checkbox" :checked="(clause[dimension.key] || []).includes(option.id)" :disabled="disabled" @change="toggle(index,dimension.key,option.id)" /><span>{{ option.name }}{{ department(option) }}</span>
            </label>
          </div>
        </details>
      </template>
      <div v-if="participants" class="card-actions calendar-source-actions"><button type="button" class="btn btn-secondary calendar-condition-action" @click="activeIndex = -1">{{ copy.finishParticipantSource }}</button></div></template>
    </div>
    <div v-if="participants" class="calendar-source-add"><button type="button" class="btn btn-secondary calendar-condition-action" :disabled="disabled" @click="add('people')">{{ copy.addParticipantPeople }}</button><button type="button" class="btn btn-secondary calendar-condition-action" :disabled="disabled" @click="add('scope')">{{ copy.addParticipantScope }}</button></div>
    <button v-else type="button" class="btn btn-secondary calendar-condition-action" :disabled="disabled" @click="add('scope')">{{ copy.addCondition }}</button>
    <PersonnelPicker v-if="picker!==null && modelValue[picker]?.type==='people'" :title="copy.choosePeople" mode="person" :options="people" :value="people.filter(person=>modelValue[picker].personIds.includes(person.id))" @cancel="picker=null" @confirm="confirm" />
  </section>
</template>
<script setup>
import {computed,nextTick,ref} from 'vue';
import PersonnelPicker from './PersonnelPicker.vue';
import copy from '@/locales/zh-CN/shared/calendar.js';
import relations from '@/locales/zh-CN/shared/identityNatureRelations.js';
import calendarView from '@/shared/calendarView.js';
import directory from '@/shared/contactDirectoryView.js';
import { confirmAction } from '@/runtime/notify.js';
const props=defineProps({modelValue:{type:Array,required:true},metadata:{type:Object,required:true},audience:Boolean,participants:Boolean,disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
const picker=ref(null), people=computed(()=>directory.peopleOptions(props.metadata.people));
const activeIndex=ref(props.modelValue.findIndex(clause=>clause.type==='people'&&!(clause.personIds||[]).length||clause.type==='scope'&&Array.isArray(clause.natureIds)&&!clause.natureIds.length&&!clause.sameNature));
function summary(clause) { return calendarView.participantSourceSummary(clause,props.metadata,copy,relations); }
const dimensions=[{key:'departmentIds',same:'sameDepartment',label:'department',options:'departments'},{key:'identityCategoryIds',same:'sameIdentity',label:'identity',options:'identities'},{key:'workGroupIds',same:'sameWorkGroup',label:'workGroup',options:'workGroups'}];
function patch(index,work) { if(props.disabled||!props.modelValue[index])return;const list=JSON.parse(JSON.stringify(props.modelValue));work(list[index]);emit('update:modelValue',list); }
function changeType(index,type) { if(props.disabled)return;const list=JSON.parse(JSON.stringify(props.modelValue));list[index]=directory.blankClause(type);emit('update:modelValue',list); }
function dimensionOptions(dimension,clause){const options=props.metadata[dimension.options]||[];return dimension.key==='identityCategoryIds'?options.filter(item=>clause.sameNature||(item.natureIds||[]).some(id=>(clause.natureIds||[]).includes(id))):options;}
function dimensionSummary(dimension,clause){if(clause[dimension.same])return copy[dimension.same];const ids=clause[dimension.key]||[];if(!ids.length)return copy.unlimited;return ids.map(id=>{const option=(props.metadata[dimension.options]||[]).find(item=>item.id===id);return option?option.name:copy.staleReferences;}).join('、');}
async function toggle(index,key,id) {
  const source=props.modelValue[index];if(props.disabled||!source)return;
  const values=source[key]||[],next=values.includes(id)?values.filter(value=>value!==id):values.concat(id);
  const invalid=key==='natureIds'?(props.metadata.identities||[]).filter(item=>(source.identityCategoryIds||[]).includes(item.id)&&!(item.natureIds||[]).some(nature=>next.includes(nature))):[];
  if(invalid.length&&!await confirmAction({title:relations.incompatibleSelectionTitle,body:[relations.incompatibleSelectionHelp,...invalid.map(item=>item.name)].join('\n'),confirmText:relations.clearIncompatibleSelection,cancelText:copy.cancel}))return;
  if(props.modelValue[index]!==source)return;
  patch(index,clause=>{clause[key]=next;if(key==='natureIds'){delete clause.sameNature;clause.identityCategoryIds=(clause.identityCategoryIds||[]).filter(value=>!invalid.some(item=>item.id===value));}});
}
function setSame(index,dimension,value) { patch(index,clause=>{clause[dimension.same]=value;clause[dimension.key]=[];}); }
async function add(type) { if(props.disabled)return;activeIndex.value=props.modelValue.length;emit('update:modelValue',props.modelValue.concat(directory.blankClause(type)));await nextTick();document.getElementById('calendar-source-'+activeIndex.value)?.scrollIntoView({block:'nearest'}); }
function remove(index) { if(props.disabled||props.modelValue.length===1)return;activeIndex.value=-1;emit('update:modelValue',props.modelValue.filter((_,i)=>i!==index)); }
function confirm(items) { patch(picker.value,clause=>{clause.personIds=items.map(item=>item.id);});picker.value=null;activeIndex.value=-1; }
function names(ids) { return people.value.filter(person=>ids.includes(person.id)).map(person=>person.name).join(' / '); }
function department(option) { return option.departmentId ? ' · '+(props.metadata.departments.find(item=>item.id===option.departmentId)?.name || '') : ''; }
</script>
<style scoped>
.calendar-condition-stack,.calendar-condition-card { display:flex;flex-direction:column;align-items:stretch;gap:var(--ui-field-gap); }
.calendar-source-actions, .calendar-source-add { display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap); }
.calendar-source-actions { justify-content:flex-end; }
.calendar-source-actions .calendar-condition-action, .calendar-source-add .calendar-condition-action { min-height:var(--ui-control-height); }
.calendar-condition-toolbar { display:flex;align-items:center;gap:var(--ui-field-gap); }
.calendar-condition-toolbar .field-input { flex:1;min-width:0; }
.calendar-condition-action { flex:none;align-self:flex-start;width:auto;min-width:0;height:auto;min-height:var(--ui-control-height);margin:0;padding:var(--ui-compact-padding-y) var(--ui-compact-padding-x);font-size:var(--ui-type-meta);border-radius:var(--ui-compact-radius); }
.calendar-condition-toolbar .calendar-condition-action { align-self:center; }
.calendar-condition { padding:var(--ui-label-gap) 0;border-top:1px solid var(--ui-line-blue); }
.calendar-condition summary { cursor:pointer;min-height:var(--ui-control-height);display:flex;flex-wrap:wrap;align-items:center;gap:var(--ui-inline-gap); }
.calendar-options { display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap); }
.calendar-options label { display:flex;align-items:center;gap:var(--ui-inline-gap);min-height:var(--ui-field-control-height);border:1px solid var(--ui-line-blue);border-radius:var(--ui-compact-radius);padding:var(--ui-compact-padding-y) var(--ui-compact-padding-x); }
.calendar-options .personnel-option-selected { background:var(--ui-option-selected-bg); }
</style>
