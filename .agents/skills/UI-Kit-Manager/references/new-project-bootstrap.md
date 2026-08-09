# New Project Foundation

Use this workflow when the user has a vague product idea or wants to start a new software project. Treat the user as non-technical by default unless they show otherwise.

## Goal

Turn an idea into a clear first project plan before implementation:

- Product goal.
- Target users.
- First version scope.
- Core workflows.
- Data to store.
- External services.
- Technical direction.
- Project document structure.
- Agent-readable maintenance rules.
- UI kit and interaction direction when relevant.

## Intake Rule

If the user only has an idea and has not already answered these points, ask the 10 questions from `SKILL.md` before writing files. Ask in the user's language. Use examples and plain words.

If the user explicitly asks to scaffold, initialize, or create the project now, do not force all 10 questions first. Ask only for missing decisions that materially affect cost, accounts, storage, external integrations, deployment, or the first usable surface. Use conservative defaults for routine framework, directory, styling, and tooling choices, then explain them in plain language.

Avoid asking the user to choose frameworks, databases, hosting providers, UI libraries, auth systems, queues, ORMs, or deployment tools unless they already know those terms.

## Interpreting Answers

Translate answers into implementation planning terms yourself:

| User answer | Planning meaning |
| --- | --- |
| "给自己用/先演示" | Keep scope small, prefer local or low-cost setup, skip complex auth unless needed. |
| "给客户试用/准备上线" | Include auth, persistence, deployment, backups, observability, privacy, and support boundaries. |
| "后台/管理系统/门店用" | Plan dense product UI, list/detail/form templates, roles, audit-friendly data operations. |
| "官网/品牌展示" | Plan visual references, content sections, media rules, SEO, and responsive design. |
| "需要微信/支付/地图/邮件/OpenAI" | Mark as external integration with credentials, cost, rate limits, failure states, and test mode. |
| "不想复杂/不懂代码" | Prefer documented defaults and fewer moving parts. Explain tradeoffs in plain language. |

## Planning Output

After intake or before scaffolding, produce a concise planning summary:

1. Project in one sentence.
2. Users and roles.
3. First version scope.
4. Out of scope for now.
5. Core pages or workflows.
6. Data objects.
7. External integrations.
8. Suggested technical direction, with plain-language reasons.
9. First document batch to create.
10. Risks or decisions needing confirmation.

Do not write files until the user approves the file plan, unless the user already gave explicit permission to create project planning files or explicitly asked to create/scaffold the project.

## New Project Implementation

Use this path when the user has already authorized creating a new project.

1. Confirm the destination path and avoid overwriting non-empty directories unless the user explicitly authorizes it.
2. Choose the simplest mainstream stack that fits the product when the user did not specify one.
3. Keep credentialed, paid, persistent, or externally billed services behind an explicit confirmation point.
4. Scaffold runtime code only within the requested project boundary.
5. Create a small foundation doc set during scaffolding when it will help future agents:
   - `docs/00-目录索引.md`
   - `docs/01-项目规划.md` or equivalent
   - `docs/02-启动与维护.md` or equivalent
   - `AGENTS.md`
6. Record the chosen commands, project boundary, UI direction, and known deferred decisions.
7. Run the narrowest meaningful startup/build/typecheck verification available for the created stack.
8. Report what was created, how to run it, verification results, and remaining decisions.

For implementation work, do not create the large default document batch unless the project is already substantial or the user asks for a full foundation.

## Default Document Batch

Use this structure unless the target project already has a better convention:

```text
docs/00-目录索引.md
docs/01-项目架构/01-项目总览与技术栈.md
docs/01-项目架构/02-目录结构与代码边界.md
docs/02-启动部署/01-本地启动与开发调试.md
docs/02-启动部署/02-构建部署与环境变量.md
docs/03-数据与接口/01-数据模型与存储.md
docs/03-数据与接口/02-外部API与集成.md
docs/04-功能模块/01-功能模块地图.md
docs/05-UI与交互/01-UI套件与页面规范.md
docs/06-维护更新/01-后续维护与更新规则.md
docs/06-维护更新/02-docs整理与清理记录.md
AGENTS.md
CLAUDE.md
```

For tiny projects, reduce the batch:

```text
docs/00-目录索引.md
docs/01-项目规划.md
docs/02-启动与维护.md
AGENTS.md
CLAUDE.md
```

## Technical Direction

Choose conservatively:

- Prefer the stack already requested by the user.
- If no stack is requested, choose a simple mainstream default that fits the product and explain it in plain language.
- Keep paid, credentialed, persistent, or external services behind explicit confirmation.
- Record alternatives only when they materially affect cost, deployment, ownership, or maintenance.
- Do not install packages or scaffold runtime code during the planning phase unless the user approves that separate implementation step.

## UI Kit Module

If the project includes a frontend, create the UI section as part of the foundation plan:

- Surface type: product app, admin tool, dashboard, marketing site, desktop UI, game, or prototype.
- UI provider direction: existing stack, Tailwind custom, shadcn, Ant Design, MUI, Astryx, or undecided.
- Design profile: density, color, typography, radius, media, motion, animation references, and accessibility.
- Reusable page templates: list, detail, form, settings, dashboard, marketing sections.

Read `provider-selection.md` when a provider decision is needed or when the user asks for motion/animation inspiration. For React projects with expressive animation needs, React Bits can be recommended as a reference site, not as an automatic dependency.

## Approval Gate

Before creating files, say:

```text
I will create/update only project planning and maintenance docs in the paths listed above. I will not write business code, install dependencies, change configs, or touch deployment/database settings. Please confirm before I create these files.
```

If the user confirms, create docs in small coherent batches and verify links/read order. If the user already authorized scaffolding, create the approved project files and the smallest useful foundation docs together.
