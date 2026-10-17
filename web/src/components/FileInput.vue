<template>
  <span><button v-if="!hidden" type="button" class="btn btn-secondary" :disabled="disabled" @click="click">{{ copy.choose }}</button><input ref="element" type="file" :accept="accept" :multiple="multiple" :disabled="disabled" hidden @change="changed" /></span>
</template>
<script setup>
import { ref, onBeforeUnmount } from 'vue';
import { inputFile, cancelFileDialog } from '@/runtime/fileIO.js';
import copy from '@/locales/zh-CN/shared/fileIO.js';
import { session } from '@/runtime/session.js';
const props=defineProps({accept:String,multiple:Boolean,disabled:Boolean,hidden:Boolean});
const emit=defineEmits(['change']);const element=ref(null);let alive=true;
const scope=()=>[session.status,session.user?.id,session.context?.contextId,session.context?.organizationId].join('|');
let expected=scope();
function click(){expected=scope();if(!props.disabled)return inputFile({element:element.value,accept:props.accept,image:!props.accept||props.accept.includes('image')});}
async function changed(event){const result=await inputFile({files:event.target.files});if(alive&&expected===scope()&&!props.disabled&&result.status==='success')emit('change',{target:{files:result.files,value:''}});}
defineExpose({click});
onBeforeUnmount(()=>{alive=false;cancelFileDialog();});
</script>
