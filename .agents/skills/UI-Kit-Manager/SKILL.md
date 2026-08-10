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
- 白板、触点与实时笔迹统一使用物理视口 CSS px 绝对坐标：白板用 `.fields({ size:true, rect:true })` 得到绝对边界，触点只读取 `clientX/clientY`，裁切后保存为 `screenX/screenY`。不得引入 scrollTop、状态栏、标题栏、弹窗 top、DPR、rpx 或任何经验偏移。
- 实时线段的事实数据必须保存绝对端点；普通视图渲染时才减一次白板 `rect.left/top`。确认导出时再次从绝对端点投影到隐藏 Canvas 局部坐标，buffer 与白板宽高保持 1:1，禁止 DPR 放大。
- 白板与笔迹层必须裁切溢出；Canvas 不得绑定触摸。任何弹窗、页面滚动或设备布局变化都只能触发重新读取白板绝对 rect，不能改变坐标定义。
- 书写位置只能保存为相对于实际文件预览图的归一化中心点 `positionX/positionY ∈ [0,1]`。点击计算必须读取预览图自己的 viewport 矩形，不能用弹窗、scroll-view 或页面矩形代替。
- 预览中的签名图片必须保持原始宽高比，禁止用固定 `rpx` 高度模拟笔迹；服务端图片合成、PDF 合成和 PDF 签名 Widget 必须使用同一个归一化中心点，再各自执行唯一一次坐标系转换。
- `clientX/clientY` 仅与 viewport 矩形配对；`pageX/pageY` 不得直接减 `client` 矩形。滚动容器、页面滚动和 PDF 页码切换不得改变已保存的归一化坐标。
- 任何坐标修复必须用真实鼠标/触控事件验证，不得直接调用组件方法、隐藏 Canvas 或绘图 API伪造验收线。必须确认指针按下点、移动轨迹和普通视图笔迹逐点重合；同时验证导出图片、预览定位和最终文件。未完成对应范围的现场验证不得宣称通过。

## 硬规范：场地借用规则编辑器可操作性

场地借用管理端的规则编辑器必须复用审批子应用的步骤编辑结构，保证步骤多、条件多时仍可完成操作：

- 弹窗只允许“固定标题 + 独立滚动正文 + 固定底部操作栏”三段结构；正文使用直接子级 `scroll-view.ui-dialog-body`，保存按钮必须位于 `ui-dialog-footer`，不得把底部按钮放进滚动正文。弹窗高度必须由标题、正文实际内容和底部操作栏通过 flex 自然分配；只能使用视口安全上限，禁止给正文或窗口写固定内容高度、固定 `max-height` 或固定翻页尺度。
- 步骤卡片使用紧凑网格：步骤编号、名称和操作同一视觉区，部门、职能组、身份使用可换行的标签组展示；禁止把三个条件拆成带大块留白的连续长行。
- 编辑审批条件时，只显示条件编辑器并隐藏步骤编辑器，禁止两个编辑器同时堆叠；指定部门、职能组或身份的选择控件可以独占整行，其余条件使用双列紧凑布局。
- 规则编辑器必须在手机和 Pad 竖横屏中可滚动到最底部，取消、添加步骤、编辑条件、保存规则等真实点击目标必须可见且可操作；任何布局调整不得删除或改变原有字段、选择器和保存行为。
- 修改后至少运行 UI 审计、兼容性审计和差异检查，并用真实设备或微信开发者工具验证：能打开规则编辑器、添加和编辑步骤、编辑条件、滚动到底部、取消并保存。
