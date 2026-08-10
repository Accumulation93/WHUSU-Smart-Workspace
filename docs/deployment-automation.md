# WHUSU Smart Workspace 自动部署与协作调试

## 日常链路

1. 本地在功能分支完成修改和测试，经合并后推送到唯一生产发布分支 `main`。
2. GitHub Actions 执行全部质量门禁。
3. 只有 `audit-and-test` 成功后，`deploy-production` 才通过固定 SSH 主机指纹连接生产服务器。
4. 远端部署目标必须等于 `origin/main` 的完整 SHA；过期任务自动跳过。
5. 服务端有变化时创建独立 release，完成依赖安装、语法检查和迁移后原子切换 `whusu-smart-workspace-current`。

## 实施完成后的自动交付

每次代码、规范或配置实施完成后，默认自动执行以下顺序：

1. 按改动范围运行语法检查、静态审计、单元/集成测试、`git diff --check` 和数据库迁移预检。
2. 全部通过后自动创建中文 commit 并推送 `main`，记录完整提交 SHA。
3. 跟进同一 SHA 的 `audit-and-test` 与 `deploy-production`；质量门禁或部署健康检查失败时停止并修复，不绕过 CI。
4. 只有涉及数据库结构或数据时才新增带时间戳的幂等迁移；纯前端、文档和样式改动不创建空迁移。
5. 现场验证必须单独记录；电脑控制能力不可用时，必须明确报告未完成现场验证，不能用静态测试替代。

小程序代码推送不会发布微信正式版本。若 `server/` 没有变化，远端只同步仓库，不重启 PM2。服务端 release 切换时，API、通知 Worker 与备份进程一起加载同一 SHA。

## 本地协作命令

本机 SSH 别名为 `whusu-smart-workspace-prod`，常用入口：

```powershell
.\scripts\remote-collab.ps1 status
.\scripts\remote-collab.ps1 health
.\scripts\remote-collab.ps1 logs
.\scripts\remote-collab.ps1 attach
```

`retry` 仅允许重试最新 `main` 提交，并会先通过 GitHub API 确认对应 `audit-and-test` 已成功，不能绕过质量门禁。

## 远端目录

- `/home/ubuntu/whusu-smart-workspace`：干净的同步仓库，只允许快进更新。
- `/home/ubuntu/whusu-smart-workspace-releases/<sha>`：服务端 release。
- `/home/ubuntu/whusu-smart-workspace-current`：PM2 使用的原子软链接。
- `/home/ubuntu/whusu-smart-workspace-shared/server.env`：共享生产环境配置，权限为 `600`。
- `/home/ubuntu/whusu-smart-workspace-shared/uploads/audit`：审核附件永久目录；release 内只保留指向共享 `uploads` 的软链接。
- `/home/ubuntu/whusu-smart-workspace-deploy`：部署状态、日志、锁和数据库快照。
- `/home/ubuntu/backups/whusu-smart-workspace`：每小时数据库与审核附件备份，分别保留 `.sql.gz` 和 `.uploads.tar.gz`。
- `whusu-smart-workspace-collab`：持久 tmux 会话，包含 shell、API、Worker、部署和健康窗口。

## Nginx 上传体积

- Nginx `http` 块必须设置 `client_max_body_size 15m`，与服务端
  `MAX_UPLOAD_JSON_BODY_BYTES`（15MB）保持一致。
- 审核附件、表格解析等接口通过 JSON base64 上传，单文件上限 10MB（base64 后约
  13.3MB）；若 Nginx 上限低于此值，请求会在到达 Express 前被 413 拒绝，前端只能
  兜底提示“未上传，请重试”。重装或重建 Nginx 后必须核对此项。

## 数据库迁移

新迁移放入 `server/db/deploy/`，文件名必须是：

```text
YYYYMMDDHHMMSS_description.sql
```

部署系统按名称排序，仅执行 `schema_migrations` 中尚未记录的文件。已执行文件的 SHA-256 发生变化时部署立即失败，不得直接修改旧迁移。

存在待执行迁移时，API 进入维护状态，通知 Worker 停止，最长请求排空后生成完整快照。数据库迁移完成后，附件迁移器会把可通过文件名、大小和 SHA-256 唯一确认的旧附件复制到共享目录，再事务更新数据库路径。迁移或健康检查失败会停止 API/Worker、恢复数据库、修复附件路径、切回旧 release，再重新检查健康。只有恢复成功才解除维护。

## 故障判断

- CI 失败：生产服务器不会被连接，先修复失败门禁。
- 部署锁返回 75：已有部署执行中，后续任务不得并行覆盖。
- 自动回退成功：检查部署日志和失败 release，不需要恢复数据库。
- 自动回退后仍不健康：系统保持维护状态；禁止手工删除维护 flag，应先通过 tmux 和 PM2 日志定位原因。
