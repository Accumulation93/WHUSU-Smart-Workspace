const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

const HOURS = ['00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','24:00'];
const HOUR_HEIGHT = 64;
const BASE_MIN = 0;
const HEADER_H = 58;
const TEXT_OFFSET = 22;

const ALL_MINUTES = [];
for (let i = 0; i < 60; i++) ALL_MINUTES.push({ value: i, label: String(i).padStart(2, '0') });

function timeToMin(t) { if (!t) return 0; const p = String(t).split(':'); return (parseInt(p[0])||0)*60 + (parseInt(p[1])||0); }
function fmtLocalDate(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function calcBlock(ts, te) { const s=timeToMin(ts),e=timeToMin(te); return { top:Math.round((s-BASE_MIN)/60*HOUR_HEIGHT), height:Math.max(Math.round((e-s)/60*HOUR_HEIGHT),20) }; }

function slotsToIntervals(slots) { return (slots||[]).map(s=>({start:timeToMin(s.timeStart),end:timeToMin(s.timeEnd)})); }
function mergeIntervals(intervals) { if(!intervals.length)return[]; const s=[...intervals].sort((a,b)=>a.start-b.start),m=[s[0]]; for(let i=1;i<s.length;i++){const l=m[m.length-1]; if(s[i].start<=l.end)l.end=Math.max(l.end,s[i].end); else m.push(s[i]);} return m; }
function findOpenGap(rs,re,mo){let c=rs; for(const iv of mo){if(iv.start>c)return c;if(iv.end>c)c=iv.end;if(c>=re)return-1;}return c<re?c:-1;}
function findBlockedOverlap(rs,re,mb){for(const iv of mb){if(iv.start<re&&iv.end>rs)return iv;}return null;}

function buildWeeklyChecked(cv){const a=[false,false,false,false,false,false,false];(cv||[]).forEach(v=>{const n=Number(v);if(n>=1&&n<=7)a[n-1]=true;});return a;}
function buildMonthlyChecked(cv){const a=Array(31).fill(false);(cv||[]).forEach(v=>{const n=Number(v);if(n>=1&&n<=31)a[n-1]=true;});return a;}

Page({
  data: {
    isAdmin: false,
    activeTab: 'browse', // 'browse' | 'bookings' | 'manage'
    loading: false,

    // ── Browse tab ──
    venues: [],
    scheduleVisible: false,
    scheduleVenueId: '', scheduleVenueName: '', scheduleWeekStart: '',
    timetableColumns: [], timetableHours: HOURS,
    bookingDetailVisible: false, bookingDetail: null,

    bookingVisible: false, bookingVenueId: '', bookingVenueName: '',
    bookingStartDate: '', bookingStartDateDisplay: '',
    bookingEndDate: '', bookingEndDateDisplay: '',
    bookingTitle: '', bookingDesc: '',
    bookingTimeStart: '', bookingTimeEnd: '',
    timelineBlocks: [],
    startHours: [], startHourIdx: 0, startMinutes: ALL_MINUTES, startMinIdx: 0,
    endHours: [], endHourIdx: 0, endMinutes: ALL_MINUTES, endMinIdx: 0,
    _startDayData: null, _endDayData: null,
    purposes: [],
    statusLabels: { pending:'待审核', approved:'已通过', rejected:'已驳回', cancelled:'已取消' },
    HOUR_HEIGHT: HOUR_HEIGHT, HEADER_H: HEADER_H,

    // ── Bookings tab ──
    myBookings: [],

    // ── Manage tab ──
    editing: false, editId: '', editName: '', editLocation: '', editDesc: '',
    rulesVisible: false, rulesVenueId: '', rulesVenueName: '', rulesTab: 'open',
    openRules: [], activityRules: [], bookingRules: [],
    ruleEditorVisible: false, ruleEditId: '', ruleEditorType: '',
    ruleForm: { name:'', cycleType:'weekly', cycleValues:[], timeStart:'09:00', timeEnd:'18:00', ruleType:'admin', approverIdentityId:'', approverHrId:'', approverIdentityName:'', approverHrName:'', approverIdentityIndex:0, approverHrIndex:0 },
    allIdentities: [], allHrPersons: [],
    yearlyPickMonth:1, yearlyPickDay:1, yearlyDays: Array.from({length:31},(_,i)=>i+1),
    yearlyRangeStartMonth:1, yearlyRangeStartDay:1, yearlyRangeEndMonth:1, yearlyRangeEndDay:1,
    weeklyChecked: [false,false,false,false,false,false,false], monthlyChecked: Array(31).fill(false),

    // Admin quick booking
    adminBookingVisible: false, adminBookingStartDate: '', adminBookingStartDateDisplay: '',
    adminBookingEndDate: '', adminBookingEndDateDisplay: '',
    adminBookingTitle: '', adminBookingDesc: '', adminBookingTimeStart: '', adminBookingTimeEnd: '',
    adminStartHours: [], adminStartHourIdx: 0, adminStartMinIdx: 0,
    adminEndHours: [], adminEndHourIdx: 0, adminEndMinIdx: 0,
    _adminDayData: null, ALL_MINUTES: ALL_MINUTES,

    // Purpose management
    purposeVisible: false, purposeEditId: '', purposeEditText: '', managePurposes: []
  },

  onShow() {
    this._initWeekStart();
    this.checkIsAdmin();
  },

  async checkIsAdmin() {
    let isAdmin = false;
    try {
      const res = await callFunction({ name: 'listVenues', data: {} });
      isAdmin = !!(res && res.status === 'success' && Array.isArray(res.venues));
    } catch (_) { isAdmin = false; }
    // Use local var, not this.data.isAdmin (setData is async, this.data lags)
    this.setData({ isAdmin });
    this.loadVenues();
    this.loadPurposes();
    if (isAdmin) this.loadReferenceData();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'bookings') this.loadMyBookings();
    if (tab === 'manage') this.loadManageData();
  },

  // ═══════════════ BROWSE TAB ═══════════════

  async loadVenues() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({ name: 'listVenuesForBooking', data: {} });
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { this.setData({ loading: false }); }
  },

  async loadPurposes() {
    try {
      const res = await callFunction({ name: 'listVenueBookingPurposes', data: {} });
      if (res.status === 'success') this.setData({ purposes: res.purposes || [] });
    } catch (_) {}
  },

  _initWeekStart() {
    const now = new Date(), day = now.getDay(), monday = new Date(now);
    monday.setDate(now.getDate()-(day===0?6:day-1));
    const today = fmtLocalDate(now);
    this.setData({ scheduleWeekStart: fmtLocalDate(monday), bookingStartDate: today, bookingStartDateDisplay: today, bookingEndDate: today, bookingEndDateDisplay: today });
  },

  onSelectPurpose(e) { this.setData({ bookingTitle: e.currentTarget.dataset.text }); },

  // Timetable
  async openSchedule(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v=>v.id===id);
    this.setData({ scheduleVisible:true, scheduleVenueId:id, scheduleVenueName:v?v.name:'', timetableColumns:[] });
    await this.loadTimetable();
  },
  closeSchedule() { this.setData({ scheduleVisible:false, bookingDetailVisible:false }); },

  async loadTimetable() {
    const {scheduleVenueId,scheduleWeekStart}=this.data;
    const [y,m,d]=scheduleWeekStart.split('-').map(Number);
    const end=new Date(y,m-1,d+6), dateTo=fmtLocalDate(end);
    wx.showLoading({title:'加载中...'});
    try {
      const res=await callFunction({name:'getVenueSchedule',data:{venueId:scheduleVenueId,dateFrom:scheduleWeekStart,dateTo}});
      if(res.status==='success') this._buildTimetable(res.dailySchedules||[]);
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { wx.hideLoading(); }
  },

  _buildTimetable(dailySchedules) {
    const [y,m,d]=this.data.scheduleWeekStart.split('-').map(Number);
    const weekDayLabels=['周一','周二','周三','周四','周五','周六','周日'];
    const columns=[];
    for(let i=0;i<7;i++) {
      const dd=new Date(y,m-1,d+i), dateStr=fmtLocalDate(dd);
      const dateDisplay=String(dd.getMonth()+1).padStart(2,'0')+'/'+String(dd.getDate()).padStart(2,'0');
      const dayData=dailySchedules.find(ds=>ds.date===dateStr);
      columns.push(this._buildDayColumn(dayData,dateStr,weekDayLabels[i],dateDisplay));
    }
    this.setData({timetableColumns:columns});
  },

  _buildDayColumn(dayData,dateStr,label,dateDisplay) {
    const openBlocks=[], eventBlocks=[], timeTargets=[];
    if(dayData&&dayData.openSlots) {
      for(const o of dayData.openSlots) {
        const {top,height}=calcBlock(o.timeStart,o.timeEnd);
        const s=timeToMin(o.timeStart), e=timeToMin(o.timeEnd);
        openBlocks.push({top:top+HEADER_H+TEXT_OFFSET,height,startMin:s,endMin:e,duration:e-s});
        for(let min=s;min<e;min+=30) {
          const hh=Math.floor(min/60), mm=min%60;
          timeTargets.push({top:top+HEADER_H+TEXT_OFFSET+(min-s)/(e-s)*height, time:String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')});
        }
      }
    }
    if(dayData&&dayData.activitySlots) {
      for(const a of dayData.activitySlots) {
        const {top,height}=calcBlock(a.timeStart,a.timeEnd);
        eventBlocks.push({top:top+HEADER_H+TEXT_OFFSET,height,status:'activity',label:a.ruleName||'活动',type:'activity'});
      }
    }
    if(dayData&&dayData.bookedSlots) {
      for(const b of dayData.bookedSlots) {
        const {top,height}=calcBlock(b.timeStart,b.timeEnd);
        eventBlocks.push({top:top+HEADER_H+TEXT_OFFSET,height,status:b.status==='pending'?'pending':'booked',label:b.title||'已借用',type:'booking',
          booking:{id:b.id,title:b.title,description:b.description,userId:b.userId,userName:b.userName,userDept:b.userDept||'',userIdentity:b.userIdentity||'',userWorkGroup:b.userWorkGroup||'',timeStart:b.fullTimeStart||b.timeStart,timeEnd:b.fullTimeEnd||b.timeEnd,status:b.status}});
      }
    }
    return {date:dateStr,label,dateDisplay,openBlocks,eventBlocks,timeTargets};
  },

  onTimetablePrevWeek() { const [y,m,d]=this.data.scheduleWeekStart.split('-').map(Number); this.setData({scheduleWeekStart:fmtLocalDate(new Date(y,m-1,d-7))}); this.loadTimetable(); },
  onTimetableNextWeek() { const [y,m,d]=this.data.scheduleWeekStart.split('-').map(Number); this.setData({scheduleWeekStart:fmtLocalDate(new Date(y,m-1,d+7))}); this.loadTimetable(); },
  onTimetableBlockTap(e) { const b=e.currentTarget.dataset.block; if(!b||!b.booking)return; this.setData({bookingDetailVisible:true,bookingDetail:b.booking}); },
  closeBookingDetail() { this.setData({bookingDetailVisible:false}); },

  onTimeTargetTap(e) {
    const date=e.currentTarget.dataset.date, time=e.currentTarget.dataset.time;
    if(!date||!time)return;
    this.setData({bookingVisible:true,bookingVenueId:this.data.scheduleVenueId,bookingVenueName:this.data.scheduleVenueName,bookingStartDate:date,bookingStartDateDisplay:date,bookingEndDate:date,bookingEndDateDisplay:date,bookingTimeStart:time,bookingTimeEnd:'',bookingTitle:'',bookingDesc:'',timelineBlocks:[]});
    this.loadDailyAvailability(date,time);
  },
  onTimetableOpenTap(e) {
    const date=e.currentTarget.dataset.date;
    const timeY=Math.round((e.detail.y-HEADER_H)/(HOUR_HEIGHT/2));
    if(timeY<0)return;
    const idx=Math.min(Math.max(timeY,0),47), h=Math.floor(idx/2), m=(idx%2)*30;
    const time=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    this.setData({bookingVisible:true,bookingVenueId:this.data.scheduleVenueId,bookingVenueName:this.data.scheduleVenueName,bookingStartDate:date,bookingStartDateDisplay:date,bookingEndDate:date,bookingEndDateDisplay:date,bookingTimeStart:time,bookingTimeEnd:'',bookingTitle:'',bookingDesc:'',timelineBlocks:[]});
    this.loadDailyAvailability(date,time);
  },

  // Booking form
  openBooking(e) {
    const id=e.currentTarget.dataset.id, v=this.data.venues.find(v=>v.id===id), today=this.data.bookingStartDate;
    this.setData({bookingVisible:true,bookingVenueId:id,bookingVenueName:v?v.name:'',bookingStartDate:today,bookingStartDateDisplay:today,bookingEndDate:today,bookingEndDateDisplay:today,bookingTitle:'',bookingDesc:'',bookingTimeStart:'',bookingTimeEnd:'',timelineBlocks:[],startHours:[],startHourIdx:0,startMinIdx:0,endHours:[],endHourIdx:0,endMinIdx:0,_startDayData:null,_endDayData:null});
    this.loadDailyAvailability(today);
  },
  closeBooking() { this.setData({bookingVisible:false}); },
  onStartDateChange(e) { const d=e.detail.value; this.setData({bookingStartDate:d,bookingStartDateDisplay:d,bookingEndDate:d,bookingEndDateDisplay:d,bookingTimeStart:'',bookingTimeEnd:'',timelineBlocks:[],startHours:[],startHourIdx:0,startMinIdx:0,endHours:[],endHourIdx:0,endMinIdx:0,_startDayData:null,_endDayData:null}); this.loadDailyAvailability(d); },
  onEndDateChange(e) { const d=e.detail.value; this.setData({bookingEndDate:d,bookingEndDateDisplay:d,bookingTimeEnd:'',endHours:[],endHourIdx:0,endMinIdx:0,_endDayData:null}); if(d!==this.data.bookingStartDate) this.loadEndDailyAvailability(d); },

  async loadDailyAvailability(dateStr,presetTime) {
    const venueId=this.data.bookingVenueId; if(!venueId||!dateStr)return;
    wx.showLoading({title:'查询空闲...'});
    try {
      const res=await callFunction({name:'getVenueSchedule',data:{venueId,dateFrom:dateStr,dateTo:dateStr}});
      if(res.status==='success') {
        const dayData=(res.dailySchedules||[])[0];
        if(dayData) {
          const result=this._buildTimelineAndOptions(dayData);
          const useTime=presetTime||this.data.bookingTimeStart||'';
          const parts=useTime.split(':'), useH=parseInt(parts[0])||0, useM=parseInt(parts[1])||0;
          const sHi=Math.max(0,result.startHours.findIndex(h=>h.value===useH));
          const sMi=Math.max(0,ALL_MINUTES.findIndex(m=>m.value===useM));
          const sd={timelineBlocks:result.timelineBlocks,startHours:result.startHours,startHourIdx:sHi,startMinIdx:sMi,endHours:result.endHoursAll,endHourIdx:0,endMinIdx:0,_startDayData:dayData,_endDayData:dayData};
          if(presetTime) sd.bookingTimeStart=presetTime;
          this.setData(sd);
        } else { this.setData({timelineBlocks:[],startHours:[],endHours:[],_startDayData:null,_endDayData:null}); }
      } else { showShortToast(res.message||'加载时段失败'); }
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { wx.hideLoading(); }
  },

  _buildTimelineAndOptions(dayData) {
    const openSlots=dayData.openSlots||[], bookedSlots=dayData.bookedSlots||[], activitySlots=dayData.activitySlots||[];
    const blocks=[], openHourSet=new Set();
    for(const o of openSlots) { const os=timeToMin(o.timeStart), oe=timeToMin(o.timeEnd); for(let h=Math.floor(os/60);h<Math.ceil(oe/60);h++){if(h>=0&&h<24)openHourSet.add(h);} }
    let t=0; const dayEnd=24*60, totalMin=dayEnd;
    while(t+30<=dayEnd) {
      let inOpen=false; for(const o of openSlots){if(t>=timeToMin(o.timeStart)&&t+30<=timeToMin(o.timeEnd)){inOpen=true;break;}}
      let status='closed';
      if(inOpen){status='free'; for(const b of bookedSlots){if(t<timeToMin(b.timeEnd)&&t+30>timeToMin(b.timeStart)){status=b.status==='pending'?'pending':'booked';break;}} if(status==='free'){for(const a of activitySlots){if(t<timeToMin(a.timeEnd)&&t+30>timeToMin(a.timeStart)){status='activity';break;}}}}
      const last=blocks[blocks.length-1]; if(last&&last.status===status)last.endMin=t+30; else blocks.push({startMin:t,endMin:t+30,status});
      t+=30;
    }
    const timelineBlocks=blocks.map(b=>({left:((b.startMin)/totalMin*100).toFixed(2),width:((b.endMin-b.startMin)/totalMin*100).toFixed(2),status:b.status}));
    const sortedHours=Array.from(openHourSet).sort((a,b)=>a-b);
    return {timelineBlocks,startHours:sortedHours.map(h=>({value:h,label:String(h).padStart(2,'0')})),endHoursAll:sortedHours.map(h=>({value:h,label:String(h).padStart(2,'0')}))};
  },

  async loadEndDailyAvailability(dateStr) {
    const venueId=this.data.bookingVenueId; if(!venueId||!dateStr)return;
    try {
      const res=await callFunction({name:'getVenueSchedule',data:{venueId,dateFrom:dateStr,dateTo:dateStr}});
      if(res.status==='success'){const dayData=(res.dailySchedules||[])[0]; if(dayData)this.setData({_endDayData:dayData});}
    } catch(_) {}
  },

  onStartHourChange(e) { const idx=parseInt(e.detail.value), h=this.data.startHours[idx]?this.data.startHours[idx].value:0, m=ALL_MINUTES[this.data.startMinIdx]?ALL_MINUTES[this.data.startMinIdx].value:0; this.setData({startHourIdx:idx,bookingTimeStart:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); this._refreshEndHours(); },
  onStartMinChange(e) { const idx=parseInt(e.detail.value), m=ALL_MINUTES[idx]?ALL_MINUTES[idx].value:0, h=this.data.startHours[this.data.startHourIdx]?this.data.startHours[this.data.startHourIdx].value:0; this.setData({startMinIdx:idx,bookingTimeStart:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); this._refreshEndHours(); },
  onEndHourChange(e) { const idx=parseInt(e.detail.value), h=this.data.endHours[idx]?this.data.endHours[idx].value:0, m=ALL_MINUTES[this.data.endMinIdx]?ALL_MINUTES[this.data.endMinIdx].value:0; this.setData({endHourIdx:idx,bookingTimeEnd:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); },
  onEndMinChange(e) { const idx=parseInt(e.detail.value), m=ALL_MINUTES[idx]?ALL_MINUTES[idx].value:0, h=this.data.endHours[this.data.endHourIdx]?this.data.endHours[this.data.endHourIdx].value:0; this.setData({endMinIdx:idx,bookingTimeEnd:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); },

  _refreshEndHours() {
    const dayData=this.data._endDayData||this.data._startDayData; if(!dayData)return;
    const openSlots=dayData.openSlots||[], startMin=timeToMin(this.data.bookingTimeStart), endHourSet=new Set();
    for(const o of openSlots){const os=timeToMin(o.timeStart),oe=timeToMin(o.timeEnd); for(let h=Math.floor(Math.max(os,startMin+1)/60);h<Math.ceil(oe/60);h++){if(h>=0&&h<24)endHourSet.add(h);} if(oe>startMin&&Math.floor(oe/60)<24)endHourSet.add(Math.floor(oe/60));}
    const sortedHours=Array.from(endHourSet).sort((a,b)=>a-b), endHours=sortedHours.map(h=>({value:h,label:String(h).padStart(2,'0')}));
    let endHourIdx=0; const curEndHour=this.data.endHours[this.data.endHourIdx]; if(curEndHour&&endHourSet.has(curEndHour.value)){endHourIdx=endHours.findIndex(h=>h.value===curEndHour.value); if(endHourIdx<0)endHourIdx=0;}
    const eh=endHours[endHourIdx]?endHours[endHourIdx].value:0, em=ALL_MINUTES[this.data.endMinIdx]?ALL_MINUTES[this.data.endMinIdx].value:0;
    this.setData({endHours,endHourIdx,bookingTimeEnd:String(eh).padStart(2,'0')+':'+String(em).padStart(2,'0')});
  },

  onFieldInput(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value}); },

  async submitBooking() {
    const {bookingVenueId,bookingStartDate,bookingEndDate,bookingTitle,bookingTimeStart,bookingTimeEnd,bookingDesc,_startDayData,_endDayData}=this.data;
    if(!bookingVenueId||!bookingStartDate||!bookingTimeStart||!bookingTimeEnd){showShortToast('请完整填写信息并选择时间段');return;}
    if(!bookingTitle){showShortToast('请填写借用事由');return;}
    const timeStart=bookingStartDate+'T'+bookingTimeStart, timeEnd=bookingEndDate+'T'+bookingTimeEnd;
    if(timeStart>=timeEnd){showShortToast('结束时间必须晚于开始时间');return;}
    const error=this._validateRange(_startDayData,_endDayData,bookingStartDate,bookingEndDate,bookingTimeStart,bookingTimeEnd);
    if(error){showShortToast(error);return;}
    this.setData({loading:true});
    try {
      const res=await callFunction({name:'createVenueBooking',data:{venueId:bookingVenueId,title:bookingTitle,description:bookingDesc,timeStart,timeEnd}});
      if(res.status==='success'){showShortToast(res.message);this.setData({bookingVisible:false});}else showShortToast(res.message);
    } catch(e) { showShortToast(getErrorText(e,'借用失败')); }
    finally { this.setData({loading:false}); }
  },

  _validateRange(sdd,edd,sd,ed,st,et) {
    let openSlots=(sdd&&sdd.openSlots)||[], bookedSlots=(sdd&&sdd.bookedSlots)||[], activitySlots=(sdd&&sdd.activitySlots)||[];
    if(ed!==sd&&edd){openSlots=[...openSlots,...(edd.openSlots||[])];bookedSlots=[...bookedSlots,...(edd.bookedSlots||[])];activitySlots=[...activitySlots,...(edd.activitySlots||[])];}
    const rs=timeToMin(st), re=timeToMin(et);
    const mo=mergeIntervals(slotsToIntervals(openSlots)), gap=findOpenGap(rs,re,mo);
    if(gap>=0){const h=String(Math.floor(gap/60)).padStart(2,'0'),mi=String(gap%60).padStart(2,'0');return h+':'+mi+' 场地不开放';}
    const mb=mergeIntervals([...slotsToIntervals(bookedSlots),...slotsToIntervals(activitySlots)]), conflict=findBlockedOverlap(rs,re,mb);
    if(conflict){const h=String(Math.floor(conflict.start/60)).padStart(2,'0'),mi=String(conflict.start%60).padStart(2,'0');return h+':'+mi+' 已被占用';}
    return null;
  },

  // ═══════════════ BOOKINGS TAB ═══════════════

  async loadMyBookings() {
    this.setData({loading:true});
    try {
      const res=await callFunction({name:'listMyVenueBookings',data:{}});
      if(res.status==='success') this.setData({myBookings:res.bookings||[]});
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { this.setData({loading:false}); }
  },

  async cancelMyBooking(e) {
    const id=e.currentTarget.dataset.id;
    try {
      const res=await callFunction({name:'cancelVenueBooking',data:{id}});
      if(res.status==='success'){showShortToast('已取消');this.loadMyBookings();}else showShortToast(res.message);
    } catch(e) { showShortToast(getErrorText(e,'取消失败')); }
  },

  // ═══════════════ MANAGE TAB ═══════════════

  async loadManageData() {
    this.setData({loading:true});
    try {
      const res=await callFunction({name:'listVenues',data:{}});
      if(res.status==='success') this.setData({venues:res.venues||[]});
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { this.setData({loading:false}); }
  },

  async loadReferenceData() {
    try {
      const [identRes,hrRes]=await Promise.all([callFunction({name:'listIdentities',data:{}}),callFunction({name:'listHrInfo',data:{}})]);
      this.setData({allIdentities:(identRes.status==='success'?identRes.identities:[])||[],allHrPersons:(hrRes.status==='success'?hrRes.list:[])||[]});
    } catch(_) {}
  },

  startAdd() { this.setData({editing:true,editId:'',editName:'',editLocation:'',editDesc:''}); },
  startEdit(e) { const v=this.data.venues.find(v=>v.id===e.currentTarget.dataset.id); if(!v)return; this.setData({editing:true,editId:v.id,editName:v.name,editLocation:v.location||'',editDesc:v.description||''}); },
  cancelEdit() { this.setData({editing:false}); },
  async saveVenue() { const {editId,editName,editLocation,editDesc}=this.data; if(!editName){showShortToast('请输入场地名称');return;} this.setData({loading:true}); try { const res=await callFunction({name:'saveVenue',data:{id:editId,name:editName,location:editLocation,description:editDesc}}); if(res.status==='success'){showShortToast(res.message);this.setData({editing:false});this.loadManageData();}else showShortToast(res.message); } catch(e) { showShortToast(getErrorText(e,'保存失败')); } finally { this.setData({loading:false}); } },
  async deleteVenue(e) { const id=e.currentTarget.dataset.id; const that=this; wx.showModal({title:'确认删除',content:'确定删除此场地吗？',success:async(r)=>{if(!r.confirm)return;try{const res=await callFunction({name:'deleteVenue',data:{id}});if(res.status==='success'){showShortToast('已删除');that.loadManageData();}else showShortToast(res.message);}catch(e){showShortToast(getErrorText(e,'删除失败'));}}});},

  // Rules
  openRules(e) { const id=e.currentTarget.dataset.id, v=this.data.venues.find(v=>v.id===id); this.setData({rulesVisible:true,rulesVenueId:id,rulesVenueName:v?v.name:'',rulesTab:'open'}); this.loadOpenRules(); this.loadActivityRules(); this.loadBookingRules(); },
  closeRules() { this.setData({rulesVisible:false}); },
  switchRulesTab(e) { this.setData({rulesTab:e.currentTarget.dataset.tab}); },
  async loadOpenRules() { try{const res=await callFunction({name:'listVenueOpenRules',data:{venueId:this.data.rulesVenueId}});if(res.status==='success')this.setData({openRules:res.rules||[]});}catch(_){} },
  async loadActivityRules() { try{const res=await callFunction({name:'listVenueActivityRules',data:{venueId:this.data.rulesVenueId}});if(res.status==='success')this.setData({activityRules:res.rules||[]});}catch(_){} },
  async loadBookingRules() { try{const res=await callFunction({name:'listVenueBookingRules',data:{venueId:this.data.rulesVenueId}});if(res.status==='success')this.setData({bookingRules:res.rules||[]});}catch(_){} },

  openRuleEditor(e) {
    const type=e.currentTarget.dataset.type, ruleId=e.currentTarget.dataset.id||'';
    let form={name:'',cycleType:'weekly',cycleValues:[],timeStart:'09:00',timeEnd:'18:00',ruleType:'admin',approverIdentityId:'',approverHrId:'',approverIdentityName:'',approverHrName:'',approverIdentityIndex:0,approverHrIndex:0};
    if(ruleId) {
      if(type==='open'){const r=this.data.openRules.find(r=>r.id===ruleId); if(r){const cv=typeof r.cycle_values==='string'?JSON.parse(r.cycle_values):(r.cycle_values||[]); form={...form,name:r.name||'',cycleType:r.cycle_type,cycleValues:cv,timeStart:(r.time_start||'09:00').substring(0,5),timeEnd:(r.time_end||'18:00').substring(0,5)};}}
      else if(type==='activity'){const r=this.data.activityRules.find(r=>r.id===ruleId); if(r){const cv=typeof r.cycle_values==='string'?JSON.parse(r.cycle_values):(r.cycle_values||[]); form={...form,name:r.activity_name||'',cycleType:r.cycle_type,cycleValues:cv,timeStart:(r.time_start||'09:00').substring(0,5),timeEnd:(r.time_end||'18:00').substring(0,5)};}}
      else if(type==='booking'){const r=this.data.bookingRules.find(r=>r.id===ruleId); if(r){const{allIdentities,allHrPersons}=this.data; const idIdx=allIdentities.findIndex(ident=>ident.id===r.approver_identity_id); const hrIdx=allHrPersons.findIndex(hr=>hr.id===r.approver_hr_id); form={...form,ruleType:r.rule_type||'admin',approverIdentityId:r.approver_identity_id||'',approverHrId:r.approver_hr_id||'',approverIdentityName:idIdx>=0?allIdentities[idIdx].name:'',approverHrName:hrIdx>=0?allHrPersons[hrIdx].name:'',approverIdentityIndex:Math.max(idIdx,0),approverHrIndex:Math.max(hrIdx,0)};}}
    }
    this.setData({ruleEditorVisible:true,ruleEditId:ruleId,ruleEditorType:type,ruleForm:form,weeklyChecked:buildWeeklyChecked(form.cycleValues),monthlyChecked:buildMonthlyChecked(form.cycleValues)});
  },
  closeRuleEditor() { this.setData({ruleEditorVisible:false}); },
  onRuleFormField(e) { this.setData({['ruleForm.'+e.currentTarget.dataset.field]:e.detail.value}); },
  onCycleTypeChange(e) { const types=['daily','weekly','monthly','yearly']; this.setData({'ruleForm.cycleType':types[parseInt(e.detail.value)]||'weekly','ruleForm.cycleValues':[],weeklyChecked:[false,false,false,false,false,false,false],monthlyChecked:Array(31).fill(false)}); },
  onBookingRuleTypeChange(e) { const types=['admin','direct','identity','person']; this.setData({'ruleForm.ruleType':types[parseInt(e.detail.value)]||'admin'}); },
  onBookingIdentityChange(e) { const idx=parseInt(e.detail.value), ident=this.data.allIdentities[idx]; if(ident)this.setData({'ruleForm.approverIdentityId':ident.id,'ruleForm.approverIdentityName':ident.name,'ruleForm.approverIdentityIndex':idx}); },
  onBookingHrChange(e) { const idx=parseInt(e.detail.value), hr=this.data.allHrPersons[idx]; if(hr)this.setData({'ruleForm.approverHrId':hr.id,'ruleForm.approverHrName':hr.name,'ruleForm.approverHrIndex':idx}); },
  onToggleWeekDay(e) { const idx=parseInt(e.currentTarget.dataset.idx), checked=[...this.data.weeklyChecked]; checked[idx]=!checked[idx]; const vals=[]; checked.forEach((c,i)=>{if(c)vals.push(i+1);}); this.setData({weeklyChecked:checked,'ruleForm.cycleValues':vals}); },
  onToggleMonthDay(e) { const idx=parseInt(e.currentTarget.dataset.idx), checked=[...this.data.monthlyChecked]; checked[idx]=!checked[idx]; const vals=[]; checked.forEach((c,i)=>{if(c)vals.push(i+1);}); this.setData({monthlyChecked:checked,'ruleForm.cycleValues':vals}); },
  onYearlyRangeStartMonthChange(e) { this.setData({yearlyRangeStartMonth:parseInt(e.detail.value)+1}); },
  onYearlyRangeStartDayChange(e) { this.setData({yearlyRangeStartDay:parseInt(e.detail.value)+1}); },
  onYearlyRangeEndMonthChange(e) { this.setData({yearlyRangeEndMonth:parseInt(e.detail.value)+1}); },
  onYearlyRangeEndDayChange(e) { this.setData({yearlyRangeEndDay:parseInt(e.detail.value)+1}); },
  onAddYearlyRange() { const sm=this.data.yearlyRangeStartMonth,sd=this.data.yearlyRangeStartDay,em=this.data.yearlyRangeEndMonth,ed=this.data.yearlyRangeEndDay; if(sm>em||(sm===em&&sd>ed)){showShortToast('开始日期不能晚于结束日期');return;} let vals=[...(this.data.ruleForm.cycleValues||[])]; if(!vals.some(v=>v&&Number(v.m)===sm&&Number(v.dStart)===sd&&Number(v.dEnd)===ed)){vals.push({m:sm,dStart:sd,dEnd:ed});vals.sort((a,b)=>(Number(a.m)-Number(b.m))||(Number(a.dStart)-Number(b.dStart)));this.setData({'ruleForm.cycleValues':vals});} },
  onRemoveYearlyRange(e) { const idx=parseInt(e.currentTarget.dataset.idx); let vals=[...(this.data.ruleForm.cycleValues||[])]; vals.splice(idx,1); this.setData({'ruleForm.cycleValues':vals}); },

  async saveRule() {
    const {ruleEditId,ruleEditorType,ruleForm,rulesVenueId}=this.data; let endpoint,data;
    if(ruleEditorType==='open'){endpoint='saveVenueOpenRule';data={id:ruleEditId,venueId:rulesVenueId,name:ruleForm.name,cycleType:ruleForm.cycleType,cycleValues:ruleForm.cycleValues,timeStart:ruleForm.timeStart,timeEnd:ruleForm.timeEnd};}
    else if(ruleEditorType==='activity'){endpoint='saveVenueActivityRule';data={id:ruleEditId,venueId:rulesVenueId,activityName:ruleForm.name,cycleType:ruleForm.cycleType,cycleValues:ruleForm.cycleValues,timeStart:ruleForm.timeStart,timeEnd:ruleForm.timeEnd};}
    else {endpoint='saveVenueBookingRule';data={id:ruleEditId,venueId:rulesVenueId,ruleType:ruleForm.ruleType,approverIdentityId:ruleForm.approverIdentityId||'',approverHrId:ruleForm.approverHrId||'',scopeDepartmentId:'',scopeWorkGroupId:''};}
    try { const res=await callFunction({name:endpoint,data}); if(res.status==='success'){showShortToast(res.message);this.setData({ruleEditorVisible:false});this.loadOpenRules();this.loadActivityRules();this.loadBookingRules();}else showShortToast(res.message); } catch(e) { showShortToast(getErrorText(e,'保存失败')); }
  },
  async deleteRule(e) { const type=e.currentTarget.dataset.type, id=e.currentTarget.dataset.id; const ep=type==='open'?'deleteVenueOpenRule':(type==='activity'?'deleteVenueActivityRule':'deleteVenueBookingRule'); try{const res=await callFunction({name:ep,data:{id}});if(res.status==='success'){showShortToast('已删除');this.loadOpenRules();this.loadActivityRules();this.loadBookingRules();}else showShortToast(res.message);}catch(e){showShortToast(getErrorText(e,'删除失败'));} },

  getCycleLabel(type,values) {
    if(type==='daily')return'每天'; const v=typeof values==='string'?(()=>{try{return JSON.parse(values);}catch(_){return[];}})():(values||[]);
    const wn=['','周一','周二','周三','周四','周五','周六','周日']; if(type==='weekly')return v.map(i=>wn[Number(i)]||i).join('、')||'未设置';
    if(type==='monthly')return'每月'+v.map(i=>Number(i)).join('、')+'日';
    if(type==='yearly')return v.map(c=>{if(c.dEnd!==undefined)return(c.m||'?')+'月'+(c.dStart||'?')+'日-'+(c.dEnd||'?')+'日';return(c.m||'?')+'月'+(c.d||'?')+'日';}).join('、');
    return JSON.stringify(v||[]);
  },
  getRuleTypeLabel(rt) { const map={direct:'直接通过',admin:'管理员审核',identity:'指定身份审核',person:'指定人员审核'}; return map[rt]||rt; },

  // Admin timetable
  async openVenueSchedule(e) { const id=e.currentTarget.dataset.id, v=this.data.venues.find(v=>v.id===id); this.setData({scheduleVisible:true,scheduleVenueId:id,scheduleVenueName:v?v.name:'',timetableColumns:[]}); await this.loadTimetable(); },

  // Admin quick booking
  onAdminTimeTargetTap(e) {
    const date=e.currentTarget.dataset.date, time=e.currentTarget.dataset.time;
    if(!date||!time)return;
    this.setData({adminBookingVisible:true,adminBookingStartDate:date,adminBookingStartDateDisplay:date,adminBookingEndDate:date,adminBookingEndDateDisplay:date,adminBookingTimeStart:time,adminBookingTimeEnd:'',adminBookingTitle:'',adminBookingDesc:'',adminStartHours:[],adminStartHourIdx:0,adminStartMinIdx:0,adminEndHours:[],adminEndHourIdx:0,adminEndMinIdx:0,_adminDayData:null});
    this._loadAdminAvailability(date,time);
  },
  onAdminTimetableOpenTap(e) {
    const date=e.currentTarget.dataset.date;
    const timeY=Math.round((e.detail.y-HEADER_H)/(HOUR_HEIGHT/2));
    if(timeY<0)return;
    const idx=Math.min(Math.max(timeY,0),47), h=Math.floor(idx/2), m=(idx%2)*30;
    const time=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    this.setData({adminBookingVisible:true,adminBookingStartDate:date,adminBookingStartDateDisplay:date,adminBookingEndDate:date,adminBookingEndDateDisplay:date,adminBookingTimeStart:time,adminBookingTimeEnd:'',adminBookingTitle:'',adminBookingDesc:'',adminStartHours:[],adminStartHourIdx:0,adminStartMinIdx:0,adminEndHours:[],adminEndHourIdx:0,adminEndMinIdx:0,_adminDayData:null});
    this._loadAdminAvailability(date,time);
  },
  closeAdminBooking() { this.setData({adminBookingVisible:false}); },
  onAdminStartDateChange(e) { const d=e.detail.value; this.setData({adminBookingStartDate:d,adminBookingStartDateDisplay:d,adminBookingEndDate:d,adminBookingEndDateDisplay:d,adminBookingTimeStart:'',adminBookingTimeEnd:'',adminStartHours:[],adminStartHourIdx:0,adminStartMinIdx:0,adminEndHours:[],adminEndHourIdx:0,adminEndMinIdx:0,_adminDayData:null}); this._loadAdminAvailability(d); },
  onAdminEndDateChange(e) { const d=e.detail.value; this.setData({adminBookingEndDate:d,adminBookingEndDateDisplay:d,adminBookingTimeEnd:''}); },
  async _loadAdminAvailability(dateStr,presetTime) {
    if(!dateStr)return; wx.showLoading({title:'查询空闲...'});
    try {
      const res=await callFunction({name:'getVenueSchedule',data:{venueId:this.data.scheduleVenueId,dateFrom:dateStr,dateTo:dateStr}});
      if(res.status==='success') {
        const dayData=(res.dailySchedules||[])[0];
        if(dayData) {
          const openSlots=dayData.openSlots||[], openHourSet=new Set();
          for(const o of openSlots){const os=timeToMin(o.timeStart),oe=timeToMin(o.timeEnd); for(let h=Math.floor(os/60);h<Math.ceil(oe/60);h++){if(h>=0&&h<24)openHourSet.add(h);}}
          const sortedHours=Array.from(openHourSet).sort((a,b)=>a-b), startHours=sortedHours.map(h=>({value:h,label:String(h).padStart(2,'0')})), endHoursAll=sortedHours.map(h=>({value:h,label:String(h).padStart(2,'0')}));
          const useTime=presetTime||this.data.adminBookingTimeStart||'', parts=useTime.split(':'), useH=parseInt(parts[0])||0, useM=parseInt(parts[1])||0;
          const sHi=Math.max(0,startHours.findIndex(h=>h.value===useH)), sMi=Math.max(0,ALL_MINUTES.findIndex(m=>m.value===useM));
          const sd={adminStartHours:startHours,adminStartHourIdx:sHi,adminStartMinIdx:sMi,adminEndHours:endHoursAll,adminEndHourIdx:0,adminEndMinIdx:0,_adminDayData:dayData};
          if(presetTime)sd.adminBookingTimeStart=presetTime;
          this.setData(sd);
        } else { this.setData({adminStartHours:[],adminEndHours:[],_adminDayData:null}); }
      } else { showShortToast(res.message||'加载失败'); }
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { wx.hideLoading(); }
  },
  onAdminStartHourChange(e) { const idx=parseInt(e.detail.value), h=this.data.adminStartHours[idx]?this.data.adminStartHours[idx].value:0, m=ALL_MINUTES[this.data.adminStartMinIdx]?ALL_MINUTES[this.data.adminStartMinIdx].value:0; this.setData({adminStartHourIdx:idx,adminBookingTimeStart:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); this._adminRefreshEndHours(); },
  onAdminStartMinChange(e) { const idx=parseInt(e.detail.value), m=ALL_MINUTES[idx]?ALL_MINUTES[idx].value:0, h=this.data.adminStartHours[this.data.adminStartHourIdx]?this.data.adminStartHours[this.data.adminStartHourIdx].value:0; this.setData({adminStartMinIdx:idx,adminBookingTimeStart:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); this._adminRefreshEndHours(); },
  onAdminEndHourChange(e) { const idx=parseInt(e.detail.value), h=this.data.adminEndHours[idx]?this.data.adminEndHours[idx].value:0, m=ALL_MINUTES[this.data.adminEndMinIdx]?ALL_MINUTES[this.data.adminEndMinIdx].value:0; this.setData({adminEndHourIdx:idx,adminBookingTimeEnd:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); },
  onAdminEndMinChange(e) { const idx=parseInt(e.detail.value), m=ALL_MINUTES[idx]?ALL_MINUTES[idx].value:0, h=this.data.adminEndHours[this.data.adminEndHourIdx]?this.data.adminEndHours[this.data.adminEndHourIdx].value:0; this.setData({adminEndMinIdx:idx,adminBookingTimeEnd:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}); },
  _adminRefreshEndHours() { const dayData=this.data._adminDayData; if(!dayData)return; const openSlots=dayData.openSlots||[], startMin=timeToMin(this.data.adminBookingTimeStart), endHourSet=new Set(); for(const o of openSlots){const os=timeToMin(o.timeStart),oe=timeToMin(o.timeEnd); for(let h=Math.floor(Math.max(os,startMin+1)/60);h<Math.ceil(oe/60);h++){if(h>=0&&h<24)endHourSet.add(h);} if(oe>startMin&&Math.floor(oe/60)<24)endHourSet.add(Math.floor(oe/60));} const sortedHours=Array.from(endHourSet).sort((a,b)=>a-b), endHours=sortedHours.map(h=>({value:h,label:String(h).padStart(2,'0')})); let endHourIdx=0; const curEndHour=this.data.adminEndHours[this.data.adminEndHourIdx]; if(curEndHour&&endHourSet.has(curEndHour.value)){endHourIdx=endHours.findIndex(h=>h.value===curEndHour.value);if(endHourIdx<0)endHourIdx=0;} const eh=endHours[endHourIdx]?endHours[endHourIdx].value:0, em=ALL_MINUTES[this.data.adminEndMinIdx]?ALL_MINUTES[this.data.adminEndMinIdx].value:0; this.setData({adminEndHours:endHours,adminEndHourIdx:endHourIdx,adminBookingTimeEnd:String(eh).padStart(2,'0')+':'+String(em).padStart(2,'0')}); },
  onAdminSelectPurpose(e) { this.setData({adminBookingTitle:e.currentTarget.dataset.text}); },

  async submitAdminBooking() {
    const {scheduleVenueId,adminBookingStartDate,adminBookingEndDate,adminBookingTitle,adminBookingTimeStart,adminBookingTimeEnd,adminBookingDesc,_adminDayData}=this.data;
    if(!scheduleVenueId||!adminBookingStartDate||!adminBookingTimeStart||!adminBookingTimeEnd){showShortToast('请完整填写信息');return;}
    if(!adminBookingTitle){showShortToast('请填写借用事由');return;}
    const timeStart=adminBookingStartDate+'T'+adminBookingTimeStart, timeEnd=adminBookingEndDate+'T'+adminBookingTimeEnd;
    if(timeStart>=timeEnd){showShortToast('结束时间必须晚于开始时间');return;}
    if(_adminDayData){const rs=timeToMin(adminBookingTimeStart),re=timeToMin(adminBookingTimeEnd);const mo=mergeIntervals(slotsToIntervals(_adminDayData.openSlots||[]));const gap=findOpenGap(rs,re,mo);if(gap>=0){const h=String(Math.floor(gap/60)).padStart(2,'0'),mi=String(gap%60).padStart(2,'0');showShortToast(h+':'+mi+' 场地不开放');return;}const mb=mergeIntervals([...slotsToIntervals(_adminDayData.bookedSlots||[]),...slotsToIntervals(_adminDayData.activitySlots||[])]);const cf=findBlockedOverlap(rs,re,mb);if(cf){const h=String(Math.floor(cf.start/60)).padStart(2,'0'),mi=String(cf.start%60).padStart(2,'0');showShortToast(h+':'+mi+' 已被占用');return;}}
    this.setData({loading:true});
    try { const res=await callFunction({name:'createVenueBooking',data:{venueId:scheduleVenueId,title:adminBookingTitle,description:adminBookingDesc,timeStart,timeEnd}}); if(res.status==='success'){showShortToast(res.message);this.setData({adminBookingVisible:false});if(this.data.scheduleVisible)this.loadTimetable();}else showShortToast(res.message); } catch(e) { showShortToast(getErrorText(e,'借用失败')); }
    finally { this.setData({loading:false}); }
  },

  // Purpose management
  openPurposeManager() { this.setData({purposeVisible:true,purposeEditId:'',purposeEditText:''}); this.loadManagePurposes(); },
  closePurposeManager() { this.setData({purposeVisible:false}); },
  async loadManagePurposes() { try{const res=await callFunction({name:'listVenueBookingPurposes',data:{}});if(res.status==='success')this.setData({managePurposes:res.purposes||[]});}catch(_){} },
  onPurposeFieldInput(e) { this.setData({purposeEditText:e.detail.value}); },
  startEditPurpose(e) { const id=e.currentTarget.dataset.id, p=this.data.managePurposes.find(p=>p.id===id); if(p)this.setData({purposeEditId:p.id,purposeEditText:p.text}); },
  async savePurpose() { const {purposeEditId,purposeEditText}=this.data; if(!purposeEditText.trim()){showShortToast('请输入事由内容');return;} try{const res=await callFunction({name:'saveVenueBookingPurpose',data:{id:purposeEditId,text:purposeEditText.trim()}});if(res.status==='success'){showShortToast(res.message);this.setData({purposeEditId:'',purposeEditText:''});this.loadManagePurposes();}else showShortToast(res.message);}catch(e){showShortToast(getErrorText(e,'保存失败'));} },
  async deletePurpose(e) { const id=e.currentTarget.dataset.id; try{const res=await callFunction({name:'deleteVenueBookingPurpose',data:{id}});if(res.status==='success'){showShortToast('已删除');this.loadManagePurposes();}else showShortToast(res.message);}catch(e){showShortToast(getErrorText(e,'删除失败'));} },

  noop() {}
});
