const venueManagementBehavior = require('./venueManagementBehavior');

Component({
  options: { styleIsolation: 'apply-shared' },
  behaviors: [venueManagementBehavior],
  properties: { embedded: { type: Boolean, value: true } },
  lifetimes: {
    attached() { this.managementLoad({}); this.managementShow(); },
    detached() { this.managementUnload(); this.triggerEvent('dialogchange', { visible: false, keyboardHeight: 0 }); }
  },
  pageLifetimes: {
    show() { this.managementShow(); },
    hide() { this.managementHide(); },
    resize() { this.applyNavigationBarMetrics(); }
  },
  observers: {
    'editing,rulesVisible,ruleEditorVisible,bookingApproverPickerVisible,scheduleVisible,occupiedPopupVisible,activityDetailVisible,bookingDetailVisible,adminBookingVisible,purposeVisible,condMultiPickerVisible,approvalPopupVisible,pendingDialogVisible,contextSwitchGuardVisible,dialogKeyboardHeight': function () {
      const visible = (this.data.dialogLockKeys || []).some(key => this.data[key] === true);
      this.triggerEvent('dialogchange', { visible, keyboardHeight: Number(this.data.dialogKeyboardHeight) || 0 });
    }
  }
});
