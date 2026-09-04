---
name: ui-kit-manager
description: "Plan, bootstrap, continue, or take over software projects by creating or using agent-readable project foundation docs, maintenance indexes, architecture summaries, local startup/deployment notes, data/API maps, feature maps, UI kit rules, and AGENTS.md/CLAUDE.md instructions. Use when the user has a vague product idea and wants to create an app, website, SaaS, dashboard, desktop app, tool, mini program, internal system, or AI workflow; when the user says they do not understand code and wants guided project planning; when the user asks to scaffold, start, continue, finish, normalize, standardize, organize, document, understand, audit, or take over a project; when Codex, Claude Code, Cursor, Gemini CLI, or similar coding agents need a shared project maintenance index before development; or when a frontend project needs UI provider, component, theme, motion/animation reference, or page-template rules."
---

# UI Kit Manager

Use this skill as a project foundation manager. Despite the historical name, it now covers the beginning of a project, continuing an in-progress project, and the first pass on inherited projects. The UI kit remains one module inside the broader project plan.

## Operating Promise

- Match the user's stage before editing: idea planning, new project setup, in-progress continuation, takeover, or UI kit work.
- Ask plain-language questions when the user only has an idea.
- Scan existing projects read-only before proposing takeover documents.
- Create or update files only after the user approves the proposed file plan.
- Never modify source code, package/dependency files, config files, environment files, migrations, databases, deployment settings, billing logic, or runtime data without a separate explicit approval for that code/config change.
- Keep project knowledge agent-neutral, then add thin adapter files for Codex, Claude Code, Cursor, Gemini CLI, and similar agents.
- Do not expose secrets. Detect `.env` and credential files by name only unless the user explicitly asks to inspect a safe example file such as `.env.example`.

## First Decision

Choose one entry mode:

| User situation | Mode | Required action |
| --- | --- | --- |
| User has a vague idea, no clear project yet | `idea-intake` | Ask the 10 plain-language questions below before writing files. Then read `references/new-project-bootstrap.md`. |
| User wants a new project planned, but has not authorized creating code yet | `foundation-planning` | Clarify scope, propose project foundation docs, wait for approval before creating files. Read `references/new-project-bootstrap.md`. |
| User explicitly asks to create, scaffold, or initialize a new project | `new-project-implementation` | Clarify only missing high-impact decisions, choose conservative defaults, create the project only within the authorized scope, and include foundation docs/adapters as part of the scaffold when practical. Read `references/new-project-bootstrap.md` and any implementation-specific repo instructions. |
| User points at an existing in-progress project and asks to continue, finish, fix, or add a feature | `in-progress-continuation` | Do a lightweight scan of the existing project and relevant docs, then continue the requested work within the user's code-change approval. Do not require a full documentation foundation first unless the user asked for takeover/standardization or the missing docs create real execution risk. Read `references/feature-development.md` and `references/existing-project-extraction.md` as needed. |
| User points at an existing repo or says to take over/understand/organize it | `existing-project-takeover` | Run a read-only scan, summarize facts, propose a maintenance-index plan, wait for approval before creating docs. Read `references/existing-project-extraction.md`. |
| User wants to add a feature after a foundation pass | `feature-development` | Read the shared maintenance docs first, preserve boundaries, then implement only after the task approval covers code edits. Read `references/feature-development.md`. |
| User asks for Codex/Claude/Cursor/Gemini compatibility | `agent-compatibility` | Keep shared docs neutral and generate adapter rules. Read `references/agent-compatibility.md`. |
| User asks only about UI consistency, components, provider, theme, or page templates | `ui-kit-module` | Use the original UI kit workflow. Read `references/provider-selection.md` and `references/feature-development.md` as needed. |
| User asks to create or update docs/rules/templates | `artifact-authoring` | Read `references/artifact-templates.md` and `references/maintenance-index.md`. |

If the situation is ambiguous, ask one short boundary question: "Are we planning a new idea, creating a new project, continuing an existing project, or taking over a project directory?"

## In-Progress Project Continuation

Use this when the user has already started a project and wants progress on a concrete task.

1. Confirm the project root and run `git status --short --branch` when inside Git.
2. Read existing `AGENTS.md`, `CLAUDE.md`, README, package/build configs, and any maintenance docs if present.
3. Inspect only the files relevant to the requested task plus nearby examples.
4. If the user asked for implementation, proceed with the code/config/doc changes that are inside the requested scope.
5. Do not block small or clear implementation work on creating a full maintenance document set.
6. Recommend a foundation pass only when the project is hard to reason about, multiple agents will work on it, the user asks for standardization, or the change affects durable architecture, startup, data/API, UI kit, or maintenance rules.
7. Update maintenance docs only when they already exist and the requested change intentionally changes the documented architecture, commands, contracts, feature map, or UI rules.

