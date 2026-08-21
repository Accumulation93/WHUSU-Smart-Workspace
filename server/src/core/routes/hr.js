const localeCopy = require('../../locales/zh-CN/generated/core/routes/hr');
const personnelCopy = require('../../locales/zh-CN/core/personnel');
const { format: localeFormat } = require('../../locales/runtime');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { parseCsv } = require('../../utils/csv');
const { getCurrentOrgId } = require('../../utils/orgContext');
const { resolveHrBindingStates } = require('../services/userBindingStatus');
const { unbindUserAcrossOrganizations } = require('../services/userBindingUnbind');
const { clearOrgAccessCache } = require('../../middleware/orgContext');
const unifiedIdentityModel = require('../models/unifiedIdentity');
const personIdentityOverviewModel = require('../models/personIdentityOverview');
const personGovernanceModel = require('../models/personGovernance');
const {
  AdminOrganizationAccessError,
  listAdminOrganizationAccess,
  requireAdminOrganizationPermission
} = require('../services/adminOrganizationAccess');

const EMPTY_VALUE_ALIASES = ['null', 'NULL', 'Null', '无', '空', 'N/A', 'NA', 'n/a', 'na', '-', '—', 'none', 'None', '/', '\\'];

function normalizeEmptyValue(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  if (EMPTY_VALUE_ALIASES.includes(v)) return '';
  return v;
}
const hrInfoModel = require('../models/hrInfo');

const departmentModel = require('../models/department');
const identityModel = require('../models/identity');
const workGroupModel = require('../models/workGroup');
const adminInfoModel = require('../models/adminInfo');
const profileTemplateModel = require('../models/hrProfileTemplate');
const profileFieldModel = require('../models/hrProfileField');
const personProfileValueModel = require('../models/personProfileValue');
const hrTableImportModel = require('../models/hrTableImport');
const pool = require('../../config/db');

function authenticationStatus(row) {
  const accountStatus = safeString(row.account_status);
  if (accountStatus === 'frozen') return { value: 'frozen', label: localeCopy.copy_ddaba44b59 };
  if (accountStatus === 'recovery_required') return { value: 'recovery_required', label: localeCopy.copy_16399ef078 };
  if (accountStatus === 'verified' && Boolean(row.has_active_binding)) {
    return { value: 'verified', label: localeCopy.copy_17d26b7956 };
  }
  return { value: 'pending_verification', label: localeCopy.copy_5342fa4b24 };
}

function tryParseDate(rawValue) {
  const value = (rawValue == null ? '' : String(rawValue)).trim();
  if (!value) return null;
  let match = value.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    let year = parseInt(match[1], 10);
    let month = parseInt(match[2], 10);
    let day = parseInt(match[3], 10);
    if (month >= 1 && month <= 12 && day >= 1) {
      let daysInMonth = new Date(year, month, 0).getDate();
      if (day <= daysInMonth) {
        return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }
    }
    return null;
  }
  let d = new Date(value);
  if (isNaN(d.getTime())) {
    d = new Date(value.replace(' ', 'T'));
  }
  if (!isNaN(d.getTime()) && d.getUTCFullYear() > 1900) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  return null;
}

function validateFieldValue(field, rawValue) {
  const value = normalizeEmptyValue(rawValue);
  if (!value) return '';
  if (field.type === 'text') {
    if (field.minLength != null && value.length < field.minLength) return localeFormat(localeCopy.copy_bff02f531d, [field.label, field.minLength]);
    if (field.maxLength != null && value.length > field.maxLength) return localeFormat(localeCopy.copy_1364ec67c8, [field.label, field.maxLength]);
    return '';
  }
  if (field.type === 'number') {
    if (field.allowDecimal === false && !/^[+-]?\d+$/.test(value)) return localeFormat(localeCopy.copy_25da4c9917, [field.label]);
    const num = Number(value);
    if (!Number.isFinite(num)) return localeFormat(localeCopy.copy_803a916bfb, [field.label]);
    if (field.numberRule === 'length_range') {
      const nlen = String(value).replace(/^[+-]/, '').replace('.', '').length;
      if (field.minDigits != null && nlen < field.minDigits) return localeFormat(localeCopy.copy_2cf6664a49, [field.label, field.minDigits]);
      if (field.maxDigits != null && nlen > field.maxDigits) return localeFormat(localeCopy.copy_503bd17961, [field.label, field.maxDigits]);
    } else {
      if (field.minValue != null && num < field.minValue) return localeFormat(localeCopy.copy_946df9f612, [field.label, field.minValue]);
      if (field.maxValue != null && num > field.maxValue) return localeFormat(localeCopy.copy_d8d00225f1, [field.label, field.maxValue]);
    }
    return '';
  }
  if (field.type === 'sequence') { if (field.options.length && field.options.indexOf(value) === -1) return localeFormat(localeCopy.copy_02808711c5, [field.label]); return ''; }
  if (field.type === 'date' && !tryParseDate(value)) return localeFormat(localeCopy.copy_c8aa4ca152, [field.label]);
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) return localeFormat(localeCopy.copy_e840878ac4, [field.label]);
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return localeFormat(localeCopy.copy_f117197c23, [field.label]);
  return '';
}

const TEMPLATE_KEY = 'default_hr_profile_template';

