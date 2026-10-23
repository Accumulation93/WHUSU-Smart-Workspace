<template><section v-if="result || loading || failed" class="stack"><AppLoading v-if="loading" :text="copy.loading" /><p v-if="failed" class="notice-line">{{ copy.operationFailed }}</p><button v-if="failed" class="btn btn-secondary" @click="load">{{ copy.retry }}</button><template v-if="result"><h3 class="section-title">{{ copy.participants }} · {{ result.participants.length }}</h3><article v-for="(person,index) in result.participants" :key="index" class="list-row stack-tight"><strong><PersonLink :name="person.name" :reference="person.personReference" /></strong><span v-for="(position,i) in person.positions" :key="i" class="muted">{{ [position.identityCategory,position.department,position.workGroup].filter(Boolean).join(' · ') }}</span></article><button v-if="result.canEdit" class="btn btn-secondary" @click="edit">{{ copy.participants }}</button></template></section></template>
<script setup>
import {onBeforeUnmount,ref,watch} from 'vue';
import {useRouter} from 'vue-router';
import {callApi} from '@/runtime/api.js';
import {session} from '@/runtime/session.js';
import copy from '@/locales/zh-CN/shared/calendar.js';
const props=defineProps({sourceKind:String,sourceId:String,occurrenceDate:String});
const result=ref(null),loading=ref(false),failed=ref(false),router=useRouter();let generation=0,disposed=false;
async function load(){const own=++generation;result.value=null;loading.value=false;failed.value=false;if(!props.sourceId||document.hidden)return;loading.value=true;try{const response=await callApi('getCalendarParticipants',{sourceKind:props.sourceKind,sourceId:props.sourceId,occurrenceDate:props.occurrenceDate});if(own!==generation||disposed)return;if(response.status==='success')result.value=response;else if(!['calendar_forbidden','calendar_unavailable','forbidden'].includes(response.status))failed.value=true;}catch{if(own===generation&&!disposed)failed.value=true;}finally{if(own===generation&&!disposed)loading.value=false;}}
function edit(){router.push({name:'calendarEdit',query:{sourceKind:props.sourceKind,sourceId:props.sourceId}});}
watch(()=>[props.sourceId,props.occurrenceDate,session.context],load,{immediate:true});
document.addEventListener('visibilitychange',load);onBeforeUnmount(()=>{disposed=true;generation++;document.removeEventListener('visibilitychange',load);});
</script>
