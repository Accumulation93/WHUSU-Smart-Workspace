<template>
  <div class="stack nature-editor">
    <section class="card stack">
      <h2 class="section-title">{{ ui.title }}</h2>
      <AppLoading v-if="loading" :text="ui.loading" />
      <p v-if="notice" role="alert" class="notice-line">{{ notice }}</p>
      <button v-if="failed" class="btn btn-secondary" @click="load">{{ ui.retry }}</button>
    </section>
      <form v-if="ready && (draft.id || canCreate)" class="card stack" @submit.prevent="save">
        <h3>{{draft.id ? ui.editTitle : ui.add}}</h3>
        <label class="field"><span class="field-label">{{ ui.name }}</span><input v-model="draft.name" class="field-input" :placeholder="ui.namePlaceholder" :disabled="busy || loading || failed || saved" /></label>
        <div class="nature-actions"><button class="btn btn-primary" :disabled="busy || loading || saved || failed">{{ ui.save }}</button><button type="button" class="btn btn-secondary" :disabled="busy || saved" @click="reset">{{ ui.cancel }}</button></div>
      </form>
    <section class="card stack"><div class="list">
    <article v-for="row in rows" :key="row.id" class="list-row dictionary-row">
      <div class="list-row-main stack-tight"><strong class="list-row-title break-all">{{ row.name }}</strong></div>
      <div class="card-actions"><button v-if="row.canUpdate" class="btn-quiet" :disabled="busy || loading || failed || saved" @click="edit(row)">{{ ui.edit }}</button><button v-if="row.canDelete && !['staff','liaison','other'].includes(row.id)" class="btn-quiet btn-quiet-danger" :disabled="busy || loading || failed || saved" @click="remove(row)">{{ ui.remove }}</button></div>
    </article>
    </div><div v-if="ready && !loading && !failed && !rows.length" class="empty-state">{{ui.empty}}</div></section>
  </div>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import AppLoading from '@/components/AppLoading.vue';
import ui from '@/locales/zh-CN/shared/assignmentNatures.js';
import {session} from '@/runtime/session.js';
import {callApi,requireSuccess,errorText} from '@/runtime/api.js';
import {confirmAction} from '@/runtime/notify.js';
import {useCopiedConfigurationEditor} from '@/runtime/copiedConfigurationEditor.js';
const emit=defineEmits(['busy']);
const rows=ref([]),draft=ref({name:''}),loading=ref(false),busy=ref(false),ready=ref(false),failed=ref(false),saved=ref(false),notice=ref('');
watch(busy,value=>emit('busy',value));
const canCreate=ref(false);
let generation=0,disposed=false,writeGeneration=0;
const current=id=>!disposed&&!document.hidden&&id===generation;
function reset(){if(busy.value||saved.value)return;draft.value={name:''};}
function edit(row){if(row.canUpdate&&!busy.value&&!loading.value&&!failed.value&&!saved.value){draft.value={id:row.id,name:row.name,version:Number(row.version)};}}
async function load(){const id=++generation;loading.value=true;failed.value=false;notice.value='';try{const result=requireSuccess(await callApi('listAssignmentNatures',{}));if(!current(id))return;rows.value=result.list;canCreate.value=result.canCreate===true;ready.value=true;if(saved.value){draft.value={name:''};saved.value=false;}}catch(error){if(current(id)){failed.value=true;notice.value=errorText(error,ui.loadFailed);}}finally{if(current(id))loading.value=false;}}
async function write(name,body){if(busy.value||loading.value||failed.value||saved.value)return;busy.value=true;const id=generation,writeId=++writeGeneration;notice.value='';try{requireSuccess(await callApi(name,body));if(!current(id))return;saved.value=true;await load();}catch(error){if(current(id))notice.value=errorText(error,name==='saveAssignmentNature'?ui.saveFailed:ui.deleteFailed);}finally{if(!disposed&&writeId===writeGeneration)busy.value=false;}}
function save(){if(draft.value.id?!rows.value.some(row=>row.id===draft.value.id&&row.canUpdate):!canCreate.value)return;if(!draft.value.name.trim()){notice.value=ui.nameRequired;return;}return write('saveAssignmentNature',{...draft.value});}
async function remove(row){if(!row.canDelete||['staff','liaison','other'].includes(row.id)||busy.value||loading.value||failed.value||saved.value)return;const id=generation,target={id:row.id,version:Number(row.version)};if(await confirmAction({title:ui.removeTitle,body:ui.removeConfirm(row.name),danger:true,confirmText:ui.remove,cancelText:ui.cancel})&&current(id))await write('deleteAssignmentNature',target);}
function clear(){generation++;writeGeneration++;rows.value=[];ready.value=false;canCreate.value=false;notice.value='';failed.value=false;draft.value={name:''};busy.value=false;saved.value=false;if(!document.hidden)load();}
useCopiedConfigurationEditor({kind:()=> 'hr.assignmentNatures',rows,blocked:()=>busy.value||loading.value,ready:()=>ready.value&&!failed.value&&!loading.value,edit,notice});
watch(()=>session.context,clear,{immediate:true});document.addEventListener('visibilitychange',clear);
onBeforeUnmount(()=>{disposed=true;generation++;emit('busy',false);document.removeEventListener('visibilitychange',clear);});
</script>
<style scoped>
.nature-actions { display:flex;flex-wrap:wrap;gap:var(--ui-inline-gap); }
.nature-actions > .btn { flex:1;min-width:0;width:auto; }
.dictionary-row { flex-direction: column; align-items: stretch; }
</style>
