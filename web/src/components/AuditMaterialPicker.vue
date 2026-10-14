<template><GlassDialog :title="kind === 'stamp' ? text.stamp : text.signature" :busy="selecting" @close="$emit('cancel')">
  <p v-if="loading">{{ kind === 'stamp' ? text.stampLoading : text.signatureLoading }}</p>
  <template v-else-if="notice"><p class="notice-line">{{ notice }}</p><button class="btn-quiet" @click="load">{{ text.retry }}</button></template>
  <template v-else><button v-if="kind === 'signature'" class="btn btn-primary" @click="$emit('draw')">{{ text.addInk }}</button><p v-if="!rows.length">{{ kind === 'stamp' ? text.stampEmpty : text.signatureEmpty }}</p><button v-for="row in rows" :key="row.id" class="list-row" :disabled="selecting" @click="select(row)"><span>{{ row.name }}</span><img v-if="row.imageData" class="material-preview" :src="row.imageData" :alt="row.name" /></button></template>
  <p v-if="imageNotice" class="notice-line">{{ imageNotice }}</p><p v-if="selecting">{{ text.imageLoading }}</p>
</GlassDialog></template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import GlassDialog from './GlassDialog.vue';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { callApi, requireSuccess } from '@/runtime/api.js';
import { auditRequests } from '@/runtime/auditRequests.js';
const requests=auditRequests();
const props=defineProps({kind:String,seed:Array});const emit=defineEmits(['cancel','select','draw']);
const rows=ref([]), loading=ref(true), notice=ref(''), selecting=ref(false), imageNotice=ref('');let alive=true,sequence=0;
async function load(){const request=++sequence;loading.value=true;notice.value='';try{const result=requireSuccess(await requests.call(props.kind==='stamp'?'listMyStamps':'listMySignatures',props.kind==='stamp'?{includeImageData:false}:{}));if(alive&&request===sequence)rows.value=result.stamps||result.signatures||[];}catch(_){if(alive&&request===sequence)notice.value=props.kind==='stamp'?text.stampFailed:text.signatureFailed;}finally{if(alive&&request===sequence)loading.value=false;}}
async function select(row){if(selecting.value)return;selecting.value=true;imageNotice.value='';try{let imageData=row.imageData;if(props.kind==='stamp')imageData=requireSuccess(await requests.call('getMyStampImage',{stampId:row.id,preview:true,previewMaxEdge:2048,previewFormat:'webp'})).imageData;if(!imageData)throw Error('empty_image');if(alive)emit('select',{...row,imageData});}catch(_){if(alive)imageNotice.value=text.imageFailed;}finally{if(alive)selecting.value=false;}}
onMounted(()=>{if(props.seed){rows.value=props.seed;loading.value=false;}else load();});onBeforeUnmount(()=>{alive=false;sequence+=1;requests.dispose();});
</script>
<style scoped>.material-preview{max-width:var(--ui-signing-width-control);max-height:var(--ui-signing-width-control);object-fit:contain}</style>
