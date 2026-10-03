# 故障登记与防复发门禁

本文件是"已经踩过的坑 + 现在由哪道闸门守住"的唯一清单。任何一次**用户可见的异常**（UI 错位、跑不通、逻辑不对、数据不一致、发布中断）修完之后，必须回到本表：要么说明现有门禁为什么没拦住，要么补一条门禁/一条硬规则。**未登记的修复视为未完成。**

两道总闸门：

1. **改动即门禁**：提交前必须按"完成前必跑清单"跑与改动范围匹配的脚本；静态通过 ≠ 现场通过。
2. **现场优先**：涉及布局、滚动、键盘、动画的改动，静态审计通过后必须在手机、Pad 竖屏、Pad 横屏三档现场确认；无法确认时必须在交付说明里写明"未完成现场验证"，不得表述为已验证。

## 一、UI / 交互类

### F-01 滚动容器失去确定高度：列表滑到底不加载、弹窗拖不到底
- 现象：人事成员目录只显示首批 50 人（实际 785 人），滑到底不加载；长弹窗正文拖不到底、最后一行被裁。
- 根因：微信 `scroll-view` 只有拿到确定高度才产生内部滚动。一次"清除写死高度"的全局改动把 `.large-scroll/.medium-scroll/.small-scroll` 改成 `max-height: none`，容器随内容撑开，内部滚动量为 0，`bindscrolltolower` 永不触发。
- 门禁：`scripts/dialog-scroll-contract-audit.js`（长列表弹窗必须三段网格、保留确定高度）；`scripts/hr-profile-layout-test.js` 的分页可达性断言（触底处理器不得为空；容器无确定高度的页面必须注册 `onReachBottom`）。

### F-02 弹窗标志位泄漏：弹窗关闭后页面"有一块不能滚/不能用"
- 根因：页面用 `page-meta page-style="… ? 'overflow: hidden;' : ''"` 靠标志位锁滚动，标志位没复位就永久锁死。
- 门禁：`scripts/dialog-keyboard-audit.js`（每个锁标志位必须能在页面脚本里找到 `false` 复位；含弹窗输入控件的页面必须声明 `dialogLockKeys` 并在 `onUnload` 调用 `releaseDialogScrollLock()`）。

### F-03 键盘把页面顶偏、与 fixed 弹窗错位
- 现象：键盘弹起时整页上移、弹窗与底部按钮错位甚至够不到，鸿蒙真机明显。
- 根因：输入控件默认 `adjust-position=true`（整页位移），而弹窗是 `position: fixed`（不跟随）；全站一度 87 个 input、23 个 textarea 只有 1 个禁用了整页位移。
- 门禁：`scripts/dialog-keyboard-audit.js`（弹窗外壳内所有 `input/textarea` 必须 `adjust-position="{{false}}"` 且带 `cursor-spacing`；含弹窗输入控件的页面必须把 `dialogKeyboardHeight` 写进 `page-style` 的 `--kb-height`，由 `app.wxss` 的弹窗外壳规则收窄上移，遮挡交给弹窗正文自身滚动）。

### F-04 控件被裁切、看不到底、写死尺寸
- 门禁：`scripts/ui-control-completeness-test.js`、`scripts/ui-audit.js --strict`、`scripts/button-alignment-test.js`。禁止固定高度裁切、禁止行内 text 冒充完整选择框、禁止把动态内容写成定值高度。

### F-05 文案：硬编码、电报体、对象错误、内部术语泄漏
- 门禁：`scripts/user-visible-copy-audit.js --strict`、两个 `--strict-localization`、`--strict-guidance`、`scripts/copy-quality-audit.js`。文案改动逐条人工判断，禁止脚本批量替换。

## 二、服务端 / 数据类

### F-06 启动期数据契约把全站打成 502
- 现象：12:29:28–12:39:33 全站 502（226 次），自动回滚同样失败，服务停在维护状态。
- 根因：`admin_info` 有一条兼容行没有对应的有效 `admin_grants`，启动期"统一身份完整性"校验拒绝启动。
- 规则：这类展示层一致性问题必须**先就地补齐映射，补不齐只告警、不阻断启动**；只有 schema 缺列/缺表才允许阻断启动。存量脏数据由迁移（`server/db/deploy/*_admin_grant_legacy_link.sql`）一次性修复并入账本。

### F-07 授权行 ↔ 兼容行映射不变式
- 现象：在小程序里正常新建超级管理员，留下一条没有映射的兼容行，下一次重启触发 F-06 全站停服。
- 根因：`admin_grants` 唯一键 `(person_id, org_id)`；`syncLegacyAdminGrant` 的 upsert 撞键后**没有回写 `legacy_admin_id`**。
- 规则：upsert 必须写 `legacy_admin_id = VALUES(legacy_admin_id)`；任何"新建/变更管理员"路径跑完后，未映射兼容行数必须为 0：`SELECT COUNT(*) FROM admin_info ai LEFT JOIN admin_grants ag ON ag.legacy_admin_id=ai.id AND ag.status='active' WHERE ag.id IS NULL`。
- 门禁：`server/test/adminGrantLegacyMapping.test.js`（upsert 回写 + 启动自愈 + 迁移口径）。交叉事实：`admin_info` 上 `(student_id, org_id)` 唯一，同一自然人+组织不可能出现两条兼容行，故障只会表现为"缺映射"。

