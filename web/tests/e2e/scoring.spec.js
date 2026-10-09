import { expect, test } from '@playwright/test';
import copy from '../../src/locales/zh-CN/index.js';
import homeCopy from '../../src/locales/zh-CN/shared/home.js';
import { STORED_PASSPHRASE, STORED_STUDENT_ID } from './fixtures.js';

const WEB_BASE = '/web';

const SESSION = {
  status: 'success',
  context: {
    contextId: 'ctx-1',
    organizationId: 'org-1',
    organizationName: '测试组织',
    role: 'user',
    name: '测试用户',
    assignmentId: 'assignment-1',
    assignmentLabel: '综合事务 · 办公室',
    identityName: '综合事务'
  },
  contexts: [],
  workContexts: [],
  organizations: [],
  user: { name: '测试用户' },
  activeRole: 'user',
  activeOrg: { id: 'org-1', name: '测试组织' },
  systemTimezoneOffset: 8,
  timezoneConfigVersion: '1'
};

const TARGET = {
  id: 'hr-2',
  assignmentId: 'assignment-2',
  name: '张同学',
  department: '办公室',
  identity: '综合事务',
  workGroup: '',
  isScored: false,
  scoreStatus: 'pending'
};

const SCORED_TARGET = Object.assign({}, TARGET, { id: 'hr-3', name: '李同学', isScored: true, scoreStatus: 'scored' });

function scoreForm() {
  return {
    status: 'success',
    readOnly: false,
    scorer: { id: 'hr-1', assignmentId: 'assignment-1', name: '测试用户' },
    target: { id: 'hr-2', assignmentId: 'assignment-2', name: '张同学', department: '办公室', identity: '综合事务' },
    currentActivity: { id: 'activity-1', name: '2026 年度考核', participantGranularity: 'assignment' },
    existingRecord: null,
    rule: { id: 'rule-1', templateConfigSignature: 'sig-1' },
    templateBundle: {
      name: '工作表现',
      templates: [],
      questions: [
        {
          id: 'tpl-1_1',
          templateId: 'tpl-1',
          templateName: '工作表现',
          templateWeight: 1,
          questionIndex: 1,
          question: '工作完成情况',
          scoreLabel: '得分',
          minValue: 0,
          startValue: 0,
          maxValue: 10,
          stepValue: 0.5,
          score: ''
        },
        {
          id: 'tpl-1_2',
          templateId: 'tpl-1',
          templateName: '工作表现',
          templateWeight: 1,
          questionIndex: 2,
          question: '协作配合情况',
          scoreLabel: '得分',
          minValue: 0,
          startValue: 0,
          maxValue: 10,
          stepValue: 0.5,
          score: ''
        }
      ]
    }
  };
}

async function mockScoring(page, options) {
  const settings = options || {};
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const apiName = new URL(request.url()).pathname.replace('/api/', '');
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch (_) {
      body = {};
    }
    calls.push({ name: apiName, body });
    const reply = (payload, status) => route.fulfill({
      status: status || 200,
      contentType: 'application/json',
      body: JSON.stringify(payload)
    });
    if (apiName === 'auth/contexts') return reply(SESSION);
    // 登录成功必须返回 login_success，页面据此进入门户。
    if (apiName === 'auth/password/session') {
      return reply(Object.assign({}, SESSION, { status: 'login_success' }));
    }
    if (apiName === 'getCurrentScoreActivity') return reply({ status: 'success', activity: { id: 'activity-1', name: '2026 年度考核' } });
    if (apiName === 'getRateTargets') {
      return reply({
        status: 'success',
        scorer: { id: 'hr-1' },
        rule: { id: 'rule-1' },
        currentActivity: { id: 'activity-1', name: '2026 年度考核' },
        targets: settings.emptyTargets ? [] : [TARGET, SCORED_TARGET]
      });
    }
    if (apiName === 'getScoreFormData') return reply(scoreForm());
    return reply({ status: 'success' });
  });
  return calls;
}

async function login(page) {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByLabel(copy.login.studentId).fill(STORED_STUDENT_ID);
  await page.getByLabel(copy.login.passphrase).fill(STORED_PASSPHRASE);
  await page.getByRole('button', { name: copy.login.loginAction }).click();
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/portal$`));
}

test('评分任务列出待评与已评对象', async ({ page }) => {
  await mockScoring(page);
  await login(page);

  await page.goto(`${WEB_BASE}/scoring/tasks`);
  await expect(page.getByText('2026 年度考核')).toBeVisible();
  await expect(page.getByText('张同学')).toBeVisible();
  await expect(page.locator('.target-card').getByText(copy.scoring.scoreStatusPending)).toBeVisible();
  await expect(page.getByText(copy.scoring.scoreStatusScored).first()).toBeVisible();
  await expect(page.locator('.target-card')).toHaveCount(2);
  await expect(page.getByText(copy.scoring.actionRewriteScore)).toHaveCount(0);
});

test('没有评分对象时给出空状态', async ({ page }) => {
  await mockScoring(page, { emptyTargets: true });
  await login(page);

  await page.goto(`${WEB_BASE}/scoring/tasks`);
  await expect(page.getByText(homeCopy.text.noTargets)).toBeVisible();
});

test('评分填写按题目校验并与服务端约定一致', async ({ page }) => {
  const calls = await mockScoring(page);
  await login(page);

  await page.goto(`${WEB_BASE}/scoring/fill/hr-2`);
  await expect(page.getByRole('heading', { name: '张同学' })).toBeVisible();
  await expect(page.getByText('工作完成情况', { exact: false })).toBeVisible();

  // 未填写完整时不得提交
  await page.getByRole('button', { name: copy.scoring.actionSubmit }).click();
  await expect(page.getByText(copy.scoring.questionRequired)).toBeVisible();
  expect(calls.filter((call) => call.name === 'submitScoreRecord')).toHaveLength(0);

  // 超出上限也要拦下
  const inputs = page.locator('.score-input');
  await inputs.nth(0).fill('20');
  await inputs.nth(1).fill('8');
  await page.getByRole('button', { name: copy.scoring.actionSubmit }).click();
  await expect(page.getByText(new RegExp('第 1 项的分数需要在'))).toBeVisible();

  // 合法分值与步长可以提交
  await inputs.nth(0).fill('9.5');
  await page.getByRole('button', { name: copy.scoring.actionSubmit }).click();
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/scoring/tasks$`));

  const submits = calls.filter((call) => call.name === 'submitScoreRecord');
  expect(submits).toHaveLength(1);
  expect(submits[0].body.activityId).toBe('activity-1');
  expect(submits[0].body.templateConfigSignature).toBe('sig-1');
  expect(submits[0].body.answers).toEqual([
    { questionIndex: 1, score: 9.5 },
    { questionIndex: 2, score: 8 }
  ]);
});
