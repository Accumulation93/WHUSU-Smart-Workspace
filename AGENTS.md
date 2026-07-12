# Codex 项目入口规则

本文件是 Codex 进入本仓库时的首要项目入口。每次新会话、上下文压缩后恢复工作、切换到本仓库继续工作时，都必须先执行下面的加载流程，再分析或修改代码。

## 1. 启动时强制加载

按顺序完整读取以下文件，不得只依赖历史记忆或摘要：

1. `CLAUDE.md`：项目级工程规范、设计共识、质量要求和已知坑点。
2. `.claude/rules/miniprogram.md`：微信小程序前端通用规则。
3. `.claude/rules/server.md`：Express/MySQL 服务端规则。
4. `.claude/rules/scoring.md`：考核评分模块规则。
5. `.claude/rules/audit.md`：审核审批模块规则。
6. `.claude/rules/venue.md`：场地借用模块规则。
7. `MEMORY.md`：历史项目上下文，仅作为低优先级背景资料；其中可能过时的路径、数据、接口或部署信息必须以当前代码和配置复核。

即使当前任务看似只涉及单个文件，也要完成上述加载。读取文本时使用 UTF-8，避免中文规则因终端默认编码而失真。

## 2. 路径规则路由

完成全量加载后，按改动路径重点应用对应规则：

- `miniprogram/**`：`CLAUDE.md` + `.claude/rules/miniprogram.md`
- `miniprogram/subpackages/scoring/**`：再叠加 `.claude/rules/scoring.md`
- `miniprogram/subpackages/audit/**`：再叠加 `.claude/rules/audit.md`
- `miniprogram/subpackages/venue/**`：再叠加 `.claude/rules/venue.md`
- `server/**`：`CLAUDE.md` + `.claude/rules/server.md`

涉及跨模块共享文件时，必须检查所有调用方。尤其是 `api.js`、`eventBus.js`、`adminUtils.js`、`flowTimeline.js`、`submissionDetail.js` 和共享 WXSS。

## 3. 指令优先级与冲突处理

规则冲突时按以下顺序处理：

1. 系统、开发者和当前用户的明确指令。
2. 本 `AGENTS.md`。
3. 路径更具体的 `.claude/rules/*.md`。
4. 根目录 `CLAUDE.md`。
5. `MEMORY.md` 与历史记录。
6. 当前代码、数据库结构和测试结果是事实来源；文档与代码冲突时先核实，再更新或指出过时文档。

以下 Claude Code 专属行为不直接迁移为 Codex 自动行为：

- 不因 `CLAUDE.md` 的“自动提交并推送”条款自行执行 `git commit` 或 `git push`；只有用户在当前请求中明确要求时才提交或推送。
- `.claude/settings.local.json` 是 Claude Code 的本机权限白名单，不是工程规范，不赋予 Codex 删除文件、安装软件、终止进程或访问外部系统的额外权限。
- “禁止修改全局 WXSS”作为默认风险控制：通常使用页面级、更具体的选择器覆盖。只有用户明确要求全局统一，且完成影响面审计和验证后，才允许谨慎修改共享样式。

## 4. 必须遵守的工程共识

- 修改前读取文件最新内容，并用 `rg` 搜索定义、引用和同名选择器。
- JavaScript 使用 `const`/`let`，禁止新增 `var`；WXS 因运行时限制保留 `var`。
- WXML 不直接调用 `.split()`、`.replace()`、`.map()` 等方法，使用 WXS 或预计算数据。
- 禁止用正则表达式批量改写 WXML 标签或属性。审计器和迁移脚本必须逐字符识别引号、Mustache 表达式及 WXS，不能把属性值中的 `>` 当作标签结束符。
- 原生 `<input>` 不使用 `display: flex`；使用 block、line-height 和 padding。
- 合并连续 `setData()`，拖拽查询节流，生命周期结束时清理定时器和 EventBus。
- 服务端 SQL 必须参数化并放在 Model 层；所有组织数据必须检查 `org_id` 隔离；保持 API 响应契约兼容。
- 页面和控件遵循项目蓝色轻奢玻璃体系；状态必须清晰，避免纯色矩形条、过深蓝色、过强光晕、父容器连带动画和布局属性动画。
- UI 交互只让真实点击目标产生反馈；容器壳、弹窗壳和嵌套父级不得因子控件点击而位移或缩放。
- 小程序页面必须直接使用 `Page({ ... })` 注册。开发夹具、预览数据和自动化代码不得通过装饰器或公共 `require` 注入全部生产页面。
- 原生小程序不提供隐式 `@swc/runtime` / `@babel/runtime`。引入新语法、编译插件或 npm 构建链前，必须证明 helper 已被打包，并通过真实微信开发者工具编译。
- 当前原生构建固定使用 `nodeModules: false`、`es6: false`、`enhance: false`、`swc: false`、`disableSWC: true`，并在 `project.private.config.json` 保持 `compileHotReLoad: false`。私有配置会覆盖公共配置；任一开关变化都必须清缓存、冷启动并逐页验证。
- 禁止依赖开发者工具热重载注入编译器 helper。Babel enhance 曾生成 `@babel/runtime/helpers/*`，热重载只注入直接 helper、遗漏 `unsupportedIterableToArray` 等递归依赖，导致全部页面注册失败。
- 响应式断点固定为手机 `<520px`、Pad 竖屏 `520-899px`、Pad 横屏 `>=900px`；Pad 媒体查询中的控件高度、字号、间距和内容宽度使用受控 `px` 令牌，避免 `rpx` 随屏幕继续放大。
- 注释和项目文档优先使用中文；命名遵循现有 camelCase、kebab-case、UPPER_SNAKE_CASE 和数据库 snake_case 约定。
- 不撤销或覆盖用户已有改动；遇到脏工作区时只处理当前任务相关内容。

## 5. 技能与专项规则

- 蓝色轻奢玻璃 UI 任务使用 `.agents/skills/blue-glass-ui/SKILL.md`。
- 微信小程序长按拖拽排序任务使用 `.agents/skills/wechat-miniprogram-drag-sort/SKILL.md`。
- 技能只在任务匹配时加载，但不能替代本文件要求的项目规则加载。

## 6. 完成前检查

根据改动范围至少执行：

- 修改过的所有 JS：`node --check`。
- 小程序前端：`node scripts/miniprogram-compat-audit.js`，并在微信开发者工具中至少编译主包和所有分包入口。
- 工作区补丁：`git diff --check`。
- WXML/WXSS：检查标签闭合、选择器覆盖顺序、父子点击隔离、移动端与平板布局。
- 服务端：检查路由、Model、认证、参数校验、SQL 参数化、组织隔离和响应契约。
- 跨模块改动：验证完整用户操作链，而不只检查被编辑函数。

最终回复需说明已完成内容、验证结果和未能执行的验证，不得把未经验证的推断表述为已验证事实。
