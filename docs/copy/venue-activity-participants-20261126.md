# 场地活动新增与编辑的参会人设置

语言 Agent：`/root/venue_participant_copy`。前端逻辑设计 Agent：`/root/portal_spacing_review`。前端实施 Agent：`/root/venue_participant_frontend`；后端实施：`/root/calendar_participants_check`。

## 场景与结构

本次入口是两端“场地管理 → 规则管理 → 活动 → 新增活动占用”，以及同一活动的编辑窗口。用户填写活动名称、重复方式、占用时间，并在同一表单内选择参会人。本次改动的活动信息与参会设置一次提交；成功文案只在本次提交的全部改动均保存成功后显示。既有活动详情仍可独立编辑参会人，不改变原有时间编辑入口。

参会人设置复用现有日程条件编辑器和人员选择器。指定人员是自然人名单；按工作角色添加使用岗位性质、部门、身份类别及职能组条件。多条来源合并为参会名单，不能把“按工作角色添加人员”说成给工作角色授予管理权限。新活动初始没有参会来源，允许保存空名单；只有明确添加本人来源时才使用“安排人本人”，其含义依据该设置实际保存的安排人，不随查看人变化。

载入时区分读取中、成功可编辑、成功但不可编辑、读取失败。读取中禁止保存；网络失败不显示为空名单或无修改权，仍可保存活动信息但不得提交参会人字段，已有参会设置保持不变。失败提示同时说明这一保存边界并提供重试。明确不可编辑时同样可以按自身授权保存活动信息，不提交参会人字段。`canEdit:false` 可能来自权限、活动或场地停用、旧授权模式，因此只报告当前不可修改，不猜测具体原因，也不声称能够查看名单。

## 新增定稿

以下 3 项语言放行，唯一运行来源为 `shared/locales/zh-CN/calendar.js`，没有动态变量。

| 语料键 | 定稿 | 触发条件与相邻操作 |
| --- | --- | --- |
| participantSettingsLoading | 正在加载参会人设置 | 参会设置及所需候选尚在读取，显示在该分区；不与空名单同显。 |
| participantSettingsFailed | 参会人设置未能加载，请重试。保存活动不会修改参会人设置。 | 本次设置或候选读取失败，旁边提供“重试”；活动保存请求省略名单字段，不覆盖既有名单。不能据此声称写入失败。 |
| participantSettingsReadOnly | 当前不能修改参会人设置。 | 服务端明确确认本次对象不可修改，或旧授权模式尚不提供该操作；不归因于工作角色，不用于超时、缺字段或未知结果。 |

现有 `participantsRestricted` 表示无法查看参会名单，不能用它替代无法修改；现有 `participantsLoading` 和 `participantsFailed` 用于详情实际名单读取，此处新增设置专用语料，避免混淆候选与已经参会的人员。

## 复用语料逐项放行

下列键均来自 `calendar.js`，保持当前值。参会设置标题与说明只显示一份，外层已显示标题时，复用组件只显示说明和编辑控件。

