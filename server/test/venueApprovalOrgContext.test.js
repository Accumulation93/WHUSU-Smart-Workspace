const assert = require('assert');
const Module = require('module');

const queries = [];
let currentOrgCalls = 0;
const pool = {
  async query(sql, params) {
    queries.push({ sql, params });
    if (sql.indexOf('venue_approval_flow_steps') >= 0) {
      return [[{ id: 'step-1', flow_id: params[0], org_id: params[1] }]];
    }
    if (sql.indexOf('venue_approval_flow_step_rules') >= 0) {
      return [[{ id: 'rule-1', step_id: 'step-1', org_id: params[1] }]];
    }
    throw new Error('未预期的 SQL: ' + sql);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return pool;
  if (request === '../../../utils/orgContext') {
    return {
      async getCurrentOrgId() {
        currentOrgCalls += 1;
        return 'org-current-als';
      }
    };
  }
  if (request === './venueApprovalFlowStepRule') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const stepModel = require('../src/modules/venue/models/venueApprovalFlowStep');
Module._load = originalLoad;

async function run() {
  const explicitRows = await stepModel.getByFlowId('flow-target', 'org-target');
  assert.strictEqual(currentOrgCalls, 0, '显式组织存在时不得读取当前 ALS 组织');
  assert.strictEqual(queries.length, 2);
  assert.deepStrictEqual(queries[0].params, ['flow-target', 'org-target']);
  assert.deepStrictEqual(queries[1].params, [['step-1'], 'org-target']);
  assert.strictEqual(explicitRows[0].rules[0].org_id, 'org-target');

  queries.length = 0;
  const fallbackRows = await stepModel.getByFlowId('flow-current');
  assert.strictEqual(currentOrgCalls, 1, '旧调用方未传组织时应保持 ALS 兼容');
  assert.deepStrictEqual(queries[0].params, ['flow-current', 'org-current-als']);
  assert.strictEqual(fallbackRows[0].org_id, 'org-current-als');

  console.log('场地审批步骤显式组织上下文测试通过');
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
