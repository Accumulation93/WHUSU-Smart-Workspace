const assert = require('assert');
const {
  hashInviteCode,
  createInviteCredential,
  canViewTarget,
  canManageTarget,
  canCreateLevel,
  canDeleteTarget
} = require('../src/core/services/adminAuthorization');

const superAdmin = { id: 'super-self', admin_level: 'super_admin', org_id: '' };
const regularAdmin = { id: 'admin-self', admin_level: 'admin', org_id: 'org-44' };
const peerSuper = { id: 'super-peer', admin_level: 'super_admin', org_id: '', bind_status: 'active' };
const invitedSuper = { id: 'super-invited', admin_level: 'super_admin', org_id: '', bind_status: 'invited' };
const peerRegular = { id: 'admin-peer', admin_level: 'admin', org_id: 'org-44' };
const otherRegular = { id: 'admin-other', admin_level: 'admin', org_id: 'org-43' };

assert.strictEqual(canCreateLevel(superAdmin, 'super_admin'), true);
assert.strictEqual(canCreateLevel(superAdmin, 'admin'), true);
assert.strictEqual(canCreateLevel(regularAdmin, 'admin'), true);
assert.strictEqual(canCreateLevel(regularAdmin, 'super_admin'), false);
assert.strictEqual(canCreateLevel(regularAdmin, 'root_admin'), false);

assert.strictEqual(canViewTarget(superAdmin, peerSuper, 'org-44'), true);
assert.strictEqual(canViewTarget(superAdmin, peerRegular, 'org-44'), true);
assert.strictEqual(canManageTarget(superAdmin, peerSuper, 'org-44'), true);
assert.strictEqual(canManageTarget(superAdmin, peerRegular, 'org-44'), true);
assert.strictEqual(canManageTarget(superAdmin, superAdmin, 'org-44'), false);
assert.strictEqual(canManageTarget(superAdmin, otherRegular, 'org-44'), false);
assert.strictEqual(canManageTarget(regularAdmin, peerRegular, 'org-44'), true);
assert.strictEqual(canManageTarget(regularAdmin, regularAdmin, 'org-44'), false);
assert.strictEqual(canManageTarget(regularAdmin, peerSuper, 'org-44'), false);
assert.strictEqual(canManageTarget(regularAdmin, otherRegular, 'org-44'), false);
assert.strictEqual(canDeleteTarget(superAdmin, peerSuper, 'org-44', 1), false);
assert.strictEqual(canDeleteTarget(superAdmin, peerSuper, 'org-44', 2), true);
assert.strictEqual(canDeleteTarget(superAdmin, invitedSuper, 'org-44', 1), true);
assert.strictEqual(canDeleteTarget(superAdmin, superAdmin, 'org-44', 2), false);
assert.strictEqual(canDeleteTarget(regularAdmin, peerRegular, 'org-44', 0), true);

const invite = createInviteCredential();
assert.strictEqual(invite.inviteCode.length, 8);
assert.strictEqual(invite.inviteCodeHash, hashInviteCode(invite.inviteCode));
assert(invite.inviteExpiresAt.getTime() > invite.invitedAt.getTime());

console.log('两级管理员层级与邀请码安全测试通过');
