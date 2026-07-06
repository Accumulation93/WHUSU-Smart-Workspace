const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');

const HOURS = ['00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','24:00'];
const HOUR_HEIGHT = 64;
const BASE_MIN = 0;
const HEADER_H = 58;
const TEXT_OFFSET = 22;
const TOTAL_MIN = 24 * 60;

function timeToMin(t) { if (!t) return 0; const p = String(t).split(':'); return (parseInt(p[0])||0)*60 + (parseInt(p[1])||0); }
function fmtLocalDate(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function calcBlock(ts, te) { const s=timeToMin(ts),e=timeToMin(te); return { top:Math.round((s-BASE_MIN)/60*HOUR_HEIGHT), height:Math.max(Math.round((e-s)/60*HOUR_HEIGHT),20) }; }
function slotsToIntervals(slots) { return (slots||[]).map(s=>({start:timeToMin(s.timeStart),end:timeToMin(s.timeEnd)})); }
function mergeIntervals(intervals) { if(!intervals.length)return[]; const s=[...intervals].sort((a,b)=>a.start-b.start),m=[s[0]]; for(let i=1;i<s.length;i++){const l=m[m.length-1]; if(s[i].start<=l.end)l.end=Math.max(l.end,s[i].end); else m.push(s[i]);} return m; }
function findOpenGap(rs,re,mo){let c=rs; for(const iv of mo){if(iv.start>c)return c;if(iv.end>c)c=iv.end;if(c>=re)return-1;}return c<re?c:-1;}
function findBlockedOverlap(rs,re,mb){for(const iv of mb){if(iv.start<re&&iv.end>rs)return iv;}return null;}
function minToTime(min) { if (min < 0) return '00:00'; if (min >= 1440) return '24:00'; var h = Math.floor(min / 60), m = min % 60; return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); }

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

/**
 * Build merged blocked intervals from dayData.
 * Blocked = booked (any status including pending) + activity slots.
 * Returns merged intervals [{start, end}].
 */
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

/**
 * Find default start time: first open slot's start that is >= now (if today), else first open slot start.
 */
function findDefaultStart(dayData, dateStr) {
  if (!dayData || !dayData.openSlots || !dayData.openSlots.length) return '';
  var now = new Date();
  var today = fmtLocalDate(now);
  var currentMin = now.getHours() * 60 + now.getMinutes();
  var openSlots = dayData.openSlots;
  for (var i = 0; i < openSlots.length; i++) {
    var s = timeToMin(openSlots[i].timeStart);
    var e = timeToMin(openSlots[i].timeEnd);
    if (dateStr === today) {
      if (e <= currentMin) continue;
      var startMin = Math.max(s, currentMin);
      return minToTime(startMin);
    } else {
      return openSlots[i].timeStart;
    }
  }
  return openSlots[0].timeStart;
}

/**
 * Find a valid end time. Defaults to start+1h, adjusts if blocked.
 */
function findDefaultEnd(startMin, blockedMerged) {
  var ideal = startMin + 60;
  if (ideal > TOTAL_MIN) ideal = TOTAL_MIN;
  // See if [startMin, ideal] overlaps any blocked interval
  var conflict = findBlockedOverlap(startMin, ideal, blockedMerged);
  if (!conflict) return minToTime(ideal);
  // Jump to end of conflict
  var end = conflict.end;
  if (end >= TOTAL_MIN) return '';
  return minToTime(end);
}

