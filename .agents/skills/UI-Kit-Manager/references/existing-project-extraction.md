# Existing Project Takeover

Use this workflow when the user asks to understand, take over, standardize, normalize, document, or create a maintenance index for an existing project.

If the user asks to continue, finish, fix, or add a specific feature in an existing in-progress project, use `feature-development.md` first. Use this takeover workflow only when the user wants a project map, maintenance docs, standardization, or when the missing project context makes implementation risky.

## Safety Rule

Existing project mode is read-only by default.

Do not modify:

- Application source code.
- Package/dependency files.
- Build, lint, test, deploy, Docker, or CI config.
- Environment files or secrets.
- Database migrations, seed data, local databases, caches, indexes, uploads, or generated runtime output.
- Billing, authentication, authorization, payment, retry, or persistence behavior.

Creating or updating docs also requires a user approval point after the scan plan. Any code/config change requires a separate explicit approval that names the intended change type or files.

## Read-Only Scan

1. Identify the repository root.
2. Run `git status --short --branch` inside Git repos.
3. Run the scanner when useful:

   ```bash
   python <skill-dir>/scripts/scan_project_foundation.py --project <project-path>
   ```

   Use stdout during the pre-approval scan. Do not use `--out` inside the target repo until the user approves documentation output.

4. If the project is frontend-heavy, optionally run:

   ```bash
   python <skill-dir>/scripts/scan_ui_patterns.py --project <project-path>
   ```

   Use stdout during the pre-approval scan. Writing a scan report file is part of the document creation step.

5. Inspect representative files, keeping command output capped:
   - README and existing docs.
   - Package/build configs.
   - Source roots and entry files.
   - Routes/pages/controllers/workers/commands.
   - Data models, migrations, schema files, ORM config.
   - API clients, SDK integrations, IPC boundaries, queues, webhooks.
   - Docker, compose, deployment, CI, and local scripts.
   - Existing `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, or similar agent files.

Never read real `.env` or credential files by default. File names are enough to record that secrets exist.

## Takeover Report

Report facts before proposing edits:

- Repository boundary and Git state.
- Project type and likely technical stack.
- Package manager and main commands.
- Source roots and important entry points.
- Runtime/deployment shape.
- Data storage and data model evidence.
- External integrations and secret surfaces.
- UI provider and page/component structure if relevant.
- Existing docs and agent instructions.
- Unknowns that need user confirmation.
- Risk areas.

Keep this as an audit summary, not a rewrite plan.

## Maintenance Index Plan

After the scan, propose a document plan. Adapt it to the project size:

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

If the repo already has equivalent docs, extend those instead of creating parallel files.

## Approval Gate

Before writing docs, say exactly what will be created or updated and include this boundary:

```text
I will only create/update maintenance documentation and agent instruction files. I will not modify application source code, package files, configs, dependencies, environment files, databases, migrations, deployment, or runtime data. Please confirm before I write these docs.
```

Proceed only after confirmation.

## Document Creation

When approved:

1. Create `docs/00-目录索引.md` first.
2. Create architecture/startup/data/feature/UI/maintenance docs in small batches.
3. Add or update `AGENTS.md` and `CLAUDE.md` as thin adapters that point to the shared docs.
4. Mark uncertain facts as `待确认` or `Unknown`, not as guesses.
5. Record scan date and method in the docs cleanup record.
6. Verify links and file existence.

## Code Change Requests

If the user later asks for code changes:

1. Treat that as a new approval boundary.
2. Name the target files or change type.
3. Explain tests/checks to run.
4. Preserve unrelated user changes.
5. Update the maintenance docs only when the code change intentionally changes architecture, startup, data/API contracts, UI kit rules, or feature maps.

For small follow-up fixes in the same project, do not require another full takeover scan. Re-read Git status, the relevant maintenance docs if present, and the files around the requested change.
