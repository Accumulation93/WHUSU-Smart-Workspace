const adminWorkbenchBehavior = require('./adminWorkbenchBehavior');

Component({
  options: { styleIsolation: 'apply-shared' },
  behaviors: [adminWorkbenchBehavior],
  data: { embeddedWorkbench: true },
  properties: { subApp: { type: String, value: 'scoring' } },
  lifetimes: {
    attached() { this.workbenchLoad({ subApp: this.data.subApp }); this._workbenchShowing = true; this.workbenchShow(); },
    detached() { this._workbenchShowing = false; this.workbenchUnload(); this.triggerEvent('dialogchange', { visible: false, keyboardHeight: 0 }); }
  },
  pageLifetimes: {
    show() { if (!this._workbenchShowing) { this._workbenchShowing = true; this.workbenchShow(); } },
    hide() { this._workbenchShowing = false; this.workbenchHide(); },
    resize() { this.applyNavigationBarMetrics(); }
  },
  observers: {
    'adminCandidatePickerVisible,directoryPickerVisible,dragActive,showTemplateCsvDialog,hrProfileExportVisible,hrTemplateSwitchVisible,hrTemplateSwitchBlockVisible,crossOrgMigrationVisible,showHrPersonDetail,hrPermanentDeletionVisible,profileRejectVisible,personCorrectionVisible,showCsvMappingDialog,showHrImportPreview,showValidationErrors,auditTemplateStepEditorVisible,auditStarterConditionEditorVisible,auditSubmissionDetailVisible,auditMultiPickerVisible,auditPersonnelPickerVisible,auditIdentityPickerVisible,showDesignationPicker,orgFormVisible,scorerTargetPopupVisible,recordDetailPopupVisible,contextSwitchGuardVisible,identityActionConfirmVisible,adminDeleteConfirmVisible,showAuthCodeDialog,showAuthRecoveryDialog,authMemberConfirmVisible,stampGrantVisible,dictionaryUsageDialog.visible,dialogKeyboardHeight': function () {
      const data = this.data;
      const visible = Boolean(data.adminCandidatePickerVisible || data.directoryPickerVisible || data.dragActive || data.showTemplateCsvDialog || data.hrProfileExportVisible
        || data.hrTemplateSwitchVisible || data.hrTemplateSwitchBlockVisible || data.crossOrgMigrationVisible || data.showHrPersonDetail
        || data.hrPermanentDeletionVisible || data.profileRejectVisible || data.personCorrectionVisible || data.showCsvMappingDialog
        || data.showHrImportPreview || data.showValidationErrors || data.auditTemplateStepEditorVisible || data.auditStarterConditionEditorVisible
        || data.auditSubmissionDetailVisible || data.auditMultiPickerVisible || data.auditPersonnelPickerVisible || data.auditIdentityPickerVisible
        || data.showDesignationPicker || data.orgFormVisible || data.scorerTargetPopupVisible || data.recordDetailPopupVisible
        || data.contextSwitchGuardVisible || data.identityActionConfirmVisible || data.adminDeleteConfirmVisible || data.showAuthCodeDialog
        || data.showAuthRecoveryDialog || data.authMemberConfirmVisible || data.stampGrantVisible || data.dictionaryUsageDialog.visible);
      this.triggerEvent('dialogchange', { visible, keyboardHeight: Number(data.dialogKeyboardHeight) || 0 });
    }
  }
});
