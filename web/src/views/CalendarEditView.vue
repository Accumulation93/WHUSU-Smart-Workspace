<template>
  <main class="page page-narrow stack">
    <WorkspaceHero :page-name="copy.title" :person-name="session.context?.name || ''" :identity-name="session.context?.identityName || ''" :organization-name="session.context?.organizationName || ''" @switch="router.push({name:'workRole'})" />
    <AppLoading v-if="loading || busy" :text="busy ? copy.saving : copy.loading" /><p v-if="notice" class="notice-line" role="alert">{{ notice }}</p><button v-if="failed" class="btn btn-secondary" @click="load">{{ copy.retry }}</button>
    <form v-if="!loading && !failed" class="card stack" @submit.prevent="save">
      <h2 class="section-title">{{ sourceKind ? copy.participants : (draft.id ? copy.edit : copy.create) }}</h2>
      <template v-if="!sourceKind">
        <label class="field"><span class="field-label">{{ copy.name }}</span><input v-model="draft.title" class="field-input" :disabled="blocked" required /></label>
        <label class="field"><span class="field-label">{{ copy.location }}</span><input v-model="draft.location" class="field-input" :disabled="blocked" /></label>
        <label class="field"><span class="field-label">{{ copy.description }}</span><textarea v-model="draft.description" class="field-textarea" :disabled="blocked"></textarea></label>
        <label v-if="draft.id" class="field"><span class="field-label">{{ copy.scope }}</span><select v-model="draft.scope" class="field-input" :disabled="blocked" @change="scopeChanged"><option v-for="scope in ['instance','following','series']" :key="scope" :value="scope">{{ copy[scope] }}</option></select></label>
        <label class="row"><input v-model="draft.allDay" type="checkbox" :disabled="blocked" @change="allDayChanged" />{{ copy.allDay }}</label>
        <p v-if="draft.allDay" class="muted">{{ copy.endExclusive }}</p>
        <div class="form-grid"><label v-for="field in ['startDate','endDate']" :key="field" class="field"><span class="field-label">{{ copy[field] }}</span><input v-model="draft[field]" type="date" class="field-input" :disabled="blocked" required /></label></div>
        <div v-if="!draft.allDay" class="form-grid"><label v-for="field in ['startTime','endTime']" :key="field" class="field"><span class="field-label">{{ copy[field] }}</span><input v-model="draft[field]" type="time" class="field-input" :disabled="blocked" required /></label></div>
        <label class="field"><span class="field-label">{{ copy.recurrence }}</span><select v-model="draft.recurrence.frequency" class="field-input" :disabled="blocked || (draft.id && draft.scope!=='series')"><option v-for="frequency in frequencies" :key="frequency" :value="frequency">{{ copy[frequency] }}</option></select></label>
        <template v-if="draft.recurrence.frequency!=='none'">
          <label class="field"><span class="field-label">{{ copy.interval }}</span><input v-model.number="draft.recurrence.interval" type="number" min="1" max="99" class="field-input" :disabled="blocked || (draft.id && draft.scope!=='series')" /></label>
          <div v-if="draft.recurrence.frequency==='weekly'" class="row row-wrap"><label v-for="(weekday,index) in copy.weekdays" :key="weekday" class="selection-option-card"><input v-model="draft.recurrence.weekdays" type="checkbox" :value="index+1" :disabled="blocked || (draft.id && draft.scope!=='series')" />{{ weekday }}</label></div>
          <select v-model="endMode" class="field-input" :aria-label="copy.repeatEnd" :disabled="blocked || (draft.id && draft.scope!=='series')"><option value="none">{{ copy.unlimited }}</option><option value="until">{{ copy.byDate }}</option><option value="count">{{ copy.byCount }}</option></select>
          <label v-if="endMode==='until'" class="field"><span class="field-label">{{ copy.until }}</span><input v-model="draft.recurrence.until" type="date" class="field-input" :disabled="blocked || (draft.id && draft.scope!=='series')" /></label>
          <label v-if="endMode==='count'" class="field"><span class="field-label">{{ copy.count }}</span><input v-model.number="draft.recurrence.count" type="number" min="1" max="1000" class="field-input" :disabled="blocked || (draft.id && draft.scope!=='series')" /></label>
        </template>
        <label class="field"><span class="field-label">{{ copy.reminders }}</span><select v-model.number="reminder" class="field-input" :disabled="blocked"><option v-for="option in reminderOptions" :key="option.value" :value="option.value">{{ copy[option.label] }}</option></select></label>
        <select v-model="draft.visibility" class="field-input" :aria-label="copy.participants" :disabled="blocked || Boolean(draft.id)"><option value="private">{{ copy.private }}</option><option value="organization">{{ copy.organization }}</option></select>
      </template>
      <template v-if="sourceKind || draft.visibility==='organization'"><h3 v-if="!sourceKind" class="section-title">{{ copy.participants }}</h3><CalendarConditions v-model="draft.targets" :metadata="metadata" :disabled="blocked || (draft.id && draft.scope!=='series')" /></template>
      <div class="card-actions"><button type="button" class="btn btn-secondary" :disabled="busy" @click="router.back()">{{ copy.cancel }}</button><button class="btn btn-primary" :disabled="blocked">{{ copy.save }}</button></div>
    </form>
  </main>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {onBeforeRouteLeave,useRoute,useRouter} from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import CalendarConditions from '@/components/CalendarConditions.vue';
