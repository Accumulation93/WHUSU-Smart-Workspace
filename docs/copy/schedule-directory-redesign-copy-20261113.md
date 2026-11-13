# 日程参会人与通讯录配置：独立语言稿（2026-11-13）

语言角色只写稿，实施角色另行接入共享语料库。结构依据来自 schedule_directory_redesign：摘要优先、单区展开、单组编辑；不把所有条件与按钮同时摊开。语言放行该结构，不批准在旧全展开结构中继续堆叠说明。

## 通讯录

保留上一轮已审三分区标题及主体解释，但说明只在对应编辑区展示。新增以下语料键至 contactDirectory：

| 键 | 定稿 | 使用情境 |
|---|---|---|
| editAudience | 设置查看者 | 第一摘要区操作 |
| editTargets | 设置可查看人员 | 第二摘要区操作 |
| editColumns | 设置可见资料 | 第三摘要区操作 |
| finishSection | 完成设置 | 收起本区，仅修改编辑草稿，不等同保存规则 |
| finishGroup | 完成选择 | 收起当前人群编辑，不立即保存规则 |
| editGroup | 修改 | 人群摘要小操作 |
| audienceEmpty | 尚未选择查看者 | 无查看人群 |
| targetsEmpty | 尚未选择可查看人员 | 无目标人群 |
| addAudiencePeople | 添加指定查看者 | 添加people组 |
| addAudienceScope | 按岗位添加查看者 | 添加scope组 |
| addTargetPeople | 添加指定人员 | 添加people目标组 |
| addTargetScope | 按岗位添加人员 | 添加scope目标组 |
| addTargetSelf | 允许查看本人资料 | 添加self目标组 |

保留 removeAudience/removeTargets、save/cancel、baseOnly、chooseFields；已选字段摘要用实际字段名称，不只报数量。finishSection/finishGroup旁不出现“已保存”反馈。新增与编辑规则均必须通过底部“保存”持久化。

## 日程参会人

以下键加入 calendar，作用于真实参会来源编辑，不用于安排权限规则的 audience：

| 键 | 定稿 | 使用情境 |
|---|---|---|
| participantsExpand | 查看参会名单 | 默认折叠名单的展开入口 |
| participantsCollapse | 收起参会名单 | 展开后入口 |
| editParticipants | 编辑参会人 | 独立于展开的操作 |
| participantSources | 参会人设置 | 编辑区标题 |
| participantSourcesHelp | 可以指定人员，也可以按岗位选择范围。 | 编辑区一次说明 |
| addParticipantPeople | 添加指定人员 | 新增people来源 |
| addParticipantScope | 按岗位添加人员 | 新增scope来源 |
| participantSelf | 安排人本人 | self来源摘要，保留原self同值 |
| editParticipantSource | 修改 | 来源摘要小操作 |
| removeParticipantSource | 移除 | 仅从当前草稿移除来源 |
| finishParticipantSource | 完成选择 | 收起当前来源，不提交整个日程 |
| participantPeopleEmpty | 尚未选择人员 | people组空摘要 |
| participantScopeEmpty | 尚未设置岗位范围 | scope组空摘要 |
| participantsCount | 参会人（{count} 人） | count必须为权威完整人数，未加载不显示0 |
| participantPeopleSummary | 指定人员（{count} 人）：{names} | names为已授权可展示姓名；若只显示部分须另传余数，不得暗示完整 |

完整名单加载前只用“参会人”标题；权限拒绝、失败、空名单分别保留现有专用语料。折叠不改变参会名单。移除来源并不保证该人退出：同人仍可能由其他来源命中，因此不能显示“已移除参会人”。最终结果仅以保存后回读名单为准。

## 通知分类

messages.categoryLabels.calendar 新增“日程”。保留 system“其他”，不能用改名影响无关通知。保留 calendar.reminderTitle“日程提醒”。标题和开始时间使用可信业务参数与已有前端语料；不显示后端系统句子。

