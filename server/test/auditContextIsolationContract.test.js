'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routeSource = fs.readFileSync(path.resolve(
  __dirname,
  '../src/modules/audit/routes/auditUser.js'
), 'utf8');
const signatureSource = fs.readFileSync(path.resolve(
  __dirname,
  '../src/modules/audit/routes/auditSignature.js'
), 'utf8');
const adminRouteSource = fs.readFileSync(path.resolve(
  __dirname,
  '../src/modules/audit/routes/auditAdmin.js'
), 'utf8');
const fileSource = fs.readFileSync(path.resolve(
  __dirname,
  '../src/modules/audit/utils/fileSecurity.js'
), 'utf8');
const modelSource = fs.readFileSync(path.resolve(
  __dirname,
  '../src/modules/audit/models/auditSubmission.js'
), 'utf8');

const detailRoute = routeSource.slice(
  routeSource.indexOf("router.post('/getSubmissionDetail'"),
  routeSource.indexOf('// ═══════════════════════════════════════════════════\n// Approval Actions')
);
assert(!detailRoute.includes("req.get('X-Role')"),
  '审批详情不得用客户端请求头角色判定管理员权限');
assert(detailRoute.includes('await resolveCurrentActor(req)'),
  '审批详情必须使用认证中间件确认的当前工作角色');
assert(routeSource.includes('submittedAssignmentId: actorContext.assignment.assignment_id'),
  '我的申请和未读游标必须按当前岗位过滤');
assert(modelSource.includes("'$.assignmentId'"),
  '岗位筛选必须兼容不可变提交岗位快照');
assert(fileSource.includes('submissionMatchesSubmitterAssignment')
  && fileSource.includes("event_type IN ('approve', 'reject')")
  && fileSource.includes("assignmentSqlExpression('e', 'handled_step')"),
  '附件访问必须按提交或处理时的具体岗位授权');
assert(!signatureSource.includes("req.get('X-Role')")
  && signatureSource.includes('resolveActorAssignmentForUpdate'),
  '签名管理必须使用当前有效岗位，不能回退到请求头或 openid 映射');
assert(routeSource.includes("['audit', submissionId, currentRound, step.sort_order, 'progress']")
  && routeSource.includes("['audit', submissionId, step.round || 1, step.sort_order, 'rejected']"),
  '通知幂等键必须包含轮次和步骤，重提后同一步通知不得被旧轮次吞掉');
assert(routeSource.includes('flowTemplateModel.getByIdForUpdate(templateId, conn)')
  && adminRouteSource.includes('flowTemplateModel.getByIdForUpdate(id, conn)')
  && adminRouteSource.includes('validateStepShape'),
  '模板保存、发起和编辑必须锁定同一模板版本并严格校验步骤');

console.log('审核岗位隔离、角色认证、附件与通知契约测试通过');
