'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/audit/routes/auditUser.js'),
  'utf8'
);
const stepModelSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/audit/models/auditSubmissionStep.js'),
  'utf8'
);
const fileModelSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/audit/models/auditSubmissionFile.js'),
  'utf8'
);

const detailRoute = routeSource.slice(
  routeSource.indexOf("router.post('/getAuditSubmissionDetail'"),
  routeSource.indexOf('// Approval Actions')
);
const authorizationHelper = routeSource.slice(
  routeSource.indexOf('async function checkStepAuthorization'),
  routeSource.indexOf('// approveStep')
);
const updateRoute = routeSource.slice(
  routeSource.indexOf("router.post('/updateAuditSubmission'"),
  routeSource.indexOf("router.post('/resubmitAudit'")
);
const resubmitRoute = routeSource.slice(
  routeSource.indexOf("router.post('/resubmitAudit'"),
  routeSource.indexOf("router.post('/withdrawSubmission'")
);

assert(!authorizationHelper.includes('getTemplateStepConditions')
  && !authorizationHelper.includes('approver_identity_id')
  && authorizationHelper.includes('snapshotValid: false'),
'审批动作只能使用步骤不可变条件快照，缺失快照必须明确失败关闭');
assert(!detailRoute.includes('audit_flow_template_step_conditions')
  && !detailRoute.includes('templateConditionMap'),
'历史详情判权不得读取当前模板条件');
assert(!stepModelSource.includes('_batchLoadTemplateConditions')
  && /if \(!row\.step_conditions_json\) continue;/.test(stepModelSource),
'待办查询不得因模板后改而给旧申请重新授权');
assert(routeSource.includes("status: 'historical_snapshot_missing'")
  && routeSource.includes('localeCopy.historicalApprovalSnapshotMissing'),
'缺失历史快照必须返回可识别错误，不能伪装成普通无权限');

const updateTransaction = updateRoute.indexOf('await conn.beginTransaction()');
const updateRowLock = updateRoute.indexOf('submissionModel.getByIdForUpdate(submissionId, conn)');
const updateWrite = updateRoute.indexOf('submissionModel.update(submissionId');
assert(updateTransaction >= 0 && updateRowLock > updateTransaction && updateWrite > updateRowLock,
  '编辑必须先开启事务并锁定申请，再写入编辑内容');
assert(updateRoute.includes("const editedRound = preserveHistoricalEvidence ? 0 : 1")
  && updateRoute.includes("status: preserveHistoricalEvidence ? 'draft' : 'pending'"),
  '驳回或撤回后的编辑只能保存 round=0 的草稿步骤，不能创建正式审批轮次');
assert(updateRoute.includes('DELETE FROM audit_submission_steps')
  && updateRoute.includes("round = 0 AND status = 'draft'"),
  '每次编辑必须替换上一版草稿步骤，连续编辑不能累积多套待重提配置');
assert(!updateRoute.includes("SET status = 'superseded'"),
  '编辑阶段不得提前改写旧正式轮次的待办状态');
assert(updateRoute.includes('preserveHistoricalEvidence ? 0 : 1')
  && updateRoute.includes('submissionFileModel.setCurrentRevisionRound'),
  '编辑上传的新附件必须先作为未绑定正式轮次的草稿修订保存');

const resubmitTransaction = resubmitRoute.indexOf('await conn.beginTransaction()');
const resubmitRowLock = resubmitRoute.indexOf('submissionModel.getByIdForUpdate(submissionId, conn)');
const resubmitStepLock = resubmitRoute.indexOf('submissionStepModel.getBySubmissionIdForUpdate(submissionId, conn)');
assert(resubmitTransaction >= 0 && resubmitRowLock > resubmitTransaction && resubmitStepLock > resubmitRowLock,
  '重提必须在同一事务中锁定申请和全部步骤以原子确定唯一轮次');
assert(resubmitRoute.includes('if (Number(allSteps[ri].round) > 0)')
  && resubmitRoute.includes('const newRound = maxExistingRound + 1'),
  '正式新轮次必须忽略 round=0 草稿并严格递增');
assert(resubmitRoute.includes("Number(step.round) === 0 && safeString(step.status) === 'draft'")
  && resubmitRoute.includes('const sourceSteps = draftSteps.length'),
  '重提应优先采用最后一次编辑留下的唯一草稿配置');
assert(!resubmitRoute.includes('flowTemplateStepModel.getByTemplateId')
  && !resubmitRoute.includes('flowTemplateStepConditionModel.getByTemplateId')
  && !resubmitRoute.includes('getTemplateStepConditions'),
  '模板修改后，重提历史申请也不得读取当前模板重新解释审批条件');
assert(resubmitRoute.includes('DELETE FROM audit_submission_steps')
  && resubmitRoute.includes("round = 0 AND status = 'draft'"),
  '正式步骤创建成功后必须在同一事务清理编辑草稿');
assert(resubmitRoute.includes('submissionFileModel.setCurrentRevisionRound(submissionId, newRound, conn)')
  && resubmitRoute.includes('SUM(CASE WHEN revision_round <> ? THEN 1 ELSE 0 END) AS mismatched')
  && resubmitRoute.includes('localeCopy.resubmitFileRoundInvalid')
  && resubmitRoute.indexOf('submissionFileModel.setCurrentRevisionRound(submissionId, newRound, conn)')
    < resubmitRoute.indexOf('await conn.commit()'),
  '当前附件 revision_round 必须在提交前原子绑定到与新步骤完全一致的 newRound');
assert(fileModelSource.includes('WHERE submission_id = ? AND org_id = ? AND is_current = 1'),
  '附件模型必须继续保留当前修订边界，旧附件不得混入当前详情');

console.log('审核不可变条件、编辑草稿与附件步骤同轮契约测试通过');
