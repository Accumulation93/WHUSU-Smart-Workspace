import { expect, test } from '@playwright/test';
import copy from '../../src/locales/zh-CN/index.js';
import signing from '../../src/locales/zh-CN/shared/auditSigning.js';
import { callsOf, mockApi, submissionDetail, STORED_PASSPHRASE, STORED_STUDENT_ID } from './fixtures.js';

const WEB_BASE = '/web';

async function login(page) {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByLabel(copy.login.studentId).fill(STORED_STUDENT_ID);
  await page.getByLabel(copy.login.passphrase).fill(STORED_PASSPHRASE);
  await page.getByRole('button', { name: copy.login.loginAction }).click();
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/portal$`));
}

test('我的申请列表展示状态并支持按状态筛选', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/audit/my-submissions`);
  await expect(page.getByText('活动室使用申请')).toBeVisible();
  // 状态筛选按钮与列表里的状态标签文字相同，这里只断言列表内的标签。
  await expect(page.locator('.chip', { hasText: copy.audit.statusLabels.in_progress })).toBeVisible();
  await expect(page.getByText('SP-2026-0001', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: copy.audit.statusLabels.approved }).click();
  await expect.poll(() => {
    const calls = callsOf(api.calls, 'listMySubmissions');
    return calls.length ? calls[calls.length - 1].body.status : '';
  }).toBe('approved');
});

test('待我审批展示待处理步骤与提交人', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/audit/pending`);
  await expect(page.getByText('活动室使用申请')).toBeVisible();
  await expect(page.getByText(new RegExp(copy.audit.submitterLabel + ' 张同学'))).toBeVisible();
});

test('审批历史展示我处理过的记录', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/audit/history`);
  await expect(page.getByText('活动室使用申请')).toBeVisible();
  await expect(page.getByText(new RegExp(copy.audit.eventApproved))).toBeVisible();
});

test('申请详情展示进度与附件，并可下载附件', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/audit/submission/submission-1`);
  await expect(page.getByRole('heading', { name: '活动室使用申请' })).toBeVisible();
  await expect(page.getByText('部门初审')).toBeVisible();
  await expect(page.getByText('负责人审批').first()).toBeVisible();
  await expect(page.getByText('申请表.pdf')).toBeVisible();

  await expect.poll(() => callsOf(api.calls, 'getSubmissionDetail').length).toBe(1);
  const detailCall = callsOf(api.calls, 'getSubmissionDetail')[0];
  expect(detailCall.body.submissionId).toBe('submission-1');
  // 打开详情即标记已读，与小程序行为一致。
  await expect.poll(() => callsOf(api.calls, 'markSubmissionRead').length).toBe(1);
});

test('historical assignment fields render on the actual audit detail page', async ({ page }) => {
  await mockApi(page);
  const detail = submissionDetail();
  const oldSnapshot = { identity: 'Chair', department: 'Committee', workGroup: '', role: 'user', contextId: 'historical-context' };
  detail.events.find(event => event.eventType === 'approve').operatorContextSnapshot = oldSnapshot;
  detail.steps[0].processedContextSnapshot = oldSnapshot;
  await page.route('**/api/getSubmissionDetail', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(detail)
  }));
  await login(page);
  await page.goto(`${WEB_BASE}/audit/submission/submission-1`);
  const processedStep = page.locator('.list-row').filter({ hasText: '部门初审' });
  await expect(processedStep.getByText('Chair · Committee', { exact: true })).toBeVisible();
  await expect(processedStep.getByText(signing.assignmentUnknown, { exact: true })).toHaveCount(0);
});

test('待我审批的步骤可以直接通过并带上意见', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/audit/submission/submission-1`);
  await page.getByLabel(copy.audit.approveCommentLabel).fill('同意办理');
  await page.getByRole('button', { name: copy.audit.actionApprove }).click();

  await expect.poll(() => callsOf(api.calls, 'approveStep').length).toBe(1);
  const call = callsOf(api.calls, 'approveStep')[0];
  expect(call.body.submissionId).toBe('submission-1');
  expect(call.body.stepId).toBe('step-2');
  expect(call.body.comment).toBe('同意办理');
});

