# 公共请求反馈的只读分类核对

2026-11-03，前端逻辑 Agent。只读指不执行用户业务变更；授权复核、只读事务、内存结果缓存、运行日志不使接口变成用户提交。清单仅登记已核对真实路由与处理函数的接口，不能按名称前缀扩展。没有列入的接口保持未知，不能自动认为可重试。

## 第一批：可按读取失败反馈

| API 路径 | 真实路由 | 处理依据 |
| --- | --- | --- |
| `/getContactDirectory` | core/routes/contactDirectory.js:26 | models/contactDirectory.read：读取规则、授权人员、岗位与生效字段，summaryOnly/key分支均不写业务；nonce只生成临时展示键 |
| `/getContactDirectoryConfiguration` | core/routes/contactDirectory.js:40 | models/contactDirectory.configuration：授权检查后list/catalog均SELECT，返回规则与候选，不保存规则 |
| `/resolvePersonLinks` | core/routes/contactDirectory.js:28 | model.resolveLinks后经授权read构造跳转关系；历史岗位SELECT仅用于识别人，不写岗位或权限 |
| `/getMyIdentityCard` | core/routes/identityCard.js:22 | model.mine调用当前授权与listContexts后返回card，不调用issue、不插入身份码 |
| `/verifyIdentityCard` | core/routes/identityCard.js:29 | model.verify校验token格式，经authorization.publicCard读取，checkedAt为响应生成时间，无身份卡插入 |
| `/getMessageOverview` | modules/audit/routes/notification.js:372 | resolveScope后并行loadTodos/loadNotifications并汇总；不调用标读/删除 |
| `/listTodos` | modules/audit/routes/notification.js:392 | loadTodos当前业务待办计算与分页；游标过期返回错误，不提交审批 |
| `/getTodoCount` | modules/audit/routes/notification.js:411 | loadTodos(countOnly:true)，不构建写操作 |
| `/listNotifications` | modules/audit/routes/notification.js:426 | loadNotifications读取通知和可见过滤；打开列表不标为已读 |
| `/getNotificationUnreadCount` | modules/audit/routes/notification.js:448 | loadNotifications(countOnly:true)，不改is_read |

路径均以server/src为根。此清单不是主动自动重试授权，仅允许公共反馈将未知网络异常描述为读取未完成。401和组织/角色变化仍按会话规则处理，不重放跨账号请求。

## 必须排除的相邻接口

| API | 变更事实 |
| --- | --- |
| `/createMyIdentityCardCode` | models/identityCard.issue生成码后事务删除过期记录并INSERT新的identity_cards，不能按获取图片当纯读取 |
| `/markNotificationRead`、`/markAllNotificationsRead` | 更新已读状态 |
| `/deleteNotification`、`/deleteAllNotifications` | 写notification_dismissals，影响自然人跨角色可见性 |
| `/saveContactDirectoryRule`、`/batchContactDirectoryRules` | 保存、启停或删除规则 |
| `/switchOrganization` | core/routes/org.js:125只修改系统默认组织，但仍是配置写入，不是角色目录读取 |

权限预览、资料预览等接口虽未正式发布业务变更，可能保存预览token或草稿；未核对其Model之前不列纯读取。导出可能创建临时文件，需独立标为产物生成，不直接按get/list/export名称推断。

## 第二批：权限与配置复制读取

以下均在 core/routes/authorization.js 明确注册POST，已核对处理函数。授权锁只用于一致读取；这些分支不调用保存或发布。

| API路径 | 路由行 | 依据 |
| --- | --- | --- |
| `/getCurrentAuthorizationAccess` | 60 | services/authorizationAccess.current只loadActor、storage.read、解释现有能力 |
| `/listAuthorizedDictionary` | 61 | models/dictionaryAuthorization.list只构造权限scope后SELECT并投影字段 |
| `/getAuthorizationManagement` | 62 | authorizationManagement.readManagement只读规则、方案、委托与目录 |
| `/getEffectiveAuthorization` | 63 | authorizationInspection.inspect读取目标角色并evaluate/explain，不保存规则 |
| `/listAssignmentNatures` | 64 | assignmentNatureManagement.list读取字典并附可操作布尔值 |
| `/getAuthorizationCandidates` | 67 | 无purpose走readCandidates，purpose=inspection走inspectableCandidates，均查询与过滤 |
| `/getAuthorizationSchemeVersions` | 78 | models/authorization.schemeVersions逐历史版本检查读取范围，只SELECT |
| `/listSharedOrganizationConfigurations` | 86 | models/organizationConfigCopy.available查询分享并校验payload哈希 |
| `/getOrganizationConfigurationDraft` | 88 | 同Model.detail只读取草稿与可启用状态，不apply或enable |
| `/getOrganizationConfigurationWorkspace` | 91 | 同Model.workspace按source/outgoing/drafts查询；venue.purposes调用requireOrganizationStorage只SELECT阶段，无迁移写入 |
| `/getOrganizationConfigurationCandidates` | 92 | 同Model.candidates查询草稿引用及目标目录，不创建映射副本 |

