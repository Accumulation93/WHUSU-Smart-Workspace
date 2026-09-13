const crypto = require('crypto');
const pool = require('../../config/db');
const { safeString, generateId } = require('../../utils/helpers');
const copy = require('../../locales/zh-CN/core/hrProfileMigration');
const templateLibrary = require('./hrProfileTemplateLibrary');
const migrationModel = require('../models/hrProfileMigration');
const { JWT_SECRET } = require('../../middleware/auth');

const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_MEMBERS = 2000;
const MAX_FIELDS = 200;

function hashPlan(plan) {
  return crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

function encodeToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function decodeToken(token) {
  const parts = safeString(token).split('.');
  if (parts.length !== 2) throw new Error(copy.stale);
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(parts[0]).digest('base64url');
  const left = Buffer.from(parts[1]);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error(copy.stale);
  const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (!payload.expiresAt || Date.now() > payload.expiresAt) throw new Error(copy.stale);
  return payload;
}

async function resolveVisibleOrgIds(actor) {
  if (actor.isSuper) {
    const [rows] = await pool.query('SELECT id FROM organizations ORDER BY created_at, id');
    return rows.map((row) => safeString(row.id));
  }
  const [rows] = await pool.query(
    `SELECT DISTINCT org_id FROM admin_grants
      WHERE person_id = ? AND status = 'active' AND org_id <> ''`,
    [safeString(actor.personId)]
  );
  const ids = rows.map((row) => safeString(row.org_id));
  if (actor.orgId && ids.indexOf(actor.orgId) < 0) ids.push(actor.orgId);
  return ids;
}

async function loadActiveSnapshot(orgId, connection = pool) {
  const [snapshots] = await connection.query(
    'SELECT * FROM org_hr_profile_template_snapshots WHERE org_id = ? LIMIT 1',
    [safeString(orgId)]
  );
  const snapshot = snapshots[0];
  if (!snapshot) return null;
  const [fields] = await connection.query(
    'SELECT * FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id = ? AND is_active = 1 ORDER BY sort_order, id',
    [snapshot.id]
  );
  return {
    id: safeString(snapshot.id),
    orgId: safeString(snapshot.org_id),
    editMode: safeString(snapshot.edit_mode) || 'direct',
    updatedAt: snapshot.updated_at || null,
    fields: fields.map(templateLibrary.serializeField)
  };
}

async function listOrgMembers(orgId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT m.person_id, m.legacy_hr_id, m.status, p.name
       FROM organization_memberships m
       JOIN persons p ON p.id = m.person_id
      WHERE m.org_id = ? AND m.status IN ('active', 'left')
      ORDER BY p.name, m.legacy_hr_id
      LIMIT ?`,
    [safeString(orgId), MAX_MEMBERS]
  );
  return rows.map((row) => ({
    personId: safeString(row.person_id),
    hrId: safeString(row.legacy_hr_id),
    status: safeString(row.status),
    name: safeString(row.name)
  }));
}

async function loadEffectiveValues(orgId, personIds, connection = pool) {
  const ids = Array.from(new Set((personIds || []).map(safeString).filter(Boolean)));
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const [memberships] = await connection.query(
    `SELECT person_id, legacy_hr_id FROM organization_memberships
      WHERE org_id = ? AND person_id IN (${placeholders}) AND status IN ('active', 'left')`,
    [safeString(orgId), ...ids]
  );
  const hrIds = memberships.map((row) => safeString(row.legacy_hr_id)).filter(Boolean);
  const records = new Map();
  if (hrIds.length) {
    const hrPlaceholders = hrIds.map(() => '?').join(',');
    const [recordRows] = await connection.query(
      `SELECT id, hr_id FROM hr_profile_records WHERE org_id = ? AND hr_id IN (${hrPlaceholders})`,
      [safeString(orgId), ...hrIds]
    );
    const recordIds = recordRows.map((row) => safeString(row.id)).filter(Boolean);
    const valuesByRecord = new Map();
    if (recordIds.length) {
      const recordPlaceholders = recordIds.map(() => '?').join(',');
      const [valueRows] = await connection.query(
        `SELECT record_id, field_id, field_value FROM hr_profile_record_values
          WHERE org_id = ? AND is_pending = 0 AND record_id IN (${recordPlaceholders})`,
        [safeString(orgId), ...recordIds]
      );
      valueRows.forEach((row) => {
        const byField = valuesByRecord.get(safeString(row.record_id)) || {};
        byField[safeString(row.field_id)] = row.field_value == null ? '' : String(row.field_value);
        valuesByRecord.set(safeString(row.record_id), byField);
      });
    }
    recordRows.forEach((row) => {
      records.set(safeString(row.hr_id), {
        recordId: safeString(row.id),
        values: valuesByRecord.get(safeString(row.id)) || {}
      });
    });
  }
  const result = new Map();
  memberships.forEach((row) => {
    const hrId = safeString(row.legacy_hr_id);
    const record = records.get(hrId) || { recordId: '', values: {} };
    result.set(safeString(row.person_id), {
      hrId,
      recordId: record.recordId,
      values: record.values
    });
  });
  return result;
}

function normalizeFieldActions(sourceFields, targetFields, rawActions) {
  const sourceMap = new Map(sourceFields.map((field) => [field.id, field]));
  const targetMap = new Map(targetFields.map((field) => [field.id, field]));
  const list = Array.isArray(rawActions) ? rawActions : [];
  const usedTargets = new Set();
  const actions = list.map((raw) => {
    const sourceFieldId = safeString(raw && raw.sourceFieldId);
    const source = sourceMap.get(sourceFieldId);
    if (!source) throw new Error(copy.invalidPlan);
    const action = raw && raw.action === 'copy' ? 'copy' : 'skip';
    const targetTemplateFieldId = action === 'copy' ? safeString(raw.targetTemplateFieldId) : '';
    const conflictPolicy = raw && raw.conflictPolicy === 'overwrite' ? 'overwrite' : 'keep';
    if (action === 'copy') {
      const target = targetMap.get(targetTemplateFieldId);
      if (!target) throw new Error(copy.invalidPlan);
      if (!templateLibrary.isPotentiallyCompatible(source.type, target.type)) {
        throw new Error(copy.incompatibleAction);
      }
      if (usedTargets.has(targetTemplateFieldId)) throw new Error(copy.duplicateTargetField);
      usedTargets.add(targetTemplateFieldId);
    }
    return { sourceFieldId, action, targetTemplateFieldId, conflictPolicy };
  });
  if (actions.length !== sourceFields.length) {
    sourceFields.forEach((field) => {
      if (!actions.some((item) => item.sourceFieldId === field.id)) throw new Error(copy.fieldActionsRequired);
    });
  }
  return actions;
}

function buildTargetFieldMap(snapshot) {
  const map = new Map();
  (snapshot.fields || []).forEach((field) => {
    map.set(field.id, {
      type: field.type,
      min_length: field.minLength,
      max_length: field.maxLength,
      number_rule: field.numberRule,
      allow_decimal: field.allowDecimal,
      min_digits: field.minDigits,
      max_digits: field.maxDigits,
      min_value: field.minValue,
      max_value: field.maxValue,
      options_json: JSON.stringify(field.options || [])
    });
  });
  return map;
}

async function buildPlan(actor, payload) {
  const sourceOrgId = safeString(payload && payload.sourceOrgId);
  const targetOrgId = safeString(actor.orgId);
  if (!sourceOrgId || sourceOrgId === targetOrgId) throw new Error(copy.invalidPlan);
  if (!actor.isSuper) {
    const visible = await resolveVisibleOrgIds(actor);
    if (visible.indexOf(sourceOrgId) < 0) throw new Error(copy.sourceNotVisible);
  }
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    loadActiveSnapshot(sourceOrgId),
    loadActiveSnapshot(targetOrgId)
  ]);
  if (!sourceSnapshot || !targetSnapshot) throw new Error(copy.notFound);

  const rawPersonIds = Array.isArray(payload.personIds) ? payload.personIds.map(safeString).filter(Boolean) : [];
  const personIds = Array.from(new Set(rawPersonIds)).slice(0, MAX_MEMBERS);
  if (!personIds.length) throw new Error(copy.emptySelection);

  const fieldActions = normalizeFieldActions(
    sourceSnapshot.fields.slice(0, MAX_FIELDS),
    targetSnapshot.fields.slice(0, MAX_FIELDS),
    payload.fieldActions
  );
  const [sourceValues, targetValues, targetMembers] = await Promise.all([
    loadEffectiveValues(sourceOrgId, personIds),
    loadEffectiveValues(targetOrgId, personIds),
    listOrgMembers(targetOrgId)
  ]);
  const targetMemberMap = new Map(targetMembers.map((item) => [item.personId, item]));
  const targetFieldMap = buildTargetFieldMap(targetSnapshot);
  const sourceFieldMap = new Map(sourceSnapshot.fields.map((field) => [field.id, field]));

  const persons = [];
  const blockers = [];
  const conflicts = [];
  const skipped = [];
  for (const personId of personIds) {
    const member = targetMemberMap.get(personId);
    if (!member) {
      skipped.push({ personId, reason: copy.notFound });
      continue;
    }
    const source = sourceValues.get(personId);
    const target = targetValues.get(personId);
    const snapshotValues = {};
    let hasValue = false;
    for (const action of fieldActions) {
      if (action.action !== 'copy') continue;
      const sourceField = sourceFieldMap.get(action.sourceFieldId);
      const rawValue = source && source.values ? source.values[action.sourceFieldId] : '';
      const value = rawValue == null ? '' : String(rawValue);
      snapshotValues[action.sourceFieldId] = value;
      if (!value.trim()) continue;
      hasValue = true;
      const targetField = targetFieldMap.get(action.targetTemplateFieldId);
      const error = templateLibrary.validateMappedValue(targetField, value);
      if (error) {
        blockers.push({
          personId,
          memberName: member.name,
          fieldLabel: sourceField ? sourceField.label : action.sourceFieldId,
          rawValue: value,
          error
        });
        continue;
      }
      const targetValue = target && target.values ? target.values[action.targetTemplateFieldId] : '';
      if (String(targetValue || '').trim()) {
        conflicts.push({
          personId,
          memberName: member.name,
          sourceFieldId: action.sourceFieldId,
          fieldLabel: sourceField ? sourceField.label : action.sourceFieldId,
          sourceValue: value,
          targetValue: String(targetValue),
          conflictPolicy: action.conflictPolicy
        });
      }
    }
    if (!hasValue) {
      skipped.push({ personId, reason: copy.noSourceValues });
      continue;
    }
    persons.push({
      personId,
      sourceHrId: source ? source.hrId : '',
      targetHrId: member.hrId,
      values: snapshotValues
    });
  }

  const plan = {
    version: 1,
    sourceOrgId,
    targetOrgId,
    sourceSnapshotId: sourceSnapshot.id,
    targetSnapshotId: targetSnapshot.id,
    fieldActions,
    persons
  };
  const payloadToken = {
    sourceOrgId,
    targetOrgId,
    sourceSnapshotId: sourceSnapshot.id,
    targetSnapshotId: targetSnapshot.id,
    planHash: hashPlan(plan),
    expiresAt: Date.now() + TOKEN_TTL_MS
  };
  return {
    plan,
    token: encodeToken(payloadToken),
    blockers,
    conflicts,
    skipped,
    summary: {
      personCount: persons.length,
      copyFieldCount: fieldActions.filter((item) => item.action === 'copy').length,
      blockerCount: blockers.length,
      conflictCount: conflicts.length,
      skippedCount: skipped.length
    },
    sourceFields: sourceSnapshot.fields,
    targetFields: targetSnapshot.fields
  };
}

async function executePlan(actor, plan, token, connection = null) {
  const payload = decodeToken(token);
  if (payload.sourceOrgId !== plan.sourceOrgId || payload.targetOrgId !== plan.targetOrgId
    || payload.planHash !== hashPlan(plan)) throw new Error(copy.stale);
  const run = async (conn) => {
    const [sourceSnapshot, targetSnapshot] = await Promise.all([
      loadActiveSnapshot(plan.sourceOrgId, conn),
      loadActiveSnapshot(plan.targetOrgId, conn)
    ]);
    if (!sourceSnapshot || !targetSnapshot
      || sourceSnapshot.id !== plan.sourceSnapshotId
      || targetSnapshot.id !== plan.targetSnapshotId) throw new Error(copy.stale);
    const targetFieldMap = new Map(targetSnapshot.fields.map((field) => [field.id, field]));
    const copied = [];
    for (const person of plan.persons) {
      const [records] = await conn.query(
        `SELECT id FROM hr_profile_records WHERE hr_id = ? AND org_id = ? LIMIT 1`,
        [safeString(person.targetHrId), safeString(plan.targetOrgId)]
      );
      let recordId = records[0] ? safeString(records[0].id) : '';
      if (!recordId) {
        recordId = generateId();
        await conn.query(
          `INSERT INTO hr_profile_records
            (id, hr_id, name, template_snapshot_id, audit_status, reviewed_at, org_id)
           VALUES (?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP, ?)`,
          [recordId, safeString(person.targetHrId), '', plan.targetSnapshotId, safeString(plan.targetOrgId)]
        );
      }
      const itemResult = [];
      for (const action of plan.fieldActions) {
        if (action.action !== 'copy') continue;
        const targetField = targetFieldMap.get(action.targetTemplateFieldId);
        if (!targetField) continue;
        const rawValue = person.values ? person.values[action.sourceFieldId] : '';
        const value = rawValue == null ? '' : String(rawValue);
        if (!value.trim()) continue;
        const mapped = templateLibrary.coerceMappedValue({
          type: targetField.type,
          min_length: targetField.minLength,
          max_length: targetField.maxLength,
          number_rule: targetField.numberRule,
          allow_decimal: targetField.allowDecimal,
          min_digits: targetField.minDigits,
          max_digits: targetField.maxDigits,
          min_value: targetField.minValue,
          max_value: targetField.maxValue,
          options_json: JSON.stringify(targetField.options || [])
        }, value);
        if (mapped.error) continue;
        const [existing] = await conn.query(
          `SELECT id, field_value FROM hr_profile_record_values
            WHERE org_id = ? AND record_id = ? AND field_id = ? AND is_pending = 0 LIMIT 1 FOR UPDATE`,
          [safeString(plan.targetOrgId), recordId, action.targetTemplateFieldId]
        );
        if (existing.length) {
          if (action.conflictPolicy !== 'overwrite') continue;
          await conn.query(
            'UPDATE hr_profile_record_values SET field_value = ? WHERE id = ? AND org_id = ?',
            [mapped.value, existing[0].id, safeString(plan.targetOrgId)]
          );
        } else {
          await conn.query(
            `INSERT INTO hr_profile_record_values (id, record_id, is_pending, field_id, field_value, org_id)
             VALUES (?, ?, 0, ?, ?, ?)`,
            [generateId(), recordId, action.targetTemplateFieldId, mapped.value, safeString(plan.targetOrgId)]
          );
        }
        itemResult.push({ targetTemplateFieldId: action.targetTemplateFieldId });
      }
      copied.push({ personId: person.personId, recordId, fields: itemResult });
    }
    await conn.query(
      'UPDATE hr_profile_records SET updated_at = CURRENT_TIMESTAMP WHERE org_id = ? AND id IN ('
        + copied.map(() => '?').join(',') + ')',
      copied.length ? [safeString(plan.targetOrgId), ...copied.map((item) => item.recordId)] : ['', '']
    ).catch(() => {});
    return copied;
  };
  if (connection) return run(connection);
  return pool.withTransaction(run);
}

module.exports = {
  resolveVisibleOrgIds,
  loadActiveSnapshot,
  listOrgMembers,
  buildPlan,
  executePlan,
  encodeToken,
  decodeToken,
  hashPlan
};
