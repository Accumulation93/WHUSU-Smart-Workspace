# WHUSU Smart Workspace 服务端操作手册

## 日常检查

```powershell
powershell -File scripts/remote-collab.ps1 status
powershell -File scripts/remote-collab.ps1 health
powershell -File scripts/remote-collab.ps1 logs
```

需要持续观察时运行：

```powershell
powershell -File scripts/remote-collab.ps1 attach
```

退出 tmux 客户端时使用 detach，不终止 `whusu-smart-workspace-collab` 会话。

## 标准开发与发布

1. 检查工作区，只修改当前任务文件。
2. 按 `AGENTS.md` 执行语法、兼容、安全、UI 和集成测试。
3. 提交并推送当前 `main`。
4. 记录新提交的完整 SHA 和 GitHub Actions 运行号。
5. 等待 `audit-and-test` 成功；失败时读取对应 job 日志并在本地修复。
6. 等待 `deploy-production`；不要同时手工运行部署入口。
7. 按 `SKILL.md` 的完成验证清单核对真实运行状态。

## 安全重试

仅当最新 `main` 的质量 job 已成功、但部署 job 因临时基础设施问题失败时运行：

```powershell
powershell -File scripts/remote-collab.ps1 retry
```

该命令只重试最新绿色提交，不能绕过质量门禁。返回码 `75` 表示另一部署持有 `flock`；等待现有任务结束后重新检查，不并行覆盖。

## 迁移发布

1. 新增带时间戳的幂等 SQL 文件，保持已执行迁移不可变。
2. 在独立测试库运行迁移集成测试，禁止使用生产夹具验证。
3. 推送后观察部署日志中的待执行数量、维护开启、快照路径和迁移账本结果。
4. 部署成功后确认维护关闭、账本新增且健康恢复。
5. 失败时确认部署系统已停止进程、恢复快照、切回旧 release 并重新健康检查。

## 故障判断

- `audit-and-test` 失败：生产不应被连接；修复 CI，不要远端部署。
- 远端仓库脏：部署必须拒绝；识别改动来源，不用 reset 或 checkout 覆盖。
- 目标 SHA 过期：部署入口应跳过；让最新分支头的工作流接管。
- 新 release 健康失败：检查最新部署日志；自动回退成功时保持旧服务并修复本地代码。
- 回退后仍不健康：维护标志应保留；不要手工删除，先检查 PM2 cwd、环境链接、数据库恢复和 Nginx。
- 公网失败但本地成功：检查 Nginx、证书、DNS 和外部网络，不重复 reload 应用。
- PM2 在线但接口失败：检查实际 `/proc/<pid>/cwd` 是否指向 `whusu-smart-workspace-current` 对应 release，并读取部署后的新错误日志。
- Worker 异常：只处理 `whusu-smart-workspace-notification-worker`，不要连带重启 `whusu-smart-workspace-backup` 或同机其他服务。

## 禁止操作

- 不执行 `git reset --hard`、任意分支部署、短 SHA 部署或远端代码热修补。
- 不直接修改 `schema_migrations`、已执行 SQL 校验和或生产业务数据来“通过”迁移。
- 不删除维护标志来掩盖恢复失败。
- 不把私钥、环境文件、数据库快照或部署日志中的敏感数据带回 Git。
- 不将本地小程序开发者工具验证等同于微信正式发布。
