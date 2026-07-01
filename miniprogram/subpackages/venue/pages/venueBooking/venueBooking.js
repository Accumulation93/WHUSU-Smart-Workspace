const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');

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

/** Compute display status from db status + time comparison */
function computeDisplayStatus(item) {
  if (item.status === 'pending') return 'pending';
  if (item.status === 'rejected') return 'rejected';
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'approved') {
    const now = new Date();
    // timeStart/timeEnd from server are formatted as "YYYY-MM-DD HH:MM"
    const timeStart = new Date(item.timeStart.replace(' ', 'T'));
    const timeEnd = new Date(item.timeEnd.replace(' ', 'T'));
    if (now < timeStart) return 'approved';      // 未开始 → 已通过
    if (now >= timeEnd) return 'completed';       // 已结束 → 已完成
    return 'inUse';                               // 进行中 → 使用中
  }
  return item.status;
}

Page({
  data: {
    activeTab: 'browse', // 'browse' | 'bookings'
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
    statusLabels: { pending:'待审核', approved:'已通过', rejected:'已驳回', cancelled:'已取消', inUse:'使用中', completed:'已完成' },
    HOUR_HEIGHT: HOUR_HEIGHT, HEADER_H: HEADER_H,

    // ── Bookings tab ──
    myBookings: [],
    pendingApprovalCount: 0,

    // ── Expandable flow ──
    expandedNodeKey: '',

    // ── Hero user info (matches home page pattern) ──
    heroName: '场地借用',
    heroIdentity: '加载中',
    heroSubtitle: '欢迎使用REDSU智慧工作台系统 · 场地借用',
  },

  _loadUserInfo() {
    try {
      var roleProfiles = wx.getStorageSync('roleProfiles');
      var user = roleProfiles && roleProfiles.user;
      if (user) {
        this.setData({
          heroName: user.name || '场地借用',
          heroIdentity: user.identity || '未设置身份',
          heroSubtitle: '欢迎使用REDSU智慧工作台系统 · 场地借用'
        });
      }
    } catch (_) {}
  },

  onShow() {
    this._loadUserInfo();
    this._initWeekStart();
    this.loadVenues();
    this.loadPurposes();
    this.loadPendingCount();
  },

  async loadPendingCount() {
    try {
      const res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        this.setData({ pendingApprovalCount: (res.pending || []).length });
      }
    } catch (_) {}
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'bookings') this.loadMyBookings();
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
  closeSchedule() { this.setData({ scheduleVisible:false, bookingDetailVisible:false, expandedNodeKey:'' }); },

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
  closeBookingDetail() { this.setData({bookingDetailVisible:false, expandedNodeKey:''}); },

  viewMyBookingDetail(e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.myBookings.find(function(b) { return b.id === id; });
    if (!item) return;
    this.setData({ bookingDetailVisible: true, bookingDetail: item, expandedNodeKey: '' });
  },

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
      if(res.status==='success') {
        const bookings = (res.bookings||[]).map(b => {
          var item = Object.assign({}, b, { displayStatus: computeDisplayStatus(b) });
          if (item.approvalProgress) {
            if (item.approvalProgress.isRejected) {
              item._approvalPercent = 0;
              item._approvalBarColor = 'background:linear-gradient(90deg,#ef4444 0%,#f87171 100%);';
            } else if (item.approvalProgress.isApproved) {
              item._approvalPercent = 100;
            } else {
              item._approvalPercent = Math.round(item.approvalProgress.currentStep / item.approvalProgress.totalSteps * 100);
            }
            // Pre-compute full flow timeline for WXML
            item._flowTimeline = buildFlowTimeline(item.approvalProgress);
          }
          return item;
        });
        this.setData({myBookings: bookings});
      }
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { this.setData({loading:false}); }
  },

  async cancelMyBooking(e) {
    const id=e.currentTarget.dataset.id;
    const booking = this.data.myBookings.find(b => b.id === id);
    if (!booking) return;
    if (booking.displayStatus === 'inUse') {
      showShortToast('使用中的借用不能取消，请使用"结束使用"');
      return;
    }
    if (booking.displayStatus === 'completed') {
      showShortToast('已完成的借用不能取消');
      return;
    }
    wx.showModal({
      title: '确认取消',
      content: '确定取消该借用申请吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const res=await callFunction({name:'cancelVenueBooking',data:{id}});
          if(res.status==='success'){showShortToast('已取消');this.loadMyBookings();}else showShortToast(res.message);
        } catch(e) { showShortToast(getErrorText(e,'取消失败')); }
      }
    });
  },

  async endMyBooking(e) {
    const id=e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认结束使用',
      content: '确定要结束该场地的使用吗？结束时间将更新为当前时间。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const res=await callFunction({name:'endVenueBooking',data:{id}});
          if(res.status==='success'){showShortToast('使用已结束');this.loadMyBookings();}else showShortToast(res.message);
        } catch(e) { showShortToast(getErrorText(e,'操作失败')); }
      }
    });
  },

  goPendingApprovals() {
    wx.navigateTo({ url: '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals' });
  },

  // ── Expandable flow ──
  toggleFlowNode(e) {
    var key = e.currentTarget.dataset.nodeKey;
    this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key });
  },

  noop() {}
});
