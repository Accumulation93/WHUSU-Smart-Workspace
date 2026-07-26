# WHUSU Smart Workspace 协作拓扑

## 本地入口

- 仓库根目录：`D:\WeChat\WHUSUSmartWorkspace\WHUSUSmartWorkspaceServer`
- SSH 别名：`whusu-smart-workspace-prod`
- SSH 配置：`C:\Users\18667\.ssh\config`
- 目标：`ubuntu@124.221.2.245`
- 私钥位置：仓库根目录的 `forGPT.pem`；该文件必须保持忽略且不得读取到回复或日志。
- 协作脚本：`scripts/remote-collab.ps1`

SSH 配置使用 `IdentitiesOnly`、固定 `known_hosts`、连接超时和心跳。不要改用 `StrictHostKeyChecking=no`，不要依赖系统 VPN，也不要在命令中展开私钥内容。

当前本机 SSH 配置契约为：

```sshconfig
Host whusu-smart-workspace-prod
  HostName 124.221.2.245
  User ubuntu
  IdentityFile D:/WeChat/WHUSUSmartWorkspace/WHUSUSmartWorkspaceServer/forGPT.pem
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile C:/Users/18667/.ssh/known_hosts
  ConnectTimeout 12
  ConnectionAttempts 3
  ServerAliveInterval 15
  ServerAliveCountMax 4
  TCPKeepAlive yes
```

验证配置时只执行 `ssh -G whusu-smart-workspace-prod` 或短连接命令，不输出私钥和 `known_hosts` 的具体密钥内容。

## GitHub 发布入口

- 仓库：`Accumulation93/WHUSU-Smart-Workspace`
- 生产来源分支：`feature/audit`
- 工作流：`.github/workflows/ci.yml`
- Environment：`production`
- Secret 名称：`PROD_SSH_KEY`、`PROD_KNOWN_HOSTS`、`PROD_HOST`、`PROD_USER`

工作流条件本身限定只有 `refs/heads/feature/audit` 的 push 可以运行 `deploy-production`。不得在日志中打印 Secret，PR 流程不得读取生产密钥。

## 远端目录

- `/home/ubuntu/whusu-smart-workspace`：干净同步仓库，只允许 `fetch` 和 `pull --ff-only`。
- `/home/ubuntu/whusu-smart-workspace-releases/<sha>`：不可变版本化 release。
- `/home/ubuntu/whusu-smart-workspace-current`：指向当前 release 的原子软链接。
- `/home/ubuntu/whusu-smart-workspace-shared/server.env`：共享生产配置，权限应为 `600`。
- `/home/ubuntu/whusu-smart-workspace-deploy/bin/deploy-entrypoint`：部署入口。
- `/home/ubuntu/whusu-smart-workspace-deploy/state`：运行和仓库 SHA 状态。
- `/home/ubuntu/whusu-smart-workspace-deploy/logs`：部署日志。
- `/home/ubuntu/whusu-smart-workspace-deploy/backups`：数据库快照。
- `/var/lib/whusu-smart-workspace-deploy/maintenance.flag`：仅评分 API 使用的维护标志。

部署使用 `/home/ubuntu/whusu-smart-workspace-deploy/deploy.lock` 的非阻塞 `flock`，默认等待请求排空 35 秒并保留最近 5 个 release。部署入口从目标提交读取并校验脚本，拒绝短 SHA、脏工作区、非快进结果和已被新分支头替代的任务。

## 进程与会话

- PM2 `whusu-smart-workspace-api`：两个 cluster 实例。
- PM2 `whusu-smart-workspace-notification-worker`：一个 fork 实例。
- PM2 `whusu-smart-workspace-backup`：独立备份进程，普通发布不得重启。
- tmux `whusu-smart-workspace-collab`：`shell`、`api-log`、`worker-log`、`deploy-log`、`health` 五个窗口。

## 健康端点

- 服务器本地：从 `server.env` 获取端口后访问 `http://127.0.0.1:<port>/api/health`。
- 公网：`https://accumulation93.com/api/health`。
- 健康端点在维护模式下仍可用于发布验证；其他评分 `/api` 返回统一维护响应。

配置变化时优先核对 `scripts/remote-collab.ps1`、`server/scripts/deployProduction.sh`、`server/ecosystem.config.js` 和 `.github/workflows/ci.yml`，再更新本参考文件。
