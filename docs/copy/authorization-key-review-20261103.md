# 权限语料逐项审阅记录

语言审稿人：`/root/language_editor`。只写文档，不实施语言库或页面。本文与 authorization-editorial-20261103.md 合用；其中的情境改稿优先于本表旧值。状态“保留”表示逐项审阅后原值准确，“改稿”表示执行前稿指定全文，“退回”表示不能在当前调用条件下使用。相同名词可保留，不能据此任意换用情境。

## 权限主界面、编辑与反馈

| 键 | 状态／定稿 | 情境与理由 |
|---|---|---|
| appName | 保留 common.brandName 引用 | 品牌只能引用共享品牌源 |
| title | 保留：权限管理 | 子应用标题 |
| businessManagement | 保留：管理 | 业务子应用的管理页签 |
| managementUnavailable | 保留：暂时无法读取管理权限 | 读取失败，不应显示无权限 |
| rules | 保留：分配权限 | 分配任务入口 |
| schemes | 保留：身份设置 | 可复用授权身份入口 |
| effective | 保留：查看权限 | 权限查询入口 |
| tabHelp.schemes | 改稿 | 明确身份是功能集合 |
| tabHelp.rules | 改稿 | 明确具体岗位或管理员 |
| tabHelp.effective | 改稿 | 查询结果不替代业务资格 |
| firstUse | 改稿 | 补齐发布环节 |
| searchIdentities | 保留：搜索身份名称 | 搜索框对象明确 |
| adjustPermissions | 保留：调整权限 | 已有授权编辑 |
| revise | 保留：返回修改 | 从预览回表单 |
| identityExample | 保留：例如：场地管理员 | 举例而非默认授权 |
| advancedSettings | 保留：更多设置 | 展开高级配置 |
| advancedRules | 保留：全部授权 | 包含动态人群授权 |
| simpleSettings | 保留：收起更多设置 | 与展开成对 |
| simpleUnavailable | 保留：这项权限设置了额外限制，请在更多设置中修改。 | 简单表单不能表达完整规则 |
| stepPeople | 保留：1. 选择人员与岗位 | 第一步选择具体获权对象 |
| stepIdentity | 保留：2. 选择身份 | 第二步选已发布身份 |
| stepScope | 改稿 | 读取权限同样有适用范围 |
| chooseIdentity | 保留：请选择已发布的身份。 | 未选身份阻断 |
| identityPlaceholder | 保留：选择身份 | 选择控件占位 |
| identityExplanation | 改稿 | 区别人事身份类别 |
| customAuthorization | 保留：单独设置的权限 | 非身份关联规则 |
| sharedGrantNotice | 保留：这项设置由多人共用，修改会同时影响他们。 | 仅多人共用规则显示 |
| identityGrantName(name) | 保留：{name}授权 | 自动生成规则名称，name为身份名 |
| noDirectGrants | 保留：暂无直接分配的身份。按部门等范围分配的权限，请在“全部授权”中查看。 | 不把直接授权为空说成无权限 |
| sensitiveOperations | 保留：重要权限 | 删除、账号治理等突出分组 |
| searchEffective | 保留：搜索操作或权限 | 查询结果筛选 |
| searchOperations | 保留：搜索权限 | 能力选择筛选 |
| effectiveCount(count) | 保留：共 {count} 项 | 紧邻权限列表，数值为实际结果数 |
| selectedOperations(count) | 保留：已选 {count} 项权限 | 操作选择摘要 |
| delegations | 改稿 | 分配人员目录 |
| deleteDelegationNotice | 改稿 | 撤销委托不撤销已有使用权 |
| delegationWillBeRemoved | 改稿 | 撤销委托预览 |
| createDelegation | 改为：添加权限分配人员 | “添加分配人”对象不够明确 |
| delegateRecipients | 改稿 | 指可替他人分配的管理员 |
| delegationSubjects | 改稿 | 指最终可获授权对象 |
| delegationCapabilities | 改稿 | 指可分配上限 |
| createRule | 保留：分配身份 | 简单分配主入口 |
| createScheme | 保留：新建身份 | 新建授权身份 |
| edit | 保留：编辑 | 卡片内指向本项 |
| copy | 保留：复制 | 打开副本编辑，不立即授权 |
| copyInvalid | 保留：复制内容不完整，请重新选择。 | 来源载荷缺失 |
| copyConflict | 保留：复制配置已变更，请刷新后确认。 | 编辑版本冲突 |
| copyApprovalConflict | 保留：直接通过不能与其他审批规则同时启用，请先调整目标场地的借用规则。 | 具体冲突与处理入口明确 |
| copyMissing | 保留：这份配置已不存在，请刷新列表。 | 来源不存在 |
| copyUnavailable | 保留：来源组织已撤回或更新分享，请重新选择。 | 未完成副本失效 |
| copyUnsupported | 保留：这类配置暂不支持复制。 | 类型不受支持 |
| copyDuplicate | 保留：本组织已有同名配置，请先检查原配置。 | 不暗示覆盖 |
| copyReference | 改为：请为来源配置中的选项选择本组织对应项。 | 避免“关联选项”内部词 |
| save | 保留：保存 | 普通表单保存 |
| cancel | 保留：取消 | 放弃本次编辑 |
| remove | 保留：撤销授权 | 删除规则，非删除人员 |
| publish | 保留：发布身份 | 发布授权身份版本 |
| confirmPublish | 保留：确认发布 | 发布确认动作 |
| restore | 保留：恢复此版本 | 历史版本入口 |
| previewRestore | 保留：恢复此版本 | 打开恢复影响预览 |
| confirmRestore | 保留：确认恢复 | 发布新的恢复版本 |
| name | 保留：名称 | 须置于明确任务下 |
| effect | 保留：授权方式 | 允许或禁止选择 |
| state | 保留：状态 | 启停或发布状态 |
| removeCondition | 保留：移除条件 | 删除本组条件 |
| addConditionGroup | 保留：添加一组条件 | 多组任一匹配 |
| selectOperations | 保留：单独选择权限 | 脱离身份模板选能力 |
| saveDraft | 保留：保存草稿 | 身份未发布 |
| chooseDate | 保留：选择日期 | 日期控件 |
| chooseTime | 保留：选择时间 | 时间控件 |
| versionHistory | 保留：历史版本 | 不覆盖历史 |
| selectedRules(count) | 保留：已选 {count} 项授权 | 批量撤销计数 |
| deleteRuleNotice | 改稿 | 删除禁止规则可能恢复权限 |
| publishSchemeNotice | 改稿 | 同时覆盖岗位和管理员 |
| ruleWillBeRemoved | 保留：将撤销这项授权 | 单项撤销影响 |
| subjects | 改稿 | 中性对象标题 |
| capabilities | 改稿 | 仅中性摘要；编辑必须拆情境 |
| scopes | 改稿 | 不把读取称为管理 |
| fields | 改稿 | 中性摘要；编辑用专用字段文案 |
| adminExportColumns[0] | 保留：姓名 | 导出列头 |
| adminExportColumns[1] | 保留：管理身份 | 不与岗位身份类别混淆 |
| superAdminRole | 保留：超级管理员 | 已有系统角色名称 |
| adminRole | 保留：普通管理员 | 已有系统角色名称 |
| bookingRequestChanged | 保留：这次借用已提交，但重试内容不同。请重新打开借用页面后再提交。 | 重复请求内容冲突，不谎称未提交 |
| legacyDelegationName | 保留：原有权限分配范围 | 迁移配置默认名称 |
| noFieldSelected | 改稿 | 具体选项与错误相同 |
| conditions | 保留：生效时间 | 当前条件区仅时间 |
| allow | 保留：允许 | 与动作和对象并排 |
| deny | 保留：禁止 | 与动作和对象并排 |
| enabled | 保留：已启用 | 权威启用状态 |
| disabled | 保留：已停用 | 权威停用状态 |
| draft | 保留：草稿 | 尚未发布 |
| published | 保留：已发布 | 已发布状态 |
| currentOrganization | 保留：本组织记录 | 范围选项 |
| specifiedRecords | 保留：指定记录 | 范围选项 |
| ownRecords | 保留：本人记录 | 本人归属范围 |
| assignmentScope | 保留：按岗位筛选 | 数据或对象范围类型 |
| assignments | 保留：岗位 | 一岗一卡选项 |
| adminGrants | 保留：管理员 | 管理身份选项 |
| nature | 保留：岗位性质 | 字典正式名称 |
| department | 保留：部门 | 字典正式名称 |
| identityCategory | 保留：身份类别 | 人事类别正式名称 |
| workGroup | 保留：职能组 | 字典正式名称 |
| sameAsViewer | 改稿 | 获权岗位不是配置者 |
| allFields | 改稿 | 字段而非全部人事资料 |
| startsAt | 保留：开始时间 | 生效起点 |
| endsAt | 保留：结束时间 | 生效终点 |
| previewChanges | 改稿 | 预览非最终提交 |
| noRules | 保留：暂无授权 | 仅成功加载当前列表为空 |
| noSchemes | 改稿 | 依据已发布身份数量 |
| loading | 保留：正在加载权限 | 权限页加载 |
| saving | 保留：正在保存权限 | 权限写入进行中 |
| publishing | 保留：正在发布身份 | 发布进行中 |
| retry | 保留：重试 | 仅失败恢复操作 |
| search | 保留：搜索姓名、岗位或身份 | 实际搜索三类字段 |
| previewOnly | 保留：新规则尚未启用，当前显示试算结果。 | 仅试算模式显示 |
| affectedPeople | 保留：受影响人员 | 去重自然人数 |
| affectedRoles | 保留：受影响工作角色 | 岗位及管理身份数量 |
| beforeChange | 保留：修改前 | 预览前值 |
| afterChange | 保留：修改后 | 预览后值 |
| noChange | 退回：不得按人数为零显示 | 仅完整规则比较相同才可保留“权限条件没有变化”，现调用改用noAffectedRoles |
| chooseRole | 保留：选择工作角色 | 查询当前角色或他人角色 |
| choosePeople | 保留：选择人员或岗位 | 选择器入口须实际区分选择类型 |
| unnamed | 保留：名称未记录 | 缺名称，不伪造名称 |
| unavailableReference | 保留：选项已失效 | 已删字典引用 |
| unknownCapability | 保留：操作尚未登记 | 能力目录未知项 |
| noLimit | 保留：不限制 | 必须紧邻被限制的维度 |
| noConditions | 改稿 | 无时间限制不等于已启用 |
| specifiedCount(count) | 保留：指定 {count} 条记录 | 明确条数 |
| selectionCount(count) | 保留：已选 {count} 项 | 邻近列表标识对象 |
| impactCount(people,roles) | 保留：影响 {people} 人、{roles} 个工作角色 | 同人多角色不混算 |
| capabilityLabel(resource,action) | 保留：{resource} · {action} | 功能对象与动作联合呈现 |
| dimensionLabel(dimension,values) | 保留：{dimension}：{values} | 条件维度和值 |
| alternativeGroup(index) | 保留：条件组 {index} | 多组选择定位 |
| withinGroup | 改稿 | 同岗位同时成立 |
| betweenGroups | 改稿 | 任意组成立 |
| delegationNotice | 改稿 | 分配权不等于使用权 |
| schemeVersion(version) | 保留：第 {version} 版 | 发布版本序号 |
| useScheme | 保留：选择身份 | 使用身份模板 |
| ownRole | 保留：当前工作角色 | 不合并其他岗位权限 |
| inspectAssignment | 保留：选择岗位 | 查询岗位权限 |
| inspectAdmin | 保留：选择管理员 | 查询管理身份权限 |
| batchSelect | 保留：批量选择 | 开始勾选 |
| finishSelection | 保留：结束选择 | 退出勾选态 |
| selectShown | 保留：全选筛选结果 | 必须覆盖全部筛选结果而非当前页 |
| clearSelection | 保留：取消全选 | 同名源键重复两次，应由实施去重但不改语义 |
| deleteSelected | 保留：撤销所选 | 所选规则批量撤销 |
| refresh | 保留：刷新 | 成功页面重新读取 |
| details | 保留：查看条件 | 展示规则条件 |
| close | 保留：关闭 | 非保存关闭 |
| saveSuccess | 保留：权限保存成功 | 仅服务端确认持久化后 |
| removedSuccess | 保留：授权已撤销 | 仅撤销成功后 |
| publishedSuccess | 保留：身份发布成功 | 仅发布成功后 |
| expand | 保留：展开条件 | 展开摘要 |
| collapse | 保留：收起条件 | 收起摘要 |
| selectAll | 保留：全选 | 范围由所在列表界定 |
| confirmChanges | 保留：确认保存 | 预览后的真正写入 |
| noMatchingRules | 保留：没有匹配的授权 | 无匹配规则，不等于账号失效 |
| conditional | 改稿 | 限定范围生效 |
| denied | 改为：不可执行 | 查询状态可能来自明确禁止，不宜一概叫未授权；原因另行显示 |
| businessCheckRequired | 改稿 | 仍有业务条件 |
| forbidden | 保留：你没有这项操作权限。 | 服务端拒绝 |
| loginRequired | 保留：登录已失效，请重新登录。 | 会话失效 |
| operationFailed | 保留：操作未完成，请稍后重试。 | 仅未知失败使用，不能覆盖明确业务原因 |
| invalidPolicy | 改为：权限设置不完整或不适用，请检查授权对象、功能权限和适用范围。 | 后端通用校验，不能断言全是漏选；已知字段错误须用专用提示 |
| invalidName | 改为：请填写名称，最多 80 个字。 | 字数边界清楚 |
| governanceSubjects | 保留：系统治理操作只能授予管理身份，请调整授权对象或操作。 | 说明对象约束 |
| incompatibleScope | 保留：所选操作的数据范围不同，请拆分为两条规则。 | 明确解决办法 |
| incompatibleFields | 保留：所选操作的字段范围不同，请调整字段或拆分规则。 | 明确解决办法 |
| invalidPeriod | 改为：请填写有效的开始和结束时间，结束时间须晚于开始时间。 | 不省略时间对象 |
| conflict | 保留：权限已发生变化，请刷新后重新确认。 | 并发修改 |
| staleReference | 保留：选中的岗位、分类或记录已发生变化，请重新选择。 | 引用失效 |
| unpublishedScheme | 保留：此授权身份尚未发布，请先发布或选择其他身份。 | 状态与行动明确 |
| legacyReadOnly | 保留：旧版权限管理仅支持查看，请更新后修改。 | 旧客户端写入拒绝 |
| purposeUnavailable | 保留：这条事由已不存在，请刷新列表。 | 事由引用失效 |
| invalidNature | 保留：岗位性质已不存在，请重新选择。 | 字典失效 |
| duplicateNature | 保留：已有同名岗位性质，请直接选择。 | 防重复新增 |
| natureInUse | 保留：这个岗位性质仍有记录使用，不能删除。 | 删除引用保护 |
| legacyNatureRequired | 保留：这个岗位性质供旧版使用，可以改名，不能删除。 | 兼容选项保护 |

