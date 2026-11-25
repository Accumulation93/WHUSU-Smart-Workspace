'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { CATALOG } = require('../../src/core/services/authorizationCatalog');
const { normalizePolicy } = require('../../src/core/services/authorizationPolicy');

// 仅供明确的旧协议隔离夹具。先证明现行入口拒绝，再保存历史策略，不能用它绕过生产写入约束。
module.exports = async function seedHistoricalBusinessAuthorizationRule(pool, { name, policy, model, guard, read }) {
  const [[database]] = await pool.query('SELECT DATABASE() AS databaseName');
  assert.match(database.databaseName, /^whusu_submit_\d+_\d+$/);
  assert.equal(database.databaseName, process.env.DB_NAME);
  assert.equal(await require('../../src/core/models/authorizationIdentityTransition').isUnified(pool), false);
  assert(policy.capabilities.some(key => CATALOG.get(key)?.businessOnly));
  const organizationId = 'submit-a';
  const before = await read();
  await assert.rejects(model.saveRule({ name, policy, expectedRevision: before.revision }, organizationId, guard),
    error => error.code === 'authorization_forbidden');
  assert.deepEqual(await read(), before);
  const id = randomUUID();
  const normalized = normalizePolicy({ ...policy, id, organizationId }, CATALOG);
  await pool.withTransaction(async connection => {
    await model.lockOrganization(connection, organizationId);
    await connection.query(`INSERT INTO authorization_rules(id,org_id,name,policy_json,source_kind)
      VALUES(?,?,?,?,?)`, [id, organizationId, name.trim(), JSON.stringify(normalized), 'historical_test_fixture']);
  });
  const saved = (await read()).rules.find(rule => rule.id === id);
  assert(saved);
  assert.equal(saved.sourceKind, 'historical_test_fixture');
  assert.deepEqual(saved.policy, normalized);
  return saved;
};
