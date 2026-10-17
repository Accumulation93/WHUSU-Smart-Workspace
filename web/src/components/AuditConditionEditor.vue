<template>
  <div class="stack">
    <label class="field"><span class="field-label">{{ native.copy_937301fe27 }}</span><select v-model="form.conditionType" class="field-input"><option value="identity_scope">{{ native.copy_49b5b1ec92 }}</option><option value="person">{{ native.copy_05970eea73 }}</option><option v-if="allowSubmitter" value="submitter">{{ governance.auditSubmitter }}</option></select></label>
    <template v-if="form.conditionType === 'identity_scope'">
      <div v-for="field in scopes" :key="field.key" class="field">
        <label class="field"><span class="field-label">{{ field.label }}</span><select v-model="form[field.key+'Scope']" :aria-label="field.label" class="field-input"><option value="all">{{ personnel.all }}</option><option value="own">{{ native.copy_4b405169cb }}</option><option value="specific">{{ native.copy_2aad29e5cf }}</option></select></label>
        <button v-if="form[field.key+'Scope'] === 'specific'" class="btn-quiet" @click="chooseRange(field)">{{ rangeText(field) || personnel.choose }}</button>
      </div>
    </template>
    <template v-else-if="form.conditionType === 'person'"><button class="btn-quiet" @click="peopleVisible=true">{{ personnel.choose }}</button><span v-for="item in chosenPeople" :key="item.assignmentId" class="chip chip-blue">{{ item.name }} · {{ item.assignmentLabel }}</span></template>
    <p v-if="notice" class="notice-line">{{ notice }}</p>
    <div class="dialog-footer-actions"><button class="btn btn-secondary" @click="$emit('cancel')">{{ personnel.cancelSelection }}</button><button class="btn btn-primary" @click="confirm">{{ personnel.confirm }}</button></div>
    <GlassDialog v-if="range" :title="range.label" @close="range=null"><button v-for="item in rangeOptions" :key="item.id" class="list-row personnel-option" :class="{'personnel-option-selected':rangeSelected.includes(item.id)}" :aria-pressed="rangeSelected.includes(item.id)" @click="toggleRange(item.id)">{{ item.name }}</button><template #footer><button class="btn btn-secondary" @click="range=null">{{ personnel.cancelSelection }}</button><button class="btn btn-primary" @click="confirmRange">{{ personnel.confirm }}</button></template></GlassDialog>
    <PersonnelPicker v-if="peopleVisible" :title="native.copy_05970eea73" :options="options" :value="chosenPeople" @cancel="peopleVisible=false" @confirm="choosePeople" />
  </div>
</template>
<script setup>
import { computed, reactive, ref } from 'vue';
import GlassDialog from './GlassDialog.vue';
import PersonnelPicker from './PersonnelPicker.vue';
import native from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/auditBehavior.js';
import personnel from '@/locales/zh-CN/shared/personnelPicker.js';
import governance from '@/locales/zh-CN/shared/adminGovernance.js';
import { clone } from '@/shared/auditInk.js';
const props=defineProps({value:Object,directory:Object,allowSubmitter:Boolean});const emit=defineEmits(['confirm','cancel']);
const form=reactive(Object.assign({conditionType:'identity_scope',departmentScope:'all',workGroupScope:'all',identityScope:'all',specificDepartmentId:'',specificWorkGroupId:'',specificIdentityId:'',personHrIds:'',assignmentIds:''},clone(props.value||{})));
const scopes=[{key:'department',id:'specificDepartmentId',list:'departments',label:personnel.department},{key:'workGroup',id:'specificWorkGroupId',list:'workGroups',label:personnel.workGroup},{key:'identity',id:'specificIdentityId',list:'identities',label:personnel.identity}];
const ids=value=>String(value||'').split(',').filter(Boolean);
const options=computed(()=>props.directory.people.flatMap(person=>(person.assignments||[]).map(item=>({...item,id:person.id,name:person.name}))));
const chosenPeople=computed(()=>options.value.filter(item=>ids(form.assignmentIds).includes(item.assignmentId)));
const peopleVisible=ref(false),range=ref(null),rangeSelected=ref([]),notice=ref('');
const rangeOptions=computed(()=>!range.value?[]:props.directory[range.value.list].filter(item=>range.value.key!=='workGroup'||form.departmentScope!=='specific'||ids(form.specificDepartmentId).includes(item.departmentId)));
function rangeText(field){return props.directory[field.list].filter(item=>ids(form[field.id]).includes(item.id)).map(item=>item.name).join(' · ');}
function chooseRange(field){range.value=field;rangeSelected.value=ids(form[field.id]);}
function toggleRange(id){rangeSelected.value=rangeSelected.value.includes(id)?rangeSelected.value.filter(value=>value!==id):[...rangeSelected.value,id];}
function confirmRange(){form[range.value.id]=rangeSelected.value.join(',');range.value=null;}
function choosePeople(rows){form.assignmentIds=rows.map(item=>item.assignmentId).join(',');form.personHrIds=[...new Set(rows.map(item=>item.id))].join(',');peopleVisible.value=false;}
function confirm(){
  if(form.conditionType==='submitter'){if(props.allowSubmitter)emit('confirm',{conditionType:'submitter'});return;}
  if(form.conditionType==='person' && (!form.assignmentIds || chosenPeople.value.length!==ids(form.assignmentIds).length)){notice.value=messages.copy_4c3b518dca;return;}
  if(form.conditionType==='identity_scope' && scopes.some(field=>form[field.key+'Scope']==='specific'&&!ids(form[field.id]).length)){notice.value=messages.copy_4c3b518dca;return;}
  emit('confirm',clone(form));
}
</script>
<style scoped>
.dialog-footer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-action-gap)}
.personnel-option{width:100%;color:var(--ui-text);font:inherit;text-align:left}
.personnel-option-selected{border-color:var(--ui-blue-700);background:var(--ui-chip-blue-bg)}
</style>
