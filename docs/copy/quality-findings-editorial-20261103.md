# 文案质量告警逐项复审

基准：`node scripts/copy-quality-audit.js --json`，2026-11-03，187文件、6582静态值、585项告警；R10 334项，其他251项。控制台只打印前200项，本复审使用完整JSON只读清单，不把未打印部分当通过。动态引用863项仍须按调用核对。以下记录按资源和键明确结论；未登记告警仍是待审，不能全部加入白名单。

## 场地活跃项

| 资源／键（相同键仅限列出的场地资源） | 结论与理由／完整定稿 |
|---|---|
| venueBookingDetail组件 approverAssignment、3b3b392755、866290fa02、dcadcebf08 | 保留标签“处理岗位：”“审批意见：”“审批人：”“审批时间：”。属于独立键值行标签，不是待拼接的句子。 |
| myVenueBookings 3b3b392755 | 保留“审批意见：”，后接用户原文，冒号是正确标签标点。 |
| pendingVenueApprovals approverAssignment、3b3b392755、866290fa02、dcadcebf08 | 保留四个独立详情标签，理由同上。 |
| pendingVenueApprovals requiredContextPrefix | 保留“请切换到以下任一岗位：”，完整操作指引后接实际有权岗位列表，不把普通标签一律去冒号。 |
| pendingVenueApprovals 1264209cb6 | 退回尾空格前缀。改updatedAt(time)“更新于 {time}”，只有读取成功后取实际更新时间。 |
| pendingVenueApprovals ef8b7ffa9b、9e545997b0 | 退回“第”+数值+“步”。新增stepNumber(order)“第 {order} 步”，由JS预计算后WXML引用，不在WXML调用函数。 |
| venueApprovalHistory 7d935d1225 | 保留“借用人：”，独立标签。 |
| venueBooking approverAssignment、requiredContextPrefix、3b3b392755、866290fa02、dcadcebf08 | 保留详情标签与岗位切换完整指引。 |
| venueBooking c895f6c29e、eeb5f0e78e | “原安排：”“重复活动有效期：”可保留为独立标签；若仍在JS拼整句，则改下方originalSchedule/recurrenceValidity函数。 |
| venueBooking ef8b7ffa9b、9e545997b0 | 用stepNumber，不保留步骤编号碎片。 |
| venueBooking c44dbba9e9 | 退回“ 至 ”拼接函数，改timeRange(start,end)“{start} 至 {end}”；格式化日期时间后一次传入，换行用布局或调用专用格式，不在字符串中散拼片段。 |
| venueManage approverAssignment、3b3b392755、866290fa02、dcadcebf08 | 保留独立键值行标签。 |
| venueManage 04d00bdf17 | 退回“：不限”尾句。改unlimitedScope(label)“{label}：不限”，只在明确该维度不限时使用，缺值不能算不限。 |
| venueManage 93c50c01c0、493a127a99、ef8b7ffa9b、9e545997b0 | 默认步骤名复用venueFacts.defaultStepName；独立序号徽标用stepNumber。两者语境不同。 |
| venueManage c44dbba9e9 | 同timeRange，禁止继续散拼。 |
| venueManage eeb5f0e78e | 独立标签可保留；整句改recurrenceValidity。 |
| utils/flowTimeline 93c50c01c0、493a127a99 | 改完整步骤名/步骤编号函数，不能“第”与“步”夹用户动态文本。 |
| utils/venueRuleDisplay 493a127a99 | 若表示步骤总数，改stepCount(count)“{count} 个审批步骤”，不能复用单个步骤序号。 |
| venueFlowManagement.intervalDay | 保留“天”，与“周”并列的周期单位选择项，实际是单位而非句子碎片。 |

新增场地格式函数完整定稿：

- `updatedAt(time)`：更新于 {time}
- `stepNumber(order)`：第 {order} 步
- `stepCount(count)`：{count} 个审批步骤
- `timeRange(start,end)`：{start} 至 {end}
- `originalSchedule(start,end)`：原安排：{start} 至 {end}
- `recurrenceValidity(start,end)`：重复活动有效期：{start} 至 {end}
- `unlimitedScope(label)`：{label}：不限
- `timeRangeMissing`：起止时间未完整记录
- `repeatCountMissing`：重复次数未记录