## 业务分组与字段目录

下列逐项批准保留。业务分组表示菜单分类；字段名称表示能力所控制的数据列，不表示当前操作者已有修改权。字段表标题必须使用前稿按允许、禁止、委托区分的标题。

| 完整键 | 定稿 | 使用含义 |
|---|---|---|
| businessGroups.hr | 人事信息 | 人事能力分组 |
| businessGroups.scoring | 考核评分 | 考核能力分组 |
| businessGroups.audit | 审核 | 审核能力分组 |
| businessGroups.venue | 场地 | 场地能力分组 |
| businessGroups.calendar | 日程 | 日程能力分组 |
| businessGroups.auth | 账号治理 | 认证及账号能力分组 |
| businessGroups.system | 系统管理 | 系统能力分组 |
| businessGroups.authorization | 授权管理 | 授权能力分组 |
| businessGroups.notifications | 通知 | 通知能力分组 |
| businessGroups.identity | 身份核验 | 身份卡能力分组 |
| businessGroups.files | 文件 | 文件能力分组 |
| businessGroups.messages | 消息 | 消息能力分组 |
| businessGroups.contacts | 通讯录 | 通讯录能力分组 |
| capabilityNames.identity.cards.read | 查看本人身份卡 | 仅本人读取 |
| capabilityNames.identity.cards.create | 生成本人身份码 | 仅本人生成 |
| capabilityNames.identity.cards.verify | 允许他人扫码核验本人身份 | 明确本人被核验，不是查他人权限 |
| fieldLabels.text | 事由内容 | 事由文本 |
| fieldLabels.sortOrder | 显示顺序 | 排序字段 |
| fieldLabels.name | 名称 | 所属资源名称 |
| fieldLabels.description | 说明 | 所属资源说明 |
| fieldLabels.departmentId | 所属部门 | 部门引用 |
| fieldLabels.questions | 题目与分值 | 评分题目集合 |
| fieldLabels.timezone | 显示时区 | 展示设置 |
| fieldLabels.currentOrganization | 默认组织 | 默认组织设置 |
| fieldLabels.assignmentNature | 岗位性质 | 岗位字典 |
| fieldLabels.identityCategoryId | 身份类别 | 岗位字典 |
| fieldLabels.workGroupId | 职能组 | 岗位字典 |
| fieldLabels.startDate | 开始日期 | 资源日期 |
| fieldLabels.endDate | 结束日期 | 资源日期 |
| fieldLabels.isCurrent | 当前活动 | 当前标识 |
| fieldLabels.isPaused | 暂停状态 | 暂停标识 |
| fieldLabels.starterConditions | 发起条件 | 模板发起资格 |
| fieldLabels.steps | 审批步骤 | 流程步骤集合 |
| fieldLabels.isActive | 启用状态 | 启停标识 |
| fieldLabels.imageData | 印章图片 | 印章图像材料 |
| fieldLabels.assignedIdentities | 授权身份类别 | 印章允许类别 |
| fieldLabels.assignedPeople | 授权岗位 | 现行为按岗位授权，不称自然人 |
| fieldLabels.ruleType | 审批方式 | 场地审批类型 |
| fieldLabels.approverIdentityId | 审批身份类别 | 指定审批类别 |
| fieldLabels.approverHrId | 审批人员 | 历史人员引用 |
| fieldLabels.approverAssignmentId | 审批岗位 | 指定审批岗位 |
| fieldLabels.location | 场地位置 | 场地物理位置 |
| fieldLabels.imageUrl | 场地图片 | 场地展示图片 |
| fieldLabels.scopeDepartmentId | 适用部门 | 流程适用范围 |
| fieldLabels.scopeWorkGroupId | 适用职能组 | 流程适用范围 |
| fieldLabels.allowUserSelect | 允许选择流程 | 申请人流程选择开关 |
| fieldLabels.allowDesignateFirst | 允许指定首步审批人 | 首步人员指定开关 |
| fieldLabels.allowDesignateNext | 允许指定后续审批人 | 后续人员指定开关 |
| fieldLabels.openAdvanceMode | 开放提交方式 | 提交窗口起点模式 |
| fieldLabels.openAdvanceDays | 开放提前天数 | 起点天数 |
| fieldLabels.openAdvanceMinutes | 开放提前分钟数 | 起点分钟 |
| fieldLabels.deadlineAdvanceMode | 截止提交方式 | 提交窗口终点模式 |
| fieldLabels.deadlineAdvanceDays | 截止提前天数 | 终点天数 |
| fieldLabels.deadlineAdvanceMinutes | 截止提前分钟数 | 终点分钟 |
| fieldLabels.cycleType | 重复方式 | 周期模式 |
| fieldLabels.cycleValues | 重复日期与范围 | 周期日期 |
| fieldLabels.timeStart | 开始时刻 | 日内开始 |
| fieldLabels.timeEnd | 结束时刻 | 日内结束 |
| fieldLabels.activityName | 活动名称 | 周期活动名称 |

