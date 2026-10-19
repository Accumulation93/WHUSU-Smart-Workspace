<template>
  <section class="stack">
    <div v-for="(clause,index) in modelValue" :key="index" class="list-row stack">
      <select class="field-input" :value="clause.type" :disabled="disabled" :aria-label="copy.conditions" @change="changeType(index,$event.target.value)">
        <option value="people">{{ copy.choosePeople }}</option><option value="scope">{{ copy.chooseScope }}</option><option v-if="!audience" value="self">{{ copy.self }}</option>
      </select>
      <template v-if="clause.type==='people'"><p class="muted break-all">{{ names(clause.personIds) }}</p><button type="button" class="btn btn-secondary" :disabled="disabled" @click="picker=index">{{ copy.choosePeople }} · {{ clause.personIds.length }}</button></template>
      <template v-if="clause.type==='scope'">
        <details v-for="dimension in dimensions" :key="dimension.key" class="calendar-condition">
          <summary>{{ copy[dimension.label] }} · {{ clause[dimension.same] ? copy[dimension.same] : (clause[dimension.key] || []).length }}</summary>
          <label v-if="!audience" class="row"><input type="checkbox" :checked="clause[dimension.same]" :disabled="disabled" @change="setSame(index,dimension,$event.target.checked)" />{{ copy[dimension.same] }}</label>
          <div v-if="!clause[dimension.same]" class="calendar-options">
            <label v-for="option in metadata[dimension.options] || []" :key="option.id" class="selection-option-card" :class="{'personnel-option-selected':(clause[dimension.key] || []).includes(option.id)}">
              <input type="checkbox" :checked="(clause[dimension.key] || []).includes(option.id)" :disabled="disabled" @change="toggle(index,dimension.key,option.id)" /><span>{{ option.name }}{{ department(option) }}</span>
            </label>
          </div>
        </details>
      </template>
      <button type="button" class="btn btn-secondary" :disabled="disabled || modelValue.length===1" @click="remove(index)">{{ copy.delete }}</button>
    </div>
    <button type="button" class="btn btn-secondary" :disabled="disabled" @click="add">{{ copy.addCondition }}</button>
    <PersonnelPicker v-if="picker!==null && modelValue[picker]?.type==='people'" :title="copy.choosePeople" mode="person" :options="people" :value="people.filter(person=>modelValue[picker].personIds.includes(person.id))" @cancel="picker=null" @confirm="confirm" />
  </section>
</template>
<script setup>
import {computed,ref} from 'vue';
import PersonnelPicker from './PersonnelPicker.vue';
import copy from '@/locales/zh-CN/shared/calendar.js';
import directory from '@/shared/contactDirectoryView.js';
const props=defineProps({modelValue:{type:Array,required:true},metadata:{type:Object,required:true},audience:Boolean,disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
const picker=ref(null), people=computed(()=>directory.peopleOptions(props.metadata.people));
const dimensions=[{key:'departmentIds',same:'sameDepartment',label:'department',options:'departments'},{key:'identityCategoryIds',same:'sameIdentity',label:'identity',options:'identities'},{key:'workGroupIds',same:'sameWorkGroup',label:'workGroup',options:'workGroups'}];
function patch(index,work) { if(props.disabled||!props.modelValue[index])return;const list=JSON.parse(JSON.stringify(props.modelValue));work(list[index]);emit('update:modelValue',list); }
function changeType(index,type) { if(props.disabled)return;const list=JSON.parse(JSON.stringify(props.modelValue));list[index]=directory.blankClause(type);emit('update:modelValue',list); }
function toggle(index,key,id) { patch(index,clause=>{const values=clause[key] || [];clause[key]=values.includes(id) ? values.filter(value=>value!==id) : values.concat(id);}); }
function setSame(index,dimension,value) { patch(index,clause=>{clause[dimension.same]=value;clause[dimension.key]=[];}); }
function add() { if(props.disabled)return;emit('update:modelValue',props.modelValue.concat(directory.blankClause('scope'))); }
function remove(index) { if(props.disabled)return;emit('update:modelValue',props.modelValue.filter((_,i)=>i!==index)); }
function confirm(items) { patch(picker.value,clause=>{clause.personIds=items.map(item=>item.id);});picker.value=null; }
function names(ids) { return people.value.filter(person=>ids.includes(person.id)).map(person=>person.name).join(' / '); }
function department(option) { return option.departmentId ? ' · '+(props.metadata.departments.find(item=>item.id===option.departmentId)?.name || '') : ''; }
</script>
<style scoped>
.calendar-condition { padding:var(--ui-field-gap);border:var(--ui-result-label-border);border-radius:var(--ui-card-radius); }
.calendar-condition summary { cursor:pointer;min-height:var(--ui-compact-height);display:flex;align-items:center; }
.calendar-options { display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap); }
.calendar-options label { display:flex;align-items:center;gap:var(--ui-inline-gap);min-height:var(--ui-field-control-height); }
</style>
