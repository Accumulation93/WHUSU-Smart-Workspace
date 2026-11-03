# 日程、印章岗位授权与场地流程：独立语言审稿

作者 `/root/language_editor`，仅撰写。依据 audit-venue-calendar-context-20261103.md；本稿覆盖 calendar.js、stampAuthorization.js、venueFlowManagement.js，不包含场地大批generated页面。

## 日程结构要求

退出仅退出本人；取消活动影响整场所选范围。确认必须显示活动名称和仅本次／本次以后／整个系列，不能只有通用“确定吗”。动态参会范围的“自己”指实际安排人当前岗位，不是配置规则的管理员。场地来源只能在日程页改参会人，时间与取消返回来源记录。手机日历一次添加、文件下载、持续订阅分别反馈；下载开始不能显示已添加。全天结束日不含当天须放在结束日期控件旁，不能隐藏到帮助页。

## calendar.js 逐项

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| title | 保留：日程 | 应用名称 |
| manage | 保留：日程管理 | 管理入口 |
| ruleManage | 保留：安排规则 | 安排权限规则 |
| permission | 保留：管理组织日程 | 能力名称 |
| createRule | 保留：新增规则 | 新建规则 |
| copyAddress | 保留：复制订阅地址 | 剪贴板动作 |
| subscriptionServer | 保留：服务器地址 | 手机订阅设置 |
| subscriptionUsername | 保留：用户名 | 订阅专用凭据 |
| subscriptionPassword | 保留：专用口令 | 不是登录口令 |
| subscriptionSetup | 保留：在手机日历的“添加订阅日历”中填写以下信息，开启 SSL。 | 仅支持该配置方式设备 |
| subscriptionResetConfirm | 保留：重新生成后，原订阅地址失效。手机日历需要重新配置。 | 凭据轮换后果 |
| subscriptionStopConfirm | 保留：停用后，手机日历无法再读取你的日程。已下载的副本需在手机日历中移除。 | 不承诺删除外部已存数据 |
| subscriptionCreated | 保留：订阅已生成 | 凭据生成，不是手机已配置 |
| permissionDescription | 保留：安排、修改及取消当前组织的活动，不包含个人私有日程。 | 组织管理范围 |
| rulePermission | 保留：管理日程安排规则 | 规则配置能力 |
| rulePermissionDescription | 保留：设置普通成员可以为哪些人安排、修改或取消日程。 | 不直接授予全部安排权 |
| month | 保留：月 | 日历视图 |
| week | 保留：周 | 日历视图 |
| day | 保留：日 | 日历视图 |
| list | 保留：列表 | 日程视图 |
| today | 保留：今天 | 定位当日 |
| previous | 保留：上一页 | 随当前视图上一时段 |
| next | 保留：下一页 | 随当前视图下一时段 |
| create | 保留：新建日程 | 新日程 |
| edit | 保留：编辑日程 | 既有日程 |
| save | 保留：保存 | 写入 |
| cancel | 保留：取消 | 编辑退出，不等于取消活动 |
| close | 保留：关闭 | 详情退出 |
| refresh | 保留：刷新 | 重新读取 |
| retry | 保留：重试 | 失败恢复 |
| search | 保留：搜索日程 | 授权范围搜索 |
| empty | 保留：这段时间没有日程 | 读取成功空时段 |
| loading | 保留：正在加载日程 | 读取 |
| saving | 保留：正在保存日程 | 写入 |
| name | 保留：日程名称 | 标题字段 |
| description | 保留：说明 | 用户业务文本 |
| location | 保留：地点 | 用户业务文本 |
| startDate | 保留：开始日期 | 起点 |
| endDate | 保留：结束日期 | 终点 |
| startTime | 保留：开始时间 | 起点 |
| endTime | 保留：结束时间 | 终点 |
| allDay | 保留：全天 | 全天模式 |
| endExclusive | 改为：结束日期当天不计入全天日程。 | 结束控件旁明确排除当天 |
| recurrence | 保留：重复 | 重复设置 |
| none | 保留：不重复 | 单次 |
| daily | 保留：每天 | 重复选项 |
| weekly | 保留：每周 | 重复选项 |
| monthly | 保留：每月 | 重复选项 |
| yearly | 保留：每年 | 重复选项 |
| interval | 保留：重复间隔 | 必须配天/周/月/年对应单位 |
| weekdays[0] | 保留：一 | 周一列头 |
| weekdays[1] | 保留：二 | 周二列头 |
| weekdays[2] | 保留：三 | 周三列头 |
| weekdays[3] | 保留：四 | 周四列头 |
| weekdays[4] | 保留：五 | 周五列头 |
| weekdays[5] | 保留：六 | 周六列头 |
| weekdays[6] | 保留：日 | 周日列头 |
| until | 保留：截止日期 | 重复终点 |
| count | 保留：重复次数 | 次数终点 |
| repeatEnd | 保留：结束重复 | 终止设置 |
| unlimited | 保留：不限 | 次数或期限不限 |
| byDate | 保留：按日期 | 终止类型 |
| byCount | 保留：按次数 | 终止类型 |
| reminders | 保留：提前提醒 | 提醒设置 |
| reminderNone | 保留：不提醒 | 提醒选项 |
| reminderStart | 保留：开始时 | 提醒选项 |
| reminderFive | 改为：5 分钟前 | 提醒选项 |
| reminderFifteen | 改为：15 分钟前 | 提醒选项 |
| reminderThirty | 改为：30 分钟前 | 提醒选项 |
| reminderHour | 改为：1 小时前 | 提醒选项 |
| reminderDay | 改为：1 天前 | 提醒选项 |
| participants | 保留：参会人 | 活动参与者 |
| choosePeople | 保留：指定人员 | 自然人名单 |
| chooseScope | 保留：指定范围 | 动态范围 |
| self | 改为：安排人本人 | 避免规则编辑者误解 |
| participantsLoading | 保留：正在加载参会人 | 读取名单 |
| participantsFailed | 改为：参会人未能加载，请重试。 | 有重试入口 |
| participantsRestricted | 保留：当前工作角色无法查看参会名单 | 权限限制 |
| participantsUnavailable | 保留：该场次的参会名单暂不可查看 | 场次无效或不可用 |
| department | 保留：部门 | 范围维度 |
| identity | 保留：身份类别 | 范围维度 |
| workGroup | 保留：职能组 | 范围维度 |
| sameDepartment | 改为：与安排人同部门 | 当前安排岗位 |
| sameIdentity | 改为：与安排人同身份类别 | 当前安排岗位 |
| sameWorkGroup | 改为：与安排人同职能组 | 当前安排岗位 |
| addCondition | 保留：添加条件组 | 组间任一 |
| conditions | 保留：范围条件 | 动态条件 |
| audience | 改为：获得安排权限的人员 | 规则获权者 |
| targets | 改为：允许安排日程的人员 | 被安排者 |
| actions | 改为：允许执行的日程操作 | 不泛称操作 |
| assign | 保留：安排日程 | 规则能力 |
| update | 保留：修改日程 | 规则能力 |
| cancelAction | 保留：取消活动 | 规则能力 |
| ruleName | 保留：规则名称 | 规则字段 |
| enabled | 保留：启用 | 开关动作/选项，状态展示另评估是否需已启用 |
| disabled | 保留：停用 | 开关动作/选项 |
| duplicate | 保留：复制 | 复制规则进入编辑 |
| delete | 保留：删除 | 删除规则，须明确对象 |
| rulesEmpty | 保留：尚未配置安排规则 | 只说明当前列表 |
| private | 保留：个人日程 | 私有日程 |
| organization | 保留：组织日程 | 组织安排 |
| source | 保留：来源 | 来源类型 |
| manual | 保留：自主安排 | 手工创建 |
| venue_booking | 保留：场地借用 | 来源类型 |
| venue_activity | 保留：周期活动 | 来源类型 |
| allSources | 保留：全部来源 | 筛选项 |
| leave | 改为：退出参会 | 明确仅本人行为 |
| cancelEvent | 保留：取消活动 | 整体活动行为 |
| confirmedCancel | 保留：确认取消 | 仅取消活动确认，不用于退出参会 |
| scope | 保留：操作范围 | 重复活动范围 |
| instance | 保留：仅本次 | 单场次 |
| following | 保留：本次及以后 | 后续范围 |
| series | 保留：整个系列 | 全系列 |
| cancelConfirm | 保留：取消后，受影响的参会人将不再看到这些日程。 | 须同屏活动名和所选范围 |
| leaveConfirm | 保留：仅移除你自己的参会记录，其他人不受影响。主动退出后不会被范围规则自动加回。 | 还需所选重复范围 |
| deleteRuleConfirm | 改为：删除所选规则后，仅由这些规则授予的安排权限将不再生效；其他规则保持有效。 | 交叉授权不会全失效 |
| systemCalendar | 保留：手机日历 | 外部日历入口 |
| addOnce | 保留：一次添加到手机日历 | 能力支持才显示 |
| download | 保留：下载日历文件 | 下载ICS，不等于添加 |
| subscribe | 保留：订阅日程 | 持续订阅 |
| resetSubscription | 保留：重新生成订阅地址 | 轮换凭据 |
| revokeSubscription | 保留：停用订阅 | 撤销读取资格 |
| subscriptionHint | 保留：在支持订阅的日历中添加此地址。更新频率由手机日历决定。 | 不承诺立即同步 |
| onceHint | 保留：这是一次添加，之后的修改和取消不会自动同步到手机日历。 | 明确一次性 |
| subscriptionPrivacy | 改为：订阅地址和专用口令仅供本人使用，请勿分享。 | 包含私密凭据 |
| copied | 保留：已复制 | 剪贴板成功 |
| added | 保留：已添加 | 仅系统接口明确添加成功；下载开始禁用 |
| saved | 保留：已保存 | 服务端保存日程成功 |
| noPosition | 保留：暂无岗位 | 人员无岗 |
| noParticipants | 保留：暂无参会人 | 成功空名单 |
| conflictHint | 保留：这个时段还有其他日程 | 提示冲突不是自动阻断 |
| forbidden | 改为：当前工作角色没有操作这项日程的权限。 | 当前角色限定 |
| invalidSchedule | 保留：请检查日程日期、时间和重复设置。 | 通用校验，具体字段错误优先 |
| invalidRule | 改为：请填写规则名称，并选择获得安排权限的人员、可安排的人员和日程操作。 | 指出具体分区 |
| staleReferences | 保留：所选人员或岗位范围已变化，请重新选择。 | 引用失效 |
| conflict | 保留：这项日程已被修改，请刷新后再操作。 | 版本冲突 |
| unavailable | 保留：这项日程已取消，或你不在参会名单中。 | 必须结果码限定这两种，不泛用于网络失败 |
| rangeTooLarge | 保留：请选择不超过一年的日期范围。 | 服务端实际范围限制 |
| operationFailed | 改为：日程操作未完成，请刷新查看结果。 | 不混“加载或保存”；具体读取、未知提交应专用公共提示 |
| sourceReadOnly | 保留：请从原场地记录修改活动时间或取消活动。 | 场地来源限制 |
| unsupported | 保留：当前设备没有可用的系统日历添加入口。 | 仅实际能力检测后 |
| savedReadFailed | 保留：已保存，但更新后的日程尚未加载。请刷新，勿重复提交。 | 明确写成功重读失败 |
| reminderTitle | 保留：日程提醒 | 外部通知输出例外 |
| reminderText | 保留：{title}即将开始。 | 用户标题作为事实参数 |
| subscriptionRevoked | 保留：此订阅地址已失效。 | 外部订阅读取反馈 |
| changeRecurrenceSeries | 保留：修改重复方式时，请选择整个系列。 | 限定支持范围 |
| confirmLeave（新增） | 确认退出 | 退出专用确认 |
| participationOnly（新增） | 此处仅修改参会人；活动时间和取消请返回原场地记录操作。 | 来源编辑页 |

