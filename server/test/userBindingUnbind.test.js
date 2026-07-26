'use strict';

const assert = require('assert');
const { unbindUserAcrossOrganizations } = require('../src/core/services/userBindingUnbind');

(async () => {
  const connection = { marker: 'transaction' };
  const calls = [];
  const bindingModel = {
    async lockByHrIdInOrg(hrId, orgId, db) {
      calls.push(['lockCurrent', hrId, orgId, db]);
      return [
        { id: 'current-1', openid: 'wx-one', org_id: orgId },
        { id: 'current-duplicate', openid: 'wx-one', org_id: orgId }
      ];
    },
    async lockByOpenidsGlobal(openids, db) {
      calls.push(['lockGlobal', openids, db]);
      return [
        { id: 'current-1', openid: 'wx-one', org_id: 'org-current' },
        { id: 'other-1', openid: 'wx-one', org_id: 'org-other' }
      ];
    },
    async removeByOpenidsGlobal(openids, db) {
      calls.push(['removeGlobal', openids, db]);
      return 2;
    }
  };

  const result = await unbindUserAcrossOrganizations({
    hrId: 'hr-current',
    orgId: 'org-current',
    connection,
    bindingModel
  });
  assert.deepStrictEqual(result, {
    openids: ['wx-one'],
    affectedCount: 2,
    affectedOrganizationIds: ['org-current', 'org-other']
  });
  assert.strictEqual(calls[0][3], connection);
  assert.deepStrictEqual(calls[1][1], ['wx-one']);
  assert.deepStrictEqual(calls[2][1], ['wx-one']);

  const missing = await unbindUserAcrossOrganizations({
    hrId: 'hr-unbound',
    orgId: 'org-current',
    connection,
    bindingModel: Object.assign({}, bindingModel, {
      async lockByHrIdInOrg() { return []; }
    })
  });
  assert.strictEqual(missing, null);

  console.log('普通用户跨组织微信解绑测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
