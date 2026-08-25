# WHUSU Smart Workspace 自动部署与协作调试

## 日常链路

1. 本地在当前任务授权的工作分支完成修改和测试；标准 Codex 交付在门禁通过后可将已验证提交推送到唯一生产发布分支 `main`，需要评审时先合并功能分支。
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

小程序代码推送不会发布微信正式版本。若 `server/` 没有变化，远端只同步仓库，不重启 PM2。服务端 release 切换时，API、通知 Worker 与备份进程按部署脚本重建/加载当前 release；有迁移时备份进程会先停止，迁移完成后恢复。不要把“无服务端变更不重启 PM2”和“有服务端变更备份进程重建”混为同一规则。

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
- `/home/ubuntu/whusu-smart-workspace-deploy`：部署状态、日志、锁和迁移前数据库快照；这是故障回退用快照，不是日常备份目录。
- `/home/ubuntu/backups/whusu-smart-workspace`：备份 Worker 的每小时数据库与审核附件备份，分别保留 `.sql.gz` 和 `.uploads.tar.gz`；两类备份用途和恢复入口不同，不得混用。
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

存在待执行迁移时，API 进入维护状态，API、通知 Worker 和备份进程都必须通过 PM2 状态二次确认已经停止，最长请求排空后才生成完整快照。数据库迁移完成后，附件迁移器会把可通过文件名、大小和 SHA-256 唯一确认的旧附件复制到共享目录，再事务更新数据库路径。迁移或健康检查失败时，回滚路径同样必须确认所有数据库客户端已经停止；任一进程无法确认停止，就保留维护状态并拒绝恢复快照或切换旧 release。只有数据库、旧 release 和健康检查全部恢复成功才解除维护。

UTC 历史迁移不是“整库统一减八小时”。来源能够由旧连接时区与 `CURRENT_TIMESTAMP` 证明为 UTC+8 墙上时间的字段，按字段减 480 分钟并记录前后统计；存在手工 UTC 与数据库墙上时间混写可能的字段只物化逐记录待核对账本，不猜测平移。逐记录物化使用主键游标、有界批次和本轮 token，可重入恢复并清理已经不存在的源记录；响应展示映射采用 `record-id+raw-value:v1`。未解决记录存在时 cutover 为 `review_pending`，健康门禁要求映射数等于未解决数；未解决数为零才允许 `verified`。离任等带 `ON UPDATE` 的历史迁移必须显式保留事实时间。

## 故障判断

- CI 失败：生产服务器不会被连接，先修复失败门禁。
- 部署锁返回 75：已有部署执行中，后续任务不得并行覆盖。
- 自动回退成功：检查部署日志和失败 release，不需要恢复数据库。
- 自动回退后仍不健康：系统保持维护状态；禁止手工删除维护 flag，应先通过 tmux 和 PM2 日志定位原因。