## 资源与动作目录

每项为权限描述中的业务对象，批准保留以下名称；它们须与动作合成展示，不单靠资源名暗示所有操作。`actions.delete`明确永久删除。候选读取、本人历史、公示读取均保留限制词，防止扩大理解。

| 键（resources.前缀） | 定稿 |
|---|---|
| files.tables | 表格文件转换 |
| scoring.activities | 评分活动 |
| scoring.currentActivity | 当前评分活动 |
| scoring.latestPublishedActivity | 最新公示活动 |
| scoring.templates | 评分模板 |
| scoring.rules | 评分规则 |
| scoring.results | 评分结果 |
| scoring.tasks | 评分完成情况 |
| scoring.publications | 结果公示 |
| scoring.participation | 参与评分 |
| scoring.publishedResults | 查看公示成绩 |
| scoring.meritSelections | 评优指定 |
| hr.people | 成员资料 |
| hr.assignments | 成员岗位 |
| hr.import | 人事导入 |
| hr.profileReview | 资料审核 |
| hr.profileTemplates | 资料模板 |
| hr.profileSelection | 组织资料模板 |
| hr.profileMigration | 跨组织资料迁移 |
| hr.departments | 部门 |
| hr.identities | 身份类别 |
| hr.workGroups | 职能组 |
| hr.assignmentNatures | 岗位性质 |
| hr.directoryRules | 通讯录规则 |
| audit.templates | 审核模板 |
| audit.stamps | 电子印章 |
| audit.submissions | 审核申请 |
| audit.templateCandidates | 审核模板人员选项 |
| audit.stampCandidates | 印章授权岗位选项 |
| audit.verification | 文件验签 |
| venue.resources | 场地与占用规则 |
| venue.bookings | 场地借用 |
| venue.approvals | 场地审批 |
| venue.purposes | 借用事由 |
| venue.bookingParticipants | 借用参会名单 |
| venue.activityParticipants | 周期活动参会名单 |
| venue.openRules | 场地开放时间 |
| venue.activityRules | 场地周期占用 |
| venue.sharedConfiguration | 场地全局配置 |
| venue.bookingRules | 场地借用规则 |
| venue.bookingWindows | 场地借用时间 |
| venue.schedule | 场地日程 |
| venue.approvalCandidates | 场地审批岗位选项 |
| venue.approvalHistory | 本人场地审批历史 |
| calendar.events | 日程 |
| calendar.rules | 日程安排规则 |
| auth.identity | 身份认证 |
| auth.recovery | 账号恢复 |
| auth.accounts | 全局账号治理 |
| auth.audit | 账号安全核查 |
| auth.policy | 认证设置 |
| system.adminAccounts | 管理身份 |
| system.settings | 系统设置 |
| system.organizations | 组织 |
| authorization.rules | 授权规则 |
| authorization.schemes | 授权身份 |
| authorization.effective | 实际权限查询 |
| authorization.delegations | 权限分配范围 |
| contacts.entries | 通讯录资料 |
| notifications.items | 通知 |
| identity.cards | 身份卡 |

