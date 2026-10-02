'use strict';

// 补充资料状态口径：必填项没填完只能保存成“未提交”，绝不能算已生效；
// 每次保存/提交都要留下提交人，导出与详情才能回答“谁在什么时候提交的”。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

function loadIsolated(relative, dependencies) {
  const filename = path.resolve(__dirname, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (name) => (Object.prototype.hasOwnProperty.call(dependencies, name)
    ? dependencies[name] : originalRequire(name));
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

function createHarness(options) {
  const settings = options || {};
  const events = [];
  const state = { record: settings.record || null };
  const connection = {};
  let directoryRows = [];

  const router = loadIsolated('../src/core/routes/hrProfile.js', {
    '../services/adminRequestContext': { resolveCurrentAdmin: async () => null },
    '../services/selfHrProfileSubject': {
      resolveSelfHrProfileSubject: async () => settings.subject || {
        status: 'success',
        hr: { id: 'hr-a', name: '甲', student_id: '20260001' },
        personId: 'person-a',
        organizationId: 'org-a'
      }
    },
    '../services/hrProfileTemplateLibrary': {},
    '../services/adminPermissions': {
      loadEffectivePermissions: async () => ({}),
      hasAnyPermission: (effective, keys) => Boolean(effective
        && (effective.permissions || effective)['hr.people']
        && keys.indexOf('hr.people') >= 0)
    },
    '../services/userBindingStatus': { resolveHrBindingStates: async () => new Map() },
    '../services/hrDomainPolicy': { countUserCharacters: (value) => Array.from(String(value || '')).length },
    '../models/hrInfo': {
      getById: async () => ({ id: 'hr-a', name: '甲', student_id: '20260001' }),
      getByIdIncludingFormer: async () => ({
        id: 'hr-a', name: '甲', student_id: '20260001', person_id: 'person-a', membership_status: 'active'
      }),
      getMembershipDirectory: async () => directoryRows,
      getActiveByPersonIdInOrg: async () => ({ id: 'hr-a', name: '甲', student_id: '20260001' })
    },
    '../models/department': { getAll: async () => [] },
    '../models/identity': { getAll: async () => [] },
    '../models/workGroup': { getAll: async () => [] },
    '../models/hrProfileTemplate': { getByTemplateKey: async () => ({ id: 'template-a', edit_mode: settings.editMode || 'direct' }) },
    '../models/hrProfileField': {
      getByTemplateId: async () => [
        { id: 'field-required', label: '必填项', type: 'text', required: 1 },
        { id: 'field-optional', label: '选填项', type: 'text', required: 0 }
      ]
    },
    '../models/hrProfileRecord': {
      getByHrId: async () => state.record,
      getAll: async () => [],
      create: async (id, data) => {
        events.push(['record-create', data.auditStatus, data.reviewedAt || null]);
        state.record = { id, audit_status: data.auditStatus };
      },
      update: async (id, data) => {
        events.push(['record-update', data.auditStatus, data.reviewedAt || null]);
        state.record = Object.assign({}, state.record, { audit_status: data.auditStatus });
      }
    },
    '../models/hrProfileValue': {
      getByRecordIdAndPending: async (id, pending) => (pending
        ? (settings.pendingRows || [])
        : (settings.effectiveRows || [])),
      getByRecordIdsAndPending: async () => [],
      removeByRecordIdAndPendingFields: async () => {},
      create: async () => {},
      createMany: async (rows) => {
        events.push(['values-batch', rows.length]);
        return rows.length;
      }
    },
    '../models/hrProfileReviewEvent': {
      create: async (data) => events.push(['event', data.action, data.reviewerPersonId || '']),
      listByRecordId: async () => [],
      getLatestSubmissions: async () => settings.submissions || { self: null, admin: null },
      listLatestSubmissionsByRecordIds: async () => new Map()
    },
    '../models/personIdentityOverview': {},
    '../models/unifiedIdentity': {
      lockActiveBusinessSubjects: async () => {},
      listDirectoryAssignmentSummaries: async () => new Map()
    },
    '../../modules/audit/utils/notificationHelper': { createNotification: async () => {} },
    '../../utils/orgContext': { getCurrentOrgId: async () => 'org-a' },
    '../../config/db': { withTransaction: async (callback) => callback(connection) }
  });

  async function request(endpoint, req) {
    const layer = router.stack.find((item) => item.route && item.route.path === '/' + endpoint);
    assert(layer, '缺少接口 ' + endpoint);
    let result = null;
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return this; },
      json(value) { result = value; return this; }
    };
    await layer.route.stack[0].handle(req, res);
    return { result, statusCode };
  }

  return {
    events,
    state,
    request,
    setDirectoryRows(rows) { directoryRows = rows; }
  };
}

