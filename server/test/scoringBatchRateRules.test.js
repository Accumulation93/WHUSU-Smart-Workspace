'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const actualHelpers = require('../src/utils/helpers');

process.env.DB_USER = process.env.DB_USER || 'test-only';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-only';

let nextId = 1;
let failOnDepartment = '';
let state = {
  activities: [
    { id: 'activity-1', name: '活动一', org_id: 'org-1' },
    { id: 'activity-other', name: '其他活动', org_id: 'org-2' }
  ],
  departments: [
    { id: 'department-1', name: '部门一', org_id: 'org-1' },
    { id: 'department-2', name: '部门二', org_id: 'org-1' }
  ],
  identities: [
    { id: 'identity-scorer', name: '评分身份', org_id: 'org-1' },
    { id: 'identity-target', name: '被评分身份', org_id: 'org-1' }
  ],
  templates: [{ id: 'template-1' }],
  rules: [],
  clauses: [],
  configs: []
};

function cloneState(source) {
  return JSON.parse(JSON.stringify(source));
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

const connection = {
  async query(sql, params = []) {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith('SELECT id, name FROM score_activities')) {
      return [state.activities.filter((row) => row.id === params[0] && row.org_id === params[1])];
    }
    if (normalized.startsWith('SELECT id, name FROM departments')) {
      return [state.departments.filter((row) => row.id === params[0] && row.org_id === params[1])];
    }
    if (normalized.startsWith('SELECT id, name FROM identities')) {
      return [state.identities.filter((row) => row.id === params[0] && row.org_id === params[1])];
    }
    if (normalized.startsWith('SELECT id FROM identities')) {
      return [state.identities.filter((row) => row.id === params[0] && row.org_id === params[1]).map((row) => ({ id: row.id }))];
    }
    if (normalized.startsWith('SELECT id FROM score_question_templates')) {
      return [state.templates.filter((row) => row.id === params[0])];
    }
    if (normalized.startsWith('SELECT id FROM rate_target_rules WHERE id')) {
      return [state.rules.filter((row) => row.id === params[0] && row.org_id === params[1]).map((row) => ({ id: row.id }))];
    }
    if (normalized.startsWith('SELECT id FROM rate_target_rules WHERE activity_id')) {
      return [state.rules.filter((row) => row.activity_id === params[0] && row.scorer_key === params[1] && row.org_id === params[2]).map((row) => ({ id: row.id }))];
    }
    if (normalized.startsWith('SELECT id FROM rate_rule_clauses')) {
      return [state.clauses.filter((row) => row.rule_id === params[0] && row.org_id === params[1]).map((row) => ({ id: row.id }))];
    }
    if (normalized.startsWith('INSERT INTO rate_target_rules')) {
      if (params[2] === failOnDepartment) throw new Error('模拟第二条写入失败');
      state.rules.push({
        id: params[0], activity_id: params[1], scorer_department_id: params[2],
        scorer_identity_id: params[3], scorer_key: params[4], allow_self_assessment: params[5], org_id: params[6]
      });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('UPDATE rate_target_rules')) {
      if (params[1] === failOnDepartment) throw new Error('模拟第二条写入失败');
      const row = state.rules.find((item) => item.id === params[6] && item.org_id === params[7]);
      if (row) {
        row.activity_id = params[0];
        row.scorer_department_id = params[1];
        row.scorer_identity_id = params[2];
        row.scorer_key = params[3];
        row.allow_self_assessment = params[4];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (normalized.startsWith('DELETE FROM clause_template_configs')) {
      const clauseIds = Array.isArray(params[0]) ? params[0] : [params[0]];
      state.configs = state.configs.filter((row) => !clauseIds.includes(row.clause_id) || row.org_id !== params[1]);
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('DELETE FROM rate_rule_clauses')) {
      state.clauses = state.clauses.filter((row) => row.rule_id !== params[0] || row.org_id !== params[1]);
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('INSERT INTO rate_rule_clauses')) {
      state.clauses.push({ id: params[0], rule_id: params[1], scope_type: params[2], org_id: params[5] });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('INSERT INTO clause_template_configs')) {
      state.configs.push({ id: params[0], clause_id: params[1], template_id: params[3], org_id: params[8] });
      return [{ affectedRows: 1 }];
    }
    throw new Error('未处理 SQL：' + normalized);
  }
};

const database = {
  async withTransaction(callback) {
    const before = cloneState(state);
    try {
      return await callback(connection);
    } catch (error) {
      state = before;
      throw error;
    }
  },
  async query() {
    throw new Error('批量规则不得绕过事务连接');
  }
};

const mocks = {
  '../../../utils/helpers': Object.assign({}, actualHelpers, {
    generateId() { return 'generated-' + nextId++; }
  }),
  '../../../utils/dateTime': { nowMysqlUtc() { return '2026-08-30 00:00:00'; } },
  '../../../core/models/adminInfo': { async getByOpenid() { return { id: 'admin-1' }; } },
  '../models/rateRule': {},
  '../models/rateRuleClause': {},
  '../models/clauseTemplateConfig': {},
  '../../../core/models/department': {},
  '../../../core/models/identity': {},
  '../models/scoreActivity': {},
  '../models/scoreTemplate': {},
  '../models/scoreQuestion': {},
  '../services/participants': {},
  '../../../config/db': database,
  '../../../utils/orgContext': { async getCurrentOrgId() { return 'org-1'; } },
  '../../../core/services/dictionaryUsage': {
    async assertDictionaryReferences(options) {
      assert.strictEqual(options.organizationId, 'org-1');
      assert.strictEqual(options.connection, connection);
      const departmentIds = options.departmentIds || [];
      const identityIds = (options.identityCategoryIds || []).filter(Boolean);
      if (departmentIds.some((id) => !state.departments.some((row) => row.id === id && row.org_id === 'org-1'))) {
        const error = new Error('invalid_department_reference');
        error.code = 'invalid_department_reference';
        throw error;
      }
      if (identityIds.some((id) => !state.identities.some((row) => row.id === id && row.org_id === 'org-1'))) {
        const error = new Error('invalid_identity_reference');
        error.code = 'invalid_identity_reference';
        throw error;
      }
    }
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const router = require(path.resolve(__dirname, '../src/modules/scoring/routes/rules.js'));
Module._load = originalLoad;

function routeHandler(routePath) {
  const layer = router.stack.find((item) => item.route && item.route.path === routePath);
  assert(layer, '缺少路由：' + routePath);
  return layer.route.stack[0].handle;
}

async function invoke(routePath, body) {
  let payload;
  await routeHandler(routePath)({ openid: 'admin-openid', body }, {
    json(value) { payload = value; return value; }
  });
  return payload;
}

function rateRule(departmentId, overrides = {}) {
  return Object.assign({
    activityId: 'activity-1',
    scorerDepartmentId: departmentId,
    scorerIdentityId: 'identity-scorer',
    allowSelfAssessment: true,
    mode: 'replace',
    clauses: [{
      scopeType: 'identity_only',
      targetIdentityId: 'identity-target',
      templateConfigs: [{ templateId: 'template-1', weight: 1, sortOrder: 1 }]
    }]
  }, overrides);
}

(async function run() {
  let result = await invoke('/batchSaveRateRules', { rules: [] });
  assert.strictEqual(result.status, 'invalid_params');

  result = await invoke('/batchSaveRateRules', { rules: Array.from({ length: 201 }, () => rateRule('department-1')) });
  assert.strictEqual(result.status, 'batch_limit_exceeded');
  assert.match(result.message, /200/);

  result = await invoke('/batchSaveRateRules', {
    rules: [rateRule('department-1'), rateRule('department-1')]
  });
  assert.strictEqual(result.status, 'duplicate_batch_item');
  assert.strictEqual(state.rules.length, 0);

  result = await invoke('/batchSaveRateRules', { rules: [rateRule('department-1', { activityId: 'activity-other' })] });
  assert.strictEqual(result.status, 'invalid_params');
  assert.strictEqual(state.rules.length, 0, '跨组织活动不得产生规则');

  failOnDepartment = 'department-2';
  result = await invoke('/batchSaveRateRules', { rules: [rateRule('department-1'), rateRule('department-2')] });
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(state.rules.length, 0, '第二条写入失败后第一条必须回滚');
  assert.match(result.message, /未保存任何更改/);

  failOnDepartment = '';
  const request = { rules: [rateRule('department-1'), rateRule('department-2')] };
  const first = await invoke('/batchSaveRateRules', request);
  assert.strictEqual(first.status, 'success');
  assert.strictEqual(first.count, 2);
  assert.strictEqual(first.ids.length, 2);
  assert.strictEqual(state.rules.length, 2);

  const second = await invoke('/batchSaveRateRules', request);
  assert.strictEqual(second.status, 'success');
  assert.deepStrictEqual(second.ids, first.ids, 'replace 模式重复请求应复用原规则 ID');
  assert.strictEqual(state.rules.length, 2, '幂等重试不得新增重复规则');

  const single = await invoke('/saveRateRule', rateRule('department-1', {
    id: first.ids[0],
    allowSelfAssessment: false
  }));
  assert.strictEqual(single.status, 'success');
  assert.strictEqual(single.rule.allowSelfAssessment, false);
  assert.strictEqual(single.rule.scorerDepartmentId, 'department-1');
  assert.strictEqual(single.rule.scorerIdentityId, 'identity-scorer');
  assert(Array.isArray(single.rule.clauses));

  console.log('评分规则批量保存原子性、组织隔离、上限、重复项与幂等测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
