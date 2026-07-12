const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');
const eventBus = require('../../../../utils/eventBus');

const HOURS = ['00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','24:00'];
const HOUR_HEIGHT = 64;
const BASE_MIN = 0;
const HEADER_H = 58;
const TEXT_OFFSET = 22;
const TOTAL_MIN = 24 * 60;
const SNAP = 10;
const MINUTE_OPTS = [0,10,20,30,40,50];

function timeToMin(t) { if (!t) return 0; const p = String(t).split(':'); return (parseInt(p[0])||0)*60 + (parseInt(p[1])||0); }
function fmtLocalDate(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function calcBlock(ts, te) { const s=timeToMin(ts),e=timeToMin(te); return { top:Math.round((s-BASE_MIN)/60*HOUR_HEIGHT), height:Math.max(Math.round((e-s)/60*HOUR_HEIGHT),20) }; }
function slotsToIntervals(slots) { return (slots||[]).map(s=>({start:timeToMin(s.timeStart),end:timeToMin(s.timeEnd)})); }
function mergeIntervals(intervals) { if(!intervals.length)return[]; const s=[...intervals].sort((a,b)=>a.start-b.start),m=[s[0]]; for(let i=1;i<s.length;i++){const l=m[m.length-1]; if(s[i].start<=l.end)l.end=Math.max(l.end,s[i].end); else m.push(s[i]);} return m; }
function findOpenGap(rs,re,mo){let c=rs; for(const iv of mo){if(iv.start>c)return c;if(iv.end>c)c=iv.end;if(c>=re)return-1;}return c<re?c:-1;}
function findBlockedOverlap(rs,re,mb){for(const iv of mb){if(iv.start<re&&iv.end>rs)return iv;}return null;}
function minToTime(min) { if (min < 0) return '00:00'; if (min >= TOTAL_MIN) return '24:00'; let h = Math.floor(min / 60), m = min % 60; return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); }
function snapMin(min) { return Math.round(min / SNAP) * SNAP; }

function computeDisplayStatus(item) {
  if (item.status === 'pending') return 'pending';
  if (item.status === 'rejected') return 'rejected';
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'approved') {
    let now = new Date();
    let timeStart = new Date(item.timeStart.replace(' ', 'T'));
    let timeEnd = new Date(item.timeEnd.replace(' ', 'T'));
    if (now < timeStart) return 'approved';
    if (now >= timeEnd) return 'completed';
    return 'inUse';
  }
  return item.status;
}

function buildBlockedIntervals(dayData) {
  let blocked = [];
  if (dayData) {
    let bookedSlots = dayData.bookedSlots || [];
    for (let i = 0; i < bookedSlots.length; i++) {
      blocked.push({ start: timeToMin(bookedSlots[i].timeStart), end: timeToMin(bookedSlots[i].timeEnd) });
    }
    let activitySlots = dayData.activitySlots || [];
    for (let j = 0; j < activitySlots.length; j++) {
      blocked.push({ start: timeToMin(activitySlots[j].timeStart), end: timeToMin(activitySlots[j].timeEnd) });
    }
  }
  return mergeIntervals(blocked);
}

function computeOpenHours(openSlots) {
  let hours = [];
  for (let h = 0; h < 24; h++) {
    let hs = h * 60, he = hs + 60;
    for (let i = 0; i < openSlots.length; i++) {
      let ss = timeToMin(openSlots[i].timeStart), se = timeToMin(openSlots[i].timeEnd);
      if (ss < he && se > hs && Math.min(se, he) - Math.max(ss, hs) >= 10) {
        hours.push({ label: String(h), value: h }); break;
      }
    }
  }
  return hours;
}

function findDefaultStartMin(dayData, dateStr) {
  let openSlots = dayData.openSlots || [];
  if (!openSlots.length) return -1;
  let now = new Date(), today = fmtLocalDate(now), cur = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < openSlots.length; i++) {
    let s = timeToMin(openSlots[i].timeStart), e = timeToMin(openSlots[i].timeEnd);
    if (dateStr === today) {
      if (e <= cur) continue;
      return snapMin(Math.max(s, cur));
    } else {
      return snapMin(s);
    }
  }
  return snapMin(timeToMin(openSlots[0].timeStart));
}

/** Find the nearest valid start minute ≥ now (or ≥ 0 for future dates), skipping blocked/closed. */
function findNearestValidStartMin(dateStr, dayData) {
  let now = new Date(), today = fmtLocalDate(now);
  let openSlots = dayData.openSlots || [];
  if (!openSlots.length) return -1;
  let curMin = now.getHours() * 60 + now.getMinutes();
  let blockedMerged = buildBlockedIntervals(dayData);
  let startMin;
  if (dateStr === today) {
    startMin = snapMin(curMin);
    if (startMin <= curMin) startMin += SNAP;
  } else {
    startMin = snapMin(timeToMin(openSlots[0].timeStart));
  }
  for (let attempt = 0; attempt < TOTAL_MIN / SNAP; attempt++) {
    let candidate = startMin + attempt * SNAP;
    if (candidate >= TOTAL_MIN) break;
    let inOpen = false;
    for (let oi = 0; oi < openSlots.length; oi++) {
      if (candidate >= timeToMin(openSlots[oi].timeStart) && candidate < timeToMin(openSlots[oi].timeEnd)) { inOpen = true; break; }
    }
    if (!inOpen) continue;
    let blocked = false;
    for (let bi = 0; bi < blockedMerged.length; bi++) {
      if (candidate >= blockedMerged[bi].start && candidate < blockedMerged[bi].end) { blocked = true; break; }
    }
    if (blocked) continue;
    return candidate;
  }
  return -1;
}

/**
 * Find a smart end time after startMin.
 * Default: start + 1h. If blocked, push BACKWARD to just before the block.
 * If that still conflicts, fall back to start + 1 min (minimum duration).
 */
function findSmartEnd(startMin, openMerged, blockedMerged) {
  // Find which open slot contains startMin
  let slotEnd = TOTAL_MIN;
  for (let i = 0; i < openMerged.length; i++) {
    if (startMin >= openMerged[i].start && startMin < openMerged[i].end) {
      slotEnd = openMerged[i].end;
      break;
    }
  }

  let ideal = startMin + 60;
  if (ideal > slotEnd) ideal = slotEnd;

  // Check if [start, ideal] crosses a blocked interval
  let conflict = findBlockedOverlap(startMin, ideal, blockedMerged);
  if (conflict) {
    // Push backward to just before the conflict
    ideal = conflict.start;
  }

  // Also check for open gaps (closed hours between start and ideal)
  let gap = findOpenGap(startMin, ideal, openMerged);
  if (gap >= 0) ideal = gap;

  // Minimum 1 minute after start
  if (ideal <= startMin) ideal = startMin + 1;
  if (ideal > slotEnd) ideal = slotEnd;
  if (ideal <= startMin) ideal = startMin + 1;

  return Math.min(ideal, TOTAL_MIN);
}

/** Check if endMin is still valid given startMin. */
function isEndStillValid(startMin, endMin, openMerged, blockedMerged) {
  if (endMin <= startMin) return false;
  if (findBlockedOverlap(startMin, endMin, blockedMerged)) return false;
  if (findOpenGap(startMin, endMin, openMerged) >= 0) return false;
  return true;
}

