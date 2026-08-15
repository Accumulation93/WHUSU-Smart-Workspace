const localeCopy = require('../../locales/zh-CN/generated/core/routes/hrProfile');
const express = require('express');
const router = express.Router();
const { createNotification } = require('../../modules/audit/utils/notificationHelper');
const { safeString, generateId, buildNameMap, normalizeEmptyValue } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const adminInfoModel = require('../models/adminInfo');
const userInfoModel = require('../models/userInfo');
const hrInfoModel = require('../models/hrInfo');
const departmentModel = require('../models/department');
const identityModel = require('../models/identity');
const workGroupModel = require('../models/workGroup');
const profileTemplateModel = require('../models/hrProfileTemplate');
const profileFieldModel = require('../models/hrProfileField');
const profileRecordModel = require('../models/hrProfileRecord');
const profileValueModel = require('../models/hrProfileValue');
const personProfileValueModel = require('../models/personProfileValue');
const templateLibrary = require('../services/hrProfileTemplateLibrary');
const { loadEffectivePermissions, hasAnyPermission } = require('../services/adminPermissions');
const { resolveHrBindingStates } = require('../services/userBindingStatus');
const unifiedIdentityModel = require('../models/unifiedIdentity');
const personIdentityOverviewModel = require('../models/personIdentityOverview');
const pool = require('../../config/db');

const TEMPLATE_KEY = 'default_hr_profile_template';
const MODE_TEXT_MAP = { direct: '允许直接修改', audit: '需审核后生效', readonly: '不允许自行修改' };

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

async function ensureTemplatePermission(req, permissionKeys) {
  const admin = req.admin || await ensureAdmin(req.openid);
  if (!admin) return null;
  const orgId = await getCurrentOrgId();
  const effective = req.adminPermissions || await loadEffectivePermissions(admin, orgId);
  if (!hasAnyPermission(effective, permissionKeys)) return null;
  return { admin, orgId, effective };
}

function normalizeTemplateField(field) {
  return {
    id: safeString(field.id),
    label: safeString(field.label),
    type: safeString(field.type || 'text'),
    required: field.required === true,
    minLength: field.minLength == null ? null : Number(field.minLength),
    maxLength: field.maxLength == null ? null : Number(field.maxLength),
    numberRule: safeString(field.numberRule || 'value_range'),
    allowDecimal: field.allowDecimal !== false,
    minDigits: field.minDigits == null ? null : Number(field.minDigits),
    maxDigits: field.maxDigits == null ? null : Number(field.maxDigits),
    minValue: field.minValue == null ? null : Number(field.minValue),
    maxValue: field.maxValue == null ? null : Number(field.maxValue),
    options: Array.isArray(field.options) ? field.options.map((item) => safeString(item)).filter(Boolean) : []
  };
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

function validateFieldValue(field, rawValue, isAdmin) {
  const value = normalizeEmptyValue(rawValue);
  if (field.required && !value && !isAdmin) return localeFormat(localeCopy.copy_377d9cc43d, [field.label]);
  if (!value) return '';
  if (field.type === 'text') {
    if (field.minLength != null && value.length < field.minLength) return localeFormat(localeCopy.copy_245abb6cb3, [field.label, field.minLength]);
    if (field.maxLength != null && value.length > field.maxLength) return localeFormat(localeCopy.copy_0d42479c01, [field.label, field.maxLength]);
    return '';
  }
  if (field.type === 'number') {
    if (field.allowDecimal === false && !/^[+-]?\d+$/.test(value)) return localeFormat(localeCopy.copy_25da4c9917, [field.label]);
    const num = Number(value);
    if (!Number.isFinite(num)) return localeFormat(localeCopy.copy_803a916bfb, [field.label]);
    if (field.numberRule === 'length_range') {
      const nlen = String(value).replace(/^[+-]/, '').replace('.', '').length;
      if (field.minDigits != null && nlen < field.minDigits) return localeFormat(localeCopy.copy_8d415deaa0, [field.label, field.minDigits]);
      if (field.maxDigits != null && nlen > field.maxDigits) return localeFormat(localeCopy.copy_8ce15854f9, [field.label, field.maxDigits]);
    } else {
      if (field.minValue != null && num < field.minValue) return localeFormat(localeCopy.copy_2c1cbd4cee, [field.label, field.minValue]);
      if (field.maxValue != null && num > field.maxValue) return localeFormat(localeCopy.copy_3f2df8f2ed, [field.label, field.maxValue]);
    }
    return '';
  }
  if (field.type === 'sequence') { if (field.options.indexOf(value) === -1) return localeFormat(localeCopy.copy_02808711c5, [field.label]); return ''; }
  if (field.type === 'date' && !tryParseDate(value)) return localeFormat(localeCopy.copy_c8aa4ca152, [field.label]);
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) return localeFormat(localeCopy.copy_e840878ac4, [field.label]);
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return localeFormat(localeCopy.copy_f117197c23, [field.label]);
  return '';
}

