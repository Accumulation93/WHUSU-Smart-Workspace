const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');

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
    heroName: '场地借用', heroIdentity: '加载中', heroSubtitle: '欢迎使用REDSU智慧工作台系统 · 场地借用',
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

  onShow() { this._loadUserInfo(); this._initWeekStart(); this.loadVenues(); this.loadPurposes(); this.loadPendingCount(); },

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
  closeBooking() { this.setData({ bookingVisible: false }); },

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

    this.setData({
      timelineBlocks: timeline,
      bookingTimeStart: startTime, timeStartInput: startTime,
      startHours: openHours, _dayData: dayData
    });

    if (startTime) {
      this._autoSetEnd();
    }
    this._updateChipState();
    this._updateTimelineRange();
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

    // 1. Past check
    if (dateStr === today && startMin < now.getHours() * 60 + now.getMinutes()) {
      if (!opts.silent) showShortToast('不能选择过去的时间');
      return false;
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

    this.setData({ bookingTimeStart: timeStr, timeStartInput: timeStr });

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
      this._autoSetEnd();
    }

    this._updateTimelineRange();
    this._updateHandlePositions();
    this._updateChipState();
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

    this.setData({ bookingTimeEnd: timeStr, timeEndInput: timeStr });
    this._updateTimelineRange();
    this._updateHandlePositions();
    this._updateChipState();
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
    if (endMin > startMin) {
      var endTime = minToTime(endMin);
      this.setData({ bookingTimeEnd: endTime, timeEndInput: endTime });
      this._updateTimelineRange();
      this._updateHandlePositions();
      this._updateChipState();
    }
  },

  // ═══════════════════ Timeline dimension & rendering ═══════════════════

  _queryTimelineWidth() {
    var self = this;
    wx.createSelectorQuery().in(this).select('.timeline-drag-container').boundingClientRect().exec(function(rects) {
      if (rects && rects[0] && rects[0].width) {
        self.setData({ _timelineWidth: rects[0].width });
        self._updateHandlePositions();
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

  onHandleTouchStart(e) {
    this._dragHandle = e.currentTarget.dataset.handle;
    var touch = e.touches[0];
    this._dragStartClientX = touch.clientX;
    this._dragStartPx = this._dragHandle === 'start' ? this.data.startHandleX : this.data.endHandleX;
    this._preDragStartTime = this.data.bookingTimeStart;
    this._preDragEndTime = this.data.bookingTimeEnd;
  },

  /** Snap a px position to a valid minute (in open, not blocked). */
  _snapPxToValid(px, isStart) {
    var min = snapMin(this._pxToMin(px));
    var m = this._getMergedIntervals();
    if (!m) return min;
    // Try current position
    if (this._isMinValid(min, isStart, m)) return min;
    // Spiral outward
    for (var d = SNAP; d < TOTAL_MIN; d += SNAP) {
      var t1 = snapMin(Math.max(0, min + d));
      var t2 = snapMin(Math.max(0, min - d));
      if (isStart) {
        if (this._isMinValid(t1, true, m)) return t1;
        if (this._isMinValid(t2, true, m)) return t2;
      } else {
        if (this._isMinValid(t2, false, m)) return t2;
        if (this._isMinValid(t1, false, m)) return t1;
      }
    }
    return min;
  },

  _isMinValid(min, isStart, m) {
    if (min < 0 || min > TOTAL_MIN) return false;
    // In open?
    var inOpen = false;
    for (var i = 0; i < m.openMerged.length; i++) {
      if (isStart) {
        if (min >= m.openMerged[i].start && min < m.openMerged[i].end) { inOpen = true; break; }
      } else {
        if (min > m.openMerged[i].start && min <= m.openMerged[i].end) { inOpen = true; break; }
      }
    }
    if (!inOpen) return false;
    // Not in blocked?
    for (var j = 0; j < m.blockedMerged.length; j++) {
      if (min >= m.blockedMerged[j].start && min < m.blockedMerged[j].end) return false;
    }
    return true;
  },

  onHandleTouchMove(e) {
    if (!this._dragHandle || !this.data._timelineWidth) return;
    var touch = e.touches[0];
    var dx = touch.clientX - this._dragStartClientX;
    var newPx = Math.max(0, Math.min(this.data._timelineWidth, this._dragStartPx + dx));

    if (this._dragHandle === 'start') {
      var snappedMin = this._snapPxToValid(newPx, true);
      var timeStr = minToTime(snappedMin);
      this.setData({
        startHandleX: this._minToPx(snappedMin),
        bookingTimeStart: timeStr, timeStartInput: timeStr
      });
      // If end is now <= start, push end forward
      var endMin = timeToMin(this.data.bookingTimeEnd);
      if (endMin <= snappedMin) {
        var newEnd = this._snapPxToValid(this._minToPx(snappedMin + SNAP), false);
        this.setData({
          bookingTimeEnd: minToTime(newEnd), timeEndInput: minToTime(newEnd),
          endHandleX: this._minToPx(newEnd)
        });
      }
      // If end was valid before but now [start,end] crosses blocked, push end back
      if (endMin > snappedMin) {
        var blockedMerged = (this._getMergedIntervals() || {}).blockedMerged;
        if (blockedMerged && findBlockedOverlap(snappedMin, endMin, blockedMerged)) {
          var fixedEnd = this._snapPxToValid(this._minToPx(endMin), false);
          this.setData({
            bookingTimeEnd: minToTime(fixedEnd), timeEndInput: minToTime(fixedEnd),
            endHandleX: this._minToPx(fixedEnd)
          });
        }
      }
    } else {
      var startMin = timeToMin(this.data.bookingTimeStart);
      var endSnap = this._snapPxToValid(newPx, false);
      if (endSnap <= startMin) endSnap = this._snapPxToValid(this._minToPx(startMin + SNAP), false);
      var endTimeStr = minToTime(endSnap);
      this.setData({
        endHandleX: this._minToPx(endSnap),
        bookingTimeEnd: endTimeStr, timeEndInput: endTimeStr
      });
    }
    this._updateTimelineRange();
    this._updateChipState();
  },

  onHandleTouchEnd() {
    if (!this._dragHandle) return;
    var handle = this._dragHandle;
    var prevStart = this._preDragStartTime;
    var prevEnd = this._preDragEndTime;
    this._dragHandle = null;

    if (handle === 'start') {
      var ok = this._setStartTime(this.data.bookingTimeStart, {silent:true});
      if (!ok) {
        this.setData({ bookingTimeStart: prevStart || '', timeStartInput: prevStart || '' });
        if (prevEnd) this.setData({ bookingTimeEnd: prevEnd, timeEndInput: prevEnd });
      }
      // _setStartTime already handled end adjustment
    } else {
      var ok2 = this._setEndTime(this.data.bookingTimeEnd, {silent:true});
      if (!ok2) {
        this.setData({ bookingTimeEnd: prevEnd || '', timeEndInput: prevEnd || '' });
      }
    }
    this._updateChipState();
    this._updateHandlePositions();
    this._updateTimelineRange();
  },

  // ═══════════════════ Text input ═══════════════════

  onStartDateChange(e) {
    var d = e.detail.value;
    this.setData({
      bookingStartDate: d, bookingStartDateDisplay: d, bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeStart: '', bookingTimeEnd: '', timeStartInput: '', timeEndInput: '',
      timelineBlocks: [], timelineSelection: null, _timelineWidth: 0,
      startHandleX: 0, endHandleX: 0, startHours: [], endHours: [], startMinIdx: -1, endMinIdx: -1,
      _dayData: null
    });
    this._loadScheduleForDate(d);
  },

  onEndDateChange(e) {
    var d = e.detail.value;
    if (d < this.data.bookingStartDate) { showShortToast('结束日期不能早于开始日期'); return; }
    this.setData({ bookingEndDate: d, bookingEndDateDisplay: d });
  },

  onTimeStartInput(e) { this.setData({ timeStartInput: e.detail.value }); },
  onTimeStartInputBlur() {
    var val = (this.data.timeStartInput || '').trim();
    if (!val) return;
    var match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) { showShortToast('格式不正确，请使用 HH:MM'); this.setData({ timeStartInput: this.data.bookingTimeStart || '' }); return; }
    var h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) { showShortToast('时间范围不正确'); this.setData({ timeStartInput: this.data.bookingTimeStart || '' }); return; }
    var timeStr = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    var ok = this._setStartTime(timeStr);
    if (!ok) this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
  },

  onTimeEndInput(e) { this.setData({ timeEndInput: e.detail.value }); },
  onTimeEndInputBlur() {
    var val = (this.data.timeEndInput || '').trim();
    if (!val) return;
    var match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) { showShortToast('格式不正确，请使用 HH:MM'); this.setData({ timeEndInput: this.data.bookingTimeEnd || '' }); return; }
    var h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) { showShortToast('时间范围不正确'); this.setData({ timeEndInput: this.data.bookingTimeEnd || '' }); return; }
    var timeStr = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    var ok = this._setEndTime(timeStr);
    if (!ok) this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
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
    var _a = this.data, vid = _a.bookingVenueId, sd = _a.bookingStartDate, ed = _a.bookingEndDate,
        st = _a.bookingTimeStart, et = _a.bookingTimeEnd, title = _a.bookingTitle, desc = _a.bookingDesc, dd = _a._dayData;
    if(!vid||!sd||!st||!et){showShortToast('请完整填写信息并选择时间段');return;}
    if(!title){showShortToast('请填写借用事由');return;}
    var now = new Date(), today = fmtLocalDate(now);
    if (sd === today && timeToMin(st) < now.getHours() * 60 + now.getMinutes()) { showShortToast('开始时间不能是过去的时间'); return; }
    var ts = sd+'T'+st, te = ed+'T'+et;
    if(ts >= te) { showShortToast('结束时间必须晚于开始时间'); return; }
    var err = this._validateRange(dd, sd, ed, st, et);
    if(err) { showShortToast(err); return; }
    this.setData({loading:true});
    try {
      var res = await callFunction({name:'createVenueBooking',data:{venueId:vid,title:title,description:desc,timeStart:ts,timeEnd:te}});
      if(res.status==='success'){showShortToast(res.message);this.setData({bookingVisible:false});}else showShortToast(res.message);
    } catch(e) { showShortToast(getErrorText(e,'借用失败')); }
    finally { this.setData({loading:false}); }
  },

  _validateRange(dayData, sd, ed, st, et) {
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
          if(res.status==='success'){showShortToast('已取消');}else showShortToast(res.message);
        } catch(e) { showShortToast(getErrorText(e,'取消失败')); }
      }
    });
  },

  async endMyBooking(e) {
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认结束使用', content: '确定要结束该场地的使用吗？结束时间将更新为当前时间。',
      success: async function(r) {
        if (!r.confirm) return;
        try {
          var res = await callFunction({name:'endVenueBooking',data:{id:id}});
          if(res.status==='success'){showShortToast('使用已结束');}else showShortToast(res.message);
        } catch(e) { showShortToast(getErrorText(e,'操作失败')); }
      }
    });
  },

  goPendingApprovals() { wx.navigateTo({ url: '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals' }); },
  toggleFlowNode(e) { var key = e.currentTarget.dataset.nodeKey; this.setData({ expandedNodeKey: this.data.expandedNodeKey === key ? '' : key }); },
  noop() {}
});
