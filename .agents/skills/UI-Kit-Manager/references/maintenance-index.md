# Maintenance Index

Use this reference when creating `docs/00-目录索引.md` or an equivalent project maintenance entrypoint.

## Purpose

The maintenance index is the first file agents and humans read before changing a project. It should answer:

- What is this project?
- Which files should be read first?
- Where are architecture, startup, data/API, feature, UI, and maintenance docs?
- What is the current project conclusion?
- Which areas are risky or unknown?
- What should future agents update after changes?

## Recommended Structure

```markdown
# <Project Name> - Codex / Agent 维护索引

本目录是当前项目的维护文档入口。新 Agent 接手时，先读本文，再按任务进入对应分类。

## 快速阅读顺序

1. `01-项目架构/01-项目总览与技术栈.md`
2. `01-项目架构/02-目录结构与代码边界.md`
3. `02-启动部署/01-本地启动与开发调试.md`
4. `03-数据与接口/01-数据模型与存储.md`
5. `03-数据与接口/02-外部API与集成.md`
6. `04-功能模块/01-功能模块地图.md`
7. `05-UI与交互/01-UI套件与页面规范.md`
8. `06-维护更新/01-后续维护与更新规则.md`
9. `06-维护更新/02-docs整理与清理记录.md`

## 当前项目结论

- 项目类型：
- 当前阶段：
- 主要技术栈：
- 主要入口：
- 本地启动：
- 部署方式：
- 数据存储：
- 外部集成：
- UI 体系：

## 维护边界

- 文档维护：
- 代码修改：
- 依赖/配置修改：
- 环境变量/密钥：
- 数据库/迁移：
- 部署/计费：

## 待确认事项

-

## 最近整理记录

| 日期 | 整理内容 | 依据 | 备注 |
| --- | --- | --- | --- |
| YYYY-MM-DD | 初始化维护索引 | 只读扫描/用户说明 |  |
```

## Writing Rules

- Use project facts, not guesses.
- Mark uncertain items as `待确认`.
- Link to docs with relative paths.
- Keep the index short enough to read quickly.
- Put details in the category docs, not in the index.
- If the project uses English docs, create an English index instead.

## Category Docs

Use these topic boundaries:

| Area | Purpose |
| --- | --- |
| `01-项目架构` | What the project is, stack, repo shape, code ownership boundaries. |
| `02-启动部署` | Local setup, dev server, debug flow, build, deployment, env handling. |
| `03-数据与接口` | Data model, database, storage, external APIs, IPC, webhooks, queues. |
| `04-功能模块` | Feature map, routes, business workflows, module relationships. |
| `05-UI与交互` | UI kit, design profile, page templates, component conventions. |
| `06-维护更新` | How to update docs, verify changes, handle stale docs, record cleanup. |

## Approval Boundary

For existing projects, create or update the maintenance index only after the user approves the proposed document plan.
