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

function computeDisplayStatus(item) {
  if (item.status === 'pending') return 'pending';
  if (item.status === 'rejected') return 'rejected';
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'approved') {
    const now = new Date();
    const timeStart = new Date(item.timeStart.replace(' ', 'T'));
    const timeEnd = new Date(item.timeEnd.replace(' ', 'T'));
    if (now < timeStart) return 'approved';
    if (now >= timeEnd) return 'completed';
    return 'inUse';
  }
  return item.status;
}

/**
 * Build all available half-hour time slots from daily schedule data.
 * Each slot includes availability status for intelligent suggestions.
 */
function buildAvailableTimeSlots(dayData, filterPast, dateStr) {
  const openSlots = dayData.openSlots || [];
  const bookedSlots = dayData.bookedSlots || [];
  const activitySlots = dayData.activitySlots || [];

  const slots = [];
  const now = new Date();
  const today = fmtLocalDate(now);
  const currentMin = now.getHours() * 60 + now.getMinutes();

  for (let min = 0; min < 24 * 60; min += 30) {
    // Check if in open hours
    let inOpen = false;
    for (const o of openSlots) {
      if (min >= timeToMin(o.timeStart) && min + 30 <= timeToMin(o.timeEnd)) {
        inOpen = true;
        break;
      }
    }
    if (!inOpen) continue; // Not in open hours

    // Check if blocked
    let status = 'free';
    for (const b of bookedSlots) {
      if (min < timeToMin(b.timeEnd) && min + 30 > timeToMin(b.timeStart)) {
        status = b.status === 'pending' ? 'pending' : 'booked';
        break;
      }
    }
    if (status === 'free') {
      for (const a of activitySlots) {
        if (min < timeToMin(a.timeEnd) && min + 30 > timeToMin(a.timeStart)) {
          status = 'activity';
          break;
        }
      }
    }

    // Past time filtering (for start time only)
    if (filterPast && dateStr === today && min < currentMin) continue;

    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const time = hh + ':' + mm;

    slots.push({ time, min, status });
  }
  return slots;
}

/**
 * Find the first "clean" end time after startMin that doesn't cross blocked slots.
 * Falls back to the last open slot time if no clean block is found.
 */
function findSmartEndTime(startMin, availableSlots) {
  // Find all free segments after startMin
  const freeSegments = [];
  let segStart = -1;
  for (const slot of availableSlots) {
    if (slot.min <= startMin) continue;
    if (slot.status === 'free') {
      if (segStart < 0) segStart = slot.min;
    } else {
      if (segStart >= 0) {
        freeSegments.push({ start: segStart, end: slot.min });
        segStart = -1;
      }
    }
  }
  if (segStart >= 0) freeSegments.push({ start: segStart, end: 24 * 60 });

  if (!freeSegments.length) return '';

  // Default: start + 1 hour, but ensure it's in a free segment
  const idealEnd = startMin + 60;
  for (const seg of freeSegments) {
    if (seg.start <= idealEnd && seg.end > idealEnd) {
      // Round idealEnd up to nearest half-hour
      const rounded = Math.ceil(idealEnd / 30) * 30;
      if (rounded <= seg.end) {
        return String(Math.floor(rounded / 60)).padStart(2, '0') + ':' + String(rounded % 60).padStart(2, '0');
      }
      // Use end of segment
      const endMin = seg.end - (seg.end % 30);
      if (endMin > startMin) {
        return String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
      }
    }
    if (seg.start > idealEnd) {
      // Use start of next segment
      return String(Math.floor(seg.start / 60)).padStart(2, '0') + ':' + String(seg.start % 60).padStart(2, '0');
    }
  }
  return '';
}