## stampAuthorization.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| deletionCleanup | 保留：印章岗位授权 | 删除引用分类 |
| configure | 改为：配置可用岗位 | 实际是岗位而非自然人 |
| title | 保留：选择印章可用岗位 | 选择器 |
| scope | 改为：选择可以使用印章的具体岗位；同一个人的其他岗位不会同时获得授权。 | 保留重要权限区别，移除重复组织介绍 |
| empty | 保留：尚未配置可用岗位 | 成功为空 |
| legacy | 改为：原有类别授权已停用，请重新选择可用岗位。 | 不模糊人员岗位 |
| inactive | 保留：已失效 | 岗位失效 |
| loadingFailed | 保留：印章加载失败，请重试 | 印章读取 |
| candidatesFailed | 保留：可用岗位加载失败，请重试 | 岗位目录 |
| saveFailed | 改为：可用岗位未能保存，请重试 | 明确服务端拒绝；超时未知另处理 |
| saved | 改为：可用岗位已保存 | 持久化成功 |
| retry | 保留：重新加载 | 读取恢复 |
| invalidRemoved | 改为：以下岗位已失效，不能继续使用印章。确认后将移除这些岗位的印章授权。 | 不误称删除岗位 |
| imageUnsupported | 保留：图片格式不支持，请上传 PNG、JPG、WebP、GIF 或 BMP 格式的印章图片。 | 需要实际支持这五类 |
| imageReading | 改为：正在读取印章图片 | 明确阶段 |
| imageUnsupportedToast | 保留：格式不支持 | 必须配详细允许格式说明 |
| imageTooLarge | 改为：印章图片超过 2 MiB，请压缩或裁剪后重新上传。 | 实际2MiB阈值须核对 |
| imageTooLargeToast | 保留：图片过大 | 需配详细限值说明 |
| imageReadFailed | 保留：图片读取失败，请重新选择。 | 文件读取失败 |
| imageReadFailedToast | 保留：读取失败 | 需配图片对象 |
| count(count) | 保留：已授权 {count} 个岗位 | 不称人数 |
| editorContext(name) | 保留：印章：{name} | 当前印章业务名称 |