| 键（actions.前缀） | 定稿 | 语义 |
|---|---|---|
| read | 查看 | 读取能力 |
| create | 新增 | 创建能力 |
| update | 修改 | 更新能力 |
| delete | 永久删除 | 不可逆删除，不缩为移除 |
| export | 导出 | 导出能力 |
| createApproved | 免审新增借用 | 明确跳过审批 |
| parse | 读取表格 | 解析导入材料 |
| build | 生成表格 | 构造导出文件 |
| request | 提出申请 | 发起请求 |
| execute | 执行迁移 | 执行跨组织迁移 |
| revoke | 撤销 | 撤销既有动作 |
| approve | 审批 | 仍需符合流程资格 |
| verify | 核验 | 核验能力 |
| configure | 配置 | 设置能力 |
| cancel | 取消活动 | 取消日程等活动 |
| publish | 发布 | 发布能力 |
| restore | 恢复版本 | 新版本恢复，不改历史 |
| share | 跨组织分享 | 来源授权分享 |
| receive | 接收组织配置 | 目标授权接收 |

| 键（reasons.前缀） | 状态／定稿 | 语义 |
|---|---|---|
| not_granted | 保留：尚未分配这项权限 | 无允许规则 |
| explicit_deny | 保留：已有设置禁止这项操作 | 明确禁止 |
| governance_role_required | 保留：仅限管理身份 | 系统治理对象限制 |
| super_admin | 保留：超级管理员保留权限 | 保留能力来源 |
| scope_and_business_check_required | 改为：办理时仍需符合记录范围、指定审批人等要求 | 不把读取范围称管理范围 |
| business_relationship_required | 保留：仍需符合该功能规定的查看条件 | 业务关系条件 |
| account_unavailable | 保留：账号当前不可用 | 不透露未核实具体原因 |
| invalid_policy | 保留：授权配置异常，请联系超级管理员 | 无法自行修复配置 |

