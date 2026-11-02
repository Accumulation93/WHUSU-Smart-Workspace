<template>
  <div class="page stack authorization-workspace">
    <WorkspaceHero :tone="session.context?.role === 'admin' ? 'admin' : 'blue'" :page-name="ui.nature" :person-name="session.context?.name || session.user?.name" :identity-name="roleLabelOf(session.context)" :organization-name="session.context?.organizationName" @switch="router.push({name:'workRole'})" />
    <section class="card stack">
      <h2 class="section-title">{{ ui.nature }}</h2>
      <AppLoading v-if="loading" :text="ui.loading" />
      <p v-if="notice" role="alert" class="notice-line">{{ notice }}</p>
      <button v-if="failed" class="btn btn-secondary" @click="load">{{ ui.retry }}</button>
      <form v-if="ready && (draft.id || canCreate)" class="stack" @submit.prevent="save">
        <label class="field"><span class="field-label">{{ ui.name }}</span><input v-model="draft.name" class="field-input" :disabled="busy" /></label>
        <div class="nature-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="reset">{{ ui.cancel }}</button><button class="btn btn-primary" :disabled="busy || loading || saved">{{ ui.save }}</button></div>
      </form>
    </section>
    <article v-for="row in rows" :key="row.id" class="card authorization-nature-row">
      <strong>{{ row.name }}</strong>
      <div class="nature-actions"><button v-if="row.canUpdate" class="btn-quiet authorization-edit" :disabled="busy || loading || failed" @click="edit(row)">{{ ui.edit }}</button><button v-if="row.canDelete && !['staff','liaison','other'].includes(row.id)" class="btn-quiet btn-quiet-danger" :disabled="busy || loading || failed" @click="remove(row)">{{ ui.remove }}</button></div>
    </article>
  </div>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import {useRouter} from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AppLoading from '@/components/AppLoading.vue';
import ui from '@/locales/zh-CN/shared/authorization.js';
import {session,roleLabelOf} from '@/runtime/session.js';
import {callApi,requireSuccess,errorText} from '@/runtime/api.js';
import {confirmAction} from '@/runtime/notify.js';
import {useCopiedConfigurationEditor} from '@/runtime/copiedConfigurationEditor.js';
import '@/styles/authorization.css';
const router=useRouter(),rows=ref([]),draft=ref({name:''}),loading=ref(false),busy=ref(false),ready=ref(false),failed=ref(false),saved=ref(false),notice=ref('');
const canCreate=ref(false);
let generation=0,disposed=false;
const current=id=>!disposed&&!document.hidden&&id===generation;
function reset(){draft.value={name:''};saved.value=false;}
function edit(row){if(row.canUpdate&&!busy.value&&!loading.value&&!failed.value){draft.value={id:row.id,name:row.name,version:Number(row.version)};saved.value=false;}}
async function load(){const id=++generation;loading.value=true;failed.value=false;notice.value='';try{const result=requireSuccess(await callApi('listAssignmentNatures',{}));if(!current(id))return;rows.value=result.list;canCreate.value=result.canCreate===true;ready.value=true;if(saved.value)reset();}catch(error){if(current(id)){failed.value=true;notice.value=errorText(error,ui.operationFailed);}}finally{if(current(id))loading.value=false;}}
async function write(name,body){if(busy.value||loading.value||failed.value||saved.value)return;busy.value=true;const id=generation;notice.value='';try{requireSuccess(await callApi(name,body));if(!current(id))return;saved.value=true;await load();}catch(error){if(current(id))notice.value=errorText(error,ui.operationFailed);}finally{if(!disposed)busy.value=false;}}
function save(){if(draft.value.id?!rows.value.some(row=>row.id===draft.value.id&&row.canUpdate):!canCreate.value)return;return write('saveAssignmentNature',{...draft.value});}
async function remove(row){const id=generation,target={id:row.id,version:Number(row.version)};if(await confirmAction({title:ui.remove,body:row.name,danger:true,confirmText:ui.remove,cancelText:ui.cancel})&&current(id))await write('deleteAssignmentNature',target);}
function clear(){generation++;rows.value=[];ready.value=false;draft.value={name:''};busy.value=false;saved.value=false;if(!document.hidden)load();}
useCopiedConfigurationEditor({kind:()=> 'hr.assignmentNatures',rows,blocked:()=>busy.value||loading.value,ready:()=>ready.value&&!failed.value&&!loading.value,edit,notice});
watch(()=>session.context,clear,{immediate:true});document.addEventListener('visibilitychange',clear);
onBeforeUnmount(()=>{disposed=true;generation++;document.removeEventListener('visibilitychange',clear);});
</script>
<style scoped>
.nature-actions { display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap); }
.nature-actions > .btn { flex:1;min-width:0;width:auto; }
</style>