后两项只用于历史记录缺少对应事实。周期时间有效但次数缺失时保留完整时间，另显示重复次数未记录；不显示共重复0次。当前编辑输入尚未完成使用已有填写校验，不称未记录。

上述范围函数不补造缺失日期。起止缺失时先使用现有已批准的未设置/未记录状态，不以“--”伪造有效时间；是否允许无限期仍按实际业务事实决定。JS换行用于两个完整日期值之间时可以由展示布局控制，不靠语言键首尾空格。

## 场地已由完整格式替代的R10候选

下面逐项均为审计未发现引用且既有稿已有替代说明的候选；实施须确认对应资源的两端/别名引用后手工删除，不能按相同hash跨资源删除。

- venueBooking：21268f5ef7、44ce05c859、6d6ab79183、70d4911767、960969cd90、abf766aebc、c5aa06059a、db4932f471、fcd3dd2cc8。分别已由占用/不开放、提交窗口、完整重复次数函数取代，均不批准当单位例外保留。
- venueManage：05302eb150、5bb8799355、c5aa06059a、c9c991ff82、ca51b9c6c6。已由monthlyDateRange、repeatFrom/repeatedOccurrences、departmentWorkGroupRequired替代。
- utils/venueBookingDetail：29ec8299c4、3cd1b8dd73。已由venueFacts.completedSteps替代，不保留“已完成 ”和“ 步”。
- venueManage：23f77c8074。“用户审核”既不清楚且两端生产未引用，按已审记录删除，不能为此设术语例外。

其余R10键尚未逐项复审，不在本节批准；后续表会补齐。任何手工删除后必须重新执行引用检查，不通过则核实真实调用，不把缺键改为忽略。

### 场地单位实际引用补核

| 键／实际位置 | 最终决定 |
|---|---|
| venueManage.a957bd837e | 日期选择的“日”保留；借用提交窗口天数输入同键改独立durationDaysUnit“天”，不能日期/时长混用。 |
| venueManage.c1392f7fda | 年度日期月份picker的“月”保留，真实控件单位。 |
| venueManage.d63e494e70、4f57bde8f7 | 时刻小时/分钟picker占位“时”“分”保留，实际小时分钟控件。 |
| venueManage.717083eab1 | 提前提交分钟数控件保留“分”；其余非分钟场景不扩展批准。 |
| venueManage.d862a02c58 | 两个起止输入框之间的“至”保留，连接的是独立控件，不是自然语句残片。 |
| 场地各资源e8d9493a44 | 起止输入框之间可保留“至”；只读文本范围统一timeRange，避免多个模板继续拼值与片段。 |
| venueManage.168587d3a1、438913e441 | 当前用于月度/年度周期说明，退回散拼。monthlyDays(days)“每月 {days} 日”；yearlyDate(month,day)“每年 {month} 月 {day} 日”，days为已校验日期列表，月日缺失不传问号。 |
| venueManage.70d4911767、abf766aebc | 仍有调用时使用前稿完整venueClosedAt/occupiedRange，不保留前导空格。 |
| admin.f97b69cf97/b4c3e73028 | 已实核meritSummaryGroups.length，为评优汇总分组，不是条件组。新增meritSummaryGroupCount(count)“共 {count} 组评优结果”，推翻上文未核时的条件组候选，不据该数表示人员数。 |

年度已选范围chip同样用已批准monthlyDateRange(month,startDay,endDay)，不保留“月日-日”的多个单位拼法；真实picker单位仍保留，不误删控件标签。

## 权限及报告提示告警定稿

