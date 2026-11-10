# 消息概览事实与结构

本文件由前端逻辑设计角色编写，不是最终界面语料。语言稿见 message-facts-editorial-20261103.md，实施须经过独立语言审阅。

## 已核实退化原因

`shared/messageFactsView.js` 的通知分支只按 type 选择固定句子，返回空 detailLines；`notification.js` 的 mapNotification 没有返回结构化业务事实。此前具体业务名称和步骤仅拼在服务端 description 中，新版禁用服务端系统句后相应信息丢失。恢复应补事实，不回用或拆解中文 description。

## 通知事实清单

| 类型 | 可用业务事实及限制 |
| --- | --- |
| submission_approved | 申请标题或编号，真实审批轮次与完成步骤；eventKey 中步骤是事件步骤 |
| submission_progress | 申请标题，eventKey 的轮次及已通过步骤；下一步只能由对应历史流程确定，不能使用当前进行步骤替代 |
| submission_rejected | 申请标题，对应轮次驳回步骤；对应事件审核意见为业务原文 |
| booking_approved | 借用事由、场地、起止时间；结果来自通知类型 |
| booking_rejected | 借用事由、场地、起止时间；不猜缺失的驳回原因 |
| booking_cancelled | 借用事由、场地、起止时间；类型本身不证明是自动取消 |
| hr_profile_approved | 收件人本人的资料审核结果；不能用资料标题猜姓名 |
| hr_profile_rejected | 本人资料审核结果；理由仅使用对应审核事件原文 |
| hr_profile_migration | 来源和目标组织；执行、审批、取消共用该类型，旧通知不能从当前状态伪造事件结果 |
| score_activity_started | 已授权评分活动名称和日期 |
| score_deadline_24h | 活动名称和实际截止时间；旧提醒不保证此刻仍剩24小时 |
| score_results_published | 公示对应活动名称；不补查未授权成绩 |
| calendar_reminder | 日程名称、对应 occurrence 起止时间及授权地点；使用中性时间标签，旧提醒不宣称未来 |
| account_security | 已核实当前微信恢复事件；只有规范事件键或新增结构字段确证时提供 subtype，未知保持中性 |

## 待办事实清单

- 审核：申请标题、提交人、当前待办步骤编号和名称。姓名与步骤任一缺失独立降级，不省略已有申请标题。
- 场地：借用事由、申请人、场地、起止时间、待审批步骤。按已有待办资格读取。
- 评分：活动名称和未完成数量；不显示被评分人学号，不把任务数量说成人数。
- 人事资料：memberName 独立事实、资料审核任务；businessTitle 不当作人员姓名。

## 实施边界

卡片使用业务标题、完整结果句、事实明细三层。不可打开详情时只改变操作状态，不覆盖已有业务概览。缺少某项只省略该项，不生成当前岗位或当前步骤冒充历史。

服务端按领域批量读取、组织隔离及当前权限过滤，禁止逐通知查询，禁止从旧中文描述反推。历史原通知、审批文件和事件不得改写。迁移通知若返回当前状态必须明确其为当前状态，不表述为该通知产生时的结果。

依据：auditUser.js 审批通过/进展/驳回 createNotification；hrProfile.js 资料审核通知；hrProfileMigration.js 三处 notify；calendarReminders.js occurrence 与 receipt；publications.js 公示 outbox；unifiedIdentity.js 微信恢复通知；notification.js mapNotification。
