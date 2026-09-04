const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../src/modules/audit/routes/auditSignature.js'),
  'utf8'
);

assert(source.includes("require('../../../core/models/unifiedIdentity')"));
assert(source.includes('async function withLockedSignatureOwner'));
assert(source.includes('return pool.withTransaction(async (connection) =>'));
assert(source.includes('unifiedIdentityModel.lockActiveBusinessSubjects(connection'));
assert(source.includes('legacyHrId: safeString(actorResult.actor.id)'));
assert(source.includes('organizationId: orgId'));
assert(source.includes('assignmentId: safeString(actorResult.actor.assignmentId)'));
assert(source.includes('resolveActorAssignmentForUpdate(actorResult.actor, orgId, connection)'));

const writeCalls = source.match(/await withLockedSignatureOwner\(req,/g) || [];
assert.strictEqual(writeCalls.length, 3, '签名保存、删除和设为默认都必须进入同一删除屏障事务');
const lockedRows = source.match(/FROM signature_templates[^`'\n]*FOR UPDATE/g) || [];
assert.strictEqual(lockedRows.length, 3, '三个签名写入口都必须锁定目标签名记录');
assert(source.includes('connection.query(\n        `INSERT INTO signature_templates'));
assert(source.includes("connection.query(\n        'DELETE FROM signature_templates"));

console.log('签名 CRUD 人员删除屏障契约测试通过');