async function getUserWithOrg(openid) {
  const users = await userInfoModel.getAll();
  const user = users.find((u) => u.openid === openid);
  if (!user) return { user: null, hr: null };
  const hrId = safeString(user.hr_id);
  if (!hrId) return { user, hr: null };
  const hr = await hrInfoModel.getById(hrId);
  return { user, hr };
}

async function enrichHrWithOrg(hr) {
  if (!hr) return null;
  const [departments, identities, workGroups] = await Promise.all([
    departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll()
  ]);
  const deptMap = buildNameMap(departments);
  const identMap = buildNameMap(identities);
  const wgMap = buildNameMap(workGroups);
  return {
    id: hr.id, name: safeString(hr.name), studentId: safeString(hr.student_id),
    departmentId: safeString(hr.department_id), department: deptMap.get(safeString(hr.department_id)) || '',
    identityId: safeString(hr.identity_id), identity: identMap.get(safeString(hr.identity_id)) || '',
    workGroupId: safeString(hr.work_group_id), workGroup: wgMap.get(safeString(hr.work_group_id)) || ''
  };
}

// getUserHrProfile
router.post('/getUserHrProfile', async (req, res) => {
  try {
    const openid = req.openid;
    const { user, hr } = await getUserWithOrg(openid);
    if (!user) return res.json({ status: 'user_not_found', message: localeCopy.copy_b10d64a68c });
    if (!hr) return res.json({ status: 'user_not_found', message: localeCopy.copy_10d3269bb4 });

    const template = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
    const templateData = template ? {
      description: template.description || '',
      editMode: template.edit_mode || 'direct',
      modeText: MODE_TEXT_MAP[template.edit_mode || 'direct'] || MODE_TEXT_MAP.direct,
      fields: template.id
        ? (await profileFieldModel.getByTemplateId(template.id)).map((f) => ({
            id: f.id, label: f.label, type: f.type, required: !!f.required,
            minLength: f.min_length, maxLength: f.max_length,
            numberRule: f.number_rule, allowDecimal: !!f.allow_decimal,
            minDigits: f.min_digits, maxDigits: f.max_digits,
            minValue: f.min_value, maxValue: f.max_value,
            options: f.options_json ? JSON.parse(f.options_json) : []
          }))
        : []
    } : null;

    const record = await profileRecordModel.getByHrId(hr.id);
    const activeFieldIds = new Set(templateData ? templateData.fields.map((field) => field.id) : []);
    let values = {};
    let pendingValues = {};
    if (record) {
      const [vals, pvals] = await Promise.all([
        profileValueModel.getByRecordIdAndPending(record.id, 0),
        profileValueModel.getByRecordIdAndPending(record.id, 1)
      ]);
      vals.forEach((v) => { if (activeFieldIds.has(v.field_id)) values[v.field_id] = v.field_value; });
      pvals.forEach((v) => { if (activeFieldIds.has(v.field_id)) pendingValues[v.field_id] = v.field_value; });
    }
    const person = await personIdentityOverviewModel.resolvePersonByLegacyHrId(hr.id);
    if (person && templateData && templateData.fields.length) {
      const globalRows = await personProfileValueModel.listForPerson(person.id);
      const globalValues = personProfileValueModel.mapRows(globalRows);
      templateData.fields.forEach((field) => {
        const shared = globalValues[personProfileValueModel.key(field.label, field.type)];
        if (shared) values[field.id] = shared.field_value == null ? '' : String(shared.field_value);
      });
    }

    let auditStatus = record ? (record.audit_status || 'none') : 'none';
    const rejectionReason = record ? (record.rejection_reason || '') : '';

    // Override status to 'none' if any required field is empty
    if (templateData && templateData.fields && auditStatus !== 'none') {
      const requiredFields = templateData.fields.filter((f) => f.required);
      if (requiredFields.length > 0) {
        const hasEmptyRequired = requiredFields.some((f) => {
          const val = values[f.id];
          return !val || !String(val).trim();
        });
        if (hasEmptyRequired) {
          auditStatus = 'none';
        }
      }
    }

    const statusTextMap = { pending: '已提交待审核', rejected: '上次申请未通过', approved: '资料已保存' };

    res.json({
      status: 'success',
      profile: await enrichHrWithOrg(hr),
      template: templateData,
      values, pendingValues, auditStatus, rejectionReason,
      statusText: statusTextMap[auditStatus] || localeCopy.copy_ede4536b9a
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// submitUserHrProfile
router.post('/submitUserHrProfile', async (req, res) => {
  try {
    const openid = req.openid;
    const values = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
    const { user, hr } = await getUserWithOrg(openid);
    if (!user) return res.json({ status: 'user_not_found', message: localeCopy.copy_b10d64a68c });
    if (!hr) return res.json({ status: 'user_not_found', message: localeCopy.copy_10d3269bb4 });

    const template = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
    if (!template) return res.json({ status: 'missing_template', message: localeCopy.copy_8e41ad7690 });

    const editMode = template.edit_mode || 'direct';
    if (editMode === 'readonly') return res.json({ status: 'readonly', message: localeCopy.copy_a3d05cdf3f });

    const fields = template.id ? await profileFieldModel.getByTemplateId(template.id) : [];
    const normalizedFields = fields.map((f) => ({
      id: f.id, label: f.label, type: f.type, required: !!f.required,
      minLength: f.min_length, maxLength: f.max_length,
      numberRule: f.number_rule, allowDecimal: !!f.allow_decimal,
      minDigits: f.min_digits, maxDigits: f.max_digits,
      minValue: f.min_value, maxValue: f.max_value,
      options: f.options_json ? JSON.parse(f.options_json) : []
    }));

    const normalizedValues = {};
    const activeFieldIds = normalizedFields.map((field) => field.id);
    for (const field of normalizedFields) {
      const rawValue = values[field.id];
      const err = validateFieldValue(field, rawValue);
      if (err) return res.json({ status: 'invalid_params', message: err });
      normalizedValues[field.id] = rawValue == null ? '' : String(rawValue).trim();
      if (field.type === 'date' && normalizedValues[field.id]) {
        const parsed = tryParseDate(normalizedValues[field.id]);
        if (parsed) normalizedValues[field.id] = parsed;
      }
    }

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const existing = await profileRecordModel.getByHrId(hr.id);
    let effectiveRecordId = existing ? existing.id : '';

    if (existing) {
      const currentVals = await profileValueModel.getByRecordIdAndPending(existing.id, 0);
      const currentValues = {};
      currentVals.forEach((v) => { currentValues[v.field_id] = v.field_value; });

      if (editMode === 'audit') {
        await profileRecordModel.update(existing.id, {
          template_snapshot_id: template.id,
          audit_status: 'pending', rejection_reason: '', requested_at: nowUtc, updated_at: nowUtc
        });
        await profileValueModel.removeByRecordIdAndPendingFields(existing.id, 1, activeFieldIds);
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), existing.id, 1, fieldId, fieldValue);
        }
      } else {
        await profileRecordModel.update(existing.id, {
          template_snapshot_id: template.id,
          audit_status: 'approved', rejection_reason: '', reviewed_at: nowUtc, updated_at: nowUtc
        });
        await profileValueModel.removeByRecordIdAndPendingFields(existing.id, 0, activeFieldIds);
        await profileValueModel.removeByRecordIdAndPendingFields(existing.id, 1, activeFieldIds);
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), existing.id, 0, fieldId, fieldValue);
        }
      }
    } else {
      const recordId = generateId();
      effectiveRecordId = recordId;
      if (editMode === 'audit') {
        await profileRecordModel.create(recordId, {
          hrId: hr.id, name: hr.name || '', openid, templateSnapshotId: template.id,
          auditStatus: 'pending', requestedAt: nowUtc
        });
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), recordId, 1, fieldId, fieldValue);
        }
      } else {
        await profileRecordModel.create(recordId, {
          hrId: hr.id, name: hr.name || '', openid, templateSnapshotId: template.id,
          auditStatus: 'approved', reviewedAt: nowUtc
        });
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), recordId, 0, fieldId, fieldValue);
        }
      }
    }

    if (editMode !== 'audit') {
      const person = await personIdentityOverviewModel.resolvePersonByLegacyHrId(hr.id);
      if (person && effectiveRecordId) {
        await personProfileValueModel.upsertEffectiveValues(
          person.id, await getCurrentOrgId(), effectiveRecordId, normalizedFields,
          normalizedValues, nowUtc
        );
      }
    }

    res.json({
      status: 'success',
      mode: editMode,
      message: editMode === 'audit' ? '已提交审核，管理员通过后生效' : '人事信息已保存'
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// 共享模板库与当前组织快照
router.post('/listHrProfileTemplates', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.manage', 'hr.profile_templates.select']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_6e88bbec97 });
    const [list, activeSnapshot] = await Promise.all([
      templateLibrary.listTemplates(), templateLibrary.getActiveSnapshot(context.orgId)
    ]);
    return res.json({
      status: 'success', list, activeSnapshot,
      canManage: hasAnyPermission(context.effective, ['hr.profile_templates.manage']),
      canSelect: hasAnyPermission(context.effective, ['hr.profile_templates.select'])
    });
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/saveHrProfileTemplateDefinition', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.manage']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_6e88bbec97 });
    return res.json(await templateLibrary.saveDefinition(req.body || {}, context.admin));
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/duplicateHrProfileTemplateDefinition', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.manage']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_6e88bbec97 });
    return res.json(await templateLibrary.duplicateDefinition(safeString(req.body.id), context.admin));
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/deleteHrProfileTemplateDefinition', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.manage']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_6e88bbec97 });
    return res.json(await templateLibrary.deleteDefinition(safeString(req.body.id)));
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/getHrProfileTemplateSwitchContext', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.select']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_04b27bdf7e });
    const result = await templateLibrary.getSwitchContext(context.orgId, safeString(req.body.targetTemplateId));
    return res.json(result ? { status: 'success', ...result } : { status: 'not_found', message: localeCopy.copy_53d06945ab });
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/previewHrProfileTemplateSwitch', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.select']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_04b27bdf7e });
    return res.json(await templateLibrary.preflightSwitch(
      context.orgId, safeString(req.body.targetTemplateId), req.body.fieldActions
    ));
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/applyHrProfileTemplateSwitch', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.select']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_04b27bdf7e });
    return res.json(await templateLibrary.applySwitch(
      context.orgId, safeString(req.body.targetTemplateId), req.body.fieldActions,
      safeString(req.body.switchToken), req.body.confirmDelete === true, context.admin
    ));
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/saveOrgHrProfileTemplateSettings', async (req, res) => {
  try {
    const context = await ensureTemplatePermission(req, ['hr.profile_templates.select']);
    if (!context) return res.json({ status: 'forbidden', message: localeCopy.copy_04b27bdf7e });
    return res.json(await templateLibrary.saveOrgSettings(
      context.orgId, safeString(req.body.description), safeString(req.body.editMode || 'direct'), context.admin
    ));
  } catch (e) {
    return res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveHrProfileTemplate — 旧客户端禁止修改快照结构
router.post('/saveHrProfileTemplate', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    return res.json({ status: 'client_upgrade_required', message: localeCopy.copy_b71a0c7ed7 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listHrProfileAdminData
router.post('/listHrProfileAdminData', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const orgId = await getCurrentOrgId();
    const [template, hrRows, records] = await Promise.all([
      profileTemplateModel.getByTemplateKey(TEMPLATE_KEY),
      hrInfoModel.getAll(),
      profileRecordModel.getAll()
    ]);

    const [bindingStates, assignmentSummaries] = await Promise.all([
      resolveHrBindingStates(hrRows, orgId),
      unifiedIdentityModel.listMembershipAssignmentSummaries(hrRows.map((row) => row.id), orgId)
    ]);

    const recordMap = new Map(records.map((r) => [safeString(r.hr_id), r]));

    const recordIds = records.map(r => r.id).filter(Boolean);
    const [allCurrentValues, allPendingValues] = await Promise.all([
      recordIds.length ? profileValueModel.getByRecordIdsAndPending(recordIds, 0) : [],
      recordIds.length ? profileValueModel.getByRecordIdsAndPending(recordIds, 1) : []
    ]);

    const currentValuesByRecord = new Map();
    allCurrentValues.forEach(v => {
      if (!currentValuesByRecord.has(v.record_id)) currentValuesByRecord.set(v.record_id, {});
      currentValuesByRecord.get(v.record_id)[v.field_id] = v.field_value;
    });
    const pendingValuesByRecord = new Map();
    allPendingValues.forEach(v => {
      if (!pendingValuesByRecord.has(v.record_id)) pendingValuesByRecord.set(v.record_id, {});
      pendingValuesByRecord.get(v.record_id)[v.field_id] = v.field_value;
    });

    const legacyHrIds = hrRows.map((row) => safeString(row.id)).filter(Boolean);
    const personByHrId = new Map();
    let sharedValuesByPerson = new Map();
    if (legacyHrIds.length) {
      const hrPlaceholders = legacyHrIds.map(() => '?').join(',');
      const [personRows] = await pool.query(
        `SELECT legacy_hr_id, person_id FROM organization_memberships
          WHERE legacy_hr_id IN (${hrPlaceholders}) AND org_id = ? AND status = 'active'`,
        legacyHrIds.concat([orgId])
      );
      personRows.forEach((item) => personByHrId.set(safeString(item.legacy_hr_id), safeString(item.person_id)));
      const personIds = personRows.map((item) => safeString(item.person_id)).filter(Boolean);
      const sharedRows = await personProfileValueModel.listForPersons(personIds);
      sharedRows.forEach((item) => {
        const byPerson = sharedValuesByPerson.get(safeString(item.person_id)) || {};
        byPerson[personProfileValueModel.key(item.normalized_label || item.field_label, item.field_type)] = item;
        sharedValuesByPerson.set(safeString(item.person_id), byPerson);
      });
    }

    const fields = template && template.id ? await profileFieldModel.getByTemplateId(template.id) : [];
    const fieldObjs = fields.map((f) => ({
      id: f.id, label: f.label, type: f.type, required: !!f.required,
      options: f.options_json ? JSON.parse(f.options_json) : []
    }));
    const activeFieldIds = new Set(fieldObjs.map((field) => field.id));

    const summarizeValues = (valsMap) => fieldObjs
      .map((f) => { const v = valsMap[f.id]; return v ? `${f.label}：${v}` : ''; })
      .filter(Boolean).join('；');

    const requiredFields = fieldObjs.filter((f) => f.required);

    const rows = [];
    for (const item of hrRows) {
      const record = recordMap.get(item.id);
      const currentRaw = record ? (currentValuesByRecord.get(record.id) || {}) : {};
      const pendingRaw = record ? (pendingValuesByRecord.get(record.id) || {}) : {};
      const currentValues = Object.keys(currentRaw).reduce((result, fieldId) => {
        if (activeFieldIds.has(fieldId)) result[fieldId] = currentRaw[fieldId];
        return result;
      }, {});
      const sharedValues = sharedValuesByPerson.get(personByHrId.get(safeString(item.id))) || {};
      fieldObjs.forEach((field) => {
        const shared = sharedValues[personProfileValueModel.key(field.label, field.type)];
        if (shared) currentValues[field.id] = shared.field_value == null ? '' : String(shared.field_value);
      });
      const pendingValues = Object.keys(pendingRaw).reduce((result, fieldId) => {
        if (activeFieldIds.has(fieldId)) result[fieldId] = pendingRaw[fieldId];
        return result;
      }, {});
      let auditStatus = safeString(record ? record.audit_status || 'none' : 'none') || 'none';

      // Override status to 'none' if any required field is empty
      if (requiredFields.length > 0 && auditStatus !== 'none') {
        const hasEmptyRequired = requiredFields.some((f) => {
          const val = currentValues[f.id];
          return !val || !String(val).trim();
        });
        if (hasEmptyRequired) {
          auditStatus = 'none';
        }
      }

      const statusTextMap = { pending: '待审核', approved: '已生效', rejected: '已驳回' };
      const binding = bindingStates.get(safeString(item.id)) || {
        status: 'unbound',
        userInfoId: '',
        boundOpenid: ''
      };
      const assignmentSummary = assignmentSummaries.get(safeString(item.id)) || {
        count: 0,
        departments: [],
        identities: [],
        workGroups: []
      };
      rows.push({
        id: item.id,
        recordId: safeString(record ? record.id : ''),
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        assignmentCount: assignmentSummary.count,
        departments: assignmentSummary.departments,
        identities: assignmentSummary.identities,
        workGroups: assignmentSummary.workGroups,
        department: assignmentSummary.departments.join('、'),
        identity: assignmentSummary.identities.join('、'),
        workGroup: assignmentSummary.workGroups.join('、'),
        currentSummary: summarizeValues(currentValues) || localeCopy.copy_4049b5c6cd,
        pendingSummary: summarizeValues(pendingValues),
        currentValues,
        pendingValues,
        auditStatus,
        auditStatusText: statusTextMap[auditStatus] || localeCopy.copy_67f2697101,
        rejectionReason: safeString(record ? record.rejection_reason : ''),
        hasPending: auditStatus === 'pending' && Object.keys(pendingValues).length > 0,
        userInfoId: binding.userInfoId,
        boundOpenid: binding.boundOpenid ? safeString(binding.boundOpenid).slice(0, 8) + '***' : '',
        wxBindStatus: binding.status
      });
    }
    res.json({
      status: 'success',
      template: template ? {
        description: template.description || '',
        editMode: template.edit_mode || 'direct',
        modeText: MODE_TEXT_MAP[template.edit_mode || 'direct'] || MODE_TEXT_MAP.direct,
        fields: fields.map((f) => ({
          id: f.id, label: f.label, type: f.type, required: !!f.required,
          minLength: f.min_length, maxLength: f.max_length,
          numberRule: f.number_rule, allowDecimal: !!f.allow_decimal,
          minDigits: f.min_digits, maxDigits: f.max_digits,
          minValue: f.min_value, maxValue: f.max_value,
          options: f.options_json ? JSON.parse(f.options_json) : []
        }))
      } : null,
      rows
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// reviewHrProfileChange
router.post('/reviewHrProfileChange', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const studentId = safeString(req.body.studentId);
    const action = safeString(req.body.action);
    const reason = safeString(req.body.reason);

    if (!studentId || ['approve', 'reject'].indexOf(action) === -1) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_2941385e2b });
    }

    const hrRecord = await hrInfoModel.getByStudentId(studentId);
    if (!hrRecord) return res.json({ status: 'not_found', message: localeCopy.copy_8709282967 });

    const record = await profileRecordModel.getByHrId(hrRecord.id);
    if (!record) return res.json({ status: 'not_found', message: localeCopy.copy_8709282967 });

    const activeTemplate = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
    const activeFields = activeTemplate ? await profileFieldModel.getByTemplateId(activeTemplate.id) : [];
    const activeFieldIds = new Set(activeFields.map((field) => field.id));
    const pendingVals = record.id
      ? (await profileValueModel.getByRecordIdAndPending(record.id, 1)).filter((value) => activeFieldIds.has(value.field_id))
      : [];
    if (!pendingVals.length) return res.json({ status: 'invalid_operation', message: localeCopy.copy_0095182bd4 });

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (action === 'approve') {
      // Move pending values to active
      await profileValueModel.removeByRecordIdAndPendingFields(record.id, 0, Array.from(activeFieldIds));
      for (const v of pendingVals) {
        await profileValueModel.create(generateId(), record.id, 0, v.field_id, v.field_value);
      }
      await profileValueModel.removeByRecordIdAndPendingFields(record.id, 1, Array.from(activeFieldIds));
      await profileRecordModel.update(record.id, {
        audit_status: 'approved', rejection_reason: '', reviewed_at: nowUtc, updated_at: nowUtc
      });
      const person = await personIdentityOverviewModel.resolvePersonByLegacyHrId(hrRecord.id);
      if (person) {
        const pendingByField = {};
        pendingVals.forEach((value) => { pendingByField[value.field_id] = value.field_value; });
        await personProfileValueModel.upsertEffectiveValues(
          person.id, await getCurrentOrgId(), record.id,
          activeFields.map((field) => ({
            id: field.id,
            label: field.label,
            type: field.type
          })), pendingByField, nowUtc
        );
      }
    } else {
      await profileValueModel.removeByRecordIdAndPendingFields(record.id, 1, Array.from(activeFieldIds));
      await profileRecordModel.update(record.id, {
        audit_status: 'rejected', rejection_reason: reason || localeCopy.copy_7ba1f77c14, reviewed_at: nowUtc, updated_at: nowUtc
      });
    }

    await createNotification({
      hrId: hrRecord.id,
      eventKey: 'hr-profile-review:' + record.id + ':' + nowUtc,
      type: action === 'approve' ? 'hr_profile_approved' : 'hr_profile_rejected',
      title: action === 'approve' ? '补充资料审核通过' : '补充资料审核未通过',
      description: action === 'approve' ? '您提交的人事补充资料已审核通过。' : ('您提交的人事补充资料未通过审核：' + (reason || localeCopy.copy_1198118dbe)),
      category: 'hr',
      targetType: 'hr_profile',
      targetId: hrRecord.id,
      targetUrl: '/subpackages/workspace/pages/home/home?subApp=hr'
    });

    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// getHrPersonDetail
router.post('/getHrPersonDetail', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const hrId = safeString(req.body.hrId);
    if (!hrId) return res.json({ status: 'invalid_params', message: localeCopy.copy_eb00430bd4 });

    const hr = await hrInfoModel.getById(hrId);
    if (!hr) return res.json({ status: 'not_found', message: localeCopy.copy_9ccefa96da });

    const template = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
    const templateData = template ? {
      description: template.description || '',
      editMode: template.edit_mode || 'direct',
      modeText: MODE_TEXT_MAP[template.edit_mode || 'direct'] || MODE_TEXT_MAP.direct,
      fields: template.id
        ? (await profileFieldModel.getByTemplateId(template.id)).map((f) => ({
            id: f.id, label: f.label, type: f.type, required: !!f.required,
            minLength: f.min_length, maxLength: f.max_length,
            numberRule: f.number_rule, allowDecimal: !!f.allow_decimal,
            minDigits: f.min_digits, maxDigits: f.max_digits,
            minValue: f.min_value, maxValue: f.max_value,
            options: f.options_json ? JSON.parse(f.options_json) : []
          }))
        : []
    } : null;

    const record = await profileRecordModel.getByHrId(hrId);
    const activeFieldIds = new Set(templateData ? templateData.fields.map((field) => field.id) : []);
    let values = {};
    let pendingValues = {};
    if (record) {
      const [vals, pvals] = await Promise.all([
        profileValueModel.getByRecordIdAndPending(record.id, 0),
        profileValueModel.getByRecordIdAndPending(record.id, 1)
      ]);
      vals.forEach((v) => { if (activeFieldIds.has(v.field_id)) values[v.field_id] = v.field_value; });
      pvals.forEach((v) => { if (activeFieldIds.has(v.field_id)) pendingValues[v.field_id] = v.field_value; });
    }

    const person = await personIdentityOverviewModel.resolvePersonByLegacyHrId(hrId);
    if (person && templateData && templateData.fields.length) {
      const globalRows = await personProfileValueModel.listForPerson(person.id);
      const globalValues = personProfileValueModel.mapRows(globalRows);
      templateData.fields.forEach((field) => {
        const shared = globalValues[personProfileValueModel.key(field.label, field.type)];
        if (shared) values[field.id] = shared.field_value == null ? '' : String(shared.field_value);
      });
    }

    let auditStatus = record ? (record.audit_status || 'none') : 'none';
    const rejectionReason = record ? (record.rejection_reason || '') : '';

    // Override status to 'none' if any required field is empty
    if (templateData && templateData.fields && auditStatus !== 'none') {
      const requiredFields = templateData.fields.filter((f) => f.required);
      if (requiredFields.length > 0) {
        const hasEmptyRequired = requiredFields.some((f) => {
          const val = values[f.id];
          return !val || !String(val).trim();
        });
        if (hasEmptyRequired) {
          auditStatus = 'none';
        }
      }
    }

    const statusTextMap = { pending: '已提交待审核', rejected: '上次申请未通过', approved: '资料已保存' };

    res.json({
      status: 'success',
      profile: await enrichHrWithOrg(hr),
      template: templateData,
      values,
      pendingValues,
      auditStatus,
      auditStatusText: statusTextMap[auditStatus] || localeCopy.copy_67f2697101,
      rejectionReason,
      hasPending: auditStatus === 'pending' && Object.keys(pendingValues).length > 0
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveHrPersonFull
router.post('/saveHrPersonFull', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const hrId = safeString(req.body.hrId);
    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const profileValues = req.body.profileValues && typeof req.body.profileValues === 'object' ? req.body.profileValues : {};

    if (!name || !studentId) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_2ffe8c71d9 });
    }
    if (!hrId) return res.json({ status: 'invalid_params', message: localeCopy.copy_eb00430bd4 });

    const hr = await hrInfoModel.getById(hrId);
    if (!hr) return res.json({ status: 'not_found', message: localeCopy.copy_9ccefa96da });
    const canManagePeople = Boolean(req.adminPermissions && (
      (req.adminPermissions.permissions && req.adminPermissions.permissions['hr.people'])
      || req.adminPermissions['hr.people']
    ));
    if (!canManagePeople) {
      const basicInfoChanged = name !== safeString(hr.name)
        || studentId !== safeString(hr.student_id);
      if (basicInfoChanged) {
        return res.json({ status: 'permission_denied', message: localeCopy.copy_b0fe1df7fb });
      }
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (canManagePeople) {
      await hrInfoModel.updatePersonBasics(hrId, {
        name, studentId,
        updatedAt: now
      });
    }

    if (Object.keys(profileValues).length > 0) {
      const template = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
      if (!template) return res.json({ status: 'missing_template', message: localeCopy.copy_8e41ad7690 });

      const fields = template.id ? await profileFieldModel.getByTemplateId(template.id) : [];
      const normalizedFields = fields.map((f) => ({
        id: f.id, label: f.label, type: f.type, required: !!f.required,
        minLength: f.min_length, maxLength: f.max_length,
        numberRule: f.number_rule, allowDecimal: !!f.allow_decimal,
        minDigits: f.min_digits, maxDigits: f.max_digits,
        minValue: f.min_value, maxValue: f.max_value,
        options: f.options_json ? JSON.parse(f.options_json) : []
      }));

      const fieldMap = new Map(normalizedFields.map((f) => [f.id, f]));
      const normalizedValues = {};
      for (const [fieldId, rawValue] of Object.entries(profileValues)) {
        const field = fieldMap.get(fieldId);
        if (!field) continue;
        const err = validateFieldValue(field, rawValue, true);
        if (err) return res.json({ status: 'invalid_params', message: err });
        normalizedValues[fieldId] = rawValue == null ? '' : String(rawValue).trim();
        if (field.type === 'date' && normalizedValues[fieldId]) {
          const parsed = tryParseDate(normalizedValues[fieldId]);
          if (parsed) normalizedValues[fieldId] = parsed;
        }
      }

      const existing = await profileRecordModel.getByHrId(hrId);

      if (existing) {
        await profileValueModel.removeByRecordIdAndPendingFields(
          existing.id, 0, normalizedFields.map((field) => field.id)
        );
        await profileValueModel.removeByRecordIdAndPendingFields(
          existing.id, 1, normalizedFields.map((field) => field.id)
        );
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), existing.id, 0, fieldId, fieldValue);
        }
        await profileRecordModel.update(existing.id, {
          templateSnapshotId: template.id,
          auditStatus: 'approved', rejectionReason: '', reviewedAt: now, updatedAt: now
        });
        const person = await personIdentityOverviewModel.resolvePersonByLegacyHrId(hrId);
        if (person) {
          await personProfileValueModel.upsertEffectiveValues(
            person.id, await getCurrentOrgId(), existing.id, normalizedFields, normalizedValues, now
          );
        }
      } else {
        const recordId = generateId();
        await profileRecordModel.create(recordId, {
          hrId, name, openid, templateSnapshotId: template.id,
          auditStatus: 'approved', reviewedAt: now
        });
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), recordId, 0, fieldId, fieldValue);
        }
        const person = await personIdentityOverviewModel.resolvePersonByLegacyHrId(hrId);
        if (person) {
          await personProfileValueModel.upsertEffectiveValues(
            person.id, await getCurrentOrgId(), recordId, normalizedFields, normalizedValues, now
          );
        }
      }
    }

    res.json({ status: 'success', message: localeCopy.copy_3c00278e45 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
