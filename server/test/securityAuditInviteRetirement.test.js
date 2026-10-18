'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'scripts/security-audit.js'), 'utf8');
const start = source.indexOf("requireSourceContract('server/src/core/models/adminInfo.js'");
const end = source.indexOf("requireSourceContract('server/src/core/routes/admin.js'", start);
let check;
vm.runInNewContext(source.slice(start, end), {
  requireSourceContract(file, rules) { check = rules.find(rule => rule.rule === 'legacy-admin-invite-retired').test; }
});
const model = fs.readFileSync(path.join(root, 'server/src/core/models/adminInfo.js'), 'utf8');
assert.equal(check(model), true);
for (const token of ['updateInvite', 'invite_code', 'invited_at', 'invite_expires_at', 'invite_consumed_at']) {
  assert.equal(check(model + '\nconst ' + token + ' = true;'), false, token);
}
console.log('邀请码退役安全检查：当前模型通过，5 类旧能力回归均拒绝');
