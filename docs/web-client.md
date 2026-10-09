# 网页版工作台：工程说明与交接文档

> 这份文档写给接手 `web/` 的工程师或 AI 助手。看它之前先按 `AGENTS.md` 完成启动加载。
> 本文说明**网页版是什么、代码在哪、文案从哪来、怎么跑、怎么发、哪些坑不能踩、哪些还没做**。
> 视觉细节以 `docs/web-ui-parity.md` 为准，本文件不重复罗列色值与尺寸。

最后更新：2026-10-09

---

## 1. 一句话说明

网页版是同一套 Express + MySQL 服务端上的第二个前端，挂在 `https://accumulation93.com/web`，与小程序长期并存。
网页**不重写后端**：接口、参数、权限、组织隔离、数据结构与小程序完全一致，浏览器用 `fetch` 直接调用同一批 `/api/*`。

## 2. 代码位置与边界

| 路径 | 作用 |
| --- | --- |
| `web/` | 网页前端工程（Vue 3 + Vite + vue-router），纯静态构建产物 |
| `web/src/views/**` | 页面（按模块分目录：`audit/`、`venue/`、`scoring/`、`admin/`、`system/`、`hr/`） |
| `web/src/components/**` | 共享组件：`WorkspaceHero`、`UiIcon`、`MessageRow`、`AuditNav`、`VenueNav`、`AppShell`、`AppDialog`、`AppToaster` |
| `web/src/runtime/**` | 运行时：接口封装、会话、提示层、时间、模块清单、语言别名 |
| `web/src/styles/**` | `tokens.css`（设计令牌）、`components.css`（组件类）、`parity.css`（与小程序逐条对齐的覆盖层） |
| `web/src/locales/zh-CN/**` | **生成物**：对共享语言库的引用，不允许出现中文 |
| `web/public/icons/**` | 从小程序 `assets/icons` 复制的 24 个 SVG（逐字节一致） |
| `shared/locales/zh-CN/**` | **语言唯一来源**（见第 4 节） |
| `shared/*.js` | 两端共用的纯逻辑（接口约定、时间展示规则） |

不要在网页里直接读 `miniprogram/**`；需要共用的东西放 `shared/`，由同步脚本生成副本。

## 3. 本地运行与常用命令

```powershell
cd web
npm ci                 # 安装依赖
npm run dev            # 开发服务器：http://127.0.0.1:5173/web/，/api 已代理到本机 3000
npm run build          # 构建到 web/dist
npm run preview        # 预览构建产物：http://127.0.0.1:4173/web/
```

浏览器测试（本机下载不了 Playwright 自带浏览器时，用系统 Chrome）：

```powershell
cd web
$env:PLAYWRIGHT_CHANNEL="chrome"
npm run test:e2e       # vite build && playwright test（电脑、手机与 Pad 竖屏三档；实际数量以测试输出为准）
```

`web/playwright.config.js` 里有三个关键约定：预览服务显式绑定 `127.0.0.1:4173`（Linux 上 `localhost` 可能只解析到 IPv6），
`npx --no-install` 禁止联网安装，`PLAYWRIGHT_CHANNEL` 可切换到本机已装浏览器。

## 4. 语言库：只有一份，改一处两端同步

**这是本工程最容易被改错的规则。**

```
shared/locales/zh-CN/**            ← 唯一来源（文案只写在这里）
        │
        ├─ scripts/sync-shared-modules.js ─┬→ miniprogram/locales/zh-CN/**   （CommonJS 副本）
        │                                  └→ web/src/locales/zh-CN/shared/**（ES 模块副本）
        │
        └─ scripts/locale-align.js ────────→ web/src/locales/zh-CN/<模块>.js（只含引用，无中文）
```

三条命令的分工：

| 命令 | 作用 | 不带参数时的行为 |
| --- | --- | --- |
| `node scripts/sync-shared-modules.js` | 生成/校验两端副本（4 个内容模块 + 72 个语言文件） | 校验，副本不一致即失败退出 |
| `node scripts/locale-align.js --write` | 把网页语言文件里的中文字面量换成对共享库的引用；找不到对应条目会列出来 | `--report` 只报告不写文件 |
| `node scripts/locale-single-source-audit.js` | 检查网页语言文件是否自存文案、是否登记在对照表里 | 有问题即失败 |

改文案的固定流程：

1. 改 `shared/locales/zh-CN/**` 里的值（小程序已有的说法必须复用，不要另写同义句）。
2. `node scripts/sync-shared-modules.js --write`
3. `node scripts/locale-align.js --write`
4. `node scripts/locale-single-source-audit.js`、`node scripts/user-visible-copy-audit.js --localization-prefix=web/ --strict-localization`

