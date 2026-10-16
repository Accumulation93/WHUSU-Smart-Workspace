'use strict';

// 明确列出动作边界，不按路由名称猜测权限。旧管理权限不自动获得新增删除权限。
const ACTION_GROUPS = [
  { base: 'scoring.activities', read: ['/listScoreActivities', '/getCurrentScoreActivity'], remove: ['/deleteScoreActivity'] },
  { base: 'scoring.templates', read: ['/listScoreTemplates'], remove: ['/deleteScoreTemplate'] },
  { base: 'scoring.rules', read: ['/listRateRules', '/listScoreActivities', '/getCurrentScoreActivity', '/listScoreTemplates'], remove: ['/deleteRateRule'] },
  { base: 'scoring.publications', read: ['/listScoreActivities', '/getCurrentScoreActivity', '/getResultPublication', '/listPubViewRules', '/listPubMeritRules', '/getMeritListSummary'], remove: ['/deleteResultViewPermission', '/deleteMeritListPermission', '/removeMeritListDesignation', '/deletePubViewRule', '/batchDeletePubViewRules', '/deletePubMeritRule', '/batchDeletePubMeritRules'] },
  { base: 'hr.people', read: ['/listHrInfo', '/listMembershipAssignments', '/listFormerHrMembers', '/listPersonIdentities', '/listHrProfileAdminData', '/getHrPersonDetail'], remove: ['/previewHrMemberDeletion', '/deleteHrMembershipPermanently', '/deletePersonPermanently'] },
  { base: 'hr.profile_templates.manage', read: ['/listHrProfileTemplates'], remove: ['/deleteHrProfileTemplateDefinition'] },
  { base: 'hr.departments', read: [], remove: ['/deleteDepartment'] },
  { base: 'hr.identities', read: [], remove: ['/deleteIdentity'] },
  { base: 'hr.work_groups', read: [], remove: ['/deleteWorkGroup'] },
  { base: 'audit.templates', read: ['/listAuditFlowTemplates', '/getAuditTemplateEditorData'], remove: ['/deleteAuditFlowTemplate'] },
  { base: 'audit.stamps', read: ['/listStamps', '/listIdentityStamps', '/listStampCandidates'], remove: ['/deleteStamp'] },
  { base: 'venue.resources', read: ['/listVenues', '/listVenueOpenRules', '/listVenueActivityRules', '/getVenueSchedule'], remove: ['/deleteVenue', '/deleteVenueOpenRule', '/deleteVenueActivityRule'] },
  { base: 'venue.approvals', read: ['/listVenues', '/listVenueOpenRules', '/listVenueActivityRules', '/getVenueSchedule', '/listVenueBookingRules', '/getVenueApprovalFlow', '/listVenueApprovalFlows'], remove: ['/deleteVenueBookingRule', '/deleteVenueApprovalFlow', '/deleteVenueApprovalStep', '/deleteVenueApprovalStepRule'] },
  { base: 'venue.purposes', read: ['/listVenueBookingPurposes'], remove: ['/deleteVenueBookingPurpose'] }
];

module.exports = { ACTION_GROUPS };
