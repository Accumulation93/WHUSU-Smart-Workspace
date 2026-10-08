import { defineConfig, devices } from '@playwright/test';

/**
 * 网页浏览器测试。
 *
 * 服务端应答由测试内的路由拦截提供固定数据，因此这套测试验证的是网页自身的行为
 * （登录、会话、工作角色、消息列表、提示与确认层），在没有数据库的环境里也能运行。
 * 真实服务端链路的端到端验证按计划在后续阶段单独接入。
 */

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * 默认使用随测试框架安装的 Chromium；在无法下载浏览器的环境里，
 * 可以用 `PLAYWRIGHT_CHANNEL=chrome` 或 `PLAYWRIGHT_CHANNEL=msedge`
 * 直接驱动已经装在本机的浏览器，测试内容完全相同。
 */
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const browserOverrides = channel ? { channel } : {};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'off'
  },
  webServer: {
    // 显式绑定 IPv4 与端口，并且禁止 npx 在缺少本地依赖时联网安装。
    command: `npx --no-install vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${BASE_URL}/web/`,
    reuseExistingServer: false,
    timeout: 120000
  },
  projects: [
    { name: 'computer', use: { ...devices['Desktop Chrome'], ...browserOverrides } },
    { name: 'phone', use: { ...devices['Pixel 5'], ...browserOverrides } }
  ]
});
