'use strict';

const { authorizationError } = require('../services/authorizationError');

// 已逐个核对为410的旧入口，不视为待接入功能，也不在切换时重新开放。
const RETIRED = new Set([
  '/saveResultViewPermission', '/deleteResultViewPermission', '/saveMeritListPermission', '/deleteMeritListPermission',
  '/removeMeritListDesignation', '/listPubViewRules', '/listPubMeritRules',
  '/listMembershipAssignments', '/listFormerHrMembers', '/importHrCsv', '/saveHrProfileTemplate',
  '/saveStampAssignments', '/listIdentityStamps', '/verifyAuditFile',
  '/getVenueApprovalFlow', '/saveVenueApprovalFlow', '/saveVenueApprovalStep', '/deleteVenueApprovalStep',
  '/saveVenueApprovalStepRule', '/deleteVenueApprovalStepRule', '/approveVenueBookingAdmin', '/rejectVenueBookingAdmin',
  '/listUserBindings', '/createAdminInvite', '/generateAdminInviteCode', '/adminUnbindUser'
]);

// 只有已在业务写事务中复核完整新授权的入口，才允许跳过旧管理员入口限制。
const ADAPTED = new Set(['/saveVenueBookingPurpose', '/deleteVenueBookingPurpose',
  '/getSystemConfig', '/saveSystemConfig',
  '/admin/health',
  '/listOrganizations', '/saveOrganization', '/deleteOrganization', '/switchOrganization',
  '/listAdmins', '/saveAdmin', '/deleteAdmin', '/exportAdmins', '/getAdminAccountCandidates',
  '/parseTableFile', '/buildTableFile',
  '/admin/auth/claims', '/admin/auth/recoveries', '/admin/auth/accounts',
  '/admin/auth/security', '/admin/auth/security/sessions/revoke',
  '/admin/auth/security/passphrase', '/admin/auth/security/passphrase/revoke',
  '/admin/auth/policy', '/admin/auth/audit',
  '/previewPersonIdentityCorrection', '/applyPersonIdentityCorrection', '/mergePersons', '/unbindHrWechat',
  '/listHrInfo', '/listHrProfileAdminData', '/getHrPersonDetail', '/saveHrPersonFull', '/reviewHrProfileChange',
  '/getHrImportPreview', '/getHrImportResult', '/exportHrImportIssues', '/getHrImportMetadata', '/previewHrTableImport', '/importHrTable',
  '/exportHrAssignmentTable',
  '/saveHrInfo', '/deleteHrInfo', '/reactivateHrMembership',
  '/listHrGovernance',
  '/listPersonIdentities', '/batchMaintainFromHrInfo',
  '/previewHrMemberDeletion', '/deleteHrMembershipPermanently',
  '/deletePersonPermanently',
  '/listHrProfileTemplates', '/saveHrProfileTemplateDefinition', '/duplicateHrProfileTemplateDefinition', '/deleteHrProfileTemplateDefinition',
  '/getHrProfileTemplateSwitchContext', '/previewHrProfileTemplateSwitch', '/applyHrProfileTemplateSwitch', '/saveOrgHrProfileTemplateSettings',
  '/getCrossOrgMigrationContext', '/previewCrossOrgMigration', '/applyCrossOrgMigration', '/submitCrossOrgMigrationRequest',
  '/reviewCrossOrgMigrationRequest', '/cancelCrossOrgMigrationRequest', '/listCrossOrgMigrationRequests', '/getPersonOrgProfiles',
  '/listVenueBookingPurposes',
  '/saveMembershipAssignment', '/deleteMembershipAssignment',
  '/saveDepartment', '/deleteDepartment', '/saveIdentity', '/deleteIdentity', '/saveWorkGroup', '/deleteWorkGroup',
  '/listScoreTemplates', '/saveScoreTemplate', '/deleteScoreTemplate', '/duplicateScoreTemplate',
  '/listRateRules', '/saveRateRule', '/batchSaveRateRules', '/deleteRateRule', '/generateRateTargetRules',
  '/listScoreActivities', '/saveScoreActivity', '/deleteScoreActivity', '/toggleActivityPause', '/setCurrentScoreActivity',
  '/getCurrentScoreActivity', '/getLatestPublishedScoreActivity',
  '/getScoreResults', '/exportScoreResults', '/getScorerTaskStatus', '/exportScorerTaskStatus',
  '/saveResultPublication', '/getResultPublication',
  '/getMeritListSummary', '/exportMeritListSummary',
  '/saveMeritListDesignations',
  '/generatePubViewRules', '/generatePubMeritRules',
  '/savePubViewRule', '/batchSavePubViewRules', '/deletePubViewRule', '/batchDeletePubViewRules',
  '/savePubMeritRule', '/batchSavePubMeritRules', '/deletePubMeritRule', '/batchDeletePubMeritRules',
  '/getVenueRuleCandidates', '/saveVenueBookingWindow', '/listVenueOpenRules', '/saveVenueOpenRule', '/deleteVenueOpenRule',
  '/listVenues', '/saveVenue', '/deleteVenue',
  '/listAllVenueBookings',
  '/createAdminVenueBooking',
  '/getVenueSchedule',
  '/approveVenueBooking', '/rejectVenueBooking', '/approveVenueBookingStep', '/rejectVenueBookingStep',
  '/listPendingVenueApprovals',
  '/listVenueApprovalHistory', '/getVenueApprovalHistoryDetail',
  '/listVenueActivityRules', '/saveVenueActivityRule', '/deleteVenueActivityRule',
  '/getAuditTemplateEditorData', '/listAuditFlowTemplates', '/saveAuditFlowTemplate', '/deleteAuditFlowTemplate',
  '/listStamps', '/saveStamp', '/deleteStamp', '/listStampCandidates', '/saveStampGrants',
  '/listAuditVerificationCandidates', '/listVerificationPermissions', '/saveVerificationPermission',
  '/listAllAuditSubmissions', '/getAuditProgress', '/getSubmissionDetail',
  '/getAuditVerificationAccess', '/verifySignatureChain', '/getAuditFile', '/downloadAuditFile', '/getAuditFilePreview',
  '/getContactDirectoryConfiguration', '/saveContactDirectoryRule', '/batchContactDirectoryRules',
  '/getCalendarRules', '/saveCalendarRule', '/batchCalendarRules',
  '/listVenueBookingRules', '/saveVenueBookingRule', '/deleteVenueBookingRule', '/listVenueApprovalFlows',
  '/saveVenueApprovalWholeFlow', '/saveVenueApprovalFlowMeta', '/deleteVenueApprovalFlow',
  '/previewAuditSubmissionDeletion', '/deleteAuditSubmission', '/previewVenueBookingDeletion', '/deleteVenueBooking', '/revokeScoreRecord']);

