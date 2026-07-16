const assert = require('assert');
const {
  hashInviteCode,
  createInviteCredential,
  canManageTarget,
  canCreateLevel
} = require('../src/core/services/adminAuthorization');

const root = { admin_level: 'root_admin' };
const superAdmin = { admin_level: 'super_admin' };
const normalAdmin = { admin_level: 'admin' };

assert.strictEqual(canCreateLevel(root, 'super_admin'), true);
assert.strictEqual(canCreateLevel(root, 'admin'), false);
assert.strictEqual(canCreateLevel(root, 'root_admin'), false);
assert.strictEqual(canCreateLevel(superAdmin, 'admin'), true);
assert.strictEqual(canCreateLevel(superAdmin, 'super_admin'), false);
assert.strictEqual(canCreateLevel(normalAdmin, 'admin'), false);

assert.strictEqual(canManageTarget(root, { admin_level: 'super_admin', org_id: 'org-44' }, 'org-44'), true);
assert.strictEqual(canManageTarget(root, { admin_level: 'admin', org_id: 'org-44' }, 'org-44'), false);
assert.strictEqual(canManageTarget(superAdmin, { admin_level: 'admin', org_id: 'org-44' }, 'org-44'), true);
assert.strictEqual(canManageTarget(superAdmin, { admin_level: 'admin', org_id: 'org-43' }, 'org-44'), false);

const invite = createInviteCredential();
assert.strictEqual(invite.inviteCode.length, 8);
assert.strictEqual(invite.inviteCodeHash, hashInviteCode(invite.inviteCode));
assert(invite.inviteExpiresAt.getTime() > invite.invitedAt.getTime());

console.log('管理员层级与邀请码安全测试通过');
