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
function minToTime(min) { if (min < 0) return '00:00'; if (min >= TOTAL_MIN) return '24:00'; var h = Math.floor(min / 60), m = min % 60; return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); }
function snapMin(min) { return Math.round(min / SNAP) * SNAP; }

function computeDisplayStatus(item) {
  if (item.status === 'pending') return 'pending';
  if (item.status === 'rejected') return 'rejected';
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'approved') {
    var now = new Date();
    var timeStart = new Date(item.timeStart.replace(' ', 'T'));
    var timeEnd = new Date(item.timeEnd.replace(' ', 'T'));
    if (now < timeStart) return 'approved';
    if (now >= timeEnd) return 'completed';
    return 'inUse';
  }
  return item.status;
}

function buildBlockedIntervals(dayData) {
  var blocked = [];
  if (dayData) {
    var bookedSlots = dayData.bookedSlots || [];
    for (var i = 0; i < bookedSlots.length; i++) {
      blocked.push({ start: timeToMin(bookedSlots[i].timeStart), end: timeToMin(bookedSlots[i].timeEnd) });
    }
    var activitySlots = dayData.activitySlots || [];
    for (var j = 0; j < activitySlots.length; j++) {
      blocked.push({ start: timeToMin(activitySlots[j].timeStart), end: timeToMin(activitySlots[j].timeEnd) });
    }
  }
  return mergeIntervals(blocked);
}

function computeOpenHours(openSlots) {
  var hours = [];
  for (var h = 0; h < 24; h++) {
    var hs = h * 60, he = hs + 60;
    for (var i = 0; i < openSlots.length; i++) {
      var ss = timeToMin(openSlots[i].timeStart), se = timeToMin(openSlots[i].timeEnd);
      if (ss < he && se > hs && Math.min(se, he) - Math.max(ss, hs) >= 10) {
        hours.push({ label: String(h), value: h }); break;
      }
    }
  }
  return hours;
}

