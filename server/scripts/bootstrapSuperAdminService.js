const { safeString } = require('../src/utils/helpers');

const APP_ID = 'whusu-smart-workspace';
const LOCK_NAME = 'whusu:bootstrap:global-super-admin';
const CONFIRM_PREFIX = 'CREATE_GLOBAL_SUPER_ADMIN';
const ARGUMENTS = Object.freeze({
  '--name': 'name',
  '--student-id': 'studentId',
  '--org-id': 'organizationId',
  '--openid': 'openid',
  '--confirm': 'confirmation'
});
const ENVIRONMENT = Object.freeze({
  name: 'BOOTSTRAP_NAME',
  studentId: 'BOOTSTRAP_STUDENT_ID',
  organizationId: 'BOOTSTRAP_ORG_ID',
  openid: 'BOOTSTRAP_OPENID',
  confirmation: 'BOOTSTRAP_CONFIRM'
});

class BootstrapError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BootstrapError';
    this.code = code;
  }
}

function fail(code) {
  throw new BootstrapError(code);
}

function unicodeLength(value) {
  return Array.from(String(value || '')).length;
}

function normalizeStudentId(value) {
  return safeString(value).toLowerCase();
}

function expectedConfirmation(studentId, organizationId) {
  return `${CONFIRM_PREFIX}:${normalizeStudentId(studentId)}:${safeString(organizationId)}`;
}

function parseArguments(argv) {
  const values = {};
  const args = Array.isArray(argv) ? argv.slice() : [];
  for (let index = 0; index < args.length; index += 1) {
    const token = safeString(args[index]);
    const equalIndex = token.indexOf('=');
    const option = equalIndex >= 0 ? token.slice(0, equalIndex) : token;
    const field = ARGUMENTS[option];
    if (!field) fail('unknown_argument');
    const value = equalIndex >= 0 ? token.slice(equalIndex + 1) : safeString(args[++index]);
    if (!value) fail('missing_argument_value');
    if (Object.prototype.hasOwnProperty.call(values, field)) fail('duplicate_argument');
    values[field] = value;
  }
  return values;
}

function resolveInput(cliValues, environment, field) {
  const cliValue = safeString(cliValues[field]);
  const envValue = safeString(environment[ENVIRONMENT[field]]);
  if (cliValue && envValue && cliValue !== envValue) fail('conflicting_input_sources');
  return cliValue || envValue;
}