| 资源／键 | 定稿或保留理由 |
|---|---|
| adminPersonnel.hrTemplateSwitchIncompatibleReportIntro | 保留完整引导句末冒号，紧接不兼容资料项明细列表，不是残缺句。 |
| authorization.fields | 权限适用的资料项 |
| authorization.fieldsHelp | 选择这条规则涉及的资料项。能否查看或修改，仍取决于上方选择的功能权限。 |
| authorization.allowFieldsTitle | 允许操作的资料项 |
| authorization.allowFieldsHelp | 选择这些权限允许操作的资料项；查看或修改仍由所选功能权限决定。 |
| authorization.denyFieldsTitle | 禁止操作的资料项 |
| authorization.denyFieldsHelp | 选择“全部可选资料项”将禁止所选操作；选择部分资料项时，仅禁止操作这些资料项。 |
| authorization.delegationFieldsTitle | 允许分配的资料项 |
| authorization.delegationFieldsHelp | 选中管理员只能为这些资料项分配权限，不能增加其他资料项；这不会直接授予其本人使用权限。 |
| authorization.noFieldSelected | 请至少选择一个资料项，或选择“全部可选资料项”。 |
| authorization.allFields | 全部可选资料项 |
| authorization.incompatibleFields | 所选操作涉及的资料项不同，请调整选择或拆分规则。 |
| admin.mappingQuestionField | 对应题目设置；表格映射如题目内容、最低分、初始分值，不使用程序字段术语。 |

以上是逐条语言决定，不通过脚本把全仓“字段”替换。“字段值冲突”等已由用户确认的分类术语另按自身情境判断，不能套本表。

## 审核独立标签与步骤碎片

| 资源／键 | 结论 |
|---|---|
| myApprovalHistory.processedAssignmentPrefix | 保留“处理岗位：”，独立标签。 |
| pendingApprovals.322d34ce9c、requiredOrganizationPrefix、requiredAssignmentPrefix | 保留“提交人：”“所属组织：”“可处理岗位：”，独立事实标签。 |
| pendingApprovals.eligibleAssignmentsPrefix | 保留完整指引“请切换到以下可处理岗位：”，后接有权岗位列表。 |
| pendingApprovals.29f6c07d3f、9e545997b0、ef8b7ffa9b | 退回编号片段，分别用roundNumber(order)“第 {order} 轮”、stepNumber(order)“第 {order} 步”。 |
| submissionDetail.1fac292fcb、253aca0bd3、3b3b392755、4161e513f6、5564430f9c、5d46d06a0e、aa5c293ca5、b141bec1f6、ca1c2400cc、e1af2c13f5、edbf7136ff、fbdf6b37eb、processedAssignment、operationAssignment | 保留已批准的处理人/操作人/意见/位置/时间/备注/条件/岗位标签与冒号。数值或业务原文独立显示，无需将标签改写为长句。 |
| submissionDetail.14144be09d、29f6c07d3f、4707e47a7a | 轮次编号统一完整roundNumber，不保留首尾空格和轮次前后片段。 |
| submissionDetail.493a127a99、93c50c01c0、9e545997b0、ef8b7ffa9b | 步骤编号用stepNumber；页码用pageNumber(page)“第 {page} 页”，不得一个“第”跨对象拼句。 |
| submissionDetail.361de3f050、239cbf0257 | remainingApprovalSteps(count)“还有 {count} 个审批步骤待处理”，不把当前序号当剩余数量。 |
| submissionDetail.b45ad4069d、selectedAssignmentsTitle、2370e6144f | 新selectedPeopleCount(count)“已选 {count} 人”、selectedAssignmentsCount(count)“已选 {count} 个岗位”；必须按选择器模式区分，不只换括号。 |
| submissionDetail.9b774f950c、d0348010eb、d3028048b3、fc98ff863c、7abed5378f、17bcc41217、d7c8fd23a8 | 已退回的审批条件散拼，改已批准auditConditions；无引用后删除，不批准“或/由”例外。 |
| submissionDetail.6acb97d4c6、8980340210、999a2408c6、f67213967c | 位置/页码散拼需按原稿完整定位提示和pageNumber接入；若已无引用应删除，不保留独立尾句。 |
| signatureManager.66a2af4df9、submissionDetail.66a2af4df9 | 已核实际拼接formatAbsoluteDate生成日期，改signatureDefaultName(date)“签名 {date}”；不是序号，撤销signatureNumber用于此处，不保留“签名 ”尾空格。 |
| verification.1a50073a0e、4e1ba9317f | 独立标签批准保留，但“轮：”应明确为“审核轮次：”；“文件内签名：”保持。 |
| verification.c25d1b8a38、ef8b7ffa9b | “由”与“第”须替换为已批准完整经办人/轮次格式；不当独立单位保留。 |
| identitySwitch.ac7b734021 | 保留“即将使用的工作角色：”，完整动作对象指引，后接当前明确选中的角色。 |