import copy from '@/locales/zh-CN/shared/calendar.js';
import view from '@/shared/calendarView.js';
import {callApi,requireSuccess,errorText} from '@/runtime/api.js';
import {session} from '@/runtime/session.js';
import {formatAbsoluteDate} from '@/runtime/dateTime.js';
const route=useRoute(),router=useRouter(),sourceKind=String(route.query.sourceKind || ''),sourceId=String(route.query.sourceId || '');
const draft=ref(view.blank(String(route.query.date || formatAbsoluteDate(new Date())))),metadata=ref({people:[],departments:[],identities:[],workGroups:[],timezoneOffset:480});
const loading=ref(true),busy=ref(false),failed=ref(false),notice=ref(''),saved=ref(false),endMode=ref('none'),reminder=ref(15),original=ref(null);
const blocked=computed(()=>loading.value||busy.value||failed.value||saved.value);
const frequencies=['none','daily','weekly','monthly','yearly'];
const reminderOptions=[{value:-1,label:'reminderNone'},{value:0,label:'reminderStart'},{value:5,label:'reminderFive'},{value:15,label:'reminderFifteen'},{value:30,label:'reminderThirty'},{value:60,label:'reminderHour'},{value:1440,label:'reminderDay'}];
let generation=0,disposed=false,lastPayload='',requestId='';
async function load(){const own=++generation;loading.value=true;failed.value=false;notice.value='';try{const config=requireSuccess(await callApi(sourceKind ? 'getCalendarParticipants' : 'getCalendarConfiguration',sourceKind ? {sourceKind,sourceId,edit:true} : {}));if(own!==generation||disposed)return;metadata.value=config;
  if(sourceKind){draft.value.targets=config.targets || [{type:'self'}];draft.value.version=config.version;}
  else if(route.query.id){const date=String(route.query.date);const result=requireSuccess(await callApi('getCalendar',{...view.period(date,'week',config.timezoneOffset),managed:true,detailId:route.query.id,occurrenceDate:date}));if(own!==generation||disposed)return;const item=result.items.find(item=>item.id===route.query.id&&item.occurrenceDate===date);if(!item?.canUpdate)throw new Error(copy.unavailable);original.value=item;draft.value=view.edit(item,config.timezoneOffset);endMode.value=draft.value.recurrence.until ? 'until' : draft.value.recurrence.count ? 'count' : 'none';reminder.value=draft.value.reminders?.[0] ?? -1;}
}catch(error){if(own===generation){failed.value=true;notice.value=errorText(error,copy.operationFailed);}}finally{if(own===generation)loading.value=false;}}
function allDayChanged(){if(draft.value.allDay && draft.value.endDate<=draft.value.startDate)draft.value.endDate=view.addDays(draft.value.startDate,1);}
function scopeChanged(){if(draft.value.scope==='series' && original.value?.seriesForm){draft.value.startDate=original.value.seriesForm.startDate;draft.value.endDate=original.value.seriesForm.endDate;draft.value.startTime=original.value.seriesForm.startTime;draft.value.endTime=original.value.seriesForm.endTime;}}
async function save(){if(blocked.value)return;busy.value=true;notice.value='';const own=generation;try{const body=JSON.parse(JSON.stringify(draft.value));if(sourceKind){body.sourceKind=sourceKind;body.sourceId=sourceId;}else{body.reminders=reminder.value<0 ? [] : [reminder.value];if(endMode.value!=='until')delete body.recurrence.until;if(endMode.value!=='count')delete body.recurrence.count;if(body.recurrence.frequency!=='weekly')body.recurrence.weekdays=[];}
  if(!sourceKind&&!body.id){const payload=JSON.stringify(body);if(payload!==lastPayload){lastPayload=payload;requestId=crypto.randomUUID();}body.clientRequestId=requestId;}
  requireSuccess(await callApi(sourceKind ? 'saveCalendarParticipants' : 'saveCalendarEvent',body));if(own!==generation||disposed)return;saved.value=true;busy.value=false;await router.replace({name:'calendar'});
}catch(error){if(own===generation)notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
watch(()=>session.context,()=>{generation++;draft.value=view.blank(String(route.query.date || formatAbsoluteDate(new Date())));load();},{immediate:true});
onBeforeRouteLeave(()=>!busy.value);
onBeforeUnmount(()=>{disposed=true;generation++;});
</script>