## 放行范围

以上文字及情境已语言放行。业务代码不得拼接句子；动态模板由语料函数或现有格式器完整处理。新结构若改变语义必须退回语言审阅。尚未进行实际界面复审。

## 实施补充放行

- `portal.categoryLabels.calendar` 可直接引用 `messages.categoryLabels.calendar` 的“日程”，语义相同；仅可信 `calendar_reminder` 映射到该类，不改其他 system 消息。
- contactDirectory 新增 `manageSelection`：`批量管理`；`finishSelection`：`完成`。前者进入规则勾选模式，后者退出勾选模式，不保存规则或执行删除。
- calendar 新增 `scopeFieldLine(label, value)`：`{label}：{value}`，由语言库函数拥有整行格式；label 与 value 使用日程自身已批准语料，不复用“查看者”措辞。
- calendar 新增 `participantPeopleCount`：`已指定 {count} 人`，只知道有效人员编号与人数、没有可展示姓名时使用，不补造姓名。
- 日程安排规则 audience 区可以复用本稿 `editParticipantSource` 的“修改”和 `finishParticipantSource` 的“完成选择”值，但建议实施者登记独立语义键 `editAudienceGroup` 与 `finishAudienceGroup`。动作分别仅打开组编辑和收起当前组，不提交整条规则。不得复用“参会人设置”“移除参会人”或参会人空态来描述安排权限接收者。
- 日程安排规则 audience 空摘要另用 `audiencePeopleEmpty`：`尚未选择获得安排权限的人员`；`audienceScopeEmpty`：`尚未设置获得安排权限的岗位范围`。

## 实际参会编辑截图复审

已查看 `web/test-results-directory-redesign-final/venue-participants-layout--1e3e8-eserve-selection-after-save-phone/participant-editor.png`。参会来源与修改范围明确；发现“身份类别 · 0”等数字摘要无法说明范围，要求修改后再最终验收。

批准可选维度摘要显示真实已选名称；确实未选择时使用既有 calendar.unlimited“不限”。已有选择编号但候选名称失效时使用既有 staleReferences，不清空编号、不显示不限。必选岗位性质为空不得使用不限。

批准补充资料的“完成设置”移至选项之后；参会页已有主标题时删除重复次标题。两项属于顺序和层级调整，不改变保存含义。

最终浏览器复审：已查看 `web/test-results-participant-final/venue-participants-layout--1e3e8-eserve-selection-after-save-phone/participant-editor.png`，部门显示实际名称，身份类别和职能组显示“不限”，旧数字歧义已修。通讯录最终 phone 截图三类权限主体、完成设置与整条保存的层级明确。上述浏览器语言复审通过；原生截图尚待单独核对，不以浏览器代替。

## 原生实际界面语言复审

独立语言 Agent 已实际查看 tmp/native-directory-new-20261113.jpg、native-directory-existing-20261113.jpg、native-directory-fields-20261113.jpg、native-directory-scope-20261113.jpg，以及 native-participants-collapsed-20261113.jpg、native-participants-expanded-20261113.jpg。新建与已有规则的权限主体分区清楚，资料编辑的完成设置与底部保存区分正确；36人真实名单的查看/收起动作表述一致。以上状态语言通过。

截图中的开发者工具路由错误、组件空值警告仍由工程角色判断，语言通过不表示控制台无错。原生参会来源编辑需另看最终截图；实体手机及Pad没有由语言角色现场验证。

原生参会来源最终复审：已实际查看 tmp/native-participants-editor-20261113.jpg、native-participants-scope-20261113.jpg、native-participants-summary-20261113.jpg。安排人本人、按岗位添加人员、未设范围、可选维度不限、性质选择后的摘要均与批准语义一致；完成选择仅收起来源，底部保存仍独立。原生本轮已提供状态语言复审通过，不包括实体手机、Pad或未展示状态。截图的工具错误继续单独由工程验证处理。
