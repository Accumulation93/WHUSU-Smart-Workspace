const crypto = require('crypto');
const pool = require('../../config/db');
const { JWT_SECRET } = require('../../middleware/auth');
const { generateId, safeString, normalizeEmptyValue } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');

const EDIT_MODES = ['direct', 'audit', 'readonly'];
const FIELD_TYPES = ['text', 'number', 'sequence', 'date', 'phone', 'email'];
const NUMBER_RULE_TYPES = ['value_range', 'length_range'];
const SWITCH_ACTIONS = ['map', 'hide', 'delete'];
const TOKEN_TTL_MS = 10 * 60 * 1000;

function parseOptions(value) {
  if (!value) return [];
  try {
    const result = JSON.parse(value);
    return Array.isArray(result) ? result.map((item) => safeString(item)).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function serializeField(field) {
  return {
    id: safeString(field.id),
    label: safeString(field.label),
    type: safeString(field.type || 'text'),
    required: Boolean(field.required),
    minLength: field.min_length == null ? null : Number(field.min_length),
    maxLength: field.max_length == null ? null : Number(field.max_length),
    numberRule: safeString(field.number_rule || 'value_range'),
    allowDecimal: Boolean(field.allow_decimal),
    minDigits: field.min_digits == null ? null : Number(field.min_digits),
    maxDigits: field.max_digits == null ? null : Number(field.max_digits),
    minValue: field.min_value == null ? null : Number(field.min_value),
    maxValue: field.max_value == null ? null : Number(field.max_value),
    options: parseOptions(field.options_json)
  };
}

function normalizeDefinitionField(field) {
  const type = safeString(field && field.type || 'text');
  const numberRule = safeString(field && field.numberRule || 'value_range');
  const normalized = {
    id: safeString(field && field.id),
    label: safeString(field && field.label).trim(),
    type: FIELD_TYPES.includes(type) ? type : '',
    required: Boolean(field && field.required),
    minLength: field && field.minLength !== '' && field.minLength != null ? Number(field.minLength) : null,
    maxLength: field && field.maxLength !== '' && field.maxLength != null ? Number(field.maxLength) : null,
    numberRule: NUMBER_RULE_TYPES.includes(numberRule) ? numberRule : 'value_range',
    allowDecimal: !field || field.allowDecimal !== false,
    minDigits: field && field.minDigits !== '' && field.minDigits != null ? Number(field.minDigits) : null,
    maxDigits: field && field.maxDigits !== '' && field.maxDigits != null ? Number(field.maxDigits) : null,
    minValue: field && field.minValue !== '' && field.minValue != null ? Number(field.minValue) : null,
    maxValue: field && field.maxValue !== '' && field.maxValue != null ? Number(field.maxValue) : null,
    options: Array.isArray(field && field.options)
      ? field.options.map((item) => safeString(item).trim()).filter(Boolean)
      : []
  };
  return normalized;
}

function validateDefinition(name, editMode, fields) {
  if (!safeString(name).trim()) return '模板名称不能为空';
  if (!EDIT_MODES.includes(editMode)) return '修改模式不合法';
  if (!fields.length) return '至少需要配置一个字段';
  const labels = new Set();
  for (const field of fields) {
    if (!field.label) return '字段名称不能为空';
    if (!field.type) return '字段类型不合法';
    const labelKey = field.label.toLocaleLowerCase('zh-CN');
    if (labels.has(labelKey)) return `字段名称重复：${field.label}`;
    labels.add(labelKey);
    if (field.type === 'sequence' && !field.options.length) return `${field.label}至少需要一个选项`;
    if (field.minLength != null && !Number.isFinite(field.minLength)) return `${field.label}长度限制不合法`;
    if (field.maxLength != null && !Number.isFinite(field.maxLength)) return `${field.label}长度限制不合法`;
    if (field.minValue != null && !Number.isFinite(field.minValue)) return `${field.label}数值限制不合法`;
    if (field.maxValue != null && !Number.isFinite(field.maxValue)) return `${field.label}数值限制不合法`;
  }
  return '';
}

async function insertDefinitionFields(connection, templateId, fields) {
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    await connection.query(
      `INSERT INTO hr_profile_template_fields
       (id, template_id, sort_order, label, type, required, min_length, max_length,
        number_rule, allow_decimal, min_digits, max_digits, min_value, max_value, options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), templateId, index + 1, field.label, field.type, field.required ? 1 : 0,
       field.minLength, field.maxLength, field.numberRule, field.allowDecimal ? 1 : 0,
       field.minDigits, field.maxDigits, field.minValue, field.maxValue,
       field.options.length ? JSON.stringify(field.options) : null]
    );
  }
}

async function listTemplates(connection = pool) {
  const [templates] = await connection.query(
    `SELECT t.*,
            COUNT(DISTINCT s.id) AS snapshot_count,
            COUNT(DISTINCT CASE WHEN settings.active_snapshot_id = s.id THEN settings.org_id END) AS active_org_count
       FROM hr_profile_templates t
       LEFT JOIN org_hr_profile_template_snapshots s ON s.source_template_id = t.id
       LEFT JOIN org_hr_profile_template_settings settings ON settings.active_snapshot_id = s.id
      GROUP BY t.id ORDER BY t.name`
  );
  const [fields] = await connection.query('SELECT * FROM hr_profile_template_fields ORDER BY template_id, sort_order');
  const fieldsByTemplate = new Map();
  fields.forEach((field) => {
    if (!fieldsByTemplate.has(field.template_id)) fieldsByTemplate.set(field.template_id, []);
    fieldsByTemplate.get(field.template_id).push(serializeField(field));
  });
  return templates.map((template) => ({
    id: template.id,
    name: safeString(template.name),
    description: safeString(template.description),
    editMode: safeString(template.edit_mode || 'direct'),
    fields: fieldsByTemplate.get(template.id) || [],
    fieldCount: (fieldsByTemplate.get(template.id) || []).length,
    snapshotCount: Number(template.snapshot_count || 0),
    activeOrgCount: Number(template.active_org_count || 0),
    updatedAt: template.updated_at
  }));
}

async function getActiveSnapshot(orgId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT snapshot.*, settings.updated_at AS selection_updated_at,
            CASE WHEN source.id IS NULL THEN 1 ELSE 0 END AS source_deleted
       FROM org_hr_profile_template_settings settings
       JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = settings.active_snapshot_id
       LEFT JOIN hr_profile_templates source ON source.id = snapshot.source_template_id
      WHERE settings.org_id = ? AND snapshot.org_id = ? LIMIT 1`,
    [orgId, orgId]
  );
  if (!rows.length) return null;
  const snapshot = rows[0];
  const [fields] = await connection.query(
    'SELECT * FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id = ? ORDER BY sort_order',
    [snapshot.id]
  );
  return {
    id: snapshot.id,
    version: Number(snapshot.version),
    sourceTemplateId: safeString(snapshot.source_template_id),
    sourceTemplateName: safeString(snapshot.source_template_name),
    sourceDeleted: Boolean(snapshot.source_deleted),
    description: safeString(snapshot.description),
    editMode: safeString(snapshot.edit_mode || 'direct'),
    selectedAt: snapshot.selected_at,
    settingsUpdatedAt: snapshot.settings_updated_at,
    fields: fields.map(serializeField)
  };
}

async function saveDefinition(data, operator) {
  const id = safeString(data.id);
  const name = safeString(data.name).trim();
  const description = safeString(data.description).trim();
  const editMode = safeString(data.editMode || 'direct');
  const fields = (Array.isArray(data.fields) ? data.fields : []).map(normalizeDefinitionField);
  const error = validateDefinition(name, editMode, fields);
  if (error) return { status: 'invalid_params', message: error };

  try {
    return await pool.withTransaction(async (connection) => {
      const [duplicates] = await connection.query(
        'SELECT id FROM hr_profile_templates WHERE name = ? AND id <> ?',
        [name, id || '']
      );
      if (duplicates.length) return { status: 'duplicate', message: '人事模板名称重复' };
      const now = new Date();
      const templateId = id || generateId();
      if (id) {
        const [existing] = await connection.query('SELECT id FROM hr_profile_templates WHERE id = ? FOR UPDATE', [id]);
        if (!existing.length) return { status: 'not_found', message: '模板不存在' };
        await connection.query(
          'UPDATE hr_profile_templates SET name = ?, description = ?, edit_mode = ?, updated_by = ?, updated_at = ? WHERE id = ?',
          [name, description, editMode, operator.id, now, id]
        );
        await connection.query('DELETE FROM hr_profile_template_fields WHERE template_id = ?', [id]);
      } else {
        await connection.query(
          `INSERT INTO hr_profile_templates (id, name, description, edit_mode, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [templateId, name, description, editMode, operator.id, operator.id]
        );
      }
      await insertDefinitionFields(connection, templateId, fields);
      return { status: 'success', id: templateId };
    });
  } catch (errorValue) {
    if (errorValue && errorValue.code === 'ER_DUP_ENTRY') return { status: 'duplicate', message: '人事模板名称重复' };
    throw errorValue;
  }
}

async function duplicateDefinition(templateId, operator) {
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query('SELECT * FROM hr_profile_templates WHERE id = ? FOR UPDATE', [templateId]);
    if (!rows.length) return { status: 'not_found', message: '模板不存在' };
    const source = rows[0];
    const [fields] = await connection.query('SELECT * FROM hr_profile_template_fields WHERE template_id = ? ORDER BY sort_order', [templateId]);
    let name = `${source.name} 副本`;
    let suffix = 2;
    while (true) {
      const [duplicates] = await connection.query('SELECT id FROM hr_profile_templates WHERE name = ? LIMIT 1', [name]);
      if (!duplicates.length) break;
      name = `${source.name} 副本${suffix}`;
      suffix += 1;
    }
    const newId = generateId();
    await connection.query(
      `INSERT INTO hr_profile_templates (id, name, description, edit_mode, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId, name, source.description, source.edit_mode, operator.id, operator.id]
    );
    await insertDefinitionFields(connection, newId, fields.map((field) => ({
      label: field.label,
      type: field.type,
      required: Boolean(field.required),
      minLength: field.min_length,
      maxLength: field.max_length,
      numberRule: field.number_rule,
      allowDecimal: Boolean(field.allow_decimal),
      minDigits: field.min_digits,
      maxDigits: field.max_digits,
      minValue: field.min_value,
      maxValue: field.max_value,
      options: parseOptions(field.options_json)
    })));
    return { status: 'success', id: newId };
  });
}

async function deleteDefinition(templateId) {
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query('SELECT id FROM hr_profile_templates WHERE id = ? FOR UPDATE', [templateId]);
    if (!rows.length) return { status: 'not_found', message: '模板不存在' };
    const [usage] = await connection.query(
      `SELECT COUNT(DISTINCT s.id) AS snapshot_count,
              COUNT(DISTINCT CASE WHEN settings.active_snapshot_id = s.id THEN settings.org_id END) AS active_org_count
         FROM org_hr_profile_template_snapshots s
         LEFT JOIN org_hr_profile_template_settings settings ON settings.active_snapshot_id = s.id
        WHERE s.source_template_id = ?`,
      [templateId]
    );
    await connection.query('DELETE FROM hr_profile_templates WHERE id = ?', [templateId]);
    return {
      status: 'success',
      snapshotCount: Number(usage[0].snapshot_count || 0),
      activeOrgCount: Number(usage[0].active_org_count || 0)
    };
  });
}

async function getSwitchContext(orgId, targetTemplateId, connection = pool) {
  const [templateRows] = await connection.query('SELECT * FROM hr_profile_templates WHERE id = ?', [targetTemplateId]);
  if (!templateRows.length) return null;
  const targetTemplate = templateRows[0];
  const [targetFields] = await connection.query(
    'SELECT * FROM hr_profile_template_fields WHERE template_id = ? ORDER BY sort_order',
    [targetTemplateId]
  );
  const activeSnapshot = await getActiveSnapshot(orgId, connection);
  const [sourceFields] = await connection.query(
    `SELECT field.*, snapshot.version, snapshot.source_template_name, snapshot.selected_at,
            SUM(CASE WHEN values_table.is_pending = 0 THEN 1 ELSE 0 END) AS current_value_count,
            SUM(CASE WHEN values_table.is_pending = 1 THEN 1 ELSE 0 END) AS pending_value_count
       FROM org_hr_profile_template_snapshot_fields field
       JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = field.snapshot_id
       LEFT JOIN hr_profile_record_values values_table
         ON values_table.field_id = field.id AND values_table.org_id = snapshot.org_id
      WHERE snapshot.org_id = ?
      GROUP BY field.id
     HAVING field.snapshot_id = ? OR current_value_count > 0 OR pending_value_count > 0
      ORDER BY snapshot.version DESC, field.sort_order`,
    [orgId, activeSnapshot ? activeSnapshot.id : '']
  );
  const serializedTargets = targetFields.map(serializeField);
  return {
    activeSnapshot,
    targetTemplate: {
      id: targetTemplate.id,
      name: targetTemplate.name,
      description: safeString(targetTemplate.description),
      editMode: targetTemplate.edit_mode,
      updatedAt: targetTemplate.updated_at,
      fields: serializedTargets
    },
    sourceFields: sourceFields.map((field) => {
      const serialized = serializeField(field);
      const compatibleTargetIds = serializedTargets
        .filter((target) => isPotentiallyCompatible(serialized.type, target.type))
        .map((target) => target.id);
      const suggested = serializedTargets.find((target) =>
        target.label.toLocaleLowerCase('zh-CN') === serialized.label.toLocaleLowerCase('zh-CN')
        && compatibleTargetIds.includes(target.id));
      return Object.assign(serialized, {
        snapshotId: field.snapshot_id,
        snapshotVersion: Number(field.version),
        snapshotName: safeString(field.source_template_name),
        snapshotSelectedAt: field.selected_at,
        currentValueCount: Number(field.current_value_count || 0),
        pendingValueCount: Number(field.pending_value_count || 0),
        compatibleTargetIds,
        suggestedTargetId: suggested ? suggested.id : ''
      });
    })
  };
}

function isPotentiallyCompatible(sourceType, targetType) {
  if (targetType === 'text') return true;
  if (targetType === 'number' || targetType === 'sequence') return true;
  return sourceType === targetType;
}

function validateMappedValue(targetField, rawValue) {
  const value = normalizeEmptyValue(rawValue);
  if (!value) return '';
  if (targetField.type === 'text') {
    if (targetField.min_length != null && value.length < Number(targetField.min_length)) return '长度过短';
    if (targetField.max_length != null && value.length > Number(targetField.max_length)) return '长度过长';
    return '';
  }
  if (targetField.type === 'number') {
    if (!targetField.allow_decimal && !/^[+-]?\d+$/.test(value)) return '不是整数';
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return '不是数字';
    if (targetField.number_rule === 'length_range') {
      const length = value.replace(/^[+-]/, '').replace('.', '').length;
      if (targetField.min_digits != null && length < Number(targetField.min_digits)) return '数字长度过短';
      if (targetField.max_digits != null && length > Number(targetField.max_digits)) return '数字长度过长';
    } else {
      if (targetField.min_value != null && numberValue < Number(targetField.min_value)) return '小于最小值';
      if (targetField.max_value != null && numberValue > Number(targetField.max_value)) return '大于最大值';
    }
    return '';
  }
  if (targetField.type === 'sequence') return parseOptions(targetField.options_json).includes(value) ? '' : '不在目标选项中';
  if (targetField.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()) ? '' : '日期格式不合法';
  if (targetField.type === 'phone') return /^1[3-9]\d{9}$/.test(value) ? '' : '手机号不合法';
  if (targetField.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : '邮箱不合法';
  return '字段类型不兼容';
}

function normalizeActions(sourceFields, targetFields, rawActions) {
  const sourceIds = new Set(sourceFields.map((field) => field.id));
  const targetMap = new Map(targetFields.map((field) => [field.id, field]));
  const rawList = Array.isArray(rawActions) ? rawActions : [];
  const rawMap = new Map();
  rawList.forEach((action) => {
    const sourceId = safeString(action && action.sourceSnapshotFieldId);
    if (!sourceIds.has(sourceId)) throw new Error('包含未知的迁移来源字段');
    if (rawMap.has(sourceId)) throw new Error('迁移来源字段重复');
    rawMap.set(sourceId, action);
  });
  const usedTargets = new Set();
  const actions = sourceFields.map((sourceField) => {
    const raw = rawMap.get(sourceField.id) || {};
    const action = SWITCH_ACTIONS.includes(raw.action) ? raw.action : 'hide';
    const targetTemplateFieldId = action === 'map' ? safeString(raw.targetTemplateFieldId) : '';
    if (!sourceIds.has(sourceField.id)) throw new Error('迁移来源字段不合法');
    if (action === 'map') {
      const target = targetMap.get(targetTemplateFieldId);
      if (!target) throw new Error(`${sourceField.label}缺少有效的目标字段`);
      if (!isPotentiallyCompatible(sourceField.type, target.type)) throw new Error(`${sourceField.label}与目标字段类型不兼容`);
      if (usedTargets.has(targetTemplateFieldId)) throw new Error('一个目标字段只能映射一个来源字段');
      usedTargets.add(targetTemplateFieldId);
    }
    return { sourceSnapshotFieldId: sourceField.id, action, targetTemplateFieldId };
  });
  return actions.sort((left, right) => left.sourceSnapshotFieldId.localeCompare(right.sourceSnapshotFieldId));
}

function hashActions(actions) {
  return crypto.createHash('sha256').update(JSON.stringify(actions)).digest('hex');
}

async function getOrgValueStateHash(orgId, connection = pool, lockRows = false) {
  const [rows] = await connection.query(
    `SELECT id, record_id, field_id, is_pending, SHA2(COALESCE(field_value, ''), 256) AS value_hash
       FROM hr_profile_record_values
      WHERE org_id = ?
      ORDER BY id${lockRows ? ' FOR UPDATE' : ''}`,
    [orgId]
  );
  return crypto.createHash('sha256').update(JSON.stringify(rows.map((row) => [
    row.id, row.record_id, row.field_id, Number(row.is_pending), row.value_hash
  ]))).digest('hex');
}

function encodeToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function decodeToken(token) {
  const parts = safeString(token).split('.');
  if (parts.length !== 2) throw new Error('切换确认已失效，请重新预检');
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(parts[0]).digest('base64url');
  const left = Buffer.from(parts[1]);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error('切换确认已失效，请重新预检');
  const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (!payload.expiresAt || Date.now() > payload.expiresAt) throw new Error('切换确认已过期，请重新预检');
  return payload;
}

async function preflightSwitch(orgId, targetTemplateId, rawActions) {
  const context = await getSwitchContext(orgId, targetTemplateId);
  if (!context) return { status: 'not_found', message: '目标模板不存在' };
  let actions;
  try {
    actions = normalizeActions(context.sourceFields, context.targetTemplate.fields, rawActions);
  } catch (error) {
    return { status: 'invalid_params', message: error.message };
  }
  const targetFields = new Map(context.targetTemplate.fields.map((field) => [field.id, field]));
  const blockers = [];
  for (const action of actions.filter((item) => item.action === 'map')) {
    const target = targetFields.get(action.targetTemplateFieldId);
    const [values] = await pool.query(
      'SELECT field_value FROM hr_profile_record_values WHERE org_id = ? AND field_id = ?',
      [orgId, action.sourceSnapshotFieldId]
    );
    const invalidCount = values.reduce((count, row) => count + (validateMappedValue({
      type: target.type,
      min_length: target.minLength,
      max_length: target.maxLength,
      number_rule: target.numberRule,
      allow_decimal: target.allowDecimal,
      min_digits: target.minDigits,
      max_digits: target.maxDigits,
      min_value: target.minValue,
      max_value: target.maxValue,
      options_json: JSON.stringify(target.options || [])
    }, row.field_value) ? 1 : 0), 0);
    if (invalidCount) blockers.push({ sourceSnapshotFieldId: action.sourceSnapshotFieldId, targetTemplateFieldId: target.id, invalidCount });
  }
  if (blockers.length) return { status: 'mapping_blocked', message: '存在不兼容的历史值', blockers };
  const sourceMap = new Map(context.sourceFields.map((field) => [field.id, field]));
  const summary = actions.reduce((result, action) => {
    const source = sourceMap.get(action.sourceSnapshotFieldId);
    const total = Number(source.currentValueCount || 0) + Number(source.pendingValueCount || 0);
    result[`${action.action}ValueCount`] += total;
    if (action.action === 'delete' && total) result.hasDelete = true;
    return result;
  }, { mapValueCount: 0, hideValueCount: 0, deleteValueCount: 0, hasDelete: false });
  const payload = {
    orgId,
    targetTemplateId,
    targetUpdatedAt: new Date(context.targetTemplate.updatedAt).toISOString(),
    activeSnapshotId: context.activeSnapshot ? context.activeSnapshot.id : '',
    actionsHash: hashActions(actions),
    valueStateHash: await getOrgValueStateHash(orgId),
    expiresAt: Date.now() + TOKEN_TTL_MS
  };
  return { status: 'success', switchToken: encodeToken(payload), summary, actions };
}

async function applySwitch(orgId, targetTemplateId, rawActions, switchToken, confirmDelete, operator) {
  let tokenPayload;
  try {
    tokenPayload = decodeToken(switchToken);
  } catch (error) {
    return { status: 'stale_switch', message: error.message };
  }
  if (tokenPayload.orgId !== orgId || tokenPayload.targetTemplateId !== targetTemplateId) {
    return { status: 'stale_switch', message: '切换目标已变化，请重新预检' };
  }
  return pool.withTransaction(async (connection) => {
    await connection.query('SELECT id FROM organizations WHERE id = ? FOR UPDATE', [orgId]);
    const [lockedTemplates] = await connection.query(
      'SELECT id FROM hr_profile_templates WHERE id = ? FOR UPDATE',
      [targetTemplateId]
    );
    if (!lockedTemplates.length) return { status: 'not_found', message: '目标模板不存在' };
    const context = await getSwitchContext(orgId, targetTemplateId, connection);
    if (!context) return { status: 'not_found', message: '目标模板不存在' };
    let actions;
    try {
      actions = normalizeActions(context.sourceFields, context.targetTemplate.fields, rawActions);
    } catch (error) {
      return { status: 'invalid_params', message: error.message };
    }
    const currentUpdatedAt = new Date(context.targetTemplate.updatedAt).toISOString();
    const activeSnapshotId = context.activeSnapshot ? context.activeSnapshot.id : '';
    if (currentUpdatedAt !== tokenPayload.targetUpdatedAt || activeSnapshotId !== tokenPayload.activeSnapshotId
      || hashActions(actions) !== tokenPayload.actionsHash) {
      return { status: 'stale_switch', message: '模板或组织配置已变化，请重新预检' };
    }
    const valueStateHash = await getOrgValueStateHash(orgId, connection, true);
    if (valueStateHash !== tokenPayload.valueStateHash) {
      return { status: 'stale_switch', message: '人员资料已变化，请重新预检' };
    }
    const targetMap = new Map(context.targetTemplate.fields.map((field) => [field.id, field]));
    for (const action of actions.filter((item) => item.action === 'map')) {
      const target = targetMap.get(action.targetTemplateFieldId);
      const [values] = await connection.query(
        'SELECT field_value FROM hr_profile_record_values WHERE org_id = ? AND field_id = ? FOR UPDATE',
        [orgId, action.sourceSnapshotFieldId]
      );
      if (values.some((row) => validateMappedValue({
        type: target.type, min_length: target.minLength, max_length: target.maxLength,
        number_rule: target.numberRule, allow_decimal: target.allowDecimal,
        min_digits: target.minDigits, max_digits: target.maxDigits,
        min_value: target.minValue, max_value: target.maxValue,
        options_json: JSON.stringify(target.options || [])
      }, row.field_value))) return { status: 'mapping_blocked', message: '历史值已变化，请重新预检' };
    }
    const sourceMap = new Map(context.sourceFields.map((field) => [field.id, field]));
    const hasDelete = actions.some((action) => action.action === 'delete'
      && ((sourceMap.get(action.sourceSnapshotFieldId).currentValueCount || 0)
        + (sourceMap.get(action.sourceSnapshotFieldId).pendingValueCount || 0)) > 0);
    if (hasDelete && confirmDelete !== true) return { status: 'delete_confirmation_required', message: '请确认永久删除历史字段值' };

    const [versions] = await connection.query(
      'SELECT version FROM org_hr_profile_template_snapshots WHERE org_id = ? ORDER BY version DESC LIMIT 1 FOR UPDATE',
      [orgId]
    );
    const snapshotId = generateId();
    const version = Number(versions.length ? versions[0].version : 0) + 1;
    await connection.query(
      `INSERT INTO org_hr_profile_template_snapshots
       (id, org_id, version, source_template_id, source_template_name, description, edit_mode, selected_by, settings_updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [snapshotId, orgId, version, context.targetTemplate.id, context.targetTemplate.name,
       context.targetTemplate.description, context.targetTemplate.editMode, operator.id, operator.id]
    );
    const snapshotFieldIds = new Map();
    for (let index = 0; index < context.targetTemplate.fields.length; index += 1) {
      const field = context.targetTemplate.fields[index];
      const snapshotFieldId = generateId();
      snapshotFieldIds.set(field.id, snapshotFieldId);
      await connection.query(
        `INSERT INTO org_hr_profile_template_snapshot_fields
         (id, snapshot_id, source_template_field_id, sort_order, label, type, required,
          min_length, max_length, number_rule, allow_decimal, min_digits, max_digits, min_value, max_value, options_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [snapshotFieldId, snapshotId, field.id, index + 1, field.label, field.type, field.required ? 1 : 0,
         field.minLength, field.maxLength, field.numberRule, field.allowDecimal ? 1 : 0,
         field.minDigits, field.maxDigits, field.minValue, field.maxValue,
         field.options.length ? JSON.stringify(field.options) : null]
      );
    }

    const switchId = generateId();
    let movedValueCount = 0;
    let hiddenValueCount = 0;
    let deletedValueCount = 0;
    const auditActions = [];
    for (const action of actions) {
      const source = sourceMap.get(action.sourceSnapshotFieldId);
      const currentCount = Number(source.currentValueCount || 0);
      const pendingCount = Number(source.pendingValueCount || 0);
      const total = currentCount + pendingCount;
      let targetSnapshotFieldId = null;
      if (action.action === 'map') {
        targetSnapshotFieldId = snapshotFieldIds.get(action.targetTemplateFieldId);
        await connection.query(
          'UPDATE hr_profile_record_values SET field_id = ? WHERE org_id = ? AND field_id = ?',
          [targetSnapshotFieldId, orgId, action.sourceSnapshotFieldId]
        );
        movedValueCount += total;
      } else if (action.action === 'delete') {
        await connection.query('DELETE FROM hr_profile_record_values WHERE org_id = ? AND field_id = ?', [orgId, action.sourceSnapshotFieldId]);
        deletedValueCount += total;
      } else {
        hiddenValueCount += total;
      }
      auditActions.push({ action, targetSnapshotFieldId, currentCount, pendingCount });
    }
    await connection.query(
      `INSERT INTO org_hr_profile_template_switches
       (id, org_id, from_snapshot_id, to_snapshot_id, target_template_name, operated_by,
        moved_value_count, hidden_value_count, deleted_value_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [switchId, orgId, activeSnapshotId || null, snapshotId, context.targetTemplate.name, operator.id,
       movedValueCount, hiddenValueCount, deletedValueCount]
    );
    for (const item of auditActions) {
      await connection.query(
        `INSERT INTO org_hr_profile_template_switch_actions
         (id, switch_id, source_snapshot_field_id, action, target_snapshot_field_id, current_value_count, pending_value_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), switchId, item.action.sourceSnapshotFieldId, item.action.action,
         item.targetSnapshotFieldId, item.currentCount, item.pendingCount]
      );
    }
    await connection.query(
      `INSERT INTO org_hr_profile_template_settings (org_id, active_snapshot_id, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE active_snapshot_id = VALUES(active_snapshot_id), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [orgId, snapshotId, operator.id]
    );
    await connection.query('UPDATE hr_profile_records SET template_snapshot_id = ? WHERE org_id = ?', [snapshotId, orgId]);
    return { status: 'success', snapshotId, version, summary: { movedValueCount, hiddenValueCount, deletedValueCount } };
  });
}

async function saveOrgSettings(orgId, description, editMode, operator) {
  if (!EDIT_MODES.includes(editMode)) return { status: 'invalid_params', message: '修改模式不合法' };
  const [result] = await pool.query(
    `UPDATE org_hr_profile_template_snapshots snapshot
       JOIN org_hr_profile_template_settings settings ON settings.active_snapshot_id = snapshot.id
        SET snapshot.description = ?, snapshot.edit_mode = ?, snapshot.settings_updated_by = ?, snapshot.settings_updated_at = CURRENT_TIMESTAMP
      WHERE settings.org_id = ? AND snapshot.org_id = ?`,
    [safeString(description).trim(), editMode, operator.id, orgId, orgId]
  );
  if (!result.affectedRows) return { status: 'missing_template', message: '当前组织尚未选择人事模板' };
  return { status: 'success' };
}

async function currentOrgId() {
  return getCurrentOrgId();
}

module.exports = {
  EDIT_MODES,
  FIELD_TYPES,
  serializeField,
  listTemplates,
  getActiveSnapshot,
  saveDefinition,
  duplicateDefinition,
  deleteDefinition,
  getSwitchContext,
  preflightSwitch,
  applySwitch,
  saveOrgSettings,
  currentOrgId,
  _test: {
    validateDefinition,
    isPotentiallyCompatible,
    validateMappedValue,
    normalizeActions,
    hashActions
  }
};
