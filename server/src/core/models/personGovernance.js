const pool = require('../../config/db');
const { safeString } = require('../../utils/helpers');
const unifiedIdentityModel = require('./unifiedIdentity');
const { decryptOpenid } = require('../services/identityCrypto');
const personnelCopy = require('../../locales/zh-CN/core/personnel');

function normalizeStudentId(value) {
  return safeString(value).toLowerCase();
}

function versionOf(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? String(time) : '';
}

function timestampOf(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function profileValueKey(value) {
  return [safeString(value.field_id), Number(value.is_pending) ? '1' : '0'].join(':');
}

async function mergeMembershipProfile(connection, sourceMembership, targetMembership, targetPerson) {
  const sourceHrId = safeString(sourceMembership.legacy_hr_id);
  const targetHrId = safeString(targetMembership.legacy_hr_id);
  const organizationId = safeString(sourceMembership.org_id);
  if (!sourceHrId || !targetHrId || sourceHrId === targetHrId) return;

  const [records] = await connection.query(
    `SELECT *
       FROM hr_profile_records
      WHERE org_id = ? AND hr_id IN (?, ?)
      ORDER BY updated_at ASC, id ASC
      FOR UPDATE`,
    [organizationId, sourceHrId, targetHrId]
  );
  const sourceRecord = records.find((item) => safeString(item.hr_id) === sourceHrId);
  const targetRecord = records.find((item) => safeString(item.hr_id) === targetHrId);
  if (!sourceRecord) return;
  if (!targetRecord) {
    await connection.query(
      `UPDATE hr_profile_records
          SET hr_id = ?, name = ?, updated_at = NOW()
        WHERE id = ? AND org_id = ?`,
      [targetHrId, targetPerson.name, sourceRecord.id, organizationId]
    );
    return;
  }

  const [values] = await connection.query(
    `SELECT *
       FROM hr_profile_record_values
      WHERE record_id IN (?, ?) AND org_id = ?
      ORDER BY updated_at ASC, id ASC
      FOR UPDATE`,
    [sourceRecord.id, targetRecord.id, organizationId]
  );
  const targetValues = new Map(
    values
      .filter((item) => safeString(item.record_id) === safeString(targetRecord.id))
      .map((item) => [profileValueKey(item), item])
  );
  for (const sourceValue of values.filter(
    (item) => safeString(item.record_id) === safeString(sourceRecord.id)
  )) {
    const key = profileValueKey(sourceValue);
    const targetValue = targetValues.get(key);
    if (!targetValue) {
      await connection.query(
        `UPDATE hr_profile_record_values
            SET record_id = ?, updated_at = updated_at
          WHERE id = ? AND org_id = ?`,
        [targetRecord.id, sourceValue.id, organizationId]
      );
      targetValues.set(key, sourceValue);
      continue;
    }
    const sourceIsNewer = timestampOf(sourceValue.updated_at) > timestampOf(targetValue.updated_at)
      || (timestampOf(sourceValue.updated_at) === timestampOf(targetValue.updated_at)
        && safeString(sourceValue.id) > safeString(targetValue.id));
    if (sourceIsNewer) {
      await connection.query(
        `UPDATE hr_profile_record_values
            SET field_value = ?, updated_at = ?
          WHERE id = ? AND org_id = ?`,
        [sourceValue.field_value, sourceValue.updated_at, targetValue.id, organizationId]
      );
    }
    await connection.query(
      'DELETE FROM hr_profile_record_values WHERE id = ? AND org_id = ?',
      [sourceValue.id, organizationId]
    );
  }

  await connection.query(
    'UPDATE hr_profile_review_events SET record_id = ? WHERE record_id = ? AND org_id = ?',
    [targetRecord.id, sourceRecord.id, organizationId]
  );
  await connection.query(
    'UPDATE person_profile_values SET source_record_id = ? WHERE source_record_id = ?',
    [targetRecord.id, sourceRecord.id]
  );
  await connection.query(
    'UPDATE person_profile_value_history SET source_record_id = ? WHERE source_record_id = ?',
    [targetRecord.id, sourceRecord.id]
  );

  const pendingRecords = [sourceRecord, targetRecord].filter(
    (item) => safeString(item.audit_status) === 'pending'
  );
  const candidates = pendingRecords.length ? pendingRecords : [sourceRecord, targetRecord];
  const selectedRecord = candidates.slice().sort((left, right) => (
    timestampOf(right.updated_at) - timestampOf(left.updated_at)
      || safeString(right.id).localeCompare(safeString(left.id))
  ))[0];
  const nextAuditStatus = pendingRecords.length ? 'pending' : safeString(selectedRecord.audit_status) || 'none';
  await connection.query(
    `UPDATE hr_profile_records
        SET name = ?, openid = COALESCE(NULLIF(openid, ''), ?),
            template_snapshot_id = ?, audit_status = ?, rejection_reason = ?,
            requested_at = ?, reviewed_at = ?, updated_at = NOW()
      WHERE id = ? AND org_id = ?`,
    [
      targetPerson.name,
      safeString(sourceRecord.openid),
      selectedRecord.template_snapshot_id || targetRecord.template_snapshot_id || sourceRecord.template_snapshot_id,
      nextAuditStatus,
      nextAuditStatus === 'pending' ? null : selectedRecord.rejection_reason,
      selectedRecord.requested_at || targetRecord.requested_at || sourceRecord.requested_at,
      nextAuditStatus === 'pending' ? null : (selectedRecord.reviewed_at || targetRecord.reviewed_at || sourceRecord.reviewed_at),
      targetRecord.id,
      organizationId
    ]
  );
  await connection.query(
    'DELETE FROM hr_profile_records WHERE id = ? AND org_id = ?',
    [sourceRecord.id, organizationId]
  );
}

async function revokeDuplicateAssignmentsBeforeMembershipMerge(
  connection,
  sourceMembershipId,
  targetMembershipId,
  organizationId
) {
  const [duplicates] = await connection.query(
    `SELECT source_assignment.id
       FROM membership_assignments source_assignment
       JOIN membership_assignments target_assignment
         ON target_assignment.membership_id = ?
        AND target_assignment.org_id = source_assignment.org_id
        AND target_assignment.status = 'active'
        AND target_assignment.assignment_kind = source_assignment.assignment_kind
        AND target_assignment.department_id <=> source_assignment.department_id
        AND target_assignment.identity_id <=> source_assignment.identity_id
        AND target_assignment.work_group_id <=> source_assignment.work_group_id
      WHERE source_assignment.membership_id = ?
        AND source_assignment.org_id = ?
        AND source_assignment.status = 'active'
      ORDER BY source_assignment.id
      FOR UPDATE`,
    [safeString(targetMembershipId), safeString(sourceMembershipId), safeString(organizationId)]
  );
  const duplicateIds = Array.from(new Set(
    duplicates.map((item) => safeString(item.id)).filter(Boolean)
  ));
  if (!duplicateIds.length) return 0;
  await connection.query(
    `UPDATE membership_assignments
        SET status = 'revoked', revoked_by_departure_id = NULL, updated_at = NOW()
      WHERE id IN (?) AND membership_id = ? AND org_id = ? AND status = 'active'`,
    [duplicateIds, safeString(sourceMembershipId), safeString(organizationId)]
  );
  await connection.query(
    `UPDATE auth_sessions
        SET status = 'revoked', revoked_at = NOW()
      WHERE context_type = 'assignment' AND context_subject_id IN (?) AND status = 'active'`,
    [duplicateIds]
  );
  return duplicateIds.length;
}

async function listPersonMembershipImpact(personId, connection = pool) {
  const [memberships] = await connection.query(
    `SELECT om.id, om.org_id, om.legacy_hr_id, om.status, o.name AS organization_name,
            (SELECT COUNT(*) FROM membership_assignments ma
              WHERE ma.membership_id = om.id AND ma.status = 'active') AS assignment_count
       FROM organization_memberships om
       JOIN organizations o ON o.id = om.org_id
      WHERE om.person_id = ?
      ORDER BY o.name ASC`,
    [safeString(personId)]
  );
  return memberships;
}

async function cancelPendingIdentityFlows(connection, sourcePersonId) {
  await connection.query(
    `UPDATE identity_verification_tokens
        SET status = 'revoked'
      WHERE person_id = ? AND status = 'active'`,
    [sourcePersonId]
  );
  await connection.query(
    `UPDATE identity_claim_requests
        SET status = 'superseded', updated_at = NOW()
      WHERE person_id = ? AND status = 'pending'`,
    [sourcePersonId]
  );
  await connection.query(
    `UPDATE identity_verification_invites
        SET status = 'revoked', updated_at = NOW()
      WHERE person_id = ? AND status = 'active'
        AND org_id IN (
          SELECT org_id FROM organization_memberships WHERE person_id = ?
        )`,
    [sourcePersonId, sourcePersonId]
  );
  await connection.query(
    `UPDATE account_recovery_requests
        SET status = 'superseded', reviewed_at = NOW(), updated_at = NOW()
      WHERE person_id = ? AND status = 'pending'`,
    [sourcePersonId]
  );
  await connection.query(
    `UPDATE admin_info ai
       JOIN admin_grants ag ON ag.legacy_admin_id = ai.id AND ag.org_id = ai.org_id
          SET ai.openid = NULL,
              ai.bind_status = 'invited',
              ai.bound_at = NULL,
              ai.invite_code = NULL,
              ai.invite_expires_at = NULL,
              ai.invite_consumed_at = NULL,
              ai.updated_at = NOW()
        WHERE ag.person_id = ?`,
    [sourcePersonId]
  );
}

async function loadAccountBindingOpenid(connection, accountId) {
  if (!accountId) return '';
  const [rows] = await connection.query(
    `SELECT openid_ciphertext, legacy_openid
       FROM account_wechat_bindings
      WHERE account_id = ? AND status IN ('active', 'revoked')
      ORDER BY status = 'active' DESC, updated_at DESC
      LIMIT 1 FOR UPDATE`,
    [accountId]
  );
  const binding = rows[0];
  if (!binding) return '';
  return binding.openid_ciphertext
    ? decryptOpenid(binding.openid_ciphertext)
    : safeString(binding.legacy_openid);
}

async function removeSourceLegacyUserBindings(connection, sourcePersonId, sourceOpenid) {
  await connection.query(
    `DELETE ui
       FROM user_info ui
       JOIN organization_memberships om
         ON om.legacy_hr_id = ui.hr_id AND om.org_id = ui.org_id
      WHERE om.person_id = ?`,
    [sourcePersonId]
  );
  if (sourceOpenid) {
    await connection.query('DELETE FROM user_info WHERE openid = ?', [sourceOpenid]);
  }
}

async function syncTargetLegacyBindings(connection, account) {
  if (!account || safeString(account.status) !== 'verified') return;
  const [bindings] = await connection.query(
    `SELECT id
       FROM account_wechat_bindings
      WHERE account_id = ? AND status = 'active'
      LIMIT 1 FOR UPDATE`,
    [account.id]
  );
  if (!bindings.length) return;
  await unifiedIdentityModel.syncLegacyBindings(
    connection,
    account.id,
    async () => {
      const [rows] = await connection.query(
        `SELECT openid_ciphertext, legacy_openid
           FROM account_wechat_bindings
          WHERE account_id = ? AND status = 'active'
          LIMIT 1 FOR UPDATE`,
        [account.id]
      );
      const binding = rows[0];
      if (!binding) return '';
      return binding.openid_ciphertext
        ? decryptOpenid(binding.openid_ciphertext)
        : safeString(binding.legacy_openid);
    }
  );
}

async function loadPersonImpact(legacyHrId, organizationId, connection = pool, lock = false) {
  const [rows] = await connection.query(
    `SELECT p.id, p.name, p.student_id, p.normalized_student_id, p.updated_at,
            om.id AS membership_id, om.org_id, om.legacy_hr_id, om.status AS membership_status,
            a.id AS account_id, a.status AS account_status
       FROM organization_memberships om
       JOIN persons p ON p.id = om.person_id
       LEFT JOIN accounts a ON a.person_id = p.id
      WHERE om.legacy_hr_id = ? AND om.org_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [safeString(legacyHrId), safeString(organizationId)]
  );
  const person = rows[0] || null;
  if (!person) return null;
  const memberships = await listPersonMembershipImpact(person.id, connection);
  return { person, memberships };
}

async function previewCorrection(data) {
  if (!safeString(data.legacyHrId) || !safeString(data.organizationId)
    || !safeString(data.name) || !normalizeStudentId(data.studentId)) {
    throw new unifiedIdentityModel.IdentityError('invalid_params', personnelCopy.missingMemberOrOrganization, 400);
  }
  const impact = await loadPersonImpact(data.legacyHrId, data.organizationId);
  if (!impact) return null;
  const nextName = safeString(data.name);
  const nextStudentId = safeString(data.studentId);
  const normalizedStudentId = normalizeStudentId(nextStudentId);
  const [conflicts] = await pool.query(
    `SELECT p.id, p.name, p.student_id, p.updated_at, a.status AS account_status
       FROM persons p
       LEFT JOIN accounts a ON a.person_id = p.id
      WHERE p.normalized_student_id = ? AND p.id <> ? AND p.status = 'active'
      LIMIT 1`,
    [normalizedStudentId, impact.person.id]
  );
  const conflictMemberships = conflicts[0]
    ? await listPersonMembershipImpact(conflicts[0].id)
    : [];
  return {
    personId: safeString(impact.person.id),
    current: {
      name: safeString(impact.person.name),
      studentId: safeString(impact.person.student_id)
    },
    proposed: { name: nextName, studentId: nextStudentId },
    version: versionOf(impact.person.updated_at),
    organizations: impact.memberships.map((item) => ({
      organizationId: safeString(item.org_id),
      organizationName: safeString(item.organization_name),
      membershipStatus: safeString(item.status),
      assignmentCount: Number(item.assignment_count || 0)
    })),
    accountStatus: safeString(impact.person.account_status),
    mergeRequired: Boolean(conflicts.length),
    conflictPerson: conflicts[0] ? {
      personId: safeString(conflicts[0].id),
      name: safeString(conflicts[0].name),
      studentId: safeString(conflicts[0].student_id),
      version: versionOf(conflicts[0].updated_at),
      accountStatus: safeString(conflicts[0].account_status),
      organizations: conflictMemberships.map((item) => ({
        organizationId: safeString(item.org_id),
        organizationName: safeString(item.organization_name),
        membershipStatus: safeString(item.status),
        assignmentCount: Number(item.assignment_count || 0)
      }))
    } : null
  };
}

async function applyCorrection(data, actor) {
  const nextName = safeString(data.name);
  const nextStudentId = safeString(data.studentId);
  const normalizedStudentId = normalizeStudentId(nextStudentId);
  if (!nextName || !normalizedStudentId) {
    throw new unifiedIdentityModel.IdentityError('invalid_params', personnelCopy.missingMemberOrOrganization, 400);
  }
  return pool.withTransaction(async (connection) => {
    const impact = await loadPersonImpact(data.legacyHrId, data.organizationId, connection, true);
    if (!impact) throw new unifiedIdentityModel.IdentityError('person_not_found', personnelCopy.formerMemberNotFound, 404);
    if (safeString(data.version) !== versionOf(impact.person.updated_at)) {
      throw new unifiedIdentityModel.IdentityError('person_version_conflict', personnelCopy.personCorrectionRequired, 409);
    }
    const [conflicts] = await connection.query(
      `SELECT id FROM persons
        WHERE normalized_student_id = ? AND id <> ? AND status = 'active'
        LIMIT 1 FOR UPDATE`,
      [normalizedStudentId, impact.person.id]
    );
    if (conflicts.length) {
      throw new unifiedIdentityModel.IdentityError('person_merge_required', personnelCopy.personCorrectionConflict, 409);
    }
    await connection.query(
      `UPDATE persons
          SET name = ?, student_id = ?, normalized_student_id = ?, updated_at = NOW()
        WHERE id = ?`,
      [nextName, nextStudentId, normalizedStudentId, impact.person.id]
    );
    await connection.query(
      `UPDATE hr_info h
       JOIN organization_memberships om ON om.legacy_hr_id = h.id
          SET h.name = ?, h.student_id = ?, h.updated_at = NOW()
        WHERE om.person_id = ? AND h.org_id = om.org_id`,
      [nextName, nextStudentId, impact.person.id]
    );
    await connection.query(
      `UPDATE admin_info ai
       JOIN admin_grants ag ON ag.legacy_admin_id = ai.id
          SET ai.name = ?, ai.student_id = ?, ai.updated_at = NOW()
        WHERE ag.person_id = ? AND ai.org_id = ag.org_id`,
      [nextName, nextStudentId, impact.person.id]
    );
    await connection.query(
      `UPDATE hr_profile_records profile
       JOIN organization_memberships membership ON membership.legacy_hr_id = profile.hr_id
          SET profile.name = ?, profile.updated_at = NOW()
        WHERE membership.person_id = ? AND profile.org_id = membership.org_id`,
      [nextName, impact.person.id]
    );
    await unifiedIdentityModel.appendAuditEvent({
      connection,
      eventType: 'person_identity_corrected',
      actorPersonId: actor && actor.personId,
      targetPersonId: impact.person.id,
      organizationId: safeString(data.organizationId),
      contextId: actor && actor.contextId,
      detail: {
        previousName: safeString(impact.person.name),
        previousStudentId: safeString(impact.person.student_id),
        nextName,
        nextStudentId,
        affectedOrganizations: impact.memberships.length
      }
    });
    return { personId: impact.person.id, affectedOrganizations: impact.memberships.length };
  });
}

async function mergePersons(data, actor) {
  const sourcePersonId = safeString(data.sourcePersonId);
  const targetPersonId = safeString(data.targetPersonId);
  const organizationId = safeString(data.organizationId);
  if (!sourcePersonId || !targetPersonId || sourcePersonId === targetPersonId || !organizationId) {
    throw new unifiedIdentityModel.IdentityError('invalid_params', personnelCopy.personCorrectionConflict, 400);
  }
  return pool.withTransaction(async (connection) => {
    const ids = [sourcePersonId, targetPersonId].sort();
    const [people] = await connection.query(
      `SELECT id, name, student_id, normalized_student_id, status, merged_into_person_id, updated_at
         FROM persons WHERE id IN (?, ?) FOR UPDATE`,
      ids
    );
    const source = people.find((item) => safeString(item.id) === sourcePersonId);
    const target = people.find((item) => safeString(item.id) === targetPersonId);
    const [sourceMembershipsInOrganization] = await connection.query(
      `SELECT id
         FROM organization_memberships
        WHERE person_id = ? AND org_id = ?
        LIMIT 1 FOR UPDATE`,
      [sourcePersonId, organizationId]
    );
    if (!sourceMembershipsInOrganization.length) {
      throw new unifiedIdentityModel.IdentityError('person_not_found', personnelCopy.formerMemberNotFound, 404);
    }
    const alreadyMerged = source && source.status === 'merged'
      && safeString(source.merged_into_person_id) === targetPersonId
      && target && target.status === 'active';
    if (!alreadyMerged && (!source || !target || source.status !== 'active' || target.status !== 'active')) {
      throw new unifiedIdentityModel.IdentityError('person_not_found', personnelCopy.formerMemberNotFound, 404);
    }
    if (!alreadyMerged && (safeString(data.sourceVersion) !== versionOf(source.updated_at)
      || safeString(data.targetVersion) !== versionOf(target.updated_at))) {
      throw new unifiedIdentityModel.IdentityError(
        'person_version_conflict',
        personnelCopy.personMergeVersionConflict,
        409
      );
    }
    const [accounts] = await connection.query(
      'SELECT id, person_id, status FROM accounts WHERE person_id IN (?, ?) FOR UPDATE',
      [sourcePersonId, targetPersonId]
    );
    const sourceAccount = accounts.find((item) => safeString(item.person_id) === sourcePersonId);
    const targetAccount = accounts.find((item) => safeString(item.person_id) === targetPersonId);
    const sourceOpenid = await loadAccountBindingOpenid(connection, sourceAccount && sourceAccount.id);
    if (alreadyMerged) {
      await removeSourceLegacyUserBindings(connection, sourcePersonId, sourceOpenid);
      await cancelPendingIdentityFlows(connection, sourcePersonId);
      await syncTargetLegacyBindings(connection, targetAccount);
      return { personId: targetPersonId, mergedPersonId: sourcePersonId, idempotent: true };
    }
    if (sourceAccount && targetAccount) {
      await connection.query(
        `UPDATE account_wechat_bindings
            SET status = 'revoked', active_account_id = NULL,
                revoked_at = NOW(), updated_at = NOW()
          WHERE account_id = ? AND status = 'active'`,
        [sourceAccount.id]
      );
      await connection.query(
        `UPDATE auth_sessions
            SET status = 'revoked', revoked_at = NOW()
          WHERE account_id = ? AND status = 'active'`,
        [sourceAccount.id]
      );
      await connection.query(
        `UPDATE account_recovery_credentials
            SET status = 'revoked', updated_at = NOW()
          WHERE account_id = ? AND status = 'active'`,
        [sourceAccount.id]
      );
      await connection.query(
        `UPDATE accounts
            SET status = 'frozen', token_version = token_version + 1, updated_at = NOW()
          WHERE id = ? AND person_id = ?`,
        [sourceAccount.id, sourcePersonId]
      );
    }
    await removeSourceLegacyUserBindings(connection, sourcePersonId, sourceOpenid);
    await cancelPendingIdentityFlows(connection, sourcePersonId);
    const [sourceMemberships] = await connection.query(
      'SELECT om.* FROM organization_memberships om WHERE om.person_id = ? ORDER BY om.org_id FOR UPDATE',
      [sourcePersonId]
    );
    const transferredMemberships = [];
    for (const membership of sourceMemberships) {
      const [targetMemberships] = await connection.query(
        'SELECT * FROM organization_memberships WHERE person_id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
        [targetPersonId, membership.org_id]
      );
      if (targetMemberships.length) {
        const targetMembership = targetMemberships[0];
        await mergeMembershipProfile(connection, membership, targetMembership, target);
        await revokeDuplicateAssignmentsBeforeMembershipMerge(
          connection,
          membership.id,
          targetMembership.id,
          membership.org_id
        );
        await connection.query(
          `UPDATE membership_assignments
              SET membership_id = ?, updated_at = NOW()
            WHERE membership_id = ? AND org_id = ?`,
          [targetMembership.id, membership.id, membership.org_id]
        );
        if (membership.status === 'active' && targetMembership.status !== 'active') {
          await connection.query(
            `UPDATE organization_memberships
                SET status = 'active', departure_batch_id = NULL, updated_at = NOW()
              WHERE id = ? AND org_id = ?`,
            [targetMembership.id, membership.org_id]
          );
        }
        await connection.query(
          `UPDATE auth_sessions
              SET status = 'revoked', revoked_at = NOW()
            WHERE context_type = 'membership' AND context_subject_id = ? AND status = 'active'`,
          [membership.id]
        );
        await connection.query(
          `UPDATE organization_memberships
              SET status = 'merged', updated_at = NOW()
            WHERE id = ? AND org_id = ?`,
          [membership.id, membership.org_id]
        );
      } else {
        await connection.query(
          'UPDATE organization_memberships SET person_id = ?, updated_at = NOW() WHERE id = ? AND org_id = ?',
          [targetPersonId, membership.id, membership.org_id]
        );
        transferredMemberships.push(membership);
      }
    }
    const [sourceGrants] = await connection.query(
      'SELECT ag.* FROM admin_grants ag WHERE ag.person_id = ? ORDER BY ag.org_id FOR UPDATE',
      [sourcePersonId]
    );
    for (const grant of sourceGrants) {
      const [targetGrants] = await connection.query(
        'SELECT id FROM admin_grants WHERE person_id = ? AND org_id = ? LIMIT 1 FOR UPDATE',
        [targetPersonId, grant.org_id]
      );
      if (targetGrants.length) {
        await connection.query(
          "UPDATE admin_grants SET status = 'revoked', updated_at = NOW() WHERE id = ? AND org_id = ?",
          [grant.id, grant.org_id]
        );
      } else {
        await connection.query(
          'UPDATE admin_grants SET person_id = ?, updated_at = NOW() WHERE id = ? AND org_id = ?',
          [targetPersonId, grant.id, grant.org_id]
        );
      }
    }
    const [sourceValues] = await connection.query(
      'SELECT * FROM person_profile_values WHERE person_id = ? FOR UPDATE',
      [sourcePersonId]
    );
    for (const value of sourceValues) {
      const [targetValues] = await connection.query(
        `SELECT id, value_updated_at FROM person_profile_values
          WHERE person_id = ? AND normalized_label = ? AND field_type = ?
          LIMIT 1 FOR UPDATE`,
        [targetPersonId, value.normalized_label, value.field_type]
      );
      const current = targetValues[0];
      if (!current) {
        await connection.query(
          'UPDATE person_profile_values SET person_id = ?, updated_at = NOW() WHERE id = ?',
          [targetPersonId, value.id]
        );
      } else if (new Date(value.value_updated_at).getTime() >= new Date(current.value_updated_at).getTime()) {
        await connection.query(
          `UPDATE person_profile_values
              SET field_label = ?, field_value = ?, value_updated_at = ?, source_org_id = ?,
                  source_record_id = ?, source_field_id = ?, updated_at = NOW()
            WHERE id = ?`,
          [value.field_label, value.field_value, value.value_updated_at, value.source_org_id,
            value.source_record_id, value.source_field_id, current.id]
        );
        await connection.query('DELETE FROM person_profile_values WHERE id = ?', [value.id]);
      } else {
        await connection.query('DELETE FROM person_profile_values WHERE id = ?', [value.id]);
      }
    }
    await connection.query(
      'UPDATE person_profile_value_history SET person_id = ? WHERE person_id = ?',
      [targetPersonId, sourcePersonId]
    );
    if (sourceAccount && !targetAccount) {
      await connection.query('UPDATE accounts SET person_id = ?, updated_at = NOW() WHERE id = ?', [targetPersonId, sourceAccount.id]);
    }
    for (const membership of transferredMemberships) {
      if (!safeString(membership.legacy_hr_id)) continue;
      await connection.query(
        `UPDATE hr_info SET name = ?, student_id = ?, updated_at = NOW()
          WHERE id = ? AND org_id = ?`,
        [target.name, target.student_id, membership.legacy_hr_id, membership.org_id]
      );
    }
    const survivingAccount = targetAccount || sourceAccount;
    await syncTargetLegacyBindings(connection, survivingAccount);
    await connection.query(
      `UPDATE persons
          SET status = 'merged', merged_into_person_id = ?, updated_at = NOW()
        WHERE id = ?`,
      [targetPersonId, sourcePersonId]
    );
    await unifiedIdentityModel.appendAuditEvent({
      connection,
      eventType: 'persons_merged',
      actorPersonId: actor && actor.personId,
      targetPersonId,
      organizationId,
      contextId: actor && actor.contextId,
      detail: { sourcePersonId, targetPersonId, memberships: sourceMemberships.length }
    });
    return { personId: targetPersonId, mergedPersonId: sourcePersonId };
  });
}

module.exports = { previewCorrection, applyCorrection, mergePersons };