## 组织间复制逐项

以下键均以 configurationCopy. 为前缀。所有“接收”不表示已创建或启用；所有“创建副本”不修改来源。类型专用说明必须随实际类型显示，不能同时显示互相矛盾的“已生效／待启用”。

| 键 | 状态／定稿 | 情境与理由 |
|---|---|---|
| editCopied | 保留：编辑副本 | 已创建副本编辑入口 |
| copyUnavailable | 保留：副本不存在或无权编辑。 | 不泄露非授权副本存在性 |
| title | 保留：组织间复制 | 模块名称 |
| source | 保留：分享配置 | 本组织来源列表 |
| incoming | 保留：接收配置 | 接收列表 |
| drafts | 保留：我的副本 | 含待核对及已创建 |
| outgoing | 保留：分享记录 | 来源分享记录 |
| tabHelp.source | 改稿 | 分享后对方核对创建 |
| tabHelp.incoming | 改稿 | 接收后核对 |
| tabHelp.drafts | 改稿 | 含不同副本状态 |
| tabHelp.outgoing | 保留：查看已分享的配置，或撤销分享。已创建的副本不受影响。 | 撤销不回收已建副本 |
| emptyByTab.source | 保留：暂无可分享的配置 | 仅加载成功空列表 |
| emptyByTab.incoming | 保留：暂无待接收的配置 | 仅加载成功空列表 |
| emptyByTab.drafts | 保留：暂无已接收的副本 | 仅加载成功空列表 |
| emptyByTab.outgoing | 保留：暂无分享记录 | 仅加载成功空列表 |
| kind | 保留：配置类型 | 类型筛选 |
| target | 保留：接收组织 | 分享目标 |
| choose | 保留：请选择 | 仅有紧邻明确字段名时用；映射用专用占位 |
| share | 保留：分享配置 | 来源授权动作 |
| receive | 保留：接收配置 | 创建待核对草稿 |
| revoke | 保留：撤销分享 | 撤回未完成复制资格 |
| open | 保留：查看详情 | 打开当前配置 |
| back | 保留：返回列表 | 从详情返回 |
| more | 保留：加载更多 | 分页载入 |
| empty | 保留：暂无配置 | 非特定页签空结果 |
| name | 保留：配置名称 | 配置标题字段 |
| sourceOrganization | 保留：来源组织 | 来源身份明确 |
| references | 保留：核对本组织选项 | 对应项区标题 |
| referenceHelp | 改稿 | 来源与目标对应 |
| noReferences | 改稿 | 无需对应仍需核对内容 |
| draft | 保留：待核对 | 接收草稿状态 |
| applied | 保留：已创建 | 不等于启用 |
| revoked | 保留：已撤销 | 分享撤销状态 |
| apply | 保留：创建副本 | 最终创建动作 |
| confirmCopy | 保留：确认复制 | 创建确认按钮 |
| applying | 保留：正在复制 | 复制进行中 |
| received | 改稿 | 接收并指向核对 |
| shared | 保留：分享成功 | 分享完成 |
| copied | 保留：复制成功 | 副本已创建 |
| enable | 保留：启用副本 | 仅存在activation的类型 |
| enabled | 保留：已启用 | 已启用规则 |
| disabled | 保留：未启用 | 副本规则尚未启用 |
| processing | 保留：正在处理 | 无更具体动作时加载 |
| targetVenue | 保留：目标场地 | 复制共享时间目标 |
| enableConfirm(name,venue) | 保留：在“{venue}”启用“{name}”？ | 明确场地与规则 |
| enableSharedConfirm(name,venue) | 保留：在“{venue}”启用“{name}”？此时间规则会影响使用该场地的所有组织。 | 不隐瞒共享影响 |
| chooseAll | 改稿 | 所有来源选项需对应 |
| unavailable | 保留：来源已撤销分享，不能继续复制。 | 仅来源明确撤回使用 |
| draftNotice | 保留：副本先保持停用，核对内容后再启用。 | 只用于默认停用的规则类型 |
| schemeNotice | 改稿 | 身份草稿另发布和分配 |
| configurationNotice | 保留：确认后新增一份配置，不覆盖已有内容。 | 字典等无需启用配置 |
| preview | 保留：配置内容 | 待复制内容摘要 |
| content | 保留：内容 | 事由正文等 |
| description | 保留：说明 | 配置说明 |
| sourceDepartment | 保留：来源部门 | 来源职能组归属 |
| unnamed | 保留：未命名规则 | 缺少名称后备 |
| missingReference | 改为：对应选项已失效 | 避免“关联项”黑话 |
| unknownCapability | 保留：未识别的操作 | 未知能力不能猜授权 |
| listSeparator | 保留：、 | 同类项连接 |
| conditionAnd | 保留：； | 条件分隔，不能取代同岗位说明 |
| summaryRow(label,value) | 保留：{label}：{value} | 标签和值成对 |
| yes | 保留：允许 | 布尔许可字段 |
| no | 保留：不允许 | 布尔许可字段 |
| all | 保留：全部 | 邻近范围对象明确 |
| self | 保留：本人 | 规则对象本人 |
| submitter | 保留：申请人本人 | 步骤指定自己 |
| sameAsApplicant | 保留：与申请人相同 | 审核动态属性 |
| sameAsViewer | 保留：与查看者相同 | 通讯录动态属性 |
| sameAsOrganizer | 保留：与安排人相同 | 日程动态属性 |
| conditionGroup(index,content) | 保留：条件 {index}：{content} | 展示规则组内容 |
| starters | 改为：可发起申请的人员（符合任意一组条件） | “任意条件”易误解为组内也任一 |
| action | 保留：操作 | 详情摘要动作 |
| designation | 保留：重新指定处理人 | 指定开关 |
| step(index,name) | 保留：第 {index} 步 · {name}；无名称时不带分隔符 | 流程顺序与名称 |
| question(index) | 保留：第 {index} 题 | 评分题号 |
| scoreRange(min,start,max,step) | 保留：最低 {min} · 起始 {start} · 最高 {max} · 间隔 {step} | 评分区间参数 |
| sortOrder | 保留：排序 | 配置顺序 |
| capabilities | 改为：身份包含的功能权限 | 与权限模块统一 |
| audience | 改为：获授权人员（符合任意一组条件） | 明确多组而非单条件 |
| targets | 改稿，按类型改用directoryTargets/calendarTargets | 拒绝一行混说查看和安排 |
| fields | 保留：可见补充资料 | 通讯录字段授权 |
| basicFieldsOnly | 保留：仅岗位基础信息 | 无额外字段 |
| flowOptions | 保留：流程设置 | 模板流程选项 |
| userSelect | 保留：申请人选择流程 | 流程选择许可 |
| designateFirst | 保留：指定第一步处理人 | 首步指定 |
| designateNext | 保留：指定下一步处理人 | 后续指定 |
| anyAdmin | 保留：任一符合审批资格的管理员 | 不称任一管理员均可 |
| sharedTime | 保留：共享时间规则 | 跨组织共享特性 |
| sourceVenue | 保留：来源场地 | 规则来源 |
| cycle | 保留：重复方式 | 周期模式 |
| dailyTime | 保留：每日时间 | 日内时段 |
| sharedNotice | 保留：此规则影响目标场地的所有组织；复制后仍需核对并启用。 | 全局影响与启用分开 |
| legacyRepeat(interval,unit,count) | 改为：每隔 {interval} {unit}重复一次，共 {count} 次 | 补一次，自然表述 |
| monthDay(day) | 保留：{day} 日 | 月内日期 |
| yearDays(month,start,end) | 保留：{month} 月 {start}—{end} 日；相同时只显示一天 | 年内日期范围 |
| timeRange(start,end) | 保留：{start}—{end} | 已格式化时刻 |
| unlimitedPeriod | 保留：不限制生效日期 | 日期范围无限制 |
| periodRange(startDate,startTime,endDate,endTime) | 保留：生效日期：{startDate} {startTime} 至 {endDate} {endTime} | 完整起止 |
| periodCount(date,time,count) | 保留：从 {date} {time} 起重复 {count} 次 | 有限重复 |
| independent | 保留：副本独立维护，来源后续修改不会同步。 | 不暗示持续共享 |
| bookingRuleType | 保留：审批方式 | 场地审批类型 |
| bookingOpen | 保留：开放提交 | 借用窗口开始 |
| bookingDeadline | 保留：截止提交 | 借用窗口结束 |
| advanceDays(days) | 保留：提前 {days} 天 | 相对借用开始时间 |
| advanceDuration(hours,minutes) | 保留：提前 {hours} 小时 {minutes} 分钟 | 相对借用开始时间 |
| noOpenLimit | 保留：不限制 | 开放起点无限制 |
| atBookingStart | 保留：借用开始前 | 截止零提前量 |
| windowNotice | 保留：接收后先保存草稿；确认创建后，时间限制在目标场地的当前组织内生效。已有设置不会被覆盖。 | 组织独立窗口，不是共享开放时间 |
| shareConfirm(name,organization) | 保留：将“{name}”分享给“{organization}”？ | 重要动作列明来源及目标 |
| revokeConfirm(name,organization) | 改稿 | 撤销后不能继续创建，已建不受影响 |
| applyConfirm(name) | 保留：在当前组织创建“{name}”的独立副本？ | 创建目标与独立性明确 |
| mapping(source,target) | 保留：{source} → {target} | 需与来源/本组织字段标签一同展示 |