网页专用的说法（小程序里没有对应句子的，例如"网页版""页面不存在"）登记在 `shared/locales/zh-CN/web.js`，并在注释里说明为什么小程序没有。

**禁止**：在 `web/src/**` 的 `.vue` 或 `.js` 里写中文（包括注释，模板里的中文注释会被当成界面文案）；在 `web/src/locales/zh-CN/` 下放非生成文件（审计会因"必须由生成器产出"失败，别名层就因此被移到 `web/src/runtime/localeAliases.js`）。

## 5. 页面清单

路由入口在 `web/src/router/index.js`，导航清单在 `web/src/runtime/modules.js`。

| 模块 | 路由 | 说明 |
| --- | --- | --- |
| 登录 | `/login` | 口令登录；凭证在 HttpOnly Cookie 里，页面不接触令牌 |
| 门户 | `/portal` | 待办、通知、应用服务宫格（3/4/5 列）、底部品牌两行 |
| 工作台 | `/workbench` | 待办与通知摘要、模块入口 |
| 消息中心 | `/messages` | 待办/通知两个页签、标记已读、删除、全部清除 |
| 组织与工作角色 | `/work-role` | 选组织、选岗位或管理权限、切换 |
| 审核审批 | `/audit/my-submissions`、`/audit/pending`、`/audit/history`、`/audit/submission/:id`、`/audit/create`、`/audit/signatures` | 我的申请、待我审批、审批历史、详情（通过/驳回/撤回/附件下载）、按模板发起申请、签名管理 |
| 验签 | `/audit/verification`、`/audit/verification-report/:id` | 文件密码验签与验证报告 |
| 考核评分 | `/scoring/tasks`、`/scoring/fill/:id` | 评分任务列表、按模板分组的评分填写（必填/上下限/步长校验） |
| 场地借用 | `/venue/bookings`、`/venue/create`、`/venue/mine`、`/venue/pending`、`/venue/history`、`/venue/history/:id`、`/venue/manage` | 浏览场地、发起借用、我的借用（取消/结束使用）、待我审批、审批历史与详情、场地管理（只读） |
| 管理端 | `/admin?subApp=scoring/hr/system/audit`、`/admin/permissions`、`/admin/auth` | 按小程序子应用与权限显示页签；人事目录、部门/职能组/身份类别维护、管理权限可用，其他管理操作仍待补齐 |
| 基本设置 | `/system/config`、`/system/dictionary`、`/system/audit-template`、`/system/permissions` | 字典旧地址进入人事部门维护；其余设置与模板旧页面仍只读 |
| 人事 | `/hr/profile` | 本人基础资料只读；补充资料按模板填写、保存或提交审核并回读 |
| 兼容跳转 | `/switch`、`/account-security` | 与小程序同名页面的跳转 |

## 6. 运行时约定

- `web/src/runtime/api.js`：唯一的接口入口。请求头固定带 `X-Client-Type: web` 与 `X-Client-Version`；
  401 时清会话并回登录页，不自动重试、不在别的账号下重放；426 提示刷新页面。
- `web/src/runtime/session.js`：登录态与当前工作角色，刷新页面靠 `auth/contexts` 重建，不缓存登录信息。
- `web/src/runtime/notify.js`：提示与确认层，替代 `wx.showToast` / `wx.showModal`。
- `web/src/runtime/dateTime.js`：时间展示。规则来自 `shared/dateTimeFormat.js`，与小程序同源，禁止在页面里自己格式化时间。
- `web/src/runtime/localeAliases.js`：把共享语言库的平铺键同时挂到 `view` / `messages` / `cards` 等历史层级上，**不改文案**。
- `web/src/porting` 相关的"制作中"说明在 `web/src/runtime/porting.js`。

## 7. 检查脚本与测试

| 检查 | 命令 | 说明 |
| --- | --- | --- |
| 构建 | `cd web && npm run build` | 必须通过 |
| 浏览器测试 | `cd web && npm run test:e2e` | 电脑、手机、Pad 竖屏三档，含窄屏布局与失败路径测试 |
| 视觉数值核对 | `cd web && node scripts/parity-audit.mjs` | 读浏览器计算值，三档断点各 29 项 |
| 文案与图标逐页对照 | `cd web && node scripts/parity-content-audit.mjs` | 输出「小程序有、网页没有」「网页有、小程序没有」两列 |
| 截图留档 | `cd web && node scripts/visual-check.mjs` | 图片落在 `web/tmp/visual/`（该目录不入库） |
| 语言库单一来源 | `node scripts/locale-single-source-audit.js` | 网页语言文件不得自存文案 |
| 副本一致性 | `node scripts/sync-shared-modules.js` | 两端副本逐字节一致 |
| 网页文案审计 | `node scripts/user-visible-copy-audit.js --localization-prefix=web/ --strict-localization` | 硬编码中文为 0 |