## venueFlowManagement.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| switchTitle | 改为：确认切换审批方式 | 场地审批术语一致 |
| directToFlow | 保留：保存审批流程会移除当前“直接通过”规则，是否继续？ | 需同屏目标场地和当前组织 |
| flowToDirect | 改为：保存“直接通过”会移除当前组织在该场地生效中的审批流程，是否继续？ | 避免误说移除其他组织流程 |
| enabled | 保留：已启用 | 状态 |
| disabled | 保留：未启用 | 状态 |
| approver | 保留：审批岗位 | 一岗一卡 |
| chooseApprover | 保留：选择审批岗位 | 选择器 |
| identity | 保留：审批身份类别 | 动态审批类型 |
| department | 保留：适用部门 | 流程适用范围 |
| workGroup | 保留：适用职能组 | 流程适用范围 |
| allDepartments | 保留：全部部门 | 当前组织范围 |
| allWorkGroups | 保留：全部职能组 | 当前组织范围 |
| chooseIdentity | 保留：选择身份类别 | 选择器 |
| retry | 保留：重试 | 失败恢复 |
| continuousOccupancy | 保留：连续占用 | 周期活动模式 |
| intervalOccupancy | 保留：间隔重复 | 周期活动模式 |
| occurrenceStart | 改为：单次活动开始 | 与生效日期区分 |
| occurrenceEnd | 改为：单次活动结束 | 与生效日期区分 |
| intervalValue | 保留：间隔数量 | 配单位输入 |
| intervalUnit | 保留：间隔单位 | 天或周 |
| intervalDay | 保留：天 | 单位 |
| intervalWeek | 保留：周 | 单位 |
| intervalInvalid | 改为：间隔数量须为 1 至 366 的整数，重复次数须为 1 至 1000 的整数。 | 分清两个数字 |
| unavailableReference | 保留：原选项已失效，请重新选择 | 引用失效 |
| incomplete | 改为：操作未完成，请刷新查看结果 | 未知结果不引导盲重试 |

实际格式与大小限制、当前组织流程范围须由实施核对，不可只修改提示掩盖后端行为。手机日历能力和三档界面尚未现场验收。
