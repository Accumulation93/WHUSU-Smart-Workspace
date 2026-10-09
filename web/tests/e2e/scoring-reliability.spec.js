import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import scoreCopy from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/score/score.js';

const target = { id: 'assignment-target', assignmentId: 'assignment-target', name: 'Score target', department: 'Department', identity: 'Identity', isScored: false };
function form(score = '') {
  return { status: 'success', readOnly: false,
    currentActivity: { id: 'activity', name: 'Activity' },
    scorer: { id: 'person-scorer', assignmentId: 'assignment-scorer' }, target,
    rule: { templateConfigSignature: 'signature' },
    existingRecord: score === '' ? null : { id: 'record', revisionNumber: 1 },
    templateBundle: { name: 'Questions', questions: [{ id: 'q1', templateId: 'template', templateName: 'Questions',
      questionIndex: 1, question: 'Question', minValue: 0, maxValue: 10, startValue: 0, stepValue: 0.5, score }] } };
}

test('target card navigation submits the selected assignment and rereads saved scores', async ({ page }) => {
  await mockApi(page);
  let saved = '';
  const reads = [];
  await page.route('**/api/getRateTargets', route => route.fulfill({ json: { status: 'success', currentActivity: { id: 'activity', name: 'Activity' }, targets: [{ ...target, isScored: saved !== '' }] } }));
  await page.route('**/api/getScoreFormData', route => {
    reads.push(route.request().postDataJSON());
    return route.fulfill({ json: form(saved) });
  });
  await page.route('**/api/submitScoreRecord', route => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({ clientRequestId: expect.any(String), scorerId: 'person-scorer', scorerAssignmentId: 'assignment-scorer',
      targetId: 'assignment-target', activityId: 'activity', activityName: 'Activity', templateConfigSignature: 'signature',
      answers: [{ questionIndex: 1, score: 8.5 }], existingRecordId: '', existingRecordRevision: 0 });
    saved = body.answers[0].score;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/scoring/tasks');
  await page.locator('.target-card').filter({ hasText: target.name }).click();
  await expect(page).toHaveURL(/\/scoring\/fill\/assignment-target$/);
  await page.locator('.score-input').fill('8.5');
  await page.getByRole('button', { name: copy.scoring.actionSubmit }).click();
  await expect(page).toHaveURL(/\/scoring\/tasks$/);
  await expect(page.locator('.target-card')).toContainText(copy.scoring.scoreStatusScored);
  await page.locator('.target-card').filter({ hasText: target.name }).click();
  await expect(page.locator('.score-input')).toHaveValue('8.5');
  expect(reads).toEqual([{ targetId: target.id }, { targetId: target.id }]);
  await expect(page.getByText(copy.scoring.existingRecordNotice)).toHaveCount(0);
});

test('failed target reads show a retry instead of a false empty directory', async ({ page }) => {
  await mockApi(page);
  let count = 0;
  await page.route('**/api/getRateTargets', route => route.fulfill({ json: ++count === 1
    ? { status: 'unavailable', message: 'Directory unavailable' }
    : { status: 'success', currentActivity: { name: 'Activity' }, targets: [target] } }));
  await page.goto('/web/scoring/tasks');
  await expect(page.getByText('Directory unavailable')).toBeVisible();
  await expect(page.getByText(copy.scoring.activityEmpty, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: scoreCopy.retryLoad }).click();
  await expect(page.getByText(target.name)).toBeVisible();
});

test('form load retry stays on page and draft navigation can be cancelled', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/getRateTargets', route => route.fulfill({ json: { status: 'success', currentActivity: { name: 'Activity' }, targets: [target] } }));
  let count = 0;
  await page.route('**/api/getScoreFormData', route => route.fulfill({ json: ++count === 1
    ? { status: 'unavailable', message: 'Form unavailable' } : form(5) }));
  await page.goto('/web/scoring/tasks');
  await page.locator('.target-card').filter({ hasText: target.name }).click();
  await expect(page.getByText('Form unavailable')).toBeVisible();
  await page.getByRole('button', { name: scoreCopy.retryLoad }).click();
  const input = page.locator('.score-input');
  await input.fill('7');
  await page.locator('.shell-back').click();
  await expect(page.getByRole('dialog')).toContainText(scoreCopy.unsavedScoreLeaveWarning);
  await page.getByRole('dialog').getByRole('button', { name: copy.common.cancel, exact: true }).click();
  await expect(input).toHaveValue('7');
  await expect(page).toHaveTitle(copy.scoring.fillTitle);
  await input.fill('5.0');
  await page.locator('.shell-back').click();
  await expect(page).toHaveURL(/\/scoring\/tasks$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