| 语料键 | 保留定稿 | 放行范围 |
| --- | --- | --- |
| participantSources | 参会人设置 | 活动编辑表单中的分区标题。 |
| participantSourcesHelp | 可以指定人员，也可以按工作角色筛选参会人。 | 该分区帮助句。 |
| addParticipantPeople | 添加指定人员 | 新增指定人员来源。 |
| addParticipantScope | 按工作角色添加人员 | 新增工作角色条件来源。 |
| participantSelf、self | 安排人本人 | 本人来源摘要与类型选择。 |
| choosePeople | 指定人员 | 人员选择器标题与打开按钮。 |
| chooseScope | 指定范围 | 来源类型选择。 |
| editParticipantSource | 修改 | 修改一条参会来源。 |
| removeParticipantSource | 移除 | 从当前草稿移除一条来源，不是删除成员。 |
| finishParticipantSource | 完成选择 | 收起当前来源编辑，不表示整个活动已经保存。 |
| participantPeopleEmpty | 尚未选择人员 | 已添加但尚未完成的指定人员来源。 |
| participantScopeEmpty | 尚未设置工作角色范围 | 已添加但尚未完成的范围来源。 |
| department | 部门 | 工作角色的部门条件。 |
| identity | 身份类别 | 工作角色的身份类别条件。 |
| workGroup | 职能组 | 工作角色的职能组条件。 |
| sameDepartment | 与安排人同部门 | 相对于实际安排人的条件。 |
| sameIdentity | 与安排人同身份类别 | 相对于实际安排人的条件。 |
| sameWorkGroup | 与安排人同职能组 | 相对于实际安排人的条件。 |
| unlimited | 不限 | 已明确选定岗位性质后的可选维度不限，不代表任何人都有管理权限。 |
| save、cancel、retry | 保存、取消、重试 | 表单保存、放弃草稿及读取失败恢复。 |

`identityNatureRelations.js` 的 `nature`（工作角色性质）、`calendarSameNature` / `calendarSameNatureSummary`（与安排人当前工作角色的性质相同）、`selectNatureRequired`（请至少选择一种工作角色性质）继续用于相同含义的性质选择、摘要和缺失提示。既有不适用身份类别的确认文案及参数不变。

动态语料继续由共享格式化函数拥有：`participantPeopleCount` 的 `count` 是指定的自然人人数，例如“已指定 2 人”；`participantPeopleSummary(count, names)` 的 `names` 是所选真实姓名，例如“指定人员（2 人）：张三、李四”；`scopeFieldLine(label, value)` 只组合已审核的字段标签与该字段真实显示值，例如“部门：办公室”。不能把预览来源条数当作实际去重后的总参会人数。

保存成功仍使用场地原有 `activityRuleSaved`（活动占用规则已保存），前提是本次请求包含的活动及参会设置全部提交成功；参会设置读取失败或不可修改时，成功只代表本次实际提交的活动信息，不添加“参会人已保存”等超出事实的提示。结果未知继续引用现有保守反馈，不显示“尚未保存”或引导直接重复创建。

## 跟踪状态

- [x] 场景核实：已完成，两端原表单没有参会人字段，只能在保存后的详情中设置。
- [x] 语言放行：上述 3 项新增与逐项复用通过。最终修订将不可编辑原因保持中性，并明确读取失败时保存不会修改参会设置。
- [x] 实施及引用核对：小程序 `venueManagementContent.wxml` 与网页 `VenueRulesDialog.vue` 均引用共享 3 键。两端保存逻辑仅在设置载入成功、可编辑且确有改动时携带参会参数；失败与不可编辑分支省略参数。
- [x] 网页已选状态语言复核：已人工查看 `web/test-results/venue-rules-activity-creat-f646a-citly-clears-the-last-group-{phone,tablet,computer}/activity-participants-selected.png` 共 3 张截图。参会分区标题与帮助各显示一份，1 人摘要、修改、移除、两种添加方式及保存按钮均与放行稿一致。示例姓名属于测试业务数据，未改写。
- [x] 最终失败与不可编辑新定稿的实际界面复核：重新构建后在 Chrome 的 phone、tablet、computer 三档运行同一重试用例，3 项通过，并逐张查看 6 张截图。失败提示完整显示两句，手机自然换行，重试与保存按钮分开；不可编辑说明不归因于工作角色，没有可编辑参会控件。截图位于 `web/test-results/venue-participant-copy-final/venue-rules-participant-ca-21730-er-sends-a-replacement-list-{phone,tablet,computer}/activity-participants-{failed,readonly}.png`。取图前先滚到参会分区，未将可见性断言当作截图内容的替代。
- [ ] 原生及实体设备现场复核：由实际验证 Agent 另行记录，本次语言审核不标为通过。
