'use strict';

const assert = require('assert');
const { resolveHrBindingStates } = require('../src/core/services/userBindingStatus');

const hrRows = [
  { id: 'current-bound', student_id: '20260001', name: '当前绑定' },
  { id: 'pending', student_id: '20260002', name: '跨组织成员' },
  { id: 'unbound', student_id: '20260003', name: '尚未绑定' },
  { id: 'different-name', student_id: '20260004', name: '当前姓名' },
  { id: 'multiple-sources', student_id: '20260005', name: '多组织成员' },
  { id: 'empty-student', student_id: '', name: '没有学号' }
];

const queryCalls = [];
const bindingModel = {
  async listByHrIdsInOrg(hrIds, orgId) {
    queryCalls.push({ method: 'listByHrIdsInOrg', hrIds, orgId });
    return [{
        id: 'binding-current',
        hr_id: 'current-bound',
        openid: 'openid-current'
      }];
  },
  async listBoundIdentitiesOutsideOrg(studentIds, orgId) {
    queryCalls.push({ method: 'listBoundIdentitiesOutsideOrg', studentIds, orgId });
    return [
        { student_id: '20260001', name: '当前绑定' },
        { student_id: '20260002', name: '跨组织成员' },
        { student_id: '20260004', name: '其他姓名' },
        { student_id: '20260005', name: '多组织成员' },
        { student_id: '20260005', name: '多组织成员' }
      ];
  }
};

(async () => {
  const states = await resolveHrBindingStates(hrRows, 'org-current', bindingModel);

  assert.deepStrictEqual(states.get('current-bound'), {
    status: 'bound',
    userInfoId: 'binding-current',
    boundOpenid: 'openid-current'
  });
  assert.strictEqual(states.get('pending').status, 'pending_activation');
  assert.strictEqual(states.get('unbound').status, 'unbound');
  assert.strictEqual(states.get('different-name').status, 'unbound');
  assert.strictEqual(states.get('multiple-sources').status, 'pending_activation');
  assert.strictEqual(states.get('empty-student').status, 'unbound');
  assert.strictEqual(states.get('pending').boundOpenid, '', '待激活状态不得暴露其他组织 OpenID');
  assert.strictEqual(states.get('pending').userInfoId, '', '待激活状态不得暴露其他组织绑定 ID');
  assert.strictEqual(queryCalls.length, 2, '绑定状态必须使用批量查询，不能逐成员查询');

  console.log('跨组织用户绑定状态测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