## Idea Intake Questions

When the user only has a vague idea, ask these 10 questions in the user's language. Avoid technical terms unless the user uses them first.

1. What do you want to build in one sentence?
2. Who will use it: you, customers, staff, admins, creators, students, or someone else?
3. What are the three most important things users should be able to do first?
4. Do you have any reference products, screenshots, websites, apps, or rough styles you like?
5. Should the first version be a website, mobile-friendly web app, desktop app, browser tool, internal dashboard, or are you unsure?
6. Does it need accounts or roles, such as admin, normal user, customer, or staff?
7. What information should it save, such as orders, products, customers, articles, images, files, messages, or tasks?
8. Does it need to connect to outside services, such as WeChat, payments, maps, email, Feishu/Lark, OpenAI, spreadsheets, or another platform?
9. What should the first version be good enough for: demo, personal use, internal team use, customer trial, or paid launch?
10. What must it avoid: paid services, foreign services, complex setup, real customer data, heavy maintenance, public deployment, or anything else?

After the user answers, summarize the product in plain language and propose the first document batch. Do not write files yet unless the user has already authorized file creation.

## Existing Project Takeover

Default to read-only.

1. Confirm the repository root and run `git status --short --branch` when inside Git.
2. Run the foundation scanner if useful:

   ```bash
   python <skill-dir>/scripts/scan_project_foundation.py --project <project-path>
   ```

3. Inspect representative files only: package/build configs, README/docs, source roots, route/entry files, Docker/deployment files, data/API boundaries, and existing agent rules.
4. Report facts and unknowns.
5. Propose the maintenance-index file plan.
6. Wait for user approval before creating or updating docs.
7. Request a separate explicit approval for any code/config/dependency change.

## Foundation Artifacts

Adapt paths to the project and choose one naming convention before writing files. Keep the index path identical across shared docs and agent adapters.

- Use localized file names when the target project or user language favors them.
- Use English file names when the target repository already uses English docs.
- Use `references/artifact-templates.md` and `references/maintenance-index.md` for the concrete file set.
- Always create one shared maintenance entrypoint, then point `AGENTS.md`, `CLAUDE.md`, and any other adapter to that same entrypoint.

## Agent Compatibility

