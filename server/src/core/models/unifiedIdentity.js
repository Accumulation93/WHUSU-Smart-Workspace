const pool = require('../../config/db');
const { generateId, safeString } = require('../../utils/helpers');
const {
  hmac,
  legacyHash,
  encryptOpenid,
  decryptOpenid,
  randomCode,
  hashPassphrase,
  verifyPassphrase,
  secureEqualHex
} = require('../services/identityCrypto');

const APP_ID = 'whusu-smart-workspace';
const SESSION_MINUTES = 30;
const BOOTSTRAP_MINUTES = 15;
const CLAIM_HOURS = 48;
const VERIFY_TOKEN_HOURS = 24;
const RECOVERY_HOURS = 24;
const MAX_VERIFY_ATTEMPTS = 8;
const MAX_RECOVERY_ATTEMPTS = 8;

class IdentityError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.name = 'IdentityError';
    this.code = code;
    this.httpStatus = httpStatus || 400;
  }
}

function contextId(type, subjectId, orgId) {
  return 'ctx_' + hmac([type, subjectId, orgId].join('|')).slice(0, 40);
}

function authIdentityId(type, subjectId) {
  return 'idn_' + hmac([type, subjectId].join('|')).slice(0, 40);
}

function normalizeStudentId(value) {
  return safeString(value).toLowerCase();
}

function normalizeName(value) {
  return safeString(value);
}

function normalizePolicyDate(value, label) {
  const text = safeString(value);
  if (!text) return null;
  const parsed = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    throw new IdentityError('invalid_policy_time', '请重新选择' + label, 400);
  }
  return text;
}

function policyTimestamp(value) {
  if (!value) return 0;
  const parsed = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getTime();
}

function normalizeAssignmentTitle(row) {
  const parts = [
    safeString(row.assignment_title),
    safeString(row.identity_name),
    safeString(row.department_name),
    safeString(row.work_group_name)
  ].filter(Boolean);
  return parts[0] || '普通岗位';
}

function mapAssignmentContext(row) {
  return {
    contextId: contextId('assignment', row.assignment_id, row.organization_id),
    authIdentityId: authIdentityId('assignment', row.assignment_id),
    identityScope: 'organization',
    organizationId: safeString(row.organization_id),
    organizationName: safeString(row.organization_name),
    identityType: 'assignment',
    identityName: normalizeAssignmentTitle(row),
    role: 'user',
    personId: safeString(row.person_id),
    membershipId: safeString(row.membership_id),
    assignmentId: safeString(row.assignment_id),
    adminGrantId: '',
    legacyHrId: safeString(row.legacy_hr_id),
    legacyAdminId: '',
    name: safeString(row.person_name),
    studentId: safeString(row.student_id),
    departmentId: safeString(row.department_id),
    department: safeString(row.department_name),
    identityId: safeString(row.identity_id),
    identity: safeString(row.identity_name),
    workGroupId: safeString(row.work_group_id),
    workGroup: safeString(row.work_group_name),
    adminLevel: '',
    isPrimary: Boolean(row.is_primary),
    permissions: []
  };
}

function mapAdminContext(row) {
  const isGlobal = row.admin_level === 'super_admin' && safeString(row.grant_org_id) === '';
  return {
    contextId: contextId('admin', row.admin_grant_id, row.organization_id),
    authIdentityId: authIdentityId('admin', row.admin_grant_id),
    identityScope: isGlobal ? 'global' : 'organization',
    organizationId: safeString(row.organization_id),
    organizationName: safeString(row.organization_name),
    identityType: 'admin',
    identityName: row.admin_level === 'super_admin' ? '超级管理员' : '管理员',
    role: 'admin',
    personId: safeString(row.person_id),
    membershipId: '',
    assignmentId: '',
    adminGrantId: safeString(row.admin_grant_id),
    legacyHrId: '',
    legacyAdminId: safeString(row.legacy_admin_id),
    name: safeString(row.person_name),
    studentId: safeString(row.student_id),
    departmentId: '',
    department: '',
    identityId: '',
    identity: row.admin_level === 'super_admin' ? '超级管理员' : '管理员',
    workGroupId: '',
    workGroup: '',
    adminLevel: safeString(row.admin_level),
    isPrimary: false,
    permissions: []
  };
}

async function insertActiveWechatBinding(connection, accountId, openid) {
  try {
    await connection.query(
      `INSERT INTO account_wechat_bindings
         (id, account_id, app_id, openid_hash, hash_version, openid_ciphertext,
          legacy_openid, status, active_account_id, bound_at)
       VALUES (?, ?, ?, ?, 'hmac_sha256_v1', ?, NULL, 'active', ?, NOW())`,
      [generateId(), accountId, APP_ID, hmac(openid), encryptOpenid(openid), accountId]
    );
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      throw new IdentityError('wechat_conflict', '该微信或账号已存在有效绑定，请重新登录或使用账号恢复', 409);
    }
    throw error;
  }
}

async function findAccountByOpenid(openid, connection) {
  const executor = connection || pool;
  const openidHash = hmac(openid);
  const oldHash = legacyHash(openid);
  const [rows] = await executor.query(
    `SELECT a.*, b.id AS binding_id, b.openid_hash, b.hash_version, b.openid_ciphertext,
            b.legacy_openid, p.name, p.student_id
       FROM account_wechat_bindings b
       JOIN accounts a ON a.id = b.account_id
       JOIN persons p ON p.id = a.person_id
      WHERE b.app_id = ? AND b.status = 'active'
        AND (b.openid_hash = ? OR (b.hash_version = 'sha256_legacy' AND b.openid_hash = ?)
             OR b.legacy_openid = ?)
        AND a.status IN ('verified', 'frozen') AND p.status = 'active'
      LIMIT 1`,
    [APP_ID, openidHash, oldHash, safeString(openid)]
  );
  const account = rows[0] || null;
  if (account && (account.hash_version !== 'hmac_sha256_v1' || !account.openid_ciphertext || account.legacy_openid)) {
    await executor.query(
      `UPDATE account_wechat_bindings
          SET openid_hash = ?, hash_version = 'hmac_sha256_v1',
              openid_ciphertext = ?, legacy_openid = NULL, updated_at = NOW()
        WHERE id = ? AND status = 'active'`,
      [openidHash, encryptOpenid(openid), account.binding_id]
    );
    account.openid_hash = openidHash;
    account.hash_version = 'hmac_sha256_v1';
    account.legacy_openid = null;
  }
  return account;
}

