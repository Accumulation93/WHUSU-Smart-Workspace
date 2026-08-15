const localeCopy = require('../../locales/zh-CN/generated/core/models/hrTableImport');
const { format: localeFormat } = require('../../locales/runtime');
const pool = require('../../config/db');
const { safeString, generateId } = require('../../utils/helpers');
const unifiedIdentityModel = require('./unifiedIdentity');

const REQUIRED_BASIC_FIELDS = ['name', 'studentId', 'department', 'identity'];
const BASIC_FIELD_LABELS = {
  name: '姓名',
  studentId: '学号',
  department: '所属部门',
  identity: '身份',
  workGroup: '职能组'
};
const EMPTY_VALUE_ALIASES = ['null', 'NULL', 'Null', '无', '空', 'N/A', 'NA', 'n/a', 'na', '-', '—', 'none', 'None', '/', '\\'];
const MAX_IMPORT_ROWS = 5000;
const MAX_IMPORT_COLUMNS = 200;
const MAX_CELL_LENGTH = 10000;

class HrTableImportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeEmptyValue(value) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized || EMPTY_VALUE_ALIASES.includes(normalized)) return '';
  return normalized;
}

function normalizeCell(value) {
  const text = safeString(value);
  if (text.length > MAX_CELL_LENGTH) {
    throw new HrTableImportError('invalid_params', `请将单项内容控制在 ${MAX_CELL_LENGTH} 个字以内`);
  }
  return text;
}

function normalizeHeaders(rawHeaders) {
  if (!Array.isArray(rawHeaders) || !rawHeaders.length) {
    throw new HrTableImportError('invalid_params', '表格缺少表头');
  }
  if (rawHeaders.length > MAX_IMPORT_COLUMNS) {
    throw new HrTableImportError('invalid_params', `请将表格控制在 ${MAX_IMPORT_COLUMNS} 列以内`);
  }
  return rawHeaders.map(normalizeCell);
}

function normalizeRows(rawRows, columnCount) {
  if (!Array.isArray(rawRows)) {
    throw new HrTableImportError('invalid_params', '请检查表格内容');
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new HrTableImportError('invalid_params', `请将本次导入控制在 ${MAX_IMPORT_ROWS} 行以内`);
  }
  const rows = [];
  rawRows.forEach((rawRow, index) => {
    if (!Array.isArray(rawRow)) {
      throw new HrTableImportError('invalid_params', `请检查第 ${index + 2} 行内容`);
    }
    const cells = [];
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      cells.push(normalizeCell(rawRow[columnIndex]));
    }
    if (cells.some((cell) => normalizeEmptyValue(cell))) {
      rows.push({ rowNumber: index + 2, cells });
    }
  });
  return rows;
}

function normalizeColumnIndex(value, columnCount, label) {
  if (value === null || value === undefined || value === '') return null;
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= columnCount) {
    throw new HrTableImportError('invalid_mapping', `请重新选择${label}所在列`);
  }
  return index;
}

function normalizeBasicMapping(rawMapping, columnCount) {
  const source = rawMapping && typeof rawMapping === 'object' ? rawMapping : {};
  const mapping = {};
  const usedColumns = new Set();
  Object.keys(BASIC_FIELD_LABELS).forEach((field) => {
    const index = normalizeColumnIndex(source[field], columnCount, BASIC_FIELD_LABELS[field]);
    if (index === null) return;
    if (usedColumns.has(index)) {
      throw new HrTableImportError('invalid_mapping', '请为每项资料选择不同的表格列');
    }
    mapping[field] = index;
    usedColumns.add(index);
  });
  const missing = REQUIRED_BASIC_FIELDS.filter((field) => mapping[field] === undefined);
  if (missing.length) {
    throw new HrTableImportError(
      'invalid_mapping',
      `请选择以下资料所在列：${missing.map((field) => BASIC_FIELD_LABELS[field]).join('、')}`
    );
  }
  return { mapping, usedColumns };
}

