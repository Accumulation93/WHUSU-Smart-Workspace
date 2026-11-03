# 全系统语言审稿覆盖账

维护人：独立语言 Agent `/root/language_editor`。以下均指唯一源 shared/locales/zh-CN，不把生成副本另算审阅。不把“已逐项审稿”称为已运行、已部署或已现场验收。机器协议、表格兼容别名和用户业务数据不重写。

| 源 | 语言审稿状态 | 定稿依据 |
|---|---|---|
| authorization.js | 全部原有键逐项审阅；新增情境键独立定稿；两端结构静态复核通过 | authorization-editorial、authorization-key-review |
| common.js | 全部7项保留批准 | account-entry-editorial |
| login.js | 全部逐项审阅 | account-entry-editorial |
| portal.js | 全部逐项审阅 | account-entry-editorial |
| generated/utils/authContext.js | 全部逐项审阅 | account-entry-editorial |
| generated/subpackages/org/pages/identitySwitch/identitySwitch.js | 全部逐项审阅 | account-entry-editorial |
| home.js | 全键登记；账号与其余区域分别定稿，个别搜索范围待核 | account-entry-editorial、home-editorial |
| contactDirectory.js | 全部逐项审阅；复制反馈分离及组结构静态复核通过 | contact-directory-editorial |
| adminPersonnel.js | 全部逐项审阅 | hr-template-migration-editorial |
| hrTemplateSave.js | 全部逐项审阅；分端类型识别已核实 | hr-template-migration-editorial |
| hrTemplateFieldDisplay.js | 全部逐项审阅 | hr-template-migration-editorial |
| hrProfileMigration.js | 全部逐项审阅；迁移确认摘要结构静态复核通过，服务端message直出另待接入 | hr-template-migration-editorial |
| hrImport.js | 全部逐项审阅；headerAliases按协议保留；闲置跨部门推断退回 | hr-import-editorial |
| auditSigning.js | 全部逐项审阅 | audit-signing-editorial |
| auditVerification.js | 全部逐项审阅 | audit-signing-editorial |
| signingEvidence.js | 全部逐项审阅 | audit-signing-editorial |
| requestFeedback.js（新增拟稿） | 公共情境已定稿；实际结果码映射待核 | request-feedback-editorial |
| main.js | 已核实另有10项自存语料，全部逐项审阅；引用不重复改写 | shared-runtime-editorial |
| calendar.js | 全部逐项审阅 | calendar-stamp-venue-editorial |
| stampAuthorization.js | 全部逐项审阅 | calendar-stamp-venue-editorial |
| venueFlowManagement.js | 全部逐项审阅 | calendar-stamp-venue-editorial |
| adminGovernance.js | 全部逐项审阅 | governance-compat-editorial |
| app.js | 全部逐项审阅 | shared-runtime-editorial |
| controlLayout.js | 全部逐项审阅 | shared-runtime-editorial |
| fileIO.js | 全部逐项审阅 | identity-files-messages-editorial |
| identityCard.js | 全部逐项审阅 | identity-files-messages-editorial |
| messagePerformance.js | 全部逐项审阅 | identity-files-messages-editorial |
| messages.js | 全部逐项审阅 | identity-files-messages-editorial |
| personnelPicker.js | 全部逐项审阅 | identity-files-messages-editorial |
| time.js | 全部逐项审阅 | shared-runtime-editorial |
| uiNavbar.js | 全部逐项审阅 | shared-runtime-editorial |
| web.js | 全键登记，旧限制提示按引用分类，consoleNote等待核 | web-editorial |
| generated/components/workspace-hero/workspace-hero.js | 全部逐项审阅 | shared-runtime-editorial |
| generated/utils/api.js | 全部逐项审阅；结果码映射另见公共稿 | shared-runtime-editorial |
| generated/utils/adminPermissions.js | 全部逐项审阅 | shared-runtime-editorial |
| generated/utils/filePreview.js | 全部逐项审阅；旧保存成功无引用退回 | shared-runtime-editorial |
| generated/utils/messageScope.js | 全部逐项审阅 | shared-runtime-editorial |
| generated/utils/organizationActivation.js | 全部逐项审阅 | shared-runtime-editorial |
| generated/utils/tableFile.js | 全部逐项审阅 | shared-runtime-editorial |
| generated/utils/trustedNavigation.js | 全部逐项审阅 | shared-runtime-editorial |
| generated/subpackages/org/pages/{switch,accountSecurity}/*.js | 全部逐项审阅 | shared-runtime-editorial |
| generated/subpackages/org/pages/{authManagement,adminPermissions}/*.js | 全部逐项审阅；旧权限页仍活跃只读 | governance-compat-editorial |
| generated/subpackages/audit/pages/{mySubmissions,myApprovalHistory,pendingApprovals,signatureManager,verification}/*.js | 全部逐项审阅 | audit-pages-editorial |
| generated/subpackages/audit/pages/submissionDetail/submissionDetail.js | 原有键全部逐项登记，含结构退回及有条件批准，实施后待复核 | audit-pages-editorial |
| generated/subpackages/audit/components/signaturePad/signaturePad.js | 全部逐项审阅 | audit-pages-editorial |
| generated/subpackages/venue/pages/venueManage/venueManage.js | 327键全部登记；22个新成功动作定稿；部分参数结构待核 | venue-management-editorial |
| generated/subpackages/venue/pages/venueBooking/venueBooking.js | 全键登记；时间规则改完整函数，待实施复核 | venue-pages-editorial |
| generated/subpackages/venue/pages/{venueBookings,venueApprovalHistoryDetail,venueApprovalHistory,pendingVenueApprovals,myVenueBookings}/*.js | 全部逐项审阅；待审批失败态和成功句结构待整改 | venue-pages-editorial |
| generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail.js | 全部逐项审阅 | venue-pages-editorial |
| generated/subpackages/venue/utils/{workContextPresentation,venueRuleDisplay,venueBookingDetail,flowTimeline}.js | 全部逐项审阅 | venue-pages-editorial |
| generated/subpackages/scoring/pages/{score,scorerTasks}/*.js | 全部逐项审阅 | scoring-editorial |
| generated/subpackages/scoring/pages/admin/admin.js | 870行全部原有键已登记，缺登记键0；结构退回与待核项另行解决 | admin-shell-editorial |
| generated/subpackages/scoring/pages/admin/modules/{templateBehavior,ruleBehavior,resultBehavior,publicationBehavior,activityBehavior}.js | 全部逐项审阅；公示失败态待整改 | scoring-editorial |
| generated/subpackages/scoring/pages/admin/modules/{workGroupBehavior,settingsBehavior,identityBehavior,departmentBehavior,authPersonnelBehavior,adminManagementBehavior}.js | 全键登记；账号部分行为有待核条件 | hr-dictionaries-editorial |
| generated/subpackages/scoring/pages/admin/modules/auditBehavior.js | 全键登记；多维条件及旧碎片退回待改 | audit-management-editorial |
| generated/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js | 245键全部登记；旧导入数量、账号状态等待引用调整 | hr-member-behavior-editorial |
| generated/subpackages/scoring/pages/admin/modules/adminUtils.js | 187键全部登记；兼容别名必须保持协议，待引用确认 | admin-utils-editorial |
| hrValueValidation.js | 全部逐项独立定稿 | hr-value-validation-editorial |
| venueFacts.js（新增） | 创建方式、历史缺失信息、审批步骤与进度共12项独立定稿 | venue-facts-editorial |
| auditConditions.js | 按结构化条件逐项定稿 | audit-pages-editorial |
| responseMessages.js | 只批准逐条核实的结果码映射；最终实现待逐键复核 | request-feedback-editorial |
| legacyPermissions.js（新增拟稿） | 8组、明确旧权限及14派生删除条目逐项定稿 | legacy-permission-directory-editorial |
| 消息类型与待办事实前端格式（新增拟稿） | 4类待办及14类旧通知定稿，按真实type接入 | message-facts-editorial |

完整清零之前不得报告“全系统文案已审完”。每份逐项稿的退回／条件批准必须由前端与实施Agent落实，再静态复核和运行验收。

## 2026-11-03 较早阶段复审事实（非最终数量）

- 原有源文件均已逐键登记。完整登记不等于所有条目批准，定稿表中的待核、退回和结构条件仍需逐条处理。
- 综合管理大页、场地管理327键、人事行为245键、管理工具187键分别执行只读键覆盖比对，未登记键为0；比对只检查遗漏，不自动作语言判断。
- 本节记录时共享 `responseMessages` 为62项结果码映射，经独立语言复核；这是当日较早阶段的数量，不是冻结时最终数量。真实服务端分支覆盖由主Agent验证。
- `messageFacts` 的4类待办和14类通知语料已复核；旧通知不按描述提取事实，真实截止类型是 `score_deadline_24h`。
- 网页通讯录的复制反馈与详情读取反馈分开，复制失败不隐藏已加载资料；该结构已再次静态复核。
- 原生场地待审批已拆读取失败和读取成功为空，失败有重试且不显示全部处理完；审批成功区分步骤与整单。已静态复核，不代表设备现场检查。
- 两端审批条件组件按组与维度展示，缺失条件不变成全部；单组仍须显示同一岗位同时满足的关系，已补独立定稿并要求实施。
- 新资料审核状态使用reviewStatus，完整度独立显示；已静态复核共享hrProfileStatusView、网页HrProfileView/HrPersonDetail和原生本人资料状态区域。旧none不误判未提交，缺少授权字段时省略状态；未以此代替接口测试。
- 资料转换明细的共享hrValueValidation与网页HrValueIssue已静态复核：成员、源目标资料项、格式要求分行，未返回原内容时不显示原内容栏，不误写未填写。
- 导入明细的hrImportIssueView对缺少事实的旧预览仅提供重新检查；原生refresh操作实际调用preview。未知问题不会因保留旧动作而开放无法解释的批量修复。
- 账号批量结果卡已静态复核为三状态计数、展开姓名状态及结果未知说明；两个混合失败Toast需同步使用“未全部确认完成”，不能把未知写入说成未执行。设备与单次登录确认、成功提示已按实际提交分支拆开。
- AdminAuthView和AdminAccountPanel已使用本地账号四态，前者读取失败不再同时显示空目录；adminUtils评分表格显示标签与旧识别别名分离，已核问题、问题内容、起始分、步长、步进及人事职位等别名保留。
- 模板发起范围已独立buildStarterConditions，未复用审批资格句；历史own/submitter未被解释为不限，管理及普通查看的指引分开。本地指定岗位事实确含姓名与岗位标签，服务端历史仅姓名的条件不冒称具体岗位。
- CalendarView退出本人和取消活动按钮已分开；AuditSigningWorkspace的步骤草稿帮助仅在存在submissionId时显示，独立签名板不显示不存在的步骤说明。
- 旧权限前端目录映射和两端只读按钮已静态复核：未知权限不可编辑、未知组保留能识别的子项，身份与账号状态本地映射；原生首次加载失败仍需独立失败区域，不能只Toast后显示没有管理员，该项已退回实施。

导入兼容别名、评分范围的相对岗位、场地日期边界、认证管理设备与会话、场地审批选择模式及评分人分类生成均已补最终批准表。前表保留审阅过程中的待核备注时，以同文末最终批准表为准；结构退回仍须实施完成后复审。两项原生无引用结论已因网页实际引用纠正，删除共享语料必须同时核对两端。未完成实体手机及Pad现场验证；语言Agent未执行生产部署。

## 2026-11-03 完整 CI 前语言冻结复审

本节晚于前述逐批记录，覆盖当前最终源码静态复审。原表中的文件行数、原始键数、待整改状态用于追踪审阅过程，不能用作最终构建数量或宣称功能未修复。最终记录如下：

- `shared/locales/zh-CN/responseMessages.js` 实际89项，逐项复核。组织维护5项、三类字典15项、评分活动与分类删除、记录变化拒绝等新增结果均已独立定稿，具体触发分支见 dictionary-feedback-editorial 与 request-feedback-editorial。明确拒绝不显示结果未知；未知冲突不猜测为已有历史。
- `shared/locales/zh-CN/venueFacts.js` 实际21项，全部字符串与函数复核。创建方式、姓名与岗位缺失、步骤、进度、日期范围分别表达；经办事件与未来步骤分开。语言批准不代替服务端事实覆盖测试。
- 场地两端月度、年度规则使用完整函数，月日范围允许同日与完整时间段结束晚于开始的校验提示保持分开。原生 yearly chip 已预计算完整范围及缺失提示；网页同位置仍建议补齐缺值保护，详见下方待完成项。
- 文件写入失败使用文件名、大小及明确重试说明，不承诺已有可供其他应用打开的文件；文件大小未知有独立语料。文件生成、下载开始、系统保存完成仍为不同结果。
- 审核详情的模板步骤标题与计数分开，驳回步骤缺失不用问号猜序号；页码已按可靠事实选择完整函数或未知提示。自定义指定岗位条件使用真实姓名与岗位，历史仅姓名条件不冒称已知岗位。
- 人事模板填写说明长度提示的字符串与函数重名已修复，原生按函数直接调用；字段问题定位依赖提交快照索引，不匹配服务端中文猜字段。账号四态、资料审核与完整性、通讯录局部复制反馈、旧权限只读/加载失败等先前退回结构已静态复核修正。
- 评分分类、公示查看与评优指定的复用错键已分别拆分；评优范围的三类等价选项保留历史枚举，不在打开编辑时静默改写。旧 CSV 识别别名保留，显示标签独立。

### 签核结论与剩余边界

**独立语言稿与上述已复核实现可冻结，进入完整本机 CI。** 不批准通过自动替换把尚未知情境的字符串改成泛用句，也不批准恢复直接显示后端 message。

1. 网页 `VenueCycleRuleEditor.vue` 年度范围标签的历史缺值保护待实施确认；应与原生一致使用 `timeRangeMissing`，不能显示 undefined。这是实际待办，不视为已通过。
2. 本文不代替最终质量审计清零、生成副本一致性、真实写入回读、完整 CI、微信真实编译与浏览器回归。执行结果由实施与主 Agent 单独记录。
3. 手机和 Pad 实体设备布局及全部异常状态尚未由语言 Agent 现场验收；生产部署也未由语言 Agent 执行。不将这些未执行项表述为语言审稿失败，亦不表述为验收通过。
4. quality-findings-editorial 中585项是当日质量整改前的基线，包含334项待引用核查的候选死键；不是最终残留数量。每条删除必须依据两端实际引用，不能按该基线批量删源。最终质量数量须使用冻结后的实际审计输出。
