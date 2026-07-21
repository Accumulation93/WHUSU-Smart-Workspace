const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { parseCsv } = require('../../utils/csv');
const { getCurrentOrgId } = require('../../utils/orgContext');
const { isSuperAdmin, canManageTarget } = require('../services/adminAuthorization');

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
  if (field.type === 'sequence') { if (field.options.length && field.options.indexOf(value) === -1) return `${field.label}必须从预设选项中选择`; return ''; }
  if (field.type === 'date' && !tryParseDate(value)) return `${field.label}必须是有效日期`;
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) return `${field.label}必须是有效手机号`;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${field.label}必须是有效邮箱`;
  return '';
}

const TEMPLATE_KEY = 'default_hr_profile_template';

// listHrInfo
router.post('/listHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const orgId = await getCurrentOrgId();
    const [rows] = await pool.query(
      `SELECT h.*, d.name as department_name, i.name as identity_name, wg.name as work_group_name,
              ui.id as user_info_id, ui.openid as bound_openid
       FROM hr_info h
       LEFT JOIN departments d ON h.department_id = d.id AND d.org_id = ?
       LEFT JOIN identities i ON h.identity_id = i.id AND i.org_id = ?
       LEFT JOIN work_groups wg ON h.work_group_id = wg.id AND wg.org_id = ?
       LEFT JOIN user_info ui ON ui.hr_id = h.id AND ui.org_id = ?
       WHERE h.org_id = ?
       ORDER BY h.name`,
      [orgId, orgId, orgId, orgId, orgId]
    );
    const list = rows.map((item) => ({
      id: item.id,
      name: safeString(item.name),
      studentId: safeString(item.student_id),
      departmentId: safeString(item.department_id),
      department: safeString(item.department_name),
      identityId: safeString(item.identity_id),
      identity: safeString(item.identity_name),
      workGroupId: safeString(item.work_group_id),
      workGroup: safeString(item.work_group_name),
      userInfoId: item.user_info_id || '',
      boundOpenid: item.bound_openid ? safeString(item.bound_openid).slice(0, 8) + '***' : '',
      bindStatus: item.user_info_id ? 'bound' : 'unbound'
    }));
    res.json({ status: 'success', list });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveHrInfo
router.post('/saveHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const studentId = safeString(req.body.studentId);
    const departmentId = safeString(req.body.departmentId);
    const identityId = safeString(req.body.identityId);
    const workGroupId = safeString(req.body.workGroupId);

    if (!name || !studentId) {
      return res.json({ status: 'invalid_params', message: '请提供姓名和学号' });
    }

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const data = { name, studentId, departmentId, identityId, workGroupId, updatedAt: nowUtc };

    if (id) {
      await hrInfoModel.update(id, data);
      res.json({ status: 'success', message: '人事信息更新成功' });
    } else {
      const newId = generateId();
      await hrInfoModel.create(newId, data);
      res.json({ status: 'success', id: newId, message: '人事信息创建成功' });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteHrInfo
router.post('/deleteHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供人事ID' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
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
      message: isExpectedImportError ? safeString(error.message) : '表格导入失败，请稍后重试',
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
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const csvContent = safeString(req.body.csvContent);
    const rows = parseCsv(csvContent);
    if (rows.length < 2) return res.json({ status: 'invalid_params', message: 'CSV 至少需要表头和一行数据' });

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
      if (!template) return res.json({ status: 'missing_template', message: '未配置人事信息模板，请先在管理端「信息模板」中配置模板字段' });
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
          return res.json({ status: 'invalid_mapping', message: `扩展字段「${name}」在信息模板中不存在，请先在管理端「信息模板」中添加该字段` });
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
            message: `共 ${validationErrors.length} 条记录存在字段格式问题`,
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
            throw new Error('模板数据丢失，请刷新页面后重试');
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
              `INSERT INTO hr_profile_records (id, hr_id, name, openid, template_key, template_updated_at, audit_status, reviewed_at, org_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [recordId, hrId, effectiveName, '', TEMPLATE_KEY, template.updated_at, 'pending', nowUtc, orgId, nowUtc, nowUtc]
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
    res.json({ status: 'error', message: safeString(e.message) || 'CSV导入失败' });
  }
});

// batchMaintainFromHrInfo
router.post('/batchMaintainFromHrInfo', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

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
        message: `组织字典未补齐：部门${stats.missingDepartments}条，身份${stats.missingIdentities}条，工作分工${stats.missingWorkGroups}条，部门不匹配工作分工${stats.wrongDepartmentWorkGroups}条`,
        stats
      });
    }

    res.json({ status: 'success', message: '组织字典引用完整', stats });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// unbindHrWechat — 管理员解绑指定人事的微信绑定
router.post('/unbindHrWechat', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const hrId = safeString(req.body.hrId);
    if (!hrId) return res.json({ status: 'invalid_params', message: '请提供人事ID' });

    const orgId = await getCurrentOrgId();

    // 查找该人事对应的 user_info 绑定
    const [userRows] = await pool.query(
      'SELECT * FROM user_info WHERE hr_id = ? AND org_id = ?',
      [hrId, orgId]
    );
    if (!userRows.length) {
      return res.json({ status: 'not_found', message: '该人事记录尚未绑定微信' });
    }

    const targetUser = userRows[0];
    const targetOpenid = safeString(targetUser.openid);

    // 检查被解绑者是否是管理员，以及操作者的管理级别
    const targetAdmin = await adminInfoModel.getByOpenid(targetOpenid);
    if (targetAdmin) {
      const canWriteAdmins = isSuperAdmin(admin) || Boolean(req.adminPermissions
        && req.adminPermissions.permissions
        && req.adminPermissions.permissions['system.admin_accounts.write']);
      if (!canWriteAdmins || !canManageTarget(admin, targetAdmin, orgId)) {
        return res.json({ status: 'forbidden', message: '权限不足：不能解绑该管理员' });
      }
    }

    // 删除 user_info 绑定
    for (const userRecord of userRows) {
      await pool.query('DELETE FROM user_info WHERE id = ?', [userRecord.id]);
    }

    res.json({ status: 'success', message: '微信解绑成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