## 复制枚举逐项

下列逐项保留，均为已确定业务选项而非引导句；条件标题已经注明同岗位、组间任一，不在每个选项重复长句。

| 键（configurationCopy.前缀） | 定稿 |
|---|---|
| auditActions.pass | 直接通过 |
| auditActions.sign | 签名 |
| auditActions.estamp | 盖章 |
| auditActions.both | 签名＋盖章 |
| auditActions.either | 签名或盖章 |
| calendarActions.assign | 安排日程 |
| calendarActions.update | 修改日程 |
| calendarActions.cancel | 取消日程 |
| cycles.daily | 每天 |
| cycles.weekly | 每周 |
| cycles.monthly | 每月 |
| cycles.yearly | 每年 |
| cycles.range | 日期范围内每天 |
| cycles.datetime_range | 连续时间段 |
| cycles.repeat | 间隔重复 |
| intervalUnits.day | 天 |
| intervalUnits.week | 周 |
| weekdays[0] | 周一 |
| weekdays[1] | 周二 |
| weekdays[2] | 周三 |
| weekdays[3] | 周四 |
| weekdays[4] | 周五 |
| weekdays[5] | 周六 |
| weekdays[6] | 周日 |
| bookingRuleTypes.direct | 直接通过 |
| bookingRuleTypes.admin | 管理员审批 |
| bookingRuleTypes.identity | 指定身份类别审批 |
| bookingRuleTypes.person | 指定岗位审批 |
| referenceKinds.department | 部门 |
| referenceKinds.identity | 身份类别 |
| referenceKinds.workGroup | 职能组 |
| referenceKinds.person | 人员 |
| referenceKinds.assignments | 审批岗位 |
| referenceKinds.field | 补充资料 |
| referenceKinds.venue | 场地 |

## 审稿边界

本表覆盖审稿起点 authorization.js 的所有字符串与格式函数，新增情境键以 editorial 文档为准。结构通过有实施前提，不等于前端已通过现场验收。其他模块尚需各自前端语境审查和逐项语言审阅，不允许以权限模块的批准代替全系统批准。