### F-08 发布即中断
- 现象：只要有服务端改动升级就伴随停机（当天 294 次 502 中 285 次来自故障与重启窗口）。
- 规则（`server/scripts/deployProduction.sh`）：非破坏性迁移在线执行（只做 `--single-transaction` 快照，不停进程、不进维护状态）；破坏性迁移（DROP/TRUNCATE/DELETE FROM/RENAME/ALTER … MODIFY|CHANGE 或 `-- @destructive`）与 UTC 切换才走维护窗口；上流量前在独立端口预检新版本；切换用 PM2 集群滚动重载（`listen_timeout=20s`）；在线失败滚动切回旧版本，不停进程、不回滚数据库；前端-only 发布不得重启进程。实测基线：14:39 与 15:53 两次服务端发布窗口内 5xx = 0。

### F-09 依赖安全公告阻断 CI
- 规则：优先升级或移除依赖（曾用 Node 自带 `--watch` 取代 nodemon，整条 `braces/chokidar` 链路消失）；**禁止为新公告开豁免**；豁免只允许"官方无修复版本且漏洞路径在本仓库不可达"，且必须写证据与到期日。

### F-10 时间与日期
- 现象：数据库格式日期迁移不识别、日期显示带时间与时区、复盘时间线整体偏 8 小时。
- 规则：解析统一走 `miniprogram/utils/hrProfileDate.js`；日期字段只显示日期（`2004.08.31`），日期时间才显示到秒；库内一律 UTC 原始值、对外按 `system_config.timezone` 换算，禁止使用设备本地时区。门禁：`scripts/time-system-audit.js --strict`；排查生产时间线必须用 `DATE_FORMAT` 原始值再显式换算。

### F-11 权限判定静默中止：超管被显示"无权限"
- 现象：超级管理员进管理端看到"暂无管理权限"，之后又变成一直"正在加载"。
- 根因：判定过程存在静默 `return` 与被吞掉的异常；用"会话快照全等（含版本号）"判断是否被切换，真机存储桥时序导致版本变化即被判成"角色已切换"；权限目录在"组织未落盘"时被整份丢弃。
- 规则：判定必须收敛到确定状态，不得停在中间态；会话比较只看组织/角色/上下文/令牌；目录丢弃只允许发生在"确知组织且不一致"时；必须有超时兜底与一次有界重试。

### F-12 组织数据以组织内为准
- 规则：成员资料、成员列表、本人资料一律读组织内记录；跨组织只做复制迁移，源组织数据不变；全局补充资料已退役（归档后物理删除），不得再新增全局读写。

### F-13 账号、会话与设备识别
- 规则：口令与微信只是同一全局账号的两种认证方式；业务/权限/消息/附件只认认证中间件给出的账号自然人与有效工作角色，禁止按 OpenID、姓名、学号或客户端人员 ID 查当前操作者；登录设备只按本地持久化安装标识的服务端摘要区分，无法持久化时不得声称"同一设备"；冻结/恢复/离任对两种登录同时生效。

### F-14 提交链路
- 规则：修复保存/提交必须用真实前端参数跑通一次并回读结果；空参数拒绝、语法检查、函数存在都不算提交验收。门禁：`scripts/submission-reference-audit.js`（含 `--self-test`、`--inventory`）。

## 三、环境与工程化

### F-15 本地与线上环境差异
- 构建固定 `nodeModules:false`、`es6:false`、`enhance:false`、`swc:false`、`disableSWC:true`；禁止依赖开发者工具热重载注入的编译器 helper，引入新语法前必须证明 helper 已被打包。
- 部署入口用 `git show <sha>:server/scripts/deployProduction.sh` 取脚本并先 `bash -n` 再执行，本地 CRLF/LF 差异不影响线上；CI 同样对三个 shell 脚本跑 `bash -n`。
- 鸿蒙真机存在同步存储桥阻塞与"请求已 200 但客户端 pending"的现象：响应回调里禁止再做同步存储读取；需要等待的判定必须有超时兜底。
- 开发者工具编译通过是前端验收的可信依据；不得用"没重新编译/缓存"解释现象。

## 四、完成前必跑清单（按改动范围取用）

| 改动范围 | 必跑 |
|---|---|
| 任何 JS | `node --check <file>` |
| 小程序前端 | `miniprogram-compat-audit`、`wechat-template-runtime-audit`、`miniprogram-page-registration-test`、`ui-audit --strict` |
| 弹窗 / 滚动 / 键盘 | `dialog-scroll-contract-audit`、`dialog-keyboard-audit`、`ui-control-completeness-test`、`button-alignment-test` |
| 列表分页 | `hr-profile-layout-test`（分页可达性）、`dialog-scroll-contract-audit` |
| 文案 | `user-visible-copy-audit --strict`、两个 `--strict-localization`、`--strict-guidance`、`copy-quality-audit` |
| 服务端接口 | `submission-reference-audit`（含 `--self-test`）、`tenant-sql-audit`、`admin-route-permission-audit --strict`、`security-audit --strict` |
| 迁移 | `bash -n` 部署脚本、`runDeploymentMigrations.js plan` 预检 |
| 依赖 | `dependency-audit`（含 `--self-test`） |
| 时间/日期 | `time-system-audit --strict` |
| 收尾 | `git diff --check`，并跑 `server/test/*.test.js` 全量 |

## 五、现场验收矩阵（静态通过不算通过）

| 场景 | 手机 | Pad 竖屏 | Pad 横屏 |
|---|---|---|---|
| 长列表滚到底能继续加载、分页提示正确 | ☐ | ☐ | ☐ |
| 弹窗开合后整页可滚、无"不能用的区域" | ☐ | ☐ | ☐ |
| 键盘弹起页面不位移、被遮挡输入框可见可点 | ☐ | ☐ | ☐ |
| 控件完整显示、末项与页面底部保留边距 | ☐ | ☐ | ☐ |
| 动作按钮文字居中、长文案不裁切 | ☐ | ☐ | ☐ |
| 日期/日期时间显示符合口径（无时区、无时间乱入） | ☐ | ☐ | ☐ |