function findDefaultStartMin(dayData, dateStr) {
  var openSlots = dayData.openSlots || [];
  if (!openSlots.length) return -1;
  var now = new Date(), today = fmtLocalDate(now), cur = now.getHours() * 60 + now.getMinutes();
  for (var i = 0; i < openSlots.length; i++) {
    var s = timeToMin(openSlots[i].timeStart), e = timeToMin(openSlots[i].timeEnd);
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
  var now = new Date(), today = fmtLocalDate(now);
  var openSlots = dayData.openSlots || [];
  if (!openSlots.length) return -1;
  var curMin = now.getHours() * 60 + now.getMinutes();
  var blockedMerged = buildBlockedIntervals(dayData);
  var startMin;
  if (dateStr === today) {
    startMin = snapMin(curMin);
    if (startMin <= curMin) startMin += SNAP;
  } else {
    startMin = snapMin(timeToMin(openSlots[0].timeStart));
  }
  for (var attempt = 0; attempt < TOTAL_MIN / SNAP; attempt++) {
    var candidate = startMin + attempt * SNAP;
    if (candidate >= TOTAL_MIN) break;
    var inOpen = false;
    for (var oi = 0; oi < openSlots.length; oi++) {
      if (candidate >= timeToMin(openSlots[oi].timeStart) && candidate < timeToMin(openSlots[oi].timeEnd)) { inOpen = true; break; }
    }
    if (!inOpen) continue;
    var blocked = false;
    for (var bi = 0; bi < blockedMerged.length; bi++) {
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
  var slotEnd = TOTAL_MIN;
  for (var i = 0; i < openMerged.length; i++) {
    if (startMin >= openMerged[i].start && startMin < openMerged[i].end) {
      slotEnd = openMerged[i].end;
      break;
    }
  }

  var ideal = startMin + 60;
  if (ideal > slotEnd) ideal = slotEnd;

  // Check if [start, ideal] crosses a blocked interval
  var conflict = findBlockedOverlap(startMin, ideal, blockedMerged);
  if (conflict) {
    // Push backward to just before the conflict
    ideal = conflict.start;
  }

  // Also check for open gaps (closed hours between start and ideal)
  var gap = findOpenGap(startMin, ideal, openMerged);
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
    _kbGray: {},          // {digit: true} for grayed-out numpad keys
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
      var res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') this.setData({ pendingApprovalCount: (res.pending || []).length });
    } catch (_) {}
  },

  switchTab(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'bookings') this.loadMyBookings();
    if (tab === 'approvals') this.loadPendingData();
  },

  // ═══ Browse ═══
  async loadVenues() {
    this.setData({ loading: true });
    try {
      var res = await callFunction({ name: 'listVenuesForBooking', data: {} });
      if (res.status === 'success') this.setData({ venues: res.venues || [] });
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { this.setData({ loading: false }); }
  },

  async loadPurposes() {
    try {
      var res = await callFunction({ name: 'listVenueBookingPurposes', data: {} });
      if (res.status === 'success') this.setData({ purposes: res.purposes || [] });
    } catch (_) {}
  },

  _initWeekStart() {
    var now = new Date(), day = now.getDay(), monday = new Date(now);
    monday.setDate(now.getDate()-(day===0?6:day-1));
    var today = fmtLocalDate(now);
    this.setData({ scheduleWeekStart: fmtLocalDate(monday), bookingStartDate: today, bookingStartDateDisplay: today, bookingEndDate: today, bookingEndDateDisplay: today });
  },

  onSelectPurpose(e) { this.setData({ bookingTitle: e.currentTarget.dataset.text }); },

  // ═══ Timetable ═══
  async openSchedule(e) {
    var id = e.currentTarget.dataset.id;
    var v = this.data.venues.find(function(v){return v.id===id;});
    this.setData({ scheduleVisible:true, scheduleVenueId:id, scheduleVenueName:v?v.name:'', timetableColumns:[] });
    await this.loadTimetable();
  },
  closeSchedule() { this.setData({ scheduleVisible:false, bookingDetailVisible:false, expandedNodeKey:'' }); },

  async loadTimetable() {
    var _a = this.data, scheduleVenueId = _a.scheduleVenueId, scheduleWeekStart = _a.scheduleWeekStart;
    var parts = scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2];
    var end = new Date(y,m-1,d+6), dateTo = fmtLocalDate(end);
    wx.showLoading({title:'加载中...'});
    try {
      var res = await callFunction({name:'getVenueSchedule',data:{venueId:scheduleVenueId,dateFrom:scheduleWeekStart,dateTo}});
      if(res.status==='success') this._buildTimetable(res.dailySchedules||[]);
    } catch(e) { showShortToast(getErrorText(e,'加载失败')); }
    finally { wx.hideLoading(); }
  },

  _buildTimetable(dailySchedules) {
    var parts = this.data.scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2];
    var labels = ['周一','周二','周三','周四','周五','周六','周日'];
    var columns = [];
    for(var i=0;i<7;i++) {
      var dd = new Date(y,m-1,d+i), dateStr = fmtLocalDate(dd);
      var dateDisp = String(dd.getMonth()+1).padStart(2,'0')+'/'+String(dd.getDate()).padStart(2,'0');
      var dayData = dailySchedules.find(function(ds){return ds.date===dateStr;});
      columns.push(this._buildDayColumn(dayData,dateStr,labels[i],dateDisp));
    }
    this.setData({timetableColumns:columns});
  },

  _buildDayColumn(dayData,dateStr,label,dateDisplay) {
    var openBlocks=[], eventBlocks=[], timeTargets=[];
    if(dayData&&dayData.openSlots) {
      for(var oi=0;oi<dayData.openSlots.length;oi++) {
        var o = dayData.openSlots[oi];
        var _a = calcBlock(o.timeStart,o.timeEnd), top = _a.top, height = _a.height;
        var s = timeToMin(o.timeStart), e = timeToMin(o.timeEnd);
        openBlocks.push({top:top+HEADER_H+TEXT_OFFSET,height:height,startMin:s,endMin:e,duration:e-s});
        for(var min=s;min<e;min+=30) {
          var hh = Math.floor(min/60), mm = min%60;
          timeTargets.push({top:top+HEADER_H+TEXT_OFFSET+(min-s)/(e-s)*height, time:String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')});
        }
      }
    }
    if(dayData&&dayData.activitySlots) {
      for(var ai=0;ai<dayData.activitySlots.length;ai++) {
        var a = dayData.activitySlots[ai];
        var _b = calcBlock(a.timeStart,a.timeEnd), top2 = _b.top, height2 = _b.height;
        eventBlocks.push({top:top2+HEADER_H+TEXT_OFFSET,height:height2,status:'activity',label:a.ruleName||'活动',type:'activity'});
      }
    }
    if(dayData&&dayData.bookedSlots) {
      for(var bi=0;bi<dayData.bookedSlots.length;bi++) {
        var b = dayData.bookedSlots[bi];
        var _c = calcBlock(b.timeStart,b.timeEnd), top3 = _c.top, height3 = _c.height;
        eventBlocks.push({top:top3+HEADER_H+TEXT_OFFSET,height:height3,status:b.status==='pending'?'pending':'booked',label:b.title||'已借用',type:'booking',
          booking:{id:b.id,title:b.title,description:b.description,userId:b.userId,userName:b.userName,userDept:b.userDept||'',userIdentity:b.userIdentity||'',userWorkGroup:b.userWorkGroup||'',timeStart:b.fullTimeStart||b.timeStart,timeEnd:b.fullTimeEnd||b.timeEnd,status:b.status}});
      }
    }
    return {date:dateStr,label:label,dateDisplay:dateDisplay,openBlocks:openBlocks,eventBlocks:eventBlocks,timeTargets:timeTargets};
  },

  onTimetablePrevWeek() { var parts = this.data.scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2]; this.setData({scheduleWeekStart:fmtLocalDate(new Date(y,m-1,d-7))}); this.loadTimetable(); },
  onTimetableNextWeek() { var parts = this.data.scheduleWeekStart.split('-').map(Number), y = parts[0], m = parts[1], d = parts[2]; this.setData({scheduleWeekStart:fmtLocalDate(new Date(y,m-1,d+7))}); this.loadTimetable(); },
  onTimetableBlockTap(e) { var b=e.currentTarget.dataset.block; if(!b||!b.booking)return; this.setData({bookingDetailVisible:true,bookingDetail:b.booking}); },
  closeBookingDetail() { this.setData({bookingDetailVisible:false, expandedNodeKey:''}); },

  viewMyBookingDetail(e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.myBookings.find(function(b){return b.id===id;});
    if (!item) return;
    this.setData({ bookingDetailVisible: true, bookingDetail: item, expandedNodeKey: '' });
  },

  onTimeTargetTap(e) {
    var date=e.currentTarget.dataset.date, time=e.currentTarget.dataset.time;
    if(!date||!time)return;
    this._openBookingForm(date, time);
  },
  onTimetableOpenTap(e) {
    var date=e.currentTarget.dataset.date;
    var timeY=Math.round((e.detail.y-HEADER_H)/(HOUR_HEIGHT/2));
    if(timeY<0)return;
    var idx=Math.min(Math.max(timeY,0),47), h=Math.floor(idx/2), m=(idx%2)*30;
    var time=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
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
    var id = e.currentTarget.dataset.id;
    var v = this.data.venues.find(function(x){return x.id===id;});
    var today = this.data.bookingStartDate;
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
    var venueId = this.data.bookingVenueId;
    if (!venueId || !dateStr) return;
    wx.showLoading({ title: '查询空闲...' });
    try {
      var res = await callFunction({ name: 'getVenueSchedule', data: { venueId: venueId, dateFrom: dateStr, dateTo: dateStr } });
      if (res.status === 'success') {
        var dayData = (res.dailySchedules || [])[0];
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
    var timeline = this._buildTimeline(dayData);
    var openHours = computeOpenHours(dayData.openSlots || []);
    var startMin = presetTime ? timeToMin(presetTime) : findDefaultStartMin(dayData, dateStr);
    var startTime = startMin >= 0 ? minToTime(startMin) : '';

    // Compute fallback timeline width (avoid deprecated getSystemInfoSync)
    var fallbackW = this.data._timelineWidth;
    if (!fallbackW) {
      try {
        var winInfo = wx.getWindowInfo ? wx.getWindowInfo() : null;
        fallbackW = (winInfo && winInfo.windowWidth) ? winInfo.windowWidth - 64 : 311;
      } catch(e) { fallbackW = 311; }
    }

    // Compute smart end + selection + chip state — all in one pass for a single setData
    var setObj = {
      timelineBlocks: timeline,
      bookingTimeStart: startTime, timeStartInput: startTime,
      startHours: openHours, _dayData: dayData,
      _timelineWidth: fallbackW
    };

    if (startTime) {
      var sm = startMin;
      var bm = buildBlockedIntervals(dayData);
      var om = mergeIntervals(slotsToIntervals(dayData.openSlots || []));
      var endMin = findSmartEnd(sm, om, bm);
      if (endMin > sm) {
        setObj.bookingTimeEnd = minToTime(endMin);
        setObj.timeEndInput = minToTime(endMin);
      }
      // Handle positions
      var w = fallbackW;
      setObj.startHandleX = Math.round(sm / TOTAL_MIN * w);
      var em2 = endMin > sm ? endMin : sm;
      setObj.endHandleX = Math.round(em2 / TOTAL_MIN * w);
      // Selection overlay
      if (endMin > sm) {
        var dur = endMin - sm;
        var dh = Math.floor(dur / 60), dm = dur % 60;
        setObj._durationText = dh > 0 ? (dh + '小时' + (dm > 0 ? dm + '分钟' : '')) : (dm + '分钟');
        setObj._activeDuration = dur;
        setObj.timelineSelection = {
          left: (sm / TOTAL_MIN * 100).toFixed(2),
          width: ((endMin - sm) / TOTAL_MIN * 100).toFixed(2)
        };
      }
      // Chip highlights
      var sh = parseInt(startTime.split(':')[0]) || 0;
      var smin = parseInt(startTime.split(':')[1]) || 0;
      setObj._startHourVal = sh;
      setObj.startMinIdx = MINUTE_OPTS.indexOf(smin - (smin % 10));
      if (setObj.bookingTimeEnd) {
        var eh = parseInt(setObj.bookingTimeEnd.split(':')[0]) || 0;
        var emin = parseInt(setObj.bookingTimeEnd.split(':')[1]) || 0;
        setObj._endHourVal = eh;
        setObj.endMinIdx = MINUTE_OPTS.indexOf(emin - (emin % 10));
        setObj.endHours = [];
        for (var i = 0; i < openHours.length; i++) {
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
    var self = this;
    wx.nextTick(function() { self._queryTimelineWidth(); });
  },

  _buildTimeline(dayData) {
    var openSlots = dayData.openSlots || [];
    var bookedSlots = dayData.bookedSlots || [];
    var activitySlots = dayData.activitySlots || [];
    var blocks = [], t = 0;
    while (t + 30 <= TOTAL_MIN) {
      var inOpen = false;
      for (var oi = 0; oi < openSlots.length; oi++) {
        if (t >= timeToMin(openSlots[oi].timeStart) && t + 30 <= timeToMin(openSlots[oi].timeEnd)) { inOpen = true; break; }
      }
      var status = 'closed';
      if (inOpen) {
        status = 'free';
        for (var bi = 0; bi < bookedSlots.length; bi++) {
          if (t < timeToMin(bookedSlots[bi].timeEnd) && t + 30 > timeToMin(bookedSlots[bi].timeStart)) {
            status = 'booked'; break;
          }
        }
        if (status === 'free') {
          for (var ai = 0; ai < activitySlots.length; ai++) {
            if (t < timeToMin(activitySlots[ai].timeEnd) && t + 30 > timeToMin(activitySlots[ai].timeStart)) {
              status = 'activity'; break;
            }
          }
        }
      }
      var last = blocks[blocks.length - 1];
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
    var dayData = this.data._dayData;
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
    var startMin = timeToMin(timeStr);
    var dateStr = this.data.bookingStartDate;
    var dayData = this.data._dayData;
    var now = new Date(), today = fmtLocalDate(now);

    // 1. Past check → auto-correct
    if (dateStr === today && startMin < now.getHours() * 60 + now.getMinutes()) {
      var corrected = findNearestValidStartMin(dateStr, dayData);
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
    var inOpen = false;
    for (var oi = 0; oi < dayData.openSlots.length; oi++) {
      if (startMin >= timeToMin(dayData.openSlots[oi].timeStart) && startMin < timeToMin(dayData.openSlots[oi].timeEnd)) {
        inOpen = true; break;
      }
    }
    if (!inOpen) {
      if (!opts.silent) showShortToast('该时间不在开放时段内');
      return false;
    }
    // 3. Must not be in blocked interval (pending/booked/activity)
    var blockedMerged = buildBlockedIntervals(dayData);
    for (var bi = 0; bi < blockedMerged.length; bi++) {
      if (startMin >= blockedMerged[bi].start && startMin < blockedMerged[bi].end) {
        if (!opts.silent) showShortToast('该时段已被占用');
        return false;
      }
    }

    var w0 = this.data._timelineWidth;
    var smin0 = parseInt(timeStr.split(':')[1]) || 0;
    var sh0 = parseInt(timeStr.split(':')[0]) || 0;
    var upd0 = {
      bookingTimeStart: timeStr, timeStartInput: timeStr,
      _startHourVal: sh0, startMinIdx: MINUTE_OPTS.indexOf(smin0 - (smin0 % 10))
    };
    if (w0) upd0.startHandleX = Math.round(startMin / TOTAL_MIN * w0);
    this.setData(upd0);

    // Check if current end time is still valid
    var curEnd = this.data.bookingTimeEnd;
    var kept = false;
    if (curEnd) {
      var endMin = timeToMin(curEnd);
      var openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots));
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
    var endMin = timeToMin(timeStr);
    var startMin = timeToMin(this.data.bookingTimeStart);
    var dayData = this.data._dayData;

    if (!this.data.bookingTimeStart) {
      if (!opts.silent) showShortToast('请先选择开始时间');
      return false;
    }
    if (endMin <= startMin) {
      if (!opts.silent) showShortToast('结束时间必须晚于开始时间');
      return false;
    }
    if (dayData && dayData.openSlots) {
      var inOpen = false;
      for (var oi = 0; oi < dayData.openSlots.length; oi++) {
        if (endMin > timeToMin(dayData.openSlots[oi].timeStart) && endMin <= timeToMin(dayData.openSlots[oi].timeEnd)) {
          inOpen = true; break;
        }
      }
      if (!inOpen) {
        if (!opts.silent) showShortToast('结束时间不在开放时段内');
        return false;
      }
      var openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots));
      var gap = findOpenGap(startMin, endMin, openMerged);
      if (gap >= 0) {
        if (!opts.silent) showShortToast(minToTime(gap) + ' 场地不开放');
        return false;
      }
      var blockedMerged = buildBlockedIntervals(dayData);
      var conflict = findBlockedOverlap(startMin, endMin, blockedMerged);
      if (conflict) {
        if (!opts.silent) showShortToast(minToTime(conflict.start) + ' 已被占用，无法跨越');
        return false;
      }
    }

    // Consolidate into one setData
    var w = this.data._timelineWidth;
    var dur2 = endMin - startMin;
    var dh2 = Math.floor(dur2 / 60), dm2 = dur2 % 60;
    var o2 = {
      bookingTimeEnd: timeStr, timeEndInput: timeStr,
      _durationText: dh2 > 0 ? (dh2 + '小时' + (dm2 > 0 ? dm2 + '分钟' : '')) : (dm2 + '分钟'),
      _activeDuration: dur2,
      timelineSelection: { left: (startMin / TOTAL_MIN * 100).toFixed(2), width: (dur2 / TOTAL_MIN * 100).toFixed(2) }
    };
    if (w) {
      o2.endHandleX = Math.round(endMin / TOTAL_MIN * w);
    }
    // Chip state
    var eh2 = parseInt(timeStr.split(':')[0]) || 0;
    var em3 = parseInt(timeStr.split(':')[1]) || 0;
    o2._endHourVal = eh2;
    o2.endMinIdx = MINUTE_OPTS.indexOf(em3 - (em3 % 10));
    var sh2 = parseInt(this.data.bookingTimeStart.split(':')[0]) || 0;
    o2.endHours = [];
    var shs = this.data.startHours;
    for (var i2 = 0; i2 < shs.length; i2++) {
      if (shs[i2].value >= (sh2 >= 0 ? sh2 : 0))
        o2.endHours.push({ label: shs[i2].label, value: shs[i2].value });
    }
    this.setData(o2);
    return true;
  },

  /** Auto-set end time from current start using smart logic. */
  _autoSetEnd() {
    var startMin = timeToMin(this.data.bookingTimeStart);
    var dayData = this.data._dayData;
    if (!dayData || startMin < 0) return;
    var blockedMerged = buildBlockedIntervals(dayData);
    var openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots || []));
    var endMin = findSmartEnd(startMin, openMerged, blockedMerged);
    if (endMin <= startMin) return;
    var endTime = minToTime(endMin);
    var w = this.data._timelineWidth;
    // Consolidate into one setData
    var o = { bookingTimeEnd: endTime, timeEndInput: endTime };
    if (w) {
      o.endHandleX = Math.round(endMin / TOTAL_MIN * w);
      o.startHandleX = Math.round(startMin / TOTAL_MIN * w);
    }
    // Timeline selection
    var dur = endMin - startMin;
    var dh = Math.floor(dur / 60), dm = dur % 60;
    o._durationText = dh > 0 ? (dh + '小时' + (dm > 0 ? dm + '分钟' : '')) : (dm + '分钟');
    o._activeDuration = dur;
    o.timelineSelection = { left: (startMin / TOTAL_MIN * 100).toFixed(2), width: (dur / TOTAL_MIN * 100).toFixed(2) };
    // Chip highlights for end
    var sh = parseInt(this.data.bookingTimeStart.split(':')[0]) || 0;
    var eh = parseInt(endTime.split(':')[0]) || 0;
    var emin = parseInt(endTime.split(':')[1]) || 0;
    o._endHourVal = eh;
    o.endMinIdx = MINUTE_OPTS.indexOf(emin - (emin % 10));
    o.endHours = [];
    var shours = this.data.startHours;
    for (var i = 0; i < shours.length; i++) {
      if (shours[i].value >= (sh >= 0 ? sh : 0))
        o.endHours.push({ label: shours[i].label, value: shours[i].value });
    }
    this.setData(o);
  },

  // ═══════════════════ Timeline dimension & rendering ═══════════════════

  _queryTimelineWidth(retries) {
    retries = retries || 0;
    var self = this;
    wx.createSelectorQuery().select('.timeline-drag-container').boundingClientRect().exec(function(rects) {
      if (rects && rects[0] && rects[0].width) {
        self.setData({ _timelineWidth: rects[0].width });
        self._updateHandlePositions();
      } else if (retries < 8) {
        setTimeout(function() { self._queryTimelineWidth(retries + 1); }, 150);
      } else {
        // Fallback: use window width minus estimated padding
        try {
          var wInfo = wx.getWindowInfo ? wx.getWindowInfo() : null;
          var ww = wInfo ? wInfo.windowWidth : 375;
          self.setData({ _timelineWidth: ww - 64 });
          self._updateHandlePositions();
        } catch(e) {}
      }
    });
  },

  _minToPx(min) {
    var w = this.data._timelineWidth;
    return w ? Math.round(min / TOTAL_MIN * w) : 0;
  },
  _pxToMin(px) {
    var w = this.data._timelineWidth;
    return w ? Math.round(px / w * TOTAL_MIN) : 0;
  },

  _updateHandlePositions() {
    var sm = timeToMin(this.data.bookingTimeStart);
    var em = timeToMin(this.data.bookingTimeEnd);
    this.setData({
      startHandleX: this._minToPx(sm),
      endHandleX: this._minToPx(em || sm)
    });
  },

  _updateTimelineRange() {
    var st = this.data.bookingTimeStart, et = this.data.bookingTimeEnd;
    if (!st || !et) {
      this.setData({ timelineSelection: null, _durationText: '', _activeDuration: 0 });
      return;
    }
    var sm = timeToMin(st), em = timeToMin(et);
    if (em <= sm) { this.setData({ timelineSelection: null, _durationText: '', _activeDuration: 0 }); return; }
    var dur = em - sm;
    var h = Math.floor(dur / 60), m = dur % 60;
    var durText = h > 0 ? (h + '小时' + (m > 0 ? m + '分钟' : '')) : (m + '分钟');
    this.setData({
      timelineSelection: { left: (sm / TOTAL_MIN * 100).toFixed(2), width: ((em - sm) / TOTAL_MIN * 100).toFixed(2) },
      _durationText: durText, _activeDuration: dur
    });
  },

  _updateChipState() {
    var st = this.data.bookingTimeStart, et = this.data.bookingTimeEnd;
    var sh = st ? parseInt(st.split(':')[0]) : -1;
    var sm = st ? parseInt(st.split(':')[1]) : -1;
    var smIdx = MINUTE_OPTS.indexOf(sm);
    var eh = et ? parseInt(et.split(':')[0]) : -1;
    var em = et ? parseInt(et.split(':')[1]) : -1;
    var emIdx = MINUTE_OPTS.indexOf(em);
    var endHours = [];
    var startHours = this.data.startHours;
    for (var i = 0; i < startHours.length; i++) {
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

  onStartHourTap(e) {
    var h = parseInt(e.currentTarget.dataset.value);
    var cur = this.data.bookingTimeStart;
    var m = cur ? parseInt(cur.split(':')[1]) : 0;
    m = MINUTE_OPTS.indexOf(m) >= 0 ? m : 0;
    this._setStartTime(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
  },

  onStartMinTap(e) {
    var m = parseInt(e.currentTarget.dataset.value);
    var cur = this.data.bookingTimeStart;
    var h = cur ? parseInt(cur.split(':')[0]) : (this.data.startHours.length ? this.data.startHours[0].value : 8);
    this._setStartTime(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
  },

  onEndHourTap(e) {
    var h = parseInt(e.currentTarget.dataset.value);
    var cur = this.data.bookingTimeEnd || this.data.bookingTimeStart;
    var m = cur ? parseInt(cur.split(':')[1]) : 0;
    m = MINUTE_OPTS.indexOf(m) >= 0 ? m : 0;
    this._setEndTime(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
  },

  onEndMinTap(e) {
    var m = parseInt(e.currentTarget.dataset.value);
    var cur = this.data.bookingTimeEnd || this.data.bookingTimeStart;
    var h = cur ? parseInt(cur.split(':')[0]) : (this.data.endHours.length ? this.data.endHours[0].value : 9);
    this._setEndTime(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
  },

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
    for (var d = SNAP; d < TOTAL_MIN; d += SNAP) {
      var a = snapMin(Math.max(0, min + d));
      var b = snapMin(Math.max(0, min - d));
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
    var now = new Date(), today = fmtLocalDate(now);
    if (this.data.bookingStartDate === today && min < now.getHours() * 60 + now.getMinutes()) {
      return false;
    }
    var inOpen = false;
    for (var i = 0; i < m.openMerged.length; i++) {
      if (isStart) {
        if (min >= m.openMerged[i].start && min < m.openMerged[i].end) { inOpen = true; break; }
      } else {
        if (min > m.openMerged[i].start && min <= m.openMerged[i].end) { inOpen = true; break; }
      }
    }
    if (!inOpen) return false;
    for (var j = 0; j < m.blockedMerged.length; j++) {
      var bj = m.blockedMerged[j];
      // blocked=[s,e): start (≥s,<e) blocked; end (>s,<e) blocked — allows end at blocked.start
      if (min >= bj.start && min < bj.end) return false;
    }
    return true;
  },

  onHandleTouchMove(e) {
    if (!this._dragHandle) return;
    var w = this.data._timelineWidth;
    if (!w) return;

    var dx = e.touches[0].clientX - this._dragStartX;
    var px = Math.max(0, Math.min(w, this._dragStartPx + dx));
    var rawMin = snapMin(Math.round(px / w * TOTAL_MIN));

    var m = this._getMergedIntervals();
    var isStart = this._dragHandle === 'start';

    // Compute time values (same logic as before)
    var sm, st, em, et;
    if (isStart) {
      sm = rawMin;
      if (m) sm = this._snapToFree(sm, true, m);
      // ★ start 不能超过 end
      var curEnd2 = timeToMin(this.data.bookingTimeEnd);
      if (curEnd2 && sm >= curEnd2) {
        sm = Math.max(0, curEnd2 - SNAP);
        if (m) sm = this._snapToFree(sm, true, m);
      }
      st = minToTime(sm);
      em = timeToMin(this.data.bookingTimeEnd);
      et = this.data.bookingTimeEnd;
    } else {
      var curStart = timeToMin(this.data.bookingTimeStart);
      em = rawMin;
      if (em <= curStart) em = curStart + SNAP;
      if (m) {
        em = this._snapToFree(em, false, m);
        if (em <= curStart) em = curStart + SNAP;
        // ★ 确保 [start, end] 区间不跨越 blocked 或 open gap
        var conflict2 = findBlockedOverlap(curStart, em, m.blockedMerged);
        if (conflict2) em = snapMin(conflict2.start);
        var gap2 = findOpenGap(curStart, em, m.openMerged);
        if (gap2 >= 0) em = snapMin(gap2);
        if (em <= curStart) em = curStart + SNAP;
      }
      et = minToTime(em);
      sm = timeToMin(this.data.bookingTimeStart);
      st = this.data.bookingTimeStart;
    }

    // Build a single merged setData object with ALL fields from the original
    // three setData calls (handle position + timelineRange + chipState)
    var upd = {};

    if (isStart) {
      upd.startHandleX = Math.round(sm / TOTAL_MIN * w);
      upd.bookingTimeStart = st;
      upd.timeStartInput = st;
    } else {
      upd.endHandleX = Math.round(em / TOTAL_MIN * w);
      upd.bookingTimeEnd = et;
      upd.timeEndInput = et;
    }

    // ── Inline _updateTimelineRange ──
    if (sm < em) {
      var dur = em - sm;
      var dh = Math.floor(dur / 60), dm = dur % 60;
      upd._durationText = dh > 0 ? (dh + '小时' + (dm > 0 ? dm + '分钟' : '')) : (dm + '分钟');
      upd._activeDuration = dur;
      upd.timelineSelection = {
        left: (sm / TOTAL_MIN * 100).toFixed(2),
        width: ((em - sm) / TOTAL_MIN * 100).toFixed(2)
      };
    }

    // ── Inline _updateChipState ──
    var sh = st ? parseInt(st.split(':')[0]) : -1;
    var smin = st ? parseInt(st.split(':')[1]) : -1;
    var smIdx = MINUTE_OPTS.indexOf(smin);
    var eh2 = et ? parseInt(et.split(':')[0]) : -1;
    var emin = et ? parseInt(et.split(':')[1]) : -1;
    var emIdx = MINUTE_OPTS.indexOf(emin);
    var endHours = [];
    var startHours = this.data.startHours;
    for (var i = 0; i < startHours.length; i++) {
      if (startHours[i].value >= (sh >= 0 ? sh : 0)) {
        endHours.push({ label: startHours[i].label, value: startHours[i].value });
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
      var self = this;
      wx.nextTick(function () {
        self._rafPending = false;
        if (self._pendingSetData) {
          var final = self._pendingSetData;
          self._pendingSetData = null;
          self.setData(final);
        }
      });
    }
  },

  onHandleTouchEnd() {
    if (!this._dragHandle) return;
    var h = this._dragHandle;
    var ps = this._preStart;
    var pe = this._preEnd;
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
    var now = new Date();
    for (var i = 0; i < 30; i++) {
      var d = new Date(now);
      d.setDate(d.getDate() + i);
      var ds = fmtLocalDate(d);
      try {
        var res = await callFunction({ name: 'getVenueSchedule', data: { venueId: this.data.bookingVenueId, dateFrom: ds, dateTo: ds } });
        if (res.status === 'success') {
          var dayData = (res.dailySchedules || [])[0];
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
    var d = e.detail.value;
    var today = fmtLocalDate(new Date());
    if (d < today) {
      var prevDate = this.data.bookingStartDate;
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
      var nearest = await this._findNearestAvailableDate();
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
    var target = e.currentTarget.dataset.target;
    var isStart = target.indexOf('start') === 0;
    var curTime = isStart ? this.data.bookingTimeStart : this.data.bookingTimeEnd;
    var h = '', m = '';
    if (curTime) { var p = curTime.split(':'); h = p[0]; m = p[1]; }
    var field = target.indexOf('Hour') >= 0 ? 'hour' : 'min';
    this.setData({
      _kbVisible: true, _kbTarget: target, _kbField: field,
      _kbHourVal: h, _kbMinVal: m
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
    var key = e.currentTarget.dataset.key;
    if (key === ':') { this._onKbColon(); return; }
    if (this.data._kbGray[key]) return; // grayed out
    var field = this.data._kbField;
    var val = field === 'hour' ? this.data._kbHourVal : this.data._kbMinVal;
    if (val.length >= 2) return; // max 2 digits
    val = val + key;
    var upd = field === 'hour' ? { _kbHourVal: val } : { _kbMinVal: val };
    this.setData(upd);
    // Auto-switch: 2-digit hour → jump to minute
    if (field === 'hour' && val.length === 2) {
      this.setData({ _kbField: 'min' });
    }
    this._computeGrayKeys();
  },

  /** Colon key: switch hour→min, pad single-digit hour. */
  _onKbColon() {
    if (this.data._kbField === 'hour') {
      var h = this.data._kbHourVal;
      if (h.length === 1) h = '0' + h;
      this.setData({ _kbField: 'min', _kbHourVal: h });
      this._computeGrayKeys();
    }
    // In minute field, colon does nothing
  },

  /** Backspace key. */
  onKbBackspace() {
    var field = this.data._kbField;
    var val = field === 'hour' ? this.data._kbHourVal : this.data._kbMinVal;
    if (!val) return;
    val = val.slice(0, -1);
    var upd = field === 'hour' ? { _kbHourVal: val } : { _kbMinVal: val };
    this.setData(upd);
    this._computeGrayKeys();
  },

  /** Switch active field (tap hour/min display box in keyboard). */
  onKbSwitchField(e) {
    var f = e.currentTarget.dataset.field; // 'hour' | 'min'
    if (f === this.data._kbField) return;
    this._computeGrayKeys(f);  // pass field override, single setData
  },

  /** Confirm: validate, call _setStartTime/_setEndTime, close. */
  onKbConfirm() {
    this._commitKb();
    this.setData({ _kbVisible: false });
  },

  /** Commit current keyboard value to the target time field. */
  _commitKb() {
    var target = this.data._kbTarget;
    if (!target) return;
    var h = this.data._kbHourVal, m = this.data._kbMinVal;
    // Pad to valid HH:MM
    if (!h) h = '00';
    if (h.length === 1) h = '0' + h;
    if (!m) m = '00';
    if (m.length === 1) m = '0' + m;
    var timeStr = h + ':' + m;
    if (target.indexOf('start') === 0) {
      this._setStartTime(timeStr);
    } else {
      this._setEndTime(timeStr);
    }
  },

  /** Load keyboard values from current booking data. */
  _loadKbFromCurrent() {
    var target = this.data._kbTarget;
    var isStart = target && target.indexOf('start') === 0;
    var curTime = isStart ? this.data.bookingTimeStart : this.data.bookingTimeEnd;
    var h = '', m = '';
    if (curTime) { var p = curTime.split(':'); h = p[0]; m = p[1]; }
    this.setData({ _kbHourVal: h, _kbMinVal: m });
    this._computeGrayKeys();
  },

  /** Compute which numpad keys should be grayed out.
   *  @param {string=} fieldOverride — if provided, use this instead of data._kbField (avoids extra setData) */
  _computeGrayKeys(fieldOverride) {
    var target = this.data._kbTarget;
    var field = fieldOverride || this.data._kbField;
    var hVal = this.data._kbHourVal;
    var mVal = this.data._kbMinVal;
    var curVal = field === 'hour' ? hVal : mVal;
    var maxVal = field === 'hour' ? 23 : 59;
    var gray = {};

    // ── Structural: digit limit ──
    if (curVal.length >= 2) {
      for (var d = 0; d <= 9; d++) gray[d] = true;
    } else if (curVal.length === 1) {
      var prefix = parseInt(curVal);
      for (var d2 = 0; d2 <= 9; d2++) {
        if (prefix * 10 + d2 > maxVal) gray[d2] = true;
      }
    }

    // ── Semantic: deep validation ──
    if (target && target.indexOf('start') === 0) {
      this._applyStartSemanticGray(gray, target, field, hVal, mVal);
    } else if (target && target.indexOf('end') === 0) {
      this._applyEndSemanticGray(gray, target, field, hVal, mVal);
    }

    var upd = { _kbGray: gray };
    if (fieldOverride) upd._kbField = fieldOverride;
    this.setData(upd);
  },

  /** Semantic gray for start time: past / blocked / closed checks. */
  _applyStartSemanticGray(gray, target, field, hVal, mVal) {
    var now = new Date(), today = fmtLocalDate(now);
    if (this.data.bookingStartDate !== today) return;
    var nowHour = now.getHours(), nowMin = now.getMinutes();
    var dayData = this.data._dayData;
    if (!dayData) return;

    if (target === 'startHour' && field === 'hour') {
      // Only check when we know the final hour (checking second digit or single-digit complete)
      if (hVal.length === 1) {
        var prefix = parseInt(hVal);
        for (var d = 0; d <= 9; d++) {
          var result = prefix * 10 + d;
          if (result <= 23 && result < nowHour) gray[d] = true;
        }
      }
      // When empty: gray first digits that can't form ANY valid future hour
      if (hVal === '') {
        for (var d = 0; d <= 9; d++) {
          var anyValid = false;
          for (var ds = 0; ds <= 9; ds++) {
            var fullH = d * 10 + ds;
            if (fullH <= 23 && fullH >= nowHour) { anyValid = true; break; }
          }
          if (!anyValid) gray[d] = true;
        }
      }
    }

    if (target === 'startMin' && field === 'min') {
      var curH = parseInt(hVal);
      if (isNaN(curH) || curH > nowHour) return;
      if (curH < nowHour) return;
      // Same hour: gray minutes ≤ nowMin, or not in open slot, or blocked
      var blockedMerged = buildBlockedIntervals(dayData);
      var openSlots = dayData.openSlots || [];
      for (var m = 0; m < 60; m++) {
        if (m <= nowMin) { this._markGrayForMin(gray, m, mVal); continue; }
        var absMin = curH * 60 + m;
        var inOpen = false;
        for (var oi = 0; oi < openSlots.length; oi++) {
          if (absMin >= timeToMin(openSlots[oi].timeStart) && absMin < timeToMin(openSlots[oi].timeEnd)) { inOpen = true; break; }
        }
        if (!inOpen) { this._markGrayForMin(gray, m, mVal); continue; }
        for (var bi = 0; bi < blockedMerged.length; bi++) {
          if (absMin >= blockedMerged[bi].start && absMin < blockedMerged[bi].end) { this._markGrayForMin(gray, m, mVal); break; }
        }
      }
    }
  },

  /** Semantic gray for end time: must be > start, no blocked/gap crossing. */
  _applyEndSemanticGray(gray, target, field, hVal, mVal) {
    var startTime = this.data.bookingTimeStart;
    if (!startTime) return;
    var sH = parseInt(startTime.split(':')[0]);
    var sM = parseInt(startTime.split(':')[1]);
    var dayData = this.data._dayData;
    if (!dayData) return;

    if (target === 'endHour' && field === 'hour') {
      if (hVal.length === 1) {
        var prefix = parseInt(hVal);
        for (var d = 0; d <= 9; d++) {
          if (prefix * 10 + d < sH) gray[d] = true;
        }
      }
      // When empty: gray first digits that can't form ANY valid end hour (> startHour)
      if (hVal === '') {
        for (var d = 0; d <= 9; d++) {
          var anyValid = false;
          for (var ds = 0; ds <= 9; ds++) {
            var fullH = d * 10 + ds;
            if (fullH <= 23 && fullH > sH) { anyValid = true; break; }
          }
          if (!anyValid) gray[d] = true;
        }
      }
    }

    if (target === 'endMin' && field === 'min') {
      var curH = parseInt(hVal);
      if (isNaN(curH) || curH < sH) return;
      var startMinAbs = sH * 60 + sM;
      var blockedMerged = buildBlockedIntervals(dayData);
      var openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots || []));
      for (var m = 0; m < 60; m++) {
        if (curH === sH && m <= sM) { this._markGrayForMin(gray, m, mVal); continue; }
        var absEnd = curH * 60 + m;
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
      var tens = parseInt(curMinVal);
      if (m >= tens * 10 && m < (tens + 1) * 10) gray[m % 10] = true;
    }
  },

  // ═══════════════════ Duration chips ═══════════════════

  onDurationTap(e) {
    var minutes = parseInt(e.currentTarget.dataset.minutes);
    if (!minutes) return;
    if (!this.data.bookingTimeStart) { showShortToast('请先选择开始时间'); return; }
    var startMin = timeToMin(this.data.bookingTimeStart);
    var endMin = startMin + minutes;
    if (endMin > TOTAL_MIN) endMin = TOTAL_MIN;
    var ok = this._setEndTime(minToTime(endMin));
    if (!ok) this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
    else this.setData({ timeEndInput: this.data.bookingTimeEnd });
  },

  // ═══════════════════ Form submit ═══════════════════

  onFieldInput(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value}); },

  async submitBooking() {
    var _a = this.data, vid = _a.bookingVenueId, sd = _a.bookingStartDate,
        st = _a.bookingTimeStart, et = _a.bookingTimeEnd, title = _a.bookingTitle, desc = _a.bookingDesc, dd = _a._dayData;
    if(!vid||!sd||!st||!et){showShortToast('请完整填写信息并选择时间段');return;}
    if(!title){showShortToast('请填写借用事由');return;}
    var now = new Date(), today = fmtLocalDate(now);
    if (sd === today && timeToMin(st) < now.getHours() * 60 + now.getMinutes()) { showShortToast('开始时间不能是过去的时间'); return; }
    var ts = sd+'T'+st, te = sd+'T'+et;
    if(ts >= te) { showShortToast('结束时间必须晚于开始时间'); return; }
    var err = this._validateRange(dd, sd, st, et);
    if(err) { showShortToast(err); return; }
    this.setData({loading:true});
    try {
      var res = await callFunction({name:'createVenueBooking',data:{venueId:vid,title:title,description:desc,timeStart:ts,timeEnd:te}});
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
    var openSlots = dayData ? (dayData.openSlots||[]) : [];
    var bookedSlots = dayData ? (dayData.bookedSlots||[]) : [];
    var activitySlots = dayData ? (dayData.activitySlots||[]) : [];
    var rs = timeToMin(st), re = timeToMin(et);
    var mo = mergeIntervals(slotsToIntervals(openSlots));
    var gap = findOpenGap(rs, re, mo);
    if(gap >= 0) return minToTime(gap) + ' 场地不开放';
    var mb = mergeIntervals([].concat(slotsToIntervals(bookedSlots), slotsToIntervals(activitySlots)));
    var conflict = findBlockedOverlap(rs, re, mb);
    if(conflict) return minToTime(conflict.start) + ' 已被占用';
    return null;
  },

  // ═══════════════════ Bookings ═══════════════════

  async loadMyBookings() {
    this.setData({loading:true});
    try {
      var res = await callFunction({name:'listMyVenueBookings',data:{}});
      if(res.status==='success') {
        var bookings = (res.bookings||[]).map(function(b){
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
    var id = e.currentTarget.dataset.id;
    var that = this;
    var booking = this.data.myBookings.find(function(b){return b.id===id;});
    if (!booking) return;
    if (booking.displayStatus === 'inUse') { showShortToast('使用中的借用不能取消，请使用"结束使用"'); return; }
    if (booking.displayStatus === 'completed') { showShortToast('已完成的借用不能取消'); return; }
    wx.showModal({
      title: '确认取消', content: '确定取消该借用申请吗？',
      success: async function(r) {
        if (!r.confirm) return;
        try {
          var res = await callFunction({name:'cancelVenueBooking',data:{id:id}});
          if(res.status==='success'){
            showShortToast(res.message || '已取消');
            var bookings = that.data.myBookings.map(function(b) {
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
    var id = e.currentTarget.dataset.id;
    var that = this;
    wx.showModal({
      title: '确认结束使用', content: '确定要结束该场地的使用吗？结束时间将更新为当前时间。',
      success: async function(r) {
        if (!r.confirm) return;
        try {
          var res = await callFunction({name:'endVenueBooking',data:{id:id}});
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
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  },

  async loadPendingData() {
    this.setData({ loading: true });
    try {
      var res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        var pending = (res.pending || []).map(function(item) {
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
      var res = await callFunction({ name: 'listPendingVenueApprovals', data: {} });
      if (res.status === 'success') {
        var pending = res.pending || [];
        var count = pending.length;
        var signature = this._buildPendingSignature(pending);
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
    var that = this;
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
    var that = this;
    if (this.data.activeTab === 'approvals') {
      this.loadPendingData().then(function() { wx.stopPullDownRefresh(); });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  // ── Approval actions ──

  openApprove(e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.pending.find(function(p) { return p.id === id; });
    if (!item) return;
    this.setData({ approvalVisible: true, approvalTarget: item, approvalAction: 'approve', approvalComment: '' });
  },

  openReject(e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.pending.find(function(p) { return p.id === id; });
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
    var that = this;
    var target = this.data.approvalTarget;
    var action = this.data.approvalAction;
    var comment = this.data.approvalComment;
    if (!target || !action) return;

    var endpoint = action === 'approve' ? 'approveVenueBookingStep' : 'rejectVenueBookingStep';
    var actionLabel = action === 'approve' ? '通过' : '驳回';

    this.setData({ approvalSubmitting: true });
    try {
      var res = await callFunction({ name: endpoint, data: { id: target.id, comment: comment } });
      if (res.status === 'success') {
        showShortToast(res.message || ('已' + actionLabel));
        that.closeApproval();

        var targetId = target.id;
        var pending = that.data.pending.slice();

        if (action === 'approve' && res.approvalProgress) {
          if (res.approvalProgress.isApproved) {
            pending = pending.filter(function(p) { return p.id !== targetId; });
          } else {
            var idx = -1;
            for (var pi = 0; pi < pending.length; pi++) {
              if (pending[pi].id === targetId) { idx = pi; break; }
            }
            if (idx >= 0) {
              var updated = Object.assign({}, pending[idx], {
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
    var id = e.currentTarget.dataset.id;
    var item = this.data.pending.find(function(p) { return p.id === id; });
    if (item) {
      this.setData({ approvalVisible: true, approvalTarget: item, approvalAction: '', approvalComment: '' });
    }
  },

  toggleFlowNode(e) { var key = e.currentTarget.dataset.nodeKey; this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key }); },
  noop() {}
});