浏览器测试用 `page.route` 拦截 `/api/**` 返回固定数据（`web/tests/e2e/fixtures.js`），因此不需要数据库即可运行；
真实服务端链路的端到端验证仍需人工用真实账号登录一次。

## 8. 发布链路

1. 推送 `main` → GitHub Actions 先跑 `audit-and-test`（含上面的全部检查与浏览器测试）。
2. 通过后 `deploy-production` 连生产：`server/scripts/deployProduction.sh` 在 release 内执行 `npm ci` 与 `npm run build`，
   产物在 `<release>/web/dist`；**缺少 `index.html` 就失败关闭**，不切换 `current`。
3. 切换前通过 `scripts/retain-web-assets.js` 保留最近 5 个旧版本的哈希资源（128 MiB 上限），让已打开网页仍能加载后续页面；新入口不被旧文件覆盖。每次发布把 release 根目录设为 `711`、网页子树 `755`、静态文件 `644`，让 Nginx 运行用户能读到。
4. Nginx 用 `location ^~ /web/`（`^~` 不能省，否则会被站点里匹配 `.js`/`.css` 的正则位置块抢走）指向
   `/home/ubuntu/whusu-smart-workspace-current/web/dist/`；这段配置与"家目录可穿过权限"是一次性配置，见 `docs/deployment-automation.md`。
5. 回滚就是切回上一个 release 的软链接，网页与后端一起回退。

## 9. 已经踩过的坑（改之前先看）

1. **玻璃模糊会静默失效**：CSS 压缩把同一规则里的 `backdrop-filter` 与其前缀写法当成重复声明，只留下前缀版本，
   浏览器读到的计算值是 `none`，卡片就"平"了。现在标准属性单独声明，前缀只放在 `@supports` 里；`parity-audit.mjs` 会核对计算值。
2. **底部组织名不能取会话组织**：小程序底部是固定品牌常量 `common.organizationName`（"武汉大学学生会"），
   不是当前登录组织。网页一度取了会话组织，线上显示成"武汉大学第四十四届学生会"。现在底部统一引用语言库常量，
   并且有测试断言"底部第二行必须等于语言库常量，且不得等于当前组织名"。
3. **网页语言文件必须由生成器产出**：在 `web/src/locales/zh-CN/` 下放任何手写文件都会被单一来源检查判失败。
4. **共享语言库的键是平铺的**：生成器把嵌套对象摊平，页面里要用 `copy.messages.view.todos` 这类层级写法时，
   靠 `web/src/runtime/localeAliases.js` 兜住；新增模块时注意同时更新别名层的分组键。
5. **路由的 `meta.title` 容易引用不存在的键**：曾写成 `copy.login.view.navigationTitle` 导致整站白屏，改完务必跑一次真实浏览器页面检查。
6. **本机跑 Playwright 要指定浏览器**：`PLAYWRIGHT_CHANNEL=chrome`（或 `msedge`），否则会卡在浏览器下载。
7. **4173 端口可能出现 TIME_WAIT**：上一个预览进程刚被杀掉时立刻跑测试会报"端口被占用"，等几秒再跑。

## 10. 还没做完的部分（交接时必须知道）

- **签名与印章在附件上的定位**、PDF 叠加、验签报告的图纸级展示仍限小程序；网页遇到这类审批步骤会明确提示去小程序，不给会造成错误签署的操作。
- **管理端尚未全部完成**：评分活动、管理权限与部门/职能组/身份类别已支持维护；评分模板/规则/结果公示、审核、系统配置、成员批量与账号治理等仍有未实现操作。
- **微信相关能力不做**：微信登录、扫码登录、扫一扫、绑定邀请在网页端一律不提供。
- **消息筛选已补充组织范围**；通知跳转成功后的已读回执覆盖审核详情、场地待审批列表与本人借用详情，其他目标仍需逐项核对。
- **浏览器测试覆盖手机、Pad 竖屏和电脑**，布局测试另检查 310、390、768、1280px；真实手机与 Pad 触控尚未完成现场验证。
- **真实账号只读核查已经开始**，用户自行登录；未在生产创建测试申请、审批或修改资料。
- 视觉观感最终仍需人工确认（自动核对只能保证取值一致，不能替代人眼）。

## 11. 接手后的第一件事