Page({
  data: {
    activeTab: 'browse', loading: false,
    venues: [],
    scheduleVisible: false, scheduleVenueId: '', scheduleVenueName: '', scheduleWeekStart: '',
    timetableColumns: [], timetableHours: HOURS,
    bookingDetailVisible: false, bookingDetail: null,
    bookingVisible: false, bookingVenueId: '', bookingVenueName: '',
    bookingStartDate: '', bookingStartDateDisplay: '',
    bookingEndDate: '', bookingEndDateDisplay: '',
    bookingTitle: '', bookingDesc: '',
    bookingTimeStart: '', bookingTimeEnd: '',
    timeStartInput: '', timeEndInput: '',
    timelineBlocks: [],
    startHandleX: 0, endHandleX: 0,
    timelineSelection: null, _timelineWidth: 0,
    startHours: [], endHours: [], startMinIdx: -1, endMinIdx: -1,
    minuteOpts: [
      {label:'00',value:0},{label:'10',value:10},{label:'20',value:20},
      {label:'30',value:30},{label:'40',value:40},{label:'50',value:50}
    ],
    durationChips: [
      { label: '30分钟', minutes: 30 }, { label: '1小时', minutes: 60 },
      { label: '1.5小时', minutes: 90 }, { label: '2小时', minutes: 120 },
      { label: '3小时', minutes: 180 }
    ],
    purposes: [],
    statusLabels: { pending:'待审核', approved:'已通过', rejected:'已驳回', cancelled:'已取消', inUse:'使用中', completed:'已完成' },
    HOUR_HEIGHT: HOUR_HEIGHT, HEADER_H: HEADER_H,
    myBookings: [], pendingApprovalCount: 0, expandedNodeKey: '',

    // ── Approvals tab ──
    pending: [],
    lastUpdateTime: '',
    lastPendingCount: 0,
    lastPendingSignature: '',
    approvalVisible: false,
    approvalTarget: null,
    approvalAction: '',
    approvalComment: '',
    approvalSubmitting: false,
    heroName: '场地借用', heroIdentity: '加载中', heroSubtitle: '欢迎使用REDSU智慧工作台系统 · 场地借用',

    // ── Custom time keyboard ──
    _kbVisible: false,
    _kbTarget: '',        // 'startHour' | 'startMin' | 'endHour' | 'endMin'
    _kbField: 'hour',     // 'hour' | 'min' — active sub-field
    _kbHourVal: '',       // hour digits being edited
    _kbMinVal: '',        // minute digits being edited
    _kbSelected: false,   // true when field is in "select-all" mode (any key replaces content)
    _kbGray: {},          // {digit: true} for grayed-out numpad keys
  },

  _loadUserInfo() {
    try {
      let roleProfiles = wx.getStorageSync('roleProfiles');
      let user = roleProfiles && roleProfiles.user;
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
    this._isPageVisible = true;
    this._loadUserInfo();
    this._initWeekStart();
    this.loadVenues();
    this.loadPurposes();
    this.loadPendingCount();
    if (this.data.activeTab === 'bookings') this.loadMyBookings();
    if (this.data.activeTab === 'approvals') this.loadPendingData();
    this.startPolling();
    if (!this._boundVenueChanged) {
      this._boundVenueChanged = this._onVenueChanged.bind(this);
      eventBus.on('venue:changed', this._boundVenueChanged);
    }
  },

  onHide() {
    this._isPageVisible = false;
    this.stopPolling();
    if (this._boundVenueChanged) {
      eventBus.off('venue:changed', this._boundVenueChanged);
      this._boundVenueChanged = null;
    }
  },

  onUnload() {
    this.stopPolling();
    if (this._boundVenueChanged) {
      eventBus.off('venue:changed', this._boundVenueChanged);
      this._boundVenueChanged = null;
    }
  },

  _onVenueChanged() {
    this.loadPendingCount();
    if (this.data.activeTab === 'bookings') this.loadMyBookings();
    if (this.data.activeTab === 'approvals') this.loadPendingData();
    if (this.data.scheduleVisible) this.loadTimetable();
  },

  _emitVenueChanged(reason, bookingId) {
    eventBus.emit('venue:changed', { reason: reason || '', bookingId: bookingId || '' });
    eventBus.emit('approval:done');
  },

  async loadPendingCount() {
    try {
      let res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') this.setData({ pendingApprovalCount: (res.pending || []).length });
    } catch (_) {}
  },

  switchTab(e) {
    let tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'bookings') this.loadMyBookings();
    if (tab === 'approvals') this.loadPendingData();
  },

  // ═══ Browse ═══
  async loadVenues() {
    this.setData({ loading: true });
    try {
      let res = await callFunction({ name: 'listVenuesForBooking', data: {} });
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
      else showShortToast(res.message || '加载失败');
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { this.setData({ loading: false }); }
  },

  async loadPurposes() {
    try {
      let res = await callFunction({ name: 'listVenueBookingPurposes', data: {} });
      if (res.status === 'success') this.setData({ purposes: res.purposes || [] });
      else showShortToast(res.message || '加载失败');
    } catch (_) {}
  },

  _initWeekStart() {
    let now = new Date(), day = now.getDay(), monday = new Date(now);
    monday.setDate(now.getDate()-(day===0?6:day-1));
    let today = fmtLocalDate(now);
    this.setData({ scheduleWeekStart: fmtLocalDate(monday), bookingStartDate: today, bookingStartDateDisplay: today, bookingEndDate: today, bookingEndDateDisplay: today });
  },

  onSelectPurpose(e) { this.setData({ bookingTitle: e.currentTarget.dataset.text }); },

  // ═══ Timetable ═══
  async openSchedule(e) {
    let id = e.currentTarget.dataset.id;
    let v = this.data.venues.find(function(v){return v.id===id;});
    this.setData({ scheduleVisible:true, scheduleVenueId:id, scheduleVenueName:v?v.name:'', timetableColumns:[] });
    await this.loadTimetable();
  },
  closeSchedule() { this.setData({ scheduleVisible:false, bookingDetailVisible:false, expandedNodeKey:'' }); },

  async loadTimetable() {
    let _a = this.data, scheduleVenueId = _a.scheduleVenueId, scheduleWeekStart = _a.scheduleWeekStart;
    let parts = scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2];
    let end = new Date(y,m-1,d+6), dateTo = fmtLocalDate(end);
    wx.showLoading({title:'加载中...'});
    try {
      let res = await callFunction({name:'getVenueSchedule',data:{venueId:scheduleVenueId,dateFrom:scheduleWeekStart,dateTo}});
      if(res.status==='success') this._buildTimetable(res.dailySchedules||[]);
	      else showShortToast(res.message || '加载失败');
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { wx.hideLoading(); }
  },

  _buildTimetable(dailySchedules) {
    let parts = this.data.scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2];
    let labels = ['周一','周二','周三','周四','周五','周六','周日'];
    let columns = [];
    for(let i=0;i<7;i++) {
      let dd = new Date(y,m-1,d+i), dateStr = fmtLocalDate(dd);
      let dateDisp = String(dd.getMonth()+1).padStart(2,'0')+'/'+String(dd.getDate()).padStart(2,'0');
      let dayData = dailySchedules.find(function(ds){return ds.date===dateStr;});
      columns.push(this._buildDayColumn(dayData,dateStr,labels[i],dateDisp));
    }
    this.setData({timetableColumns:columns});
  },

  _buildDayColumn(dayData,dateStr,label,dateDisplay) {
    let openBlocks=[], eventBlocks=[], timeTargets=[];
    if(dayData&&dayData.openSlots) {
      for(let oi=0;oi<dayData.openSlots.length;oi++) {
        let o = dayData.openSlots[oi];
        let _a = calcBlock(o.timeStart,o.timeEnd), top = _a.top, height = _a.height;
        let s = timeToMin(o.timeStart), e = timeToMin(o.timeEnd);
        openBlocks.push({top:top+HEADER_H+TEXT_OFFSET,height:height,startMin:s,endMin:e,duration:e-s});
        for(let min=s;min<e;min+=30) {
          let hh = Math.floor(min/60), mm = min%60;
          timeTargets.push({top:top+HEADER_H+TEXT_OFFSET+(min-s)/(e-s)*height, time:String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')});
        }
      }
    }
    if(dayData&&dayData.activitySlots) {
      for(let ai=0;ai<dayData.activitySlots.length;ai++) {
        let a = dayData.activitySlots[ai];
        let _b = calcBlock(a.timeStart,a.timeEnd), top2 = _b.top, height2 = _b.height;
        eventBlocks.push({top:top2+HEADER_H+TEXT_OFFSET,height:height2,status:'activity',label:a.ruleName||'活动',type:'activity'});
      }
    }
    if(dayData&&dayData.bookedSlots) {
      for(let bi=0;bi<dayData.bookedSlots.length;bi++) {
        let b = dayData.bookedSlots[bi];
        let _c = calcBlock(b.timeStart,b.timeEnd), top3 = _c.top, height3 = _c.height;
        eventBlocks.push({top:top3+HEADER_H+TEXT_OFFSET,height:height3,status:b.status==='pending'?'pending':'booked',label:b.title||'已借用',type:'booking',
          booking:{id:b.id,title:b.title,description:b.description,userId:b.userId,userName:b.userName,userDept:b.userDept||'',userIdentity:b.userIdentity||'',userWorkGroup:b.userWorkGroup||'',timeStart:b.fullTimeStart||b.timeStart,timeEnd:b.fullTimeEnd||b.timeEnd,status:b.status}});
      }
    }
    return {date:dateStr,label:label,dateDisplay:dateDisplay,openBlocks:openBlocks,eventBlocks:eventBlocks,timeTargets:timeTargets};
  },

  onTimetablePrevWeek() { let parts = this.data.scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2]; this.setData({scheduleWeekStart:fmtLocalDate(new Date(y,m-1,d-7))}); this.loadTimetable(); },
  onTimetableNextWeek() { let parts = this.data.scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2]; this.setData({scheduleWeekStart:fmtLocalDate(new Date(y,m-1,d+7))}); this.loadTimetable(); },
  onTimetableBlockTap(e) { let b=e.currentTarget.dataset.block; if(!b||!b.booking)return; this.setData({bookingDetailVisible:true,bookingDetail:b.booking}); },
  closeBookingDetail() { this.setData({bookingDetailVisible:false, expandedNodeKey:''}); },

  viewMyBookingDetail(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.myBookings.find(function(b){return b.id===id;});
    if (!item) return;
    this.setData({ bookingDetailVisible: true, bookingDetail: item, expandedNodeKey: '' });
  },

  onTimeTargetTap(e) {
    let date=e.currentTarget.dataset.date, time=e.currentTarget.dataset.time;
    if(!date||!time)return;
    this._openBookingForm(date, time);
  },
  onTimetableOpenTap(e) {
    let date=e.currentTarget.dataset.date;
    let timeY=Math.round((e.detail.y-HEADER_H)/(HOUR_HEIGHT/2));
    if(timeY<0)return;
    let idx=Math.min(Math.max(timeY,0),47), h=Math.floor(idx/2), m=(idx%2)*30;
    let time=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
    this._openBookingForm(date, time);
  },

  _openBookingForm(date, presetTime) {
    this.setData({
      bookingVisible: true, bookingVenueId: this.data.scheduleVenueId, bookingVenueName: this.data.scheduleVenueName,
      bookingStartDate: date, bookingStartDateDisplay: date, bookingEndDate: date, bookingEndDateDisplay: date,
      bookingTimeStart: '', bookingTimeEnd: '', timeStartInput: '', timeEndInput: '',
      bookingTitle: '', bookingDesc: '', timelineBlocks: [], timelineSelection: null,
      startHandleX: 0, endHandleX: 0, _timelineWidth: 0,
      startHours: [], endHours: [], startMinIdx: -1, endMinIdx: -1,
      _dayData: null
    });
    this._loadScheduleForDate(date, presetTime);
  },

  openBooking(e) {
    let id = e.currentTarget.dataset.id;
    let v = this.data.venues.find(function(x){return x.id===id;});
    let today = this.data.bookingStartDate;
    this.setData({
      bookingVisible: true, bookingVenueId: id, bookingVenueName: v ? v.name : '',
      bookingStartDate: today, bookingStartDateDisplay: today, bookingEndDate: today, bookingEndDateDisplay: today,
      bookingTitle: '', bookingDesc: '', bookingTimeStart: '', bookingTimeEnd: '',
      timeStartInput: '', timeEndInput: '', timelineBlocks: [], timelineSelection: null,
      startHandleX: 0, endHandleX: 0, _timelineWidth: 0,
      startHours: [], endHours: [], startMinIdx: -1, endMinIdx: -1,
      _dayData: null
    });
    this._loadScheduleForDate(today);
  },
  closeBooking() { if (this.data._kbVisible) { this.onKbClose(); return; } this.setData({ bookingVisible: false }); },

  async _loadScheduleForDate(dateStr, presetTime) {
    let venueId = this.data.bookingVenueId;
    if (!venueId || !dateStr) return;
    wx.showLoading({ title: '查询空闲...' });
    try {
      let res = await callFunction({ name: 'getVenueSchedule', data: { venueId: venueId, dateFrom: dateStr, dateTo: dateStr } });
      if (res.status === 'success') {
        let dayData = (res.dailySchedules || [])[0];
        if (dayData) {
          this._applyDateSchedule(dayData, dateStr, presetTime);
        } else {
          this.setData({ timelineBlocks: [], timelineSelection: null, _dayData: null });
        }
      } else { showShortToast(res.message || '加载时段失败'); }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  _applyDateSchedule(dayData, dateStr, presetTime) {
    let timeline = this._buildTimeline(dayData);
    let openHours = computeOpenHours(dayData.openSlots || []);
    let startMin = presetTime ? timeToMin(presetTime) : findDefaultStartMin(dayData, dateStr);
    let startTime = startMin >= 0 ? minToTime(startMin) : '';

    // Compute fallback timeline width (avoid deprecated getSystemInfoSync)
    let fallbackW = this.data._timelineWidth;
    if (!fallbackW) {
      try {
        let winInfo = wx.getWindowInfo ? wx.getWindowInfo() : null;
        fallbackW = (winInfo && winInfo.windowWidth) ? winInfo.windowWidth - 64 : 311;
      } catch(e) { fallbackW = 311; }
    }

    // Compute smart end + selection + chip state — all in one pass for a single setData
    let setObj = {
      timelineBlocks: timeline,
      bookingTimeStart: startTime, timeStartInput: startTime,
      startHours: openHours, _dayData: dayData,
      _timelineWidth: fallbackW
    };

    if (startTime) {
      let sm = startMin;
      let bm = buildBlockedIntervals(dayData);
      let om = mergeIntervals(slotsToIntervals(dayData.openSlots || []));
      let endMin = findSmartEnd(sm, om, bm);
      if (endMin > sm) {
        setObj.bookingTimeEnd = minToTime(endMin);
        setObj.timeEndInput = minToTime(endMin);
      }
      // Handle positions
      let w = fallbackW;
      setObj.startHandleX = Math.round(sm / TOTAL_MIN * w);
      let em2 = endMin > sm ? endMin : sm;
      setObj.endHandleX = Math.round(em2 / TOTAL_MIN * w);
      // Selection overlay
      if (endMin > sm) {
        let dur = endMin - sm;
        let dh = Math.floor(dur / 60), dm = dur % 60;
        setObj._durationText = dh > 0 ? (dh + '小时' + (dm > 0 ? dm + '分钟' : '')) : (dm + '分钟');
        setObj._activeDuration = dur;
        setObj.timelineSelection = {
          left: (sm / TOTAL_MIN * 100).toFixed(2),
          width: ((endMin - sm) / TOTAL_MIN * 100).toFixed(2)
        };
      }
      // Chip highlights
      let sh = parseInt(startTime.split(':')[0]) || 0;
      let smin = parseInt(startTime.split(':')[1]) || 0;
      setObj._startHourVal = sh;
      setObj.startMinIdx = MINUTE_OPTS.indexOf(smin - (smin % 10));
      if (setObj.bookingTimeEnd) {
        let eh = parseInt(setObj.bookingTimeEnd.split(':')[0]) || 0;
        let emin = parseInt(setObj.bookingTimeEnd.split(':')[1]) || 0;
        setObj._endHourVal = eh;
        setObj.endMinIdx = MINUTE_OPTS.indexOf(emin - (emin % 10));
        setObj.endHours = [];
        for (let i = 0; i < openHours.length; i++) {
          if (openHours[i].value >= (sh >= 0 ? sh : 0))
            setObj.endHours.push({ label: openHours[i].label, value: openHours[i].value });
        }
      } else {
        setObj._endHourVal = -1;
        setObj.endMinIdx = -1;
      }
    }

    this.setData(setObj);

    // Async accurate width measurement
    let self = this;
    wx.nextTick(function() { self._queryTimelineWidth(); });
  },

  _buildTimeline(dayData) {
    let openSlots = dayData.openSlots || [];
    let bookedSlots = dayData.bookedSlots || [];
    let activitySlots = dayData.activitySlots || [];
    let blocks = [], t = 0;
    while (t + 30 <= TOTAL_MIN) {
      let inOpen = false;
      for (let oi = 0; oi < openSlots.length; oi++) {
        if (t >= timeToMin(openSlots[oi].timeStart) && t + 30 <= timeToMin(openSlots[oi].timeEnd)) { inOpen = true; break; }
      }
      let status = 'closed';
      if (inOpen) {
        status = 'free';
        for (let bi = 0; bi < bookedSlots.length; bi++) {
          if (t < timeToMin(bookedSlots[bi].timeEnd) && t + 30 > timeToMin(bookedSlots[bi].timeStart)) {
            status = 'booked'; break;
          }
        }
        if (status === 'free') {
          for (let ai = 0; ai < activitySlots.length; ai++) {
            if (t < timeToMin(activitySlots[ai].timeEnd) && t + 30 > timeToMin(activitySlots[ai].timeStart)) {
              status = 'activity'; break;
            }
          }
        }
      }
      let last = blocks[blocks.length - 1];
      if (last && last.status === status) { last.endMin = t + 30; }
      else { blocks.push({ startMin: t, endMin: t + 30, status: status }); }
      t += 30;
    }
    return blocks.map(function(b) {
      return { left: (b.startMin / TOTAL_MIN * 100).toFixed(2), width: ((b.endMin - b.startMin) / TOTAL_MIN * 100).toFixed(2), status: b.status };
    });
  },

  // ═══════════════════ Unified time setting core ═══════════════════

  /** Return {openMerged, blockedMerged} for current day. */
  _getMergedIntervals() {
    let dayData = this.data._dayData;
    if (!dayData) return null;
    return {
      openMerged: mergeIntervals(slotsToIntervals(dayData.openSlots || [])),
      blockedMerged: buildBlockedIntervals(dayData)
    };
  },

  /**
   * Set start time. If end is still valid → keep it; otherwise auto-set end.
   * Returns true on success.
   */
  _setStartTime(timeStr, opts) {
    opts = opts || {};
    let startMin = timeToMin(timeStr);
    let dateStr = this.data.bookingStartDate;
    let dayData = this.data._dayData;
    let now = new Date(), today = fmtLocalDate(now);

    // 1. Past check → auto-correct
    if (dateStr === today && startMin < now.getHours() * 60 + now.getMinutes()) {
      let corrected = findNearestValidStartMin(dateStr, dayData);
      if (corrected >= 0) {
        if (!opts.silent) showShortToast('已自动修正为最近可用时间');
        startMin = corrected;
        timeStr = minToTime(startMin);
      } else {
        if (!opts.silent) showShortToast('今天已无可用时段');
        return false;
      }
    }
    // 2. Must be in open slot
    if (!dayData || !dayData.openSlots) {
      if (!opts.silent) showShortToast('请先选择日期');
      return false;
    }
    let inOpen = false;
    for (let oi = 0; oi < dayData.openSlots.length; oi++) {
      if (startMin >= timeToMin(dayData.openSlots[oi].timeStart) && startMin < timeToMin(dayData.openSlots[oi].timeEnd)) {
        inOpen = true; break;
      }
    }
    if (!inOpen) {
      if (!opts.silent) showShortToast('该时间不在开放时段内');
      return false;
    }
    // 3. Must not be in blocked interval (pending/booked/activity)
    let blockedMerged = buildBlockedIntervals(dayData);
    for (let bi = 0; bi < blockedMerged.length; bi++) {
      if (startMin >= blockedMerged[bi].start && startMin < blockedMerged[bi].end) {
        if (!opts.silent) showShortToast('该时段已被占用');
        return false;
      }
    }

    let w0 = this.data._timelineWidth;
    let smin0 = parseInt(timeStr.split(':')[1]) || 0;
    let sh0 = parseInt(timeStr.split(':')[0]) || 0;
    let upd0 = {
      bookingTimeStart: timeStr, timeStartInput: timeStr,
      _startHourVal: sh0, startMinIdx: MINUTE_OPTS.indexOf(smin0 - (smin0 % 10))
    };
    if (w0) upd0.startHandleX = Math.round(startMin / TOTAL_MIN * w0);
    this.setData(upd0);

    // Check if current end time is still valid
    let curEnd = this.data.bookingTimeEnd;
    let kept = false;
    if (curEnd) {
      let endMin = timeToMin(curEnd);
      let openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots));
      if (isEndStillValid(startMin, endMin, openMerged, blockedMerged)) {
        kept = true;
      }
    }

    if (!kept) {
      this._autoSetEnd(); // already updates timeline/handles/chips in one setData
    } else {
      this._updateTimelineRange();
      this._updateHandlePositions();
      this._updateChipState();
    }
    return true;
  },

  /**
   * Set end time. Validates end > start and no conflicts.
   * Returns true on success.
   */
  _setEndTime(timeStr, opts) {
    opts = opts || {};
    let endMin = timeToMin(timeStr);
    let startMin = timeToMin(this.data.bookingTimeStart);
    let dayData = this.data._dayData;

    if (!this.data.bookingTimeStart) {
      if (!opts.silent) showShortToast('请先选择开始时间');
      return false;
    }
    if (endMin <= startMin) {
      if (!opts.silent) showShortToast('结束时间必须晚于开始时间');
      return false;
    }
    if (dayData && dayData.openSlots) {
      let inOpen = false;
      for (let oi = 0; oi < dayData.openSlots.length; oi++) {
        if (endMin > timeToMin(dayData.openSlots[oi].timeStart) && endMin <= timeToMin(dayData.openSlots[oi].timeEnd)) {
          inOpen = true; break;
        }
      }
      if (!inOpen) {
        if (!opts.silent) showShortToast('结束时间不在开放时段内');
        return false;
      }
      let openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots));
      let gap = findOpenGap(startMin, endMin, openMerged);
      if (gap >= 0) {
        if (!opts.silent) showShortToast(minToTime(gap) + ' 场地不开放');
        return false;
      }
      let blockedMerged = buildBlockedIntervals(dayData);
      let conflict = findBlockedOverlap(startMin, endMin, blockedMerged);
      if (conflict) {
        if (!opts.silent) showShortToast(minToTime(conflict.start) + ' 已被占用，无法跨越');
        return false;
      }
    }

    // Consolidate into one setData
    let w = this.data._timelineWidth;
    let dur2 = endMin - startMin;
    let dh2 = Math.floor(dur2 / 60), dm2 = dur2 % 60;
    let o2 = {
      bookingTimeEnd: timeStr, timeEndInput: timeStr,
      _durationText: dh2 > 0 ? (dh2 + '小时' + (dm2 > 0 ? dm2 + '分钟' : '')) : (dm2 + '分钟'),
      _activeDuration: dur2,
      timelineSelection: { left: (startMin / TOTAL_MIN * 100).toFixed(2), width: (dur2 / TOTAL_MIN * 100).toFixed(2) }
    };
    if (w) {
      o2.endHandleX = Math.round(endMin / TOTAL_MIN * w);
    }
    // Chip state
    let eh2 = parseInt(timeStr.split(':')[0]) || 0;
    let em3 = parseInt(timeStr.split(':')[1]) || 0;
    o2._endHourVal = eh2;
    o2.endMinIdx = MINUTE_OPTS.indexOf(em3 - (em3 % 10));
    let sh2 = parseInt(this.data.bookingTimeStart.split(':')[0]) || 0;
    o2.endHours = [];
    let shs = this.data.startHours;
    for (let i2 = 0; i2 < shs.length; i2++) {
      if (shs[i2].value >= (sh2 >= 0 ? sh2 : 0))
        o2.endHours.push({ label: shs[i2].label, value: shs[i2].value });
    }
    this.setData(o2);
    return true;
  },

  /** Auto-set end time from current start using smart logic. */
  _autoSetEnd() {
    let startMin = timeToMin(this.data.bookingTimeStart);
    let dayData = this.data._dayData;
    if (!dayData || startMin < 0) return;
    let blockedMerged = buildBlockedIntervals(dayData);
    let openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots || []));
    let endMin = findSmartEnd(startMin, openMerged, blockedMerged);
    if (endMin <= startMin) return;
    let endTime = minToTime(endMin);
    let w = this.data._timelineWidth;
    // Consolidate into one setData
    let o = { bookingTimeEnd: endTime, timeEndInput: endTime };
    if (w) {
      o.endHandleX = Math.round(endMin / TOTAL_MIN * w);
      o.startHandleX = Math.round(startMin / TOTAL_MIN * w);
    }
    // Timeline selection
    let dur = endMin - startMin;
    let dh = Math.floor(dur / 60), dm = dur % 60;
    o._durationText = dh > 0 ? (dh + '小时' + (dm > 0 ? dm + '分钟' : '')) : (dm + '分钟');
    o._activeDuration = dur;
    o.timelineSelection = { left: (startMin / TOTAL_MIN * 100).toFixed(2), width: (dur / TOTAL_MIN * 100).toFixed(2) };
    // Chip highlights for end
    let sh = parseInt(this.data.bookingTimeStart.split(':')[0]) || 0;
    let eh = parseInt(endTime.split(':')[0]) || 0;
    let emin = parseInt(endTime.split(':')[1]) || 0;
    o._endHourVal = eh;
    o.endMinIdx = MINUTE_OPTS.indexOf(emin - (emin % 10));
    o.endHours = [];
    let shours = this.data.startHours;
    for (let i = 0; i < shours.length; i++) {
      if (shours[i].value >= (sh >= 0 ? sh : 0))
        o.endHours.push({ label: shours[i].label, value: shours[i].value });
    }
    this.setData(o);
  },

  // ═══════════════════ Timeline dimension & rendering ═══════════════════

  _queryTimelineWidth(retries) {
    retries = retries || 0;
    let self = this;
    wx.createSelectorQuery().select('.timeline-drag-container').boundingClientRect().exec(function(rects) {
      if (rects && rects[0] && rects[0].width) {
        self.setData({ _timelineWidth: rects[0].width });
        self._updateHandlePositions();
      } else if (retries < 8) {
        setTimeout(function() { self._queryTimelineWidth(retries + 1); }, 150);
      } else {
        // Fallback: use window width minus estimated padding
        try {
          let wInfo = wx.getWindowInfo ? wx.getWindowInfo() : null;
          let ww = wInfo ? wInfo.windowWidth : 375;
          self.setData({ _timelineWidth: ww - 64 });
          self._updateHandlePositions();
        } catch(e) {}
      }
    });
  },

  _minToPx(min) {
    let w = this.data._timelineWidth;
    return w ? Math.round(min / TOTAL_MIN * w) : 0;
  },
  _pxToMin(px) {
    let w = this.data._timelineWidth;
    return w ? Math.round(px / w * TOTAL_MIN) : 0;
  },

  _updateHandlePositions() {
    let sm = timeToMin(this.data.bookingTimeStart);
    let em = timeToMin(this.data.bookingTimeEnd);
    this.setData({
      startHandleX: this._minToPx(sm),
      endHandleX: this._minToPx(em || sm)
    });
  },

  _updateTimelineRange() {
    let st = this.data.bookingTimeStart, et = this.data.bookingTimeEnd;
    if (!st || !et) {
      this.setData({ timelineSelection: null, _durationText: '', _activeDuration: 0 });
      return;
    }
    let sm = timeToMin(st), em = timeToMin(et);
    if (em <= sm) { this.setData({ timelineSelection: null, _durationText: '', _activeDuration: 0 }); return; }
    let dur = em - sm;
    let h = Math.floor(dur / 60), m = dur % 60;
    let durText = h > 0 ? (h + '小时' + (m > 0 ? m + '分钟' : '')) : (m + '分钟');
    this.setData({
      timelineSelection: { left: (sm / TOTAL_MIN * 100).toFixed(2), width: ((em - sm) / TOTAL_MIN * 100).toFixed(2) },
      _durationText: durText, _activeDuration: dur
    });
  },

  _updateChipState() {
    let st = this.data.bookingTimeStart, et = this.data.bookingTimeEnd;
    let sh = st ? parseInt(st.split(':')[0]) : -1;
    let sm = st ? parseInt(st.split(':')[1]) : -1;
    let smIdx = MINUTE_OPTS.indexOf(sm);
    let eh = et ? parseInt(et.split(':')[0]) : -1;
    let em = et ? parseInt(et.split(':')[1]) : -1;
    let emIdx = MINUTE_OPTS.indexOf(em);
    let endHours = [];
    let startHours = this.data.startHours;
    for (let i = 0; i < startHours.length; i++) {
      if (startHours[i].value >= (sh >= 0 ? sh : 0)) {
        endHours.push({ label: startHours[i].label, value: startHours[i].value });
      }
    }
    this.setData({
      startMinIdx: smIdx, _startHourVal: sh,
      endHours: endHours, endMinIdx: emIdx, _endHourVal: eh
    });
  },

  // ═══════════════════ Chip selectors ═══════════════════

  // ═══════════════════ Drag handlers ═══════════════════

  // ═══════════════════ Touch / drag ═══════════════════

  onHandleTouchStart(e) {
    this._dragHandle = e.currentTarget.dataset.handle;
    this._dragStartX = e.touches[0].clientX;
    this._dragStartPx = this.data[this._dragHandle === 'start' ? 'startHandleX' : 'endHandleX'];
    this._preStart = this.data.bookingTimeStart;
    this._preEnd = this.data.bookingTimeEnd;
  },

  /** Spiral-search for the nearest valid minute. */
  _snapToFree(min, isStart, m) {
    if (this._isMinValid(min, isStart, m)) return min;
    for (let d = SNAP; d < TOTAL_MIN; d += SNAP) {
      let a = snapMin(Math.max(0, min + d));
      let b = snapMin(Math.max(0, min - d));
      if (isStart) {
        if (this._isMinValid(a, true, m)) return a;
        if (this._isMinValid(b, true, m)) return b;
      } else {
        if (this._isMinValid(b, false, m)) return b;
        if (this._isMinValid(a, false, m)) return a;
      }
    }
    return min;
  },

  _isMinValid(min, isStart, m) {
    if (min < 0 || min > TOTAL_MIN) return false;
    // ★ 今天不能停在已过去的时间
    let now = new Date(), today = fmtLocalDate(now);
    if (this.data.bookingStartDate === today && min < now.getHours() * 60 + now.getMinutes()) {
      return false;
    }
    let inOpen = false;
    for (let i = 0; i < m.openMerged.length; i++) {
      if (isStart) {
        if (min >= m.openMerged[i].start && min < m.openMerged[i].end) { inOpen = true; break; }
      } else {
        if (min > m.openMerged[i].start && min <= m.openMerged[i].end) { inOpen = true; break; }
      }
    }
    if (!inOpen) return false;
    for (let j = 0; j < m.blockedMerged.length; j++) {
      let bj = m.blockedMerged[j];
      // blocked=[s,e): start (≥s,<e) blocked; end (>s,<e) blocked — allows end at blocked.start
      if (min >= bj.start && min < bj.end) return false;
    }
    return true;
  },

  onHandleTouchMove(e) {
    if (!this._dragHandle) return;
    let w = this.data._timelineWidth;
    if (!w) return;

    let dx = e.touches[0].clientX - this._dragStartX;
    let px = Math.max(0, Math.min(w, this._dragStartPx + dx));
    let rawMin = snapMin(Math.round(px / w * TOTAL_MIN));

    let isStart = this._dragHandle === 'start';
    let now = new Date(), today = fmtLocalDate(now);
    let nowMin = now.getHours() * 60 + now.getMinutes();

    let sm, st, em, et;
    if (isStart) {
      // ── Start handle: only hard-limit past time (today) ──
      sm = rawMin;
      if (sm < 0) sm = 0;
      if (sm > TOTAL_MIN) sm = TOTAL_MIN;
      if (this.data.bookingStartDate === today && sm < nowMin) sm = nowMin;
      st = minToTime(sm);
      // If start reached/passed end, auto-extend end to start + 1hr
      let curEnd2 = timeToMin(this.data.bookingTimeEnd);
      if (curEnd2 && sm >= curEnd2) {
        em = Math.min(TOTAL_MIN, sm + 60);
        et = minToTime(em);
      } else {
        em = curEnd2;
        et = this.data.bookingTimeEnd;
      }
    } else {
      // ── End handle: only hard-limit end > start ──
      let curStart = timeToMin(this.data.bookingTimeStart);
      em = rawMin;
      if (em <= curStart) em = curStart + SNAP;
      if (em > TOTAL_MIN) em = TOTAL_MIN;
      et = minToTime(em);
      sm = curStart;
      st = this.data.bookingTimeStart;
    }

    // Build setData
    let upd = {};
    if (isStart) {
      upd.startHandleX = Math.round(sm / TOTAL_MIN * w);
      upd.bookingTimeStart = st;
      upd.timeStartInput = st;
      if (et) {
        upd.endHandleX = Math.round(em / TOTAL_MIN * w);
        upd.bookingTimeEnd = et;
        upd.timeEndInput = et;
      }
    } else {
      upd.endHandleX = Math.round(em / TOTAL_MIN * w);
      upd.bookingTimeEnd = et;
      upd.timeEndInput = et;
    }

    // Timeline selection
    if (sm < em) {
      let dur = em - sm;
      let dh = Math.floor(dur / 60), dm = dur % 60;
      upd._durationText = dh > 0 ? (dh + '小时' + (dm > 0 ? dm + '分钟' : '')) : (dm + '分钟');
      upd._activeDuration = dur;
      upd.timelineSelection = {
        left: (sm / TOTAL_MIN * 100).toFixed(2),
        width: ((em - sm) / TOTAL_MIN * 100).toFixed(2)
      };
    }

    // Chip state
    let sh = st ? parseInt(st.split(':')[0]) : -1;
    let smin = st ? parseInt(st.split(':')[1]) : -1;
    let smIdx = MINUTE_OPTS.indexOf(smin);
    let eh2 = et ? parseInt(et.split(':')[0]) : -1;
    let emin = et ? parseInt(et.split(':')[1]) : -1;
    let emIdx = MINUTE_OPTS.indexOf(emin);
    let endHours = [];
    let startHours = this.data.startHours;
    for (let i = 0; i < startHours.length; i++) {
      if (startHours[i].value >= (sh >= 0 ? sh : 0)) {
        endHours.push({ label: startHours[i].value, value: startHours[i].value });
      }
    }
    upd.startMinIdx = smIdx;
    upd._startHourVal = sh;
    upd.endHours = endHours;
    upd.endMinIdx = emIdx;
    upd._endHourVal = eh2;

    // ══ Frame throttling via wx.nextTick ══
    // Store latest computed values; only schedule one nextTick per frame
    this._pendingSetData = upd;
    if (!this._rafPending) {
      this._rafPending = true;
      let self = this;
      wx.nextTick(function () {
        self._rafPending = false;
        if (self._pendingSetData) {
          let final = self._pendingSetData;
          self._pendingSetData = null;
          self.setData(final);
        }
      });
    }
  },

  onHandleTouchEnd() {
    if (!this._dragHandle) return;
    let h = this._dragHandle;
    let ps = this._preStart;
    let pe = this._preEnd;
    this._dragHandle = null;

    if (h === 'start') {
      if (!this._setStartTime(this.data.bookingTimeStart, {silent: true})) {
        // Validation failed: restore pre-drag values
        this.setData({
          bookingTimeStart: ps || '', timeStartInput: ps || '',
          bookingTimeEnd: pe || '', timeEndInput: pe || ''
        });
        this._updateChipState();
        this._updateHandlePositions();
        this._updateTimelineRange();
      }
      // On success, _setStartTime already updated range/handles/chips
    } else {
      if (!this._setEndTime(this.data.bookingTimeEnd, {silent: true})) {
        // Validation failed: restore pre-drag values
        this.setData({
          bookingTimeEnd: pe || '', timeEndInput: pe || ''
        });
        this._updateChipState();
        this._updateHandlePositions();
        this._updateTimelineRange();
      }
      // On success, _setEndTime already updated range/handles/chips
    }
  },

  // ═══════════════════ Date / time auto-correct ═══════════════════

  /** Search within 30 days for the nearest date with open slots. */
  async _findNearestAvailableDate() {
    let now = new Date();
    for (let i = 0; i < 30; i++) {
      let d = new Date(now);
      d.setDate(d.getDate() + i);
      let ds = fmtLocalDate(d);
      try {
        let res = await callFunction({ name: 'getVenueSchedule', data: { venueId: this.data.bookingVenueId, dateFrom: ds, dateTo: ds } });
        if (res.status === 'success') {
          let dayData = (res.dailySchedules || [])[0];
          if (dayData && dayData.openSlots && dayData.openSlots.length) {
            return { date: ds, dayData: dayData };
          }
        }
      } catch (_) {}
    }
    return null;
  },

  // ═══════════════════ Text input ═══════════════════

  async onStartDateChange(e) {
    let d = e.detail.value;
    let today = fmtLocalDate(new Date());
    if (d < today) {
      let prevDate = this.data.bookingStartDate;
      // Previous date was valid → restore it
      if (prevDate && prevDate >= today) {
        showShortToast('不能选择过去的日期');
        this.setData({
          bookingStartDate: prevDate,
          bookingStartDateDisplay: this.data.bookingStartDateDisplay
        });
        return;
      }
      // Previous date also invalid → search nearest available
      showShortToast('不能选择过去的日期，正在查找最近可用时段');
      wx.showLoading({ title: '查找中...' });
      let nearest = await this._findNearestAvailableDate();
      wx.hideLoading();
      if (nearest) {
        d = nearest.date;
        this.setData({ _dayData: nearest.dayData });
      } else {
        showShortToast('30天内无可用时段');
        return;
      }
    }
    this.setData({
      bookingStartDate: d, bookingStartDateDisplay: d, bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeStart: '', bookingTimeEnd: '', timeStartInput: '', timeEndInput: '',
      timelineBlocks: [], timelineSelection: null, _timelineWidth: 0,
      startHandleX: 0, endHandleX: 0, startHours: [], endHours: [], startMinIdx: -1, endMinIdx: -1,
      _kbVisible: false
    });
    this._loadScheduleForDate(d);
  },

  // ═══════════════════ Custom time keyboard ═══════════════════

  /** Open keyboard for a time field. e.currentTarget.dataset.target = 'startHour'|'startMin'|'endHour'|'endMin' */
  onKbOpen(e) {
    let target = e.currentTarget.dataset.target;
    let isStart = target.indexOf('start') === 0;
    let curTime = isStart ? this.data.bookingTimeStart : this.data.bookingTimeEnd;
    let h = '', m = '';
    if (curTime) { let p = curTime.split(':'); h = p[0]; m = p[1]; }
    let field = target.indexOf('Hour') >= 0 ? 'hour' : 'min';
    this.setData({
      _kbVisible: true, _kbTarget: target, _kbField: field,
      _kbHourVal: h, _kbMinVal: m, _kbSelected: true
    });
    this._computeGrayKeys();
  },

  /** Close keyboard (submit on close). */
  onKbClose() {
    if (this.data._kbVisible) this._commitKb();
    this.setData({ _kbVisible: false });
  },

  /** Numpad key press. */
  onKbKey(e) {
    let key = e.currentTarget.dataset.key;
    if (key === ':') { this._onKbColon(); return; }
    if (this.data._kbGray[key]) return; // grayed out
    let field = this.data._kbField;
    let val = field === 'hour' ? this.data._kbHourVal : this.data._kbMinVal;
    // If selected (全选态), clear → replace with new key
    if (this.data._kbSelected) {
      val = key;
      let upd2 = field === 'hour' ? { _kbHourVal: val, _kbSelected: false } : { _kbMinVal: val, _kbSelected: false };
      this.setData(upd2);
      this._computeGrayKeys();
      return;
    }
    if (val.length >= 2) return; // max 2 digits
    val = val + key;
    let upd = field === 'hour' ? { _kbHourVal: val } : { _kbMinVal: val };
    this.setData(upd);
    // Auto-switch: 2-digit hour → jump to minute (with select-all)
    if (field === 'hour' && val.length === 2) {
      this.data._kbField = 'min';
      this.data._kbSelected = true;
      this._computeGrayKeys('min', true);
      return;
    }
    this._computeGrayKeys();
  },

  /** Colon key: switch hour→min, pad single-digit hour. */
  _onKbColon() {
    if (this.data._kbField === 'hour') {
      let h = this.data._kbHourVal;
      if (h.length === 1) h = '0' + h;
      if (h !== this.data._kbHourVal) this.data._kbHourVal = h;
      this.data._kbField = 'min';
      this.data._kbSelected = true;
      this._computeGrayKeys();
    }
    // In minute field, colon does nothing
  },

  /** Backspace key. */
  onKbBackspace() {
    // If selected (全选态), first backspace just deselects — keeps content
    if (this.data._kbSelected) {
      this._computeGrayKeys(null, false);
      return;
    }
    let field = this.data._kbField;
    let val = field === 'hour' ? this.data._kbHourVal : this.data._kbMinVal;
    if (!val) return;
    val = val.slice(0, -1);
    let upd = field === 'hour' ? { _kbHourVal: val } : { _kbMinVal: val };
    this.setData(upd);
    this._computeGrayKeys();
  },

  /** Switch active field (tap hour/min display box in keyboard).
   *  Same field → toggle select-all. Different field → switch + select-all. */
  onKbSwitchField(e) {
    let f = e.currentTarget.dataset.field; // 'hour' | 'min'
    if (f === this.data._kbField) {
      // Toggle select-all on same field
      this._computeGrayKeys(null, !this.data._kbSelected);
      return;
    }
    // Switch to new field with select-all
    this._computeGrayKeys(f, true);
  },

  /** Confirm: validate, call _setStartTime/_setEndTime, close. */
  onKbConfirm() {
    this._commitKb();
    this.setData({ _kbVisible: false });
  },

  /** Commit current keyboard value to the target time field. */
  _commitKb() {
    let target = this.data._kbTarget;
    if (!target) return;
    let h = this.data._kbHourVal, m = this.data._kbMinVal;
    // Pad to valid HH:MM
    if (!h) h = '00';
    if (h.length === 1) h = '0' + h;
    if (!m) m = '00';
    if (m.length === 1) m = '0' + m;
    let timeStr = h + ':' + m;
    if (target.indexOf('start') === 0) {
      this._setStartTime(timeStr);
    } else {
      this._setEndTime(timeStr);
    }
  },

  /** Load keyboard values from current booking data. */
  _loadKbFromCurrent() {
    let target = this.data._kbTarget;
    let isStart = target && target.indexOf('start') === 0;
    let curTime = isStart ? this.data.bookingTimeStart : this.data.bookingTimeEnd;
    let h = '', m = '';
    if (curTime) { let p = curTime.split(':'); h = p[0]; m = p[1]; }
    this.setData({ _kbHourVal: h, _kbMinVal: m });
    this._computeGrayKeys();
  },

  /** Compute which numpad keys should be grayed out.
   *  @param {string=} fieldOverride — if provided, use this instead of data._kbField (avoids extra setData)
   *  @param {boolean=} kbSelected — if provided, overrides _kbSelected for this computation */
  _computeGrayKeys(fieldOverride, kbSelected) {
    let target = this.data._kbTarget;
    let field = fieldOverride || this.data._kbField;
    let hVal = this.data._kbHourVal;
    let mVal = this.data._kbMinVal;
    // When "selected" (全选态), treat active field as empty for gray — any key will replace content
    let sel = kbSelected !== undefined ? kbSelected : (fieldOverride ? true : this.data._kbSelected);
    if (sel) {
      if (field === 'hour') hVal = '';
      else mVal = '';
    }
    let curVal = field === 'hour' ? hVal : mVal;
    let maxVal = field === 'hour' ? 23 : 59;
    let gray = {};

    // ── Structural: digit limit ──
    if (curVal.length >= 2) {
      for (let d = 0; d <= 9; d++) gray[d] = true;
    } else if (curVal.length === 1) {
      let prefix = parseInt(curVal);
      for (let d2 = 0; d2 <= 9; d2++) {
        if (prefix * 10 + d2 > maxVal) gray[d2] = true;
      }
    }

    // ── Semantic: deep validation ──
    if (target && target.indexOf('start') === 0) {
      this._applyStartSemanticGray(gray, target, field, hVal, mVal);
    } else if (target && target.indexOf('end') === 0) {
      this._applyEndSemanticGray(gray, target, field, hVal, mVal);
    }

    let upd = { _kbGray: gray, _kbField: field, _kbSelected: sel };
    this.setData(upd);
  },

  /** Semantic gray for start time: past / blocked / closed checks. */
  _applyStartSemanticGray(gray, target, field, hVal, mVal) {
    let now = new Date(), today = fmtLocalDate(now);
    if (this.data.bookingStartDate !== today) return;
    let nowHour = now.getHours(), nowMin = now.getMinutes();
    let dayData = this.data._dayData;
    if (!dayData) return;

    if (target === 'startHour' && field === 'hour') {
      // Only check when we know the final hour (checking second digit or single-digit complete)
      if (hVal.length === 1) {
        let prefix = parseInt(hVal);
        for (let d = 0; d <= 9; d++) {
          let result = prefix * 10 + d;
          if (result <= 23 && result < nowHour) gray[d] = true;
        }
      }
      // When empty: gray first digits that can't form ANY valid future hour
      if (hVal === '') {
        for (let d = 0; d <= 9; d++) {
          let anyValid = false;
          for (let ds = 0; ds <= 9; ds++) {
            let fullH = d * 10 + ds;
            if (fullH <= 23 && fullH >= nowHour) { anyValid = true; break; }
          }
          if (!anyValid) gray[d] = true;
        }
      }
    }

    if (target === 'startMin' && field === 'min') {
      let curH = parseInt(hVal);
      if (isNaN(curH) || curH > nowHour) return;
      if (curH < nowHour) return;
      // Same hour: gray minutes ≤ nowMin, or not in open slot, or blocked
      let blockedMerged = buildBlockedIntervals(dayData);
      let openSlots = dayData.openSlots || [];
      for (let m = 0; m < 60; m++) {
        if (m <= nowMin) { this._markGrayForMin(gray, m, mVal); continue; }
        let absMin = curH * 60 + m;
        let inOpen = false;
        for (let oi = 0; oi < openSlots.length; oi++) {
          if (absMin >= timeToMin(openSlots[oi].timeStart) && absMin < timeToMin(openSlots[oi].timeEnd)) { inOpen = true; break; }
        }
        if (!inOpen) { this._markGrayForMin(gray, m, mVal); continue; }
        for (let bi = 0; bi < blockedMerged.length; bi++) {
          if (absMin >= blockedMerged[bi].start && absMin < blockedMerged[bi].end) { this._markGrayForMin(gray, m, mVal); break; }
        }
      }
    }
  },

  /** Semantic gray for end time: must be > start, no blocked/gap crossing. */
  _applyEndSemanticGray(gray, target, field, hVal, mVal) {
    let startTime = this.data.bookingTimeStart;
    if (!startTime) return;
    let sH = parseInt(startTime.split(':')[0]);
    let sM = parseInt(startTime.split(':')[1]);
    let dayData = this.data._dayData;
    if (!dayData) return;

    if (target === 'endHour' && field === 'hour') {
      if (hVal.length === 1) {
        let prefix = parseInt(hVal);
        for (let d = 0; d <= 9; d++) {
          if (prefix * 10 + d < sH) gray[d] = true;
        }
      }
      // When empty: gray first digits that can't form ANY valid end hour (> startHour)
      if (hVal === '') {
        for (let d = 0; d <= 9; d++) {
          let anyValid = false;
          for (let ds = 0; ds <= 9; ds++) {
            let fullH = d * 10 + ds;
            if (fullH <= 23 && fullH > sH) { anyValid = true; break; }
          }
          if (!anyValid) gray[d] = true;
        }
      }
    }

    if (target === 'endMin' && field === 'min') {
      let curH = parseInt(hVal);
      if (isNaN(curH) || curH < sH) return;
      let startMinAbs = sH * 60 + sM;
      let blockedMerged = buildBlockedIntervals(dayData);
      let openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots || []));
      for (let m = 0; m < 60; m++) {
        if (curH === sH && m <= sM) { this._markGrayForMin(gray, m, mVal); continue; }
        let absEnd = curH * 60 + m;
        if (findBlockedOverlap(startMinAbs, absEnd, blockedMerged)) { this._markGrayForMin(gray, m, mVal); continue; }
        if (findOpenGap(startMinAbs, absEnd, openMerged) >= 0) { this._markGrayForMin(gray, m, mVal); continue; }
      }
    }
  },

  /** Gray a minute digit key based on current minute input state. */
  _markGrayForMin(gray, m, curMinVal) {
    if (curMinVal === '') {
      if (m < 10) gray[m] = true;
    } else if (curMinVal.length === 1) {
      let tens = parseInt(curMinVal);
      if (m >= tens * 10 && m < (tens + 1) * 10) gray[m % 10] = true;
    }
  },

  // ═══════════════════ Duration chips ═══════════════════

  onDurationTap(e) {
    let minutes = parseInt(e.currentTarget.dataset.minutes);
    if (!minutes) return;
    if (!this.data.bookingTimeStart) { showShortToast('请先选择开始时间'); return; }
    let startMin = timeToMin(this.data.bookingTimeStart);
    let endMin = startMin + minutes;
    if (endMin > TOTAL_MIN) endMin = TOTAL_MIN;
    let ok = this._setEndTime(minToTime(endMin));
    if (!ok) this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
    else this.setData({ timeEndInput: this.data.bookingTimeEnd });
  },

  // ═══════════════════ Form submit ═══════════════════

  onFieldInput(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value}); },

  async submitBooking() {
    let _a = this.data, vid = _a.bookingVenueId, sd = _a.bookingStartDate,
        st = _a.bookingTimeStart, et = _a.bookingTimeEnd, title = _a.bookingTitle, desc = _a.bookingDesc, dd = _a._dayData;
    if(!vid||!sd||!st||!et){showShortToast('请完整填写信息并选择时间段');return;}
    if(!title){showShortToast('请填写借用事由');return;}
    let now = new Date(), today = fmtLocalDate(now);
    if (sd === today && timeToMin(st) < now.getHours() * 60 + now.getMinutes()) { showShortToast('开始时间不能是过去的时间'); return; }
    let ts = sd+'T'+st, te = sd+'T'+et;
    if(ts >= te) { showShortToast('结束时间必须晚于开始时间'); return; }
    let err = this._validateRange(dd, sd, st, et);
    if(err) { showShortToast(err); return; }
    this.setData({loading:true});
    try {
      let res = await callFunction({name:'createVenueBooking',data:{venueId:vid,title:title,description:desc,timeStart:ts,timeEnd:te}});
      if(res.status==='success'){
        showShortToast(res.message);
        this.setData({bookingVisible:false});
        this.loadPendingCount();
        if (this.data.activeTab === 'bookings') this.loadMyBookings();
        if (this.data.scheduleVisible) this.loadTimetable();
        this._emitVenueChanged('create', res.id);
      }else showShortToast(res.message);
    } catch(e) { showShortToast(getErrorText(e,'借用失败')); }
    finally { this.setData({loading:false}); }
  },

  _validateRange(dayData, sd, st, et) {
    let openSlots = dayData ? (dayData.openSlots||[]) : [];
    let bookedSlots = dayData ? (dayData.bookedSlots||[]) : [];
    let activitySlots = dayData ? (dayData.activitySlots||[]) : [];
    let rs = timeToMin(st), re = timeToMin(et);
    let mo = mergeIntervals(slotsToIntervals(openSlots));
    let gap = findOpenGap(rs, re, mo);
    if(gap >= 0) return minToTime(gap) + ' 场地不开放';
    let mb = mergeIntervals([].concat(slotsToIntervals(bookedSlots), slotsToIntervals(activitySlots)));
    let conflict = findBlockedOverlap(rs, re, mb);
    if(conflict) return minToTime(conflict.start) + ' 已被占用';
    return null;
  },

  // ═══════════════════ Bookings ═══════════════════

  async loadMyBookings() {
    this.setData({loading:true});
    try {
      let res = await callFunction({name:'listMyVenueBookings',data:{}});
      if(res.status==='success') {
        let bookings = (res.bookings||[]).map(function(b){
          let item = Object.assign({}, b, { displayStatus: computeDisplayStatus(b) });
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
    let id = e.currentTarget.dataset.id;
    let that = this;
    let booking = this.data.myBookings.find(function(b){return b.id===id;});
    if (!booking) return;
    if (booking.displayStatus === 'inUse') { showShortToast('使用中的借用不能取消，请使用"结束使用"'); return; }
    if (booking.displayStatus === 'completed') { showShortToast('已完成的借用不能取消'); return; }
    wx.showModal({
      title: '确认取消', content: '确定取消该借用申请吗？',
      success: async function(r) {
        if (!r.confirm) return;
        try {
          let res = await callFunction({name:'cancelVenueBooking',data:{id:id}});
          if(res.status==='success'){
            showShortToast(res.message || '已取消');
            let bookings = that.data.myBookings.map(function(b) {
              return b.id === id ? Object.assign({}, b, { status: 'cancelled', displayStatus: 'cancelled' }) : b;
            });
            that.setData({ myBookings: bookings });
            that.loadMyBookings();
            that.loadPendingCount();
            that._emitVenueChanged('cancel', id);
          }else showShortToast(res.message);
        } catch(e) { showShortToast(getErrorText(e,'取消失败')); }
      }
    });
  },

  async endMyBooking(e) {
    let id = e.currentTarget.dataset.id;
    let that = this;
    wx.showModal({
      title: '确认结束使用', content: '确定要结束该场地的使用吗？结束时间将更新为当前时间。',
      success: async function(r) {
        if (!r.confirm) return;
        try {
          let res = await callFunction({name:'endVenueBooking',data:{id:id}});
          if(res.status==='success'){
            showShortToast(res.message || '使用已结束');
            that.loadMyBookings();
            that.loadPendingCount();
            that._emitVenueChanged('end', id);
          }else showShortToast(res.message);
        } catch(e) { showShortToast(getErrorText(e,'操作失败')); }
      }
    });
  },

  // ═══════════════ Approvals tab ═══════════════

  _buildPendingSignature(pending) {
    return (pending || []).map(function(item) {
      return [
        item.id, item.status, item.approvalCurrentStep,
        item.approvalTotalSteps, item.currentStepName, item.createdAt
      ].join(':');
    }).sort().join('|');
  },

  _formatTime() {
    let now = new Date();
    let pad = function(n) { return String(n).padStart(2, '0'); };
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  },

  async loadPendingData() {
    this.setData({ loading: true });
    try {
      let res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        let pending = (res.pending || []).map(function(item) {
          if (item.approvalTotalSteps > 0) {
            item._approvalPercent = Math.round(item.approvalCurrentStep / item.approvalTotalSteps * 100);
          } else {
            item._approvalPercent = 0;
          }
          item._flowTimeline = buildFlowTimeline({
            totalSteps: item.approvalTotalSteps,
            currentStep: item.approvalCurrentStep,
            isApproved: item.approvalCurrentStep >= item.approvalTotalSteps,
            isRejected: false,
            rejectStep: -1,
            flowSteps: item.flowSteps || [],
            snapshots: item.snapshots || []
          });
          return item;
        });
        this.setData({
          pending: pending,
          pendingApprovalCount: pending.length,
          lastPendingCount: pending.length,
          lastPendingSignature: this._buildPendingSignature(pending),
          lastUpdateTime: this._formatTime()
        });
      } else if (res.status === 'forbidden') {
        showShortToast(res.message || '请先绑定人事信息');
      } else {
        showShortToast(res.message || '加载失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  async checkForUpdates() {
    if (this.data.activeTab !== 'approvals') return;
    try {
      let res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        let pending = res.pending || [];
        let count = pending.length;
        let signature = this._buildPendingSignature(pending);
        if (count !== this.data.lastPendingCount || signature !== this.data.lastPendingSignature) {
          this.loadPendingData();
        } else if (count > 0) {
          this.setData({ lastUpdateTime: this._formatTime() });
        }
        if (count !== this.data.pendingApprovalCount) {
          this.setData({ pendingApprovalCount: count });
        }
      }
    } catch (e) {}
  },

  startPolling() {
    this.stopPolling();
    let that = this;
    this._pollTimer = setInterval(function() {
      if (that._isPageVisible) that.checkForUpdates();
    }, 30000);
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  onPullDownRefresh() {
    let that = this;
    if (this.data.activeTab === 'approvals') {
      this.loadPendingData().then(function() { wx.stopPullDownRefresh(); });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  // ── Approval actions ──

  openApprove(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    this.setData({ approvalVisible: true, approvalTarget: item, approvalAction: 'approve', approvalComment: '' });
  },

  openReject(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    this.setData({ approvalVisible: true, approvalTarget: item, approvalAction: 'reject', approvalComment: '' });
  },

  closeApproval() {
    this.setData({ approvalVisible: false, approvalTarget: null, approvalAction: '', approvalComment: '', expandedNodeKey: '' });
  },

  onApprovalCommentInput(e) {
    this.setData({ approvalComment: e.detail.value });
  },

  async submitApproval() {
    let that = this;
    let target = this.data.approvalTarget;
    let action = this.data.approvalAction;
    let comment = this.data.approvalComment;
    if (!target || !action) return;

    let endpoint = action === 'approve' ? 'approveVenueBookingStep' : 'rejectVenueBookingStep';
    let actionLabel = action === 'approve' ? '通过' : '驳回';

    this.setData({ approvalSubmitting: true });
    try {
      let res = await callFunction({ name: endpoint, data: { id: target.id, comment: comment } });
      if (res.status === 'success') {
        showShortToast(res.message || ('已' + actionLabel));
        that.closeApproval();

        let targetId = target.id;
        let pending = that.data.pending.slice();

        if (action === 'approve' && res.approvalProgress) {
          if (res.approvalProgress.isApproved) {
            pending = pending.filter(function(p) { return p.id !== targetId; });
          } else {
            let idx = -1;
            for (let pi = 0; pi < pending.length; pi++) {
              if (pending[pi].id === targetId) { idx = pi; break; }
            }
            if (idx >= 0) {
              let updated = Object.assign({}, pending[idx], {
                approvalCurrentStep: res.approvalProgress.currentStep,
                _approvalPercent: Math.round(res.approvalProgress.currentStep / pending[idx].approvalTotalSteps * 100)
              });
              updated._flowTimeline = buildFlowTimeline({
                totalSteps: updated.approvalTotalSteps,
                currentStep: res.approvalProgress.currentStep,
                isApproved: false,
                isRejected: false,
                rejectStep: -1,
                flowSteps: updated.flowSteps || [],
                snapshots: updated.snapshots || []
              });
              pending[idx] = updated;
            }
          }
        } else {
          pending = pending.filter(function(p) { return p.id !== targetId; });
        }

        that.setData({
          pending: pending,
          pendingApprovalCount: pending.length,
          lastPendingCount: pending.length,
          lastPendingSignature: that._buildPendingSignature(pending),
          lastUpdateTime: that._formatTime()
        });

        that._emitVenueChanged(action, targetId);

        setTimeout(function() { that.loadPendingData(); }, 2000);
      } else {
        showShortToast(res.message || '操作失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '操作失败'));
    } finally {
      this.setData({ approvalSubmitting: false });
    }
  },

  viewApprovalDetail(e) {
    let id = e.currentTarget.dataset.id;
    let item = this.data.pending.find(function(p) { return p.id === id; });
    if (item) {
      this.setData({ approvalVisible: true, approvalTarget: item, approvalAction: '', approvalComment: '' });
    }
  },

  toggleFlowNode(e) { let key = e.currentTarget.dataset.nodeKey; this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key }); },
  noop() {}
});