async function isEnforced(path, organizationId) {
  // 模式检查不能以适配清单为前提：启用后遗漏的旧入口也不得回退到旧权限放行。
  if (!organizationId) return false;
  const pool = require('../../config/db');
  const [rows] = await pool.query('SELECT mode FROM authorization_organizations WHERE org_id = ?', [organizationId]);
  if (!rows.length || rows[0].mode === 'shadow') return false;
  if (rows[0].mode !== 'enforced') throw authorizationError('authorization_mode_invalid');
  return true;
}

async function requireLegacyWrite(connection, organizationId) {
  // 与新授权的账号/组织校验采用相同先后顺序；同时保护首次初始化和既有模式行。
  const [organizations] = await connection.query('SELECT id FROM organizations WHERE id=? FOR UPDATE', [organizationId]);
  if (!organizations.length) throw authorizationError('authorization_forbidden');
  await connection.query('INSERT IGNORE INTO authorization_organizations (org_id) VALUES (?)', [organizationId]);
  // 字典写入触发器也会更新此行；预先取得写锁，避免并发请求持有共享锁后相互等待升级。
  const [rows] = await connection.query('SELECT mode FROM authorization_organizations WHERE org_id=? FOR UPDATE', [organizationId]);
  if (rows[0]?.mode !== 'shadow') throw authorizationError('authorization_forbidden');
}

module.exports = { isAdapted: path => ADAPTED.has(path), isRetired: path => RETIRED.has(path), isEnforced, requireLegacyWrite };