1. `git log --oneline -8` 确认当前提交，`cd web && npm run build` 与 `npm run test:e2e` 跑通。
2. 打开 `https://accumulation93.com/web/` 用真实账号登录一次，逐页点一遍，把与小程序不一致的地方记下来。
3. 改文案一律走第 4 节的流程；改视觉先读 `docs/web-ui-parity.md`，再跑 `parity-audit.mjs`。
4. 用户可见的问题修完后，回到 `docs/failure-register.md` 登记。


## 2026-10-09 本轮核查补充

- 顶栏恢复小程序的标题与返回入口，移除网页自加的品牌版本、身份信息和全局导航。场地顶层恢复三个页签。
- 审批、撤回、签名操作区分 HTTP 成功和业务成功；审核详情成功建立后才标记对应通知已读。消息范围筛选与部分失败回读已接入。
- 本人补充资料按照共享模板提供输入并保存回读；测试使用隔离的浏览器模拟响应，未在生产写入资料。
- 本人资料恢复小程序单卡布局：姓名与本人学号同排，部门、身份类别和职能组各占完整行；读取失败保留最近内容并冻结保存，原地重试成功后恢复。三档浏览器视口已检查，真实设备触控未完成现场验证。
- 本人资料日期复用 `shared/hrProfileDate.js`，日期按 `YYYY.MM.DD` 显示，日期时间分别选择；未修改的值不再在载入时缩短到分钟，保存其他资料保留原有秒数。选择结果按系统时区生成 UTC，不依赖浏览器时区。
- 管理端账号状态读取 `auth.status`，旧认证目录地址跳转人事成员目录；尚未完成管理端各项编辑、批量治理功能。
- 管理权限目录已按真实 `list` 响应恢复，并使用三段编辑窗口和与小程序对应的开关；人数回到标题右侧，Pad 横屏目录两列，关闭恢复卡片焦点。保存失败保留选择，只提交可编辑项，成功回读列表，保存期间阻止离页；编辑时切换角色提示先保存或取消。权限操作已通过隔离浏览器测试，未修改生产账号权限；其他管理功能仍需继续补齐。
- 管理入口恢复小程序各子应用与权限页签，人事入口不再打开本人资料。三类岗位字典恢复原地维护、删除确认与引用阻止，切换页签保留各自草稿，保存失败保留输入、成功回读；保存后读取失败的状态跨页签保留，防止重复创建，离开管理页或切换组织/角色清空。模拟接口测试不等于生产写入验收。
- 评分活动恢复原地新增/编辑、设为当前、暂停恢复与删除确认，使用 `listScoreActivities/saveScoreActivity/setCurrentScoreActivity/toggleActivityPause/deleteScoreActivity`。活动编辑不改暂停状态，页签切换保留草稿，成功后回读失败禁止重复保存；共享删除提示与服务端历史保护一致。其余评分管理页签仍待补齐。
- 评分目录恢复活动摘要、三项统计、身份类别分组、整卡进入与必要岗位标签；返回期间保留目录并立即重新读取，离开模块或工作角色变化销毁保留内容。已补“目录点击、填写提交、返回目录、重新打开读回分数”的模拟完整链路；读取失败支持原地重试，未提交分数离页提醒与小程序一致。填写页恢复小程序信息层级与快捷/数字键盘，切题同步物理键盘焦点，Pad 横屏键盘在右侧；结果公示与评优名单仍待补齐。
- 权限目录与详情接口不再返回他人学号，小程序同步取消该处学号展示与搜索；两端共用“搜索姓名或管理权限”。微信开发者工具预览编译主包及 6 个分包成功（总计 2327778 字节），未发布小程序正式版本，真实设备触控未完成现场验证。
- 场地待审批已补原地详情、通过与驳回窗口、下一步岗位选择和成功回读，流程卡由待审批与审批历史共用。成功与失败链路在浏览器模拟响应中验证，未对生产申请执行审批。
- 借用申请改为场地页内弹窗，恢复事由、同日时间条、快捷时长、流程和首步岗位指定；旧 create 地址复用同一组件。模拟提交成功后回读借用列表，不在生产制造测试申请。
- 借用时间输入恢复小程序小时/分钟分格与数字键盘，使用相同的区间检查，禁止越过占用；门户通知独立加载，确认窗口共享滚动与焦点恢复，并使用小程序短确认窗口宽度。
- 周日程已补七列时间表、切换周、占用/活动详情、点击空闲时段带入借用弹窗；跨组织仅占用记录不会展示借用人。我的借用与审批历史共用完整详情和流程进度，历史列表恢复整卡进入。
- 仍待完成：管理端完整操作、签章定位与全部页面逐项现场对照。这些不能以当前构建和自动化测试通过宣称已完成。
- 纯网页发布新增静态目录切换分支；服务端实际运行版本与网页版本分别核对，不能要求前端发布后 PM2 目录也换到新版本。
