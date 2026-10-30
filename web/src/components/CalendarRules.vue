<template>
  <section class="stack">
    <div class="card stack">
      <div class="panel-head"><h2 class="section-title">{{ copy.ruleManage }}</h2><button class="btn btn-primary" :disabled="busy || loading || !!notice" @click="edit()">{{ copy.createRule }}</button></div>
      <AppLoading v-if="loading || busy" :text="busy ? copy.saving : copy.loading" /><p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button v-if="notice" class="btn btn-secondary" :disabled="busy" @click="load">{{ copy.retry }}</button>
      <article v-for="rule in metadata.rules" :key="rule.id" class="list-row stack">
        <label class="row"><input v-model="selected" type="checkbox" :value="rule.id" :disabled="busy" /><strong>{{ rule.name }}</strong><span class="chip chip-sky">{{ rule.enabled ? copy.enabled : copy.disabled }}</span></label>
        <div class="card-actions"><button class="btn btn-secondary" :disabled="busy" @click="edit(rule)">{{ copy.edit }}</button><button class="btn btn-secondary" :disabled="busy" @click="edit(rule,true)">{{ copy.duplicate }}</button><button class="btn btn-secondary" :disabled="busy" @click="batch(rule.enabled ? 'disable' : 'enable',[rule])">{{ rule.enabled ? copy.disabled : copy.enabled }}</button></div>
      </article>
      <p v-if="!loading && !metadata.rules?.length" class="empty-state">{{ copy.rulesEmpty }}</p>
      <button v-if="selected.length" class="btn btn-danger" :disabled="busy" @click="deletion=metadata.rules.filter(rule=>selected.includes(rule.id))">{{ copy.delete }} · {{ selected.length }}</button>
    </div>
    <form v-if="draft" ref="editor" class="card stack" @submit.prevent="save">
      <label class="field"><span class="field-label">{{ copy.ruleName }}</span><input v-model="draft.name" class="field-input" :disabled="busy" /></label>
      <h3 class="section-title">{{ copy.audience }}</h3><CalendarConditions v-model="draft.audience" :metadata="metadata" audience :disabled="busy" />
      <h3 class="section-title">{{ copy.targets }}</h3><CalendarConditions v-model="draft.targets" :metadata="metadata" :disabled="busy" />
      <h3 class="section-title">{{ copy.actions }}</h3><label v-for="action in ['assign','update','cancel']" :key="action" class="row"><input v-model="draft.actions" type="checkbox" :value="action" :disabled="busy" />{{ action==='cancel' ? copy.cancelAction : copy[action] }}</label>
      <label class="row"><input v-model="draft.enabled" type="checkbox" :disabled="busy" />{{ copy.enabled }}</label>
      <div class="card-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="draft=null">{{ copy.cancel }}</button><button class="btn btn-primary" :disabled="busy || saved">{{ copy.save }}</button></div>
    </form>
    <GlassDialog v-if="deletion" :title="copy.delete" :busy="busy" @close="deletion=null"><p>{{ copy.deleteRuleConfirm }}</p><p v-for="rule in deletion" :key="rule.id">{{ rule.name }}</p><template #footer><button class="btn btn-secondary" :disabled="busy" @click="deletion=null">{{ copy.cancel }}</button><button class="btn btn-danger" :disabled="busy" @click="batch('delete',deletion)">{{ copy.delete }}</button></template></GlassDialog>
  </section>
</template>
<script setup>
import {nextTick,onBeforeUnmount,ref,watch} from 'vue';
import CalendarConditions from './CalendarConditions.vue';
import GlassDialog from './GlassDialog.vue';
import copy from '@/locales/zh-CN/shared/calendar.js';
import {callApi,requireSuccess,errorText} from '@/runtime/api.js';
import {session} from '@/runtime/session.js';
const metadata=ref({rules:[],people:[],departments:[],identities:[],workGroups:[]}),selected=ref([]),draft=ref(null),deletion=ref(null),busy=ref(false),loading=ref(false),notice=ref(''),saved=ref(false);
const editor=ref(null);
let generation=0,disposed=false;
async function load() { const own=++generation;loading.value=true;notice.value='';try { const result=requireSuccess(await callApi('getCalendarRules',{}));if(own!==generation||disposed)return;metadata.value=result;selected.value=[];if(saved.value){draft.value=null;saved.value=false;} }catch(error){if(own===generation)notice.value=errorText(error,copy.operationFailed);}finally{if(own===generation)loading.value=false;} }
async function edit(rule,duplicate) { draft.value=rule ? JSON.parse(JSON.stringify(rule)) : {name:'',enabled:true,audience:[{type:'people',personIds:[]}],targets:[{type:'self'}],actions:['assign']};if(duplicate){delete draft.value.id;delete draft.value.version;}saved.value=false;await nextTick();editor.value?.scrollIntoView({block:'start'}); }
async function save() { if(busy.value||loading.value||saved.value||!draft.value)return;busy.value=true;notice.value='';const own=generation;try{requireSuccess(await callApi('saveCalendarRule',draft.value));if(own!==generation)return;saved.value=true;await load();}catch(error){if(own===generation)notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;} }
async function batch(action,rules) { if(busy.value||loading.value)return;busy.value=true;notice.value='';const own=generation;try{requireSuccess(await callApi('batchCalendarRules',{action,rules:rules.map(rule=>({id:rule.id,version:rule.version}))}));if(own!==generation)return;deletion.value=null;await load();}catch(error){if(own===generation)notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;} }
function visibility(){generation++;metadata.value={rules:[],people:[],departments:[],identities:[],workGroups:[]};draft.value=null;deletion.value=null;if(!document.hidden)load();}
document.addEventListener('visibilitychange',visibility);
watch(()=>session.context,visibility,{immediate:true});
onBeforeUnmount(()=>{disposed=true;generation++;document.removeEventListener('visibilitychange',visibility);});
</script>