- Put durable project facts in neutral docs under `docs/`.
- Keep `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, or similar files as thin adapters that point agents to the shared docs.
- Avoid duplicating long architecture text across agent files.
- In adapter files, list the read order, safety rules, test commands, and code-change approval boundaries.

## Verification

For documentation-only work, verify file existence, link/read order consistency, and that agent adapter files point to the shared index. For scanners, run representative `--json` and Markdown outputs. For code changes in a target project, run the narrowest meaningful checks only after separate code-change approval.

## 硬规范：签名板、白板与书写定位坐标一致性

涉及手写签名、电子印章、文件预览和签名定位的任何改动，都必须先读取
`references/ui-kit-standards.md` 中的“签名坐标契约”，并同时检查小程序组件、定位弹窗、服务端图片/PDF 合成和 PDF 签名域四个调用面。

以下规则不可被页面视觉需求、设备适配或临时修复覆盖：

- 可视白板和实时笔迹必须全部使用普通 `view`；严禁使用可视原生 Canvas 实时绘制。Canvas 只能作为 1px、透明、不可交互的导出节点，在确认签名时使用。
- 白板、触点与实时笔迹统一使用视口 CSS px（逻辑像素）绝对坐标：白板用 `.fields({ size:true, rect:true })` 得到绝对边界，触点只读取 `clientX/clientY`，裁切后保存为 `screenX/screenY`。不得引入 scrollTop、状态栏、标题栏、弹窗 top、DPR、rpx 或任何经验偏移。
- 实时线段的事实数据必须保存绝对端点；普通视图渲染时才根据当前 rect 减一次白板 `rect.left/top`。确认导出时再次从绝对端点投影到隐藏 Canvas 局部坐标，buffer 与白板宽高保持 1:1，禁止 DPR 放大。
- 白板完成布局、尺寸变化或弹窗重新显示后必须重新测量 rect；白板与笔迹层必须裁切溢出。Canvas 不得绑定触摸。布局变化只能更新当前 rect，不能改变坐标定义或把局部坐标写入事实数据。
- 书写位置只能保存为相对于实际文件预览图的归一化中心点 `positionX/positionY ∈ [0,1]`。点击计算必须读取预览图自己的 viewport 矩形，不能用弹窗、scroll-view 或页面矩形代替。
- 预览中的签名图片必须保持原始宽高比，禁止用固定 `rpx` 高度模拟笔迹；服务端图片合成、PDF 合成和 PDF 签名 Widget 必须使用同一个归一化中心点，再各自执行唯一一次坐标系转换。
- `clientX/clientY` 仅与 viewport 矩形配对；`pageX/pageY` 不得直接减 `client` 矩形。滚动容器、页面滚动和 PDF 页码切换不得改变已保存的归一化坐标。
- 任何坐标修复必须用真实鼠标/触控事件验证，不得直接调用组件方法、隐藏 Canvas 或绘图 API伪造验收线。必须确认指针按下点、移动轨迹和普通视图笔迹逐点重合；同时验证导出图片、预览定位和最终文件。未完成对应范围的现场验证不得宣称通过。

## 文档审计与事实来源

- `AGENTS.md` 是交付门禁和读取顺序入口；`docs/ui-kit.md` 是视觉规范事实来源；`references/ui-kit-standards.md` 是本技能维护的硬契约索引；模块规则只补充模块边界，不得与上述契约冲突。
- 用户明确要求“人工审计/不允许脚本”时，只能用自然语言逐段阅读文档并定向核对当前代码、配置和现场行为；脚本、scanner、审计命令只能在用户未禁止时作为完成后的回归门禁，不能替代人工判断。

## 硬规范：人事领域模型、工作角色与内部上下文

涉及人事、账号、组织切换、人员筛选、审核、场地或评分的任何改动，必须先读取 `docs/architecture.md`、`docs/features.md` 和 `references/ui-kit-standards.md` 的“人事领域、工作角色与内部上下文契约”。以下规则不可被兼容字段或页面文案覆盖：

- 自然人跨组织唯一；全局账号属于自然人；组织成员关系表示自然人与组织的关系；岗位属于组织成员关系。允许在职成员暂时没有岗位。
- 岗位固定为岗位性质、部门、身份类别和可选职能组。禁止自由文本岗位名称；`assignmentLabel` 由“身份类别 · 部门 · 职能组”生成，缺少职能组时省略。非空职能组必须属于岗位部门。
- `contextId`/`activeContextId` 是内部工作上下文标识，`assignmentId` 只表示岗位，`identityCategoryId/Name` 只表示身份类别。跨岗位与管理权限的通用用户界面统一称“工作角色”，具体详情分别称“岗位”与“管理权限”；“工作上下文”、`contextId`、快照、修订、归档等实现词不得进入用户界面。旧 `identityId` 只能兼容读取，禁止参与新判权或继续写入。
- 审核、场地、评分动作只认当前岗位；无岗位成员可见、可维护资料，但没有岗位规则驱动权限。指定某个自然人审批时必须同时固化其 `assignmentId`，禁止“只指定人、任一岗位都可处理”。审核模板条件、首步指定和后续指定的选择器最小选项必须是“人员 · 岗位”，完整显示岗位标签并同时提交人员 ID 与岗位 ID；同一人的不同岗位不得合并成含糊选项。所有历史保存不可变组织、上下文和岗位快照，调岗不能改变历史。
- 人事目录一人一卡并合并在职与已离开成员，默认显示全部；不得建立独立离任页签或第二套目录。岗位在详情中分组，无岗位显示中性气泡；已离开使用灰蓝气泡、只读详情和离任前岗位，仅允许重新加入为在职无岗位。资料审核状态与完整度分开；生效资料维护和待审资料审核分权，驳回原因必填。
- 成员查询使用“查询字段 + 关键词 + 卡内高级筛选 + 排序”，在完整权限目录上本地执行。同类多选 OR、不同类别 AND，岗位性质/部门/身份类别/职能组必须在同一岗位元组内同时匹配；批量选择和导出只作用于当前可见结果。
- “离开当前组织”停用成员关系和岗位并撤销该组织普通管理员授权、权限覆盖和管理员上下文会话，但不删除自然人、全局账号或历史，也不修改全局超级管理员治理权。永久删除必须先做全引用预检，业务记录阻断、允许的未执行引用事务清理、零候选规则停用；组织删除不得影响其他组织，彻底删除自然人仅限超级管理员且只保留去标识审计。组织成员删除同样必须保护最后有效超级管理员，预检与执行使用同一安全判断，执行在全局治理锁内复核。冻结、解绑、初始化或修改登录口令、重置全局账号仅限 `auth.accounts.global_manage`；在职成员尚无账号或微信绑定时也允许初始化口令，首次口令登录验证成功后只补充空缺的微信绑定，不得替换或抢占既有绑定。
- 部门、身份类别、职能组被任何岗位、规则、快照或历史引用后禁止删除，并返回引用分类和数量；不得自动替换或通过停用规避完整性。
- 人事查询字段、关键词、排序、高级筛选和批量工具共同置于 `.section-control-card`；高级筛选直接在卡内展开，已选条件使用可清除的紧凑气泡。永久删除只放在详情危险区，预检弹窗采用固定标题、滚动正文和固定操作栏。长弹窗内容驱动高度并受视口安全上限约束，三档设备都必须能滚动到底。

## 硬规范：绝对时间与系统显示时区

涉及数据库时间、API 时间、列表/详情时间或系统时区的任何改动，必须先读取 `docs/architecture.md` 与 `references/ui-kit-standards.md` 的“绝对时间、日期型值与视图契约”。

- 绝对时间统一以 UTC 存储并由服务端返回 ISO UTC；`system_config.timezone` 只控制显示。小程序使用系统下发的 `systemTimezoneOffset` 与配置版本，禁止跟随设备本地时区。
- `YYYY-MM-DD`、`HH:mm`、时长、提前量和周期规则不是绝对时间，不做时区转换。列表显示到分钟，详情/验签/安全记录显示到秒。
- WXML 只渲染预计算 `*Text` 字段，禁止直接显示原始时间或 ISO `T...Z`；页面不得自行调用 `toLocaleString/toLocaleDateString`。
- 历史迁移按已确认写入来源分类，无法判断的记录进入逐记录审计；服务端按“记录标识 + 原始绝对时间”下发字段级 `*ReviewStatus`，前端逐字段标记待核对。禁止猜测移动、用全局状态污染全部时间或漏传状态。未通过时间审计、展示映射计数、跨时区测试或迁移分类预检不得发布。

## 硬规范：高危操作、生命周期与历史事实

- 冻结、解绑、重置凭据、撤销恢复码、永久删除、删除规则/用途等高影响操作必须先展示受控确认层，明确冻结的目标、范围和数量；取消不得发请求，执行中禁止目标漂移和重复提交。红色语义不能替代确认。
- 页面、Behavior、组件创建的计时器、轮询、重试和 EventBus 必须保存句柄/稳定回调，并在隐藏与卸载时清理；迟到回调更新界面前必须核对组织与 `activeContextId`。
- 文本长度限制必须按 Unicode 码点计算，前后端上限和提示完全一致。
- 审核轮次/签名、场地审批和岗位快照属于不可变历史事实。评分记录只保留当前结果；重新评分必须在事务内原子覆盖当前答案和汇总值，不保存旧评分副本。允许保留不可见的并发版本号防止过期页面覆盖，但不得向用户表述为修订或旧版本。评分解释仍只使用该记录提交时固化的题目与规则依据，缺失依据时明确失败关闭，只能通过幂等迁移和审计修复。
- 管理附件的读取、预览与下载必须同时通过组织、资源归属和细粒度权限校验；临时上传需有单文件、单账号、全局配额及跨进程原子登记。未认证请求不得先进入大请求体解析或昂贵数据库路径。

## 硬规范：页面与控件间距所有权

涉及页面留白、卡片间距、表单行距、按钮位置或控件文字内距的任何修改，都必须先读取 `references/ui-kit-standards.md` 的“间距所有权契约”，并按手机、Pad 竖屏、Pad 横屏分别核对。

- 一段空白只能有一个所有者：页面边缘归 `.page`，卡片边缘归卡片 padding，字段间距归父级或统一相邻项规则，正文到操作区归 `.ui-dialog-footer`。禁止父 padding、子 margin、空白节点三者叠加补同一距离。
- 表单使用 `--ui-field-gap`、`--ui-label-gap`、`--ui-inline-gap`；普通控件内距使用 `--ui-control-padding-*`，紧凑控件使用 `--ui-compact-padding-*`。不得通过空格字符、固定高度配固定行高或一次性魔法数制造对齐。
- 纵向 Flex 表单复用曾用于双列操作行的按钮类时，语义按钮必须显式重置为 `flex: none`；全宽按钮同时使用 `box-sizing: border-box` 和 `width/min-width/max-width: 100%` 锁定横轴。禁止让 `flex-basis: 50%` 在 `flex-direction: column` 中被解释为高度，造成按钮异常增高或只占半宽。审计必须检查最终级联值，不能只看局部类是否写了 `width: 100%`。
- 弹窗提交、保存、取消按钮必须位于滚动正文之外的直接子级 `.ui-dialog-footer`。正文不为按钮追加底部 padding，按钮自身不追加上下 margin；正文到按钮、按钮到底边必须由 footer 和外壳分别承担。
- 页面底部安全区只由 `.page` 或明确的固定操作栏承担；普通页面不得覆盖成固定 `padding-bottom`，普通卡片不得为视口高度预留空白。专业工作区的例外必须局部命名并在代码注释中解释覆盖层关系。
- 审计必须逐页读取 WXML/WXSS，用自然语言说明当前空白的业务语义、所有者和设备差异；脚本只能定位候选和做回归。没有现场核对首末项、长文案、滚动到底和安全区，不得宣称间距验收完成。

## 硬规范：控制表面与卡片小操作

- 页面级分区标题、该分区的二级页签和成组操作不得直接暴露在 `.page`、`.admin-workbench`、`.section-stack` 等纯布局容器中；必须共同归属于至少一层明确的 `.section-control-card`、`.card`、`.edit-box` 或等价玻璃表面。纯布局层不算视觉包裹，禁止“零容器”标题、页签或按钮组。
- 同一分区的标题、二级页签和批量操作优先放入同一张 `.section-control-card`，保持标题在前、页签居中、操作在后；不得为了满足包裹要求给每个控件各套一张同质卡片，也不得引入新的滚动容器。
- 列表卡片上的查看、编辑、删除、移除等小操作统一使用 `.card-actions`。默认独立成行、顶部细分隔、右对齐并复用人事成员卡片按钮样式；操作控件圆角取 `--ui-control-radius`，危险操作继续使用红色语义。只有经影响面核对且绝无标题/展开控件碰撞时才可附加 `.card-actions--inline`。
- 卡片小操作禁止通过 `position:absolute`、固定 `top/right` 或负 margin 塞进标题、状态或展开按钮区域。可展开卡片必须按“摘要/展开入口 → 操作行 → 展开内容”的普通文档流排列。
- 全局 UI 审计必须把裸露 `section-title`、`section-stack` 直属标题/页签/按钮组、未迁移的 `list-actions` 和审核模板绝对定位操作视为失败；手机、Pad 竖屏、Pad 横屏均须核对长标题、按钮换行、展开与收起。
- 同一视觉行中的日期/时间选择器、筛选按钮、清除/重置按钮必须由 `.ui-inline-control-row` 统一 `align-items:center`，可交互子项统一使用 `.ui-inline-control` 和 `--ui-inline-control-height`。带标签的筛选字段列使用 `.ui-inline-field-row` 对齐字段底边，并让其 `.compact-picker-value` / `.field-input` 共享同一最终高度；原生 `input` 仍须 `display:block`。禁止任何子项以私有 `margin-top/bottom`、不同 `min-height` 或固定行高偏离共同基线；换行后每一行仍按同一高度对齐。
- 标题旁的宫格/列表等二态视图切换属于 `.ui-compact-segmented`，子项使用 `.ui-compact-segmented-item` 和 `--ui-compact-height`；不得复用整行主页签的 `--ui-tab-min-height`、整行均分或 Pad 横屏 `50px` 规则，避免挤压标题。
- 管理工作台的顶层页签必须保持全部可达：不超过五项时在同一玻璃分段控件中单行等宽排列，子项可收缩但文字不得拆字；禁止末项换到孤立第二行、被裁切或因权限刷新看似消失。超过五项时采用明确的横向滚动，并让当前项自动进入可视区；三档设备都要实际点击首末页签验收。
- 详情页返回已有列表时采用“内容常驻、后台刷新”：已有卡片不得被刷新中的整页 loading 遮住。仅首次进入、查询口径变化或工作角色切换使旧数据失效时允许清空并展示首屏加载；现场验收必须包含“进入详情再返回”的连续操作。
- 全局审计发现既有同行控件时必须检查父级 `align-items`、子项最终物理高度、上下 margin 和设备覆盖顺序；不能只看源码中是否写了 `align-items:center`，还要排除共享同名选择器造成的级联偏移。

## 硬规范：卡片式选择器

- 卡片式人员、岗位、身份类别、部门、职能组、规则和对象选择器统一使用 `.selection-option-card`。每张卡只能表示一个可选业务单元；人员按岗位选择时，“人员 · 岗位”是一张卡，同一人的不同岗位必须拆成不同卡。
- “选择/取消”必须使用独立的 `.select-chip.selection-card-toggle`，并作为卡片内容的第一个可见子项固定在左上起始位；未选显示“选择”，已选显示绿色“取消”。候选列表与已选列表使用同一交互语言。
- 姓名、学号、岗位性质、部门、身份类别、职能组、岗位标签和状态气泡只表达信息，禁止承载选择事件、拼接“已选”前缀或替代选择/取消控件。卡片不得再使用整行 `.card-actions` / “移除”按钮表达取消选择。
- 选择控件不得嵌入姓名、身份或岗位文字内部。卡片正文必须 `flex:1; min-width:0`，选择控件固定不收缩；禁止 `width:100%` 的操作区进入不换行的媒体行，把姓名或标签压成逐字窄列。
- 人员按岗位选择时必须以 `assignmentId` 作为选中键，部门、身份类别、职能组筛选必须作用于同一岗位元组；只有明确写明为账号治理、认证授权等“按自然人授权”的选择器可以使用人员 ID。自然人授权选择器仍必须展示该人的全部岗位，并提供部门、身份类别、职能组三项筛选；三项条件必须由同一岗位共同满足，禁止退回顶层旧岗位快照。单击即进入下一页或选择后立即关闭的导航型单选卡不强制显示“选择/取消”，但信息气泡同样禁止伪装选择状态。
- 同一卡片还需编辑/删除时，把 `.selection-option-card` 作为卡片顶部的选择摘要区，编辑/删除放在摘要区之外的独立操作行；禁止让操作行与人员/规则正文争抢同一横向空间。
- 修改任何卡片选择器时必须全仓搜索同类选择器，并现场覆盖手机、Pad 竖屏、Pad 横屏的未选、已选、长姓名、多岗位、滚动到底和选择/取消往返；`scripts/ui-audit.js --strict` 必须拦截选择状态嵌入信息气泡、缺少左上选择控件或选择卡混入 `.card-actions`。

## 硬规范：媒体行图标、消息元数据与品牌页脚

- “左侧图标 + 多行正文 + 尾部操作”的媒体行必须使用固定图标槽、`min-width: 0` 正文和固定尾部操作。多行正文时整行 `align-items: flex-start`，图标对齐首组元数据或标题，禁止相对整卡垂直居中。
- 业务页面不得依赖 `ui-icon` 数值 `size` 在 Pad 上继续按 `rpx` 放大。共享图标必须通过 `sizeRole` 语义档位获得手机 `rpx`、Pad 竖屏 `px`、Pad 横屏 `px` 三套尺寸；图像本体必须受图标槽 `max-width/max-height: 100%` 约束。
- 门户和消息中心的来源信息禁止放进任意换行的 `flex-wrap` 袋。业务类别与岗位放在明确的上下文行且各自不拆字；组织名称与“当前”必须独占下一整行，组织名称 `flex: 1; min-width: 0`，当前标识固定不收缩。窄屏允许组织名称只在该语义行内按词自然换行，不能截断完整名称，也不能把组织名或“当前”挤成逐字碎行。
- 页面底部成组主操作使用 `--ui-page-action-gap`，不得复用较小的 `--ui-inline-gap`；品牌页脚自己拥有 `--ui-footer-gap`，不得依赖前一个控件的 margin。操作组与品牌区需要一个共同语义容器作为唯一间距所有者，页面 Grid 不得清零这两段间距。
- 修改相关区域后必须同时验收门户预览、消息中心、共享 Hero 和固定 px 图标槽调用，并在手机、Pad 竖屏、Pad 横屏检查图标占位、完整组织行、按钮间距和页脚留白；`scripts/ui-audit.js --strict` 必须覆盖这些契约。

## 硬规范：场地借用审批历史与详情统一

- 普通用户端必须在“待我审批”页签内提供可见的“审批历史”入口；不得把入口放在“我的借用”页或借用记录区域，也不得只对管理端提供。
- 审批历史详情、日程点击详情和我的借用点击详情必须复用同一个借用详情组件与数据形状，不得另起一套只显示审批事件的详情页。服务端必须先按当前组织、当前工作上下文、当前岗位和当前操作者匹配不可变审批快照，再返回可展示详情，不能因复用组件而放宽权限。旧记录缺少岗位快照时必须失败关闭并明确提示历史授权信息不足，禁止用自然人、管理员身份、`hr_info` 或当前岗位猜测授权。
- 借用详情的审批进展必须同时使用全部 `flowSteps` 与 `snapshots`；显示已完成步数取数据库当前步骤与已完成快照最高步骤的并集并限制在总步骤内，不能只信任可能过期的单一计数。后续步骤通过后，不得继续显示旧的“已完成 1 步”。

## 硬规范：消息中心批量清除

- 通知页签在存在通知时提供“全部清除”，必须二次确认；清除范围遵循当前组织/工作上下文，可访问多个组织时按当前消息范围逐组织执行。
- “全部清除”只删除通知记录，不得删除实时计算的待我审批事项；服务端必须按组织、收件人类型和收件人 ID 参数化删除，并返回部分组织失败状态。

## 硬规范：小程序主包与业务分包统一

- 主包启动壳统一物理放在 `miniprogram/subpackages/main/pages/**`，但必须注册在 `app.json.pages` 顶层；`subpackages/main` 不得写入 `app.json.subPackages`。包归属以 `app.json` 注册位置为准，不以目录名为准。
- 消息中心、评分、人事、审核、场地、组织和系统设置等业务页面必须注册在 `miniprogram/subpackages/<模块名>/pages/**` 的 `app.json.subPackages` 中，不得再把业务页注册到顶层 `pages`。
- 每个业务分包只能有一个明确的模块归属；跨模块的公共逻辑只能放在 `miniprogram/utils`、`miniprogram/components` 和 `miniprogram/locales`，共享 WXSS 放在 `miniprogram/subpackages/main/styles/**`。综合工作台壳若确实需要组合多个入口，也必须作为独立 `workspace` 分包页面，并通过可信路由进入，不能伪装成主包业务页。
- 路由迁移必须同时更新 `app.json`、门户卡片、可信导航、上下文守卫、服务端通知/待办目标地址、兼容测试和 WXSS 相对导入；禁止留下旧主包业务地址的隐式引用。
- 分包页面使用与当前位置匹配的相对 `require` 和 WXSS `@import` 路径；分包只能引用自身分包或主包资源，禁止跨业务分包引用。共享样式统一放在 `miniprogram/subpackages/main/styles/**`，兼容性审计必须检查路径存在性和包边界。
- 页面迁移后必须执行全量 `node --check`、小程序兼容性审计和微信开发者工具冷编译，确认主包与所有分包入口都能注册。
- 单页 WXML 不得无限堆叠功能块。新增结构使单模板接近编译复杂度门禁时，必须按业务边界拆成自定义组件并保持事件、样式与可访问性契约；禁止靠删除空白、改名或调整固定偏移临时规避。每次前端交付必须运行 `node scripts/wechat-template-runtime-audit.js`：本机存在微信开发者工具时，必须用其 Glass-Easel 编译全部 WXML，并再次解析生成代码，任何 `Unexpected token`（包括编译器把变量命名为 `if` 等保留字）均为发布阻断；无编译器环境至少执行单模板复杂度硬门禁，且不能替代开发者工具冷编译。

## 硬规范：提示与指引文案必须进入 locale

- 所有面向用户的提示、指引、校验反馈、空状态、Toast、Modal、确认文案、通知标题/描述、状态说明和导出标题，必须定义在 `miniprogram/locales/zh-CN/**` 或 `server/src/locales/zh-CN/**`；业务代码不得保留中文常量，也不得把中文句子拆成多个字符串再拼接绕过审计。
- 业务代码只引用语言资源并传入变量；用户输入、组织名称、场地名称、字段值和状态码不是语言资源，必须作为格式化参数传入，不能直接写入 locale。
- 完成前必须同时运行：
  `node scripts/user-visible-copy-audit.js --localization-prefix=miniprogram/ --strict-localization`、
  `node scripts/user-visible-copy-audit.js --localization-prefix=server/src/ --strict-localization` 和
  `node scripts/user-visible-copy-audit.js --strict-guidance`。第三项专门拦截 `return`、异常、响应字段、通知字段和拼接表达式中的提示/指引常量。
- `generated/**` 仅承载历史等值迁移；新增或修改文案优先使用可读语义键。状态码、路由、权限键、数据库枚举、CSV 列别名和内部日志不属于提示文案，不得为通过审计而错误移入语言资源。
- 语言迁移脚本重跑时必须合并现有 locale 与 Git 基线资源，禁止用本次扫描结果覆盖同文件已有键；生成器或批量迁移后必须用依赖校验和相关回归测试确认历史错误文案仍可读。

## 硬规范：场地借用时间窗口

- 借用开放和截止规则属于“组织 + 场地”策略，不得挂在某一条审批规则或某一个审批步骤上。两侧可以分别不设置、按天数设置或按小时/分钟设置。
- 开放未设置表示无最早提交时间；截止未设置表示只要借用开始时间晚于当前时间即可提交。两侧同时设置时，开放提前量必须大于等于截止提前量。
- 用户端场地卡片的开放提交与截止提交必须和“需审核/直接通过”处于同一个状态气泡行，复用彩色 `.venue-tag` 体系：使用“开放提交 不限/开放提交 X 日前/开放提交 X 小时 Y 分钟前”和“截止提交 借用前/截止提交 X 日前/截止提交 X 小时 Y 分钟前”；禁止使用嵌套浅色块或“开放：不限制前”等内部语法。
- 页面只编辑策略值，服务端必须按借用开始时间动态计算边界并校验，禁止写死偏移值或只依赖客户端限制。
- 用户端日程整列点击、日期选择、时间输入和拖动时间条必须复用同一套“开放时段 + 当前时间 + 借用时间窗口 + 占用冲突”判定；无效日期或时间不得静默打开或自动改成另一个时间，必须保留上一次有效值并给出明确反馈。
- 借用时间窗口必须作为规则管理中的独立并列设置页签直接编辑保存，不得嵌套在借用规则或审批步骤编辑弹窗中；视觉结构复用规则管理的列表项、字段和按钮，不得另造一套弹窗样式。

## 硬规范：场地活动占用时间与详情

- 活动占用必须先选择每天/每周/每月/每年周期，再在周期内部通过互斥勾选选择“按生效时间范围”或“按重复次数”；不勾选表示不限周期范围。只渲染当前选中的配置字段，时间范围、重复次数不是新的周期类别，不得在 picker 中单独增加“指定时间段”或“按次数重复”。
- 服务端必须把活动规则统一展开为具体日期的占用片段；跨日片段按日裁切后同时用于日程展示、用户借用冲突校验和管理端创建借用冲突校验，禁止前端各自推导一套活动时间。
- 活动规则记录卡片、用户端日程活动块和管理端日程活动块必须都可点击；点击使用统一的活动详情结构，展示活动名称、场地、本次占用时间和重复规则，禁止只显示颜色块或点击无响应。

## 硬规范：场地借用规则编辑器可操作性

场地借用管理端的规则编辑器必须复用审批子应用的步骤编辑结构，保证步骤多、条件多时仍可完成操作：

- 弹窗只允许“固定标题 + 独立滚动正文 + 固定底部操作栏”三段结构；正文使用直接子级 `scroll-view.ui-dialog-body`，保存按钮必须位于 `ui-dialog-footer`，不得把底部按钮放进滚动正文。弹窗高度必须由标题、正文实际内容和底部操作栏通过 flex 自然分配；只能使用基于视口安全区计算的动态上限，禁止固定内容高度、固定像素偏移或固定翻页尺度，允许 `max-height: calc(100vh - 安全区)` 作为溢出保护。
- 步骤卡片参考审核子应用模板步骤预览：步骤编号、名称和操作同一视觉区；审批条件使用带左侧强调线的紧凑条件卡，部门、职能组、身份类别在条件卡内按语义行展示并可自然换行，禁止产生大块空白。
- 任何“指定”审批条件都必须显示真实的部门、职能组、身份类别名称，而不是只显示“指定”。步骤卡片、步骤编辑器和条件编辑器必须使用同一份预计算展示数据；异步字典加载完成后要刷新标签，名称过长时在标签内自然换行。
- 审批进度步骤卡使用同一结构契约：展开详情必须位于 `.flow-info` 内部，并在可视卡片本身添加 `.flow-info-expanded`。展开白色玻璃层必须稳定覆盖通过/驳回状态色；禁止仅依赖祖先状态类和样式声明顺序。流程卡样式只在 `subpackages/main/styles/home.wxss` 维护，业务页面不得复制分叉；组件必须用 `styleIsolation: apply-shared` 接收页面共享样式，禁止在组件 WXSS 中导入整份页面样式。修改后逐一验收通过/驳回的收起态和展开态。
- 编辑审批条件时，只显示条件编辑器并隐藏步骤编辑器，禁止两个编辑器同时堆叠；部门、职能组、身份类别使用统一的纵向条件选项卡，选择结果与清除入口紧随对应条件显示。
- 步骤和条件子编辑器必须使用明确的 `null` 关闭状态，禁止用 `undefined` 依赖小程序视图清除；取消必须清理子编辑器状态，保存必须先将副本写回上级步骤/规则列表，再清理状态并关闭子编辑器。
- 规则编辑器必须在手机和 Pad 竖横屏中可滚动到最底部，取消、添加步骤、编辑条件、保存规则等真实点击目标必须可见且可操作；任何布局调整不得删除或改变原有字段、选择器和保存行为。
- 步骤条件展示必须使用“条件卡”信息层级：条件关系作为小标题，部门、职能组、身份类别各占一行，左侧为固定语义标签，右侧为实际范围值；范围值使用深色正文并允许换行，不得把三项拼成一大片蓝色小字。
- 添加步骤、编辑步骤、添加条件和编辑条件成功后，必须通过滚动容器的语义定位（如 `scroll-into-view`/等价机制）把对应编辑器带入可视区；禁止使用固定 scrollTop、固定偏移值或要求用户自行向下翻找。定位目标必须在内容渲染完成后触发，关闭编辑器时清理定位状态。
- 修改后至少运行 UI 审计、兼容性审计和差异检查，并用真实设备或微信开发者工具验证：能打开规则编辑器、添加和编辑步骤、编辑条件、滚动到底部、取消并保存。