const adminReq = (profileValues) => ({
  admin: { personId: 'person-admin', id: 'admin-1' },
  adminPermissions: { permissions: { 'hr.people': true } },
  authAccount: { personId: 'person-admin' },
  authContext: { role: 'admin', contextId: 'context-admin', organizationId: 'org-a', personId: 'person-admin' },
  body: { hrId: 'hr-a', name: '甲', studentId: '20260001', profileValues }
});

const userReq = (values) => ({
  authAccount: { id: 'account-a', personId: 'person-a' },
  authContext: { role: 'user', contextId: 'context-a', organizationId: 'org-a', personId: 'person-a' },
  body: { values }
});

async function run() {
  // 管理员空着必填项保存：可以保存，但状态必须是未提交，且不留审核通过时间。
  let harness = createHarness();
  let response = await harness.request('saveHrPersonFull', adminReq({
    'field-required': '',
    'field-optional': '有值'
  }));
  assert.strictEqual(response.result.status, 'success');
  assert.deepStrictEqual(harness.events[0], ['record-create', 'none', null]);
  assert.deepStrictEqual(harness.events[1], ['values-batch', 2], '资料值必须一次批量写入');
  assert.ok(
    harness.events.some((item) => item[0] === 'event' && item[1] === 'maintained' && item[2] === 'person-admin'),
    '管理员维护必须记录提交人'
  );

  // 必填项齐全才算已生效。
  harness = createHarness();
  response = await harness.request('saveHrPersonFull', adminReq({
    'field-required': '有值',
    'field-optional': ''
  }));
  assert.strictEqual(response.result.status, 'success');
  assert.strictEqual(harness.events[0][0], 'record-create');
  assert.strictEqual(harness.events[0][1], 'approved');
  assert.ok(harness.events[0][2], '生效时必须写入审核通过时间');

  // 已有待审核提交时，管理员维护不得把状态改成已生效或未提交。
  harness = createHarness({
    record: { id: 'record-a', audit_status: 'pending', rejection_reason: '' },
    pendingRows: [{ field_id: 'field-required', field_value: '待审值' }]
  });
  response = await harness.request('saveHrPersonFull', adminReq({
    'field-required': '有值',
    'field-optional': '有值'
  }));
  assert.strictEqual(response.result.status, 'success');
  assert.strictEqual(harness.events[0][1], 'pending', '待审核提交必须保持待审核');

  // 本人提交本来就要求必填齐全：缺必填直接拒绝，不会写库也不留事件。
  harness = createHarness();
  response = await harness.request('submitUserHrProfile', userReq({
    'field-required': '',
    'field-optional': '有值'
  }));
  assert.strictEqual(response.result.status, 'invalid_params');
  assert.deepStrictEqual(harness.events, [], '缺必填的本人提交不得落库');

  // 必填齐全时本人提交才算生效，并留下本人提交事件。
  harness = createHarness();
  response = await harness.request('submitUserHrProfile', userReq({
    'field-required': '有值',
    'field-optional': ''
  }));
  assert.strictEqual(response.result.status, 'success');
  assert.strictEqual(harness.events[0][1], 'approved');
  assert.deepStrictEqual(harness.events[1], ['values-batch', 2], '本人提交的资料值必须一次批量写入');
  assert.ok(
    harness.events.some((item) => item[0] === 'event' && item[1] === 'submitted' && item[2] === 'person-a'),
    '本人提交必须记录提交人'
  );

  // 待审核模式下本人提交仍然是待审核。
  harness = createHarness({ editMode: 'audit' });
  response = await harness.request('submitUserHrProfile', userReq({
    'field-required': '有值',
    'field-optional': ''
  }));
  assert.strictEqual(response.result.status, 'success');
  assert.strictEqual(harness.events[0][1], 'pending');

  // 详情接口必须分别回报本人提交与管理员维护，两者互不覆盖。
  harness = createHarness({
    record: { id: 'record-a', audit_status: 'approved', updated_at: '2026-10-02 05:05:41' },
    effectiveRows: [{ field_id: 'field-required', field_value: '有值' }],
    submissions: {
      self: {
        record_id: 'record-a',
        action: 'submitted',
        created_at: '2026-09-20 02:00:00',
        reviewer_person_id: 'person-a',
        reviewer_name: '甲'
      },
      admin: {
        record_id: 'record-a',
        action: 'maintained',
        created_at: '2026-10-02 05:05:41',
        reviewer_person_id: 'person-admin',
        reviewer_name: '王管理员'
      }
    }
  });
  response = await harness.request('getHrPersonDetail', Object.assign(adminReq({}), {
    body: { hrId: 'hr-a' }
  }));
  assert.strictEqual(response.result.status, 'success');
  assert.strictEqual(response.result.selfSubmittedAt, '2026-09-20 02:00:00');
  assert.strictEqual(response.result.selfSubmittedByName, '甲');
  assert.strictEqual(response.result.maintainedAt, '2026-10-02 05:05:41');
  assert.strictEqual(response.result.maintainedByName, '王管理员');
  assert.strictEqual(response.result.lastChangedAt, '2026-10-02 05:05:41');

  // 旧数据带着“已生效”但必填是空的：对外必须显示未提交，不能再算生效。
  harness = createHarness({
    record: {
      id: 'record-a',
      audit_status: 'approved',
      reviewed_at: '2026-09-30 03:00:00',
      updated_at: '2026-09-30 03:00:00'
    }
  });
  response = await harness.request('getHrPersonDetail', Object.assign(adminReq({}), {
    body: { hrId: 'hr-a' }
  }));
  assert.strictEqual(response.result.status, 'success');
  assert.strictEqual(response.result.auditStatus, 'none', '必填为空的历史记录不能显示已生效');
  assert.strictEqual(response.result.auditStatusText, '未提交');
  assert.strictEqual(response.result.isComplete, false);
  // 没有提交事件时两组都留空，只给“资料最后变更时间”，不猜提交人。
  assert.strictEqual(response.result.selfSubmittedAt, null);
  assert.strictEqual(response.result.maintainedAt, null);
  assert.strictEqual(response.result.maintainedByName, '');
  assert.strictEqual(response.result.lastChangedAt, '2026-09-30 03:00:00');

  // 必填齐全的历史记录仍然显示已生效。
  harness = createHarness({
    record: { id: 'record-a', audit_status: 'approved' },
    effectiveRows: [{ field_id: 'field-required', field_value: '有值' }]
  });
  response = await harness.request('getHrPersonDetail', Object.assign(adminReq({}), {
    body: { hrId: 'hr-a' }
  }));
  assert.strictEqual(response.result.auditStatus, 'approved');

  // 管理员列表导出同口径：缺必填的旧记录按未提交下发。
  harness = createHarness({
    record: { id: 'record-a', audit_status: 'approved' }
  });
  harness.setDirectoryRows([{ id: 'hr-a', person_id: 'person-a', name: '甲', student_id: '20260001' }]);
  response = await harness.request('listHrProfileAdminData', Object.assign(adminReq({}), { body: {} }));
  assert.strictEqual(response.result.status, 'success');
  assert.strictEqual(response.result.rows[0].auditStatus, 'none');
  assert.strictEqual(response.result.rows[0].auditStatusText, '未提交');
  assert.strictEqual(response.result.rows[0].selfSubmittedAt, null);
  assert.strictEqual(response.result.rows[0].maintainedAt, null);
  assert.strictEqual(response.result.rows[0].lastChangedAt, null);

  // 表格导入同样是管理员维护：源码契约锁定“写事件 + 记录操作人 + 缺必填按未提交”。
  const importSource = fs.readFileSync(path.resolve(__dirname, '../src/core/models/hrTableImport.js'), 'utf8');
  assert.match(importSource, /INSERT INTO hr_profile_review_events/, '导入必须写入资料维护事件');
  assert.match(importSource, /'maintained', \?, \?, \?, \?/, '导入事件必须是管理员维护并带操作人');
  assert.match(importSource, /safeString\(actor && actor\.personId\)/);
  assert.match(importSource, /auditStatus = 'none'/, '导入缺必填只能记未提交');
  const hrRouteSource = fs.readFileSync(path.resolve(__dirname, '../src/core/routes/hr.js'), 'utf8');
  assert.match(hrRouteSource, /importHrTable\(req\.body, orgId, actor\)/, '导入路由必须把操作管理员传进模型');

  console.log('补充资料状态与提交信息回归通过：必填未填完=未提交、待审保留、提交人留痕');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
