# 超级管理员离线初始化

## 用途与边界

`npm run security:bootstrap-super` 只用于统一认证体系尚无可用全局超级管理员时的离线恢复。它不会开启 HTTP 初始化入口，也不会生成旧邀请码。

脚本在一个事务中创建或复用以下事实：

- 指定组织中的最小人事记录与组织成员关系；
- 跨组织自然人；
- 唯一统一账号及安全微信绑定；
- `admin_info` 兼容镜像；
- 全局 `super_admin` 授权；
- 不含姓名、学号、OpenID 或密钥的初始化审计详情。

全局超级管理员授权本身不属于指定组织；组织参数仅用于保证自然人满足系统的成员完整性约束。初始化不会创建岗位。

## 安全约束

- 只能在受控服务器终端离线执行；HTTP `bootstrapRootAdmin`、`bootstrapSuperAdmin` 保持禁用。
- 数据库凭据和 `AUTH_IDENTITY_SECRET` 使用现有安全环境配置，不写入命令、源码或日志。
- OpenID 优先通过临时环境变量提供，避免出现在 shell 历史和进程参数中。脚本不会回显 OpenID。
- 已有统一账号且已有安全微信绑定时，可以不提供 OpenID；脚本从加密绑定中恢复兼容镜像。
- 没有安全绑定时，`BOOTSTRAP_OPENID` 必填。脚本不会创建“已验证但未绑定”的账号。
- 精确确认值必须同时包含学号和组织 ID，防止误操作。
- 已有超级管理员属于其他自然人、姓名与学号冲突、账号被冻结或待恢复、微信绑定属于其他账号、离任成员关系等情况全部失败关闭，不自动合并、替换、解冻或复职。
- 完全相同的配置重复执行只返回“已经生效”，不重复创建记录或审计事件。

## 执行方式

在 `server` 目录中设置临时环境变量后执行：

```powershell
$env:BOOTSTRAP_NAME = '<姓名>'
$env:BOOTSTRAP_STUDENT_ID = '<学号>'
$env:BOOTSTRAP_ORG_ID = '<现有组织ID>'
$env:BOOTSTRAP_OPENID = '<当前微信OpenID>'
$env:BOOTSTRAP_CONFIRM = 'CREATE_GLOBAL_SUPER_ADMIN:<小写学号>:<组织ID>'
npm run security:bootstrap-super
Remove-Item Env:BOOTSTRAP_OPENID
Remove-Item Env:BOOTSTRAP_CONFIRM
```

非敏感输入也支持 `--name`、`--student-id`、`--org-id` 和 `--confirm`。`--openid` 仅为兼容方式，生产操作仍应使用临时环境变量。命令行参数与环境变量同时提供但值不一致时，脚本拒绝执行。

## 兼容升级

旧脚本可能留下 `admin_info.bind_status = 'invited'` 的全局超级管理员记录。若该记录的姓名和学号与本次输入完全一致，新脚本会在事务内升级该记录、清除无人消费的邀请码，并建立统一账号与授权；任何不一致都会中止。

旧的 `SUPER_ADMIN_BOOTSTRAP_SECRET`、`BOOTSTRAP_SECRET` 和邀请码输出流程不再使用。数据库访问权、身份加密密钥、精确目标确认和事务冲突检查共同构成离线执行边界；不要为了兼容旧运维命令恢复 HTTP 绑定或明文邀请码。

初始化完成后，应重新执行服务启动预检。预检必须确认：

- 目标自然人存在有效组织成员关系；
- 统一账号为 `verified` 且只有一个安全活动微信绑定；
- 存在目标自然人的有效全局超级管理员授权；
- `admin_info` 与 `admin_grants.legacy_admin_id` 映射一致。

脚本只报告成功、幂等或错误代码，不输出姓名、学号、OpenID、账号 ID、授权 ID、口令或加密密钥。
