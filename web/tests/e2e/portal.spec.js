import { expect, test } from '@playwright/test';
import copy from '../../src/locales/zh-CN/index.js';
import { callsOf, mockApi, STORED_PASSPHRASE, STORED_STUDENT_ID } from './fixtures.js';

const WEB_BASE = '/web';
const ROLE_LABEL = '综合事务 · 办公室';

async function login(page) {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByLabel(copy.login.studentIdLabel).fill(STORED_STUDENT_ID);
  await page.getByLabel(copy.login.passphraseLabel).fill(STORED_PASSPHRASE);
  await page.getByRole('button', { name: copy.login.submit }).click();
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/portal$`));
}

test('未登录直接访问门户会进入登录页且不谎称登录过期', async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto(`${WEB_BASE}/portal`);
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/login`));
  await expect(page.getByRole('heading', { name: copy.login.title })).toBeVisible();
  await expect(page.getByText(copy.login.expiredNotice)).toHaveCount(0);
});

test('口令登录后进入门户并展示当前工作角色', async ({ page }) => {
  const api = await mockApi(page, { authenticated: false });
  await login(page);

  const loginCalls = callsOf(api.calls, 'auth/password/session');
  expect(loginCalls).toHaveLength(1);
  // 网页模式必须显式声明，服务端据此下发 HttpOnly Cookie 而不是明文令牌。
  expect(loginCalls[0].body.webSession).toBe(true);
  expect(loginCalls[0].headers['x-client-type']).toBe('web');
  expect(loginCalls[0].headers['x-client-version']).toBeTruthy();

  // 用问候语标题断言：电脑端侧栏与手机端顶栏展示位置不同，标题在两种布局下都可见。
  await expect(page.getByRole('heading', { name: new RegExp('测试用户') })).toBeVisible();
  await expect(page.getByText(ROLE_LABEL, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.portal.modules, { exact: true })).toBeVisible();
});

test('登录状态在使用中失效时回到登录页并说明原因', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);
  // 等门户首屏数据加载完再让会话失效，避免把启动中的请求误判成失效触发点。
  await expect(page.getByText('有一条新的审核申请')).toBeVisible();

  // 服务端会话失效后，下一次业务请求会返回登录失效。
  api.setSessionAlive(false);
  await page.getByRole('button', { name: copy.portal.entryMessages }).first().click();

  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/login`));
  await expect(page.getByText(copy.login.expiredNotice)).toBeVisible();
});

test('门户展示待办与通知，点开通知先标记已读再给出模块说明', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await expect(page.getByText('场地借用审批')).toBeVisible();
  await expect(page.getByText('有一条新的审核申请')).toBeVisible();

  await page.getByText('有一条新的审核申请').click();
  await expect(page.getByText(copy.workbench.notPortedBody).first()).toBeVisible();

  const readCalls = callsOf(api.calls, 'markNotificationRead');
  expect(readCalls).toHaveLength(1);
  expect(readCalls[0].body.id).toBe('notification-1');
});

test('门户的全部标为已读与删除通知调用对应接口', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.getByRole('button', { name: copy.portal.markAllRead }).click();
  await expect.poll(() => callsOf(api.calls, 'markAllNotificationsRead').length).toBe(1);

  await page.getByRole('button', { name: copy.messages.deleteOne }).click();
  await expect.poll(() => callsOf(api.calls, 'deleteNotification').length).toBe(1);
});

test('工作角色页可以切换岗位并回到门户', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/work-role`);
  await expect(page.getByText(copy.workRole.assignmentTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.workRole.adminTitle, { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: new RegExp('管理权限') }).first().click();
  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/portal$`));

  const activateCalls = callsOf(api.calls, 'auth/contexts/activate');
  expect(activateCalls).toHaveLength(1);
  expect(activateCalls[0].body.contextId).toBe('ctx-admin');
  await expect(page.getByText('管理权限', { exact: true }).first()).toBeVisible();
});

test('消息中心按页签加载待办与通知，并可全部删除', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/messages`);
  await expect(page.getByText('场地借用审批')).toBeVisible();
  expect(callsOf(api.calls, 'listTodos').length).toBeGreaterThan(0);

  await page.getByRole('button', { name: copy.messages.tabNotification }).click();
  await expect(page.getByText('有一条新的审核申请')).toBeVisible();
  expect(callsOf(api.calls, 'listNotifications').length).toBeGreaterThan(0);

  await page.getByRole('button', { name: copy.messages.clearAll }).click();
  await page.getByRole('dialog').getByRole('button', { name: copy.messages.clearAll }).click();
  await expect.poll(() => callsOf(api.calls, 'deleteAllNotifications').length).toBe(1);
});

test('退出登录会清除服务端凭证并回到登录页', async ({ page }) => {
  const api = await mockApi(page);
  await login(page);

  await page.getByRole('button', { name: copy.common.logout }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: copy.common.logout }).click();

  await expect(page).toHaveURL(new RegExp(`${WEB_BASE}/login`));
  await expect.poll(() => callsOf(api.calls, 'auth/web/logout').length).toBe(1);
});

test('制作中的模块给出明确说明而不是空页面', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await page.goto(`${WEB_BASE}/workbench?subApp=scoring`);
  await expect(page.getByText(copy.workbench.notPortedTitle)).toBeVisible();
  await expect(page.getByText(copy.workbench.notPortedBody)).toBeVisible();
});

test('未知地址给出入口而不是白屏', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${WEB_BASE}/not-a-real-page`);
  await expect(page.getByText(copy.common.notFoundTitle)).toBeVisible();
});