async function upgradeLegacyWechatBindings() {
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT id, legacy_openid
         FROM account_wechat_bindings
        WHERE status = 'active'
          AND (hash_version <> 'hmac_sha256_v1'
               OR openid_ciphertext IS NULL
               OR legacy_openid IS NOT NULL)
        FOR UPDATE`
    );
    for (const row of rows) {
      const openid = safeString(row.legacy_openid);
      if (!openid) {
        throw new IdentityError('legacy_binding_invalid', '迁移期微信绑定缺少可转换凭据', 500);
      }
      await connection.query(
        `UPDATE account_wechat_bindings
            SET openid_hash = ?, hash_version = 'hmac_sha256_v1',
                openid_ciphertext = ?, legacy_openid = NULL, updated_at = NOW()
          WHERE id = ? AND status = 'active'`,
        [hmac(openid), encryptOpenid(openid), row.id]
      );
    }
    return { upgraded: rows.length };
  });
}

async function listClaimOrganizations() {
  const [rows] = await pool.query(
    `SELECT id, name
       FROM organizations
      ORDER BY created_at DESC, name ASC`
  );
  return rows.map((row) => ({ id: safeString(row.id), name: safeString(row.name) }));
}

async function syncLegacyHrRecords(connection, hrIds) {
  const ids = Array.from(new Set((hrIds || []).map(safeString).filter(Boolean)));
  if (!ids.length) return { synced: 0 };
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id, name, student_id, department_id, identity_id, work_group_id, org_id
       FROM hr_info
      WHERE id IN (${placeholders})
      FOR UPDATE`,
    ids
  );
  for (const row of rows) {
    const normalizedStudentId = normalizeStudentId(row.student_id);
    const name = normalizeName(row.name);
    if (!normalizedStudentId || !name) {
      throw new IdentityError('invalid_person_identity', '姓名和学号不能为空', 400);
    }
    const [personRows] = await connection.query(
      'SELECT * FROM persons WHERE normalized_student_id = ? LIMIT 1 FOR UPDATE',
      [normalizedStudentId]
    );
    let person = personRows[0];
    if (person && safeString(person.name) !== name) {
      throw new IdentityError('student_id_name_conflict', '请确认姓名和学号后重试', 409);
    }
    if (!person) {
      const personId = generateId();
      await connection.query(
        `INSERT INTO persons
           (id, name, student_id, normalized_student_id, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [personId, name, safeString(row.student_id), normalizedStudentId]
      );
      person = { id: personId };
    } else {
      await connection.query(
        `UPDATE persons
            SET name = ?, student_id = ?, status = 'active', updated_at = NOW()
          WHERE id = ?`,
        [name, safeString(row.student_id), person.id]
      );
    }
    const [membershipRows] = await connection.query(
      'SELECT * FROM organization_memberships WHERE legacy_hr_id = ? LIMIT 1 FOR UPDATE',
      [row.id]
    );
    const membershipId = membershipRows[0] ? membershipRows[0].id : generateId();
    if (membershipRows[0] && membershipRows[0].person_id !== person.id) {
      throw new IdentityError('membership_person_conflict', '请联系管理员核对人员资料', 409);
    }
    await connection.query(
      `INSERT INTO organization_memberships
         (id, person_id, org_id, legacy_hr_id, status)
       VALUES (?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE person_id = VALUES(person_id), org_id = VALUES(org_id),
         status = 'active', updated_at = NOW()`,
      [membershipId, person.id, row.org_id, row.id]
    );
    const [assignmentRows] = await connection.query(
      `SELECT id FROM membership_assignments
        WHERE membership_id = ? AND is_primary = 1
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [membershipId]
    );
    const assignmentId = assignmentRows[0] ? assignmentRows[0].id : generateId();
    await connection.query(
      `INSERT INTO membership_assignments
         (id, membership_id, org_id, assignment_kind, department_id, identity_id,
          work_group_id, is_primary, status, active_primary_membership_id)
       VALUES (?, ?, ?, 'staff', ?, ?, ?, 1, 'active', ?)
       ON DUPLICATE KEY UPDATE org_id = VALUES(org_id), department_id = VALUES(department_id),
         identity_id = VALUES(identity_id), work_group_id = VALUES(work_group_id),
         is_primary = 1, status = 'active',
         active_primary_membership_id = VALUES(active_primary_membership_id), updated_at = NOW()`,
      [
        assignmentId,
        membershipId,
        row.org_id,
        safeString(row.department_id) || null,
        safeString(row.identity_id) || null,
        safeString(row.work_group_id) || null,
        membershipId
      ]
    );
  }
  return { synced: rows.length };
}

async function listMembershipAssignments(legacyHrId, organizationId) {
  const [rows] = await pool.query(
    `SELECT ma.id, ma.membership_id, ma.assignment_kind, ma.title,
            ma.department_id, ma.identity_id, ma.work_group_id, ma.is_primary,
            d.name AS department_name, i.name AS identity_name,
            w.name AS work_group_name
       FROM organization_memberships om
       JOIN membership_assignments ma
         ON ma.membership_id = om.id AND ma.org_id = om.org_id AND ma.status = 'active'
       LEFT JOIN departments d
         ON CONVERT(d.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.department_id
        AND CONVERT(d.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.org_id
       LEFT JOIN identities i
         ON CONVERT(i.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.identity_id
        AND CONVERT(i.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.org_id
       LEFT JOIN work_groups w
         ON CONVERT(w.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.work_group_id
        AND CONVERT(w.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.org_id
      WHERE om.legacy_hr_id = ? AND om.org_id = ? AND om.status = 'active'
      ORDER BY ma.is_primary DESC, ma.created_at ASC`,
    [safeString(legacyHrId), safeString(organizationId)]
  );
  return rows;
}

async function validateAssignmentReferences(connection, organizationId, data) {
  const checks = [
    ['departments', data.departmentId, '部门'],
    ['identities', data.identityId, '身份'],
    ['work_groups', data.workGroupId, '职能组']
  ];
  for (const [table, id, label] of checks) {
    if (!safeString(id)) continue;
    const [rows] = await connection.query(
      `SELECT 1 FROM ${table} WHERE id = ? AND org_id = ? LIMIT 1`,
      [safeString(id), safeString(organizationId)]
    );
    if (!rows.length) throw new IdentityError('assignment_reference_invalid', label + '不属于当前组织', 400);
  }
}

async function saveMembershipAssignment(data, actor) {
  const organizationId = safeString(data.organizationId);
  const legacyHrId = safeString(data.legacyHrId);
  const assignmentId = safeString(data.id);
  const assignmentKind = ['staff', 'liaison', 'other'].includes(data.assignmentKind)
    ? data.assignmentKind
    : 'staff';
  if (!organizationId || !legacyHrId) {
    throw new IdentityError('invalid_params', '缺少成员或组织信息', 400);
  }
  return pool.withTransaction(async (connection) => {
    const [membershipRows] = await connection.query(
      `SELECT * FROM organization_memberships
        WHERE legacy_hr_id = ? AND org_id = ? AND status = 'active'
        LIMIT 1 FOR UPDATE`,
      [legacyHrId, organizationId]
    );
    const membership = membershipRows[0];
    if (!membership) throw new IdentityError('membership_not_found', '请重新选择组织', 404);
    await validateAssignmentReferences(connection, organizationId, data);

    let existing = null;
    if (assignmentId) {
      const [assignmentRows] = await connection.query(
        `SELECT * FROM membership_assignments
          WHERE id = ? AND membership_id = ? AND org_id = ? AND status = 'active'
          LIMIT 1 FOR UPDATE`,
        [assignmentId, membership.id, organizationId]
      );
      existing = assignmentRows[0];
      if (!existing) throw new IdentityError('assignment_not_found', '请重新选择身份', 404);
      if (existing.is_primary && !data.isPrimary) {
        throw new IdentityError('primary_assignment_required', '主要岗位不能直接取消，请将另一岗位设为主要岗位', 409);
      }
    }

    const nextId = existing ? existing.id : generateId();
    if (data.isPrimary) {
      await connection.query(
        `UPDATE membership_assignments
            SET is_primary = 0, active_primary_membership_id = NULL, updated_at = NOW()
          WHERE membership_id = ? AND status = 'active' AND id <> ?`,
        [membership.id, nextId]
      );
    }
    if (existing) {
      await connection.query(
        `UPDATE membership_assignments
            SET assignment_kind = ?, title = ?, department_id = ?, identity_id = ?,
                work_group_id = ?, is_primary = ?, active_primary_membership_id = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [
          assignmentKind,
          safeString(data.title).slice(0, 200) || null,
          safeString(data.departmentId) || null,
          safeString(data.identityId) || null,
          safeString(data.workGroupId) || null,
          data.isPrimary ? 1 : 0,
          data.isPrimary ? membership.id : null,
          nextId
        ]
      );
    } else {
      await connection.query(
        `INSERT INTO membership_assignments
           (id, membership_id, org_id, assignment_kind, title, department_id,
            identity_id, work_group_id, is_primary, status, active_primary_membership_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          nextId,
          membership.id,
          organizationId,
          assignmentKind,
          safeString(data.title).slice(0, 200) || null,
          safeString(data.departmentId) || null,
          safeString(data.identityId) || null,
          safeString(data.workGroupId) || null,
          data.isPrimary ? 1 : 0,
          data.isPrimary ? membership.id : null
        ]
      );
    }
    if (data.isPrimary) {
      await connection.query(
        `UPDATE hr_info
            SET department_id = ?, identity_id = ?, work_group_id = ?, updated_at = NOW()
          WHERE id = ? AND org_id = ?`,
        [
          safeString(data.departmentId),
          safeString(data.identityId),
          safeString(data.workGroupId),
          legacyHrId,
          organizationId
        ]
      );
    }
    await appendAuditEvent({
      connection,
      eventType: existing ? 'membership_assignment_updated' : 'membership_assignment_created',
      actorPersonId: actor && actor.personId,
      targetPersonId: membership.person_id,
      organizationId,
      contextId: actor && actor.contextId,
      detail: { assignmentId: nextId, assignmentKind, isPrimary: Boolean(data.isPrimary) }
    });
    return { id: nextId };
  });
}

async function revokeMembershipAssignment(data, actor) {
  const organizationId = safeString(data.organizationId);
  const assignmentId = safeString(data.id);
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT ma.*, om.person_id
         FROM membership_assignments ma
         JOIN organization_memberships om ON om.id = ma.membership_id
        WHERE ma.id = ? AND ma.org_id = ? AND ma.status = 'active'
        LIMIT 1 FOR UPDATE`,
      [assignmentId, organizationId]
    );
    const assignment = rows[0];
    if (!assignment) throw new IdentityError('assignment_not_found', '请重新选择身份', 404);
    if (assignment.is_primary) {
      throw new IdentityError('primary_assignment_required', '主要岗位不能删除，请先将另一岗位设为主要岗位', 409);
    }
    await connection.query(
      `UPDATE membership_assignments
          SET status = 'revoked', active_primary_membership_id = NULL, updated_at = NOW()
        WHERE id = ?`,
      [assignmentId]
    );
    await connection.query(
      `UPDATE auth_sessions
          SET status = 'revoked', revoked_at = NOW()
        WHERE context_type = 'assignment' AND context_subject_id = ? AND status = 'active'`,
      [assignmentId]
    );
    await appendAuditEvent({
      connection,
      eventType: 'membership_assignment_revoked',
      actorPersonId: actor && actor.personId,
      targetPersonId: assignment.person_id,
      organizationId,
      contextId: actor && actor.contextId,
      detail: { assignmentId }
    });
    return { revoked: true };
  });
}

async function removeLegacyHrRecord(connection, legacyHrId, organizationId) {
  const [rows] = await connection.query(
    `SELECT om.id, om.person_id
       FROM organization_memberships om
      WHERE om.legacy_hr_id = ? AND om.org_id = ?
      LIMIT 1 FOR UPDATE`,
    [safeString(legacyHrId), safeString(organizationId)]
  );
  const membership = rows[0];
  if (!membership) return { removed: false };
  const [accountRows] = await connection.query(
    `SELECT a.id
       FROM accounts a
       JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
      WHERE a.person_id = ? AND a.status = 'verified'
      LIMIT 1 FOR UPDATE`,
    [membership.person_id]
  );
  if (accountRows.length) {
    throw new IdentityError('membership_has_account', '该成员已认证，删除前请先完成账号治理流程', 409);
  }
  await connection.query('DELETE FROM membership_assignments WHERE membership_id = ?', [membership.id]);
  await connection.query('DELETE FROM organization_memberships WHERE id = ?', [membership.id]);
  const [remainingRows] = await connection.query(
    'SELECT 1 FROM organization_memberships WHERE person_id = ? LIMIT 1',
    [membership.person_id]
  );
  if (!remainingRows.length) {
    const [grantRows] = await connection.query(
      "SELECT 1 FROM admin_grants WHERE person_id = ? AND status = 'active' LIMIT 1",
      [membership.person_id]
    );
    if (!grantRows.length) await connection.query('DELETE FROM persons WHERE id = ?', [membership.person_id]);
  }
  return { removed: true };
}

async function syncLegacyAdminGrant(connection, legacyAdminId) {
  const [adminRows] = await connection.query(
    'SELECT * FROM admin_info WHERE id = ? LIMIT 1 FOR UPDATE',
    [safeString(legacyAdminId)]
  );
  const admin = adminRows[0];
  if (!admin) return null;
  const studentId = normalizeStudentId(admin.student_id);
  const name = normalizeName(admin.name);
  const [personRows] = await connection.query(
    `SELECT p.id
       FROM persons p
       JOIN organization_memberships om ON om.person_id = p.id AND om.status = 'active'
      WHERE p.normalized_student_id = ? AND p.name = ?
        AND (? = '' OR om.org_id = ?)
      LIMIT 1 FOR UPDATE`,
    [studentId, name, safeString(admin.org_id), safeString(admin.org_id)]
  );
  if (!personRows.length) {
    throw new IdentityError(
      'admin_person_missing',
      '请先在人事信息中建立姓名和学号完全一致的成员，再授予管理员身份',
      409
    );
  }
  const personId = personRows[0].id;
  const [grantRows] = await connection.query(
    'SELECT id, person_id FROM admin_grants WHERE legacy_admin_id = ? LIMIT 1 FOR UPDATE',
    [admin.id]
  );
  if (grantRows[0] && grantRows[0].person_id !== personId) {
    throw new IdentityError('admin_grant_conflict', '请联系管理员核对人员资料', 409);
  }
  await connection.query(
    `INSERT INTO admin_grants
       (id, person_id, org_id, admin_level, status, legacy_admin_id)
     VALUES (?, ?, ?, ?, 'active', ?)
     ON DUPLICATE KEY UPDATE person_id = VALUES(person_id), org_id = VALUES(org_id),
       admin_level = VALUES(admin_level), status = 'active', updated_at = NOW()`,
    [grantRows[0] ? grantRows[0].id : generateId(), personId, admin.org_id, admin.admin_level, admin.id]
  );
  const [bindingRows] = await connection.query(
    `SELECT b.openid_ciphertext, b.legacy_openid
       FROM accounts a
       JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
      WHERE a.person_id = ? AND a.status = 'verified'
      ORDER BY b.bound_at DESC LIMIT 1 FOR UPDATE`,
    [personId]
  );
  if (bindingRows.length) {
    const openid = bindingRows[0].openid_ciphertext
      ? decryptOpenid(bindingRows[0].openid_ciphertext)
      : safeString(bindingRows[0].legacy_openid);
    await connection.query(
      `UPDATE admin_info
          SET openid = ?, bind_status = 'active', bound_at = COALESCE(bound_at, NOW()),
              invite_code = NULL, invite_expires_at = NULL, updated_at = NOW()
        WHERE id = ?`,
      [openid, admin.id]
    );
  }
  return { personId };
}

async function listLegacyAdminAuthenticationStates(legacyAdminIds, connection) {
  const ids = Array.from(new Set(
    (Array.isArray(legacyAdminIds) ? legacyAdminIds : []).map(safeString).filter(Boolean)
  ));
  if (!ids.length) return {};
  const executor = connection || pool;
  const [rows] = await executor.query(
    `SELECT ag.legacy_admin_id, a.status AS account_status,
            EXISTS (
              SELECT 1 FROM account_wechat_bindings b
               WHERE b.account_id = a.id AND b.status = 'active'
            ) AS has_active_binding
       FROM admin_grants ag
       LEFT JOIN accounts a ON a.person_id = ag.person_id
      WHERE ag.legacy_admin_id IN (?) AND ag.status = 'active'`,
    [ids]
  );
  return rows.reduce((result, row) => {
    const accountStatus = safeString(row.account_status);
    let status = 'pending_verification';
    if (accountStatus === 'frozen') status = 'frozen';
    else if (accountStatus === 'recovery_required') status = 'recovery_required';
    else if (accountStatus === 'verified' && Boolean(row.has_active_binding)) status = 'verified';
    result[safeString(row.legacy_admin_id)] = status;
    return result;
  }, {});
}

async function revokeLegacyAdminGrant(connection, legacyAdminId) {
  const [rows] = await connection.query(
    `SELECT ag.*, a.id AS account_id,
            EXISTS (
              SELECT 1 FROM account_wechat_bindings b
               WHERE b.account_id = a.id AND b.status = 'active'
            ) AS has_binding
       FROM admin_grants ag
       LEFT JOIN accounts a ON a.person_id = ag.person_id
      WHERE ag.legacy_admin_id = ?
      LIMIT 1 FOR UPDATE`,
    [safeString(legacyAdminId)]
  );
  const grant = rows[0];
  if (!grant) return { revoked: false };
  if (grant.admin_level === 'super_admin' && grant.has_binding) {
    const [boundRows] = await connection.query(
      `SELECT DISTINCT other.person_id
         FROM admin_grants other
         JOIN accounts a ON a.person_id = other.person_id AND a.status = 'verified'
         JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
        WHERE other.admin_level = 'super_admin' AND other.status = 'active'
        FOR UPDATE`
    );
    if (boundRows.length <= 1) {
      throw new IdentityError('last_bound_super_admin', '请先绑定另一名超级管理员', 409);
    }
  }
  await connection.query(
    "UPDATE admin_grants SET status = 'revoked', updated_at = NOW() WHERE id = ?",
    [grant.id]
  );
  if (grant.account_id) {
    await connection.query(
      `UPDATE accounts SET token_version = token_version + 1, updated_at = NOW()
        WHERE id = ?`,
      [grant.account_id]
    );
    await connection.query(
      `UPDATE auth_sessions SET status = 'revoked', revoked_at = NOW()
        WHERE account_id = ? AND context_type = 'admin' AND status = 'active'`,
      [grant.account_id]
    );
  }
  return { revoked: true };
}

async function createBootstrapSession(openid) {
  const id = generateId();
  const openidHash = hmac(openid);
  await pool.query(
    `INSERT INTO auth_bootstrap_sessions
       (id, openid_hash, openid_ciphertext, status, expires_at)
     VALUES (?, ?, ?, 'active', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [id, openidHash, encryptOpenid(openid), BOOTSTRAP_MINUTES]
  );
  return { id, openidHash, expiresInSeconds: BOOTSTRAP_MINUTES * 60 };
}

async function getBootstrapSession(id, lock, connection) {
  const executor = connection || pool;
  const [rows] = await executor.query(
    `SELECT *
       FROM auth_bootstrap_sessions
      WHERE id = ? AND status = 'active' AND expires_at > NOW()
        AND (locked_until IS NULL OR locked_until <= NOW())
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [safeString(id)]
  );
  return rows[0] || null;
}

async function listContexts(accountId, connection) {
  const executor = connection || pool;
  const [assignmentRows] = await executor.query(
    `SELECT ma.id AS assignment_id, ma.title AS assignment_title, ma.assignment_kind,
            ma.department_id, ma.identity_id, ma.work_group_id, ma.is_primary,
            om.id AS membership_id, om.org_id AS organization_id, om.legacy_hr_id,
            p.id AS person_id, p.name AS person_name, p.student_id,
            o.name AS organization_name, d.name AS department_name,
            i.name AS identity_name, w.name AS work_group_name
       FROM accounts a
       JOIN persons p ON p.id = a.person_id AND p.status = 'active'
       JOIN organization_memberships om ON om.person_id = p.id AND om.status = 'active'
       JOIN membership_assignments ma ON ma.membership_id = om.id
         AND ma.org_id = om.org_id AND ma.status = 'active'
       JOIN organizations o
         ON CONVERT(o.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = om.org_id
       LEFT JOIN departments d
         ON CONVERT(d.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.department_id
        AND CONVERT(d.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = om.org_id
       LEFT JOIN identities i
         ON CONVERT(i.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.identity_id
        AND CONVERT(i.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = om.org_id
       LEFT JOIN work_groups w
         ON CONVERT(w.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ma.work_group_id
        AND CONVERT(w.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = om.org_id
      WHERE a.id = ? AND a.status = 'verified'
      ORDER BY ma.is_primary DESC, o.created_at DESC, ma.created_at ASC`,
    [safeString(accountId)]
  );
  const [adminRows] = await executor.query(
    `SELECT ag.id AS admin_grant_id, ag.org_id AS grant_org_id, ag.admin_level,
            ag.legacy_admin_id, p.id AS person_id, p.name AS person_name, p.student_id,
            o.id AS organization_id, o.name AS organization_name
       FROM accounts a
       JOIN persons p ON p.id = a.person_id AND p.status = 'active'
       JOIN admin_grants ag ON ag.person_id = p.id AND ag.status = 'active'
       JOIN organizations o ON (ag.admin_level = 'super_admin' AND ag.org_id = '')
                              OR CONVERT(o.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = ag.org_id
      WHERE a.id = ? AND a.status = 'verified'
      ORDER BY ag.admin_level = 'super_admin' DESC, o.created_at DESC`,
    [safeString(accountId)]
  );
  const contexts = assignmentRows.map(mapAssignmentContext).concat(adminRows.map(mapAdminContext));
  const seen = new Set();
  return contexts.filter((item) => {
    if (!item.contextId || seen.has(item.contextId)) return false;
    seen.add(item.contextId);
    return true;
  });
}

function contextRank(context) {
  if (context.identityType === 'assignment' && context.isPrimary) return 0;
  if (context.identityType === 'assignment') return 1;
  if (context.adminLevel !== 'super_admin') return 2;
  return 3;
}

function chooseFallbackContext(contexts, preferredOrganizationId) {
  const orgId = safeString(preferredOrganizationId);
  const scoped = orgId
    ? contexts.filter((item) => item.organizationId === orgId)
    : [];
  const candidates = scoped.length ? scoped : contexts;
  return candidates.slice().sort((left, right) => contextRank(left) - contextRank(right))[0] || null;
}

async function resolveContextSelection(accountId, requestedSelection, connection) {
  const contexts = await listContexts(accountId, connection);
  if (!contexts.length) return { context: null, fallback: false, reason: 'no_context' };
  const selection = requestedSelection && typeof requestedSelection === 'object'
    ? requestedSelection
    : { contextId: requestedSelection };
  const requestedContextId = safeString(selection.contextId);
  const requestedOrganizationId = safeString(selection.organizationId);
  const requestedIdentityId = safeString(selection.identityId);
  const hasPreference = Boolean(requestedContextId || requestedOrganizationId || requestedIdentityId);
  let matched = null;
  if (requestedContextId) {
    matched = contexts.find((item) => item.contextId === requestedContextId) || null;
  }
  if (!matched && requestedOrganizationId && requestedIdentityId) {
    matched = contexts.find((item) => (
      item.organizationId === requestedOrganizationId
      && item.authIdentityId === requestedIdentityId
    )) || null;
  }
  if (matched) return { context: matched, fallback: false, reason: '' };
  const fallback = chooseFallbackContext(contexts, requestedOrganizationId);
  return {
    context: fallback,
    fallback: hasPreference,
    reason: hasPreference ? 'selection_unavailable' : ''
  };
}

async function resolveContext(accountId, requestedSelection, connection) {
  const resolved = await resolveContextSelection(accountId, requestedSelection, connection);
  return resolved.context;
}

async function createSession(account, requestedSelection, metadata) {
  return pool.withTransaction(async (connection) => {
    const [accountRows] = await connection.query(
      `SELECT a.id, a.person_id, a.status, a.token_version, b.openid_hash
         FROM accounts a
         JOIN account_wechat_bindings b ON b.account_id = a.id
           AND b.app_id = ? AND b.status = 'active'
        WHERE a.id = ? AND a.status = 'verified'
        LIMIT 1 FOR UPDATE`,
      [APP_ID, safeString(account.id)]
    );
    const activeAccount = accountRows[0];
    if (!activeAccount) throw new IdentityError('account_unavailable', '账号状态已变化，请重新登录', 401);
    await syncLegacyBindings(
      connection,
      activeAccount.id,
      decryptBindingOpenid.bind(null, connection, activeAccount.id)
    );
    const resolvedSelection = await resolveContextSelection(
      activeAccount.id,
      requestedSelection,
      connection
    );
    const activeContext = resolvedSelection.context;
    if (!activeContext) throw new IdentityError('no_context', '当前账号暂无可用身份', 403);
    const id = generateId();
    await connection.query(
      `INSERT INTO auth_sessions
         (id, account_id, openid_hash, context_id, context_type, context_subject_id,
          organization_id, role, token_version, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [
        id,
        activeAccount.id,
        activeAccount.openid_hash,
        activeContext.contextId,
        activeContext.identityType,
        activeContext.assignmentId || activeContext.adminGrantId,
        activeContext.organizationId,
        activeContext.role,
        Number(activeAccount.token_version || 1),
        SESSION_MINUTES
      ]
    );
    await appendAuditEvent({
      connection,
      eventType: 'wechat_session_created',
      actorPersonId: activeAccount.person_id,
      targetPersonId: activeAccount.person_id,
      accountId: activeAccount.id,
      organizationId: activeContext.organizationId,
      contextId: activeContext.contextId,
      requestId: metadata && metadata.requestId,
      ip: metadata && metadata.ip,
      detail: { role: activeContext.role }
    });
    return {
      id,
      context: activeContext,
      tokenVersion: Number(activeAccount.token_version || 1),
      expiresInSeconds: SESSION_MINUTES * 60,
      selectionFallback: resolvedSelection.fallback,
      selectionFallbackReason: resolvedSelection.reason
    };
  });
}

async function loadSession(id) {
  const [rows] = await pool.query(
    `SELECT s.*, a.person_id, a.status AS account_status, a.token_version AS account_token_version,
            p.name, p.student_id, b.openid_ciphertext, b.legacy_openid
       FROM auth_sessions s
       JOIN accounts a ON a.id = s.account_id
       JOIN persons p ON p.id = a.person_id
       JOIN account_wechat_bindings b ON b.account_id = a.id
         AND b.app_id = ? AND b.status = 'active'
      WHERE s.id = ? AND s.status = 'active' AND s.expires_at > NOW()
        AND a.status = 'verified' AND p.status = 'active'
      LIMIT 1`,
    [APP_ID, safeString(id)]
  );
  const session = rows[0] || null;
  if (!session || Number(session.token_version) !== Number(session.account_token_version)) return null;
  const activeContext = await resolveContext(session.account_id, session.context_id);
  if (!activeContext || activeContext.contextId !== session.context_id) return null;
  await pool.query(
    'UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = ? AND last_seen_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)',
    [session.id]
  );
  const openid = session.openid_ciphertext
    ? decryptOpenid(session.openid_ciphertext)
    : safeString(session.legacy_openid);
  if (!openid) return null;
  return { session, context: activeContext, openid };
}

async function activateSelection(sessionId, accountId, requestedSelection) {
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT * FROM auth_sessions
        WHERE id = ? AND account_id = ? AND status = 'active' AND expires_at > NOW()
        LIMIT 1 FOR UPDATE`,
      [safeString(sessionId), safeString(accountId)]
    );
    const session = rows[0];
    if (!session) throw new IdentityError('session_expired', '登录已过期，请重新登录', 401);
    const contexts = await listContexts(accountId, connection);
    const selection = requestedSelection && typeof requestedSelection === 'object'
      ? requestedSelection
      : { contextId: requestedSelection };
    const requestedContextId = safeString(selection.contextId);
    const requestedOrganizationId = safeString(selection.organizationId);
    const requestedIdentityId = safeString(selection.identityId);
    const activeContext = requestedContextId
      ? contexts.find((item) => item.contextId === requestedContextId)
      : contexts.find((item) => (
        item.organizationId === requestedOrganizationId
        && item.authIdentityId === requestedIdentityId
      ));
    if (!activeContext) {
      throw new IdentityError('context_forbidden', '该身份已失效，请刷新后重试', 403);
    }
    await syncLegacyBindings(connection, accountId, decryptBindingOpenid.bind(null, connection, accountId));
    await connection.query(
      `UPDATE auth_sessions
          SET context_id = ?, context_type = ?, context_subject_id = ?,
              organization_id = ?, role = ?, last_seen_at = NOW()
        WHERE id = ?`,
      [
        activeContext.contextId,
        activeContext.identityType,
        activeContext.assignmentId || activeContext.adminGrantId,
        activeContext.organizationId,
        activeContext.role,
        sessionId
      ]
    );
    return activeContext;
  });
}

async function activateContext(sessionId, accountId, requestedContextId) {
  return activateSelection(sessionId, accountId, { contextId: requestedContextId });
}

async function decryptBindingOpenid(connection, accountId) {
  const [rows] = await connection.query(
    `SELECT openid_ciphertext, legacy_openid
       FROM account_wechat_bindings
      WHERE account_id = ? AND app_id = ? AND status = 'active'
      LIMIT 1 FOR UPDATE`,
    [accountId, APP_ID]
  );
  if (!rows.length) throw new IdentityError('binding_missing', '微信绑定已失效', 401);
  return rows[0].openid_ciphertext
    ? decryptOpenid(rows[0].openid_ciphertext)
    : safeString(rows[0].legacy_openid);
}

async function syncLegacyBindings(connection, accountId, openidOrLoader) {
  const openid = typeof openidOrLoader === 'function'
    ? await openidOrLoader()
    : safeString(openidOrLoader);
  if (!openid) throw new IdentityError('binding_missing', '微信绑定已失效', 401);
  const [membershipRows] = await connection.query(
    `SELECT om.id, om.org_id, om.legacy_hr_id
       FROM accounts a
       JOIN organization_memberships om ON om.person_id = a.person_id AND om.status = 'active'
      WHERE a.id = ?`,
    [accountId]
  );
  for (const membership of membershipRows) {
    const [existingRows] = await connection.query(
      'SELECT id, hr_id FROM user_info WHERE openid = ? AND org_id = ? LIMIT 1 FOR UPDATE',
      [openid, membership.org_id]
    );
    if (existingRows.length && safeString(existingRows[0].hr_id) !== safeString(membership.legacy_hr_id)) {
      throw new IdentityError('wechat_conflict', '该微信已绑定其他人员，请联系管理员处理', 409);
    }
    await connection.query(
      `INSERT INTO user_info (id, openid, hr_id, org_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE hr_id = VALUES(hr_id), updated_at = NOW()`,
      [existingRows[0] ? existingRows[0].id : generateId(), openid, membership.legacy_hr_id, membership.org_id]
    );
  }
  await connection.query(
    `UPDATE admin_info ai
       JOIN admin_grants ag
         ON ag.legacy_admin_id =
            CONVERT(ai.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
       JOIN accounts a ON a.person_id = ag.person_id
        SET ai.openid = ?, ai.bind_status = 'active', ai.bound_at = COALESCE(ai.bound_at, NOW()),
            ai.invite_code = NULL, ai.invite_expires_at = NULL, ai.updated_at = NOW()
      WHERE a.id = ? AND ag.status = 'active'`,
    [openid, accountId]
  );
  return openid;
}

async function createClaim(bootstrapId, data) {
  const publicClaimId = generateId();
  const studentId = normalizeStudentId(data.studentId);
  const name = normalizeName(data.name);
  const orgId = safeString(data.organizationId);
  if (!studentId || !name || !orgId) return { claimId: publicClaimId, accepted: true };
  return pool.withTransaction(async (connection) => {
    const bootstrap = await getBootstrapSession(bootstrapId, true, connection);
    if (!bootstrap) throw new IdentityError('bootstrap_expired', '微信验证已过期，请重新登录', 401);
    const [personRows] = await connection.query(
      `SELECT p.id
         FROM persons p
         JOIN organization_memberships om ON om.person_id = p.id
        WHERE p.normalized_student_id = ? AND p.name = ? AND p.status = 'active'
          AND om.org_id = ? AND om.status = 'active'
        LIMIT 1 FOR UPDATE`,
      [studentId, name, orgId]
    );
    if (!personRows.length) return { claimId: publicClaimId, accepted: true };
    const personId = personRows[0].id;
    const [boundRows] = await connection.query(
      `SELECT 1
         FROM accounts a
         JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
        WHERE a.person_id = ?
        LIMIT 1`,
      [personId]
    );
    if (boundRows.length) return { claimId: publicClaimId, accepted: true };
    await connection.query(
      `UPDATE identity_claim_requests
          SET status = 'superseded', updated_at = NOW()
        WHERE person_id = ? AND status = 'pending'`,
      [personId]
    );
    await connection.query(
      `INSERT INTO identity_claim_requests
         (id, person_id, requested_org_id, openid_hash, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [publicClaimId, personId, orgId, bootstrap.openid_hash, CLAIM_HOURS]
    );
    await appendAuditEvent({
      connection,
      eventType: 'identity_claim_started',
      targetPersonId: personId,
      organizationId: orgId,
      requestId: data.requestId,
      ip: data.ip
    });
    return { claimId: publicClaimId, accepted: true };
  });
}

async function listClaims(organizationId, options) {
  const orgId = safeString(organizationId);
  const limit = Math.min(Math.max(Number(options && options.limit) || 50, 1), 100);
  const params = [];
  let scopeSql = '';
  if (orgId) {
    scopeSql = "AND EXISTS (SELECT 1 FROM organization_memberships scope_m WHERE scope_m.person_id = r.person_id AND scope_m.org_id = ? AND scope_m.status = 'active')";
    params.push(orgId);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT r.id, r.requested_org_id, r.status, r.created_at, r.expires_at,
            p.id AS person_id, p.name, p.student_id, o.name AS requested_org_name,
            EXISTS (
              SELECT 1 FROM identity_verification_tokens t
               WHERE t.claim_request_id = r.id AND t.status = 'active' AND t.expires_at > NOW()
            ) AS has_active_code
       FROM identity_claim_requests r
       JOIN persons p ON p.id = r.person_id
       JOIN organizations o
         ON CONVERT(o.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = r.requested_org_id
      WHERE r.status = 'pending' AND r.expires_at > NOW()
        ${scopeSql}
      ORDER BY r.created_at ASC
      LIMIT ?`,
    params
  );
  return rows.map((row) => ({
    id: safeString(row.id),
    personId: safeString(row.person_id),
    name: safeString(row.name),
    studentId: safeString(row.student_id),
    requestedOrganizationId: safeString(row.requested_org_id),
    requestedOrganizationName: safeString(row.requested_org_name),
    hasActiveCode: Boolean(row.has_active_code),
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }));
}

async function issueVerificationCodeWithConnection(connection, claimId, actor, metadata) {
  const [rows] = await connection.query(
    `SELECT r.*, EXISTS (
        SELECT 1 FROM organization_memberships om
         WHERE om.person_id = r.person_id AND om.org_id = ? AND om.status = 'active'
      ) AS actor_org_matches
       FROM identity_claim_requests r
      WHERE r.id = ? AND r.status = 'pending' AND r.expires_at > NOW()
      LIMIT 1 FOR UPDATE`,
    [safeString(actor.organizationId), safeString(claimId)]
  );
  const claim = rows[0];
  if (!claim) throw new IdentityError('claim_unavailable', '请刷新身份认证列表', 409);
  if (actor.adminLevel !== 'super_admin' && !Boolean(claim.actor_org_matches)) {
    throw new IdentityError('claim_forbidden', '请联系所属组织管理员', 403);
  }
  const code = randomCode(12);
  await connection.query(
    `UPDATE identity_verification_tokens
        SET status = 'superseded'
      WHERE claim_request_id = ? AND status = 'active'`,
    [claim.id]
  );
  await connection.query(
    `INSERT INTO identity_verification_tokens
       (id, claim_request_id, person_id, issued_by_person_id, issued_by_context_id,
        token_hash, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [
      generateId(),
      claim.id,
      claim.person_id,
      actor.personId,
      actor.contextId,
      hmac('identity-code:' + claim.id + ':' + code),
      VERIFY_TOKEN_HOURS
    ]
  );
  await appendAuditEvent({
    connection,
    eventType: 'identity_code_issued',
    actorPersonId: actor.personId,
    targetPersonId: claim.person_id,
    organizationId: actor.organizationId,
    contextId: actor.contextId,
    requestId: metadata && metadata.requestId,
    ip: metadata && metadata.ip
  });
  return { claimId: safeString(claim.id), code, expiresInHours: VERIFY_TOKEN_HOURS };
}

async function issueVerificationCode(claimId, actor, metadata) {
  return pool.withTransaction((connection) => (
    issueVerificationCodeWithConnection(connection, claimId, actor, metadata)
  ));
}

async function issueVerificationCodes(claimIds, actor, metadata) {
  const normalizedIds = Array.from(new Set(
    (Array.isArray(claimIds) ? claimIds : []).map(safeString).filter(Boolean)
  )).slice(0, 50);
  if (!normalizedIds.length) {
    throw new IdentityError('invalid_params', '请选择身份认证申请', 400);
  }
  return pool.withTransaction(async (connection) => {
    const issued = [];
    for (const claimId of normalizedIds) {
      issued.push(await issueVerificationCodeWithConnection(
        connection,
        claimId,
        actor,
        metadata
      ));
    }
    return issued;
  });
}

async function verifyClaim(bootstrapId, claimId, code, metadata) {
  const result = await pool.withTransaction(async (connection) => {
    const bootstrap = await getBootstrapSession(bootstrapId, true, connection);
    if (!bootstrap) throw new IdentityError('bootstrap_expired', '微信验证已过期，请重新登录', 401);
    const policy = await getPolicy(connection);
    const now = Date.now();
    if (!policy
      || !policy.initial_claim_enabled
      || (policy.claim_starts_at && new Date(policy.claim_starts_at).getTime() > now)
      || (policy.claim_ends_at && new Date(policy.claim_ends_at).getTime() < now)) {
      throw new IdentityError('claim_paused', '当前认证活动未开放，请联系管理员', 403);
    }
    const [claimRows] = await connection.query(
      `SELECT *
         FROM identity_claim_requests
        WHERE id = ? AND status = 'pending' AND expires_at > NOW()
          AND (locked_until IS NULL OR locked_until <= NOW())
        LIMIT 1 FOR UPDATE`,
      [safeString(claimId)]
    );
    const claim = claimRows[0];
    if (!claim || claim.openid_hash !== bootstrap.openid_hash) {
      await connection.query(
        `UPDATE auth_bootstrap_sessions
            SET failed_attempts = failed_attempts + 1,
                locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), locked_until)
          WHERE id = ?`,
        [MAX_VERIFY_ATTEMPTS, bootstrap.id]
      );
      return { authenticationFailure: 'verification_failed' };
    }
    const [tokenRows] = await connection.query(
      `SELECT *
         FROM identity_verification_tokens
        WHERE claim_request_id = ? AND status = 'active' AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [claim.id]
    );
    const verification = tokenRows[0];
    const matches = verification
      && verification.person_id === claim.person_id
      && secureEqualHex(
        verification.token_hash,
        hmac('identity-code:' + claim.id + ':' + safeString(code).toUpperCase())
      );
    if (!matches) {
      const attempts = Number(claim.failed_attempts || 0) + 1;
      await connection.query(
        `UPDATE identity_claim_requests
            SET failed_attempts = ?,
                locked_until = IF(? >= ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), locked_until),
                updated_at = NOW()
          WHERE id = ?`,
        [attempts, attempts, MAX_VERIFY_ATTEMPTS, claim.id]
      );
      await connection.query(
        `UPDATE auth_bootstrap_sessions
            SET failed_attempts = failed_attempts + 1,
                locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), locked_until)
          WHERE id = ?`,
        [MAX_VERIFY_ATTEMPTS, bootstrap.id]
      );
      return { authenticationFailure: 'verification_failed' };
    }
    const [accountRows] = await connection.query(
      'SELECT * FROM accounts WHERE person_id = ? LIMIT 1 FOR UPDATE',
      [claim.person_id]
    );
    let account = accountRows[0];
    if (account && account.status === 'frozen') {
      throw new IdentityError('account_frozen', '账号已冻结，请联系管理员', 403);
    }
    if (account && account.status === 'verified') {
      throw new IdentityError('recovery_required', '该账号已认证，请使用账号恢复', 409);
    }
    const accountId = account ? account.id : generateId();
    if (!account) {
      await connection.query(
        `INSERT INTO accounts (id, person_id, status, token_version, verified_at)
         VALUES (?, ?, 'verified', 1, NOW())`,
        [accountId, claim.person_id]
      );
    } else {
      await connection.query(
        `UPDATE accounts
            SET status = 'verified', token_version = token_version + 1,
                verified_at = NOW(), recovery_required_at = NULL
          WHERE id = ?`,
        [accountId]
      );
    }
    const openid = decryptOpenid(bootstrap.openid_ciphertext);
    await insertActiveWechatBinding(connection, accountId, openid);
    await syncLegacyBindings(connection, accountId, openid);
    await connection.query(
      `UPDATE identity_verification_tokens
          SET status = 'consumed', consumed_at = NOW()
        WHERE id = ?`,
      [verification.id]
    );
    await connection.query(
      `UPDATE identity_claim_requests
          SET status = 'verified', verified_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [claim.id]
    );
    await connection.query(
      `UPDATE auth_bootstrap_sessions
          SET status = 'consumed', consumed_at = NOW()
        WHERE id = ?`,
      [bootstrap.id]
    );
    await appendAuditEvent({
      connection,
      eventType: 'identity_claim_verified',
      targetPersonId: claim.person_id,
      accountId,
      organizationId: claim.requested_org_id,
      requestId: metadata && metadata.requestId,
      ip: metadata && metadata.ip
    });
    const [freshRows] = await connection.query(
      `SELECT a.*, b.openid_hash, p.name, p.student_id
         FROM accounts a
         JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
         JOIN persons p ON p.id = a.person_id
        WHERE a.id = ?`,
      [accountId]
    );
    return freshRows[0];
  });
  if (result && result.authenticationFailure) {
    throw new IdentityError('verification_failed', '请检查认证信息或重新获取认证码', 400);
  }
  return result;
}

async function getPolicy(connection) {
  const executor = connection || pool;
  const [rows] = await executor.query('SELECT * FROM auth_policy WHERE id = ? LIMIT 1', ['default']);
  return rows[0] || null;
}

async function savePolicy(data, actor) {
  const minimum = Math.min(Math.max(Number(data.passphraseMinLength) || 12, 12), 64);
  const claimStartsAt = normalizePolicyDate(data.claimStartsAt, '认证开始时间');
  const claimEndsAt = normalizePolicyDate(data.claimEndsAt, '认证截止时间');
  if (claimStartsAt && claimEndsAt && policyTimestamp(claimStartsAt) >= policyTimestamp(claimEndsAt)) {
    throw new IdentityError('invalid_policy_time', '请将截止时间设在开始时间之后', 400);
  }
  return pool.withTransaction(async (connection) => {
    const [policyRows] = await connection.query(
      "SELECT * FROM auth_policy WHERE id = 'default' LIMIT 1 FOR UPDATE"
    );
    const previous = policyRows[0] || {};
    const scheduleChanged = Boolean(previous.initial_claim_enabled) !== Boolean(data.initialClaimEnabled)
      || policyTimestamp(previous.claim_starts_at) !== policyTimestamp(claimStartsAt)
      || policyTimestamp(previous.claim_ends_at) !== policyTimestamp(claimEndsAt);
    await connection.query(
      `UPDATE auth_policy
          SET initial_claim_enabled = ?, claim_starts_at = ?, claim_ends_at = ?,
              allow_recovery_code = ?, allow_passphrase = ?, passphrase_min_length = ?,
              updated_by_person_id = ?, updated_at = NOW()
        WHERE id = 'default'`,
      [
        data.initialClaimEnabled ? 1 : 0,
        claimStartsAt,
        claimEndsAt,
        data.allowRecoveryCode ? 1 : 0,
        data.allowPassphrase ? 1 : 0,
        minimum,
        actor.personId
      ]
    );
    if (scheduleChanged) {
      await connection.query(
        `UPDATE identity_verification_tokens t
         JOIN identity_claim_requests r ON r.id = t.claim_request_id
            SET t.status = 'revoked', r.status = 'paused', r.updated_at = NOW()
          WHERE t.status = 'active' AND r.status = 'pending'`
      );
    }
    await appendAuditEvent({
      connection,
      eventType: 'auth_policy_updated',
      actorPersonId: actor.personId,
      organizationId: actor.organizationId,
      contextId: actor.contextId,
      detail: {
        initialClaimEnabled: Boolean(data.initialClaimEnabled),
        scheduleChanged,
        allowRecoveryCode: Boolean(data.allowRecoveryCode),
        allowPassphrase: Boolean(data.allowPassphrase)
      }
    });
    return getPolicy(connection);
  });
}

async function configureRecoveryCredential(accountId, method, value) {
  const policy = await getPolicy();
  if (!policy) throw new IdentityError('policy_unavailable', '请稍后刷新认证设置', 503);
  if (method === 'recovery_code' && !policy.allow_recovery_code) {
    throw new IdentityError('method_disabled', '恢复码功能未开启', 403);
  }
  if (method === 'passphrase' && !policy.allow_passphrase) {
    throw new IdentityError('method_disabled', '恢复口令功能未开启', 403);
  }
  let plaintext = safeString(value);
  if (method === 'recovery_code') plaintext = randomCode(20);
  if (method === 'passphrase' && plaintext.length < Number(policy.passphrase_min_length || 12)) {
    throw new IdentityError('weak_passphrase', '恢复口令长度不足', 400);
  }
  if (method === 'passphrase' && /^(123456|password|qwerty|111111|abcdef)/i.test(plaintext)) {
    throw new IdentityError('weak_passphrase', '恢复口令过于简单', 400);
  }
  const credential = hashPassphrase(plaintext);
  await pool.query(
    `INSERT INTO account_recovery_credentials
       (id, account_id, method, credential_hash, salt, status)
     VALUES (?, ?, ?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE credential_hash = VALUES(credential_hash), salt = VALUES(salt),
       status = 'active', failed_attempts = 0, locked_until = NULL, expires_at = NULL,
       used_at = NULL, updated_at = NOW()`,
    [generateId(), accountId, method, credential.hash, credential.salt]
  );
  return method === 'recovery_code' ? { recoveryCode: plaintext } : { configured: true };
}

async function startRecovery(bootstrapId, data, metadata) {
  const publicRequestId = generateId();
  const studentId = normalizeStudentId(data.studentId);
  const name = normalizeName(data.name);
  const orgId = safeString(data.organizationId);
  if (!studentId || !name || !orgId) return { recoveryRequestId: publicRequestId, accepted: true };
  return pool.withTransaction(async (connection) => {
    const bootstrap = await getBootstrapSession(bootstrapId, true, connection);
    if (!bootstrap) throw new IdentityError('bootstrap_expired', '微信验证已过期，请重新登录', 401);
    const [rows] = await connection.query(
      `SELECT p.id AS person_id, a.id AS account_id, a.status AS account_status
         FROM persons p
         JOIN accounts a ON a.person_id = p.id
         JOIN organization_memberships om ON om.person_id = p.id
        WHERE p.normalized_student_id = ? AND p.name = ? AND p.status = 'active'
          AND om.org_id = ? AND om.status = 'active'
        LIMIT 1 FOR UPDATE`,
      [studentId, name, orgId]
    );
    if (!rows.length) return { recoveryRequestId: publicRequestId, accepted: true };
    if (rows[0].account_status === 'frozen') {
      return { recoveryRequestId: publicRequestId, accepted: true };
    }
    await connection.query(
      `UPDATE account_recovery_requests
          SET status = 'superseded', updated_at = NOW()
        WHERE account_id = ? AND status = 'pending'`,
      [rows[0].account_id]
    );
    await connection.query(
      `INSERT INTO account_recovery_requests
         (id, person_id, account_id, requested_org_id, new_openid_hash, status, expires_at)
       VALUES (?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [publicRequestId, rows[0].person_id, rows[0].account_id, orgId, bootstrap.openid_hash, RECOVERY_HOURS]
    );
    await appendAuditEvent({
      connection,
      eventType: 'account_recovery_started',
      targetPersonId: rows[0].person_id,
      accountId: rows[0].account_id,
      organizationId: orgId,
      requestId: metadata && metadata.requestId,
      ip: metadata && metadata.ip
    });
    return { recoveryRequestId: publicRequestId, accepted: true };
  });
}

async function completeRecoveryWithCredential(bootstrapId, recoveryRequestId, method, credentialValue, metadata) {
  const result = await pool.withTransaction(async (connection) => {
    const bootstrap = await getBootstrapSession(bootstrapId, true, connection);
    if (!bootstrap) throw new IdentityError('bootstrap_expired', '微信验证已过期，请重新登录', 401);
    const [requestRows] = await connection.query(
      `SELECT *
         FROM account_recovery_requests
        WHERE id = ? AND status = 'pending' AND expires_at > NOW()
          AND new_openid_hash = ?
        LIMIT 1 FOR UPDATE`,
      [safeString(recoveryRequestId), bootstrap.openid_hash]
    );
    const request = requestRows[0];
    if (!request) throw new IdentityError('recovery_failed', '请重新提交账号恢复申请', 400);
    const policy = await getPolicy(connection);
    const allowed = method === 'recovery_code'
      ? Boolean(policy && policy.allow_recovery_code)
      : Boolean(policy && policy.allow_passphrase);
    if (!allowed) throw new IdentityError('method_disabled', '该恢复方式未开启', 403);
    const [credentialRows] = await connection.query(
      `SELECT *
         FROM account_recovery_credentials
        WHERE account_id = ? AND method = ? AND status = 'active'
          AND (locked_until IS NULL OR locked_until <= NOW())
        LIMIT 1 FOR UPDATE`,
      [request.account_id, method]
    );
    const credential = credentialRows[0];
    if (!credential || !verifyPassphrase(credentialValue, credential.salt, credential.credential_hash)) {
      if (credential) {
        const attempts = Number(credential.failed_attempts || 0) + 1;
        await connection.query(
          `UPDATE account_recovery_credentials
              SET failed_attempts = ?,
                  locked_until = IF(? >= ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), locked_until),
                  updated_at = NOW()
            WHERE id = ?`,
          [attempts, attempts, MAX_RECOVERY_ATTEMPTS, credential.id]
        );
      }
      await connection.query(
        `UPDATE auth_bootstrap_sessions
            SET failed_attempts = failed_attempts + 1,
                locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), locked_until)
          WHERE id = ?`,
        [MAX_RECOVERY_ATTEMPTS, bootstrap.id]
      );
      return { authenticationFailure: 'recovery_failed' };
    }
    return transferWechatBinding(connection, {
      accountId: request.account_id,
      personId: request.person_id,
      bootstrap,
      recoveryRequestId: request.id,
      credential,
      metadata
    });
  });
  if (result && result.authenticationFailure) {
    throw new IdentityError('recovery_failed', '请检查恢复信息或联系管理员', 400);
  }
  return result;
}

async function transferWechatBinding(connection, data) {
  const [accountRowsForUpdate] = await connection.query(
    'SELECT status FROM accounts WHERE id = ? LIMIT 1 FOR UPDATE',
    [data.accountId]
  );
  if (!accountRowsForUpdate.length) throw new IdentityError('account_not_found', '请刷新账号列表', 404);
  if (accountRowsForUpdate[0].status === 'frozen') {
    throw new IdentityError('account_frozen', '账号已冻结，请联系管理员', 403);
  }
  const openid = decryptOpenid(data.bootstrap.openid_ciphertext);
  const newHash = hmac(openid);
  const [conflicts] = await connection.query(
    `SELECT account_id
       FROM account_wechat_bindings
      WHERE app_id = ? AND openid_hash IN (?, ?) AND status = 'active'
        AND account_id <> ?
      LIMIT 1 FOR UPDATE`,
    [APP_ID, newHash, legacyHash(openid), data.accountId]
  );
  if (conflicts.length) throw new IdentityError('wechat_conflict', '该微信已绑定其他账号', 409);
  await connection.query(
    `UPDATE account_wechat_bindings
        SET status = 'revoked', active_account_id = NULL,
            revoked_at = NOW(), updated_at = NOW()
      WHERE account_id = ? AND app_id = ? AND status = 'active'`,
    [data.accountId, APP_ID]
  );
  await insertActiveWechatBinding(connection, data.accountId, openid);
  await connection.query(
    `UPDATE accounts
        SET status = 'verified', token_version = token_version + 1,
            recovery_required_at = NULL, updated_at = NOW()
      WHERE id = ?`,
    [data.accountId]
  );
  await connection.query(
    `UPDATE auth_sessions
        SET status = 'revoked', revoked_at = NOW()
      WHERE account_id = ? AND status = 'active'`,
    [data.accountId]
  );
  await connection.query(
    `DELETE ui
       FROM user_info ui
       JOIN organization_memberships om
         ON om.legacy_hr_id =
            CONVERT(ui.hr_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND om.org_id =
            CONVERT(ui.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
       JOIN accounts a ON a.person_id = om.person_id
      WHERE a.id = ?`,
    [data.accountId]
  );
  await syncLegacyBindings(connection, data.accountId, openid);
  let rotatedRecoveryCode = '';
  if (data.credential && data.credential.method === 'recovery_code') {
    rotatedRecoveryCode = randomCode(20);
    const rotated = hashPassphrase(rotatedRecoveryCode);
    await connection.query(
      `UPDATE account_recovery_credentials
          SET credential_hash = ?, salt = ?, status = 'active',
              failed_attempts = 0, locked_until = NULL, used_at = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [rotated.hash, rotated.salt, data.credential.id]
    );
  } else if (data.credential) {
    await connection.query(
      `UPDATE account_recovery_credentials
          SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE id = ?`,
      [data.credential.id]
    );
  }
  if (data.recoveryRequestId) {
    await connection.query(
      `UPDATE account_recovery_requests
          SET status = 'completed', reviewed_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [data.recoveryRequestId]
    );
  }
  await connection.query(
    `UPDATE auth_bootstrap_sessions
        SET status = 'consumed', consumed_at = NOW()
      WHERE id = ?`,
    [data.bootstrap.id]
  );
  const [recipientRows] = await connection.query(
    `SELECT om.org_id, om.legacy_hr_id
       FROM organization_memberships om
       LEFT JOIN membership_assignments ma ON ma.membership_id = om.id
         AND ma.status = 'active' AND ma.is_primary = 1
      WHERE om.person_id = ? AND om.status = 'active'
      ORDER BY ma.is_primary DESC, om.created_at ASC
      LIMIT 1`,
    [data.personId]
  );
  if (recipientRows.length) {
    const { createNotification } = require('../../modules/audit/utils/notificationHelper');
    await createNotification({
      orgId: recipientRows[0].org_id,
      recipientType: 'user',
      recipientId: recipientRows[0].legacy_hr_id,
      eventKey: 'account-security:wechat-recovered:' + (data.recoveryRequestId || data.bootstrap.id),
      type: 'account_security',
      title: '账号安全状态已更新',
      description: '微信绑定已更新，其他设备已退出登录。若非本人操作，请立即联系管理员。',
      category: 'system',
      targetType: 'account_security',
      targetId: data.accountId,
      targetUrl: '/subpackages/org/pages/accountSecurity/accountSecurity'
    }, connection);
  }
  await appendAuditEvent({
    connection,
    eventType: 'account_wechat_recovered',
    targetPersonId: data.personId,
    accountId: data.accountId,
    requestId: data.metadata && data.metadata.requestId,
    ip: data.metadata && data.metadata.ip
  });
  const [accountRows] = await connection.query(
    `SELECT a.*, b.openid_hash, p.name, p.student_id
       FROM accounts a
       JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
       JOIN persons p ON p.id = a.person_id
      WHERE a.id = ?`,
    [data.accountId]
  );
  const account = accountRows[0];
  if (account && rotatedRecoveryCode) account.rotatedRecoveryCode = rotatedRecoveryCode;
  return account;
}

async function listRecoveryRequests(organizationId, options) {
  const orgId = safeString(organizationId);
  const limit = Math.min(Math.max(Number(options && options.limit) || 50, 1), 100);
  const params = [];
  let scopeSql = '';
  if (orgId) {
    scopeSql = "AND EXISTS (SELECT 1 FROM organization_memberships scope_m WHERE scope_m.person_id = r.person_id AND scope_m.org_id = ? AND scope_m.status = 'active')";
    params.push(orgId);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT r.id, r.person_id, r.account_id, r.requested_org_id, r.status,
            r.created_at, r.expires_at, p.name, p.student_id, o.name AS requested_org_name
       FROM account_recovery_requests r
       JOIN persons p ON p.id = r.person_id
       JOIN organizations o
         ON CONVERT(o.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = r.requested_org_id
      WHERE r.status = 'pending' AND r.expires_at > NOW()
        ${scopeSql}
      ORDER BY r.created_at ASC
      LIMIT ?`,
    params
  );
  return rows.map((row) => ({
    id: safeString(row.id),
    personId: safeString(row.person_id),
    accountId: safeString(row.account_id),
    name: safeString(row.name),
    studentId: safeString(row.student_id),
    requestedOrganizationId: safeString(row.requested_org_id),
    requestedOrganizationName: safeString(row.requested_org_name),
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }));
}

async function listAccounts(organizationId, options) {
  const orgId = safeString(organizationId);
  const limit = Math.min(Math.max(Number(options && options.limit) || 100, 1), 200);
  const params = [];
  let scopeSql = '';
  if (orgId) {
    scopeSql = "AND EXISTS (SELECT 1 FROM organization_memberships scope_m WHERE scope_m.person_id = p.id AND scope_m.org_id = ? AND scope_m.status = 'active')";
    params.push(orgId);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT a.id AS account_id, a.person_id, a.status, a.verified_at,
            a.recovery_required_at, p.name, p.student_id,
            EXISTS (
              SELECT 1 FROM account_wechat_bindings b
               WHERE b.account_id = a.id AND b.status = 'active'
            ) AS has_active_binding,
            EXISTS (
              SELECT 1 FROM admin_grants ag
               WHERE ag.person_id = p.id AND ag.admin_level = 'super_admin' AND ag.status = 'active'
            ) AS is_super_admin
       FROM accounts a
       JOIN persons p ON p.id = a.person_id
      WHERE p.status = 'active' ${scopeSql}
      ORDER BY p.name ASC, p.student_id ASC
      LIMIT ?`,
    params
  );
  return rows;
}

async function setAccountFrozen(personId, frozen, actor, metadata) {
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT a.*, EXISTS (
          SELECT 1 FROM admin_grants ag
           WHERE ag.person_id = a.person_id
             AND ag.admin_level = 'super_admin' AND ag.status = 'active'
        ) AS is_super_admin
         FROM accounts a
        WHERE a.person_id = ?
        LIMIT 1 FOR UPDATE`,
      [safeString(personId)]
    );
    const account = rows[0];
    if (!account) throw new IdentityError('account_not_found', '请刷新账号列表', 404);
    if (actor.adminLevel !== 'super_admin') {
      const [membershipRows] = await connection.query(
        `SELECT 1 FROM organization_memberships
          WHERE person_id = ? AND org_id = ? AND status = 'active'
          LIMIT 1`,
        [account.person_id, actor.organizationId]
      );
      if (!membershipRows.length) {
        throw new IdentityError('account_forbidden', '请切换到该成员所属组织', 403);
      }
    }
    if (account.person_id === actor.personId && frozen) {
      throw new IdentityError('self_freeze_forbidden', '不能冻结自己的账号', 403);
    }
    if (frozen && account.is_super_admin) {
      const [boundRows] = await connection.query(
        `SELECT DISTINCT ag.person_id
           FROM admin_grants ag
           JOIN accounts a ON a.person_id = ag.person_id AND a.status = 'verified'
           JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
          WHERE ag.admin_level = 'super_admin' AND ag.status = 'active'
          FOR UPDATE`
      );
      if (boundRows.length <= 1) {
        throw new IdentityError('last_bound_super_admin', '请先绑定另一名超级管理员', 409);
      }
    }
    const nextStatus = frozen ? 'frozen' : (account.recovery_required_at ? 'recovery_required' : 'verified');
    await connection.query(
      `UPDATE accounts
          SET status = ?, token_version = token_version + 1, updated_at = NOW()
        WHERE id = ?`,
      [nextStatus, account.id]
    );
    if (frozen) {
      await connection.query(
        `UPDATE auth_sessions SET status = 'revoked', revoked_at = NOW()
          WHERE account_id = ? AND status = 'active'`,
        [account.id]
      );
      await connection.query(
        `UPDATE account_recovery_requests
            SET status = 'revoked', reviewed_at = NOW(), updated_at = NOW()
          WHERE account_id = ? AND status = 'pending'`,
        [account.id]
      );
    }
    await appendAuditEvent({
      connection,
      eventType: frozen ? 'account_frozen' : 'account_unfrozen',
      actorPersonId: actor.personId,
      targetPersonId: account.person_id,
      accountId: account.id,
      organizationId: actor.organizationId,
      contextId: actor.contextId,
      requestId: metadata && metadata.requestId,
      ip: metadata && metadata.ip
    });
    return { accountId: account.id, status: nextStatus };
  });
}

async function approveRecovery(recoveryRequestId, actor, metadata) {
  if (!actor || !actor.personId) throw new IdentityError('forbidden', '无权执行账号恢复', 403);
  return pool.withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT r.*, EXISTS (
          SELECT 1 FROM organization_memberships om
           WHERE om.person_id = r.person_id AND om.org_id = ? AND om.status = 'active'
        ) AS actor_org_matches
         FROM account_recovery_requests r
        WHERE r.id = ? AND r.status = 'pending' AND r.expires_at > NOW()
        LIMIT 1 FOR UPDATE`,
      [actor.organizationId, safeString(recoveryRequestId)]
    );
    const request = rows[0];
    if (!request) throw new IdentityError('recovery_unavailable', '恢复申请已失效，请刷新列表', 409);
    if (request.person_id === actor.personId) {
      throw new IdentityError('self_approval_forbidden', '不能审批自己的账号恢复', 403);
    }
    if (actor.adminLevel !== 'super_admin' && !Boolean(request.actor_org_matches)) {
      throw new IdentityError('recovery_forbidden', '请切换到该成员所属组织', 403);
    }
    const bootstrap = await getBootstrapByHash(request.new_openid_hash, true, connection);
    if (!bootstrap) throw new IdentityError('bootstrap_expired', '申请人的微信验证已过期', 409);
    await connection.query(
      `UPDATE account_recovery_requests
          SET approved_by_person_id = ?, approved_by_context_id = ?,
              reviewed_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [actor.personId, actor.contextId, request.id]
    );
    return transferWechatBinding(connection, {
      accountId: request.account_id,
      personId: request.person_id,
      bootstrap,
      recoveryRequestId: request.id,
      metadata
    });
  });
}

async function getBootstrapByHash(openidHash, lock, connection) {
  const executor = connection || pool;
  const [rows] = await executor.query(
    `SELECT *
       FROM auth_bootstrap_sessions
      WHERE openid_hash = ? AND status = 'active' AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [safeString(openidHash)]
  );
  return rows[0] || null;
}

async function listSessions(accountId) {
  const [rows] = await pool.query(
    `SELECT id, context_id, organization_id, role, status, expires_at, last_seen_at, created_at
       FROM auth_sessions
      WHERE account_id = ? AND status = 'active' AND expires_at > NOW()
      ORDER BY last_seen_at DESC`,
    [safeString(accountId)]
  );
  return rows;
}

async function revokeSession(accountId, sessionId, currentSessionId) {
  if (safeString(sessionId) === safeString(currentSessionId)) {
    throw new IdentityError('current_session', '当前设备请使用退出登录', 400);
  }
  const [result] = await pool.query(
    `UPDATE auth_sessions SET status = 'revoked', revoked_at = NOW()
      WHERE id = ? AND account_id = ? AND status = 'active'`,
    [safeString(sessionId), safeString(accountId)]
  );
  return result.affectedRows > 0;
}

async function resetAccountByLegacyHr(connection, legacyHrId, organizationId, actor, reason) {
  const [rows] = await connection.query(
    `SELECT a.id AS account_id, a.person_id
       FROM organization_memberships om
       JOIN accounts a ON a.person_id = om.person_id
      WHERE om.legacy_hr_id = ? AND om.org_id = ?
      LIMIT 1 FOR UPDATE`,
    [safeString(legacyHrId), safeString(organizationId)]
  );
  const account = rows[0];
  if (!account) return null;
  const [targetSuperRows] = await connection.query(
    `SELECT 1 FROM admin_grants
      WHERE person_id = ? AND admin_level = 'super_admin' AND status = 'active'
      LIMIT 1 FOR UPDATE`,
    [account.person_id]
  );
  if (targetSuperRows.length) {
    const [boundSuperRows] = await connection.query(
      `SELECT DISTINCT ag.person_id
         FROM admin_grants ag
         JOIN accounts a ON a.person_id = ag.person_id AND a.status = 'verified'
         JOIN account_wechat_bindings b ON b.account_id = a.id AND b.status = 'active'
        WHERE ag.admin_level = 'super_admin' AND ag.status = 'active'
        FOR UPDATE`
    );
    if (boundSuperRows.length <= 1) {
      throw new IdentityError('last_bound_super_admin', '请先绑定另一名超级管理员', 409);
    }
  }
  await connection.query(
    `UPDATE account_wechat_bindings
        SET status = 'revoked', active_account_id = NULL,
            revoked_at = NOW(), updated_at = NOW()
      WHERE account_id = ? AND status = 'active'`,
    [account.account_id]
  );
  await connection.query(
    `UPDATE auth_sessions
        SET status = 'revoked', revoked_at = NOW()
      WHERE account_id = ? AND status = 'active'`,
    [account.account_id]
  );
  await connection.query(
    `UPDATE accounts
        SET status = 'recovery_required', token_version = token_version + 1,
            recovery_required_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [account.account_id]
  );
  await connection.query(
    `DELETE ui
       FROM user_info ui
       JOIN organization_memberships om
         ON om.legacy_hr_id =
            CONVERT(ui.hr_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND om.org_id =
            CONVERT(ui.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE om.person_id = ?`,
    [account.person_id]
  );
  await connection.query(
    `UPDATE admin_info ai
       JOIN admin_grants ag
         ON ag.legacy_admin_id =
            CONVERT(ai.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
          SET ai.openid = NULL, ai.bind_status = 'invited', ai.bound_at = NULL,
              ai.updated_at = NOW()
        WHERE ag.person_id = ? AND ag.status = 'active'`,
    [account.person_id]
  );
  await appendAuditEvent({
    connection,
    eventType: 'account_binding_reset',
    actorPersonId: actor && actor.personId,
    targetPersonId: account.person_id,
    accountId: account.account_id,
    organizationId,
    contextId: actor && actor.contextId,
    detail: { reason: safeString(reason) || 'administrator_reset' }
  });
  return { accountId: account.account_id, personId: account.person_id };
}

async function appendAuditEvent(data) {
  const executor = data.connection || pool;
  await executor.query(
    `INSERT INTO auth_audit_events
       (id, event_type, actor_person_id, target_person_id, account_id,
        organization_id, context_id, request_id, ip_hash, outcome, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      safeString(data.eventType),
      safeString(data.actorPersonId) || null,
      safeString(data.targetPersonId) || null,
      safeString(data.accountId) || null,
      safeString(data.organizationId) || null,
      safeString(data.contextId) || null,
      safeString(data.requestId) || null,
      data.ip ? hmac('ip:' + safeString(data.ip)) : null,
      safeString(data.outcome) || 'success',
      data.detail ? JSON.stringify(data.detail) : null
    ]
  );
}

async function listAuditEvents(organizationId, limit) {
  const count = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const orgId = safeString(organizationId);
  const params = [];
  let scopeSql = '';
  if (orgId) {
    scopeSql = 'WHERE e.organization_id = ?';
    params.push(orgId);
  }
  params.push(count);
  const [rows] = await pool.query(
    `SELECT e.*, actor.name AS actor_name, target.name AS target_name
       FROM auth_audit_events e
       LEFT JOIN persons actor ON actor.id = e.actor_person_id
       LEFT JOIN persons target ON target.id = e.target_person_id
       ${scopeSql}
      ORDER BY e.created_at DESC
      LIMIT ?`,
    params
  );
  return rows;
}

module.exports = {
  APP_ID,
  SESSION_MINUTES,
  IdentityError,
  contextId,
  authIdentityId,
  normalizeStudentId,
  listClaimOrganizations,
  syncLegacyHrRecords,
  listMembershipAssignments,
  saveMembershipAssignment,
  revokeMembershipAssignment,
  removeLegacyHrRecord,
  syncLegacyAdminGrant,
  listLegacyAdminAuthenticationStates,
  revokeLegacyAdminGrant,
  findAccountByOpenid,
  upgradeLegacyWechatBindings,
  createBootstrapSession,
  getBootstrapSession,
  listContexts,
  resolveContextSelection,
  resolveContext,
  createSession,
  loadSession,
  activateSelection,
  activateContext,
  syncLegacyBindings,
  createClaim,
  listClaims,
  issueVerificationCode,
  issueVerificationCodes,
  verifyClaim,
  getPolicy,
  savePolicy,
  configureRecoveryCredential,
  startRecovery,
  completeRecoveryWithCredential,
  listRecoveryRequests,
  listAccounts,
  setAccountFrozen,
  approveRecovery,
  listSessions,
  revokeSession,
  resetAccountByLegacyHr,
  appendAuditEvent,
  listAuditEvents
};