本表只登记这些命中项，不代表所有R10死键或动态引用已通过。允许保留的冒号必须仍处于对应标签/引导列表结构；不能拿它们拼多段不完整动作句。

## 管理、人事与评分告警逐项处理

| 资源／键 | 结论与定稿 |
|---|---|
| admin.importRowPrefix/importRowSuffix；hrInfoBehavior.importRowPrefix/importRowSuffix | 改importRowNumber(number)“第 {number} 行”，真实表格行号，不拼片段。 |
| admin.fallbackPrefix | 改scoreBand(min,max)“分数区间：{min} 至 {max}”，仅真实区间；缺界限按原业务说明，不补0。 |
| admin.0e8673eda8 | 改approvalStepsCount(count)“审批步骤（{count} 步）”，不保留开括号。 |
| admin.105bbfcae6、34338619cf、405f619b06、514b4a69ae、5b54c6c107、d29a9747eb、f31350a7af | 分别保留身份类别、当前值、部门、文件、题目数量、驳回原因、职能组的独立标签冒号。 |
| admin.61386762d9 | 改pageTitle(name)“{name} - WHUSU智慧工作台”，完整导航标题，不保留前导空格后缀；连字符作为品牌标题分隔允许。 |
| admin.757dfc5eab | 改currentListCount(count)“当前名单（{count} 人）”；若实际对象为岗位须另用岗位计数，不把名单数量默认为自然人。 |
| admin.92b82a2c4b | 已由trimCounts(high,low)完整说明替代，确认无调用后删除。 |
| admin.493a127a99、93c50c01c0、9e545997b0、ef8b7ffa9b、f09dcf0e17 | 步骤编号使用stepNumber；题目编号使用questionNumber(index)“第 {index} 题”，不同对象不能共享一个“第”。 |
| admin.29f6c07d3f | 轮次显示改roundNumber，不保留独立轮尾缀。 |
| admin.2370e6144f、b4c3e73028 | 人数摘要改peopleCount(count)“共 {count} 人”；确认自然人去重，岗位使用岗位单位。 |
| admin.c0ad651b1f | 真设备数可用deviceCount(count)“{count} 台设备”，会话兼容响应必须sessionCount(count)“{count} 条登录记录”，禁止称设备。 |
| admin.c6a717f074 | 模板应用完整提示沿已有模板切换定稿；无调用后删除“应用「”片段，不批准括号例外。 |
| admin.d2005b0c5b | 示例内容必须完整括号或独立示例说明；退回“(如”片段，需具体示例参数后定稿，不将未知例子自动拼接。 |
| admin.e5f5be43de | 导入错误使用完整问题说明与重新导入动作，退回前导逗号片段；已无引用后删除。 |
| admin.d7c8fd23a8 | 审批条件任一关系用已批准组间说明，不能用“或”散拼；其他真实二选一控件需单独核情境，不全局批准。 |
| admin.f97b69cf97 | 若为条件组计数改conditionGroupCount(count)“{count} 组条件”；尚未核实际引用对象，不自动当人数。 |
| admin.fe964455aa | 这些认证码或恢复码只在这里显示一次，请妥善保存，并分别交给对应成员。 |
| adminUtils.b75c3b7064 | 数字位数校验已由完整提示替代；若仅用于数字长度控件单位，允许保留“位”，必须紧邻“数字位数”标签，不是字数。 |
| auditBehavior.14144be09d、93c50c01c0 | 改完整轮次／步骤编号函数，按实际对象选择。 |
| auditBehavior.239cbf0257、361de3f050 | 改remainingApprovalSteps。 |
| auditBehavior.17bcc41217、7abed5378f、9b774f950c、d0348010eb、d3028048b3、fc98ff863c | 已由auditConditions结构替代，无调用后删除，不保留语言拼接碎片。 |
| authPersonnelBehavior.credentialSelectedPrefix/credentialSelectedSuffix | selectedCredentialMembers(count)“已选择 {count} 名成员”，独立摘要。 |
| authPersonnelBehavior.credentialExportFailed | 认证码或恢复码清单未能生成，请重试。 |
| authPersonnelBehavior.35ca909941 | 认证码或恢复码未全部确认生成，请查看各成员的处理结果。 |
| authPersonnelBehavior.8351ecc192 | 认证码或恢复码未能撤销，请刷新成员详情后查看。仅明确拒绝，不代替未知写入提示。 |
| authPersonnelBehavior.9662ceba48 | 认证码或恢复码未能生成，请刷新成员详情后查看。仅明确拒绝。 |
| authPersonnelBehavior.fe17a0abf0 | 认证码或恢复码未全部确认撤销，请查看各成员的处理结果。 |
| hrInfoBehavior.067b107bd7、23bb2dcf13、4c8603086a、9aec79b593、a68c09e48e、a7e6a633a4、c6e80c1d75、fbdaa51ccc | 已有importedRecords/WithIssues、templateColumnsRead/Preview、profileItemsCount完整定稿。逐调用替换后删除片段，不能把问题数称跳过人数。 |
| hrInfoBehavior.5daecbb537 | “等”隐去人员名单会弱化操作范围，批量确认必须完整名单或可展开名单；若仅非操作摘要可使用明确已选人数，不保留空格尾词。 |
| hrInfoBehavior.ab34b1e15d、aee6f6c499 | 导入列/问题说明采用现有hrImport事实格式，不能拼“请修改…工作分工可留空”误导所有问题。无调用后删除旧片段。 |
| hrInfoBehavior.hrDeletionCleanupRecoveryCredential | 账号恢复信息；这是删除清单类别，不向用户暴露密码专业名词，也不暗示恢复方式开关全部删除。 |
| publicationBehavior.1b631a5d63 | incompleteOperations(count)“{count} 项操作尚未确认完成，请查看处理结果。”；未知写结果不能说肯定没完成。 |
| resultBehavior、templateBehavior、scorerTasks的5503123f4c/7ffcbc33aa | 分别“Excel 格式（.xlsx）”“CSV 格式（.csv）”，文件扩展名保留ASCII，中文括号统一。 |
| settingsBehavior.0ff87aff65 | 正在设置默认组织 |
| settingsBehavior.4706701186 | 正在创建组织；创建后默认设置可能第二请求，不提前称已创建默认组织。 |
| settingsBehavior.7946938ca9 | 正在删除组织 |
| settingsBehavior.e7e3787584 | 已由默认组织专用完整说明替代，不保留“新用户登录后将优先进入「”片段，也不能承诺总会自动切换角色。 |
| templateBehavior.266a08601e、93c50c01c0 | questionIssue(index,reason)“第 {index} 题：{reason}”；reason必须已审本地校验句，不能任意异常message。 |
| score.0e686e89bb、8e8047cbd6、c3ec61e536 | 保留最低分、分值间隔、评分范围独立标签的冒号。 |
| score.6e2b5d44dd、6e979f0fec、ef8b7ffa9b | questionNumber(index)“第 {index} 题”，题数摘要另questionCount(count)“共 {count} 题”。 |
| score.717083eab1 | 保留“分”，真实评分输入后缀单位，不是句子残片。 |

## 基础组件与文件告警

| 资源／键 | 结论与理由／定稿 |
|---|---|
| calendar.month | 保留“月”，月/周/日视图选择名称，不是日期拼句。 |
| controlLayout.items | 真实计数单位“项”可保留在布局示例/统一控件摘要中，不作为完整业务动作说明。 |
| adminPermissions.2370e6144f | 完整directoryPeopleCount(count)“{count} 位管理员”；原对象是管理员目录，不是岗位计数。 |
| filePreview.3bc4a9b5be、883987ec9c、b6d7510119 | 退回包含字面nn/n的旧片段。若仍调用，改fileOpenHelp(name,size)“请使用其他应用打开此文件。\n\n文件名：{name}\n大小：{size}”；必须是真换行、真实文件名与格式化大小，不输出n。无调用则删除。 |
| home.totalPrefix/personSuffix | peopleCount(count)“共 {count} 人”，按实际自然人结果；岗位目录另用岗位数，不固定复用人。 |
| home.rejectionReasonPrefix | 保留“驳回原因：”，后接用户填写内容。 |
| home.sessionSuffix/deviceSuffix | 按真实设备/会话模式使用sessionCount/count完整函数，禁止由未分组session数推设备数。 |
| hrProfileMigration.selectedPrefix/selectedSuffix | selectedPeople(count)“已选 {count} 人”，完整摘要。 |
| hrProfileMigration.peoplePrefix/peopleSuffix | totalPeople(count)“共 {count} 人”，完整摘要。 |
| portal.totalPrefix/itemSuffix | notificationCount(count)“共 {count} 条通知”；若待办同入口使用另todoCount(count)“共 {count} 项待办”，不能将两种集合都叫通知。 |
| web.memberCountSuffix | 对象为成员时用完整peopleCount；如果目标是岗位必须用岗位数，不能作为全局通用“人”后缀。 |

保留单位只限上表已经确认的单位控件场景，不允许通用忽略所有R6。未核实际作用的fragment条目仍退回，不能用空字符串代替修复。

导航页签独立定稿：`scoringResultsTab`“评分结果”。动作按钮仍可用“查看评分结果”，不得因为文案相同把动词动作句塞进五等宽页签；不以缩小字号或裁字应付310px溢出。

### 文件写入失败语境更正

主Agent已实核fallbackDownload收到base64后异步及同步写入均失败，当前并没有可供其他应用打开的本地文件。因此上表fileOpenHelp**不批准用于此分支**，该分支独立定稿：

- `fileWriteFailed(name,size)`：文件未能准备好，暂时无法预览或保存。请重试。\n\n文件名：{name}\n文件大小：{size}
- `fileSizeUnknown`：暂未确认

换行必须为真正换行；name保留真实原文件名，size仅有效非负有限大小格式化后传入，无法确认则传fileSizeUnknown，不写0 B。收到内容但写入失败不能声称已保存、已下载到本地或可转其他应用。旧3bc4a9b5be开头已无调用可删除；883/b6d的活跃拼接改本完整函数。

## R10逐资源清单

本表逐项分类均为“待删除、尚待调用核验”，不是批准保留的例外，也不是已删除。原因是静态引用清单未发现使用；已读过的本轮前端源逐键稿没有要求保留这些旧键。由于动态/聚合引用另有863项，执行删除者必须核对应资源的两端、别名和协议兼容后手工删除。发现实际调用即回到对应情境改引用，不能删除调用或关闭检查来通过。

为使每个键可回查，下列省略共同前缀`copy_`；资源仍须完整区分，不按hash跨文件删除。

### 服务端旧接口反馈语料

均位于`server/src/locales/zh-CN/generated/`。服务端文档、导出、外部通知仍可能使用独立语料，不能因为前端不用message就删除整个文件。

| 资源 | 待核删除键 |
|---|---|
| core/models/unifiedIdentity.js | 4331db909f |
| core/routes/admin.js | 4c4f7957b4、a8944fafcc、c535df75ca、cc29051f62、dfd5f185c9、eb00430bd4 |
| core/routes/auth.js | 09ac775d8a、10d3269bb4、13e7aea070、428c455ba9、53d5e0a0c8、6a1287aed6、6fc6c45b56、80a283f3f0、b10d64a68c、cc9e4b8129、d0ec43dfe5、e9125ff384、fe40320d45 |
| core/routes/departments.js | 40bf61128c、77b4594829、c209f2986b |
| core/routes/hr.js | 02808711c5、120171d734、1364ec67c8、14a40dcb62、25da4c9917、2a53101dd0、2cf6664a49、4c4f7957b4、503bd17961、5840966982、803a916bfb、8c36023a05、946df9f612、b691796f85、bff02f531d、c8029d1c2a、c8aa4ca152、d8d00225f1、e840878ac4、f117197c23、ff3a771974 |
| core/routes/hrProfile.js | 10d3269bb4、1198118dbe、7ba1f77c14、b10d64a68c、b71a0c7ed7 |
| core/routes/identities.js | 20bec31d0c、49f1c93054、7d27c30831 |
| core/routes/org.js | 20ca49e5e7 |
| core/routes/workGroups.js | 6664216a6e |
| core/services/currentActor.js | c22a252e97、c99b2ee9e2 |
| middleware/orgContext.js | c22a252e97、cc9e4b8129 |
| modules/audit/routes/auditAdmin.js | 03d69a9d28、cb20eb18bc |
| modules/audit/routes/auditFile.js | 0137b35177、044ddd451a、208830216b、3b3ae2f786、709e45d760、a3b626d8c1、b152533537、f66ff9f7b5 |
| modules/audit/routes/auditSignature.js | 6f376151a2、c6b6dad622 |
| modules/audit/routes/auditUser.js | 162d055e98、3fff5a4097、6ae85136ce、7946f0a5a8 |
| modules/audit/services/todoService.js | 5d43cbef1a、c9fa920da1 |
| modules/scoring/routes/activities.js | 48f70c55c9、61d3d82d79 |
| modules/scoring/routes/publications.js | 162d055e98、5d7d52909c、6268aa5c49、7a700bfd4b、8f467e6dad、9e7a5b00ee、a6a63b1fc4、b2b03f8fa2、b713e58b64、bba7f8b8ba、df60c34fc6、f60a08009f、ff90093cad |
| modules/scoring/routes/rules.js | 97abe52b9d、de6991a9f2 |
| modules/scoring/routes/scoring.js | af9ac03fc1 |
| modules/scoring/routes/templates.js | d976fb44d6 |
| modules/venue/routes/venueAdmin.js | c4a10a56e4、cba470e634 |
| modules/venue/routes/venueApprovalAdmin.js | 11748a2634、40d13b479c、4b77534e2a、67f5f44b1e、6ee33fb024、72d2fe8b04、782bc123ee、a5f604a639、b069f9d0fd、cf3264f4d8、e0725727f3 |

### 前端审核与组织页面

位于`shared/locales/zh-CN/generated/`。

| 资源 | 待核删除键 |
|---|---|
| subpackages/audit/components/signaturePad/signaturePad.js | 36b96c0240、81bffbd366、b5a7df5844、e22c5edfe9、ee931979e9 |
| subpackages/audit/pages/mySubmissions/mySubmissions.js | e52119b17e |
| subpackages/audit/pages/pendingApprovals/pendingApprovals.js | bba7f8b8ba |
| subpackages/audit/pages/submissionDetail/submissionDetail.js | 0c28c344e7、17bcc41217、1d953e38dc、213b890c07、23590ac13f、3f9ec35c15、45ef5ac49b、55de802a51、6321f35418、7043c094bd、72dd9e6203、777df8daa0、7abed5378f、7aeee7513d、8b1a42b718、8d3aac9d85、8ff5c9662e、9b774f950c、b45ad4069d、d0348010eb、d3028048b3、da41cca7fe、db70b8527a、e012d6739e、e4882ec81b、fbdf6b37eb、fc98ff863c |
| subpackages/audit/pages/verification/verification.js | 07c93eae72、0ad36ee44c、1a50073a0e、3196e9e72b、3e081d0fa1、3f3f603e7b、4e1ba9317f、5494a3274f、61390dea0a、6db0cdad11、71234ac12a、73b11affc2、794d97df79、7bb4b58022、accba28cad、b0ecda76b1、c25d1b8a38、c9448bb954、df548b0f40、fbf2871317、fde988de1e |
| subpackages/org/pages/adminPermissions/adminPermissions.js | 4dbdbf9dcd |

### 前端综合管理页

资源为`shared/locales/zh-CN/generated/subpackages/scoring/pages/admin/admin.js`。下列每一键均为待核删除，不因数量多批量脚本修改：

04d8c1a10d、08b30a529d、099072236c、0bfd822c5b、105bbfcae6、1a2083394a、1bc1338d71、22296797fb、2313ec3016、2c5113a076、2dfaff6e87、309860972e、32d3256b22、35d04fd49e、3cd3d7a8c2、3e081d0fa1、3f9ec35c15、43e8603f7a、44b682f101、44d2871601、49b5b1ec92、4da037e8e6、514b4a69ae、5327cd39d0、5a91e32d9a、68f7277730、6a48578660、6b5de892b0、6d4987d954、72dd9e6203、73b11affc2、74e8862ad7、757dfc5eab、7897981e63、7a62b752fe、7e7d84061a、803b577438、8859c785ab、93331f8a70、95a84a25aa、9882d5696d、9a5675654c、9beb04f4f6、9ecea0b582、a025c4351f、a859dc349b、a8c395216d、ad9efc83fe、b3109890c4、bc78ef2011、bd83f7065b、c47f370afa、c6a717f074、c95c079dfd、ca0f4c277a、d2005b0c5b、d2854566f8、d7ab4890db、d80d3752da、da2843df2e、de101441cb、e4a84c9a86、ec9aab61b0、f236827e3f、f31350a7af、f591c0573c、f9d85998ba、fcc739ca7b。

其中04d/08b/0bfd/222/32d/49b/74e/95a/9a567/d7ab等已经按本轮不同业务情境拆新键；旧key保留不再有用，不能因原文曾批准而永久留存。

### 前端管理Behavior与其他页面

下列modules路径均相对`shared/locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/`。

| 资源 | 待核删除键 |
|---|---|
| adminUtils.js | 55780718f9、67f2697101、68f7277730、b75c3b7064、e986e973a2、f54076411e、f8babd0e5d |
| auditBehavior.js | 17bcc41217、239cbf0257、287253008b、2dcf2e1cdf、361de3f050、532dbd7fc1、572c4dbb58、7abed5378f、86bbf0d28e、9b774f950c、b9283ec054、c76fae0e08、cb20eb18bc、d0348010eb、d3028048b3、fc98ff863c |
| departmentBehavior.js | 3ab009e9ad、59591bcd20 |
| hrInfoBehavior.js | 028fbc8a93、067b107bd7、0f62b98983、393f20aba2、3cfda2ecef、4c8603086a、4f261c7609、5fbd09dc2e、67f2697101、68f7277730、6dbd8065fb、89be75a701、99f5426801、9aec79b593、a68c09e48e、a751bbfc34、a7e6a633a4、af444f2b01、b702b25b77、c6e80c1d75、c76384305a、f37be3c249、fbdaa51ccc |
| identityBehavior.js | b538d2281a、f878df1668 |
| publicationBehavior.js | 1b631a5d63、23e27d9fb0、61c8906682 |
| resultBehavior.js | bd06e9a531 |
| settingsBehavior.js | 0a1deb4187、0ff87aff65、53d5e0a0c8、a58d703333、b3614bb93e、e7e3787584、fcc6193afc |
| workGroupBehavior.js | 5778bc8da0、7093ebdf5f |

其他资源仍相对`shared/locales/zh-CN/generated/`：

| 资源 | 待核删除键 |
|---|---|
| subpackages/scoring/pages/score/score.js | 5a607382b0、89ac0b1b9d |
| subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals.js | 5dbaec0fcf、b4432643e3 |
| subpackages/venue/pages/venueBooking/venueBooking.js | 21268f5ef7、44ce05c859、57f8fbd947、584ba3052b、5dbaec0fcf、6d6ab79183、70d4911767、7c25b53857、82b3c19342、960969cd90、9e824e777e、abf766aebc、b4432643e3、b80d60c556、c5aa06059a、d08fb8244e、db4932f471、fbf78f3644、fcd3dd2cc8 |
| subpackages/venue/pages/venueManage/venueManage.js | 02202fc2dc、05302eb150、082455b28c、23f77c8074、26f68cb229、35d04fd49e、5bb8799355、5da3188f19、9882d5696d、c47f370afa、c5aa06059a、c70f4ff52a、c9c991ff82、ca51b9c6c6、f600823615 |
| subpackages/venue/utils/venueBookingDetail.js | 29ec8299c4、3cd1b8dd73 |
| utils/api.js | db7d9fed8e |
| utils/authContext.js | 53d5e0a0c8、97169e852e、a805235eb4 |
| utils/filePreview.js | 3bc4a9b5be、53de6ca47b |
| utils/organizationActivation.js | 53d5e0a0c8 |

R10与R1/R3/R6等重叠时，确定无调用应删除，不能先改文案再将孤儿键留作例外。确认仍有调用时，使用本表前面的情境定稿改引用，再重新核死键；不得因为审计计数减少就宣称业务场景已验证。