function normalizeExtensionMapping(rawMapping, columnCount, usedColumns) {
  if (!rawMapping) return [];
  if (!Array.isArray(rawMapping)) {
    throw new HrTableImportError('invalid_mapping', '请重新选择补充资料所在列');
  }
  const usedFieldIds = new Set();
  return rawMapping.map((item) => {
    const fieldId = safeString(item && item.fieldId);
    const columnIndex = normalizeColumnIndex(
      item && item.columnIndex,
      columnCount,
      '补充资料'
    );
    if (!fieldId || columnIndex === null) {
      throw new HrTableImportError('invalid_mapping', '请选择补充资料所在列');
    }
    if (usedColumns.has(columnIndex)) {
      throw new HrTableImportError('invalid_mapping', '请为每项资料选择不同的表格列');
    }
    if (usedFieldIds.has(fieldId)) {
      throw new HrTableImportError('invalid_mapping', '请为每项补充资料选择一列表格内容');
    }
    usedColumns.add(columnIndex);
    usedFieldIds.add(fieldId);
    return { columnIndex, fieldId };
  });
}

function tryParseDate(rawValue) {
  const value = String(rawValue == null ? '' : rawValue).trim();
  if (!value) return null;
  let match = value.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month >= 1 && month <= 12 && day >= 1) {
      const daysInMonth = new Date(year, month, 0).getDate();
      if (day <= daysInMonth) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return null;
  }
  let parsed = new Date(value);
  if (isNaN(parsed.getTime())) parsed = new Date(value.replace(' ', 'T'));
  if (!isNaN(parsed.getTime()) && parsed.getUTCFullYear() > 1900) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
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
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return `${field.label}必须是数字`;
    if (field.numberRule === 'length_range') {
      const length = String(value).replace(/^[+-]/, '').replace('.', '').length;
      if (field.minDigits != null && length < field.minDigits) return `${field.label}长度不能少于 ${field.minDigits}`;
      if (field.maxDigits != null && length > field.maxDigits) return `${field.label}长度不能超过 ${field.maxDigits}`;
    } else {
      if (field.minValue != null && numberValue < field.minValue) return `${field.label}不能小于 ${field.minValue}`;
      if (field.maxValue != null && numberValue > field.maxValue) return `${field.label}不能大于 ${field.maxValue}`;
    }
    return '';
  }
  if (field.type === 'sequence') {
    if (field.options.length && field.options.indexOf(value) === -1) return `${field.label}必须从预设选项中选择`;
    return '';
  }
  if (field.type === 'date' && !tryParseDate(value)) return `${field.label}必须是有效日期`;
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) return `${field.label}必须是有效手机号`;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${field.label}必须是有效邮箱`;
  return '';
}

function normalizeTemplateField(row) {
  let options = [];
  try {
    options = row.options_json ? JSON.parse(row.options_json) : [];
  } catch (error) {
    options = [];
  }
  return {
    id: row.id,
    label: safeString(row.label),
    type: safeString(row.type) || 'text',
    required: !!row.required,
    minLength: row.min_length,
    maxLength: row.max_length,
    numberRule: row.number_rule,
    allowDecimal: !!row.allow_decimal,
    minDigits: row.min_digits,
    maxDigits: row.max_digits,
    minValue: row.min_value,
    maxValue: row.max_value,
    options: Array.isArray(options) ? options : []
  };
}

function getMappedValue(cells, mapping, field) {
  if (mapping[field] === undefined) return null;
  return normalizeEmptyValue(cells[mapping[field]]);
}

function buildError(field, value, message, fieldType) {
  return {
    field,
    value: safeString(value),
    error: message,
    fieldType: fieldType || '基本资料'
  };
}

async function loadImportContext(orgId, extensionMapping) {
  const [departmentsResult, identitiesResult, workGroupsResult, hrResult] = await Promise.all([
    pool.query('SELECT * FROM departments WHERE org_id = ? ORDER BY name', [orgId]),
    pool.query('SELECT * FROM identities WHERE org_id = ? ORDER BY name', [orgId]),
    pool.query('SELECT * FROM work_groups WHERE org_id = ? ORDER BY name', [orgId]),
    pool.query('SELECT * FROM hr_info WHERE org_id = ? ORDER BY name', [orgId])
  ]);
  const departments = departmentsResult[0];
  const identities = identitiesResult[0];
  const workGroups = workGroupsResult[0];
  const hrRows = hrResult[0];

  let template = null;
  let templateFields = [];
  if (extensionMapping.length) {
    const [templates] = await pool.query(
      'SELECT * FROM org_hr_profile_template_snapshots WHERE org_id = ? LIMIT 1',
      [orgId]
    );
    template = templates[0] || null;
    if (!template) {
      throw new HrTableImportError('missing_template', '请先在人事管理中选择人事模板');
    }
    const [fieldRows] = await pool.query(
      'SELECT * FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id = ? AND is_active = 1 ORDER BY sort_order',
      [template.id]
    );
    templateFields = fieldRows.map(normalizeTemplateField);
    const fieldIds = new Set(templateFields.map((field) => field.id));
    extensionMapping.forEach((mapping) => {
      if (!fieldIds.has(mapping.fieldId)) {
        throw new HrTableImportError('invalid_mapping', '请重新选择当前组织的人事资料项');
      }
    });
  }

  return { departments, identities, workGroups, hrRows, template, templateFields };
}

function buildExistingNameMaps(context) {
  return {
    departmentNameById: new Map(context.departments.map((item) => [safeString(item.id), safeString(item.name)])),
    identityNameById: new Map(context.identities.map((item) => [safeString(item.id), safeString(item.name)])),
    workGroupNameById: new Map(context.workGroups.map((item) => [safeString(item.id), safeString(item.name)]))
  };
}

function buildMappingSummary(headers, basicMapping, extensionMapping, templateFields) {
  const templateFieldById = new Map(templateFields.map((field) => [field.id, field]));
  const mappedColumns = new Set();
  const mappings = [];
  Object.keys(BASIC_FIELD_LABELS).forEach((field) => {
    if (basicMapping[field] === undefined) return;
    const columnIndex = basicMapping[field];
    mappedColumns.add(columnIndex);
    mappings.push({
      columnIndex,
      header: headers[columnIndex],
      target: field,
      targetLabel: BASIC_FIELD_LABELS[field],
      targetType: 'basic'
    });
  });
  extensionMapping.forEach((mapping) => {
    const field = templateFieldById.get(mapping.fieldId);
    mappedColumns.add(mapping.columnIndex);
    mappings.push({
      columnIndex: mapping.columnIndex,
      header: headers[mapping.columnIndex],
      target: mapping.fieldId,
      targetLabel: field ? field.label : localeCopy.copy_9ec66981b8,
      targetType: 'extension'
    });
  });
  mappings.sort((left, right) => left.columnIndex - right.columnIndex);
  const ignoredColumns = headers
    .map((header, columnIndex) => ({ columnIndex, header }))
    .filter((item) => !mappedColumns.has(item.columnIndex));
  return { mappings, ignoredColumns };
}

async function prepareHrTableImport(payload, orgId) {
  const headers = normalizeHeaders(payload && payload.headers);
  const rows = normalizeRows(payload && payload.rows, headers.length);
  const basicResult = normalizeBasicMapping(payload && payload.basicMapping, headers.length);
  const extensionMapping = normalizeExtensionMapping(
    payload && payload.extensionMapping,
    headers.length,
    basicResult.usedColumns
  );
  const skipInvalid = !!(payload && payload.skipInvalid);
  const context = await loadImportContext(orgId, extensionMapping);
  const names = buildExistingNameMaps(context);
  const hrByStudentId = new Map(context.hrRows.map((item) => [safeString(item.student_id), item]));
  const templateFieldById = new Map(context.templateFields.map((field) => [field.id, field]));
  const seenStudentIds = new Set();
  const parsedRows = [];
  const validationErrors = [];
  let preservedEmptyFields = 0;

  rows.forEach((tableRow) => {
    const cells = tableRow.cells;
    const studentId = getMappedValue(cells, basicResult.mapping, 'studentId') || '';
    const existing = studentId ? hrByStudentId.get(studentId) || null : null;
    const rowErrors = [];

    if (!studentId) {
      rowErrors.push(buildError('学号', '', '请填写学号'));
    } else if (seenStudentIds.has(studentId)) {
      rowErrors.push(buildError('学号', studentId, '请删除重复的学号'));
    } else {
      seenStudentIds.add(studentId);
    }

    const mappedName = getMappedValue(cells, basicResult.mapping, 'name');
    const mappedDepartment = getMappedValue(cells, basicResult.mapping, 'department');
    const mappedIdentity = getMappedValue(cells, basicResult.mapping, 'identity');
    const mappedWorkGroup = getMappedValue(cells, basicResult.mapping, 'workGroup');
    const name = mappedName || safeString(existing && existing.name);
    const departmentName = mappedDepartment || names.departmentNameById.get(safeString(existing && existing.department_id)) || '';
    const identityName = mappedIdentity || names.identityNameById.get(safeString(existing && existing.identity_id)) || '';
    const workGroupName = mappedWorkGroup || names.workGroupNameById.get(safeString(existing && existing.work_group_id)) || '';

    if (!name) rowErrors.push(buildError('姓名', '', '请填写姓名'));
    if (!departmentName) rowErrors.push(buildError('所属部门', '', '请选择所属部门'));
    if (!identityName) rowErrors.push(buildError('身份', '', '请选择身份'));

    if (existing) {
      ['name', 'department', 'identity', 'workGroup'].forEach((field) => {
        if (basicResult.mapping[field] !== undefined && !getMappedValue(cells, basicResult.mapping, field)) {
          preservedEmptyFields += 1;
        }
      });
    }

    const extensionValues = {};
    extensionMapping.forEach((mapping) => {
      const value = normalizeEmptyValue(cells[mapping.columnIndex]);
      const field = templateFieldById.get(mapping.fieldId);
      if (!value) {
        if (existing) preservedEmptyFields += 1;
        if (!existing && field && field.required) {
          rowErrors.push(buildError(field.label, '', `请填写${field.label}`, field.type));
        }
        return;
      }
      const error = field ? validateFieldValue(field, value) : '该资料项已删除，请重新选择';
      if (error) {
        rowErrors.push(buildError(field ? field.label : localeCopy.copy_9ec66981b8, value, error, field ? field.type : 'text'));
        return;
      }
      extensionValues[mapping.fieldId] = field && field.type === 'date' ? tryParseDate(value) : value;
    });

    const basicErrorCount = rowErrors.filter((error) => error.fieldType === '基本资料').length;
    if (!rowErrors.length || (skipInvalid && basicErrorCount === 0)) {
      parsedRows.push({
        rowNumber: tableRow.rowNumber,
        existing,
        name,
        studentId,
        departmentName,
        identityName,
        workGroupName,
        extensionValues
      });
    }
    if (rowErrors.length) {
      validationErrors.push({ rowNumber: tableRow.rowNumber, studentId, name, errors: rowErrors });
    }
  });

  const departmentByName = new Map(context.departments.map((item) => [safeString(item.name), item]));
  const identityByName = new Map(context.identities.map((item) => [safeString(item.name), item]));
  const workGroupKeySet = new Set(context.workGroups.map((item) => `${safeString(item.name)}::${safeString(item.department_id)}`));
  const newDepartments = new Set();
  const newIdentities = new Set();
  parsedRows.forEach((row) => {
    if (row.departmentName && !departmentByName.has(row.departmentName)) newDepartments.add(row.departmentName);
    if (row.identityName && !identityByName.has(row.identityName)) newIdentities.add(row.identityName);
  });

  const departmentIds = new Map(context.departments.map((item) => [safeString(item.name), safeString(item.id)]));
  newDepartments.forEach((name) => departmentIds.set(name, `preview:${name}`));
  const newWorkGroups = new Set();
  parsedRows.forEach((row) => {
    if (!row.workGroupName || !row.departmentName) return;
    const departmentId = departmentIds.get(row.departmentName);
    if (!workGroupKeySet.has(`${row.workGroupName}::${departmentId}`)) {
      newWorkGroups.add(`${row.departmentName} / ${row.workGroupName}`);
    }
  });

  const mappingSummary = buildMappingSummary(
    headers,
    basicResult.mapping,
    extensionMapping,
    context.templateFields
  );

  return {
    headers,
    rows,
    basicMapping: basicResult.mapping,
    extensionMapping,
    skipInvalid,
    context,
    parsedRows,
    validationErrors,
    preview: {
      totalRows: rows.length,
      validRows: Math.max(0, rows.length - validationErrors.length),
      invalidRows: validationErrors.length,
      importableRows: parsedRows.length,
      newRecords: parsedRows.filter((row) => !row.existing).length,
      updateRecords: parsedRows.filter((row) => !!row.existing).length,
      preservedEmptyFields,
      mappings: mappingSummary.mappings,
      ignoredColumns: mappingSummary.ignoredColumns,
      newDepartments: Array.from(newDepartments),
      newIdentities: Array.from(newIdentities),
      newWorkGroups: Array.from(newWorkGroups),
      errors: validationErrors
    }
  };
}

async function writeProfileValues(conn, prepared, row, hrId, orgId, nowUtc) {
  const extensionEntries = Object.entries(row.extensionValues);
  if (!extensionEntries.length) return;
  const template = prepared.context.template;
  const templateFieldById = new Map(prepared.context.templateFields.map((field) => [field.id, field]));
  const [records] = await conn.query(
    'SELECT * FROM hr_profile_records WHERE hr_id = ? AND org_id = ? LIMIT 1',
    [hrId, orgId]
  );
  let record = records[0] || null;
  if (!record) {
    const recordId = generateId();
    await conn.query(
      `INSERT INTO hr_profile_records
       (id, hr_id, name, openid, template_snapshot_id, audit_status, reviewed_at, org_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recordId, hrId, row.name, '', template.id, 'pending', nowUtc, orgId, nowUtc, nowUtc]
    );
    record = { id: recordId };
  }

  const fieldIds = extensionEntries.map(([fieldId]) => fieldId);
  await conn.query(
    `DELETE FROM hr_profile_record_values
     WHERE record_id = ? AND is_pending = 0 AND field_id IN (${fieldIds.map(() => '?').join(',')}) AND org_id = ?`,
    [record.id, ...fieldIds, orgId]
  );
  for (const [fieldId, fieldValue] of extensionEntries) {
    if (!templateFieldById.has(fieldId)) continue;
    await conn.query(
      'INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id) VALUES (?, ?, 0, ?, ?, ?)',
      [generateId(), record.id, fieldId, fieldValue, orgId]
    );
  }

  const requiredFields = prepared.context.templateFields.filter((field) => field.required);
  let auditStatus = 'approved';
  if (requiredFields.length) {
    const [allValues] = await conn.query(
      'SELECT field_id, field_value FROM hr_profile_record_values WHERE record_id = ? AND org_id = ?',
      [record.id, orgId]
    );
    const valueByFieldId = new Map(allValues.map((value) => [value.field_id, value.field_value]));
    if (requiredFields.some((field) => !normalizeEmptyValue(valueByFieldId.get(field.id)))) {
      auditStatus = 'pending';
    }
  }
  await conn.query(
    'UPDATE hr_profile_records SET audit_status = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    [auditStatus, nowUtc, nowUtc, record.id, orgId]
  );
}

