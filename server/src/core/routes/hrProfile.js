const express = require('express');
const router = express.Router();
const { safeString, generateId, buildNameMap, normalizeEmptyValue } = require('../../utils/helpers');
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

const TEMPLATE_KEY = 'default_hr_profile_template';
const EDIT_MODES = ['direct', 'audit', 'readonly'];
const FIELD_TYPES = ['text', 'number', 'sequence', 'date', 'phone', 'email'];
const NUMBER_RULE_TYPES = ['value_range', 'length_range'];
const MODE_TEXT_MAP = { direct: '允许直接修改', audit: '需审核后生效', readonly: '不允许自行修改' };

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
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
  if (field.required && !value && !isAdmin) return `${field.label}不能为空`;
  if (!value) return '';
  if (field.type === 'text') {
    if (field.minLength != null && value.length < field.minLength) return `${field.label}长度不能少于 ${field.minLength}`;
    if (field.maxLength != null && value.length > field.maxLength) return `${field.label}长度不能超过 ${field.maxLength}`;
    return '';
  }
  if (field.type === 'number') {
    if (field.allowDecimal === false && !/^[+-]?\d+$/.test(value)) return `${field.label}必须是整数`;
    const num = Number(value);
    if (!Number.isFinite(num)) return `${field.label}必须是数字`;
    if (field.numberRule === 'length_range') {
      const nlen = String(value).replace(/^[+-]/, '').replace('.', '').length;
      if (field.minDigits != null && nlen < field.minDigits) return `${field.label}长度不能少于 ${field.minDigits}`;
      if (field.maxDigits != null && nlen > field.maxDigits) return `${field.label}长度不能超过 ${field.maxDigits}`;
    } else {
      if (field.minValue != null && num < field.minValue) return `${field.label}不能小于 ${field.minValue}`;
      if (field.maxValue != null && num > field.maxValue) return `${field.label}不能大于 ${field.maxValue}`;
    }
    return '';
  }
  if (field.type === 'sequence') { if (field.options.indexOf(value) === -1) return `${field.label}必须从预设选项中选择`; return ''; }
  if (field.type === 'date' && !tryParseDate(value)) return `${field.label}必须是有效日期`;
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) return `${field.label}必须是有效手机号`;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${field.label}必须是有效邮箱`;
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
    if (!user) return res.json({ status: 'user_not_found', message: '未找到当前用户信息，请重新登录' });
    if (!hr) return res.json({ status: 'user_not_found', message: '当前用户未绑定人事成员' });

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
    let values = {};
    let pendingValues = {};
    if (record) {
      const [vals, pvals] = await Promise.all([
        profileValueModel.getByRecordIdAndPending(record.id, 0),
        profileValueModel.getByRecordIdAndPending(record.id, 1)
      ]);
      vals.forEach((v) => { values[v.field_id] = v.field_value; });
      pvals.forEach((v) => { pendingValues[v.field_id] = v.field_value; });
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
      statusText: statusTextMap[auditStatus] || '尚未提交扩展资料'
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
    if (!user) return res.json({ status: 'user_not_found', message: '未找到当前用户信息，请重新登录' });
    if (!hr) return res.json({ status: 'user_not_found', message: '当前用户未绑定人事成员，请重新绑定' });

    const template = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
    if (!template) return res.json({ status: 'missing_template', message: '管理员尚未配置人事信息模板' });

    const editMode = template.edit_mode || 'direct';
    if (editMode === 'readonly') return res.json({ status: 'readonly', message: '当前模板不允许自行修改，请联系管理员' });

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

    if (existing) {
      const currentVals = await profileValueModel.getByRecordIdAndPending(existing.id, 0);
      const currentValues = {};
      currentVals.forEach((v) => { currentValues[v.field_id] = v.field_value; });

      if (editMode === 'audit') {
        await profileRecordModel.update(existing.id, {
          audit_status: 'pending', rejection_reason: '', requested_at: nowUtc, updated_at: nowUtc
        });
        await profileValueModel.removeByRecordIdAndPending(existing.id, 1);
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), existing.id, 1, fieldId, fieldValue);
        }
      } else {
        await profileRecordModel.update(existing.id, {
          audit_status: 'approved', rejection_reason: '', reviewed_at: nowUtc, updated_at: nowUtc
        });
        await profileValueModel.removeByRecordId(existing.id);
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), existing.id, 0, fieldId, fieldValue);
        }
      }
    } else {
      const recordId = generateId();
      if (editMode === 'audit') {
        await profileRecordModel.create(recordId, {
          hrId: hr.id, name: hr.name || '', openid, templateKey: TEMPLATE_KEY,
          templateUpdatedAt: template.updated_at, auditStatus: 'pending', requestedAt: nowUtc
        });
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), recordId, 1, fieldId, fieldValue);
        }
      } else {
        await profileRecordModel.create(recordId, {
          hrId: hr.id, name: hr.name || '', openid, templateKey: TEMPLATE_KEY,
          templateUpdatedAt: template.updated_at, auditStatus: 'approved', reviewedAt: nowUtc
        });
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), recordId, 0, fieldId, fieldValue);
        }
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

// saveHrProfileTemplate
router.post('/saveHrProfileTemplate', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    const description = safeString(req.body.description);
    const editMode = safeString(req.body.editMode || 'direct');
    const fields = Array.isArray(req.body.fields) ? req.body.fields : [];

    if (!EDIT_MODES.includes(editMode)) return res.json({ status: 'invalid_params', message: '编辑模式不合法' });

    const normalizedFields = fields.map((field, index) => {
      const id = safeString(field.id || generateId());
      const label = safeString(field.label);
      const type = safeString(field.type || 'text');
      const required = field.required === true;
      const minLength = field.minLength === '' || field.minLength == null ? null : Number(field.minLength);
      const maxLength = field.maxLength === '' || field.maxLength == null ? null : Number(field.maxLength);
      const numberRule = safeString(field.numberRule || 'value_range');
      const allowDecimal = field.allowDecimal !== false;
      const minDigits = field.minDigits === '' || field.minDigits == null ? null : Number(field.minDigits);
      const maxDigits = field.maxDigits === '' || field.maxDigits == null ? null : Number(field.maxDigits);
      const minValue = field.minValue === '' || field.minValue == null ? null : Number(field.minValue);
      const maxValue = field.maxValue === '' || field.maxValue == null ? null : Number(field.maxValue);
      const options = Array.isArray(field.options) ? field.options.map((item) => safeString(item)).filter(Boolean) : [];
      return { id, label, type, required,
        minLength: Number.isFinite(minLength) ? minLength : null,
        maxLength: Number.isFinite(maxLength) ? maxLength : null,
        numberRule: NUMBER_RULE_TYPES.includes(numberRule) ? numberRule : 'value_range',
        allowDecimal, minDigits: Number.isFinite(minDigits) ? minDigits : null,
        maxDigits: Number.isFinite(maxDigits) ? maxDigits : null,
        minValue: Number.isFinite(minValue) ? minValue : null,
        maxValue: Number.isFinite(maxValue) ? maxValue : null,
        options };
    });

    if (!normalizedFields.length) return res.json({ status: 'invalid_params', message: '至少需要配置一个字段' });

    const fieldIdSet = new Set();
    for (const field of normalizedFields) {
      if (fieldIdSet.has(field.id)) return res.json({ status: 'invalid_params', message: '字段标识重复，请刷新后重试' });
      fieldIdSet.add(field.id);
      if (!field.label) return res.json({ status: 'invalid_params', message: '字段名称不能为空' });
      if (!FIELD_TYPES.includes(field.type)) return res.json({ status: 'invalid_params', message: '字段类型不合法' });
      if (field.type === 'sequence' && !field.options.length) return res.json({ status: 'invalid_params', message: '序列字段至少需要一个可选项' });
    }

    const pool = require('../../config/db');
const { withTransaction } = pool;
    const { getCurrentOrgId } = require('../../utils/orgContext');
    const orgId = await getCurrentOrgId();
    await withTransaction(async (conn) => {
      let templateId;
      const [existingRows] = await conn.query(
        'SELECT * FROM hr_profile_templates WHERE template_key = ? AND org_id = ?',
        [TEMPLATE_KEY, orgId]
      );
      const existing = existingRows[0] || null;

      if (existing) {
        templateId = existing.id;
        const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await conn.query(
          'UPDATE hr_profile_templates SET description = ?, edit_mode = ?, updated_by = ?, updated_at = ? WHERE id = ? AND org_id = ?',
          [description, editMode, admin.id, nowUtc, existing.id, orgId]
        );
        await conn.query('DELETE FROM hr_profile_template_fields WHERE template_id = ? AND org_id = ?', [existing.id, orgId]);
      } else {
        templateId = generateId();
        await conn.query(
          'INSERT INTO hr_profile_templates (id, template_key, description, edit_mode, updated_by, org_id) VALUES (?, ?, ?, ?, ?, ?)',
          [templateId, TEMPLATE_KEY, description, editMode, admin.id, orgId]
        );
      }

      for (let i = 0; i < normalizedFields.length; i++) {
        const f = normalizedFields[i];
        await conn.query(
          `INSERT INTO hr_profile_template_fields (id, template_id, sort_order, label, type, required,
           min_length, max_length, number_rule, allow_decimal, min_digits, max_digits, min_value, max_value, options_json, org_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [f.id, templateId, i + 1, f.label, f.type, f.required ? 1 : 0,
           f.minLength, f.maxLength, f.numberRule, f.allowDecimal ? 1 : 0,
           f.minDigits, f.maxDigits, f.minValue, f.maxValue,
           f.options.length ? JSON.stringify(f.options) : null, orgId]
        );
      }
    });

    res.json({ status: 'success', template: { description, editMode, fields: normalizedFields } });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listHrProfileAdminData
