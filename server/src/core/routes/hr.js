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
const hrTableImportModel = require('../models/hrTableImport');
const pool = require('../../config/db');

function authenticationStatus(row) {
  const accountStatus = safeString(row.account_status);
  if (accountStatus === 'frozen') return { value: 'frozen', label: '已冻结' };
  if (accountStatus === 'recovery_required') return { value: 'recovery_required', label: '待恢复' };
  if (accountStatus === 'verified' && Boolean(row.has_active_binding)) {
    return { value: 'verified', label: '已认证' };
  }
  return { value: 'pending_verification', label: '待认证' };
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
    if (field.minLength != null && value.length < field.minLength) return `请将${field.label}填写至至少 ${field.minLength} 个字`;
    if (field.maxLength != null && value.length > field.maxLength) return `请将${field.label}控制在 ${field.maxLength} 个字以内`;
    return '';
  }
  if (field.type === 'number') {
    if (field.allowDecimal === false && !/^[+-]?\d+$/.test(value)) return `请在${field.label}中填写整数`;
    const num = Number(value);
    if (!Number.isFinite(num)) return `请在${field.label}中填写数字`;
    if (field.numberRule === 'length_range') {
      const nlen = String(value).replace(/^[+-]/, '').replace('.', '').length;
      if (field.minDigits != null && nlen < field.minDigits) return `请将${field.label}填写至至少 ${field.minDigits} 位`;
      if (field.maxDigits != null && nlen > field.maxDigits) return `请将${field.label}控制在 ${field.maxDigits} 位以内`;
    } else {
      if (field.minValue != null && num < field.minValue) return `请将${field.label}填写为 ${field.minValue} 或更大`;
      if (field.maxValue != null && num > field.maxValue) return `请将${field.label}填写为 ${field.maxValue} 或更小`;
    }
    return '';
  }
  if (field.type === 'sequence') { if (field.options.length && field.options.indexOf(value) === -1) return `请重新选择${field.label}`; return ''; }
  if (field.type === 'date' && !tryParseDate(value)) return `请重新填写${field.label}日期`;
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) return `请重新填写${field.label}手机号`;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `请重新填写${field.label}邮箱`;
  return '';
}

const TEMPLATE_KEY = 'default_hr_profile_template';

// listHrInfo
router.post('/listHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const orgId = await getCurrentOrgId();
    const [rows] = await pool.query(
      `SELECT h.*, d.name as department_name, i.name as identity_name, wg.name as work_group_name
       FROM hr_info h
       LEFT JOIN departments d ON h.department_id = d.id AND d.org_id = ?
       LEFT JOIN identities i ON h.identity_id = i.id AND i.org_id = ?
       LEFT JOIN work_groups wg ON h.work_group_id = wg.id AND wg.org_id = ?
       WHERE h.org_id = ?
       ORDER BY h.name`,
      [orgId, orgId, orgId, orgId]
    );
    const bindingStates = await resolveHrBindingStates(rows, orgId);
    const list = rows.map((item) => {
      const binding = bindingStates.get(safeString(item.id)) || {
        status: 'unbound',
        userInfoId: '',
        boundOpenid: ''
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
        'auth.identity.verify', 'auth.accounts.recover', 'auth.policy.manage'
      ].indexOf(key) >= 0)
    ));
    if (!readable.length) return res.status(403).json({ status: 'permission_denied', message: '当前身份无权查看人事信息' });
    const requestedOrgId = safeString(req.body && req.body.organizationId);
    const allowedIds = Array.from(new Set(readable.map((item) => safeString(item.organizationId)).filter(Boolean)));
    const organizationIds = requestedOrgId
      ? (allowedIds.indexOf(requestedOrgId) >= 0 ? [requestedOrgId] : [])
      : allowedIds;
    if (!organizationIds.length) return res.status(403).json({ status: 'organization_forbidden', message: '当前身份无权查看该组织' });
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
              (SELECT COUNT(*) FROM auth_sessions s WHERE s.account_id = a.id
                AND s.status = 'active' AND s.expires_at > NOW()) AS active_session_count,
              EXISTS (SELECT 1 FROM identity_claim_requests claim WHERE claim.person_id = om.person_id
                AND claim.requested_org_id = h.org_id AND claim.status = 'pending') AS has_pending_claim,
              EXISTS (SELECT 1 FROM identity_verification_invites invite WHERE invite.person_id = om.person_id
                AND invite.org_id = h.org_id AND invite.status = 'active' AND invite.expires_at > NOW()) AS has_active_invite
         FROM hr_info h
         JOIN organization_memberships om ON om.legacy_hr_id = h.id
           AND om.org_id = h.org_id AND om.status = 'active'
         JOIN organizations o ON o.id = h.org_id AND o.status = 'active'
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
        workGroup: safeString(item.work_group_name),
        accountId: safeString(item.account_id),
        auth: {
          status,
          hasActiveBinding: Boolean(item.has_active_binding),
          hasBindingHistory: Boolean(item.has_binding_history),
          hasRecoveryCode: Boolean(item.has_recovery_code),
          activeSessionCount: Number(item.active_session_count || 0),
          hasPendingClaim: Boolean(item.has_pending_claim),
          hasActiveInvite: Boolean(item.has_active_invite),
          verifiedAt: item.verified_at,
          recoveryRequiredAt: item.recovery_required_at
        }
      };
    });
    return res.json({ status: 'success', rows: list, totals: {
      total: list.length,
      verified: countByStatus.verified,
      pendingVerification: countByStatus.pending_verification,
      frozen: countByStatus.frozen,
      recoveryRequired: countByStatus.recovery_required
    }, organizations: organizationIds });
  } catch (error) {
    const expected = error instanceof AdminOrganizationAccessError;
    return res.status(expected ? (error.httpStatus || 403) : 500).json({
      status: expected ? error.code : 'error',
      message: expected ? error.message : '人事信息暂时无法加载，请稍后重试'
    });
  }
});

