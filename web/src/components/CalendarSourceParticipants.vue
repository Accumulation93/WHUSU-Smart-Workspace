<template>
  <section v-if="result || loading || failed" class="calendar-participants">
    <AppLoading v-if="loading" :text="copy.loading" />
    <div v-if="failed" class="calendar-participants-head"><p class="notice-line">{{ copy.operationFailed }}</p><button class="btn btn-secondary calendar-participants-action" @click="load">{{ copy.retry }}</button></div>
    <template v-if="result">
      <header class="calendar-participants-head"><h3 class="calendar-participants-title">{{ copy.participants }} <span>{{ result.participants.length }}</span></h3><button v-if="result.canEdit" class="btn btn-secondary calendar-participants-action" @click="edit">{{ venueCopy.copy_20f94d2c18 }}</button></header>
      <p v-if="!result.participants.length" class="muted">{{ copy.noParticipants }}</p>
      <div class="calendar-participants-grid"><article v-for="(person,index) in result.participants" :key="index" class="list-row calendar-participant"><strong><PersonLink :name="person.name" :reference="person.personReference" /></strong><span v-for="(position,i) in person.positions" :key="i" class="calendar-participant-position">{{ [position.identityCategory,position.department,position.workGroup].filter(Boolean).join(' · ') }}</span><span v-if="!person.positions.length" class="calendar-participant-position">{{ copy.noPosition }}</span></article></div>
    </template>
  </section>
</template>
<script setup>
import {onBeforeUnmount,ref,watch} from 'vue';
import {useRouter} from 'vue-router';
import {callApi} from '@/runtime/api.js';
import {session} from '@/runtime/session.js';
import copy from '@/locales/zh-CN/shared/calendar.js';
import venueCopy from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
const props=defineProps({sourceKind:String,sourceId:String,occurrenceDate:String});
const result=ref(null),loading=ref(false),failed=ref(false),router=useRouter();let generation=0,disposed=false;
async function load(){const own=++generation;result.value=null;loading.value=false;failed.value=false;if(!props.sourceId||document.hidden)return;loading.value=true;try{const response=await callApi('getCalendarParticipants',{sourceKind:props.sourceKind,sourceId:props.sourceId,occurrenceDate:props.occurrenceDate});if(own!==generation||disposed)return;if(response.status==='success')result.value=response;else if(!['calendar_forbidden','calendar_unavailable','forbidden'].includes(response.status))failed.value=true;}catch{if(own===generation&&!disposed)failed.value=true;}finally{if(own===generation&&!disposed)loading.value=false;}}
function edit(){router.push({name:'calendarEdit',query:{sourceKind:props.sourceKind,sourceId:props.sourceId}});}
watch(()=>[props.sourceId,props.occurrenceDate,session.context],load,{immediate:true});
document.addEventListener('visibilitychange',load);onBeforeUnmount(()=>{disposed=true;generation++;document.removeEventListener('visibilitychange',load);});
</script>
<style scoped>
.calendar-participants { display:flex;flex-direction:column;gap:var(--ui-field-gap);padding-top:var(--ui-list-padding-y);border-top:1px solid var(--ui-line-blue); }
.calendar-participants-head { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-inline-gap); }
.calendar-participants-title { font-size:var(--ui-type-emphasis);line-height:1.5; }
.calendar-participants-title span { font-size:var(--ui-type-meta);color:var(--ui-text-muted);font-weight:500; }
.calendar-participants-action { flex:none;width:auto;min-width:0;min-height:var(--ui-control-height);height:auto;margin:0;padding:var(--ui-compact-padding-y) var(--ui-compact-padding-x);font-size:var(--ui-type-meta);border-radius:var(--ui-compact-radius); }
.calendar-participants-grid { display:grid;grid-template-columns:minmax(0,1fr);gap:var(--ui-field-gap); }
.calendar-participant { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);align-items:start;gap:var(--ui-label-gap) var(--ui-field-gap);min-width:0; }
.calendar-participant strong { min-width:0;overflow-wrap:anywhere; }
.calendar-participant-position { grid-column:2;color:var(--ui-text-muted);font-size:var(--ui-type-meta);line-height:1.6;overflow-wrap:anywhere; }
@media (min-width:520px) { .calendar-participants-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
