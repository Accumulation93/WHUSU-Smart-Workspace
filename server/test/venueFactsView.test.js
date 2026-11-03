'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVenueFactsView } = require('../../shared/venueFactsView');
const copy = require('../../shared/locales/zh-CN/venueFacts');
const statuses = require('../../shared/locales/zh-CN/generated/subpackages/venue/utils/venueBookingDetail');
const occupied = require('../../shared/locales/zh-CN/generated/subpackages/venue/pages/venueBooking/venueBooking').copy_a1f843d887;
const view = createVenueFactsView(copy, statuses, occupied);

test('场地六类读取入口保留业务事实，替换服务端系统说明且不改原响应', () => {
  const record = { id: 'booking', title: '用户填写标题', description: '用户填写意见', creatorName: '不应显示的后端句子',
    creatorLabel: '不应显示的后端说明', creatorAssignmentLabel: '后端岗位提示',
    displayFacts: { creatorType: 'user', creatorName: '张某', assignmentLabel: '负责人 · 部门', venueName: '会议室' } };
  for (const [name, key] of [['listAllVenueBookings','bookings'], ['listMyVenueBookings','bookings'],
    ['listPendingVenueApprovals','pending'], ['listVenueApprovalHistory','history']]) {
    const row = view.response(name, { status: 'success', [key]: [record] })[key][0];
    assert.equal(row.creatorName, '张某'); assert.equal(row.creatorLabel, copy.creatorUser);
    assert.equal(row.creatorAssignmentLabel, '负责人 · 部门'); assert.equal(row.title, record.title);
    assert.equal(row.description, record.description); assert.equal(row.venueName, '会议室');
  }
  assert.equal(view.response('getVenueApprovalHistoryDetail', {status:'success',detail:record}).detail.userName, '张某');
  assert.equal(view.response('getVenueSchedule', {status:'success',dailySchedules:[{bookedSlots:[record]}]}).dailySchedules[0].bookedSlots[0].userName, '张某');
  assert.equal(record.creatorName, '不应显示的后端句子');
});

test('未知和匿名记录不猜身份，姓名缺失不叠岗位提示，历史事件使用本地缺失说明', () => {
  const row = view.booking({ creatorName:'伪造管理员',creatorLabel:'后端系统说明',creatorAssignmentLabel:'旧提示',
    approvalProgress:{flowSteps:[{stepIndex:0,displayFacts:{stepName:''}}],events:[{displayFacts:{approverName:''}}]} });
  assert.equal(row.creatorName, copy.nameMissing); assert.equal(row.creatorLabel, copy.creatorUnknown);
  assert.equal(row.creatorAssignmentLabel, '');
  assert.equal(row.approvalProgress.flowSteps[0].stepName, copy.defaultStepName(1));
  assert.equal(row.approvalProgress.flowSteps[0].approverName, undefined);
  assert.equal(row.approvalProgress.events[0].stepName, copy.stepNameMissing);
  assert.equal(row.approvalProgress.events[0].approverName, copy.approverMissing);
  assert.equal(row.approvalProgress.events[0].approverAssignmentLabel, '');
  const admin = view.booking({approvalProgress:{events:[{stepIndex:2,displayFacts:{approverType:'admin',approverName:'李某'}}]}});
  assert.equal(admin.approvalProgress.events[0].approverAssignmentLabel, '');
  assert.equal(admin.approvalProgress.events[0].stepName, copy.defaultStepName(3));
  const anonymous = view.booking({creatorType:'anonymous',visibility:'busy',title:'后端提示'});
  assert.equal(anonymous.title, occupied); assert.equal(anonymous.userName, '');
  const unrelated = {status:'success',title:'业务原文'};
  assert.equal(view.response('getSubmissionDetail',unrelated),unrelated);
});