// listHrInfo
router.post('/listHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const orgId = await getCurrentOrgId();
    const [rows] = await pool.query(
      `SELECT h.*, d.name as department_name, i.name as identity_name, wg.name as work_group_name
       FROM hr_info h
       LEFT JOIN departments d ON h.department_id = d.id AND d.org_id = ?
       LEFT JOIN identities i ON h.identity_id = i.id AND i.org_id = ?
       LEFT JOIN work_groups wg ON h.work_group_id = wg.id AND wg.org_id = ?
       WHERE h.org_id = ?
         AND EXISTS (
           SELECT 1 FROM organization_memberships om
            WHERE om.legacy_hr_id = h.id AND om.org_id = h.org_id AND om.status = 'active'
         )
       ORDER BY h.name`,
      [orgId, orgId, orgId, orgId]
    );
    const [bindingStates, assignmentSummaries] = await Promise.all([
      resolveHrBindingStates(rows, orgId),
      unifiedIdentityModel.listMembershipAssignmentSummaries(rows.map((item) => item.id), orgId)
    ]);
    const list = rows.map((item) => {
      const binding = bindingStates.get(safeString(item.id)) || {
        status: 'unbound',
        userInfoId: '',
        boundOpenid: ''
      };
      const assignmentSummary = assignmentSummaries.get(safeString(item.id)) || {
        count: 0,
        assignments: []
      };
      return {
        id: item.id,
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        departmentId: safeString(item.department_id),
        department: safeString(item.department_name),
        identityId: safeString(item.identity_id),
        identity: safeString(item.identity_name),
        workGroupId: safeString(item.work_group_id),
        workGroup: safeString(item.work_group_name),
        assignmentCount: assignmentSummary.count,
        assignments: assignmentSummary.assignments,
        userInfoId: binding.userInfoId,
        boundOpenid: binding.boundOpenid ? safeString(binding.boundOpenid).slice(0, 8) + '***' : '',
        bindStatus: binding.status
      };
    });
    res.json({ status: 'success', list });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// 人事信息页统一目录：资料、认证、账号与恢复共用同一份人员数据。
router.post('/listHrGovernance', async (req, res) => {
  try {
    const accessList = await listAdminOrganizationAccess(req);
    const readable = accessList.filter((item) => (
      item.canReadAssignments || item.canReadPeople
       || item.permissionKeys && item.permissionKeys.some((key) => [
         'auth.identity.verify', 'auth.accounts.recover', 'auth.accounts.global_manage', 'auth.policy.manage'
      ].indexOf(key) >= 0)
    ));
    if (!readable.length) return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_828e7e4bfb });
    const requestedOrgId = safeString(req.body && req.body.organizationId);
    const allowedIds = Array.from(new Set(readable.map((item) => safeString(item.organizationId)).filter(Boolean)));
    const organizationIds = requestedOrgId
      ? (allowedIds.indexOf(requestedOrgId) >= 0 ? [requestedOrgId] : [])
      : allowedIds;
    if (!organizationIds.length) return res.status(403).json({ status: 'organization_forbidden', message: localeCopy.copy_b267164ab8 });
    const placeholders = organizationIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT h.id, h.org_id, h.name, h.student_id,
              om.person_id, o.name AS organization_name,
              d.name AS department_name, i.name AS identity_name, wg.name AS work_group_name,
              a.id AS account_id, a.status AS account_status, a.verified_at, a.recovery_required_at,
              EXISTS (SELECT 1 FROM account_wechat_bindings b WHERE b.account_id = a.id AND b.status = 'active') AS has_active_binding,
              EXISTS (SELECT 1 FROM account_wechat_bindings history_binding WHERE history_binding.account_id = a.id) AS has_binding_history,
              EXISTS (SELECT 1 FROM account_recovery_credentials c WHERE c.account_id = a.id
                AND c.method = 'recovery_code' AND c.status = 'active') AS has_recovery_code,
              EXISTS (SELECT 1 FROM account_recovery_credentials c WHERE c.account_id = a.id
                AND c.method = 'passphrase' AND c.status = 'active') AS has_passphrase,
              (SELECT COUNT(*) FROM auth_sessions s WHERE s.account_id = a.id
                AND s.status = 'active' AND s.expires_at > NOW()) AS active_session_count,
              (SELECT claim.id FROM identity_claim_requests claim WHERE claim.person_id = om.person_id
                AND claim.requested_org_id = h.org_id AND claim.status = 'pending' AND claim.expires_at > NOW()
                ORDER BY claim.created_at DESC LIMIT 1) AS pending_claim_id,
              EXISTS (SELECT 1 FROM identity_claim_requests claim WHERE claim.person_id = om.person_id
                AND claim.requested_org_id = h.org_id AND claim.status = 'pending' AND claim.expires_at > NOW()) AS has_pending_claim,
              EXISTS (SELECT 1 FROM identity_verification_tokens token
                JOIN identity_claim_requests claim ON claim.id = token.claim_request_id
                WHERE claim.person_id = om.person_id AND claim.requested_org_id = h.org_id
                  AND claim.status = 'pending' AND claim.expires_at > NOW()
                  AND token.status = 'active' AND token.expires_at > NOW()) AS has_active_claim_code,
              EXISTS (SELECT 1 FROM identity_verification_invites invite WHERE invite.person_id = om.person_id
                AND invite.org_id = h.org_id AND invite.status = 'active' AND invite.expires_at > NOW()) AS has_active_invite,
              (SELECT recovery.id FROM account_recovery_requests recovery
                WHERE recovery.person_id = om.person_id AND recovery.status = 'pending' AND recovery.expires_at > NOW()
                ORDER BY recovery.created_at DESC LIMIT 1) AS pending_recovery_id
         FROM hr_info h
         JOIN organization_memberships om ON om.legacy_hr_id = h.id
           AND om.org_id = h.org_id AND om.status = 'active'
         JOIN organizations o ON o.id = h.org_id
         LEFT JOIN departments d ON d.id = h.department_id AND d.org_id = h.org_id
         LEFT JOIN identities i ON i.id = h.identity_id AND i.org_id = h.org_id
         LEFT JOIN work_groups wg ON wg.id = h.work_group_id AND wg.org_id = h.org_id
         LEFT JOIN accounts a ON a.person_id = om.person_id
        WHERE h.org_id IN (${placeholders})
        ORDER BY h.org_id, h.name, h.id`,
      organizationIds
    );
    const countByStatus = { verified: 0, pending_verification: 0, frozen: 0, recovery_required: 0 };
    const list = rows.map((item) => {
      const accountStatus = safeString(item.account_status);
      const status = accountStatus === 'frozen'
        ? 'frozen'
        : accountStatus === 'recovery_required'
          ? 'recovery_required'
          : accountStatus === 'verified' && Boolean(item.has_active_binding)
            ? 'verified'
            : 'pending_verification';
      countByStatus[status] = Number(countByStatus[status] || 0) + 1;
      return {
        id: safeString(item.id),
        hrId: safeString(item.id),
        personId: safeString(item.person_id),
        organizationId: safeString(item.org_id),
        organizationName: safeString(item.organization_name),
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        department: safeString(item.department_name),
        identity: safeString(item.identity_name),
        identityCategory: safeString(item.identity_name),
        workGroup: safeString(item.work_group_name),
        accountId: safeString(item.account_id),
        auth: {
          status,
          hasActiveBinding: Boolean(item.has_active_binding),
          hasBindingHistory: Boolean(item.has_binding_history),
          hasRecoveryCode: Boolean(item.has_recovery_code),
          hasPassphrase: Boolean(item.has_passphrase),
          activeSessionCount: Number(item.active_session_count || 0),
          pendingClaimId: safeString(item.pending_claim_id),
          hasPendingClaim: Boolean(item.has_pending_claim),
          hasActiveClaimCode: Boolean(item.has_active_claim_code),
          hasActiveInvite: Boolean(item.has_active_invite),
          pendingRecoveryId: safeString(item.pending_recovery_id),
          verifiedAt: item.verified_at,
          recoveryRequiredAt: item.recovery_required_at
        }
      };
    });
    const canGlobalAccountManage = accessList.some((item) => (
      Array.isArray(item.permissionKeys) && item.permissionKeys.indexOf('auth.accounts.global_manage') >= 0
    ));
    return res.json({ status: 'success', rows: list, capabilities: { canGlobalAccountManage }, totals: {
      total: list.length,
      verified: countByStatus.verified,
      pendingVerification: countByStatus.pending_verification,
      frozen: countByStatus.frozen,
      recoveryRequired: countByStatus.recovery_required
    }, organizations: organizationIds });
  } catch (error) {
    const expected = error instanceof AdminOrganizationAccessError;
    if (!expected && req.logger) {
      req.logger.error('HR governance directory failed', {
        event: 'hr.governance.list_failed',
        code: safeString(error && error.code),
        error: safeString(error && error.message)
      });
    }
    return res.status(expected ? (error.httpStatus || 403) : 500).json({
      status: expected ? error.code : 'error',
      message: expected ? error.message : localeCopy.copy_cea11bf163
    });
  }
});

router.post('/listMembershipAssignments', async (req, res) => {
  try {
    const legacyHrId = safeString(req.body.hrId);
    if (!legacyHrId) return res.json({ status: 'invalid_params', message: localeCopy.copy_eb00430bd4 });
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    await requireAdminOrganizationPermission(req, orgId, ['hr.people']);
    const rows = await unifiedIdentityModel.listMembershipAssignments(legacyHrId, orgId);
    return res.json({
      status: 'success',
      list: rows.map((item) => ({
        id: safeString(item.id),
        assignmentKind: safeString(item.assignment_kind),
        assignmentNature: safeString(item.assignment_kind),
        assignmentLabel: unifiedIdentityModel.buildAssignmentLabel(item),
        title: '',
        departmentId: safeString(item.department_id),
        department: safeString(item.department_name),
        identityId: safeString(item.identity_id),
        identity: safeString(item.identity_name),
        identityCategoryId: safeString(item.identity_id),
        identityCategoryName: safeString(item.identity_name),
        workGroupId: safeString(item.work_group_id),
        workGroup: safeString(item.work_group_name)
      }))
    });
  } catch (error) {
    return res.json({ status: 'error', message: safeString(error.message) || localeCopy.copy_8c36023a05 });
  }
});

router.post('/listPersonIdentities', async (req, res) => {
  try {
    const legacyHrId = safeString(req.body.hrId);
    if (!legacyHrId) return res.json({ status: 'invalid_params', message: localeCopy.copy_eb00430bd4 });
    const accessList = await listAdminOrganizationAccess(req);
    const readableAccess = accessList.filter((item) => item.canReadAssignments || item.canReadAdmins);
    const readableOrganizationIds = readableAccess.map((item) => item.organizationId);
    const editableOrganizationIds = readableAccess
      .filter((item) => item.canEditAssignments)
      .map((item) => item.organizationId);
    const data = await personIdentityOverviewModel.listPersonIdentityData(
      legacyHrId,
      readableOrganizationIds,
      editableOrganizationIds
    );
    if (!data) return res.json({ status: 'not_found', message: localeCopy.copy_f4df6d5d73 });

    const accessByOrg = new Map(readableAccess.map((item) => [item.organizationId, item]));
    const assignmentsByOrg = new Map();
    data.assignments.forEach((item) => {
      const orgId = safeString(item.org_id);
      const rows = assignmentsByOrg.get(orgId) || [];
      rows.push({
        id: safeString(item.id),
        assignmentKind: safeString(item.assignment_kind),
        assignmentNature: safeString(item.assignment_kind),
        assignmentLabel: unifiedIdentityModel.buildAssignmentLabel(item),
        title: '',
        departmentId: safeString(item.department_id),
        department: safeString(item.department_name),
        identityId: safeString(item.identity_id),
        identity: safeString(item.identity_name),
        identityCategoryId: safeString(item.identity_id),
        identityCategoryName: safeString(item.identity_name),
        workGroupId: safeString(item.work_group_id),
        workGroup: safeString(item.work_group_name)
      });
      assignmentsByOrg.set(orgId, rows);
    });
    const grantsByOrg = new Map();
    data.grants.filter((item) => safeString(item.org_id)).forEach((item) => {
      const orgId = safeString(item.org_id);
      const rows = grantsByOrg.get(orgId) || [];
      const auth = authenticationStatus(item);
      rows.push({
        id: safeString(item.legacy_admin_id),
        grantId: safeString(item.id),
        adminLevel: safeString(item.admin_level),
        adminLevelLabel: personnelCopy.regularAdministrator,
        authenticationStatus: auth.value,
        authenticationStatusLabel: auth.label
      });
      grantsByOrg.set(orgId, rows);
    });
    const dictionariesByOrg = new Map();
    const appendDictionary = (kind, item) => {
      const orgId = safeString(item.org_id);
      const current = dictionariesByOrg.get(orgId) || {
        departments: [], identities: [], workGroups: []
      };
      const value = { id: safeString(item.id), name: safeString(item.name) };
      if (kind === 'workGroups') value.departmentId = safeString(item.department_id);
      current[kind].push(value);
      dictionariesByOrg.set(orgId, current);
    };
    data.dictionaries.departments.forEach((item) => appendDictionary('departments', item));
    data.dictionaries.identities.forEach((item) => appendDictionary('identities', item));
    data.dictionaries.workGroups.forEach((item) => appendDictionary('workGroups', item));

    const operatorPersonId = safeString(req.authAccount && req.authAccount.personId);
    const organizations = data.memberships.map((membership) => {
      const orgId = safeString(membership.org_id);
      const access = accessByOrg.get(orgId) || {};
      const adminIdentities = access.canReadAdmins ? (grantsByOrg.get(orgId) || []) : [];
      const dictionaries = dictionariesByOrg.get(orgId) || {
        departments: [], identities: [], workGroups: []
      };
      return {
        organizationId: orgId,
        organizationName: safeString(membership.organization_name),
        hrId: safeString(membership.legacy_hr_id),
        canReadAssignments: Boolean(access.canReadAssignments),
        canEditAssignments: Boolean(access.canEditAssignments),
        canReadAdmins: Boolean(access.canReadAdmins),
        canEditAdmins: Boolean(access.canEditAdmins),
        assignments: access.canReadAssignments ? (assignmentsByOrg.get(orgId) || []) : [],
        adminIdentities,
        canAddAdmin: Boolean(access.canEditAdmins && !adminIdentities.length),
        dictionaries: Object.assign({}, dictionaries, {
          identityCategories: dictionaries.identities
        })
      };
    });
    const operatorIsSuperAdmin = accessList.some((item) => item.isSuperAdmin);
    const currentOrganizationId = safeString(req.authContext && req.authContext.organizationId);
    const managementOrganizationId = accessList.some((item) => item.organizationId === currentOrganizationId)
      ? currentOrganizationId
      : safeString(accessList[0] && accessList[0].organizationId);
    const globalAdminIdentities = operatorIsSuperAdmin
      ? data.grants.filter((item) => safeString(item.org_id) === '').map((item) => {
          const auth = authenticationStatus(item);
          return {
            id: safeString(item.legacy_admin_id),
            grantId: safeString(item.id),
            adminLevel: 'super_admin',
            adminLevelLabel: personnelCopy.superAdministrator,
            authenticationStatus: auth.value,
            authenticationStatusLabel: auth.label,
            canDelete: safeString(item.person_id) !== operatorPersonId
          };
        })
      : [];
    res.json({
      status: 'success',
      person: { name: safeString(data.person.name), studentId: safeString(data.person.student_id) },
      organizations,
      globalAdminIdentities,
      managementOrganizationId,
      canAddGlobalSuperAdmin: Boolean(operatorIsSuperAdmin && !globalAdminIdentities.length)
    });
  } catch (error) {
    const isExpected = error instanceof AdminOrganizationAccessError;
    if (!isExpected) req.logger.error('List person identities failed', { error: error.message });
    return res.status(isExpected ? (error.httpStatus || 403) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : localeCopy.copy_1681c6c6eb
    });
  }
});

router.post('/saveMembershipAssignment', async (req, res) => {
  try {
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    const result = await unifiedIdentityModel.saveMembershipAssignment({
      id: safeString(req.body.id),
      legacyHrId: safeString(req.body.hrId),
      organizationId: orgId,
      assignmentKind: safeString(req.body.assignmentNature || req.body.assignmentKind),
      departmentId: safeString(req.body.departmentId),
      identityId: safeString(req.body.identityCategoryId || req.body.identityId),
      workGroupId: safeString(req.body.workGroupId)
    }, {
      personId: req.authAccount && req.authAccount.personId,
      contextId: req.authContext && req.authContext.contextId
    }, (connection) => requireAdminOrganizationPermission(req, orgId, ['hr.people'], connection));
    return res.json({ status: 'success', id: result.id, message: localeCopy.copy_735e0a8bcf });
  } catch (error) {
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Save membership assignment failed', { error: error.message });
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : localeCopy.copy_e1a5d7bc94
    });
  }
});

router.post('/deleteMembershipAssignment', async (req, res) => {
  try {
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    await unifiedIdentityModel.revokeMembershipAssignment({
      id: safeString(req.body.id),
      organizationId: orgId
    }, {
      personId: req.authAccount && req.authAccount.personId,
      contextId: req.authContext && req.authContext.contextId
    }, (connection) => requireAdminOrganizationPermission(req, orgId, ['hr.people'], connection));
    return res.json({ status: 'success', message: localeCopy.copy_63c465d5f0 });
  } catch (error) {
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Delete membership assignment failed', { error: error.message });
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : localeCopy.copy_f7ed2e08ad
    });
  }
});

// saveHrInfo
router.post('/saveHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);

    if (!name || !studentId) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_b84dcf2aa6 });
    }

    const existingId = safeString(req.body.id);
    if (existingId) {
      const existing = await hrInfoModel.getById(existingId);
      if (!existing) {
        return res.json({ status: 'not_found', message: localeCopy.copy_eb00430bd4 });
      }
      if (name !== safeString(existing.name) || studentId !== safeString(existing.student_id)) {
        return res.json({
          status: 'person_correction_required',
          message: personnelCopy.personCorrectionRequired
        });
      }
      return res.json({ status: 'success', id: existingId, message: localeCopy.copy_339e79984b });
    }

    const newId = generateId();
    await hrInfoModel.create(newId, {
      name,
      studentId,
      departmentId: '',
      identityId: '',
      workGroupId: ''
    });
    res.json({ status: 'success', id: newId, message: localeCopy.copy_339e79984b });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteHrInfo
router.post('/deleteHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_eb00430bd4 });
    const result = await hrInfoModel.remove(id);
    if (!result || !result.left) {
      return res.json({ status: 'not_found', message: personnelCopy.formerMemberNotFound });
    }
    res.json({ status: 'success', left: true, message: personnelCopy.memberLeftOrganization });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/listFormerHrMembers', async (req, res) => {
  try {
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    await requireAdminOrganizationPermission(req, orgId, ['hr.people']);
    const rows = await unifiedIdentityModel.listFormerMemberships(orgId);
    return res.json({
      status: 'success',
      list: rows.map((row) => ({
        membershipId: safeString(row.membership_id),
        personId: safeString(row.person_id),
        hrId: safeString(row.legacy_hr_id),
        name: safeString(row.name),
        studentId: safeString(row.student_id),
        leftAt: row.left_at
      }))
    });
  } catch (error) {
    const isExpected = error instanceof AdminOrganizationAccessError;
    return res.status(isExpected ? (error.httpStatus || 403) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : safeString(error.message)
    });
  }
});

router.post('/reactivateHrMembership', async (req, res) => {
  try {
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    const result = await unifiedIdentityModel.reactivateMembership({
      organizationId: orgId,
      legacyHrId: safeString(req.body.hrId)
    }, {
      personId: req.authAccount && req.authAccount.personId,
      contextId: req.authContext && req.authContext.contextId
    }, (connection) => requireAdminOrganizationPermission(req, orgId, ['hr.people'], connection));
    return res.json({
      status: 'success',
      reactivated: Boolean(result.reactivated),
      message: result.reactivated
        ? personnelCopy.membershipReactivated
        : personnelCopy.memberAlreadyActive
    });
  } catch (error) {
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : safeString(error.message)
    });
  }
});

router.post('/previewPersonIdentityCorrection', async (req, res) => {
  try {
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    const result = await personGovernanceModel.previewCorrection({
      legacyHrId: safeString(req.body.hrId),
      organizationId: orgId,
      name: safeString(req.body.name),
      studentId: safeString(req.body.studentId)
    });
    if (!result) return res.status(404).json({ status: 'not_found', message: personnelCopy.formerMemberNotFound });
    return res.json({ status: 'success', preview: result });
  } catch (error) {
    const isExpected = error instanceof unifiedIdentityModel.IdentityError;
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: safeString(error.message)
    });
  }
});

router.post('/applyPersonIdentityCorrection', async (req, res) => {
  try {
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    const result = await personGovernanceModel.applyCorrection({
      legacyHrId: safeString(req.body.hrId),
      organizationId: orgId,
      name: safeString(req.body.name),
      studentId: safeString(req.body.studentId),
      version: safeString(req.body.version)
    }, {
      personId: req.authAccount && req.authAccount.personId,
      contextId: req.authContext && req.authContext.contextId
    });
    return res.json({ status: 'success', result, message: personnelCopy.personCorrectionChanged });
  } catch (error) {
    const isExpected = error instanceof unifiedIdentityModel.IdentityError;
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : safeString(error.message)
    });
  }
});

router.post('/mergePersons', async (req, res) => {
  try {
    if (req.body.confirmed !== true) {
      return res.status(400).json({ status: 'confirmation_required', message: personnelCopy.personMergeConfirmationRequired });
    }
    const result = await personGovernanceModel.mergePersons({
      sourcePersonId: safeString(req.body.sourcePersonId),
      targetPersonId: safeString(req.body.targetPersonId),
      sourceVersion: safeString(req.body.sourceVersion),
      targetVersion: safeString(req.body.targetVersion),
      organizationId: safeString(req.body.organizationId) || await getCurrentOrgId()
    }, {
      personId: req.authAccount && req.authAccount.personId,
      contextId: req.authContext && req.authContext.contextId
    });
    return res.json({ status: 'success', result, message: personnelCopy.personMergeCompleted });
  } catch (error) {
    const isExpected = error instanceof unifiedIdentityModel.IdentityError;
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : safeString(error.message)
    });
  }
});

// importHrCsv
function firstValue(row, fields) {
  for (const field of fields) {
    const value = safeString(row[field]);
    if (value) return value;
  }
  return '';
}

async function handleStructuredHrImport(req, res, previewOnly) {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const orgId = await getCurrentOrgId();
    const result = previewOnly
      ? await hrTableImportModel.previewHrTableImport(req.body, orgId)
      : await hrTableImportModel.importHrTable(req.body, orgId);
    return res.json(result);
  } catch (error) {
    const isExpectedImportError = error instanceof hrTableImportModel.HrTableImportError;
    if (req.logger) {
      req.logger.error('hr table import failed', {
        endpoint: previewOnly ? 'previewHrTableImport' : 'importHrTable',
        status: safeString(error.status) || 'error',
        error: safeString(error.message),
        stack: error.stack
      });
    }
    return res.json({
      status: isExpectedImportError ? safeString(error.status) : 'error',
      message: isExpectedImportError ? safeString(error.message) : '表格未导入，请重试',
      requestId: req.requestId || ''
    });
  }
}

router.post('/previewHrTableImport', async (req, res) => {
  await handleStructuredHrImport(req, res, true);
});

router.post('/importHrTable', async (req, res) => {
  await handleStructuredHrImport(req, res, false);
});

router.post('/importHrCsv', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const csvContent = safeString(req.body.csvContent);
    const rows = parseCsv(csvContent);
    if (rows.length < 2) return res.json({ status: 'invalid_params', message: localeCopy.copy_2a53101dd0 });

    const headers = rows[0].map(item => safeString(item));
    const startIndex = Math.max(1, Number(req.body.startIndex || 1));
    const batchSize = Math.max(1, Math.min(Number(req.body.batchSize || 50), 100));
    const endIndex = Math.min(rows.length, startIndex + batchSize);

    const columnMapping = req.body.columnMapping && typeof req.body.columnMapping === 'object' ? req.body.columnMapping : null;
    const extensionFields = req.body.extensionFields && typeof req.body.extensionFields === 'object' ? req.body.extensionFields : null;
    const skipInvalid = !!req.body.skipInvalid;

    function resolveField(doc, fieldName) {
      if (columnMapping) {
        const mappingAliases = {
          name: ['name'],
          studentId: ['studentId'],
          departmentName: ['departmentName', 'department'],
          identityName: ['identityName', 'identity'],
          workGroupName: ['workGroupName', 'workGroup']
        };
        const aliases = mappingAliases[fieldName] || [fieldName];
        for (const alias of aliases) {
          if (columnMapping[alias]) return safeString(doc[columnMapping[alias]]);
        }
        return '';
      }
      const fallbackMap = {
        name: ['name', '姓名'],
        studentId: ['studentId', '学号'],
        departmentName: ['departmentName', 'department', '所属部门', '部门', '学院'],
        identityName: ['identityName', 'identity', '身份', '身份类别'],
        workGroupName: ['workGroupName', 'workGroup', '工作分工（职能组）', '工作分工', '职能组']
      };
      const fields = fallbackMap[fieldName] || [];
      return firstValue(doc, fields);
    }

    function resolveExtensionValues(doc) {
      if (!extensionFields) return {};
      const data = {};
      Object.keys(extensionFields).forEach(csvColumn => {
        const value = safeString(doc[csvColumn]);
        if (value) data[extensionFields[csvColumn]] = value;
      });
      return data;
    }

    // Load template fields
    let templateFields = [];
    let template = null;
    if (extensionFields && Object.keys(extensionFields).length) {
      template = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
      if (!template) return res.json({ status: 'missing_template', message: localeCopy.copy_ff3a771974 });
      const allFields = await profileFieldModel.getByTemplateId(template.id);
      templateFields = allFields.map(f => ({
        id: f.id, label: f.label, type: f.type, required: !!f.required,
        minLength: f.min_length, maxLength: f.max_length,
        numberRule: f.number_rule, allowDecimal: !!f.allow_decimal,
        minDigits: f.min_digits, maxDigits: f.max_digits,
        minValue: f.min_value, maxValue: f.max_value,
        options: f.options_json ? JSON.parse(f.options_json) : []
      }));
      const fieldLabelSet = new Set(templateFields.map(f => f.label));
      // Validate all extension field names match existing template fields
      const extNames = Object.entries(extensionFields).map(([csvCol, fieldName]) => fieldName);
      for (const name of extNames) {
        if (!fieldLabelSet.has(name)) {
          return res.json({ status: 'invalid_mapping', message: localeFormat(localeCopy.copy_b691796f85, [name]) });
        }
      }
    }

    // Preload all lookup data
    const [allDepts, allIdentities, allWorkGroups, allHrInfo] = await Promise.all([
      departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll(), hrInfoModel.getAll()
    ]);

    const deptMap = new Map(); allDepts.forEach(d => deptMap.set(d.name, d.id));
    const identityMap = new Map(); allIdentities.forEach(d => identityMap.set(d.name, d.id));
    const workGroupMap = new Map(); allWorkGroups.forEach(w => workGroupMap.set(`${w.name}::${w.department_id}`, w.id));
    const hrInfoMap = new Map(); allHrInfo.forEach(h => hrInfoMap.set(h.student_id, h.id));
    const hrInfoRecMap = new Map(); allHrInfo.forEach(h => hrInfoRecMap.set(h.id, h));

    const targetRows = rows.slice(startIndex, endIndex);
    const parsedRows = [];
    let skippedNoStudentId = 0;

    for (const row of targetRows) {
      const doc = {};
      headers.forEach((header, index) => { if (header) doc[header] = safeString(row[index]); });

      const name = resolveField(doc, 'name');
      const studentId = resolveField(doc, 'studentId');
      if (!studentId) {
        skippedNoStudentId++;
        continue;
      }

      const departmentName = resolveField(doc, 'departmentName');
      const identityName = resolveField(doc, 'identityName');
      const workGroupName = resolveField(doc, 'workGroupName');
      const extValues = resolveExtensionValues(doc);

      parsedRows.push({ name, studentId, departmentName, identityName, workGroupName, extValues });
    }

    let validationErrors = [];

    // --- VALIDATE all extension values BEFORE any writes ---
    if (extensionFields && Object.keys(extensionFields).length && templateFields.length) {
      const fieldByLabel = new Map(templateFields.map(f => [f.label, f]));
      for (const row of parsedRows) {
        const rowErrors = [];
        for (const [fieldName, fieldValue] of Object.entries(row.extValues)) {
          const fieldDef = fieldByLabel.get(fieldName);
          if (fieldDef) {
            const err = validateFieldValue(fieldDef, fieldValue);
            if (err) {
              rowErrors.push({ field: fieldName, value: fieldValue, error: err, fieldType: fieldDef.type });
            }
          }
        }
        if (rowErrors.length) {
          validationErrors.push({
            studentId: row.studentId,
            name: row.name,
            errors: rowErrors
          });
        }
      }
      if (validationErrors.length) {
        if (!skipInvalid) {
          return res.json({
            status: 'validation_errors',
            message: localeFormat(localeCopy.copy_120171d734, [validationErrors.length]),
            errors: validationErrors,
            count: 0,
            nextIndex: endIndex,
            hasMore: endIndex < rows.length,
            skippedNoStudentId: skippedNoStudentId
          });
        }
        // Strip invalid fields from parsedRows so they won't be written
        const invalidByStudentId = new Map();
        for (const ve of validationErrors) {
          const fieldNames = new Set(ve.errors.map(function(e) { return e.field; }));
          invalidByStudentId.set(ve.studentId, fieldNames);
        }
        for (const row of parsedRows) {
          const invalidFields = invalidByStudentId.get(row.studentId);
          if (invalidFields) {
            for (const fieldName of invalidFields) {
              delete row.extValues[fieldName];
            }
          }
        }
      }
    }

    // Find new departments / identities / workGroups to create
    const newDeptNames = new Set();
    const newIdentityNames = new Set();
    for (const row of parsedRows) {
      if (row.departmentName && !deptMap.has(row.departmentName)) newDeptNames.add(row.departmentName);
      if (row.identityName && !identityMap.has(row.identityName)) newIdentityNames.add(row.identityName);
    }

    const newWorkGroupKeys = new Set();
    for (const name of newDeptNames) { deptMap.set(name, generateId()); }
    for (const row of parsedRows) {
      if (row.workGroupName && row.departmentName) {
        const deptId = deptMap.get(row.departmentName);
        if (deptId) {
          const key = `${row.workGroupName}::${deptId}`;
          if (!workGroupMap.has(key)) newWorkGroupKeys.add(key);
        }
      }
    }

    // --- Execute all writes in a transaction ---
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const orgId = await getCurrentOrgId();

      for (const name of newDeptNames) {
        const newId = deptMap.get(name);
        await conn.query('INSERT INTO departments (id, name, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [newId, name, orgId, nowUtc, nowUtc]);
      }
      for (const name of newIdentityNames) {
        const newId = generateId();
        identityMap.set(name, newId);
        await conn.query('INSERT INTO identities (id, name, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [newId, name, orgId, nowUtc, nowUtc]);
      }
      for (const key of newWorkGroupKeys) {
        const [wgName, deptId] = key.split('::');
        const newId = generateId();
        workGroupMap.set(key, newId);
        await conn.query('INSERT INTO work_groups (id, name, department_id, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [newId, wgName, deptId, orgId, nowUtc, nowUtc]);
      }

      const fieldByLabel = templateFields.length ? new Map(templateFields.map(f => [f.label, f])) : new Map();
      const effectiveProfileUpdates = [];

      // Normalize date values before storage
      for (const row of parsedRows) {
        for (const [fieldName, fieldValue] of Object.entries(row.extValues)) {
          const fieldDef = fieldByLabel.get(fieldName);
          if (fieldDef && fieldDef.type === 'date') {
            const normalized = tryParseDate(fieldValue);
            if (normalized) row.extValues[fieldName] = normalized;
          }
        }
      }

      for (const row of parsedRows) {
        let hrId;
        const existingId = hrInfoMap.get(row.studentId);
        const previous = existingId ? hrInfoRecMap.get(existingId) : null;
        const effectiveName = row.name || safeString(previous && previous.name);
        const departmentId = row.departmentName
          ? deptMap.get(row.departmentName) || ''
          : safeString(previous && previous.department_id);
        const identityId = row.identityName
          ? identityMap.get(row.identityName) || ''
          : safeString(previous && previous.identity_id);
        let workGroupId = safeString(previous && previous.work_group_id);
        if (row.workGroupName && departmentId) {
          workGroupId = workGroupMap.get(`${row.workGroupName}::${departmentId}`) || '';
        }
        if (existingId) {
          hrId = existingId;
          await conn.query(
            `UPDATE hr_info SET name=?, student_id=?, department_id=?, identity_id=?, work_group_id=?, updated_at=? WHERE id=? AND org_id=?`,
            [effectiveName, row.studentId, departmentId, identityId, workGroupId, nowUtc, hrId, orgId]
          );
        } else {
          hrId = generateId();
          await conn.query(
            `INSERT INTO hr_info (id, name, student_id, department_id, identity_id, work_group_id, org_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            [hrId, effectiveName, row.studentId, departmentId, identityId, workGroupId, orgId, nowUtc, nowUtc]
          );
          hrInfoMap.set(row.studentId, hrId);
        }

        // Store extension values via profile records
        if (Object.keys(row.extValues).length && fieldByLabel.size) {
          if (!template) {
            throw new Error(localeCopy.copy_c8029d1c2a);
          }
          let record = null;
          let effectiveRecordId = '';
          const [recRows] = await conn.query('SELECT * FROM hr_profile_records WHERE hr_id = ? AND org_id = ? LIMIT 1', [hrId, orgId]);
          if (recRows.length) record = recRows[0];

          if (record) {
            effectiveRecordId = record.id;
            // Remove existing approved values for fields we're setting, then rewrite
            const fieldIds = [];
            for (const [fieldName] of Object.entries(row.extValues)) {
              const fieldDef = fieldByLabel.get(fieldName);
              if (fieldDef) fieldIds.push(fieldDef.id);
            }
            if (fieldIds.length) {
              await conn.query(`DELETE FROM hr_profile_record_values WHERE record_id = ? AND is_pending = 0 AND field_id IN (${fieldIds.map(() => '?').join(',')}) AND org_id = ?`, [record.id, ...fieldIds, orgId]);
            }
            // Re-set approved values
            for (const [fieldName, fieldValue] of Object.entries(row.extValues)) {
              const fieldDef = fieldByLabel.get(fieldName);
              if (!fieldDef) continue;
              await conn.query(
                'INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id) VALUES (?, ?, 0, ?, ?, ?)',
                [generateId(), record.id, fieldDef.id, fieldValue, orgId]
              );
            }
            await conn.query(
              'UPDATE hr_profile_records SET audit_status = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
              ['approved', nowUtc, nowUtc, record.id, orgId]
            );
          } else {
            const recordId = generateId();
            effectiveRecordId = recordId;
            // Insert with 'pending' initially; update after values are written
            await conn.query(
              `INSERT INTO hr_profile_records (id, hr_id, name, openid, template_snapshot_id, audit_status, reviewed_at, org_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [recordId, hrId, effectiveName, '', template.id, 'pending', nowUtc, orgId, nowUtc, nowUtc]
            );
            for (const [fieldName, fieldValue] of Object.entries(row.extValues)) {
              const fieldDef = fieldByLabel.get(fieldName);
              if (!fieldDef) continue;
              await conn.query(
                'INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id) VALUES (?, ?, 0, ?, ?, ?)',
                [generateId(), recordId, fieldDef.id, fieldValue, orgId]
              );
            }
            await conn.query(
              'UPDATE hr_profile_records SET audit_status = ? WHERE id = ? AND org_id = ?',
              ['approved', recordId, orgId]
            );
          }
          const normalizedValues = {};
          for (const [fieldName, fieldValue] of Object.entries(row.extValues)) {
            const fieldDef = fieldByLabel.get(fieldName);
            if (fieldDef) normalizedValues[fieldDef.id] = fieldValue;
          }
          effectiveProfileUpdates.push({ hrId, recordId: effectiveRecordId, values: normalizedValues });
        }
      }

      await unifiedIdentityModel.syncLegacyHrRecords(
        conn,
        parsedRows.map((row) => hrInfoMap.get(row.studentId)).filter(Boolean)
      );
      for (const update of effectiveProfileUpdates) {
        const [personRows] = await conn.query(
          `SELECT person_id FROM organization_memberships
            WHERE legacy_hr_id = ? AND org_id = ? AND status = 'active' LIMIT 1`,
          [update.hrId, orgId]
        );
        if (!personRows.length) continue;
        await personProfileValueModel.upsertEffectiveValues(
          personRows[0].person_id,
          orgId,
          update.recordId,
          templateFields,
          update.values,
          nowUtc,
          conn
        );
      }
      await conn.commit();
      const result = {
        status: 'success',
        count: parsedRows.length,
        totalRows: rows.length - 1,
        nextIndex: endIndex,
        hasMore: endIndex < rows.length,
        skippedNoStudentId: skippedNoStudentId
      };
      if (skipInvalid && validationErrors.length) {
        result.errors = validationErrors;
      }
      res.json(result);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_5840966982 });
  }
});

// batchMaintainFromHrInfo
router.post('/batchMaintainFromHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const [hrRows, departmentRows, identityRows, workGroupRows] = await Promise.all([
      hrInfoModel.getAll(), departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll()
    ]);

    const departmentIds = new Set(departmentRows.map(d => d.id));
    const identityIds = new Set(identityRows.map(d => d.id));
    const workGroupIds = new Set(workGroupRows.map(w => w.id));
    const workGroupsById = new Map(workGroupRows.map(w => [w.id, w]));

    const stats = {
      checkedMembers: hrRows.length,
      referencedDepartments: 0,
      referencedIdentities: 0,
      referencedWorkGroups: 0,
      missingDepartments: 0,
      missingIdentities: 0,
      missingWorkGroups: 0,
      wrongDepartmentWorkGroups: 0
    };

    const seenDepartments = new Set();
    const seenIdentities = new Set();
    const seenWorkGroups = new Set();

    for (const item of hrRows) {
      const deptId = safeString(item.department_id);
      const identId = safeString(item.identity_id);
      const wgId = safeString(item.work_group_id);

      if (deptId) seenDepartments.add(deptId);
      if (identId) seenIdentities.add(identId);
      if (wgId) seenWorkGroups.add(wgId);

      if (deptId && !departmentIds.has(deptId)) stats.missingDepartments += 1;
      if (identId && !identityIds.has(identId)) stats.missingIdentities += 1;
      if (wgId && !workGroupIds.has(wgId)) {
        stats.missingWorkGroups += 1;
      } else if (wgId) {
        const wg = workGroupsById.get(wgId);
        if (safeString(wg && wg.department_id) !== deptId) stats.wrongDepartmentWorkGroups += 1;
      }
    }

    stats.referencedDepartments = seenDepartments.size;
    stats.referencedIdentities = seenIdentities.size;
    stats.referencedWorkGroups = seenWorkGroups.size;

    if (stats.missingDepartments || stats.missingIdentities || stats.missingWorkGroups || stats.wrongDepartmentWorkGroups) {
      return res.json({
        status: 'error',
        message: localeFormat(localeCopy.copy_9984afb98e, [stats.missingDepartments, stats.missingIdentities, stats.missingWorkGroups, stats.wrongDepartmentWorkGroups]),
        stats
      });
    }

    res.json({ status: 'success', message: localeCopy.copy_c2a4637e57, stats });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// unbindHrWechat — 管理员从全部组织解绑指定人事对应的微信
router.post('/unbindHrWechat', async (req, res) => {
  let connection;
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const canGlobalAccountManage = Boolean(req.adminPermissions
      && req.adminPermissions.permissions
      && req.adminPermissions.permissions['auth.accounts.global_manage']);
    if (admin.admin_level !== 'super_admin' && !canGlobalAccountManage) {
      return res.status(403).json({
        status: 'permission_denied',
        message: personnelCopy.globalAccountManageRequired
      });
    }

    const hrId = safeString(req.body.hrId);
    if (!hrId) return res.json({ status: 'invalid_params', message: localeCopy.copy_eb00430bd4 });

    const orgId = await getCurrentOrgId();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const unifiedResult = await unifiedIdentityModel.resetAccountByLegacyHr(
      connection,
      hrId,
      orgId,
      {
        personId: req.authAccount && req.authAccount.personId,
        contextId: req.authContext && req.authContext.contextId
      },
      'administrator_hr_reset'
    );
    if (unifiedResult) {
      await connection.commit();
      return res.json({
        status: 'success',
        message: localeCopy.copy_4c4f7957b4,
        recoveryRequired: true
      });
    }
    const result = await unbindUserAcrossOrganizations({
      hrId,
      orgId,
      connection
    });
    if (!result) {
      await connection.rollback();
      return res.json({ status: 'not_found', message: localeCopy.copy_cf56435dad });
    }

    await connection.commit();
    for (const targetOpenid of result.openids) {
      for (const affectedOrgId of result.affectedOrganizationIds) {
        clearOrgAccessCache(targetOpenid, affectedOrgId, 'user');
      }
    }

    res.json({
      status: 'success',
      message: localeCopy.copy_806092b494,
      unboundCount: result.affectedCount
    });
  } catch (e) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