function validateVisibleInput(value, maxLength, code) {
  if (!value || unicodeLength(value) > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
}

function parseBootstrapConfig(argv, environment) {
  const cliValues = parseArguments(argv);
  const env = environment || {};
  const name = resolveInput(cliValues, env, 'name');
  const studentId = resolveInput(cliValues, env, 'studentId');
  const organizationId = resolveInput(cliValues, env, 'organizationId');
  const openid = resolveInput(cliValues, env, 'openid');
  const confirmation = resolveInput(cliValues, env, 'confirmation');

  validateVisibleInput(name, 100, 'invalid_name');
  validateVisibleInput(studentId, 32, 'invalid_student_id');
  validateVisibleInput(organizationId, 64, 'invalid_organization_id');
  if (openid) validateVisibleInput(openid, 128, 'invalid_openid');
  if (confirmation !== expectedConfirmation(studentId, organizationId)) fail('confirmation_mismatch');

  return {
    name,
    studentId,
    normalizedStudentId: normalizeStudentId(studentId),
    organizationId,
    openid
  };
}

function firstRow(result) {
  return result && Array.isArray(result[0]) ? result[0][0] || null : null;
}

function rows(result) {
  return result && Array.isArray(result[0]) ? result[0] : [];
}

function exactPerson(row, config) {
  return row
    && safeString(row.status) === 'active'
    && normalizeStudentId(row.student_id) === config.normalizedStudentId
    && safeString(row.name) === config.name;
}

async function lockOrganization(connection, config) {
  const organization = firstRow(await connection.query(
    '/* bootstrap:lock-organization */ SELECT id FROM organizations WHERE id = ? LIMIT 1 FOR UPDATE',
    [config.organizationId]
  ));
  if (!organization) fail('organization_not_found');
}

async function lockGlobalSuperState(connection) {
  const grants = rows(await connection.query(
    `/* bootstrap:lock-global-super-grants */
     SELECT id, person_id, status, legacy_admin_id
       FROM admin_grants
      WHERE org_id = '' AND admin_level = 'super_admin'
      ORDER BY id FOR UPDATE`
  ));
  const legacyAdmins = rows(await connection.query(
    `/* bootstrap:lock-legacy-super-admins */
     SELECT id, name, student_id, openid, bind_status
       FROM admin_info
      WHERE org_id = '' AND admin_level = 'super_admin'
      ORDER BY id FOR UPDATE`
  ));
  return { grants, legacyAdmins };
}

async function ensureLegacyHr(connection, config, generateId, changes) {
  const matches = rows(await connection.query(
    `/* bootstrap:lock-legacy-hr */
     SELECT id, name, student_id, org_id
       FROM hr_info
      WHERE org_id = ? AND LOWER(TRIM(student_id)) = ?
      ORDER BY id FOR UPDATE`,
    [config.organizationId, config.normalizedStudentId]
  ));
  if (matches.length > 1) fail('duplicate_legacy_hr_identity');
  if (matches[0]) {
    if (safeString(matches[0].name) !== config.name) fail('student_name_conflict');
    return safeString(matches[0].id);
  }
  const legacyHrId = generateId();
  await connection.query(
    `/* bootstrap:create-legacy-hr */
     INSERT INTO hr_info (id, name, student_id, org_id)
     VALUES (?, ?, ?, ?)`,
    [legacyHrId, config.name, config.studentId, config.organizationId]
  );
  changes.legacyHr = true;
  return legacyHrId;
}

async function ensurePerson(connection, config, generateId, changes) {
  const personRows = rows(await connection.query(
    `/* bootstrap:lock-person */
     SELECT id, name, student_id, normalized_student_id, status
       FROM persons
      WHERE normalized_student_id = ?
      ORDER BY id FOR UPDATE`,
    [config.normalizedStudentId]
  ));
  if (personRows.length > 1) fail('duplicate_person_identity');
  if (personRows[0]) {
    if (!exactPerson(personRows[0], config)) fail('person_identity_conflict');
    return safeString(personRows[0].id);
  }
  const personId = generateId();
  await connection.query(
    `/* bootstrap:create-person */
     INSERT INTO persons (id, name, student_id, normalized_student_id, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [personId, config.name, config.studentId, config.normalizedStudentId]
  );
  changes.person = true;
  return personId;
}

async function ensureMembership(connection, config, personId, legacyHrId, generateId, changes) {
  const memberships = rows(await connection.query(
    `/* bootstrap:lock-memberships */
     SELECT id, person_id, org_id, legacy_hr_id, status
       FROM organization_memberships
      WHERE (person_id = ? AND org_id = ?) OR legacy_hr_id = ?
      ORDER BY id FOR UPDATE`,
    [personId, config.organizationId, legacyHrId]
  ));
  if (memberships.length > 1) fail('membership_identity_conflict');
  if (memberships[0]) {
    const membership = memberships[0];
    if (safeString(membership.person_id) !== personId
      || safeString(membership.org_id) !== config.organizationId
      || safeString(membership.legacy_hr_id) !== legacyHrId
      || safeString(membership.status) !== 'active') {
      fail('membership_identity_conflict');
    }
    return safeString(membership.id);
  }
  const membershipId = generateId();
  await connection.query(
    `/* bootstrap:create-membership */
     INSERT INTO organization_memberships (id, person_id, org_id, legacy_hr_id, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [membershipId, personId, config.organizationId, legacyHrId]
  );
  changes.membership = true;
  return membershipId;
}

async function ensureAccount(connection, personId, generateId, changes) {
  const accounts = rows(await connection.query(
    `/* bootstrap:lock-account */
     SELECT id, person_id, status, verified_at
       FROM accounts
      WHERE person_id = ?
      ORDER BY id FOR UPDATE`,
    [personId]
  ));
  if (accounts.length > 1) fail('duplicate_person_account');
  if (accounts[0]) {
    if (safeString(accounts[0].status) !== 'verified') fail('account_state_conflict');
    return safeString(accounts[0].id);
  }
  const accountId = generateId();
  await connection.query(
    `/* bootstrap:create-account */
     INSERT INTO accounts (id, person_id, status, token_version, verified_at)
     VALUES (?, ?, 'verified', 1, NOW())`,
    [accountId, personId]
  );
  changes.account = true;
  return accountId;
}

function bindingMatchesOpenid(binding, openid, openidHashes, decryptOpenid) {
  if (openidHashes.includes(safeString(binding.openid_hash))) return true;
  if (safeString(binding.legacy_openid) === openid) return true;
  const ciphertext = safeString(binding.openid_ciphertext);
  if (!ciphertext) return false;
  try {
    return decryptOpenid(ciphertext) === openid;
  } catch (error) {
    return false;
  }
}

async function ensureBinding(connection, config, accountId, generateId, cryptoAdapter, changes) {
  const bindings = rows(await connection.query(
    `/* bootstrap:lock-account-binding */
     SELECT id, account_id, openid_hash, hash_version, openid_ciphertext, legacy_openid,
            active_account_id, status
       FROM account_wechat_bindings
      WHERE account_id = ? AND app_id = ? AND status = 'active'
      ORDER BY id FOR UPDATE`,
    [accountId, APP_ID]
  ));
  if (bindings.length > 1) fail('multiple_active_bindings');

  let openid = config.openid;
  if (!openid && bindings[0]) {
    try {
      openid = cryptoAdapter.decryptOpenid(safeString(bindings[0].openid_ciphertext));
    } catch (error) {
      fail('openid_required_for_binding_upgrade');
    }
  }
  if (!openid) fail('openid_required');
  const openidHash = cryptoAdapter.hashOpenid(openid);
  const openidHashes = [...new Set(cryptoAdapter.hashOpenidCandidates(openid).map(safeString).filter(Boolean))];
  if (!openidHashes.includes(openidHash)) openidHashes.unshift(openidHash);
  const owners = rows(await connection.query(
    `/* bootstrap:lock-openid-owners */
     SELECT account_id, openid_hash, openid_ciphertext, legacy_openid
       FROM account_wechat_bindings
      WHERE app_id = ? AND status = 'active'
      ORDER BY id FOR UPDATE`,
    [APP_ID]
  ));
  const conflictingOwner = owners.find((owner) => (
    safeString(owner.account_id) !== accountId
      && bindingMatchesOpenid(owner, openid, openidHashes, cryptoAdapter.decryptOpenid)
  ));
  if (conflictingOwner) fail('openid_account_conflict');

  if (bindings[0]) {
    if (!bindingMatchesOpenid(bindings[0], openid, openidHashes, cryptoAdapter.decryptOpenid)) {
      fail('account_binding_conflict');
    }
    const secure = safeString(bindings[0].openid_hash) === openidHash
      && safeString(bindings[0].hash_version) === 'hmac_sha256_v1'
      && Boolean(safeString(bindings[0].openid_ciphertext))
      && !safeString(bindings[0].legacy_openid)
      && safeString(bindings[0].active_account_id) === accountId;
    if (!secure) {
      await connection.query(
        `/* bootstrap:upgrade-account-binding */
         UPDATE account_wechat_bindings
            SET openid_hash = ?, hash_version = 'hmac_sha256_v1', openid_ciphertext = ?,
                legacy_openid = NULL, active_account_id = ?, updated_at = NOW()
          WHERE id = ? AND account_id = ? AND status = 'active'`,
        [openidHash, cryptoAdapter.encryptOpenid(openid), accountId, bindings[0].id, accountId]
      );
      changes.binding = true;
    }
    return openid;
  }

  await connection.query(
    `/* bootstrap:create-account-binding */
     INSERT INTO account_wechat_bindings
       (id, account_id, app_id, openid_hash, hash_version, openid_ciphertext,
        legacy_openid, status, active_account_id, bound_at)
     VALUES (?, ?, ?, ?, 'hmac_sha256_v1', ?, NULL, 'active', ?, NOW())`,
    [generateId(), accountId, APP_ID, openidHash, cryptoAdapter.encryptOpenid(openid), accountId]
  );
  changes.binding = true;
  return openid;
}

async function ensureLegacyUserBinding(connection, config, personId, legacyHrId, openid, generateId, changes) {
  const legacyRows = rows(await connection.query(
    `/* bootstrap:lock-legacy-user-binding */
     SELECT ui.id, ui.openid, ui.hr_id
       FROM user_info ui
      WHERE ui.org_id = ? AND (ui.openid = ? OR ui.hr_id = ?)
      ORDER BY ui.id FOR UPDATE`,
    [config.organizationId, openid, legacyHrId]
  ));
  if (legacyRows.length > 1) fail('legacy_user_binding_conflict');
  if (legacyRows[0] && (
    safeString(legacyRows[0].openid) !== openid
    || safeString(legacyRows[0].hr_id) !== legacyHrId
  )) fail('legacy_user_binding_conflict');
  if (!legacyRows[0]) {
    await connection.query(
      `/* bootstrap:create-legacy-user-binding */
       INSERT INTO user_info (id, openid, hr_id, org_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [generateId(), openid, legacyHrId, config.organizationId]
    );
    changes.legacyUserBinding = true;
  }
  const membership = firstRow(await connection.query(
    `/* bootstrap:verify-person-membership */
     SELECT id FROM organization_memberships
      WHERE person_id = ? AND org_id = ? AND legacy_hr_id = ? AND status = 'active'
      LIMIT 1 FOR UPDATE`,
    [personId, config.organizationId, legacyHrId]
  ));
  if (!membership) fail('membership_identity_conflict');
}

async function ensureLegacyAdmin(connection, config, openid, globalState, generateId, changes) {
  if (globalState.legacyAdmins.length > 1) fail('multiple_legacy_super_admins');
  const existing = globalState.legacyAdmins[0] || null;
  if (existing) {
    if (normalizeStudentId(existing.student_id) !== config.normalizedStudentId
      || safeString(existing.name) !== config.name) {
      fail('existing_super_admin_conflict');
    }
    const existingOpenid = safeString(existing.openid);
    if (existingOpenid && existingOpenid !== openid) fail('legacy_admin_binding_conflict');
    if (safeString(existing.bind_status) !== 'active' || !existingOpenid) {
      await connection.query(
        `/* bootstrap:activate-legacy-admin */
         UPDATE admin_info
            SET openid = ?, bind_status = 'active', invite_code = NULL,
                invited_at = NULL, invite_expires_at = NULL, invite_consumed_at = NULL,
                bound_at = COALESCE(bound_at, NOW()), updated_at = NOW()
          WHERE id = ? AND org_id = '' AND admin_level = 'super_admin'`,
        [openid, existing.id]
      );
      changes.legacyAdmin = true;
    }
    return safeString(existing.id);
  }

  const legacyAdminId = generateId();
  await connection.query(
    `/* bootstrap:create-legacy-admin */
     INSERT INTO admin_info
       (id, name, student_id, openid, admin_level, bind_status, invite_code,
        invited_at, invite_expires_at, invite_consumed_at, bound_at, org_id)
     VALUES (?, ?, ?, ?, 'super_admin', 'active', NULL, NULL, NULL, NULL, NOW(), '')`,
    [legacyAdminId, config.name, config.studentId, openid]
  );
  changes.legacyAdmin = true;
  return legacyAdminId;
}

async function ensureGrant(connection, personId, legacyAdminId, globalState, generateId, changes) {
  const activeOther = globalState.grants.find((grant) => (
    safeString(grant.status) === 'active' && safeString(grant.person_id) !== personId
  ));
  if (activeOther) fail('existing_super_admin_conflict');
  const targetGrants = globalState.grants.filter((grant) => safeString(grant.person_id) === personId);
  if (targetGrants.length > 1) fail('multiple_target_super_grants');
  const target = targetGrants[0] || null;
  const legacyOwner = firstRow(await connection.query(
    `/* bootstrap:lock-legacy-grant-owner */
     SELECT id, person_id
       FROM admin_grants
      WHERE legacy_admin_id = ?
      LIMIT 1 FOR UPDATE`,
    [legacyAdminId]
  ));
  if (legacyOwner && safeString(legacyOwner.person_id) !== personId) fail('legacy_admin_grant_conflict');
  if (target && safeString(target.status) !== 'active') fail('revoked_super_grant_conflict');
  if (target) {
    const linkedLegacyId = safeString(target.legacy_admin_id);
    if (linkedLegacyId && linkedLegacyId !== legacyAdminId) fail('legacy_admin_grant_conflict');
    if (!linkedLegacyId) {
      await connection.query(
        `/* bootstrap:link-super-grant */
         UPDATE admin_grants SET legacy_admin_id = ?, updated_at = NOW()
          WHERE id = ? AND person_id = ? AND org_id = ''
            AND admin_level = 'super_admin' AND status = 'active'`,
        [legacyAdminId, target.id, personId]
      );
      changes.grant = true;
    }
    return safeString(target.id);
  }

  const grantId = generateId();
  await connection.query(
    `/* bootstrap:create-super-grant */
     INSERT INTO admin_grants
       (id, person_id, org_id, admin_level, status, legacy_admin_id)
     VALUES (?, ?, '', 'super_admin', 'active', ?)`,
    [grantId, personId, legacyAdminId]
  );
  changes.grant = true;
  return grantId;
}

async function assertEffectiveSuperAdmin(connection, personId) {
  const effective = firstRow(await connection.query(
    `/* bootstrap:verify-effective-super */
     SELECT ag.id
       FROM admin_grants ag
       JOIN persons p ON p.id = ag.person_id AND p.status = 'active'
       JOIN accounts a ON a.person_id = p.id AND a.status = 'verified'
       JOIN account_wechat_bindings b
         ON b.account_id = a.id AND b.app_id = ? AND b.status = 'active'
      WHERE ag.person_id = ? AND ag.org_id = ''
        AND ag.admin_level = 'super_admin' AND ag.status = 'active'
      LIMIT 1 FOR UPDATE`,
    [APP_ID, personId]
  ));
  if (!effective) fail('effective_super_admin_not_established');
}

async function appendBootstrapAudit(connection, personId, accountId, organizationId, changes, generateId) {
  await connection.query(
    `/* bootstrap:append-audit */
     INSERT INTO auth_audit_events
       (id, event_type, actor_person_id, target_person_id, account_id,
        organization_id, context_id, request_id, ip_hash, outcome, detail_json)
     VALUES (?, 'global_super_admin_offline_bootstrap', NULL, ?, ?, ?, NULL, NULL, NULL,
             'success', ?)`,
    [generateId(), personId, accountId, organizationId, JSON.stringify({
      source: 'offline_cli',
      createdComponents: Object.keys(changes).filter((key) => changes[key])
    })]
  );
}

async function bootstrapWithinTransaction(connection, config, generateId, cryptoAdapter) {
  const changes = {
    legacyHr: false,
    person: false,
    membership: false,
    account: false,
    binding: false,
    legacyUserBinding: false,
    legacyAdmin: false,
    grant: false
  };
  await lockOrganization(connection, config);
  const globalState = await lockGlobalSuperState(connection);
  const legacyHrId = await ensureLegacyHr(connection, config, generateId, changes);
  const personId = await ensurePerson(connection, config, generateId, changes);
  await ensureMembership(connection, config, personId, legacyHrId, generateId, changes);
  const accountId = await ensureAccount(connection, personId, generateId, changes);
  const openid = await ensureBinding(connection, config, accountId, generateId, cryptoAdapter, changes);
  await ensureLegacyUserBinding(connection, config, personId, legacyHrId, openid, generateId, changes);
  const legacyAdminId = await ensureLegacyAdmin(
    connection,
    config,
    openid,
    globalState,
    generateId,
    changes
  );
  await ensureGrant(connection, personId, legacyAdminId, globalState, generateId, changes);
  await assertEffectiveSuperAdmin(connection, personId);
  const changed = Object.values(changes).some(Boolean);
  if (changed) await appendBootstrapAudit(connection, personId, accountId, config.organizationId, changes, generateId);
  return { changed, changes };
}

async function bootstrapSuperAdmin(options) {
  const pool = options && options.pool;
  const config = options && options.config;
  const generateId = options && options.generateId;
  const cryptoAdapter = options && options.cryptoAdapter;
  if (!pool || typeof pool.getConnection !== 'function') fail('database_unavailable');
  if (!config || typeof generateId !== 'function' || !cryptoAdapter
    || typeof cryptoAdapter.hashOpenid !== 'function'
    || typeof cryptoAdapter.hashOpenidCandidates !== 'function'
    || typeof cryptoAdapter.encryptOpenid !== 'function'
    || typeof cryptoAdapter.decryptOpenid !== 'function') {
    fail('bootstrap_dependency_invalid');
  }

  const connection = await pool.getConnection();
  let lockAcquired = false;
  let transactionStarted = false;
  try {
    const lockResult = firstRow(await connection.query(
      'SELECT GET_LOCK(?, 10) AS acquired',
      [LOCK_NAME]
    ));
    lockAcquired = Number(lockResult && lockResult.acquired) === 1;
    if (!lockAcquired) fail('bootstrap_lock_unavailable');
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await bootstrapWithinTransaction(connection, config, generateId, cryptoAdapter);
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?) AS released', [LOCK_NAME]);
      } catch (error) {
        // 连接释放时 MySQL 会自动释放命名锁；此处不得掩盖原始结果。
      }
    }
    connection.release();
  }
}

module.exports = {
  APP_ID,
  LOCK_NAME,
  BootstrapError,
  expectedConfirmation,
  parseBootstrapConfig,
  bootstrapSuperAdmin,
  bootstrapWithinTransaction
};
