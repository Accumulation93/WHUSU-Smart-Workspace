# WHUSU Smart Workspace 自动部署与协作调试

## 日常链路

1. 本地在 `feature/audit` 完成修改、测试、提交和推送。
2. GitHub Actions 执行全部质量门禁。
3. 只有 `audit-and-test` 成功后，`deploy-production` 才通过固定 SSH 主机指纹连接生产服务器。
4. 远端部署目标必须等于 `origin/feature/audit` 的完整 SHA；过期任务自动跳过。
5. 服务端有变化时创建独立 release，完成依赖安装、语法检查和迁移后原子切换 `whusu-smart-workspace-current`。

小程序代码推送不会发布微信正式版本。若 `server/` 没有变化，远端只同步仓库，不重启 PM2。

## 本地协作命令

本机 SSH 别名为 `whusu-smart-workspace-prod`，常用入口：

```powershell
.\scripts\remote-collab.ps1 status
.\scripts\remote-collab.ps1 health
.\scripts\remote-collab.ps1 logs
.\scripts\remote-collab.ps1 attach
```

`retry` 仅允许重试最新 `feature/audit` 提交，并会先通过 GitHub API确认对应 `audit-and-test` 已成功，不能绕过质量门禁。

## 远端目录

- `/home/ubuntu/whusu-smart-workspace`：干净的同步仓库，只允许快进更新。
- `/home/ubuntu/whusu-smart-workspace-releases/<sha>`：服务端 release。
- `/home/ubuntu/whusu-smart-workspace-current`：PM2 使用的原子软链接。
- `/home/ubuntu/whusu-smart-workspace-shared/server.env`：共享生产环境配置，权限为 `600`。
- `/home/ubuntu/whusu-smart-workspace-deploy`：部署状态、日志、锁和数据库快照。
- `whusu-smart-workspace-collab`：持久 tmux 会话，包含 shell、API、Worker、部署和健康窗口。

## 数据库迁移

新迁移放入 `server/db/deploy/`，文件名必须是：

```text
YYYYMMDDHHMMSS_description.sql
```

部署系统按名称排序，仅执行 `schema_migrations` 中尚未记录的文件。已执行文件的 SHA-256 发生变化时部署立即失败，不得直接修改旧迁移。

存在待执行迁移时，评分 API进入维护状态，通知 Worker 停止，最长请求排空后生成完整快照。迁移或健康检查失败会停止 API/Worker、恢复数据库、切回旧 release，再重新检查健康。只有恢复成功才解除维护。

## 故障判断

- CI 失败：生产服务器不会被连接，先修复失败门禁。
- 部署锁返回 75：已有部署执行中，后续任务不得并行覆盖。
- 自动回退成功：检查部署日志和失败 release，不需要恢复数据库。
- 自动回退后仍不健康：系统保持维护状态；禁止手工删除维护 flag，应先通过 tmux 和 PM2 日志定位原因。
