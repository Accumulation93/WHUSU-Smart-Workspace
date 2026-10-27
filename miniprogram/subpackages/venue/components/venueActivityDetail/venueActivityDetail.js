const localeCopy = require('../../package-resources/locales/zh-CN/generated/subpackages/venue/pages/venueManage/venueManage');
function recurrenceLabel(activity) {
  if (!activity) return '';
  let values = activity.cycleValues || {};
  if (typeof values === 'string') { try { values = JSON.parse(values); } catch (_) { return ''; } }
  const days = Array.isArray(values) ? values : values.values || [];
  const names = [localeCopy.copy_92af9d9017, localeCopy.copy_e3233a4b58, localeCopy.copy_2f48862253, localeCopy.copy_017e3df1a1, localeCopy.copy_41a9548e60, localeCopy.copy_f2c74088c9, localeCopy.copy_a814b25100];
  if (['daily', 'repeat', 'datetime_range'].includes(activity.cycleType)) return localeCopy.copy_13293d504a;
  if (!Array.isArray(days)) return '';
  if (activity.cycleType === 'weekly') return days.map(day => names[Number(day) - 1]).filter(Boolean).join('、');
  if (activity.cycleType === 'monthly') return localeCopy.copy_06a9527bac + days.join('、') + localeCopy.copy_168587d3a1;
  if (activity.cycleType === 'yearly') return days.map(day => day.m + localeCopy.copy_438913e441 + (day.dStart || day.d) + (day.dEnd === undefined ? '' : localeCopy.copy_05302eb150 + day.dEnd) + localeCopy.copy_168587d3a1).join('、');
  return '';
}
Component({
  properties: { activity: { type: Object, value: null } }, data: { localeCopy, recurrence: '' },
  observers: { activity: function(activity) { this.setData({recurrence:recurrenceLabel(activity)},()=>this.measureLayout()); } },
  lifetimes: { ready: function() { this._layoutReady=true;this.measureLayout(); }, detached: function() { this._layoutReady=false; } },
  pageLifetimes: { resize: function() { this.measureLayout(); } },
  methods: {
    measureLayout: function() {
      if(!this._layoutReady)return;
      wx.nextTick(()=>{if(!this._layoutReady)return;this.createSelectorQuery().select('.activity-detail').boundingClientRect(rect=>{
        if(this._layoutReady&&rect&&rect.height>0)this.triggerEvent('layout',{height:Math.ceil(rect.height)});
      }).exec();});
    }
  }
});