Page({
  data: {
    activeTab: 'browse', loading: false,
    // Browse tab
    venues: [],
    scheduleVisible: false, scheduleVenueId: '', scheduleVenueName: '', scheduleWeekStart: '',
    timetableColumns: [], timetableHours: HOURS,
    bookingDetailVisible: false, bookingDetail: null,
    // Booking form
    bookingVisible: false, bookingVenueId: '', bookingVenueName: '',
    bookingStartDate: '', bookingStartDateDisplay: '',
    bookingEndDate: '', bookingEndDateDisplay: '',
    bookingTitle: '', bookingDesc: '',
    bookingTimeStart: '', bookingTimeEnd: '',
    timeStartInput: '', timeEndInput: '',
    timelineBlocks: [],
    timelineRange: null,
    durationChips: [
      { label: '30分钟', minutes: 30 },
      { label: '1小时', minutes: 60 },
      { label: '1.5小时', minutes: 90 },
      { label: '2小时', minutes: 120 },
      { label: '3小时', minutes: 180 }
    ],
    purposes: [],
    statusLabels: { pending:'待审核', approved:'已通过', rejected:'已驳回', cancelled:'已取消', inUse:'使用中', completed:'已完成' },
    HOUR_HEIGHT: HOUR_HEIGHT, HEADER_H: HEADER_H,
    // Bookings tab
    myBookings: [], pendingApprovalCount: 0,
    expandedNodeKey: '',
    // Hero
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
      bookingTitle: '', bookingDesc: '', timelineBlocks: [], timelineRange: null,
      _dayData: null
    });
    this._loadScheduleForDate(date, presetTime);
  },

  // ═══ Booking Form ═══
  openBooking(e) {
    var id = e.currentTarget.dataset.id;
    var v = this.data.venues.find(function(x){return x.id===id;});
    var today = this.data.bookingStartDate;
    this.setData({
      bookingVisible: true, bookingVenueId: id, bookingVenueName: v ? v.name : '',
      bookingStartDate: today, bookingStartDateDisplay: today, bookingEndDate: today, bookingEndDateDisplay: today,
      bookingTitle: '', bookingDesc: '', bookingTimeStart: '', bookingTimeEnd: '',
      timeStartInput: '', timeEndInput: '', timelineBlocks: [], timelineRange: null,
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
          this.setData({ timelineBlocks: [], timelineRange: null, _dayData: null });
        }
      } else { showShortToast(res.message || '加载时段失败'); }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  /** Process schedule data: build timeline and set smart defaults. */
  _applyDateSchedule(dayData, dateStr, presetTime) {
    var timeline = this._buildTimeline(dayData);
    var blockedMerged = buildBlockedIntervals(dayData);

    // Default start time
    var startTime = presetTime || '';
    if (!startTime) {
      startTime = findDefaultStart(dayData, dateStr);
    }

    // Default end time
    var endTime = '';
    if (startTime) {
      endTime = findDefaultEnd(timeToMin(startTime), blockedMerged);
    }

    this.setData({
      timelineBlocks: timeline,
      bookingTimeStart: startTime, bookingTimeEnd: endTime,
      timeStartInput: startTime, timeEndInput: endTime,
      _dayData: dayData
    });

    this._updateTimelineRange();
  },

  /** Build the 0-24h timeline bar with colors. Pending = blocked (same as booked). */
  _buildTimeline(dayData) {
    var openSlots = dayData.openSlots || [];
    var bookedSlots = dayData.bookedSlots || [];
    var activitySlots = dayData.activitySlots || [];
    var blocks = [];
    var t = 0;
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
            // pending = blocked, no distinction needed on timeline
            status = 'booked';
            break;
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
      return {
        left: ((b.startMin) / TOTAL_MIN * 100).toFixed(2),
        width: ((b.endMin - b.startMin) / TOTAL_MIN * 100).toFixed(2),
        status: b.status
      };
    });
  },

  /** Compute the selected range overlay + duration info. */
  _updateTimelineRange() {
    var st = this.data.bookingTimeStart;
    var et = this.data.bookingTimeEnd;
    if (!st || !et) {
      this.setData({ timelineRange: null, _durationText: '', _activeDuration: 0 });
      return;
    }
    var sm = timeToMin(st), em = timeToMin(et);
    if (em <= sm) { this.setData({ timelineRange: null, _durationText: '', _activeDuration: 0 }); return; }
    var dur = em - sm;
    var h = Math.floor(dur / 60), m = dur % 60;
    var durText = h > 0 ? (h + '小时' + (m > 0 ? m + '分钟' : '')) : (m + '分钟');
    this.setData({
      timelineRange: {
        left: (sm / TOTAL_MIN * 100).toFixed(2),
        width: ((em - sm) / TOTAL_MIN * 100).toFixed(2)
      },
      _durationText: durText,
      _activeDuration: dur
    });
  },

  // ── Date pickers ──
  onStartDateChange(e) {
    var d = e.detail.value;
    this.setData({
      bookingStartDate: d, bookingStartDateDisplay: d, bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeStart: '', bookingTimeEnd: '', timeStartInput: '', timeEndInput: '',
      timelineBlocks: [], timelineRange: null, _dayData: null
    });
    this._loadScheduleForDate(d);
  },

  onEndDateChange(e) {
    var d = e.detail.value;
    if (d < this.data.bookingStartDate) { showShortToast('结束日期不能早于开始日期'); return; }
    this.setData({ bookingEndDate: d, bookingEndDateDisplay: d });
  },

  // ── ★ Timeline tap → set start time ──
  onTimelineTap(e) {
    var self = this;
    var query = wx.createSelectorQuery().in(this);
    query.select('.timeline-bar').boundingClientRect();
    query.exec(function(rects) {
      if (!rects || !rects[0]) return;
      var x = e.detail.x;
      var width = rects[0].width;
      if (!width) return;
      var fraction = Math.max(0, Math.min(1, x / width));
      var totalMin = Math.round(fraction * TOTAL_MIN);
      var timeStr = minToTime(totalMin);
      self._validateAndSetStart(timeStr);
    });
  },

  /** Validate and set start time. Rejects if in blocked interval, past, or outside open hours. */
  _validateAndSetStart(timeStr) {
    var startMin = timeToMin(timeStr);
    var dateStr = this.data.bookingStartDate;
    var dayData = this.data._dayData;

    // 1. Past check
    var now = new Date();
    var today = fmtLocalDate(now);
    if (dateStr === today && startMin < now.getHours() * 60 + now.getMinutes()) {
      showShortToast('不能选择过去的时间'); return;
    }

    // 2. Must be within an open slot
    if (!dayData || !dayData.openSlots) { showShortToast('请先选择日期'); return; }
    var inOpen = false;
    var openSlots = dayData.openSlots;
    for (var oi = 0; oi < openSlots.length; oi++) {
      if (startMin >= timeToMin(openSlots[oi].timeStart) && startMin < timeToMin(openSlots[oi].timeEnd)) {
        inOpen = true; break;
      }
    }
    if (!inOpen) { showShortToast('该时间不在开放时段内'); return; }

    // 3. Must not be inside a blocked (booked/pending/activity) interval
    var blockedMerged = buildBlockedIntervals(dayData);
    for (var bi = 0; bi < blockedMerged.length; bi++) {
      if (startMin >= blockedMerged[bi].start && startMin < blockedMerged[bi].end) {
        showShortToast('该时段已被占用'); return;
      }
    }

    // Valid: set start, clear end
    this.setData({ bookingTimeStart: timeStr, timeStartInput: timeStr, bookingTimeEnd: '', timeEndInput: '' });
    this._updateTimelineRange();
    this._autoSetEnd();
  },

  /** Auto-set a smart end time after start changes. */
  _autoSetEnd() {
    var startMin = timeToMin(this.data.bookingTimeStart);
    var dayData = this.data._dayData;
    if (!dayData) return;
    var blockedMerged = buildBlockedIntervals(dayData);
    var endTime = findDefaultEnd(startMin, blockedMerged);
    if (endTime) {
      this.setData({ bookingTimeEnd: endTime, timeEndInput: endTime });
      this._updateTimelineRange();
    }
  },

  // ── ★ Time text inputs (minute precision) ──
  onTimeStartInput(e) { this.setData({ timeStartInput: e.detail.value }); },

  onTimeStartInputBlur() {
    var val = (this.data.timeStartInput || '').trim();
    if (!val) return;
    // Parse HH:MM or H:MM
    var match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      showShortToast('格式不正确，请使用 HH:MM');
      this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
      return;
    }
    var h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      showShortToast('时间范围不正确');
      this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
      return;
    }
    var timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    this._validateAndSetStart(timeStr);
    if (this.data.bookingTimeStart !== timeStr) {
      // _validateAndSetStart rejected it — revert display
      this.setData({ timeStartInput: this.data.bookingTimeStart || '' });
    }
  },

  onTimeEndInput(e) { this.setData({ timeEndInput: e.detail.value }); },

  onTimeEndInputBlur() {
    var val = (this.data.timeEndInput || '').trim();
    if (!val) return;
    var match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      showShortToast('格式不正确，请使用 HH:MM');
      this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
      return;
    }
    var h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      showShortToast('时间范围不正确');
      this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
      return;
    }
    var timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    this._validateAndSetEnd(timeStr);
    if (this.data.bookingTimeEnd !== timeStr) {
      this.setData({ timeEndInput: this.data.bookingTimeEnd || '' });
    }
  },

  /** Validate and set end time at minute precision. */
  _validateAndSetEnd(timeStr) {
    var endMin = timeToMin(timeStr);
    var startMin = timeToMin(this.data.bookingTimeStart);
    var dayData = this.data._dayData;

    if (!this.data.bookingTimeStart) { showShortToast('请先选择开始时间'); return; }
    if (endMin <= startMin) { showShortToast('结束时间必须晚于开始时间'); return; }

    if (dayData && dayData.openSlots) {
      // Must be within an open slot
      var inOpen = false;
      for (var oi = 0; oi < dayData.openSlots.length; oi++) {
        if (endMin > timeToMin(dayData.openSlots[oi].timeStart) && endMin <= timeToMin(dayData.openSlots[oi].timeEnd)) {
          inOpen = true; break;
        }
      }
      if (!inOpen) { showShortToast('结束时间不在开放时段内'); return; }

      // Range must not cross blocked intervals
      var openMerged = mergeIntervals(slotsToIntervals(dayData.openSlots));
      var gap = findOpenGap(startMin, endMin, openMerged);
      if (gap >= 0) {
        showShortToast(minToTime(gap) + ' 场地不开放');
        return;
      }
      var blockedMerged = buildBlockedIntervals(dayData);
      var conflict = findBlockedOverlap(startMin, endMin, blockedMerged);
      if (conflict) {
        showShortToast(minToTime(conflict.start) + ' 已被占用，无法跨越');
        return;
      }
    }

    this.setData({ bookingTimeEnd: timeStr, timeEndInput: timeStr });
    this._updateTimelineRange();
  },

  // ── ★ Quick duration chips ──
  onDurationTap(e) {
    var minutes = parseInt(e.currentTarget.dataset.minutes);
    if (!minutes) return;
    if (!this.data.bookingTimeStart) { showShortToast('请先选择开始时间'); return; }
    var startMin = timeToMin(this.data.bookingTimeStart);
    var endMin = startMin + minutes;
    if (endMin > TOTAL_MIN) endMin = TOTAL_MIN;
    var endTime = minToTime(endMin);
    this._validateAndSetEnd(endTime);
    this.setData({ timeEndInput: this.data.bookingTimeEnd || endTime });
  },

  // ── Other form ──
  onFieldInput(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value}); },

  async submitBooking() {
    var _a = this.data, vid = _a.bookingVenueId, sd = _a.bookingStartDate, ed = _a.bookingEndDate,
        st = _a.bookingTimeStart, et = _a.bookingTimeEnd, title = _a.bookingTitle, desc = _a.bookingDesc, dd = _a._dayData;
    if(!vid||!sd||!st||!et){showShortToast('请完整填写信息并选择时间段');return;}
    if(!title){showShortToast('请填写借用事由');return;}
    var now = new Date();
    var today = fmtLocalDate(now);
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

  /** Final validation before submit. Pending IS blocked. */
  _validateRange(dayData, sd, ed, st, et) {
    var openSlots = dayData ? (dayData.openSlots||[]) : [];
    var bookedSlots = dayData ? (dayData.bookedSlots||[]) : [];
    var activitySlots = dayData ? (dayData.activitySlots||[]) : [];
    var rs = timeToMin(st), re = timeToMin(et);

    // Must be within open hours
    var mo = mergeIntervals(slotsToIntervals(openSlots));
    var gap = findOpenGap(rs, re, mo);
    if(gap >= 0) {
      return minToTime(gap) + ' 场地不开放';
    }

    // Must not overlap any booked/pending/activity slot
    var mb = mergeIntervals([].concat(slotsToIntervals(bookedSlots), slotsToIntervals(activitySlots)));
    var conflict = findBlockedOverlap(rs, re, mb);
    if(conflict) {
      return minToTime(conflict.start) + ' 已被占用';
    }
    return null;
  },

  // ═══ Bookings ═══
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