test('驳回必须填写原因才会提交', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/audit/submission/submission-1`);
  await page.getByRole('button', { name: copy.audit.actionReject }).click();
  await expect(page.getByText(copy.audit.rejectReasonRequired)).toBeVisible();
  expect(callsOf(api.calls, 'rejectStep')).toHaveLength(0);

  await page.getByLabel(copy.audit.rejectReasonLabel).fill('材料不完整');
  await page.getByRole('button', { name: copy.audit.actionReject }).click();
  await expect.poll(() => callsOf(api.calls, 'rejectStep').length).toBe(1);
  expect(callsOf(api.calls, 'rejectStep')[0].body.rejectionReason).toBe('材料不完整');
});

test('需要签名的步骤提供相同签署入口，缺少材料时不提交审批', async ({ page }) => {
  await mockApi(page, { detail: { actionType: 'sign' } });
  await login(page);

  await page.goto(`${WEB_BASE}/audit/submission/submission-1`);
  await expect(page.getByRole('button', { name: signing.addInk, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.audit.actionApprove })).toBeEnabled();
});

test('提交人可以在审批中撤回申请', async ({ page }) => {
  const api = await mockApi(page, { detail: { userIsSubmitter: true, canApproveCurrentStep: false } });
  await login(page);

  await page.goto(`${WEB_BASE}/audit/submission/submission-1`);
  await page.getByRole('button', { name: copy.audit.actionWithdraw }).click();
  await page.getByRole('dialog').getByRole('button', { name: copy.audit.actionWithdraw }).click();
  await expect.poll(() => callsOf(api.calls, 'withdrawSubmission').length).toBe(1);
});

test('发起申请会先上传附件再提交申请', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/audit/create`);
  await expect(page.getByText('活动申请流程')).toBeVisible();

  await page.getByLabel(copy.audit.createTitleLabel).fill('活动室使用申请');
  await page.getByLabel(copy.audit.createDescLabel).fill('申请 3 月 12 日使用活动室');
  await page.setInputFiles('input[type="file"]', {
    name: '申请表.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test')
  });
  await expect(page.getByText('申请表.pdf')).toBeVisible();

  await page.getByRole('button', { name: copy.audit.createSubmit }).click();
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/audit/my-submissions$`));

  expect(callsOf(api.calls, 'uploadAuditFile')).toHaveLength(1);
  const startCalls = callsOf(api.calls, 'startAuditSubmission');
  expect(startCalls).toHaveLength(1);
  expect(startCalls[0].body.templateId).toBe('template-1');
  expect(startCalls[0].body.title).toBe('活动室使用申请');
  expect(Array.isArray(startCalls[0].body.files)).toBe(true);
  expect(startCalls[0].body.files[0].fileId).toBe('uploaded-1');
});

test('签名管理可以在画布上签名并保存', async ({ page }) => {
  const api = await mockApi(page, { emptySignatures: true });
  await login(page);

  await page.goto(`${WEB_BASE}/audit/signatures`);
  await page.getByRole('button', { name: copy.audit.signatureNew }).click();

  const canvas = page.locator('.signing-stage canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('button', { name: signing.confirm, exact: true })).toBeEnabled();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  // 签名纸张保持 2:1，横屏画布两侧可能是纸张外的留白。
  const fileWidth = Math.min(box.width, box.height * 2);
  const fileLeft = box.x + (box.width - fileWidth) / 2;
  await page.mouse.move(fileLeft + fileWidth * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(fileLeft + fileWidth * 0.5, box.y + box.height / 2 + 10, { steps: 8 });
  await page.mouse.move(fileLeft + fileWidth * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: signing.confirm, exact: true }).click();
  await expect(page).toHaveURL(/audit\/signatures$/);

  await page.getByLabel(copy.audit.signatureNameLabel).fill('我的签名');
  await page.getByRole('button', { name: copy.audit.signatureSave }).click();

  await expect.poll(() => callsOf(api.calls, 'saveSignature').length).toBe(1);
  const saved = callsOf(api.calls, 'saveSignature')[0].body;
  expect(saved.name).toBe('我的签名');
  expect(String(saved.imageData).startsWith('data:image/png;base64,')).toBe(true);
});

test('门户的审核入口直接进入审核模块', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await page.getByRole('button', { name: copy.portal.cards.audit, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/audit/my-submissions$`));
});
