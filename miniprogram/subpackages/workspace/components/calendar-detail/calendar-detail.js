'use strict';
const copy = require('../../../../locales/zh-CN/calendar');
const view = require('../../package-resources/utils/calendarView');
const time = require('../../../../utils/dateTime');
const timeCopy = require('../../../../locales/zh-CN/time');
const messageCopy = require('../../../../locales/zh-CN/messageFacts');
const { callFunction, createResultError, getErrorText } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const scopes = ['instance', 'following', 'series'];
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { options: { type: Object, value: {} } },
  lifetimes: {
    attached: function() { this.initialize(this.properties.options); this.resume(); },
    detached: function() { this._disposed = true; this._visible = false; orgSession.invalidateRequests(this); }
  },
  pageLifetimes: { show: function() { if (!this._visible) this.resume(); }, hide: function() { this.suspend(); } },
  data: { copy, loading: false, busy: false, notice: '', detail: null, participantsExpanded: false,
    confirmation: false, action: '', scopeIndex: 0, scopeLabels: scopes.map(scope => copy[scope]), canAdd: false },
  methods: {
    initialize: function(options) {
      this._options = options;
      let canAdd = false;
      try { canAdd = ['ios', 'android'].includes(wx.getDeviceInfo().platform) && wx.canIUse('addPhoneCalendar'); } catch (_) {}
      this.setData({ canAdd });
    },
    resume: function() {
      if (orgSession.consume(this).changed && this._hasShown) { this.triggerEvent('close'); return; }
      this._hasShown = true; this._visible = true;
      if (this._saved) { this.triggerEvent('changed'); return; }
      if (!this.data.confirmation && !this._writeInFlight) this.load();
    },
    suspend: function() { this._visible = false; orgSession.invalidateRequests(this); this.setData({ loading: false }); },
    async load() {
      if (this._writeInFlight || this.data.confirmation) return;
      const request = orgSession.beginRequest(this, 'detail');
      const current = () => this._visible && orgSession.isRequestCurrent(this, request);
      this.setData({ loading: true, notice: '' });
      try {
        const config = await callFunction({ name: 'getCalendarConfiguration', data: {} });
        if (!current()) return;
        if (config.status !== 'success') throw createResultError(config, copy.operationFailed);
        const range = view.period(this._options.selected || this._options.date, this._options.mode || 'week', config.timezoneOffset);
        const result = await callFunction({ name: 'getCalendar', data: Object.assign({}, range, {
          managed: this._options.managed === true || this._options.managed === 'true',
          detailId: this._options.id, occurrenceDate: this._options.date
        }) });
        if (!current()) return;
        if (result.status !== 'success') throw createResultError(result, copy.operationFailed);
        const item = result.items.find(value => value.id === this._options.id && value.occurrenceDate === this._options.date);
        if (!item) { this.setData({ detail: null, participantsExpanded: false, loading: false, notice: copy.unavailable }); return; }
        const detail = Object.assign({}, item, {
          timeText: view.timeText(item, config.timezoneOffset, time, timeCopy, messageCopy),
          participants: item.participants || [],
          participantsTitle: copy.participantsCount.replace('{count}', String((item.participants || []).length))
        });
        this.setData({ detail, loading: false });
      } catch (error) {
        if (current()) this.setData({ detail: null, participantsExpanded: false, loading: false, notice: getErrorText(error, copy.operationFailed) });
      }
    },
    toggleParticipants: function() { if (this.data.detail) this.setData({ participantsExpanded: !this.data.participantsExpanded }); },
    edit: function() {
      const item = this.data.detail;
      if (!this.data.busy && item && item.canUpdate) this.triggerEvent('edit', { id: item.id, date: item.occurrenceDate });
    },
    confirm: function(e) {
      const item = this.data.detail, action = e.currentTarget.dataset.action;
      if (this.data.busy || !item || !['leave', 'cancel'].includes(action)) return;
      if (action === 'leave' ? !item.attending || item.visibility === 'private' : !item.canCancel) return;
      this._target = { id: item.id, version: item.version, occurrenceDate: item.occurrenceDate, action };
      this.setData({ confirmation: true, action, scopeIndex: 0, notice: '' });
    },
    cancel: function() { if (!this.data.busy) { this._target = null; this.setData({ confirmation: false, notice: '' }); } },
    close: function() { if (!this.data.busy) this.triggerEvent('close'); },
    dismiss: function() { if (this.data.confirmation) this.cancel(); else this.close(); },
    scope: function(e) { const scopeIndex = Number(e.detail.value); if (!this.data.busy && scopes[scopeIndex]) this.setData({ scopeIndex }); },
    noop: function() {},
    async execute() {
      if (this._writeInFlight || this.data.busy || !this.data.confirmation || !this._target) return;
      const data = Object.assign({}, this._target, { scope: scopes[this.data.scopeIndex] });
      const contextId = orgSession.getSnapshot().contextId;
      this._writeInFlight = true; this.setData({ busy: true, notice: '' });
      try {
        const result = await callFunction({ name: 'changeCalendarParticipation', data });
        if (this._disposed || contextId !== orgSession.getSnapshot().contextId) return;
        if (result.status !== 'success') throw createResultError(result, copy.operationFailed);
        this._saved = true; this._target = null;
        this.setData({ busy: false, confirmation: false });
        if (this._visible) this.triggerEvent('changed');
      } catch (error) {
        if (!this._disposed && contextId === orgSession.getSnapshot().contextId) this.setData({ notice: getErrorText(error, copy.operationFailed) });
      } finally { this._writeInFlight = false; if (!this._disposed) this.setData({ busy: false }); }
    },
    addPhone: function() {
      const item = this.data.detail;
      if (!item || !this.data.canAdd || this.data.busy) return;
      wx.addPhoneCalendar({ title: item.title, startTime: Math.floor(Date.parse(item.startAt) / 1000), endTime: String(Math.floor(Date.parse(item.endAt) / 1000)), allDay: item.allDay,
        description: item.description || '', location: item.location || '', alarm: (item.reminders || []).length > 0, alarmOffset: ((item.reminders || [])[0] || 0) * 60,
        success: () => { if (this._visible) this.setData({ notice: copy.added }); }, fail: () => { if (this._visible) this.setData({ notice: copy.unsupported }); } });
    }
  }
});