router.post('/listHrProfileAdminData', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    const orgId = await getCurrentOrgId();
    const [template, hrRows, records, departments, identities, workGroups] = await Promise.all([
      profileTemplateModel.getByTemplateKey(TEMPLATE_KEY),
      hrInfoModel.getAll(),
      profileRecordModel.getAll(),
      departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll()
    ]);

    // 查询用户微信绑定状态
    let bindingMap = new Map();
    if (hrRows.length) {
      const hrIds = hrRows.map(r => r.id);
      const placeholders = hrIds.map(() => '?').join(',');
      const [bindings] = await pool.query(
        `SELECT ui.hr_id, ui.id as user_info_id, ui.openid
         FROM user_info ui
         WHERE ui.hr_id IN (${placeholders}) AND ui.org_id = ?`,
        [...hrIds, orgId]
      );
      bindings.forEach(b => {
        bindingMap.set(safeString(b.hr_id), {
          userInfoId: b.user_info_id || '',
          boundOpenid: b.openid ? safeString(b.openid).slice(0, 8) + '***' : '',
          wxBindStatus: b.user_info_id ? 'bound' : 'unbound'
        });
      });
    }

    const deptMap = buildNameMap(departments);
    const identMap = buildNameMap(identities);
    const wgMap = buildNameMap(workGroups);
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

    const fields = template && template.id ? await profileFieldModel.getByTemplateId(template.id) : [];
    const fieldObjs = fields.map((f) => ({
      id: f.id, label: f.label, type: f.type, required: !!f.required,
      options: f.options_json ? JSON.parse(f.options_json) : []
    }));

    const summarizeValues = (valsMap) => fieldObjs
      .map((f) => { const v = valsMap[f.id]; return v ? `${f.label}：${v}` : ''; })
      .filter(Boolean).join('；');

    const requiredFields = fieldObjs.filter((f) => f.required);

    const rows = [];
    for (const item of hrRows) {
      const record = recordMap.get(item.id);
      const currentValues = record ? (currentValuesByRecord.get(record.id) || {}) : {};
      const pendingValues = record ? (pendingValuesByRecord.get(record.id) || {}) : {};
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
      const binding = bindingMap.get(safeString(item.id)) || { userInfoId: '', boundOpenid: '', wxBindStatus: 'unbound' };
      rows.push({
        id: item.id,
        recordId: safeString(record ? record.id : ''),
        name: safeString(item.name),
        studentId: safeString(item.student_id),
        department: deptMap.get(safeString(item.department_id)) || '',
        identity: identMap.get(safeString(item.identity_id)) || '',
        workGroup: wgMap.get(safeString(item.work_group_id)) || '',
        currentSummary: summarizeValues(currentValues) || '暂无扩展资料',
        pendingSummary: summarizeValues(pendingValues),
        auditStatus,
        auditStatusText: statusTextMap[auditStatus] || '未提交',
        rejectionReason: safeString(record ? record.rejection_reason : ''),
        hasPending: auditStatus === 'pending' && Object.keys(pendingValues).length > 0,
        userInfoId: binding.userInfoId,
        boundOpenid: binding.boundOpenid,
        wxBindStatus: binding.wxBindStatus
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    const studentId = safeString(req.body.studentId);
    const action = safeString(req.body.action);
    const reason = safeString(req.body.reason);

    if (!studentId || ['approve', 'reject'].indexOf(action) === -1) {
      return res.json({ status: 'invalid_params', message: '审核参数不合法' });
    }

    const hrRecord = await hrInfoModel.getByStudentId(studentId);
    if (!hrRecord) return res.json({ status: 'not_found', message: '未找到对应的人事信息记录' });

    const record = await profileRecordModel.getByHrId(hrRecord.id);
    if (!record) return res.json({ status: 'not_found', message: '未找到对应的人事信息记录' });

    const pendingVals = record.id ? await profileValueModel.getByRecordIdAndPending(record.id, 1) : [];
    if (!pendingVals.length) return res.json({ status: 'invalid_operation', message: '当前没有待审核的修改' });

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (action === 'approve') {
      // Move pending values to active
      await profileValueModel.removeByRecordIdAndPending(record.id, 0);
      for (const v of pendingVals) {
        await profileValueModel.create(generateId(), record.id, 0, v.field_id, v.field_value);
      }
      await profileValueModel.removeByRecordIdAndPending(record.id, 1);
      await profileRecordModel.update(record.id, {
        audit_status: 'approved', rejection_reason: '', reviewed_at: nowUtc, updated_at: nowUtc
      });
    } else {
      await profileValueModel.removeByRecordIdAndPending(record.id, 1);
      await profileRecordModel.update(record.id, {
        audit_status: 'rejected', rejection_reason: reason || '管理员已驳回本次修改', reviewed_at: nowUtc, updated_at: nowUtc
      });
    }

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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    const hrId = safeString(req.body.hrId);
    if (!hrId) return res.json({ status: 'invalid_params', message: '缺少人事ID' });

    const hr = await hrInfoModel.getById(hrId);
    if (!hr) return res.json({ status: 'not_found', message: '未找到对应的人事信息' });

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
    let values = {};
    let pendingValues = {};
    if (record) {
      const [vals, pvals] = await Promise.all([
        profileValueModel.getByRecordIdAndPending(record.id, 0),
        profileValueModel.getByRecordIdAndPending(record.id, 1)
      ]);
      vals.forEach((v) => { values[v.field_id] = v.field_value; });
      pvals.forEach((v) => { pendingValues[v.field_id] = v.field_value; });
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
      auditStatusText: statusTextMap[auditStatus] || '未提交',
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理员权限' });

    const hrId = safeString(req.body.hrId);
    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const departmentId = safeString(req.body.departmentId);
    const identityId = safeString(req.body.identityId);
    const workGroupId = safeString(req.body.workGroupId);
    const profileValues = req.body.profileValues && typeof req.body.profileValues === 'object' ? req.body.profileValues : {};

    if (!name || !studentId || !departmentId || !identityId) {
      return res.json({ status: 'invalid_params', message: '基础信息不完整' });
    }
    if (!hrId) return res.json({ status: 'invalid_params', message: '缺少人事ID' });

    const hr = await hrInfoModel.getById(hrId);
    if (!hr) return res.json({ status: 'not_found', message: '未找到对应的人事信息' });

    const [departments, identities, workGroups] = await Promise.all([
      departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll()
    ]);
    const deptMap = buildNameMap(departments);
    const identMap = buildNameMap(identities);
    const wgMap = buildNameMap(workGroups);

    if (!deptMap.has(departmentId)) return res.json({ status: 'invalid_params', message: '部门不存在' });
    if (!identMap.has(identityId)) return res.json({ status: 'invalid_params', message: '身份不存在' });
    if (workGroupId && !wgMap.has(workGroupId)) return res.json({ status: 'invalid_params', message: '工作小组不存在' });

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await hrInfoModel.update(hrId, {
      name, studentId, departmentId, identityId, workGroupId,
      updatedAt: now
    });

    if (Object.keys(profileValues).length > 0) {
      const template = await profileTemplateModel.getByTemplateKey(TEMPLATE_KEY);
      if (!template) return res.json({ status: 'missing_template', message: '管理员尚未配置人事信息模板' });

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
        await profileValueModel.removeByRecordId(existing.id);
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), existing.id, 0, fieldId, fieldValue);
        }
        await profileRecordModel.update(existing.id, {
          auditStatus: 'approved', rejectionReason: '', reviewedAt: now, updatedAt: now
        });
      } else {
        const recordId = generateId();
        await profileRecordModel.create(recordId, {
          hrId, name, openid, templateKey: TEMPLATE_KEY,
          templateUpdatedAt: template.updated_at, auditStatus: 'approved', reviewedAt: now
        });
        for (const [fieldId, fieldValue] of Object.entries(normalizedValues)) {
          await profileValueModel.create(generateId(), recordId, 0, fieldId, fieldValue);
        }
      }
    }

    res.json({ status: 'success', message: '人事信息保存成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
