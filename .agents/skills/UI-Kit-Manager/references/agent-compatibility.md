# Agent Compatibility

Use this reference when project docs must work across Codex, Claude Code, Cursor, Gemini CLI, and similar coding agents.

## Principle

Keep project knowledge in shared docs. Keep agent-specific files thin.

Shared docs explain the project:

```text
docs/00-目录索引.md
docs/01-项目架构/
docs/02-启动部署/
docs/03-数据与接口/
docs/04-功能模块/
docs/05-UI与交互/
docs/06-维护更新/
```

Agent adapter files explain how an agent should behave:

```text
AGENTS.md
CLAUDE.md
.cursorrules
GEMINI.md
```

Do not duplicate long architecture descriptions in every adapter. Point each adapter to the same maintenance index.

## Adapter Rules

Each adapter should include:

- Required read order.
- Repository boundary.
- Approval boundaries for docs, code, dependencies, environment files, data, deployment, and billing.
- Common commands for install, dev, build, test, lint, and typecheck when known.
- Where to update docs after architecture, API, data, UI, or workflow changes.
- How to preserve user changes.

Each adapter should avoid:

- Tool-specific lore that belongs in shared docs.
- Secrets, credentials, account IDs, tokens, private endpoints, or billing details.
- Duplicate full copies of the maintenance docs.

## AGENTS.md Template

```markdown
# Agent Instructions

## Read First

Before changing this project, read:

1. `docs/00-目录索引.md`
2. `docs/01-项目架构/01-项目总览与技术栈.md`
3. `docs/06-维护更新/01-后续维护与更新规则.md`

Read more specific docs from the index based on the task.

## Work Boundary

- Preserve user changes.
- Check Git status before edits.
- Do not modify source code, dependencies, config, environment files, migrations, databases, deployment, billing, or authentication behavior unless the user explicitly asks for that change.
- For documentation maintenance, update the relevant docs under `docs/` and keep `docs/00-目录索引.md` current.

## Verification

- Use the commands documented in `docs/02-启动部署/01-本地启动与开发调试.md`.
- If commands are missing or stale, document what was tried and update the startup docs after user approval.
```

## CLAUDE.md Template

```markdown
# Claude Code Instructions

Start with `docs/00-目录索引.md`. It is the project maintenance entrypoint.

Follow the same project boundaries as `AGENTS.md`:

- Read the shared docs before edits.
- Keep source-code changes separate from documentation maintenance.
- Do not change dependencies, configs, env files, databases, deployment, billing, auth, or persistent data without explicit user approval.
- Update the shared docs when a confirmed change affects architecture, startup, data/API contracts, feature maps, UI rules, or maintenance workflow.
```

## Cursor / Gemini Notes

When adding `.cursorrules`, `GEMINI.md`, or other adapter files:

- Keep them shorter than `AGENTS.md`.
- Point to the same index.
- Use the same approval boundaries.
- Include tool-specific command hints only when the project already relies on that tool.

## Maintenance

When one adapter changes a policy that should apply to all agents, update all adapter files or move the policy into shared docs and point adapters there.
