const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const { buildFlowTimeline } = require('../../utils/flowTimeline');

const HOURS = ['00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','24:00'];
const HOUR_HEIGHT = 64;
const BASE_MIN = 0;
const HEADER_H = 58;
const TEXT_OFFSET = 22;

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
 * Build all half-hour time slots from daily schedule, annotated with status.
 */
function buildSlots(dayData, filterPast, dateStr) {
  var openSlots = dayData.openSlots || [];
  var bookedSlots = dayData.bookedSlots || [];
  var activitySlots = dayData.activitySlots || [];
  var slots = [];
  var now = new Date();
  var today = fmtLocalDate(now);
  var currentMin = now.getHours() * 60 + now.getMinutes();

  for (var min = 0; min < 24 * 60; min += 30) {
    var inOpen = false;
    for (var oi = 0; oi < openSlots.length; oi++) {
      if (min >= timeToMin(openSlots[oi].timeStart) && min + 30 <= timeToMin(openSlots[oi].timeEnd)) {
        inOpen = true; break;
      }
    }
    if (!inOpen) continue;

    var status = 'free';
    for (var bi = 0; bi < bookedSlots.length; bi++) {
      if (min < timeToMin(bookedSlots[bi].timeEnd) && min + 30 > timeToMin(bookedSlots[bi].timeStart)) {
        status = bookedSlots[bi].status === 'pending' ? 'pending' : 'booked'; break;
      }
    }
    if (status === 'free') {
      for (var ai = 0; ai < activitySlots.length; ai++) {
        if (min < timeToMin(activitySlots[ai].timeEnd) && min + 30 > timeToMin(activitySlots[ai].timeStart)) {
          status = 'activity'; break;
        }
      }
    }
    if (filterPast && dateStr === today && min < currentMin) continue;

    var hh = String(Math.floor(min / 60)).padStart(2, '0');
    var mm = String(min % 60).padStart(2, '0');
    slots.push({ time: hh + ':' + mm, min: min, status: status });
  }
  return slots;
}

/** Build human-readable labels for slot status */
var STATUS_LABELS = { free: '空闲', pending: '待审', booked: '已占', activity: '活动' };

/**
 * Build grid rows from slot list (each row = 4 slots for compact display).
 */
function slotsToGrid(slots, highlightTime) {
  var rows = [];
  var row = [];
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i];
    row.push({
      time: s.time,
      min: s.min,
      status: s.status,
      label: STATUS_LABELS[s.status] || s.status,
      active: s.time === highlightTime,
      selectable: s.status === 'free' || s.status === 'pending'
    });
    if (row.length === 4 || i === slots.length - 1) {
      rows.push(row);
      row = [];
    }
  }
  return rows;
}

/**
 * Find best default start time: first free/pending slot closest to now.
 */
function findDefaultStart(slots) {
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].status === 'free' || slots[i].status === 'pending') return slots[i];
  }
  return null;
}

/**
 * Find smart end time after startMin that avoids booking conflicts.
 * Strategy: startMin + 1h, rounded up to next 30min; if blocked, find next free segment start.
 */
function findSmartEnd(startMin, allSlots) {
  // Build blocked intervals (booked + activity only)
  var blocked = [];
  for (var i = 0; i < allSlots.length; i++) {
    if (allSlots[i].status === 'booked' || allSlots[i].status === 'activity') {
      blocked.push({ start: allSlots[i].min, end: allSlots[i].min + 30 });
    }
  }
  // Also include closed gaps (where consecutive slots have gaps)
  for (var i = 1; i < allSlots.length; i++) {
    if (allSlots[i].min > allSlots[i-1].min + 30) {
      blocked.push({ start: allSlots[i-1].min + 30, end: allSlots[i].min });
    }
  }
  var merged = mergeIntervals(blocked);

  // Find first free slot after startMin
  var ideal = startMin + 60; // 1 hour after
  // Round up to nearest 30
  ideal = Math.ceil(ideal / 30) * 30;

  // Check if ideal is in a free slot and doesn't cross any blocked
  var found = ideal;
  var maxSearch = 24 * 60;
  while (found <= maxSearch) {
    var conflict = findBlockedOverlap(startMin, found, merged);
    if (!conflict) {
      // Found a clean range
      var hh = String(Math.floor(found / 60)).padStart(2, '0');
      var mm = String(found % 60).padStart(2, '0');
      return hh + ':' + mm;
    }
    // Jump past this conflict
    found = conflict.end;
    // Realign to 30-min boundary
    found = Math.ceil(found / 30) * 30;
  }
  return '';
}