排除：previewAuthorizationRule/Delegation等预览调用prepare路径可能经过lockOrganization的INSERT IGNORE初始化；本批不将其登记为严格只读，也不因为preview前缀推断。receiveOrganizationConfiguration会创建草稿，绝不能加入读取表。

## 后续批次

权限与跨组织配置读取、人事/导入结果读取、场地与日程、审核/评分读取继续按真实处理函数添加。未核实接口不应借此文件默认为只读。

## 第三批：本人资料、模板目录与导入回读

| API路径 | 路由与核实依据 |
| --- | --- |
| `/getUserHrProfile` | core/routes/hrProfile.js:243；resolveSelfHrProfileSubject只查认证对应有效成员；模板、记录与生效/待审值读取后计算完整度，不创建资料记录 |
| `/listHrProfileTemplates` | 同路由:415；hrProfileTemplateLibrary.listTemplates与getActiveSnapshot均只有SELECT，返回模板目录及组织选中快照 |
| `/getHrImportPreview` | core/routes/hr.js:817→hrImportV2.details；只SELECT现有预览并在内存中分组、分页、计算动作。不是生成预览的接口 |
| `/getHrImportResult` | 同路由:818→hrImportV2.result；按组织、操作者、角色及requestId读取已完成且未过期的result_json，不执行导入 |
| `/getHrImportMetadata` | 同路由:821→hrImportV2.metadata→loadContext(lock=false)；读取岗位字典、组织资料模板字段，不创建预览或字典 |

相邻写接口不得混入：previewHrTableImport会清理过期预览并创建预览记录；importHrTable执行正式写入。exportHrAssignmentTable/exportHrImportIssues根据格式可能生成文件，本表尚不把产物生成归入纯读取。人事管理整目录与跨组织资料迁移读取尚需继续核实完整调用链。

## 第四批：日程业务读取（含内部初始化例外）

已逐函数核对core/routes/calendar.js及models/calendar.js：getCalendarConfiguration/getCalendarRules调用configuration，只读规则、候选及权限；getCalendar调用list/listForActor，只读事件、退出记录、历史参与人及场地来源后展开；getCalendarParticipants调用getParticipants，只读来源访问权限、事件与参与人，不因edit=true创建事件。上述业务函数均不修改日程。

但路由authorization在缺少authorization reference的旧模式分支会调用authorizationBusinessRoute.requireLegacyWrite，该函数执行INSERT IGNORE INTO authorization_organizations。因此不能将所有分支宣称为零数据库写入。主Agent确认此清单用于“未知响应是否可能发生用户业务提交”，内部初始化不视为用户提交；以下四条据此登记为业务读取，不修改权限实现。

| API路径 | 已核实调用 |
| --- | --- |
| `/getCalendarConfiguration` | configuration(actor, authorize)，读取可安排人员与规则配置 |
| `/getCalendarRules` | configuration(actor, authorize, true)，读取规则管理目录与操作权限 |
| `/getCalendar` | list → listForActor，读取并展开时间范围内日程 |
| `/getCalendarParticipants` | getParticipants，edit=true仅附可编辑目录，不创建事件或参会人 |

manageCalendarSubscription包含创建、轮换、撤销等状态变化，不能因页面像加载设置而归只读；saveCalendarEvent、saveCalendarParticipants、changeCalendarParticipation、saveCalendarRule、batchCalendarRules均为明确写操作。

## 第五批：审核模板候选、签名与印章读取

| API路径 | 真实路由与依据 |
| --- | --- |
| `/getAuditTemplateEditorData` | modules/audit/routes/auditAdmin.js:48 → auditEditorDirectory.templates；SELECT人员岗位及字典，无模板保存 |
| `/listAuditVerificationCandidates` | 同路由:65 → auditEditorDirectory.people；读取姓名岗位，不赋予验签权限 |
| `/listAuditFlowTemplates` | 同路由:82 → auditManagementAuthorization.templates及步骤Model；SELECT模板/步骤/条件并投影，不更新模板 |
| `/listMySignatures` | auditSignature.js:103 → signatureTemplate.getByHrId；SELECT当前成员签名库，不改变默认签名 |
| `/listMyStamps` | auditUser.js:2874 → stampAssignmentGrant.getAuthorizedStamps；SELECT当前有效岗位授权的印章，includeImageData只控制返回材料 |
| `/getMyStampImage` | 同路由:2899；同一授权查询，preview=true调用stampPreview生成派生像素，仅有有界内存缓存，不改变印章原图或签署记录 |

