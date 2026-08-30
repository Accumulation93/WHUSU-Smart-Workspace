const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  BootstrapError,
  expectedConfirmation,
  parseBootstrapConfig,
  bootstrapSuperAdmin,
  bootstrapWithinTransaction
} = require('../scripts/bootstrapSuperAdminService');

const CONFIG = Object.freeze({
  name: '测试管理员',
  studentId: 'Test-001',
  normalizedStudentId: 'test-001',
  organizationId: 'org-test',
  openid: 'openid-sensitive-test-value'
});

const CRYPTO = Object.freeze({
  hashOpenid(value) {
    return `hash:${value}`;
  },
  hashOpenidCandidates(value) {
    return [`hash:${value}`];
  },
  encryptOpenid(value) {
    return `cipher:${value}`;
  },
  decryptOpenid(value) {
    if (!String(value).startsWith('cipher:')) throw new Error('invalid cipher');
    return String(value).slice('cipher:'.length);
  }
});

function bootstrapTag(sql) {
  const match = String(sql).match(/\/\* bootstrap:([a-z-]+) \*\//u);
  return match ? match[1] : '';
}

function createConnection(responseMap) {
  const calls = [];
  const lifecycle = [];
  return {
    calls,
    lifecycle,
    async query(sql, params) {
      const text = String(sql);
      calls.push({ sql: text, params: params || [] });
      if (text.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (text.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      const tag = bootstrapTag(text);
      if (!tag) throw new Error(`未配置的测试 SQL：${text}`);
      const configured = responseMap[tag];
      if (typeof configured === 'function') return configured(params || [], calls);
      if (configured !== undefined) return [configured];
      if (/^\s*(INSERT|UPDATE)/u.test(text.replace(/\/\*[\s\S]*?\*\//u, '').trim())) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`缺少 ${tag} 的测试响应`);
    },
    async beginTransaction() {
      lifecycle.push('begin');
    },
    async commit() {
      lifecycle.push('commit');
    },
    async rollback() {
      lifecycle.push('rollback');
    },
    release() {
      lifecycle.push('release');
    }
  };
}

function sequentialIdFactory() {
  let index = 0;
  return () => `generated-${++index}`;
}

function creationResponses() {
  return {
    'lock-organization': [{ id: CONFIG.organizationId }],
    'lock-global-super-grants': [],
    'lock-legacy-super-admins': [],
    'lock-legacy-hr': [],
    'lock-person': [],
    'lock-memberships': [],
    'lock-account': [],
    'lock-account-binding': [],
    'lock-openid-owners': [],
    'lock-legacy-user-binding': [],
    'verify-person-membership': [{ id: 'generated-3' }],
    'lock-legacy-grant-owner': [],
    'verify-effective-super': [{ id: 'generated-8' }]
  };
}

function assertBootstrapError(action, code) {
  assert.throws(action, (error) => error instanceof BootstrapError && error.code === code);
}

assert.strictEqual(
  expectedConfirmation('Test-001', 'org-test'),
  'CREATE_GLOBAL_SUPER_ADMIN:test-001:org-test'
);

const parsed = parseBootstrapConfig([], {
  BOOTSTRAP_NAME: CONFIG.name,
  BOOTSTRAP_STUDENT_ID: CONFIG.studentId,
  BOOTSTRAP_ORG_ID: CONFIG.organizationId,
  BOOTSTRAP_OPENID: CONFIG.openid,
  BOOTSTRAP_CONFIRM: expectedConfirmation(CONFIG.studentId, CONFIG.organizationId)
});
assert.deepStrictEqual(parsed, CONFIG);

assertBootstrapError(() => parseBootstrapConfig([], {}), 'invalid_name');
assertBootstrapError(() => parseBootstrapConfig([
  '--name', CONFIG.name,
  '--student-id', CONFIG.studentId,
  '--org-id', CONFIG.organizationId,
  '--confirm', 'WRONG'
], {}), 'confirmation_mismatch');
assertBootstrapError(() => parseBootstrapConfig(['--unsupported', 'value'], {}), 'unknown_argument');
assertBootstrapError(() => parseBootstrapConfig(['--name', '甲'], {
  BOOTSTRAP_NAME: '乙',
  BOOTSTRAP_STUDENT_ID: CONFIG.studentId,
  BOOTSTRAP_ORG_ID: CONFIG.organizationId,
  BOOTSTRAP_CONFIRM: expectedConfirmation(CONFIG.studentId, CONFIG.organizationId)
}), 'conflicting_input_sources');

async function testCreation() {
  const connection = createConnection(creationResponses());
  const result = await bootstrapWithinTransaction(
    connection,
    CONFIG,
    sequentialIdFactory(),
    CRYPTO
  );
  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(result.changes, {
    legacyHr: true,
    person: true,
    membership: true,
    account: true,
    binding: true,
    legacyUserBinding: true,
    legacyAdmin: true,
    grant: true
  });
  const tags = connection.calls.map((call) => bootstrapTag(call.sql)).filter(Boolean);
  assert(tags.includes('create-person'));
  assert(tags.includes('create-account-binding'));
  assert(tags.includes('create-super-grant'));
  assert(tags.includes('append-audit'));
  const auditCall = connection.calls.find((call) => bootstrapTag(call.sql) === 'append-audit');
  const auditDetail = String(auditCall.params[auditCall.params.length - 1]);
  assert(!auditDetail.includes(CONFIG.name));
  assert(!auditDetail.includes(CONFIG.studentId));
  assert(!auditDetail.includes(CONFIG.openid));
}

async function testIdempotency() {
  const noOpenidConfig = Object.assign({}, CONFIG, { openid: '' });
  const connection = createConnection({
    'lock-organization': [{ id: CONFIG.organizationId }],
    'lock-global-super-grants': [{
      id: 'grant-existing',
      person_id: 'person-existing',
      status: 'active',
      legacy_admin_id: 'legacy-admin-existing'
    }],
    'lock-legacy-super-admins': [{
      id: 'legacy-admin-existing',
      name: CONFIG.name,
      student_id: CONFIG.studentId,
      openid: CONFIG.openid,
      bind_status: 'active'
    }],
    'lock-legacy-hr': [{
      id: 'hr-existing',
      name: CONFIG.name,
      student_id: CONFIG.studentId,
      org_id: CONFIG.organizationId
    }],
    'lock-person': [{
      id: 'person-existing',
      name: CONFIG.name,
      student_id: CONFIG.studentId,
      normalized_student_id: CONFIG.normalizedStudentId,
      status: 'active'
    }],
    'lock-memberships': [{
      id: 'membership-existing',
      person_id: 'person-existing',
      org_id: CONFIG.organizationId,
      legacy_hr_id: 'hr-existing',
      status: 'active'
    }],
    'lock-account': [{
      id: 'account-existing',
      person_id: 'person-existing',
      status: 'verified',
      verified_at: new Date()
    }],
    'lock-account-binding': [{
      id: 'binding-existing',
      account_id: 'account-existing',
      openid_hash: CRYPTO.hashOpenid(CONFIG.openid),
      hash_version: 'hmac_sha256_v1',
      openid_ciphertext: CRYPTO.encryptOpenid(CONFIG.openid),
      legacy_openid: null,
      active_account_id: 'account-existing',
      status: 'active'
    }],
    'lock-openid-owners': [{
      account_id: 'account-existing',
      openid_hash: CRYPTO.hashOpenid(CONFIG.openid),
      openid_ciphertext: CRYPTO.encryptOpenid(CONFIG.openid),
      legacy_openid: null
    }],
    'lock-legacy-user-binding': [{
      id: 'user-existing',
      openid: CONFIG.openid,
      hr_id: 'hr-existing'
    }],
    'verify-person-membership': [{ id: 'membership-existing' }],
    'lock-legacy-grant-owner': [{ id: 'grant-existing', person_id: 'person-existing' }],
    'verify-effective-super': [{ id: 'grant-existing' }]
  });
  const result = await bootstrapWithinTransaction(
    connection,
    noOpenidConfig,
    sequentialIdFactory(),
    CRYPTO
  );
  assert.strictEqual(result.changed, false);
  assert(!connection.calls.some((call) => /^create-|^activate-|^upgrade-|^append-/u.test(bootstrapTag(call.sql))));
}

async function testLegacyInviteUpgrade() {
  const responses = creationResponses();
  responses['lock-legacy-super-admins'] = [{
    id: 'legacy-invited',
    name: CONFIG.name,
    student_id: CONFIG.studentId,
    openid: '',
    bind_status: 'invited'
  }];
  const connection = createConnection(responses);
  const result = await bootstrapWithinTransaction(
    connection,
    CONFIG,
    sequentialIdFactory(),
    CRYPTO
  );
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.changes.legacyAdmin, true);
  assert(connection.calls.some((call) => bootstrapTag(call.sql) === 'activate-legacy-admin'));
  assert(!connection.calls.some((call) => bootstrapTag(call.sql) === 'create-legacy-admin'));
}

async function testIdentityConflictFailsClosed() {
  const responses = creationResponses();
  responses['lock-person'] = [{
    id: 'person-conflict',
    name: '另一姓名',
    student_id: CONFIG.studentId,
    normalized_student_id: CONFIG.normalizedStudentId,
    status: 'active'
  }];
  const connection = createConnection(responses);
  await assert.rejects(
    bootstrapWithinTransaction(connection, CONFIG, sequentialIdFactory(), CRYPTO),
    (error) => error instanceof BootstrapError && error.code === 'person_identity_conflict'
  );
  assert(!connection.calls.some((call) => bootstrapTag(call.sql) === 'create-person'));
  assert(!connection.calls.some((call) => bootstrapTag(call.sql) === 'create-super-grant'));
}

async function testLegacyHrCannotBeBoundToAnotherOpenid() {
  const responses = creationResponses();
  responses['lock-legacy-user-binding'] = [{
    id: 'user-conflict',
    openid: 'another-openid',
    hr_id: 'generated-1'
  }];
  const connection = createConnection(responses);
  await assert.rejects(
    bootstrapWithinTransaction(connection, CONFIG, sequentialIdFactory(), CRYPTO),
    (error) => error instanceof BootstrapError && error.code === 'legacy_user_binding_conflict'
  );
  assert(!connection.calls.some((call) => bootstrapTag(call.sql) === 'create-legacy-user-binding'));
  assert(!connection.calls.some((call) => bootstrapTag(call.sql) === 'create-super-grant'));
}

async function testConflictRollback() {
  const responses = creationResponses();
  responses['lock-global-super-grants'] = [{
    id: 'other-grant',
    person_id: 'other-person',
    status: 'active',
    legacy_admin_id: 'other-admin'
  }];
  const connection = createConnection(responses);
  const pool = { async getConnection() { return connection; } };
  await assert.rejects(
    bootstrapSuperAdmin({
      pool,
      config: CONFIG,
      generateId: sequentialIdFactory(),
      cryptoAdapter: CRYPTO
    }),
    (error) => error instanceof BootstrapError && error.code === 'existing_super_admin_conflict'
  );
  assert.deepStrictEqual(connection.lifecycle, ['begin', 'rollback', 'release']);
  assert(connection.calls.some((call) => call.sql.includes('GET_LOCK')));
  assert(connection.calls.some((call) => call.sql.includes('RELEASE_LOCK')));
}

async function testMissingOpenidRollsBack() {
  const connection = createConnection(creationResponses());
  const pool = { async getConnection() { return connection; } };
  await assert.rejects(
    bootstrapSuperAdmin({
      pool,
      config: Object.assign({}, CONFIG, { openid: '' }),
      generateId: sequentialIdFactory(),
      cryptoAdapter: CRYPTO
    }),
    (error) => error instanceof BootstrapError && error.code === 'openid_required'
  );
  assert.deepStrictEqual(connection.lifecycle, ['begin', 'rollback', 'release']);
}

async function testSuccessfulTransaction() {
  const connection = createConnection(creationResponses());
  const pool = { async getConnection() { return connection; } };
  const result = await bootstrapSuperAdmin({
    pool,
    config: CONFIG,
    generateId: sequentialIdFactory(),
    cryptoAdapter: CRYPTO
  });
  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(connection.lifecycle, ['begin', 'commit', 'release']);
}

async function testSourceContract() {
  const entrySource = fs.readFileSync(
    path.resolve(__dirname, '../scripts/bootstrapSuperAdmin.js'),
    'utf8'
  );
  const serviceSource = fs.readFileSync(
    path.resolve(__dirname, '../scripts/bootstrapSuperAdminService.js'),
    'utf8'
  );
  assert(!entrySource.includes('inviteCode'));
  assert(!entrySource.includes('BOOTSTRAP_SECRET'));
  assert(!entrySource.includes('console.log(error'));
  assert(!serviceSource.includes('express'));
  assert(serviceSource.includes('GET_LOCK'));
  assert(serviceSource.includes('FOR UPDATE'));
  assert(serviceSource.includes("admin_level = 'super_admin'"));
}

(async () => {
  await testCreation();
  await testIdempotency();
  await testLegacyInviteUpgrade();
  await testIdentityConflictFailsClosed();
  await testLegacyHrCannotBeBoundToAnotherOpenid();
  await testConflictRollback();
  await testMissingOpenidRollsBack();
  await testSuccessfulTransaction();
  await testSourceContract();
  console.log('bootstrapSuperAdmin.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