/**
 * Build end slot grid, filtering out slots that would create conflicts with startMin.
 * Each slot is annotated with whether it's selectable (no conflicts between startMin and slot.min).
 */
function buildEndSlotGrid(allSlots, startMin) {
  // Build blocked intervals
  var blocked = [];
  for (var i = 0; i < allSlots.length; i++) {
    if (allSlots[i].status === 'booked' || allSlots[i].status === 'activity') {
      blocked.push({ start: allSlots[i].min, end: allSlots[i].min + 30 });
    }
  }
  var merged = mergeIntervals(blocked);

  var result = [];
  for (var i = 0; i < allSlots.length; i++) {
    var s = allSlots[i];
    if (s.min <= startMin) continue; // must be after start

    var conflict = findBlockedOverlap(startMin, s.min, merged);
    result.push({
      time: s.time,
      min: s.min,
      status: s.status,
      label: STATUS_LABELS[s.status] || s.status,
      active: false,
      selectable: !conflict && (s.status === 'free' || s.status === 'pending'),
      blockedBy: conflict ? (conflict.start + '-' + conflict.end) : null
    });
  }
  return result;
}

/** Group end slots into rows of 4 */
function endSlotsToGrid(endSlots, highlightTime) {
  var rows = [];
  var row = [];
  for (var i = 0; i < endSlots.length; i++) {
    var s = endSlots[i];
    var item = Object.assign({}, s, { active: s.time === highlightTime });
    row.push(item);
    if (row.length === 4 || i === endSlots.length - 1) {
      rows.push(row);
      row = [];
    }
  }
  return rows;
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
    // ★ New: time grid data
    startGrid: [], endGrid: [],
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
      bookingTitle: '', bookingDesc: '', timelineBlocks: [], startGrid: [], endGrid: [],
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
      timeStartInput: '', timeEndInput: '', timelineBlocks: [], startGrid: [], endGrid: [],
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
          this.setData({ timelineBlocks: [], startGrid: [], endGrid: [], _dayData: null });
        }
      } else { showShortToast(res.message || '加载时段失败'); }
    } catch (e) { showShortToast(getErrorText(e, '加载失败')); }
    finally { wx.hideLoading(); }
  },

  /** Process schedule data: build timeline, time grids, and set smart defaults. */
  _applyDateSchedule(dayData, dateStr, presetTime) {
    var result = this._buildTimeline(dayData);
    var isToday = dateStr === fmtLocalDate(new Date());
    var allSlots = buildSlots(dayData, false, dateStr);
    var startSlots = buildSlots(dayData, true, dateStr);

    // Default start time
    var startTime = presetTime || '';
    if (!startTime && startSlots.length) {
      var defSlot = findDefaultStart(startSlots);
      if (defSlot) startTime = defSlot.time;
    }
    var startMin = timeToMin(startTime);

    // Default end time
    var endTime = '';
    if (startTime) {
      endTime = findSmartEnd(startMin, allSlots);
    }

    // Build grids
    var startGrid = slotsToGrid(startSlots, startTime);
    var endGrid = endSlotsToGrid(buildEndSlotGrid(allSlots, startMin), endTime);

    this.setData({
      timelineBlocks: result.timelineBlocks,
      startGrid: startGrid, endGrid: endGrid,
      bookingTimeStart: startTime, bookingTimeEnd: endTime,
      timeStartInput: startTime, timeEndInput: endTime,
      _dayData: dayData
    });
  },

  _buildTimeline(dayData) {
    var openSlots=dayData.openSlots||[], bookedSlots=dayData.bookedSlots||[], activitySlots=dayData.activitySlots||[];
    var blocks=[], t=0, totalMin=24*60;
    while(t+30<=24*60) {
      var inOpen=false, status='closed';
      for(var oi=0;oi<openSlots.length;oi++){if(t>=timeToMin(openSlots[oi].timeStart)&&t+30<=timeToMin(openSlots[oi].timeEnd)){inOpen=true;break;}}
      if(inOpen){status='free';
        for(var bi=0;bi<bookedSlots.length;bi++){if(t<timeToMin(bookedSlots[bi].timeEnd)&&t+30>timeToMin(bookedSlots[bi].timeStart)){status=bookedSlots[bi].status==='pending'?'pending':'booked';break;}}
        if(status==='free'){for(var ai=0;ai<activitySlots.length;ai++){if(t<timeToMin(activitySlots[ai].timeEnd)&&t+30>timeToMin(activitySlots[ai].timeStart)){status='activity';break;}}}
      }
      var last=blocks[blocks.length-1]; if(last&&last.status===status)last.endMin=t+30; else blocks.push({startMin:t,endMin:t+30,status:status});
      t+=30;
    }
    var timelineBlocks=blocks.map(function(b){return{left:((b.startMin)/totalMin*100).toFixed(2),width:((b.endMin-b.startMin)/totalMin*100).toFixed(2),status:b.status};});
    return {timelineBlocks:timelineBlocks};
  },

  // ── Date pickers ──
  onStartDateChange(e) {
    var d = e.detail.value;
    this.setData({
      bookingStartDate: d, bookingStartDateDisplay: d, bookingEndDate: d, bookingEndDateDisplay: d,
      bookingTimeStart: '', bookingTimeEnd: '', timeStartInput: '', timeEndInput: '',
      timelineBlocks: [], startGrid: [], endGrid: [], _dayData: null
    });
    this._loadScheduleForDate(d);
  },

  onEndDateChange(e) {
    var d = e.detail.value;
    if (d < this.data.bookingStartDate) { showShortToast('结束日期不能早于开始日期'); return; }
    this.setData({ bookingEndDate: d, bookingEndDateDisplay: d, bookingTimeEnd: '', timeEndInput: '', endGrid: [] });
    if (d === this.data.bookingStartDate) {
      // Same date: rebuild end grid with start day data
      this._rebuildEndGrid();
    }
  },

  // ── ★ Time slot grid tap ──
  onStartSlotTap(e) {
    var time = e.currentTarget.dataset.time;
    var status = e.currentTarget.dataset.status;
    if (!time) return;
    if (status !== 'free' && status !== 'pending') {
      showShortToast(status === 'booked' ? '该时段已被占用' : (status === 'activity' ? '该时段有活动' : '该时段不可选'));
      return;
    }
    var dateStr = this.data.bookingStartDate;
    var now = new Date();
    var today = fmtLocalDate(now);
    if (dateStr === today) {
      var currentMin = now.getHours() * 60 + now.getMinutes();
      if (timeToMin(time) < currentMin) { showShortToast('不能选择过去的时间'); return; }
    }
    this.setData({ bookingTimeStart: time, timeStartInput: time });
    // Clear end time and rebuild
    this.setData({ bookingTimeEnd: '', timeEndInput: '', endGrid: [] });
    this._rebuildEndGrid();
  },

  onEndSlotTap(e) {
    var time = e.currentTarget.dataset.time;
    var selectable = e.currentTarget.dataset.selectable;
    if (!time) return;
    if (!selectable) { showShortToast('该时段与已占用时间冲突'); return; }
    var startMin = timeToMin(this.data.bookingTimeStart);
    if (timeToMin(time) <= startMin) { showShortToast('结束时间必须晚于开始时间'); return; }
    this.setData({ bookingTimeEnd: time, timeEndInput: time });
    // Highlight selected in grid
    var endGrid = this.data.endGrid;
    for (var ri = 0; ri < endGrid.length; ri++) {
      for (var ci = 0; ci < endGrid[ri].length; ci++) {
        endGrid[ri][ci].active = endGrid[ri][ci].time === time;
      }
    }
    this.setData({ endGrid: endGrid });
  },

  /** Rebuild end grid based on current start time and day data. */
  _rebuildEndGrid() {
    var dayData = this.data._dayData;
    if (!dayData) return;
    var startMin = timeToMin(this.data.bookingTimeStart);
    if (startMin < 0) return;
    var allSlots = buildSlots(dayData, false, '');
    var endSlots = buildEndSlotGrid(allSlots, startMin);
    var endGrid = endSlotsToGrid(endSlots, '');

    // Smart default
    var endTime = '';
    if (!this.data.bookingTimeEnd || timeToMin(this.data.bookingTimeEnd) <= startMin) {
      endTime = findSmartEnd(startMin, allSlots);
    } else {
      endTime = this.data.bookingTimeEnd;
      // Verify current end is still valid
      var stillValid = endSlots.some(function(s) { return s.time === endTime && s.selectable; });
      if (!stillValid) endTime = findSmartEnd(startMin, allSlots);
    }

    // Highlight
    if (endTime) {
      for (var ri = 0; ri < endGrid.length; ri++) {
        for (var ci = 0; ci < endGrid[ri].length; ci++) {
          endGrid[ri][ci].active = endGrid[ri][ci].time === endTime;
        }
      }
    }

    this.setData({ endGrid: endGrid, bookingTimeEnd: endTime, timeEndInput: endTime });
  },

  // ── Text input for custom time ──
  onTimeStartInput(e) { this.setData({ timeStartInput: e.detail.value }); },
  onTimeStartInputBlur() {
    var val = (this.data.timeStartInput || '').trim();
    if (!val) return;
    var match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) { showShortToast('格式不正确，请使用 HH:MM（如 14:30）'); this.setData({ timeStartInput: this.data.bookingTimeStart || '' }); return; }
    var h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) { showShortToast('时间范围不正确'); this.setData({ timeStartInput: this.data.bookingTimeStart || '' }); return; }
    m = Math.round(m / 30) * 30;
    if (m >= 60) { h++; m = 0; }
    if (h >= 24) { showShortToast('时间不能超过 23:59'); return; }
    var timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

    // Validate not past
    var dateStr = this.data.bookingStartDate;
    var now = new Date();
    var today = fmtLocalDate(now);
    if (dateStr === today && timeToMin(timeStr) < now.getHours() * 60 + now.getMinutes()) {
      showShortToast('不能选择过去的时间'); this.setData({ timeStartInput: this.data.bookingTimeStart || '' }); return;
    }

    // Validate in open hours
    var allSlots = buildSlots(this.data._dayData || {}, true, dateStr);
    if (allSlots.length && !allSlots.some(function(s){return s.time===timeStr&&(s.status==='free'||s.status==='pending');})) {
      showShortToast('该时段场地不开放或已被占用'); this.setData({ timeStartInput: this.data.bookingTimeStart || '' }); return;
    }

    this.setData({ timeStartInput: timeStr, bookingTimeStart: timeStr, bookingTimeEnd: '', timeEndInput: '', endGrid: [] });
    this._rebuildEndGrid();
  },

  onTimeEndInput(e) { this.setData({ timeEndInput: e.detail.value }); },
  onTimeEndInputBlur() {
    var val = (this.data.timeEndInput || '').trim();
    if (!val) return;
    var match = val.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) { showShortToast('格式不正确，请使用 HH:MM（如 15:30）'); this.setData({ timeEndInput: this.data.bookingTimeEnd || '' }); return; }
    var h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) { showShortToast('时间范围不正确'); this.setData({ timeEndInput: this.data.bookingTimeEnd || '' }); return; }
    m = Math.round(m / 30) * 30;
    if (m >= 60) { h++; m = 0; }
    if (h >= 24) { showShortToast('时间不能超过 23:59'); return; }
    var timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

    var startMin = timeToMin(this.data.bookingTimeStart);
    if (timeToMin(timeStr) <= startMin) { showShortToast('结束时间必须晚于开始时间'); this.setData({ timeEndInput: this.data.bookingTimeEnd || '' }); return; }

    // Check no booking conflict
    var dayData = this.data._dayData;
    if (dayData) {
      var allSlots = buildSlots(dayData, false, '');
      var endSlots = buildEndSlotGrid(allSlots, startMin);
      var found = endSlots.find(function(s){return s.time===timeStr;});
      if (found && !found.selectable) { showShortToast('该时段与已占用时间冲突'); this.setData({ timeEndInput: this.data.bookingTimeEnd || '' }); return; }
    }

    this.setData({ timeEndInput: timeStr, bookingTimeEnd: timeStr });
    // Update grid highlight
    var endGrid = this.data.endGrid;
    for (var ri = 0; ri < endGrid.length; ri++) {
      for (var ci = 0; ci < endGrid[ri].length; ci++) {
        endGrid[ri][ci].active = endGrid[ri][ci].time === timeStr;
      }
    }
    this.setData({ endGrid: endGrid });
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

  _validateRange(dayData, sd, ed, st, et) {
    var openSlots = dayData ? (dayData.openSlots||[]) : [];
    var bookedSlots = dayData ? (dayData.bookedSlots||[]) : [];
    var activitySlots = dayData ? (dayData.activitySlots||[]) : [];
    var rs = timeToMin(st), re = timeToMin(et);
    var mo = mergeIntervals(slotsToIntervals(openSlots));
    var gap = findOpenGap(rs, re, mo);
    if(gap >= 0) { var gh=String(Math.floor(gap/60)).padStart(2,'0'), gm=String(gap%60).padStart(2,'0'); return gh+':'+gm+' 场地不开放'; }
    var mb = mergeIntervals([].concat(slotsToIntervals(bookedSlots), slotsToIntervals(activitySlots)));
    var conflict = findBlockedOverlap(rs, re, mb);
    if(conflict) { var ch=String(Math.floor(conflict.start/60)).padStart(2,'0'), cm=String(conflict.start%60).padStart(2,'0'); return ch+':'+cm+' 已被占用'; }
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
