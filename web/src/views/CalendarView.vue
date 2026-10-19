<template>
  <main class="page stack">
    <WorkspaceHero :page-name="copy.title" :person-name="session.context?.name || ''" :identity-name="session.context?.identityName || ''" :organization-name="session.context?.organizationName || ''" @switch="router.push({name:'workRole'})" />
    <section class="section-control-card stack">
      <div class="row row-wrap"><button class="btn btn-primary" :disabled="loading" @click="create">{{ copy.create }}</button><button v-if="metadata.permissions?.rules" class="btn btn-secondary" @click="rulesVisible=!rulesVisible">{{ copy.ruleManage }}</button><button class="btn btn-secondary" @click="systemVisible=true">{{ copy.systemCalendar }}</button></div>
      <div class="tabs"><button v-for="value in modes" :key="value" class="tab" :class="{'tab-active':mode===value}" @click="mode=value">{{ copy[value] }}</button></div>
      <div class="ui-inline-control-row"><button class="btn btn-secondary ui-inline-control" :aria-label="copy.previous" @click="navigate(-1)"><UiIcon name="chevron-left" /></button><input v-model="selected" type="date" class="field-input ui-inline-control" :aria-label="copy.startDate" /><button class="btn btn-secondary ui-inline-control" :aria-label="copy.next" @click="navigate(1)"><UiIcon name="chevron-right" /></button><button class="btn btn-secondary ui-inline-control" @click="selected=today">{{ copy.today }}</button></div>
      <div class="field search-field"><UiIcon name="search" /><input v-model="query" class="field-input" :placeholder="copy.search" :aria-label="copy.search" /></div>
      <div class="row row-wrap"><select v-model="source" class="field-input" :aria-label="copy.source"><option value="">{{ copy.allSources }}</option><option v-for="value in ['manual','venue_booking','venue_activity']" :key="value" :value="value">{{ copy[value] }}</option></select><label v-if="metadata.permissions?.manage" class="row"><input v-model="managed" type="checkbox" />{{ copy.manage }}</label></div>
    </section>
    <CalendarRules v-if="rulesVisible" />
    <AppLoading v-if="loading || busy" :text="busy ? copy.saving : copy.loading" /><div v-if="notice" class="notice-line" role="alert">{{ notice }}<button class="btn btn-secondary" @click="load">{{ copy.retry }}</button></div>
    <section v-if="mode==='month'" class="card calendar-grid" :aria-label="copy.month">
      <span v-for="weekday in copy.weekdays" :key="weekday" class="calendar-weekday muted">{{ weekday }}</span>
      <button v-for="day in days" :key="day.date" class="calendar-date" :class="{'calendar-selected':day.selected,'calendar-today':day.today,'calendar-outside':day.outside}" :aria-label="day.date" :aria-pressed="day.selected" @click="selected=day.date"><strong>{{ day.label }}</strong><span v-if="day.items.length" class="calendar-count">{{ day.items.length }}</span></button>
    </section>
    <section v-if="mode==='week' || mode==='day'" class="calendar-timeline card">
      <div class="calendar-columns" :style="{'--calendar-columns':days.length}"><section v-for="day in days" :key="day.date" class="stack calendar-column"><strong>{{ day.date }}</strong><span class="muted">{{ copy.allDay }}</span><button v-for="item in day.allDayItems" :key="item.id+item.occurrenceDate" class="calendar-event list-row" @click="open(item)">{{ item.title }}</button><div v-for="hour in day.hours" :key="hour.label" class="calendar-hour"><span class="muted">{{ hour.label }}</span><button v-for="item in hour.items" :key="item.key" class="calendar-event list-row" @click="open(item)"><strong>{{ item.title }}</strong><span>{{ time(item.startAt) }} — {{ time(item.endAt) }}</span><span v-if="item.conflict" class="chip chip-orange">{{ copy.conflictHint }}</span></button></div></section></div>
    </section>
    <section v-else class="stack">
      <h2 class="section-title">{{ mode==='month' ? selected : selected.slice(0,7) }}</h2><p v-if="!visibleItems.length && !loading && !notice" class="empty-state card">{{ copy.empty }}</p>
      <button v-for="item in visibleItems" :key="item.id+item.occurrenceDate" class="card calendar-event" @click="open(item)"><span class="chip chip-sky">{{ copy[item.sourceKind] }}</span><strong>{{ item.title }}</strong><span class="muted">{{ item.allDay ? copy.allDay : time(item.startAt) }} — {{ time(item.endAt) }}</span><span>{{ item.location }}</span></button>
    </section>
    <GlassDialog v-if="detail && !confirmation" :title="detail.title" :busy="busy" @close="detail=null"><div class="stack"><span class="chip chip-sky">{{ copy[detail.sourceKind] }}</span><strong>{{ time(detail.startAt) }} — {{ time(detail.endAt) }}</strong><p>{{ detail.location }}</p><p class="break-all">{{ detail.description }}</p><h3 class="section-title">{{ copy.participants }} · {{ detail.participants?.length || 0 }}</h3><article v-for="(person,index) in detail.participants" :key="index" class="list-row stack-tight"><strong>{{ person.name }}</strong><span v-for="(position,i) in person.positions" :key="i" class="muted">{{ [position.identityCategory,position.department,position.workGroup].filter(Boolean).join(' · ') }}</span><span v-if="!person.positions.length" class="muted">{{ copy.noPosition }}</span></article><button class="btn btn-secondary" @click="download(detail)">{{ copy.download }}</button></div><template #footer><button v-if="detail.canUpdate" class="btn btn-primary" @click="edit(detail)">{{ copy.edit }}</button><button v-if="detail.attending && detail.visibility!=='private'" class="btn btn-secondary" @click="confirmation={item:detail,action:'leave',scope:'instance'}">{{ copy.leave }}</button><button v-if="detail.canCancel" class="btn btn-danger" @click="confirmation={item:detail,action:'cancel',scope:'instance'}">{{ copy.cancelEvent }}</button></template></GlassDialog>
    <GlassDialog v-if="confirmation" :title="confirmation.action==='leave' ? copy.leave : copy.cancelEvent" :busy="busy" @close="confirmation=null"><p>{{ confirmation.action==='leave' ? copy.leaveConfirm : copy.cancelConfirm }}</p><strong>{{ confirmation.item.title }}</strong><select v-model="confirmation.scope" class="field-input" :aria-label="copy.scope"><option v-for="scope in ['instance','following','series']" :key="scope" :value="scope">{{ copy[scope] }}</option></select><template #footer><button class="btn btn-secondary" :disabled="busy" @click="confirmation=null">{{ copy.close }}</button><button class="btn btn-danger" :disabled="busy" @click="mutate">{{ copy.confirmedCancel }}</button></template></GlassDialog>
    <GlassDialog v-if="systemVisible && !subscriptionAction" :title="copy.systemCalendar" :busy="busy" @close="systemVisible=false"><div class="stack"><p>{{ copy.subscriptionHint }}</p><p>{{ copy.subscriptionPrivacy }}</p><button class="btn btn-primary" :disabled="busy" @click="subscriptionAction='create'">{{ copy.subscribe }}</button><div v-if="subscriptionData" class="stack"><p>{{ copy.subscriptionSetup }}</p><label v-for="field in ['server','username','password']" :key="field" class="field"><span class="field-label">{{ copy[{server:'subscriptionServer',username:'subscriptionUsername',password:'subscriptionPassword'}[field]] }}</span><input class="field-input" readonly :value="subscriptionData[field]" /></label><p class="break-all">{{ subscriptionData.url }}</p></div><button v-if="subscriptionData" class="btn btn-secondary" @click="copySubscription">{{ copy.copyAddress }}</button><button class="btn btn-danger" :disabled="busy" @click="subscriptionAction='revoke'">{{ copy.revokeSubscription }}</button><button class="btn btn-secondary" :disabled="busy" @click="download()">{{ copy.download }}</button></div></GlassDialog>
    <GlassDialog v-if="subscriptionAction" :title="copy.systemCalendar" :busy="busy" @close="subscriptionAction=''">
      <p>{{ subscriptionAction==='revoke' ? copy.subscriptionStopConfirm : copy.subscriptionResetConfirm }}</p>
      <template #footer><button class="btn btn-secondary" :disabled="busy" @click="subscriptionAction=''">{{ copy.cancel }}</button><button class="btn btn-primary" :disabled="busy" @click="subscription(subscriptionAction)">{{ copy.save }}</button></template>
    </GlassDialog>
  </main>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useRouter,useRoute} from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import UiIcon from '@/components/UiIcon.vue';
