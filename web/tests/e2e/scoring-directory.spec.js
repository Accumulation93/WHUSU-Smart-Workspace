import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import homeCopy from '../../src/locales/zh-CN/shared/home.js';

const activity = { id: 'activity', name: 'Current activity', description: 'Activity instructions', isPaused: false };
const targets = [
  { id: 'a1', assignmentId: 'a1', name: 'Member A', identity: 'Group A', department: 'Department A', scoreStatus: 'pending', needsAssignmentDisambiguation: true, assignmentNature: 'staff' },
  { id: 'a2', assignmentId: 'a2', name: 'Member A', identity: 'Group B', department: 'Department B', scoreStatus: 'scored', needsAssignmentDisambiguation: true, assignmentNature: 'liaison' },
  { id: 'a3', assignmentId: 'a3', name: 'Member B', identity: 'Group A', department: 'Department A', scoreStatus: 'scored' }
];
async function setup(page) {
  await mockApi(page);
  await page.route('**/api/getCurrentScoreActivity', route => route.fulfill({ json: { status: 'success', activity } }));
  await page.route('**/api/getRateTargets', route => route.fulfill({ json: { status: 'success', currentActivity: activity, targets } }));
}
test('directory uses grouped whole cards, three counts and only necessary assignment labels', async ({ page }) => {
  await setup(page);
  await page.goto('/web/scoring/tasks');
  await expect(page.getByText(activity.description)).toBeVisible();
  await expect(page.locator('.stat-value')).toHaveText(['3', '2', '1']);
  await expect(page.locator('.target-group-label')).toHaveText(['Group A', 'Group B']);
  await expect(page.locator('.target-card')).toHaveCount(3);
  await expect(page.locator('.assignment-chip')).toHaveCount(2);
  await expect(page.locator('.target-card button')).toHaveCount(0);
  const geometry = await page.locator('.scoring-stat').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(); return { y: rect.y, width: rect.width };
  }));
  expect(Math.max(...geometry.map(x => x.y)) - Math.min(...geometry.map(x => x.y))).toBeLessThan(1);
  expect(Math.max(...geometry.map(x => x.width)) - Math.min(...geometry.map(x => x.width))).toBeLessThan(1);
  await page.locator('.target-card').filter({ hasText: 'Member B' }).press('Enter');
  await expect(page).toHaveURL(/\/scoring\/fill\/a3$/);
});
test('returning keeps visible cards while rereading and leaving scoring removes retained private content', async ({ page }) => {
  await setup(page);
  let count = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/getRateTargets', async route => {
    if (++count === 2) await pending;
    await route.fulfill({ json: { status: 'success', currentActivity: activity, targets: count < 3 ? targets : [] } });
  });
  await page.goto('/web/scoring/tasks');
  await page.locator('.target-card').filter({ hasText: 'Member B' }).click();
  await page.locator('.shell-back').click();
  await expect(page).toHaveURL(/\/scoring\/tasks$/);
  await expect(page.locator('.target-card')).toHaveCount(3);
  await expect(page.locator('.target-card').first()).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(homeCopy.text.loadingTargets)).toHaveCount(0);
  release();
  await expect(page.locator('.target-card').first()).toHaveAttribute('aria-disabled', 'false');
  await page.locator('.workspace-hero button').click();
  await expect(page).toHaveURL(/\/work-role$/);
  await page.locator('.shell-back').click();
  await expect(page.getByText(homeCopy.text.noTargets)).toBeVisible();
  await expect(page.locator('.target-card')).toHaveCount(0);
});
test('paused activity is a business state with its name and no misleading retry or empty message', async ({ page }) => {
  await setup(page);
  await page.route('**/api/getCurrentScoreActivity', route => route.fulfill({ json: { status: 'success', activity: { ...activity, isPaused: true } } }));
  await page.route('**/api/getRateTargets', route => route.fulfill({ json: { status: 'activity_paused', message: homeCopy.text.activityPaused, currentActivity: activity, targets: [] } }));
  await page.goto('/web/scoring/tasks');
  await expect(page.getByText(activity.name, { exact: true })).toBeVisible();
  await expect(page.getByText(homeCopy.text.activityPaused)).toBeVisible();
  await expect(page.getByText(homeCopy.text.noTargets)).toHaveCount(0);
  await expect(page.locator('.targets-card button')).toHaveCount(0);
});
