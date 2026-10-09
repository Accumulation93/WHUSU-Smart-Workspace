# CLAUDE.md — 网页版前端（web/）

> 目录：`web/**`。交接说明与页面清单见 `docs/web-client.md`；视觉取值见 `docs/web-ui-parity.md`。
> 本文件只写"动 `web/**` 之前必须知道"的规则。

## 1. 语言库只有一份

- 文案唯一来源是 `shared/locales/zh-CN/**`。网页语言文件 `web/src/locales/zh-CN/*.js` **是生成物**，里面不允许出现中文，也不允许手工新增文件。
- 改文案固定流程：改共享库 → `node scripts/sync-shared-modules.js --write` → `node scripts/locale-align.js --write` → `node scripts/locale-single-source-audit.js`。
- 小程序已有的说法必须直接复用；网页独有的说法登记在 `shared/locales/zh-CN/web.js` 并注明原因。
- `.vue`、`.js` 里出现任何中文（含注释）都会被 `node scripts/user-visible-copy-audit.js --localization-prefix=web/ --strict-localization` 拦下。

## 2. 视觉只能引用令牌

- 只用 `web/src/styles/tokens.css` 的 `--ui-*` 变量与 `components.css` 的语义类；页面级微调放 `<style scoped>`，且不得写死颜色与字号。
- 禁止新增按钮色、状态标签色、自定义动画；状态标签只有蓝/绿/橙/天蓝四色，红色只用于破坏性操作。
- 卡片必须是渐变 + 1px 浅色描边 + 顶部内高光 + 外阴影 + `backdrop-filter: blur(12px)`；标准属性要单独声明（压缩会把前缀写法当成重复而丢掉标准属性，导致模糊整体失效）。
- 页面顶部统一用 `components/WorkspaceHero.vue`；页面底部两行是**固定品牌文案**（`common.appName` + `common.organizationName`），不是当前登录组织。

## 3. 接口与会话

- 所有请求走 `web/src/runtime/api.js`，不要页面里直接 `fetch`。请求头必须带 `X-Client-Type: web`。
- 登录凭证在 HttpOnly Cookie 里，前端不接触令牌，不做本地会话缓存。
- 401 一律回登录页，不自动重试、不切换账号重放；426 提示刷新页面。
- 时间展示只能走 `web/src/runtime/dateTime.js`（规则与小程序同源），页面里不得自己格式化时间。

## 4. 页面与路由

- 新增页面要同时更新：页面文件、`web/src/router/index.js`、`web/src/runtime/modules.js` 的入口、语言库条目，以及一条浏览器测试。
- 路由的 `meta.title` 引用的键必须真实存在（历史上写错键导致整站白屏）。
- 三档设备统一遵循小程序：顶栏只放页面标题与返回键，从门户进入业务，业务页内放对应模块页签，不增加侧栏或跨模块导航。三档断点固定为 `<520px`、`520-899px`、`>=900px`。

## 5. 完成前必须跑

```
cd web && npm run build
cd web && $env:PLAYWRIGHT_CHANNEL="chrome"; npm run test:e2e
cd web && node scripts/parity-audit.mjs
node scripts/sync-shared-modules.js
node scripts/locale-single-source-audit.js
node scripts/user-visible-copy-audit.js --localization-prefix=web/ --strict-localization
git diff --check
```

涉及视觉改动的，还要在真实浏览器里打开对应页面确认；截图脚本是 `web/scripts/visual-check.mjs`。
