---
name: whusu-smart-workspace-server-collaboration
description: Connect and collaborate with the WHUSU Smart Workspace production server from this repository using the pinned SSH alias, persistent tmux session, GitHub Actions quality gates, versioned releases, database migration ledger, PM2 reload, health checks, and automatic rollback. Use for this project whenever Codex needs to inspect production status or logs, coordinate local and remote debugging, deploy feature/audit, run or diagnose migrations, retry a green deployment, verify a release, or troubleshoot CI/SSH/PM2/Nginx/notification-worker failures.
---

# WHUSU Smart Workspace 服务端协作

## 先确认边界

- 将本仓库视为唯一代码来源，将 `main` 的完整提交 SHA 视为唯一生产发布标识。
- 使用 SSH 别名 `whusu-smart-workspace-prod`，不得绕过固定主机指纹，不依赖系统 VPN。
- 不读取、回显、复制或提交私钥、`.env`、数据库密码和 GitHub Secret 值。
- 不直接编辑远端同步仓库、release、`whusu-smart-workspace-current` 或生产环境文件。
- 不在生产库创建测试夹具，不自动发布微信小程序正式版本。
- 只在用户要求实现或发布变更时产生写操作；诊断、检查和审计默认保持只读。

需要确认主机、目录、进程、端点或 Secret 名称时，读取 [references/topology.md](references/topology.md)。需要执行发布、迁移、回退或故障处理时，读取 [references/runbooks.md](references/runbooks.md)。

## 进入任务

1. 在仓库根目录运行 `git status -sb`，确认当前分支和用户已有改动。
2. 运行 `powershell -File scripts/remote-collab.ps1 status` 和 `powershell -File scripts/remote-collab.ps1 health`。
3. 根据任务读取最新代码、`AGENTS.md` 要求和相关模块规则；不要以远端运行版本替代本地事实来源。
4. 需要交互调试时运行 `powershell -File scripts/remote-collab.ps1 attach`，使用现有 `whusu-smart-workspace-collab`，不要创建重复会话。
5. 仅查看部署日志时运行 `powershell -File scripts/remote-collab.ps1 logs`；按需使用 `ssh whusu-smart-workspace-prod '<read-only command>'` 补充检查。

## 本地与远端协作

- 在本地完成代码修改、测试、提交和推送；不要在服务器上修补代码后反向复制。
- 推送 `main` 后让 GitHub Actions 先执行 `audit-and-test`，只有全绿才允许 `deploy-production` 连接生产。
- 让远端入口验证完整 SHA 与 `origin/main` 一致；过期提交必须跳过。
- 服务端目录未变化时只同步仓库，不要求 PM2 重启。
- 服务端变化时让部署系统创建独立 release、安装锁定依赖、执行检查并原子切换 `whusu-smart-workspace-current`；部署脚本会按其实际实现重建 API、通知 Worker 和备份进程，单独故障处理时不得扩大重启范围。
- 部署失败时先确认自动回退结果，不要立即手工覆盖软链接或删除维护标志。

## 数据库迁移

- 仅在 `server/db/deploy/` 新增 `YYYYMMDDHHMMSS_description.sql`；不得修改已执行迁移。
- 先运行迁移预检或让 CI 集成测试验证；发现校验和变化、重复数据或不可自动处理数据时停止。
- 让生产部署在存在待执行迁移时自动进入维护、停止 Worker、排空请求、备份、迁移和恢复服务。
- 允许破坏性迁移不等于允许无备份执行；任何迁移都必须经过账本、快照和失败恢复链路。

## 完成验证

每次生产部署后同时确认：

1. 本地 HEAD、`origin/main`、远端同步仓库、`whusu-smart-workspace-current` 和部署状态完整 SHA 一致；`remote-collab.ps1 status` 的短 SHA 只能作为快速观察，不能代替完整 SHA 核对。
2. GitHub Actions 的 `audit-and-test` 与 `deploy-production` 均为 `success`。
3. `whusu-smart-workspace-api` 两个集群进程和 `whusu-smart-workspace-notification-worker` 均为 `online`，实际 cwd 指向当前 release。
4. 本地与公网 `/api/health` 均成功，维护标志不存在。
5. 最新部署日志以“部署成功”结束，部署后的错误日志没有新增异常。
6. `schema_migrations` 预检无意外待执行项；有迁移时核对备份和账本记录。

最终向用户报告提交 SHA、CI 运行链接、生产运行 SHA、健康状态、迁移情况和任何未完成验证。