import GlassDialog from '@/components/GlassDialog.vue';
import CalendarRules from '@/components/CalendarRules.vue';
import copy from '@/locales/zh-CN/shared/calendar.js';
import view from '@/shared/calendarView.js';
import {callApi,requireSuccess,errorText} from '@/runtime/api.js';
import {session} from '@/runtime/session.js';
import {formatAbsoluteDate,formatListTime} from '@/runtime/dateTime.js';
import {outputFile} from '@/runtime/fileIO.js';
const router=useRouter(),route=useRoute(),modes=['month','week','day','list'];
const today=ref(formatAbsoluteDate(new Date())),selected=ref(String(route.query.date||today.value)),mode=ref('month'),query=ref(''),source=ref(''),managed=ref(false),items=ref([]),metadata=ref({permissions:{},timezoneOffset:480});
const loading=ref(false),busy=ref(false),notice=ref(''),detail=ref(null),confirmation=ref(null),rulesVisible=ref(false),systemVisible=ref(false),subscriptionData=ref(null),subscriptionAction=ref('');
let generation=0,disposed=false;
const time=formatListTime;
const range=computed(()=>view.period(selected.value,mode.value,metadata.value.timezoneOffset));
const filtered=computed(()=>items.value.filter(item=>(!source.value||item.sourceKind===source.value)&&[item.title,item.location].join(' ').toLowerCase().includes(query.value.trim().toLowerCase())));
const days=computed(()=>view.days(selected.value,mode.value,metadata.value.timezoneOffset,filtered.value,today.value).map(day=>view.timeline(day,metadata.value.timezoneOffset)));
const visibleItems=computed(()=>mode.value==='month' ? (days.value.find(day=>day.date===selected.value)?.items || []) : filtered.value);
const current=own=>own===generation&&!disposed&&!document.hidden;
async function load() { const own=++generation;loading.value=true;notice.value='';try{const result=requireSuccess(await callApi('getCalendar',{...range.value,managed:managed.value}));if(current(own))items.value=result.items;}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{if(current(own))loading.value=false;} }
async function initialize() { const own=++generation;try{const result=requireSuccess(await callApi('getCalendarConfiguration',{}));if(!current(own))return;metadata.value=result;today.value=formatAbsoluteDate(new Date());await load();if(route.query.id&&route.query.date)await open({id:String(route.query.id),occurrenceDate:String(route.query.date)});}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);} }
function navigate(amount){selected.value=view.move(selected.value,mode.value,amount);}
function create(){router.push({name:'calendarEdit',query:{date:selected.value}});}
function edit(item){router.push({name:'calendarEdit',query:{id:item.id,date:item.occurrenceDate}});}
async function open(item){if(busy.value)return;const own=generation;busy.value=true;notice.value='';try{const result=requireSuccess(await callApi('getCalendar',{...range.value,managed:managed.value,detailId:item.id,occurrenceDate:item.occurrenceDate}));if(current(own)){detail.value=result.items.find(value=>value.id===item.id&&value.occurrenceDate===item.occurrenceDate);if(!detail.value)notice.value=copy.unavailable;}}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
async function mutate(){const pending=confirmation.value;if(!pending||busy.value)return;busy.value=true;const own=generation;try{requireSuccess(await callApi('changeCalendarParticipation',{id:pending.item.id,version:pending.item.version,occurrenceDate:pending.item.occurrenceDate,scope:pending.scope,action:pending.action}));if(!current(own))return;confirmation.value=null;detail.value=null;await load();}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
async function download(item){if(busy.value)return;const own=generation;busy.value=true;try{const result=requireSuccess(await callApi('exportCalendar',{...range.value,id:item?.id,occurrenceDate:item?.occurrenceDate}));if(!current(own))return;await outputFile({blob:new Blob([result.content],{type:'text/calendar;charset=utf-8'}),fileName:'calendar.ics',modes:['save','systemShare']});}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
async function subscription(action){busy.value=true;const own=generation;try{const result=requireSuccess(await callApi('manageCalendarSubscription',{action}));if(current(own)){subscriptionData.value=action==='revoke' ? null : result;subscriptionAction.value='';}}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
async function copySubscription(){if(subscriptionData.value)await navigator.clipboard.writeText(subscriptionData.value.url);}
function visibility(){generation++;items.value=[];detail.value=null;confirmation.value=null;subscriptionData.value=null;subscriptionAction.value='';if(!document.hidden)initialize();}
watch([selected,mode,managed],()=>{if(selected.value)load();});
watch(()=>session.context,visibility,{immediate:true});
document.addEventListener('visibilitychange',visibility);
onBeforeUnmount(()=>{disposed=true;generation++;document.removeEventListener('visibilitychange',visibility);});
</script>
<style scoped>
.calendar-grid { display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:var(--ui-inline-gap); }
.calendar-weekday { text-align:center; }
.calendar-date { display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:var(--ui-inline-gap);min-height:var(--ui-field-control-height);padding:var(--ui-compact-padding-y) var(--ui-compact-padding-x);border:var(--ui-result-label-border);border-radius:var(--ui-control-radius);background:var(--ui-result-label-bg);color:var(--ui-text); }
.calendar-selected { background:var(--ui-option-selected-bg); }
.calendar-today strong { text-decoration:underline; }
.calendar-outside { color:var(--ui-text-muted); }
.calendar-count { font-size:var(--ui-type-caption); }
.calendar-event { display:flex;flex-direction:column;align-items:flex-start;gap:var(--ui-field-gap);text-align:left;width:100%;min-width:0;overflow-wrap:anywhere; }
.calendar-timeline { overflow-x:auto; }
.calendar-columns { display:grid;grid-template-columns:repeat(var(--calendar-columns),minmax(0,1fr));gap:var(--ui-field-gap); }
.calendar-column { min-width:0; }
.calendar-hour { display:flex;flex-direction:column;gap:var(--ui-field-gap);min-height:var(--ui-field-control-height);padding-block:var(--ui-compact-padding-y);border-top:var(--ui-result-label-border); }
.search-field { display:flex;align-items:center;gap:var(--ui-inline-gap); }
@media(max-width:899px){.calendar-columns { grid-template-columns:repeat(var(--calendar-columns),minmax(180px,1fr)); }}
</style>