async function importPreparedRows(prepared, orgId) {
  if (prepared.validationErrors.length && !prepared.skipInvalid) {
    return {
      status: 'validation_errors',
      message: localeFormat(localeCopy.copy_ade8b37a07, [prepared.validationErrors.length]),
      errors: prepared.validationErrors,
      count: 0,
      preview: prepared.preview
    };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [departments] = await conn.query('SELECT * FROM departments WHERE org_id = ?', [orgId]);
    const [identities] = await conn.query('SELECT * FROM identities WHERE org_id = ?', [orgId]);
    const [workGroups] = await conn.query('SELECT * FROM work_groups WHERE org_id = ?', [orgId]);
    const [hrRows] = await conn.query('SELECT * FROM hr_info WHERE org_id = ?', [orgId]);
    const departmentIds = new Map(departments.map((item) => [safeString(item.name), safeString(item.id)]));
    const identityIds = new Map(identities.map((item) => [safeString(item.name), safeString(item.id)]));
    const workGroupIds = new Map(workGroups.map((item) => [`${safeString(item.name)}::${safeString(item.department_id)}`, safeString(item.id)]));
    const hrByStudentId = new Map(hrRows.map((item) => [safeString(item.student_id), item]));

    const affectedHrIds = [];
    for (const row of prepared.parsedRows) {
      if (!departmentIds.has(row.departmentName)) {
        const id = generateId();
        await conn.query(
          'INSERT INTO departments (id, name, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [id, row.departmentName, orgId, nowUtc, nowUtc]
        );
        departmentIds.set(row.departmentName, id);
      }
      if (!identityIds.has(row.identityName)) {
        const id = generateId();
        await conn.query(
          'INSERT INTO identities (id, name, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [id, row.identityName, orgId, nowUtc, nowUtc]
        );
        identityIds.set(row.identityName, id);
      }
      if (row.workGroupName) {
        const departmentId = departmentIds.get(row.departmentName);
        const key = `${row.workGroupName}::${departmentId}`;
        if (!workGroupIds.has(key)) {
          const id = generateId();
          await conn.query(
            'INSERT INTO work_groups (id, name, department_id, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [id, row.workGroupName, departmentId, orgId, nowUtc, nowUtc]
          );
          workGroupIds.set(key, id);
        }
      }
    }

    for (const row of prepared.parsedRows) {
      const departmentId = departmentIds.get(row.departmentName) || '';
      const identityId = identityIds.get(row.identityName) || '';
      const workGroupId = row.workGroupName
        ? workGroupIds.get(`${row.workGroupName}::${departmentId}`) || ''
        : safeString(row.existing && row.existing.work_group_id);
      const existing = hrByStudentId.get(row.studentId) || null;
      let hrId;
      if (existing) {
        hrId = existing.id;
        await conn.query(
          `UPDATE hr_info
           SET name = ?, department_id = ?, identity_id = ?, work_group_id = ?, updated_at = ?
           WHERE id = ? AND org_id = ?`,
          [row.name, departmentId, identityId, workGroupId, nowUtc, hrId, orgId]
        );
      } else {
        hrId = generateId();
        await conn.query(
          `INSERT INTO hr_info
           (id, name, student_id, department_id, identity_id, work_group_id, org_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [hrId, row.name, row.studentId, departmentId, identityId, workGroupId, orgId, nowUtc, nowUtc]
        );
        hrByStudentId.set(row.studentId, { id: hrId, student_id: row.studentId });
      }
      affectedHrIds.push(hrId);
      await writeProfileValues(conn, prepared, row, hrId, orgId, nowUtc);
    }

    await unifiedIdentityModel.syncLegacyHrRecords(conn, affectedHrIds);
    await conn.commit();
    const result = {
      status: 'success',
      count: prepared.parsedRows.length,
      totalRows: prepared.rows.length,
      preview: prepared.preview
    };
    if (prepared.skipInvalid && prepared.validationErrors.length) result.errors = prepared.validationErrors;
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function previewHrTableImport(payload, orgId) {
  const prepared = await prepareHrTableImport(payload, orgId);
  return { status: 'success', preview: prepared.preview };
}

async function importHrTable(payload, orgId) {
  const prepared = await prepareHrTableImport(payload, orgId);
  return importPreparedRows(prepared, orgId);
}

module.exports = {
  BASIC_FIELD_LABELS,
  REQUIRED_BASIC_FIELDS,
  HrTableImportError,
  normalizeEmptyValue,
  prepareHrTableImport,
  previewHrTableImport,
  importHrTable
};
