const assert = require('assert');
const Module = require('module');

const rows = [
  {
    id: 'scorer-a', assignment_id: 'scorer-a', membership_id: 'membership-scorer',
    legacy_hr_id: 'hr-scorer', person_id: 'person-scorer', name: '评分人', student_id: '20260001',
    assignment_kind: 'staff', department_id: 'department-a', identity_id: 'identity-scorer-a', work_group_id: ''
  },
  {
    id: 'scorer-b', assignment_id: 'scorer-b', membership_id: 'membership-scorer',
    legacy_hr_id: 'hr-scorer', person_id: 'person-scorer', name: '评分人', student_id: '20260001',
    assignment_kind: 'liaison', department_id: 'department-b', identity_id: 'identity-scorer-b', work_group_id: ''
  },
  {
    id: 'target-a', assignment_id: 'target-a', membership_id: 'membership-target',
    legacy_hr_id: 'hr-target', person_id: 'person-target', name: '被评人', student_id: '20260002',
    assignment_kind: 'staff', department_id: 'department-a', identity_id: 'identity-target', work_group_id: ''
  },
  {
    id: 'target-b', assignment_id: 'target-b', membership_id: 'membership-target',
    legacy_hr_id: 'hr-target', person_id: 'person-target', name: '被评人', student_id: '20260002',
    assignment_kind: 'liaison', department_id: 'department-b', identity_id: 'identity-target', work_group_id: ''
  }
];

let requestedRuleKey = '';
let scorerParticipant = null;
const emptyModel = {};
const mocks = {
  '../../../config/db': {
    async query(sql) {
      if (sql.includes('FROM membership_assignments ma')) return [rows];
      throw new Error('Unexpected SQL: ' + sql);
    }
  },
  '../../../core/models/department': {
    async getAll() { return [{ id: 'department-a', name: '部门甲' }, { id: 'department-b', name: '部门乙' }]; }
  },
  '../../../core/models/identity': {
    async getAll() {
      return [
        { id: 'identity-scorer-a', name: '评分身份甲' },
        { id: 'identity-scorer-b', name: '评分身份乙' },
        { id: 'identity-target', name: '被评身份' }
      ];
    }
  },
  '../../../core/models/workGroup': { async getAll() { return []; } },
  '../utils/pubCache': { async invalidate() {} },
  '../models/scoreActivity': {
    async getCurrent() {
      return { id: 'activity-1', name: '岗位评分', participant_granularity: 'person', is_paused: 0 };
    }
  },
  '../models/scoreTemplate': emptyModel,
  '../models/scoreQuestion': emptyModel,
  '../models/rateRule': {
    async getByKey(activityId, scorerKey) {
      assert.strictEqual(activityId, 'activity-1');
      requestedRuleKey = scorerKey;
      return scorerKey === 'department-b::identity-scorer-b'
        ? { id: 'rule-b', is_active: 1, allow_self_assessment: 0 }
        : null;
    },
    async getById(id) {
      return id === 'rule-b' ? { id: 'rule-b', is_active: 1, allow_self_assessment: 0 } : null;
    }
  },
  '../models/rateRuleClause': {
    async getByRuleId() {
      return [{ id: 'clause-1', scope_type: 'identity_only', target_identity_id: 'identity-target' }];
    }
  },
  '../models/clauseTemplateConfig': {
    async getByClauseIds() {
      return [{ clause_id: 'clause-1', template_id: 'template-1', weight: 1, sort_order: 1 }];
    }
  },
  '../models/scoreRecord': {
    async getByScorerParticipant(participant) {
      scorerParticipant = participant;
      return [{ target_assignment_id: 'target-a', target_id: 'hr-target' }];
    }
  },
  '../models/scoreAnswer': emptyModel,
  '../../../core/models/adminInfo': emptyModel,
  '../../../core/services/currentActor': {
    async resolveCurrentActor() {
      return {
        ok: true,
        actor: {
          type: 'user', id: 'hr-scorer', personId: 'person-scorer',
          membershipId: 'membership-scorer', assignmentId: 'scorer-b'
        }
      };
    }
  },
  '../../../utils/orgContext': { async getCurrentOrgId() { return 'org-1'; } }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const router = require('../src/modules/scoring/routes/scoring');
const scoringTaskService = require('../src/modules/scoring/services/scoringTaskService');
Module._load = originalLoad;

const layer = router.stack.find((item) => item.route && item.route.path === '/getRateTargets');
assert(layer, '缺少 getRateTargets 路由');

async function run() {
  let payload;
  await layer.route.stack[0].handle({
    openid: 'openid-1',
    headers: { 'x-role': 'user' },
    get(name) { return name === 'X-Role' ? 'user' : ''; },
    body: {}
  }, {
    json(value) { payload = value; return value; }
  });

  assert.strictEqual(payload.status, 'success', payload.message);
  assert.strictEqual(requestedRuleKey, 'department-b::identity-scorer-b');
  assert.strictEqual(scorerParticipant.assignment_id, 'scorer-b');
  assert.strictEqual(payload.currentActivity.participantGranularity, 'assignment', '评分事实与响应均固定为岗位粒度');
  assert.strictEqual(payload.targets.length, 2, '评分对象必须按岗位一岗一条');
  assert.strictEqual(payload.targets.find((item) => item.id === 'target-a').isScored, true, '旧记录应优先按 assignment id 回接');
  assert.strictEqual(payload.needsAssignmentDisambiguation, true);
  payload.targets.forEach((item) => {
    assert.strictEqual(item.needsAssignmentDisambiguation, true);
    assert.match(item.assignmentLabel, /^被评身份 · 部门[甲乙]$/);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(item, 'assignmentTitle'), false);
  });

  const activity = { id: 'activity-1', name: '岗位评分', participant_granularity: 'person', is_paused: 0 };
  const task = await scoringTaskService.getUserScoringTask(
    { id: 'hr-scorer' },
    activity,
    new Date('2026-08-22T12:00:00+08:00'),
    {
      type: 'user', id: 'hr-scorer', personId: 'person-scorer',
      membershipId: 'membership-scorer', assignmentId: 'scorer-b'
    }
  );
  assert.strictEqual(task.pendingCount, 1, '任务提醒也必须按当前岗位和目标岗位计算');
  assert.strictEqual(
    await scoringTaskService.getUserScoringTask({ id: 'hr-scorer' }, activity, new Date(), null),
    null,
    '没有当前岗位上下文时不得按 hr_info 生成评分任务'
  );

  console.log('评分当前岗位规则与多岗位响应测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