前三条在旧授权模式下可能经auditManagementAuthorization.session初始化authorization_organizations，与第四批相同，属于内部初始化而非用户业务提交。保存签名、默认签名变更、印章授权分配、保存审核模板不在本表。

## 第六批：场地管理配置读取

| API路径 | 真实路由与依据 |
| --- | --- |
| `/listVenues` | venueAdmin.js:140 → venueConfigurationAuthorization.listVenues，查询资源及配置候选；purpose只选择投影目录 |
| `/listVenueOpenRules` | 同路由:199 → listSharedRules(openRules)，SELECT场地共享开放时段并裁剪字段 |
| `/listVenueActivityRules` | 同路由:263 → listSharedRules(activityRules)，SELECT活动占用规则，不展开后写回 |
| `/getVenueRuleCandidates` | 同路由:329 → readCandidates → venueRuleCandidates.read，查询审批候选和字典 |
| `/listVenueBookingRules` | 同路由:344 → listOrganizationConfiguration(bookingRules)，查询组织内规则与借用时间窗口 |
| `/listVenueApprovalFlows` | venueApprovalAdmin.js:66 → listOrganizationConfiguration(approvals)，查询流程并读取步骤 |

上述读取共享sharedSession/authorize的旧模式授权初始化副作用，业务配置不写入。getVenueApprovalFlow已退役且固定410，不能把它当成仍可用的读取接口；不应引导重试退役接口。

## 第七批：人事转换预览与选项

| API路径 | 调用事实及副作用 |
| --- | --- |
| `/getHrProfileTemplateSwitchContext` | hrProfile.js:462 → templateLibrary.getSwitchContext；SELECT目标模板/字段、组织快照及值计数，内存给映射建议 |
| `/previewHrProfileTemplateSwitch` | 同路由:473 → preflightSwitch；SELECT样本值校验，返回blockers和签名token；token编码在内存完成，不切换模板或写人员资料 |
| `/getCrossOrgMigrationContext` | hrProfileMigration.js:82 → resolveVisibleOrgIds/loadActiveSnapshot/listOrgMembers，查询可选组织、两边字段及目标成员 |
| `/previewCrossOrgMigration` | 同路由:117 → buildPlan；SELECT生效资料，内存计算冲突、阻断及签名token，不创建请求、通知或写资料 |

预览返回token并不表示完成业务；applyHrProfileTemplateSwitch、applyCrossOrgMigration、submitCrossOrgMigrationRequest、reviewCrossOrgMigrationRequest均为写操作，不能与上述预览混同。

## 第八批：账号角色与兼容管理员权限读取

| API路径 | 处理范围及依据 |
| --- | --- |
| `/listMyOrganizations` | auth.js:39 → accessibleOrganizations.listAvailableOrganizations → unifiedIdentity.listContexts/queryContexts，查询并去重当前账号有效岗位组织 |
| `/admin/listMyOrganizations` | 同文件:40，同上且读取系统默认组织作排序；不切换当前角色 |
| `/auth/contexts` | unifiedAuth.js:398/423，GET与POST都只读取有效角色、装饰权限目录和系统时区；listContexts有内存memo |
| `/auth/security` | unifiedAuth.js:545，router.all读取本人auth_policy与active sessions，内存归并设备，不撤销会话 |
| `/admin/auth/security` | 同文件:653，只读取受权成员账号、会话、口令存在状态，复核权限后返回；不创建账号或重置口令 |
| `/admin/auth/audit` | 同文件:1116，POST读取auth_audit_events并投影，不创建治理事件 |
| `/getMyAdminPermissions` | adminPermissions.js:42，读取当前管理身份及loadEffectivePermissions结果 |
| `/listPermissionManagedAdmins` | 同文件:60，读取目标管理身份、账号认证状态、覆盖权限和旧版只读状态 |
| `/getAdminPermissionDetail` | 同文件:102，读取目标、权限和可配置目录，不调用upsertOverrides |

管理读取的旧模式权限复核可能初始化authorization_organizations，仍属内部副作用而非用户业务提交。

### 必须按method或action区分，禁止整个路径加入读取表

- `/admin/auth/policy`：GET与POST action=get为读取；其他POST会savePolicy。
- `/admin/auth/claims`、`/admin/auth/recoveries`：GET及POST action=list为读取分支，其余POST可能处理认证/恢复。Model细查尚未完成，暂只登记路径混用风险。
- `/admin/auth/accounts`：POST action=list为目录分支，其余action含写操作，暂不登记整个路径。
- `/auth/contexts/activate`、`/auth/security/device`、`/auth/security/recovery-credential`、`/auth/security/sessions/revoke`均改变状态，不在读取清单。

## 第九批：管理身份与认证目录的明确读取分支

