import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/score/score.js';
import { quickScores } from '../../src/runtime/scoringInput.js';

async function setup(page, readOnly = false) {
  await mockApi(page);
  await page.route('**/api/getScoreFormData', route => route.fulfill({ json: {
    status: 'success', readOnly, currentActivity: { id: 'activity', name: 'Activity' },
    scorer: { id: 'scorer', name: 'Scorer' }, target: { id: 'target', name: 'Target' },
    templateBundle: { questions: Array.from({ length: 8 }, (_, index) => ({
      id: 'q' + index, question: 'Question ' + (index + 1), templateId: 'template', templateName: 'Questions',
      minValue: 0, startValue: 0, maxValue: 10, stepValue: 0.5, score: readOnly ? 5 : ''
    })) }
  } }));
  await page.goto('/web/scoring/fill/target');
  await expect(page.getByRole('heading', { name: 'Target', exact: true })).toBeVisible();
}

test('score keyboard keeps zero, advances to next question, and handles decimal and physical navigation', async ({ page }) => {
  await setup(page);
  const keyboard = page.locator('.score-keyboard');
  const inputs = page.locator('.score-input');
  await keyboard.getByRole('button', { name: '0', exact: true }).click();
  await expect(inputs.nth(0)).toHaveValue('0');
  await expect(inputs.nth(1)).toBeFocused();
  await keyboard.getByRole('switch').click();
  await keyboard.getByRole('button', { name: '.', exact: true }).click();
  await expect(inputs.nth(1)).toHaveValue('0.');
  await keyboard.getByRole('button', { name: '5', exact: true }).click();
  await expect(inputs.nth(1)).toHaveValue('0.5');
  await keyboard.getByRole('button', { name: '⌫', exact: true }).click();
  await expect(inputs.nth(1)).toHaveValue('0.');
  await inputs.nth(1).press('ArrowDown');
  await expect(inputs.nth(2)).toBeFocused();
  await page.keyboard.type('7.5');
  await expect(inputs.nth(2)).toHaveValue('7.5');
  await page.keyboard.press('Shift+Enter');
  await expect(inputs.nth(1)).toBeFocused();
  await expect(inputs.nth(0)).toHaveValue('0');
});

test('score keyboard stays visible and leaves last question and submit reachable on all layouts', async ({ page }) => {
  await setup(page);
  const keyboard = page.locator('.score-keyboard');
  await expect.poll(() => keyboard.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 44 && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth;
  })).toBe(true);
  const last = page.locator('.score-input').last();
  await keyboard.getByRole('button', { name: new RegExp(ui.copy_8ec888d575) }).click();
  await last.click();
  await expect(last).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const input = document.querySelectorAll('.score-input')[7].getBoundingClientRect();
    const keyboard = document.querySelector('.score-keyboard').getBoundingClientRect();
    return input.top >= 44 && (innerWidth >= 900 ? input.right < keyboard.left : input.bottom < keyboard.top);
  })).toBe(true);
  await keyboard.getByRole('button', { name: new RegExp(ui.copy_8ec888d575) }).click();
  const submit = page.getByRole('button', { name: ui.copy_4d39b37cc5, exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('historical read only scores keep normal cards and remove all editing controls', async ({ page }) => {
  await setup(page, true);
  await expect(page.locator('.score-question')).toHaveCount(8);
  await expect(page.locator('.score-input')).toHaveCount(0);
  await expect(page.locator('.score-keyboard')).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.copy_4d39b37cc5 })).toHaveCount(0);
});

test('quick scores follow the start and step and remain bounded for dense ranges', () => {
  expect(quickScores({ minValue: 0, startValue: 2, maxValue: 4, stepValue: 0.5 })).toEqual(['2', '2.5', '3', '3.5', '4']);
  const values = quickScores({ minValue: 0, startValue: 0, maxValue: 23.5, stepValue: 0.5 });
  expect(values).toHaveLength(25);
  expect(values.every(value => Number.isFinite(Number(value)))).toBe(true);
  expect(quickScores({ minValue: 0.0004, startValue: 0, maxValue: 1, stepValue: 1e-100 })).toEqual([]);
});
