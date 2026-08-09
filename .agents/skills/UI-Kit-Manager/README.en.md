# UI Kit Manager

[中文](README.md)

`ui-kit-manager` is no longer only about componentization and UI consistency. It is now a Codex Skill for early project foundation work, in-progress project continuation, and inherited-project takeover: match the project stage, plan or create the new project, continue concrete work in an existing project, or scan an inherited project before creating agent-readable maintenance docs.

The original UI kit workflow remains available as one module inside the broader project foundation.

## When To Use

- You only have a vague idea, such as "I want to build an inventory system for stores."
- You do not know code and want the agent to ask plain-language questions before planning.
- You want to start a website, app, SaaS product, dashboard, desktop app, internal tool, AI workflow, or other software project.
- You have an in-progress project and want the agent to inspect the current state before continuing a page, feature, fix, or finishing pass.
- You are taking over an existing project and want a read-only scan before creating maintenance docs.
- You want Codex, Claude Code, Cursor, Gemini CLI, and similar agents to share one project maintenance index.
- You still need UI provider, component, theme, and page-template rules.
- You need an open-source reference for React motion, micro-interactions, animated backgrounds, or memorable landing-page effects.

## Three Main Entrypoints

### 1. New project: plan or create based on authorization

When the user only has an idea, the skill asks 10 plain-language questions instead of asking for frameworks:

1. What do you want to build in one sentence?
2. Who will use it?
3. What are the three most important things users should be able to do first?
4. Do you have reference products, screenshots, websites, or apps?
5. Should the first version be a website, mobile-friendly web app, desktop app, dashboard, or are you unsure?
6. Does it need accounts or roles?
7. What information should it save?
8. Does it need to connect to WeChat, payments, maps, email, Feishu/Lark, OpenAI, or other services?
9. Should the first version be good enough for demo, personal use, team use, customer trial, or paid launch?
10. What must it avoid?

After the answers, the skill produces product goals, MVP scope, user roles, feature maps, data objects, technical direction, a document plan, and agent maintenance rules. It asks for approval before writing files.

If the user explicitly asks to create, initialize, or scaffold the project now, the skill does not force all 10 questions first. It asks only for missing decisions that affect cost, accounts, storage, external services, deployment, or the first usable surface, then creates the project within the authorized boundary and includes a minimal useful maintenance foundation.

### 2. In-progress project: inspect, then continue

When a project is already partly built and the user asks to continue a feature, finish a page, fix a bug, or complete a pass, the skill:

1. Confirms repository boundary and Git state.
2. Reads existing `AGENTS.md`, `CLAUDE.md`, README, configs, and maintenance docs if present.
3. Inspects only the files relevant to the current task plus nearby examples.
4. Continues implementation within the user's approved task scope.
5. Does not make a full docs foundation a prerequisite for small, local, or clear work.

It recommends a separate foundation or takeover pass only when missing project context creates real implementation risk, multiple agents will work on the project, the user asks for standardization, or the change affects architecture, startup, data/API, or UI rules.

### 3. Existing project takeover: scan read-only, then ask permission

For inherited projects, the default mode is read-only:

1. Confirm repository boundary and Git state.
2. Scan stack, scripts, config, entry points, data/API hints, UI provider evidence, docs, and agent files.
3. Report facts, unknowns, and risks.
4. Propose a maintenance-index document plan.
5. Create or update docs only after user approval.

Any source-code, dependency, config, environment, database, migration, deployment, billing, auth, or persistent-data change requires separate explicit approval.

## Typical Artifacts

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

`docs/00-目录索引.md` is the first read for humans and agents. `AGENTS.md`, `CLAUDE.md`, and similar files are thin adapters that point to the shared docs.

## Scripts

Project foundation scan:

```bash
python scripts/scan_project_foundation.py --project /path/to/project
```

Frontend UI scan:

```bash
python scripts/scan_ui_patterns.py --project /path/to/project
```

Both scripts are read-only when they print to the terminal. The `--out` flag writes the requested report file, so use it in inherited projects only after the user approves documentation output. The foundation scanner detects real `.env` and credential-like files by name only and does not read their contents.

## Motion Reference

When a React project needs motion, micro-interactions, text animations, animated backgrounds, or expressive landing-page effects, React Bits can be recommended as a reference:

- Website: https://www.reactbits.dev
- GitHub: https://github.com/DavidHDev/react-bits

Use it as inspiration and component reference only. Do not automatically install dependencies or copy components because it was recommended; implementation still requires separate confirmation.

## Install

PowerShell:

```powershell
git clone https://github.com/penposs/UI-Kit-Manager.git $env:USERPROFILE\.codex\skills\ui-kit-manager
```

Bash:

```bash
git clone https://github.com/penposs/UI-Kit-Manager.git ~/.codex/skills/ui-kit-manager
```

Restart Codex after installing so the skill list refreshes.

## Usage Examples

```text
Use $ui-kit-manager. I have a vague idea for a store inventory system. Ask me questions first and do not write code yet.
```

```text
Use $ui-kit-manager to create a store inventory dashboard in this directory with simple maintainable defaults.
```

```text
Use $ui-kit-manager. This project is halfway done; inspect the current state, then finish the orders list page.
```

```text
Use $ui-kit-manager to take over this old project. Scan read-only first, then give me a maintenance-index plan. Do not modify code.
```

```text
Use $ui-kit-manager to create a project maintenance entrypoint that both Codex and Claude Code can read.
```

```text
Use $ui-kit-manager to standardize this frontend project's UI kit, component inventory, and page templates.
```

## Validate

```bash
python /path/to/skill-creator/scripts/quick_validate.py .
```

Expected result:

```text
Skill is valid!
```
