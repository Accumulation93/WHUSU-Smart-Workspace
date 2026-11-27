# 场地申请时间提示独立语言复核

2026-11-28。场景核实：`venue_hint_context`；语言定稿：`venue_hint_language`；生成同步、测试与发布：主 Agent。

## 场景与边界

普通场地卡的开放和截止提示各自为一个完整标签。服务端 `venueBookingWindow.js` 把日换算成连续 24 小时，从借用开始时刻倒推，不按日历日期零点计算。因此移除旧文案中的“借用日期前”。开放边界包含该时刻，截止边界不包含该时刻。默认截止和截止 0 日、0 分钟均要求借用开始前完成申请。

## 放行定稿

| 唯一源与键 | 定稿及示例 | 语义 |
|---|---|---|
| venueBooking.submissionOpenDays | 至多提前 7 日申请 | 不能早于借用开始前 7×24 小时 |
| venueBooking.submissionOpenDuration | 至多提前 2 小时 30 分钟申请 | 以现有时长格式传入，含纯小时、纯分钟 |
| venueBooking.submissionOpenUnlimited | 提前申请不限时长 | 只说明开放侧，不取消截止或其他限制 |
| venueBooking.submissionDeadlineDays | 至少提前 2 日申请 | 提交必须早于倒推后的截止时刻；0 日使用下述默认句 |
| venueBooking.submissionDeadlineDuration | 至少提前 30 分钟申请 | 小时与分钟同义；0 分钟由现有调用方转默认句 |
| venueBooking.submissionDeadlineAtStart | 申请截止到借用开始前 | 不包含借用开始时刻 |
| venueBooking.copy_584ba3052b / copy_9e824e777e | 提前申请不限时长 / 申请截止到借用开始前 | 旧兼容键保留相同语义 |
| venueManage.copy_4c3db5642e / copy_7e6312cdad | 最早申请时间 / 申请截止时间 | 管理配置字段名称 |
| venueManage.copy_797923e7ce | 不设置时，提前申请不限时长；设为 0 时，不开放申请。 | 开放 0 实际不存在合法提交区间，不能描述为当天可申请 |
| venueManage.copy_bdfe30a344 | 不设置或设为 0 时，申请截止到借用开始前。 | 保留默认边界说明 |
| venueManage.copy_b1545efd70 | 最早申请时间不能晚于截止时间，请调整。 | 保留现行配置校验含义 |
| venueManage.rulesSectionWindow | 申请时间限制 | 区分场地本身开放时段 |
| authorization.actions.createApproved | 安排 | 用户明确指定。两端场地卡及日程入口共享该键；不改权限能力和保存行为 |

保留“提交后，借用直接生效。”作为安排表单说明，避免把直接安排误认为待审批申请。不改权限中心能力名称及历史业务记录。以上 15 个条目语言放行，不要求改变页面结构。已执行三个源文件的 JS 语法检查及差异检查；生成物与实际界面由主 Agent 验证，本记录不声称实体设备已通过。

## 实际界面语言复核

语言 Agent 已逐张查看主任务提供的 6 张 Chrome 截图：phone、tablet、computer 各包含场地列表与申请时限设置页。列表中的“提前申请不限时长”“申请截止到借用开始前”与定稿一致，两个条件分别展示且文字完整。设置页中的“最早申请时间”“申请截止时间”及两条默认/零值说明均完整可读；手机说明自然换行，没有省略关键边界。本组截图语言放行。

上述截图覆盖默认标签与管理设置，不包含带具体日数、小时数的列表标签，也未覆盖“安排”入口正面展示；这些分支不能据此宣称完成截图复核。实体设备验证不在本记录内。