已核实unifiedIdentity的listClaims、listRecoveryRequests、listAccounts、listEligibleInitialInvitePeople均为SELECT及内存投影；listEligibleRecoveryAccounts调用listAccounts后过滤。下表条件不可省略，未列action仍按提交处理。

| 路径 | 必须满足的读取条件 | 依据 |
| --- | --- | --- |
| `/listAdmins` | POST全部 | admin.js:95，adminAccountAuthorization.list或adminInfo.listVisible，再读取认证状态和投影 |
| `/getAdminAccountCandidates` | POST全部 | admin.js:164，adminAccountAuthorization.candidates仅查询有效组织成员 |
| `/admin/auth/claims` | GET；POST action缺省/空/list/eligible | unifiedAuth.js:889/901；listClaims或listEligibleInitialInvitePeople |
| `/admin/auth/recoveries` | GET；POST action缺省/空/list/eligible_accounts | 同文件:977/989；listRecoveryRequests或listEligibleRecoveryAccounts |
| `/admin/auth/accounts` | POST action缺省/空/list | 同文件:1046；listAccounts |
| `/admin/auth/policy` | GET；POST action严格为get | 同文件:1090/1101；getPolicy为SELECT。POST缺省与空action是保存，绝不可算读 |

认证目录名单包含敏感资料，只读分类并不证明某前端有权展示全部字段，也不新增可见权限。授权旧模式复核可能有内部初始化，不改变这里的业务读取判断。

## 第十批：人事管理资料读取

- `/getHrPersonDetail`：hrProfile.js:817；hrAuthorization.directory查询获权成员、岗位与可读字段，读取资料模板、生效/待审值及审批历史，最后confirm重新读取权限版本。不调用资料保存或创建缺省记录。
- `/listHrProfileAdminData`：同文件:535；读取人事目录、资料记录、岗位摘要、生效/待审值、最新提交，内存计算完整度并裁剪可读字段，最后confirm。不把空值补写数据库，也不改变审核状态。

两接口返回的modeText/auditStatusText/currentSummary历史系统文字不能直接用于本轮新前端提示；读取分类与结构化反馈转换是两项独立工作，前端应依据editMode/auditStatus及事实值渲染。

## 第十一批：授权影响预览

以下在core/routes/authorization.js明确注册，models/authorization.js已逐函数核对，调用prepare只做校验、锁定现有记录及内存构造before/after，读取候选计算影响，不调用recordChange、不保存规则/方案/委托、不发布版本。

- `/previewAuthorizationRule` → previewRule:100 / prepareRuleChange。
- `/previewAuthorizationRuleDeletion` → previewRuleDeletion:147 / prepareRuleDeletion。
- `/previewAuthorizationScheme` → previewScheme:237 / prepareSchemePublication；restoreVersion仅选择拟恢复能力，不恢复或发布。
- `/previewAuthorizationDelegation` → previewDelegation:330 / prepareDelegationChange。
- `/previewAuthorizationDelegationDeletion` → previewDelegationDeletion:367 / prepareDelegationDeletion。

这五条均可能经lockOrganization初始化组织授权状态行；按本轮“是否可能完成用户业务提交”的分类归业务读取。此前第二批保守排除的说明由本批完整核实替代。预览后的save/delete/publish接口继续按写操作。

## 第十二批：跨组织资料请求及资料分组读取

- `/listCrossOrgMigrationRequests`：hrProfileMigration.js:287读取listByRequester/listBySourceOrg和组织名；Model为SELECT请求+内存解码，未同意、拒绝或取消请求。
- `/getPersonOrgProfiles`：同路由:323限超级管理员，SELECT组织成员关系、模板快照、当前和待审值后按组织分组，不执行跨组织合并或迁移。

请求statusText旧逻辑把approved与invalid也归为cancelled，不可用于新前端；新前端依据真实status有限映射，未知状态不猜成取消。

## 第十三批：审核及借用删除预览

- `/previewAuditSubmissionDeletion`、`/previewVenueBookingDeletion`：adminRecordDeletion.js路由明确传remove=false，直接model.preview；preview事务内authorize并readRecord，读取记录、附件、证据及步骤计算revision。没有删除记录、文件清理任务、通知或审计写入。
- 授权旧模式内部组织状态初始化仍可能发生；正式deleteAuditSubmission/deleteVenueBooking调用remove和processPending，必须按写操作，不能因共享handler而合并分类。

## 明确排除：待审批列表附带补发通知

`/listPendingVenueApprovals`在venueUser.js:1413起对当前可处理待办异步检查hasPendingApprovalNotification，缺少时调用createVenueApprovalNotifications。它不只是查询：可能补发通知。按本轮“发通知不能算业务只读”的约定，暂不加入公共readOnly清单，不由文案改造擅自删除补发逻辑。页面层仍须区分列表读取失败与真正成功为空，不能显示全部处理完。