Page({
  data: {
    activeTab: 'browse',
    loading: false,

    // ── Browse tab ──
    venues: [],
    scheduleVisible: false,
    scheduleVenueId: '', scheduleVenueName: '', scheduleWeekStart: '',
    timetableColumns: [], timetableHours: HOURS,
    bookingDetailVisible: false, bookingDetail: null,

    // ── Booking form ──
    bookingVisible: false, bookingVenueId: '', bookingVenueName: '',
    bookingStartDate: '', bookingStartDateDisplay: '',
    bookingEndDate: '', bookingEndDateDisplay: '',
    bookingTitle: '', bookingDesc: '',
    bookingTimeStart: '', bookingTimeEnd: '',
    // Text input for custom time entry
    timeStartInput: '', timeEndInput: '',
    timelineBlocks: [],
    // Available time slot lists (for smart defaults & validation)
    availableStartSlots: [], availableEndSlots: [],
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

    // ── Hero ──
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

  // ═══════════════ Timetable ═══════════════
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
    this._openBookingForm(date, time);
  },
  onTimetableOpenTap(e) {
    const date=e.currentTarget.dataset.date;
    const timeY=Math.round((e.detail.y-HEADER_H)/(HOUR_HEIGHT/2));
    if(timeY<0)return;
    const idx=Math.min(Math.max(timeY,0),47), h=Math.floor(idx/2), m=(idx%2)*30;
    const time=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    this._openBookingForm(date, time);
  },

  /** Open booking form for a venue at a given start date/time. */
  _openBookingForm(date, presetTime) {
    this.setData({
      bookingVisible: true,
      bookingVenueId: this.data.scheduleVenueId,
      bookingVenueName: this.data.scheduleVenueName,
      bookingStartDate: date, bookingStartDateDisplay: date,
      bookingEndDate: date, bookingEndDateDisplay: date,
      bookingTimeStart: presetTime || '', bookingTimeEnd: '',
      timeStartInput: presetTime || '', timeEndInput: '',
      bookingTitle: '', bookingDesc: '', timelineBlocks: [],
      startHours: [], startHourIdx: 0, startMinIdx: 0,
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      availableStartSlots: [], availableEndSlots: [],
      _startDayData: null, _endDayData: null
    });
    this._loadScheduleForDate(date, presetTime);
  },

  // ═══════════════ Booking Form ═══════════════

  openBooking(e) {
    const id = e.currentTarget.dataset.id;
    const v = this.data.venues.find(v => v.id === id);
    const today = this.data.bookingStartDate;
    this.setData({
      bookingVisible: true, bookingVenueId: id, bookingVenueName: v ? v.name : '',
      bookingStartDate: today, bookingStartDateDisplay: today,
      bookingEndDate: today, bookingEndDateDisplay: today,
      bookingTitle: '', bookingDesc: '',
      bookingTimeStart: '', bookingTimeEnd: '',
      timeStartInput: '', timeEndInput: '',
      timelineBlocks: [],
      startHours: [], startHourIdx: 0, startMinIdx: 0,
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      availableStartSlots: [], availableEndSlots: [],
      _startDayData: null, _endDayData: null
    });
    this._loadScheduleForDate(today);
  },

  closeBooking() { this.setData({ bookingVisible: false }); },

  /** Load schedule for a date and set smart defaults for times. */
  async _loadScheduleForDate(dateStr, presetTime) {
    const venueId = this.data.bookingVenueId;
    if (!venueId || !dateStr) return;
    wx.showLoading({ title: '查询空闲...' });
    try {
      const res = await callFunction({ name: 'getVenueSchedule', data: { venueId, dateFrom: dateStr, dateTo: dateStr } });
      if (res.status === 'success') {
        const dayData = (res.dailySchedules || [])[0];
        if (dayData) {
          this._applyDateSchedule(dayData, dateStr, presetTime);
        } else {
          this.setData({ timelineBlocks: [], startHours: [], endHours: [], availableStartSlots: [], availableEndSlots: [], _startDayData: null, _endDayData: null });
        }
      } else {
        showShortToast(res.message || '加载时段失败');
      }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  /** Process daily schedule: build timeline, picker options, available slots, and set smart defaults. */
  _applyDateSchedule(dayData, dateStr, presetTime) {
    const result = this._buildTimelineAndOptions(dayData);

    // Build available start slots (filter past times when date is today)
    const isToday = dateStr === fmtLocalDate(new Date());
    const availableSlots = buildAvailableTimeSlots(dayData, true, dateStr);

    // Pick default start time
    let startTime = presetTime || '';
    if (!startTime && availableSlots.length) {
      // Use the first available slot (closest to now or first of day)
      startTime = availableSlots[0].time;
    }

    // Set picker indices for start time
    const parts = startTime ? startTime.split(':') : [];
    const useH = parts.length === 2 ? parseInt(parts[0]) : 0;
    const useM = parts.length === 2 ? parseInt(parts[1]) : 0;
    const sHi = Math.max(0, result.startHours.findIndex(h => h.value === useH));
    const sMi = Math.max(0, ALL_MINUTES.findIndex(m => m.value === useM));

    // Pick default end time: find smart end time after start
    const startMin = timeToMin(startTime);
    const endSlotList = buildAvailableTimeSlots(dayData, false, dateStr);
    let endTime = findSmartEndTime(startMin, endSlotList);

    const endParts = endTime ? endTime.split(':') : [];
    const endH = endParts.length === 2 ? parseInt(endParts[0]) : 0;
    const endM = endParts.length === 2 ? parseInt(endParts[1]) : 0;

    // Build filtered end hours (after start time, in open hours)
    const endHourSet = new Set();
    for (const slot of endSlotList) {
      if (slot.min > startMin && slot.status === 'free') {
        endHourSet.add(Math.floor(slot.min / 60));
      }
    }
    const sortedEndHours = Array.from(endHourSet).sort((a, b) => a - b);
    const endHoursAll = sortedEndHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));
    const eHi = Math.max(0, endHoursAll.findIndex(h => h.value === endH));
    const eMi = Math.max(0, ALL_MINUTES.findIndex(m => m.value === endM));

    this.setData({
      timelineBlocks: result.timelineBlocks,
      availableStartSlots: availableSlots,
      availableEndSlots: endSlotList,
      startHours: result.startHours, startHourIdx: sHi, startMinIdx: sMi,
      endHours: endHoursAll, endHourIdx: eHi, endMinIdx: eMi,
      bookingTimeStart: startTime, bookingTimeEnd: endTime,
      timeStartInput: startTime, timeEndInput: endTime,
      _startDayData: dayData, _endDayData: dayData
    });
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

  // ── Date picker handlers ──

  onStartDateChange(e) {
    const d = e.detail.value;
    // Clear all time state and reload for new date
    this.setData({
      bookingStartDate: d, bookingStartDateDisplay: d,
      bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeStart: '', bookingTimeEnd: '',
      timeStartInput: '', timeEndInput: '',
      timelineBlocks: [],
      startHours: [], startHourIdx: 0, startMinIdx: 0,
      endHours: [], endHourIdx: 0, endMinIdx: 0,
      availableStartSlots: [], availableEndSlots: [],
      _startDayData: null, _endDayData: null
    });
    this._loadScheduleForDate(d);
  },

  onEndDateChange(e) {
    const d = e.detail.value;
    if (d < this.data.bookingStartDate) {
      showShortToast('结束日期不能早于开始日期');
      return;
    }
    this.setData({
      bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeEnd: '', timeEndInput: '',
      endHours: [], endHourIdx: 0, endMinIdx: 0, _endDayData: null
    });
    if (d !== this.data.bookingStartDate) this._loadEndScheduleForDate(d);
    else {
      // Same date: use start day data for end too
      this.setData({ _endDayData: this.data._startDayData });
      this._refreshEndSlots();
    }
  },

  async _loadEndScheduleForDate(dateStr) {
    const venueId = this.data.bookingVenueId;
    if (!venueId || !dateStr) return;
    try {
      const res = await callFunction({ name: 'getVenueSchedule', data: { venueId, dateFrom: dateStr, dateTo: dateStr } });
      if (res.status === 'success') {
        const dayData = (res.dailySchedules || [])[0];
        if (dayData) { this.setData({ _endDayData: dayData }); this._refreshEndSlots(); }
      }
    } catch (_) {}
  },

  // ── Time picker handlers ──

  /** Tap a smart slot chip to quickly pick a start time. */
  onStartSlotTap(e) {
    const time = e.currentTarget.dataset.time;
    if (!time) return;
    const parts = time.split(':');
    const h = parseInt(parts[0]), m = parseInt(parts[1]) || 0;
    const sHi = Math.max(0, this.data.startHours.findIndex(item => item.value === h));
    const sMi = Math.max(0, ALL_MINUTES.findIndex(item => item.value === m));
    this._setStartTime(time, sHi, sMi);
  },

  onStartHourChange(e) { const idx=parseInt(e.detail.value), h=this.data.startHours[idx]?this.data.startHours[idx].value:0, m=ALL_MINUTES[this.data.startMinIdx]?ALL_MINUTES[this.data.startMinIdx].value:0; this._setStartTime(String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'), idx, this.data.startMinIdx); },
  onStartMinChange(e) { const idx=parseInt(e.detail.value), m=ALL_MINUTES[idx]?ALL_MINUTES[idx].value:0, h=this.data.startHours[this.data.startHourIdx]?this.data.startHours[this.data.startHourIdx].value:0; this._setStartTime(String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'), this.data.startHourIdx, idx); },

  _setStartTime(timeStr, hourIdx, minIdx) {
    // Validate: not in past
    const dateStr = this.data.bookingStartDate;
    const now = new Date();
    const today = fmtLocalDate(now);
    if (dateStr === today) {
      const currentMin = now.getHours() * 60 + now.getMinutes();
      if (timeToMin(timeStr) < currentMin) {
        showShortToast('开始时间不能是过去的时间');
        return;
      }
    }
    // Validate: in open hours
    const slots = this.data.availableStartSlots;
    const isValid = slots.some(s => s.time === timeStr);
    if (!isValid) {
      showShortToast('该时段场地不开放');
      return;
    }

    this.setData({
      startHourIdx: hourIdx, startMinIdx: minIdx,
      bookingTimeStart: timeStr, timeStartInput: timeStr
    });

    // Invalidate end time if it's now before or equal to start
    const startMin = timeToMin(timeStr);
    if (this.data.bookingTimeEnd && timeToMin(this.data.bookingTimeEnd) <= startMin) {
      this.setData({ bookingTimeEnd: '', timeEndInput: '', endHours: [], endHourIdx: 0, endMinIdx: 0 });
    }
    this._refreshEndSlots();
  },

  onEndHourChange(e) { const idx=parseInt(e.detail.value), h=this.data.endHours[idx]?this.data.endHours[idx].value:0, m=ALL_MINUTES[this.data.endMinIdx]?ALL_MINUTES[this.data.endMinIdx].value:0; this._setEndTime(String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'), idx, this.data.endMinIdx); },
  onEndMinChange(e) { const idx=parseInt(e.detail.value), m=ALL_MINUTES[idx]?ALL_MINUTES[idx].value:0, h=this.data.endHours[this.data.endHourIdx]?this.data.endHours[this.data.endHourIdx].value:0; this._setEndTime(String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'), this.data.endHourIdx, idx); },

  _setEndTime(timeStr, hourIdx, minIdx) {
    const startMin = timeToMin(this.data.bookingTimeStart);
    if (timeToMin(timeStr) <= startMin) {
      showShortToast('结束时间必须晚于开始时间');
      return;
    }
    this.setData({
      endHourIdx: hourIdx, endMinIdx: minIdx,
      bookingTimeEnd: timeStr, timeEndInput: timeStr
    });
  },

  /** Rebuild end time slots based on current start time + date data. */
  _refreshEndSlots() {
    const dayData = this.data._endDayData || this.data._startDayData;
    if (!dayData) return;

    const startMin = timeToMin(this.data.bookingTimeStart);
    if (startMin < 0) return;

    // Build available end slots (no past filtering for end, but must be after start)
    const allSlots = buildAvailableTimeSlots(dayData, false, '');
    const endSlots = allSlots.filter(s => s.min > startMin);
    this.setData({ availableEndSlots: endSlots });

    // Build filtered end hours
    const endHourSet = new Set();
    for (const slot of endSlots) {
      if (slot.status === 'free' || slot.status === 'pending') {  // pending bookings may get rejected
        endHourSet.add(Math.floor(slot.min / 60));
      }
    }
    const sortedHours = Array.from(endHourSet).sort((a, b) => a - b);
    const endHoursAll = sortedHours.map(h => ({ value: h, label: String(h).padStart(2, '0') }));

    // If no available end hours, clear end time
    if (!endHoursAll.length) {
      this.setData({ endHours: [], endHourIdx: 0, endMinIdx: 0, bookingTimeEnd: '', timeEndInput: '' });
      return;
    }

    // Smart default: if no end time set yet, pick the best one
    if (!this.data.bookingTimeEnd) {
      const smartEnd = findSmartEndTime(startMin, allSlots.filter(s => s.status === 'free'));
      if (smartEnd) {
        const eParts = smartEnd.split(':');
        const eH = parseInt(eParts[0]), eM = parseInt(eParts[1]) || 0;
        const eHi = Math.max(0, endHoursAll.findIndex(h => h.value === eH));
        const eMi = Math.max(0, ALL_MINUTES.findIndex(m => m.value === eM));
        this.setData({
          endHours: endHoursAll, endHourIdx: eHi, endMinIdx: eMi,
          bookingTimeEnd: smartEnd, timeEndInput: smartEnd
        });
        return;
      }
    }

    // Preserve current end time if still valid
    const curEnd = this.data.bookingTimeEnd;
    if (curEnd) {
      const curEndMin = timeToMin(curEnd);
      const stillValid = endSlots.some(s => s.time === curEnd && s.status !== 'booked');
      if (stillValid) {
        const curEHi = Math.max(0, endHoursAll.findIndex(h => h.value === Math.floor(curEndMin / 60)));
        const curEMi = Math.max(0, ALL_MINUTES.findIndex(m => m.value === (curEndMin % 60)));
        this.setData({ endHours: endHoursAll, endHourIdx: curEHi, endMinIdx: curEMi });
        return;
      }
      // Clear invalid end time
      this.setData({ endHours: endHoursAll, endHourIdx: 0, endMinIdx: 0, bookingTimeEnd: '', timeEndInput: '' });
      return;
    }

    this.setData({ endHours: endHoursAll, endHourIdx: 0, endMinIdx: 0 });
  },

  // ── Text input for custom time entry ──

  onTimeStartInput(e) {
    this.setData({ timeStartInput: e.detail.value });
  },

  onTimeStartInputBlur() {
    const val = (this.data.timeStartInput || '').trim();
    if (!val) return;
    // Validate format HH:MM
    const match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      showShortToast('格式不正确，请使用 HH:MM（如 14:30）');
      this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
      return;
    }
    let h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      showShortToast('时间范围不正确');
      this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
      return;
    }
    // Round minutes to nearest 30
    m = Math.round(m / 30) * 30;
    if (m >= 60) { h++; m = 0; }
    if (h >= 24) { showShortToast('时间不能超过 23:59'); return; }
    const timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

    // Validate: not past
    const dateStr = this.data.bookingStartDate;
    const now = new Date();
    const today = fmtLocalDate(now);
    if (dateStr === today) {
      const currentMin = now.getHours() * 60 + now.getMinutes();
      if (timeToMin(timeStr) < currentMin) {
        showShortToast('开始时间不能是过去的时间');
        this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
        return;
      }
    }

    // Validate: in open hours
    const slots = this.data.availableStartSlots;
    if (!slots.length) {
      // No available slots loaded yet
      this.setData({ timeStartInput: timeStr, bookingTimeStart: timeStr });
      return;
    }
    if (!slots.some(s => s.time === timeStr)) {
      showShortToast('该时段场地不开放');
      this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
      return;
    }

    // Success: set start time and refresh end
    let sHi = 0, sMi = 0;
    if (this.data.startHours.length) {
      sHi = Math.max(0, this.data.startHours.findIndex(item => item.value === h));
      sMi = Math.max(0, ALL_MINUTES.findIndex(item => item.value === m));
    }
    this.setData({ timeStartInput: timeStr, bookingTimeStart: timeStr, startHourIdx: sHi, startMinIdx: sMi });

    // Clear end time if invalid
    const startMinVal = timeToMin(timeStr);
    if (this.data.bookingTimeEnd && timeToMin(this.data.bookingTimeEnd) <= startMinVal) {
      this.setData({ bookingTimeEnd: '', timeEndInput: '' });
    }
    this._refreshEndSlots();
  },

  onTimeEndInput(e) {
    this.setData({ timeEndInput: e.detail.value });
  },

  onTimeEndInputBlur() {
    const val = (this.data.timeEndInput || '').trim();
    if (!val) return;
    const match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      showShortToast('格式不正确，请使用 HH:MM（如 15:30）');
      this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
      return;
    }
    let h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      showShortToast('时间范围不正确');
      this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
      return;
    }
    m = Math.round(m / 30) * 30;
    if (m >= 60) { h++; m = 0; }
    if (h >= 24) { showShortToast('时间不能超过 23:59'); return; }
    const timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

    // Validate: after start
    const startMin = timeToMin(this.data.bookingTimeStart);
    if (timeToMin(timeStr) <= startMin) {
      showShortToast('结束时间必须晚于开始时间');
      this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
      return;
    }

    this.setData({ timeEndInput: timeStr, bookingTimeEnd: timeStr });

    // Update picker indices
    const eHi = this.data.endHours.length ? Math.max(0, this.data.endHours.findIndex(item => item.value === h)) : 0;
    const eMi = Math.max(0, ALL_MINUTES.findIndex(item => item.value === m));
    this.setData({ endHourIdx: eHi, endMinIdx: eMi });
  },

  // ── Other ──

  onFieldInput(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value}); },

  async submitBooking() {
    const {bookingVenueId,bookingStartDate,bookingEndDate,bookingTitle,bookingTimeStart,bookingTimeEnd,bookingDesc,_startDayData,_endDayData}=this.data;
    if(!bookingVenueId||!bookingStartDate||!bookingTimeStart||!bookingTimeEnd){showShortToast('请完整填写信息并选择时间段');return;}
    if(!bookingTitle){showShortToast('请填写借用事由');return;}

    // Validate: start time not in past
    const now = new Date();
    const today = fmtLocalDate(now);
    if (bookingStartDate === today) {
      const currentMin = now.getHours() * 60 + now.getMinutes();
      if (timeToMin(bookingTimeStart) < currentMin) {
        showShortToast('开始时间不能是过去的时间'); return;
      }
    }

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
    if (booking.displayStatus === 'inUse') { showShortToast('使用中的借用不能取消，请使用"结束使用"'); return; }
    if (booking.displayStatus === 'completed') { showShortToast('已完成的借用不能取消'); return; }
    wx.showModal({
      title: '确认取消', content: '确定取消该借用申请吗？',
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
      title: '确认结束使用', content: '确定要结束该场地的使用吗？结束时间将更新为当前时间。',
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

  toggleFlowNode(e) {
    var key = e.currentTarget.dataset.nodeKey;
    this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key });
  },

  noop() {}
});