router.post('/listMembershipAssignments', async (req, res) => {
  try {
    const legacyHrId = safeString(req.body.hrId);
    if (!legacyHrId) return res.json({ status: 'invalid_params', message: '请重新选择成员' });
    const orgId = safeString(req.body.organizationId) || await getCurrentOrgId();
    await requireAdminOrganizationPermission(req, orgId, ['hr.people']);
    const rows = await unifiedIdentityModel.listMembershipAssignments(legacyHrId, orgId);
    return res.json({
      status: 'success',
      list: rows.map((item) => ({
        id: safeString(item.id),
        assignmentKind: safeString(item.assignment_kind),
        title: safeString(item.title),
        departmentId: safeString(item.department_id),
        department: safeString(item.department_name),
        identityId: safeString(item.identity_id),
        identity: safeString(item.identity_name),
        workGroupId: safeString(item.work_group_id),
        workGroup: safeString(item.work_group_name)
      }))
    });
  } catch (error) {
    return res.json({ status: 'error', message: safeString(error.message) || '请稍后刷新岗位' });
  }
});

router.post('/listPersonIdentities', async (req, res) => {
  try {
    const legacyHrId = safeString(req.body.hrId);
    if (!legacyHrId) return res.json({ status: 'invalid_params', message: '请重新选择成员' });
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
    if (!data) return res.json({ status: 'not_found', message: '请刷新人员列表' });

    const accessByOrg = new Map(readableAccess.map((item) => [item.organizationId, item]));
    const assignmentsByOrg = new Map();
    data.assignments.forEach((item) => {
      const orgId = safeString(item.org_id);
      const rows = assignmentsByOrg.get(orgId) || [];
      rows.push({
        id: safeString(item.id),
        assignmentKind: safeString(item.assignment_kind),
        title: safeString(item.title),
        departmentId: safeString(item.department_id),
        department: safeString(item.department_name),
        identityId: safeString(item.identity_id),
        identity: safeString(item.identity_name),
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
        adminLevelLabel: '普通管理员',
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
        dictionaries
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
            adminLevelLabel: '超级管理员',
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
      message: isExpected ? error.message : '请稍后刷新身份信息'
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
      assignmentKind: safeString(req.body.assignmentKind),
      title: safeString(req.body.title),
      departmentId: safeString(req.body.departmentId),
      identityId: safeString(req.body.identityId),
      workGroupId: safeString(req.body.workGroupId)
    }, {
      personId: req.authAccount && req.authAccount.personId,
      contextId: req.authContext && req.authContext.contextId
    }, (connection) => requireAdminOrganizationPermission(req, orgId, ['hr.people'], connection));
    return res.json({ status: 'success', id: result.id, message: '岗位已保存' });
  } catch (error) {
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Save membership assignment failed', { error: error.message });
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : '岗位未保存，请重试'
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
    return res.json({ status: 'success', message: '岗位已删除' });
  } catch (error) {
    const isExpected = error instanceof AdminOrganizationAccessError
      || error instanceof unifiedIdentityModel.IdentityError;
    if (!isExpected) req.logger.error('Delete membership assignment failed', { error: error.message });
    return res.status(isExpected ? (error.httpStatus || 400) : 500).json({
      status: isExpected ? error.code : 'error',
      message: isExpected ? error.message : '岗位未删除，请重试'
    });
  }
});

// saveHrInfo
router.post('/saveHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);

    if (!name || !studentId) {
      return res.json({ status: 'invalid_params', message: '请提供姓名和学号' });
    }

    const existingId = safeString(req.body.id);
    if (existingId) {
      const existing = await hrInfoModel.getById(existingId);
      if (!existing) {
        return res.json({ status: 'not_found', message: '请重新选择成员' });
      }
      await hrInfoModel.updatePersonBasics(existingId, {
        name,
        studentId,
        updatedAt: new Date()
      });
      return res.json({ status: 'success', id: existingId, message: '成员已保存' });
    }

    const newId = generateId();
    await hrInfoModel.create(newId, {
      name,
      studentId,
      departmentId: '',
      identityId: '',
      workGroupId: ''
    });
    res.json({ status: 'success', id: newId, message: '成员已保存' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteHrInfo
router.post('/deleteHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择成员' });
    await hrInfoModel.remove(id);
    res.json({ status: 'success', message: '人事信息已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const csvContent = safeString(req.body.csvContent);
    const rows = parseCsv(csvContent);
    if (rows.length < 2) return res.json({ status: 'invalid_params', message: '请选择包含表头和人员资料的表格' });

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
      if (!template) return res.json({ status: 'missing_template', message: '请先选择人事模板' });
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
          return res.json({ status: 'invalid_mapping', message: `人事模板中没有资料项“${name}”` });
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
            message: `请修改 ${validationErrors.length} 条格式不正确的记录`,
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
            throw new Error('模板已更新，请刷新后重试');
          }
          let record = null;
          const [recRows] = await conn.query('SELECT * FROM hr_profile_records WHERE hr_id = ? AND org_id = ? LIMIT 1', [hrId, orgId]);
          if (recRows.length) record = recRows[0];

          if (record) {
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
            let recordStatus = 'approved';
            const requiredFields = templateFields.filter(f => f.required);
            if (requiredFields.length > 0) {
              const [allValues] = await conn.query(
                'SELECT field_id, field_value FROM hr_profile_record_values WHERE record_id = ? AND org_id = ?',
                [record.id, orgId]
              );
              const valueMap = new Map(allValues.map(v => [v.field_id, v.field_value]));
              for (const rf of requiredFields) {
                const val = valueMap.get(rf.id);
                if (!val || !String(val).trim()) {
                  recordStatus = 'pending';
                  break;
                }
              }
            }
            await conn.query(
              'UPDATE hr_profile_records SET audit_status = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
              [recordStatus, nowUtc, nowUtc, record.id, orgId]
            );
          } else {
            const recordId = generateId();
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
            // Determine correct audit_status for new record
            const requiredFieldsNew = templateFields.filter(f => f.required);
            if (requiredFieldsNew.length > 0) {
              const [allValuesNew] = await conn.query(
                'SELECT field_id, field_value FROM hr_profile_record_values WHERE record_id = ? AND org_id = ?',
                [recordId, orgId]
              );
              const valueMapNew = new Map(allValuesNew.map(v => [v.field_id, v.field_value]));
              let allFilled = true;
              for (const rf of requiredFieldsNew) {
                const val = valueMapNew.get(rf.id);
                if (!val || !String(val).trim()) {
                  allFilled = false;
                  break;
                }
              }
              if (allFilled) {
                await conn.query(
                  'UPDATE hr_profile_records SET audit_status = ? WHERE id = ? AND org_id = ?',
                  ['approved', recordId, orgId]
                );
              }
            } else {
              await conn.query(
                'UPDATE hr_profile_records SET audit_status = ? WHERE id = ? AND org_id = ?',
                ['approved', recordId, orgId]
              );
            }
          }
        }
      }

      await unifiedIdentityModel.syncLegacyHrRecords(
        conn,
        parsedRows.map((row) => hrInfoMap.get(row.studentId)).filter(Boolean)
      );
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
    res.json({ status: 'error', message: safeString(e.message) || '表格未导入，请重试' });
  }
});

// batchMaintainFromHrInfo
router.post('/batchMaintainFromHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

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
        message: `请补充组织资料：部门 ${stats.missingDepartments} 条、身份 ${stats.missingIdentities} 条、职能组 ${stats.missingWorkGroups} 条、职能组归属 ${stats.wrongDepartmentWorkGroups} 条`,
        stats
      });
    }

    res.json({ status: 'success', message: '组织资料完整', stats });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const hrId = safeString(req.body.hrId);
    if (!hrId) return res.json({ status: 'invalid_params', message: '请重新选择成员' });

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
        message: '账号已等待恢复，原微信和其他设备已退出',
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
      return res.json({ status: 'not_found', message: '该人事记录尚未绑定微信' });
    }

    await connection.commit();
    for (const targetOpenid of result.openids) {
      for (const affectedOrgId of result.affectedOrganizationIds) {
        clearOrgAccessCache(targetOpenid, affectedOrgId, 'user');
      }
    }

    res.json({
      status: 'success',
      message: '已从所有组织解绑微信',
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
