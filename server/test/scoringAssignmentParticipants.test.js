const assert = require('assert');
const Module = require('module');

const assignmentRows = [
  {
    id: 'assignment-a', assignment_id: 'assignment-a', membership_id: 'membership-1',
    legacy_hr_id: 'hr-1', person_id: 'person-1', name: '成员甲', student_id: '20260001',
    assignment_kind: 'staff', department_id: 'department-a', identity_id: 'identity-a',
    work_group_id: 'work-group-a', status: 'active'
  },
  {
    id: 'assignment-b', assignment_id: 'assignment-b', membership_id: 'membership-1',
    legacy_hr_id: 'hr-1', person_id: 'person-1', name: '成员甲', student_id: '20260001',
    assignment_kind: 'liaison', department_id: 'department-b', identity_id: 'identity-b',
    work_group_id: '', status: 'active'
  },
  {
    id: 'assignment-c', assignment_id: 'assignment-c', membership_id: 'membership-2',
    legacy_hr_id: 'hr-2', person_id: 'person-2', name: '成员乙', student_id: '20260002',
    assignment_kind: 'staff', department_id: 'department-a', identity_id: 'identity-a',
    work_group_id: '', status: 'active'
  }
];

const queries = [];
const pool = {
  async query(sql, params) {
    queries.push({ sql, params });
    return [assignmentRows];
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return pool;
  return originalLoad.call(this, request, parent, isMain);
};
const participants = require('../src/modules/scoring/services/participants');
Module._load = originalLoad;

async function run() {
  assert.strictEqual(participants.normalizeGranularity('person'), 'assignment', '评分事实不得切回自然人粒度');
  assert.strictEqual(participants.normalizeGranularity('assignment'), 'assignment');

  const personModeRows = await participants.listParticipants('org-1', 'person');
  assert.strictEqual(personModeRows.length, 3);
  assert.match(queries[0].sql, /FROM membership_assignments ma/);
  assert.doesNotMatch(queries[0].sql, /FROM hr_info/);
  assert.doesNotMatch(queries[0].sql, /assignment_title|ma\.title/i);
  assert.deepStrictEqual(queries[0].params, ['org-1']);

  const selected = await participants.resolveActorParticipant('org-1', {
    assignmentId: 'assignment-b', personId: 'person-1', membershipId: 'membership-1'
  }, 'person');
  assert.strictEqual(selected.assignment_id, 'assignment-b', '评分者必须命中当前选择岗位');
  assert.strictEqual(
    await participants.resolveActorParticipant('org-1', { id: 'hr-1', personId: 'person-1' }, 'person'),
    null,
    '缺少当前岗位时不得回退到 hr_info 身份'
  );
  assert.strictEqual(
    await participants.resolveActorParticipant('org-1', {
      assignmentId: 'assignment-b', personId: 'person-2', membershipId: 'membership-1'
    }, 'person'),
    null,
    '岗位与自然人不一致时必须拒绝'
  );

  assert.strictEqual((await participants.resolveParticipant('org-1', 'assignment-a', 'person')).id, 'assignment-a');
  assert.strictEqual(
    await participants.resolveParticipant('org-1', 'hr-1', 'person'),
    null,
    '旧 hr id 对应多个岗位时不得任意选择一个岗位'
  );
  assert.strictEqual((await participants.resolveParticipant('org-1', 'hr-2', 'person')).id, 'assignment-c');

  assert.strictEqual(participants.participantSubjectKey(assignmentRows[0], 'person'), 'assignment:assignment-a');
  assert.strictEqual(participants.participantRecordId({
    target_assignment_id: 'assignment-a', target_id: 'hr-1'
  }, 'target', 'person'), 'assignment-a');
  const resolveRecordParticipantId = participants.createRecordParticipantResolver(assignmentRows);
  assert.strictEqual(resolveRecordParticipantId({ target_assignment_id: 'assignment-b' }, 'target'), 'assignment-b');
  assert.strictEqual(
    resolveRecordParticipantId({ target_person_id: 'person-2', target_id: 'hr-2' }, 'target'),
    '',
    '旧记录即使当前仅有一个岗位也不得反推历史岗位'
  );
  assert.strictEqual(
    resolveRecordParticipantId({ target_subject_key: 'assignment:assignment-c' }, 'target'),
    'assignment-c',
    '显式岗位主题键可以作为不可变岗位事实'
  );
  assert.strictEqual(
    resolveRecordParticipantId({ target_person_id: 'person-1', target_id: 'hr-1' }, 'target'),
    '',
    '旧记录面对多个岗位时不得任意归属'
  );

  const normalized = assignmentRows.map((item) => ({
    id: item.id,
    assignmentId: item.assignment_id,
    assignmentKind: item.assignment_kind,
    personId: item.person_id,
    departmentId: item.department_id,
    department: item.department_id,
    identityId: item.identity_id,
    identity: item.identity_id,
    workGroupId: item.work_group_id,
    workGroup: item.work_group_id
  }));
  const presentation = participants.decorateAssignmentDisambiguation(normalized);
  assert.strictEqual(presentation.needsAssignmentDisambiguation, true);
  assert.strictEqual(presentation.rows[0].needsAssignmentDisambiguation, true);
  assert.strictEqual(presentation.rows[0].assignmentLabel, 'identity-a · department-a · work-group-a');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(presentation.rows[2], 'assignmentLabel'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(presentation.rows[2], 'needsAssignmentDisambiguation'), false);

  const historicalSnapshot = {
    assignmentId: 'assignment-a',
    personId: 'person-1',
    legacyHrId: 'hr-1',
    name: '历史姓名',
    studentId: '20260001',
    assignmentNature: 'staff',
    departmentId: 'department-old',
    department: '原部门',
    identityCategoryId: 'identity-old',
    identityCategory: '原身份',
    workGroupId: 'work-group-old',
    workGroup: '原职能组'
  };
  const historical = participants.resolveHistoricalParticipant({
    target_id: 'hr-1',
    target_assignment_id: 'assignment-a',
    target_context_snapshot: JSON.stringify(historicalSnapshot)
  }, 'target', [Object.assign({}, normalized[0], {
    departmentId: 'department-new', department: '新部门',
    identityId: 'identity-new', identity: '新身份'
  })]);
  assert.strictEqual(historical.assignmentId, 'assignment-a');
  assert.strictEqual(historical.department, '原部门', '历史展示必须优先不可变岗位快照');
  assert.strictEqual(historical.identityCategory, '原身份');
  assert.strictEqual(historical.assignmentLabel, '原身份 · 原部门 · 原职能组');
  assert.strictEqual(historical.historicalAssignmentUnavailable, false);
  const unavailableHistory = participants.resolveHistoricalParticipant({
    target_id: 'hr-1',
    target_assignment_id: 'assignment-a'
  }, 'target', [Object.assign({}, normalized[0], {
    department: '当前部门', identity: '当前身份', workGroup: '当前职能组'
  })]);
  assert.strictEqual(unavailableHistory.assignmentId, 'assignment-a');
  assert.strictEqual(unavailableHistory.historicalAssignmentUnavailable, true);
  assert.strictEqual(unavailableHistory.assignmentLabel, '');
  assert.strictEqual(unavailableHistory.department, '', '缺失快照时不得用当前岗位冒充历史岗位');
  assert.strictEqual(unavailableHistory.identityCategory, '');
  assert.strictEqual(
    participants.resolveHistoricalParticipant({
      scorer_id: 'hr-departed',
      scorer_assignment_id: 'assignment-departed',
      scorer_context_snapshot: JSON.stringify(Object.assign({}, historicalSnapshot, {
        assignmentId: 'assignment-departed', name: '已离任成员'
      }))
    }, 'scorer', []).name,
    '已离任成员',
    '成员离任后仍须从快照恢复历史评分人'
  );
  const snapshot = participants.buildAssignmentSnapshot(Object.assign({}, assignmentRows[0], {
    department: '部门甲', identity: '身份甲', work_group: '职能组甲'
  }));
  assert.strictEqual(snapshot.workGroup, '职能组甲');
  assert.strictEqual(snapshot.assignmentLabel, '身份甲 · 部门甲 · 职能组甲');

  console.log('评分参与者岗位化与重复人员标记测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
