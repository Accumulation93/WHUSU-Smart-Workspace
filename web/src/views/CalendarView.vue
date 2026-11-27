<template>
  <main class="page stack">
    <WorkspaceHero :page-name="copy.title" :person-name="session.context?.name || ''" :identity-name="session.context?.identityName || ''" :organization-name="session.context?.organizationName || ''" @switch="router.push({name:'workRole'})" />
    <nav class="tabs calendar-primary-tabs">
      <button v-for="tab in mainTabs" :key="tab.key" class="tab" :class="{'tab-active':activeTab===tab.key}" :disabled="Boolean(editorOptions) || panelLocked || busy" @click="switchTab(tab.key)">{{ tab.label }}</button>
    </nav>
    <CalendarRules v-if="activeTab==='rules' && metadata.permissions?.rules" @statechange="ruleState" />
    <CalendarEditor v-if="editorOptions" :options="editorOptions" @cancel="closeEditor" @saved="closeEditor" />
    <AppLoading v-if="loading || busy" :text="busy ? copy.saving : copy.loading" /><div v-if="notice" class="notice-line" role="alert">{{ notice }}<button class="btn btn-secondary" @click="load">{{ copy.retry }}</button></div>
    <template v-if="activeTab==='calendar' && !editorOptions">
    <section class="section-control-card stack">
      <div class="panel-head calendar-heading"><h2 class="section-title">{{ copy.title }}</h2><button class="btn btn-primary" :disabled="loading" @click="create">{{ copy.create }}</button></div>
      <div class="tabs calendar-view-tabs"><button v-for="value in modes" :key="value" class="tab" :class="{'tab-active':mode===value}" @click="mode=value">{{ copy[value] }}</button></div>
      <div class="calendar-navigation"><button class="btn btn-secondary ui-inline-control" :aria-label="copy.previous" @click="navigate(-1)"><UiIcon name="chevron-left" /></button><input v-model="selected" type="date" class="field-input ui-inline-control" :aria-label="copy.startDate" /><button class="btn btn-secondary ui-inline-control" :aria-label="copy.next" @click="navigate(1)"><UiIcon name="chevron-right" /></button><button class="btn btn-secondary ui-inline-control" @click="selected=today">{{ copy.today }}</button></div>
      <div class="field search-field"><UiIcon name="search" /><input v-model="query" class="field-input" :placeholder="copy.search" :aria-label="copy.search" /></div>
      <div class="calendar-filters">
        <label class="field"><span class="field-label">{{ copy.source }}</span><select v-model="source" class="field-input" :aria-label="copy.source"><option value="">{{ copy.allSources }}</option><option v-for="value in ['manual','venue_booking','venue_activity']" :key="value" :value="value">{{ copy[value] }}</option></select></label>
        <label v-if="metadata.permissions?.manage" class="field"><span class="field-label">{{ copy.viewingRange }}</span><select v-model="managed" class="field-input" :aria-label="copy.viewingRange" :disabled="loading" @change="changeManaged"><option :value="false">{{ copy.ownScheduleScope }}</option><option :value="true">{{ copy.readableScheduleScope }}</option></select></label>
      </div>
    </section>
    <section v-if="mode==='month'" class="card calendar-grid" :aria-label="copy.month">
      <span v-for="weekday in copy.weekdays" :key="weekday" class="calendar-weekday muted">{{ weekday }}</span>
      <button v-for="day in days" :key="day.date" class="calendar-date" :class="{'calendar-selected':day.selected,'calendar-today':day.today,'calendar-outside':day.outside}" :aria-label="dayLabel(day)" :aria-pressed="day.selected" @click="selected=day.date"><strong>{{ day.label }}</strong><span class="calendar-marker-row" aria-hidden="true"><span v-if="listReady && day.items.length" class="calendar-marker"></span></span></button>
    </section>
    <section v-if="mode==='week' || mode==='day'" class="calendar-timeline card">
      <div class="calendar-columns" :style="{'--calendar-columns':days.length}">
        <section v-for="day in days" :key="day.date" class="stack calendar-column">
          <strong>{{ day.date }}</strong><span class="muted">{{ copy.allDay }}</span>
          <button v-for="item in day.allDayItems" :key="item.id+item.occurrenceDate" class="calendar-event list-row" @click="open(item)">
            <strong class="calendar-event-title">{{ item.title }}</strong><span class="calendar-event-meta muted">{{ timeRange(item) }}</span><span v-if="item.location" class="calendar-event-meta muted">{{ item.location }}</span><span class="chip chip-sky">{{ copy[item.sourceKind] }}</span>
          </button>
          <div v-for="hour in day.hours" :key="hour.label" class="calendar-hour">
            <span class="muted">{{ hour.label }}</span>
            <button v-for="item in hour.items" :key="item.key" class="calendar-event list-row" @click="open(item)">
              <strong class="calendar-event-title">{{ item.title }}</strong><span class="calendar-event-meta muted">{{ timeRange(item) }}</span><span v-if="item.location" class="calendar-event-meta muted">{{ item.location }}</span><span class="chip chip-sky">{{ copy[item.sourceKind] }}</span><span v-if="item.conflict" class="chip chip-orange">{{ copy.conflictHint }}</span>
            </button>
          </div>
        </section>
      </div>
    </section>
    <section v-else class="stack">
      <div class="calendar-results-heading"><h2 class="section-title">{{ mode==='month' ? selected : selected.slice(0,7) }}</h2><span v-if="mode==='month' && listReady" class="calendar-count muted">{{ countLabel(visibleItems.length) }}</span></div><p v-if="!visibleItems.length && !loading && !notice" class="empty-state card">{{ copy.empty }}</p>
      <button v-for="item in visibleItems" :key="item.id+item.occurrenceDate" class="card calendar-event" @click="open(item)"><strong class="calendar-event-title">{{ item.title }}</strong><span class="calendar-event-meta muted">{{ timeRange(item) }}</span><span v-if="item.location" class="calendar-event-meta muted">{{ item.location }}</span><span class="chip chip-sky">{{ copy[item.sourceKind] }}</span></button>
    </section>
    </template>
    <GlassDialog v-if="detail && !confirmation" :title="detail.title" :busy="busy" @close="closeDetail"><div class="stack calendar-detail-body"><span class="chip chip-sky">{{ copy[detail.sourceKind] }}</span><strong>{{ timeRange(detail) }}</strong><p v-if="detail.location" class="break-all">{{ detail.location }}</p><p v-if="detail.description" class="break-all">{{ detail.description }}</p>
      <section class="stack"><h3 class="section-title">{{ copy.participantsCount.replace('{count}',String(detail.participants?.length || 0)) }}</h3><div v-if="detail.participants?.length" class="card-actions"><button class="btn btn-secondary btn-sm" :aria-expanded="participantsExpanded" @click="participantsExpanded=!participantsExpanded">{{ participantsExpanded ? copy.participantsCollapse : copy.participantsExpand }}</button></div><ReadonlyPersonTable v-if="participantsExpanded || !detail.participants?.length" :people="detail.participants || []" :empty-text="copy.noParticipants" :position-empty-text="copy.noPosition" /></section>
      <button class="btn btn-secondary" @click="download(detail)">{{ copy.download }}</button></div><template #footer>
        <div class="calendar-detail-footer">
          <div v-if="detail.canUpdate || detail.canCancel" class="calendar-detail-actions">
            <button v-if="detail.canUpdate" class="btn btn-primary" :disabled="busy" @click="edit(detail)">{{ copy.edit }}</button>
            <button v-if="detail.canCancel" class="btn btn-danger" :disabled="busy" @click="askChange('cancel')">{{ copy.cancelEvent }}</button>
          </div>
          <div class="calendar-detail-actions">
            <button v-if="detail.attending && detail.visibility!=='private'" class="btn btn-secondary" :disabled="busy" @click="askChange('leave')">{{ copy.leave }}</button>
            <button class="btn btn-secondary" :disabled="busy" @click="closeDetail">{{ copy.close }}</button>
          </div>
        </div>
      </template></GlassDialog>
    <GlassDialog v-if="confirmation" :title="confirmation.action==='leave' ? copy.leave : copy.cancelEvent" :busy="busy" @close="closeConfirmation">
      <div class="stack">
        <strong class="break-all">{{ confirmation.item.title }}</strong>
        <p>{{ confirmation.action==='leave' ? copy.leaveConfirm : copy.cancelConfirm }}</p>
        <label class="field"><span class="field-label">{{ copy.scope }}</span><select v-model="confirmation.scope" class="field-input" :aria-label="copy.scope" :disabled="busy"><option v-for="scope in ['instance','following','series']" :key="scope" :value="scope">{{ copy[scope] }}</option></select></label>
        <div v-if="confirmationNotice" class="notice-line" role="alert">{{ confirmationNotice }}</div>
      </div>
      <template #footer><button class="btn btn-secondary" :disabled="busy" @click="closeConfirmation">{{ copy.cancel }}</button><button class="btn btn-danger" :disabled="busy" @click="mutate">{{ confirmation.action==='leave' ? copy.confirmLeave : copy.confirmedCancel }}</button></template>
    </GlassDialog>
    <section v-if="activeTab==='system'" class="card stack"><h2 class="section-title">{{ copy.systemCalendar }}</h2><div class="stack"><p>{{ copy.subscriptionHint }}</p><p>{{ copy.subscriptionPrivacy }}</p><button class="btn btn-primary" :disabled="busy" @click="subscriptionAction='create'">{{ copy.subscribe }}</button><div v-if="subscriptionData" class="stack"><p>{{ copy.subscriptionSetup }}</p><label v-for="field in ['server','username','password']" :key="field" class="field"><span class="field-label">{{ copy[{server:'subscriptionServer',username:'subscriptionUsername',password:'subscriptionPassword'}[field]] }}</span><input class="field-input" readonly :value="subscriptionData[field]" /></label><p class="break-all">{{ subscriptionData.url }}</p></div><button v-if="subscriptionData" class="btn btn-secondary" @click="copySubscription">{{ copy.copyAddress }}</button><button class="btn btn-danger" :disabled="busy" @click="subscriptionAction='revoke'">{{ copy.revokeSubscription }}</button><button class="btn btn-secondary" :disabled="busy" @click="download()">{{ copy.download }}</button></div></section>
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
import CalendarEditor from '@/components/CalendarEditor.vue';
import ReadonlyPersonTable from '@/components/ReadonlyPersonTable.vue';
import copy from '@/locales/zh-CN/shared/calendar.js';
import timeCopy from '@/locales/zh-CN/shared/time.js';
import messageCopy from '@/locales/zh-CN/shared/messageFacts.js';
import view from '@/shared/calendarView.js';
import {callApi,requireSuccess,errorText} from '@/runtime/api.js';
import {session} from '@/runtime/session.js';
import {formatAbsoluteDate,formatTimeRange,formatDisplayTime} from '@/runtime/dateTime.js';
import {outputFile} from '@/runtime/fileIO.js';
const router=useRouter(),route=useRoute(),modes=['month','week','day','list'];
const today=ref(formatAbsoluteDate(new Date())),selected=ref(String(route.query.date||today.value)),mode=ref('month'),query=ref(''),source=ref(''),managed=ref(false),items=ref([]),metadata=ref({permissions:{},timezoneOffset:480});
const listReady=ref(false),loading=ref(false),busy=ref(false),notice=ref(''),detail=ref(null),confirmation=ref(null),confirmationNotice=ref(''),activeTab=ref(route.query.area === 'management'||route.query.copyKind==='calendar.rules'?'rules':'calendar'),editorOptions=ref(null),panelLocked=ref(false),subscriptionData=ref(null),subscriptionAction=ref('');
let generation=0,disposed=false,hasContext=false,loadedQuery='';
const participantsExpanded=ref(false);
const mainTabs=computed(()=>[{key:'calendar',label:copy.title},...(metadata.value.permissions?.rules?[{key:'rules',label:copy.ruleManage}]:[]),{key:'system',label:copy.systemCalendar}]);
function switchTab(tab){if(editorOptions.value||panelLocked.value||busy.value)return;activeTab.value=tab;detail.value=null;confirmation.value=null;subscriptionData.value=null;subscriptionAction.value='';if(tab==='calendar')load();}
function closeEditor(){editorOptions.value=null;load();}
function clearCopyEntry(){if(route.query.copyKind==='calendar.rules'){const next={...route.query};delete next.copyKind;delete next.copyId;router.replace({query:next});}}
function ruleState(locked){panelLocked.value=locked;if(locked)clearCopyEntry();}
watch(detail,()=>{participantsExpanded.value=false;});
const timeRange=item=>view.timeText(item,metadata.value.timezoneOffset,{formatAbsoluteDate,formatTimeRange,formatDisplayTime},timeCopy,messageCopy);
const countLabel=count=>copy.scheduleCount.replace('{count}',String(count));
const dayLabel=day=>listReady.value ? copy.calendarDayLabel.replace('{date}',day.date).replace('{count}',String(day.items.length)) : day.date;
const range=computed(()=>view.period(selected.value,mode.value,metadata.value.timezoneOffset));
const filtered=computed(()=>items.value.filter(item=>(!source.value||item.sourceKind===source.value)&&[item.title,item.location].join(' ').toLowerCase().includes(query.value.trim().toLowerCase())));
const days=computed(()=>view.days(selected.value,mode.value,metadata.value.timezoneOffset,filtered.value,today.value).map(day=>view.timeline(day,metadata.value.timezoneOffset)));
const visibleItems=computed(()=>mode.value==='month' ? (days.value.find(day=>day.date===selected.value)?.items || []) : filtered.value);
const current=own=>own===generation&&!disposed&&!document.hidden;
async function load() { const own=++generation;const input={...range.value,managed:managed.value};const queryKey=JSON.stringify(input);if(loadedQuery!==queryKey)items.value=[];listReady.value=false;loading.value=true;notice.value='';try{const result=requireSuccess(await callApi('getCalendar',input));if(current(own)){items.value=result.items;loadedQuery=queryKey;listReady.value=true;}}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{if(current(own))loading.value=false;} }
async function initialize(){
  const own=++generation;items.value=[];listReady.value=false;loading.value=true;notice.value='';
  try{
    const result=requireSuccess(await callApi('getCalendarConfiguration',{}));
    if(!current(own))return;
    metadata.value=result;
    if(!result.permissions?.manage)managed.value=false;
    if(activeTab.value==='rules'&&!result.permissions?.rules)activeTab.value='calendar';
    today.value=formatAbsoluteDate(new Date());
    await load();
    if(route.query.id&&route.query.date)await open({id:String(route.query.id),occurrenceDate:String(route.query.date)});
  }catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}
  finally{if(current(own))loading.value=false;}
}
function changeManaged(){
  if(!metadata.value.permissions?.manage)managed.value=false;
  items.value=[];listReady.value=false;detail.value=null;confirmation.value=null;confirmationNotice.value='';
  load();
}
function navigate(amount){selected.value=view.move(selected.value,mode.value,amount);}
function create(){editorOptions.value={date:selected.value};}
function edit(item){detail.value=null;editorOptions.value={id:item.id,date:item.occurrenceDate};}
async function open(item){if(busy.value)return;const own=generation;busy.value=true;notice.value='';try{const result=requireSuccess(await callApi('getCalendar',{...range.value,managed:managed.value,detailId:item.id,occurrenceDate:item.occurrenceDate}));if(current(own)){detail.value=result.items.find(value=>value.id===item.id&&value.occurrenceDate===item.occurrenceDate);if(!detail.value)notice.value=copy.unavailable;}}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
function closeDetail(){if(!busy.value)detail.value=null;}
function closeConfirmation(){if(busy.value)return;confirmation.value=null;confirmationNotice.value='';}
function askChange(action){
  const item=detail.value;
  if(!item||busy.value)return;
  if(action==='leave' ? !item.attending||item.visibility==='private' : action!=='cancel'||!item.canCancel)return;
  confirmationNotice.value='';
  confirmation.value={item:Object.freeze({id:item.id,version:item.version,occurrenceDate:item.occurrenceDate,title:item.title}),action,scope:'instance'};
}
async function mutate(){
  const pending=confirmation.value;
  if(!pending||busy.value)return;
  const payload={id:pending.item.id,version:pending.item.version,occurrenceDate:pending.item.occurrenceDate,scope:pending.scope,action:pending.action};
  busy.value=true;confirmationNotice.value='';const own=generation;
  try{
    requireSuccess(await callApi('changeCalendarParticipation',payload));
    if(!current(own)||confirmation.value!==pending)return;
    confirmation.value=null;detail.value=null;await load();
  }catch(error){if(current(own)&&confirmation.value===pending)confirmationNotice.value=errorText(error,copy.operationFailed);}
  finally{busy.value=false;}
}
async function download(item){if(busy.value)return;const own=generation;busy.value=true;try{const result=requireSuccess(await callApi('exportCalendar',{...range.value,id:item?.id,occurrenceDate:item?.occurrenceDate}));if(!current(own))return;await outputFile({blob:new Blob([result.content],{type:'text/calendar;charset=utf-8'}),fileName:'calendar.ics',modes:['save','systemShare']});}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
async function subscription(action){busy.value=true;const own=generation;try{const result=requireSuccess(await callApi('manageCalendarSubscription',{action}));if(current(own)){subscriptionData.value=action==='revoke' ? null : result;subscriptionAction.value='';}}catch(error){if(current(own))notice.value=errorText(error,copy.operationFailed);}finally{busy.value=false;}}
async function copySubscription(){if(subscriptionData.value)await navigator.clipboard.writeText(subscriptionData.value.url);}
function visibility(){generation++;detail.value=null;confirmation.value=null;confirmationNotice.value='';subscriptionData.value=null;subscriptionAction.value='';if(!document.hidden)initialize();}
function contextChanged(){if(hasContext){activeTab.value='calendar';clearCopyEntry();}hasContext=true;generation++;items.value=[];listReady.value=false;metadata.value={permissions:{},timezoneOffset:480};editorOptions.value=null;panelLocked.value=false;managed.value=false;visibility();}
watch([selected,mode],()=>{if(selected.value)load();});
watch(()=>session.context,contextChanged,{immediate:true});
document.addEventListener('visibilitychange',visibility);
onBeforeUnmount(()=>{disposed=true;generation++;document.removeEventListener('visibilitychange',visibility);});
</script>
<style scoped>
.calendar-detail-body > .chip { width:auto;max-width:100%;align-self:flex-start;white-space:normal; }
.calendar-detail-footer { width:100%;display:flex;flex-direction:column;gap:var(--ui-field-gap); }
.calendar-detail-actions { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-field-gap); }
.calendar-detail-actions > .btn { min-width:0;height:auto; }
.calendar-detail-actions > .btn:only-child { grid-column:1 / -1; }
.calendar-grid { display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:var(--ui-inline-gap); }
.calendar-weekday { text-align:center; }
.calendar-date { display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:var(--ui-label-gap);font:inherit;font-size:var(--ui-type-body);line-height:var(--ui-leading-control);min-height:var(--ui-field-control-height);padding:var(--ui-compact-padding-y) var(--ui-compact-padding-x);border:var(--ui-result-label-border);border-radius:var(--ui-control-radius);background:var(--ui-result-label-bg);color:var(--ui-text); }
.calendar-selected { background:var(--ui-option-selected-bg); }
.calendar-today strong { text-decoration:underline; }
.calendar-outside { color:var(--ui-text-muted); }
.calendar-marker-row { display:flex;align-items:center;justify-content:center;height:var(--ui-inline-gap); }
.calendar-marker { width:var(--ui-inline-gap);height:var(--ui-inline-gap);border-radius:50%;background:var(--ui-blue-700); }
.calendar-heading > .section-title { flex:1;min-width:0; }
.calendar-heading > .btn { width:auto;flex:none; }
.calendar-results-heading { display:flex;align-items:center;gap:var(--ui-list-gap);flex-wrap:wrap; }
.calendar-count { font-size:var(--ui-type-caption);line-height:var(--ui-leading-body); }
.calendar-event { font-family:inherit;font-size:var(--ui-type-body);line-height:var(--ui-leading-body);display:flex;flex-direction:column;align-items:flex-start;gap:var(--ui-field-gap);text-align:left;width:100%;min-width:0;overflow-wrap:anywhere; }
.calendar-event-title { font-size:var(--ui-type-emphasis);line-height:var(--ui-leading-heading); }
.calendar-event-meta { font-size:var(--ui-type-meta);line-height:var(--ui-leading-body); }
.calendar-event > .chip { width:auto;max-width:100%;align-self:flex-start;white-space:normal; }
.calendar-timeline { overflow-x:auto; }
.calendar-columns { display:grid;grid-template-columns:repeat(var(--calendar-columns),minmax(0,1fr));gap:var(--ui-field-gap); }
.calendar-column { min-width:0; }
.calendar-hour { display:flex;flex-direction:column;gap:var(--ui-field-gap);min-height:var(--ui-field-control-height);padding-block:var(--ui-compact-padding-y);border-top:var(--ui-result-label-border); }
.search-field { display:flex;flex-direction:row;align-items:center;gap:var(--ui-inline-gap); }
.search-field .field-input { flex:1;min-width:0; }
.calendar-actions { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-field-gap); }
.calendar-actions > button { width:100%;min-width:0;margin:0;display:flex;align-items:center;justify-content:center;text-align:center; }
.calendar-actions--with-rules > button { padding-inline:var(--ui-compact-padding-x); }
@media (min-width:390px){.calendar-actions--with-rules { grid-template-columns:repeat(3,minmax(0,1fr)); }}
.calendar-navigation { display:grid;grid-template-columns:var(--ui-field-control-height) minmax(0,1fr) var(--ui-field-control-height) auto;align-items:stretch;gap:var(--ui-inline-gap); }
.calendar-navigation > * { width:100%;min-width:0;margin:0;height:auto;min-height:var(--ui-field-control-height); }
.calendar-filters { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:var(--ui-field-gap); }
.calendar-filters > .field { min-width:0; }
.calendar-filters > .field:only-child { grid-column:1 / -1; }
.calendar-filters select { width:100%;min-width:0; }
@media(max-width:519px){
  .calendar-navigation { grid-template-columns:var(--ui-field-control-height) minmax(0,1fr) var(--ui-field-control-height); }
  .calendar-navigation > button:last-child { grid-column:1 / -1; }
}
@media(max-width:899px){.calendar-columns { grid-template-columns:repeat(var(--calendar-columns),minmax(180px,1fr)); }}
</style>
