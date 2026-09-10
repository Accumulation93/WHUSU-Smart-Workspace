# 提交入口故障排查与验收记录

更新时间：2026-09-11。本记录是进行中的清单，不是全仓零故障声明。

## 2026-09-11 继续验收

- 新复现并修复：部门、身份类别编辑不存在或跨组织 ID 时，UPDATE 未命中却返回成功。模型现返回实际匹配结果，路由返回 `not_found`，不再清空前端草稿并假报成功。隔离 MySQL 用例先失败、修复后通过；同时验证正常新增、编辑及源组织数据未改变。
- 部门、身份类别新增与编辑已使用真实 Behavior 生成参数，而不是手工仿造载荷。
- 场地 `saveRule/deleteRule` 已使用真实页面方法展开动态接口，接入实际路由及 MySQL：开放规则、活动占用规则、普通审批规则新增/编辑/回读/删除通过；用户审批流程连续新建三条、独立修改第二条、完整步骤回读及逐条删除通过。
- 本次新增矩阵覆盖 22 个不同写接口（审核模板 2、基础目录 12、场地规则和流程 8）。这不是全仓全部写入口；静态清单原有 76 项未包含动态场地接口，也未完整枚举认证的 action 分支，不能用 22/76 当总覆盖率。
- 本次发布范围仅为提交可靠性修复、对应测试和门禁，不包含尚未完成性能验收的上一轮缓存改造。`output/`、`outputs/` 保持未跟踪。
- 现场重新观察开发者工具仍为登录页，已请用户手动登录。真实页面函数＋数据库测试属于自动化验收，不是模拟器点击或鸿蒙真机验收。
- 独立导出暂存区发布候选（不含性能改造）复验：161 个服务端测试、47 个前端/脚本测试通过；398 个生产 JS 作用域检查、26 页面注册、40 模板实际编译、UI/租户/本地化检查通过。完整工作区另有性能测试，163＋48 的计数不代表这些性能代码已发布。依赖审计 0 漏洞，生产现有迁移预检待执行 0；本次无数据库结构变更。

## 已确认故障

| 入口 | 原因 | 本地修复与证据 |
| --- | --- | --- |
| 审核模板保存 | 在循环外访问块级变量 vconditions/vstep；正常输入也抛 ReferenceError | 已调整作用域；auditTemplateSave.test.js 先复现失败再通过，auditTemplateSaveIntegration.test.js 执行真实前端方法→JSON→真实路由→MySQL，连续新增、独立修改、回读、跨组织拒绝及删除通过 |
| 评分明细 getScoreResults(detail) | 声明 sigStale、却读取 signatureStale | 统一名称；historicalScoreResults.test.js 新增有效历史快照进入明细的成功用例，保留历史不足失败用例 |
| 管理端借用时间条 | 调用不存在的 minToTime | 补齐分钟格式化；submission-runtime-test.js 执行实际页面拖动处理函数及边界 |
| 表格编码与导入导出 | 使用小程序未提供的浏览器 atob/btoa | 使用独立二进制 Base64 工具；在没有这些宿主全局的 VM 中验证 Unicode、空文件及二进制往返，与 Node Buffer 独立对比 |
| 登录弹窗遮罩 | WXML 绑定 noop，但页面未定义 | 补齐空事件；真实依赖图注册检查增加所有静态事件绑定检查 |

## 验证口径与发布

- 本轮升级前已运行全部 163 个服务端测试文件，全部通过，数据库测试使用独立回环 MySQL，不创建生产夹具。
- 190 个静态接口、280 个调用点、76 个写操作候选、11 个动态调用点来自 AST 清单；静态接口均能匹配路由。数量不等于错误数；动态 API、认证专用调用和模板 include 的间接行为仍需逐项补齐。
- 406 个生产 JS 的声明作用域检查通过；不覆盖运行时对象属性、条件数据形状或数据库状态，也不能替代真实提交。
- 26 个页面在正常与旧 API 兼容两组环境注册通过；静态 WXML 事件名检查通过。40 个 WXML 已使用本机 Glass-Easel 生成并解析。以上不等同于开发者工具点击验收或鸿蒙真机。
- 开发者工具现场停在登录页，已请求用户手动登录；尚未在页面上实际执行本轮提交链路。
- 模板修复提交 ced1d8f1c779f9a6b4d844cb16edecb3151ecbaf。首轮 CI 34496285690 的代码审计和测试通过，但依赖安全门禁失败，部署跳过；随后修复安全阻断再发布，没有绕过门禁。
- 安全审计发现 csv-parse、morgan、multer、sharp 四项依赖告警；锁定修复版本 7.0.2 / 1.12.0 / 2.3.0 / 0.35.4，npm audit 恢复 0 漏洞，升级后 163 个服务端测试再次全部通过。提交 e306290518fa328674ba035efb0160c27f098084 的 CI 34497329615 质量与部署两个阶段均成功。2026-09-10 23:44:49 部署成功，本地 HEAD、origin/main、生产仓库、current、进程 cwd 及部署状态 SHA 一致；两个 API、通知与备份进程 online，维护关闭，内外网健康正常，迁移 plan 待执行数 0。
- 另有 48 个前端/脚本测试通过；以上计数不能替代下面各入口的逐项验收。除审核模板修复和四项依赖升级外，本轮其余改动尚未提交部署，和上一轮性能工作一起保留在工作区。
- 六组基础写入/删除（部门、身份类别、职能组、评分模板、评分活动、场地）已通过隔离 MySQL 新增、编辑、回读、空名称拒绝和目录范围测试。场地物理目录沿用既有全局共享规则，并非组织私有目录；组织审批规则不因此全局共享。这些用例通过真实路由，但除审核模板外尚未接入页面实际参数生成方法。
- 上一轮性能改动及 output/、outputs/ 均保留，未夹带进模板修复提交。

## 长期检查命令

- `node scripts/submission-reference-audit.js`：声明作用域。
- `node scripts/submission-reference-audit.js --self-test`：作用域检查器自身回归。
- `node scripts/submission-reference-audit.js --inventory`：接口和调用点 JSON 清单。
- `node scripts/miniprogram-page-registration-test.js`：页面/组件真实依赖及静态事件处理器。
- `node scripts/submission-runtime-test.js`：本轮前端运行时缺陷。
- `node server/test/auditTemplateSave.test.js`：合法保存、逐步校验、失败回滚。
- 配置隔离 `DEPLOY_TEST_DB_HOST/PORT` 后运行 `node server/test/auditTemplateSaveIntegration.test.js`。无隔离库时输出“未执行”，不计入数据库验收。

## 静态写操作候选逐项清单

下表只把新增用例实际覆盖的项目标为通过。既有服务端测试通过不自动映射为某按钮完整验收；需继续记录真实前端参数、成功回读、业务拒绝、权限与异常恢复。

| 接口 | 真实路由 | 验收状态 |
| --- | --- | --- |
| `approveStep` | `server/src/modules/audit/routes/auditUser.js:1385` | 静态路由匹配；逐项完整验收待补 |
| `batchDeletePubMeritRules` | `server/src/modules/scoring/routes/publications.js:1855` | 静态路由匹配；逐项完整验收待补 |
| `batchDeletePubViewRules` | `server/src/modules/scoring/routes/publications.js:1748` | 静态路由匹配；逐项完整验收待补 |
| `batchMaintainFromHrInfo` | `server/src/core/routes/hr.js:739` | 静态路由匹配；逐项完整验收待补 |
| `batchSavePubMeritRules` | `server/src/modules/scoring/routes/publications.js:1780` | 静态路由匹配；逐项完整验收待补 |
| `batchSavePubViewRules` | `server/src/modules/scoring/routes/publications.js:1641` | 静态路由匹配；逐项完整验收待补 |
| `batchSaveRateRules` | `server/src/modules/scoring/routes/rules.js:485` | 静态路由匹配；逐项完整验收待补 |
| `cancelVenueBooking` | `server/src/modules/venue/routes/venueUser.js:1599` | 静态路由匹配；逐项完整验收待补 |
| `createAdminVenueBooking` | `server/src/modules/venue/routes/venueAdmin.js:504` | 静态路由匹配；逐项完整验收待补 |
| `createVenueBooking` | `server/src/modules/venue/routes/venueUser.js:676` | 静态路由匹配；逐项完整验收待补 |
| `deleteAdmin` | `server/src/core/routes/admin.js:221` | 静态路由匹配；逐项完整验收待补 |
| `deleteAllNotifications` | `server/src/modules/audit/routes/notification.js:502` | 静态路由匹配；逐项完整验收待补 |
| `deleteAuditFlowTemplate` | `server/src/modules/audit/routes/auditAdmin.js:399` | 真实前端保存链路及隔离数据库通过；现场待验收 |
| `deleteDepartment` | `server/src/core/routes/departments.js:67` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `deleteHrInfo` | `server/src/core/routes/hr.js:478` | 静态路由匹配；逐项完整验收待补 |
| `deleteHrProfileTemplateDefinition` | `server/src/core/routes/hrProfile.js:414` | 静态路由匹配；逐项完整验收待补 |
| `deleteIdentity` | `server/src/core/routes/identities.js:67` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `deleteMembershipAssignment` | `server/src/core/routes/hr.js:397` | 静态路由匹配；逐项完整验收待补 |
| `deleteNotification` | `server/src/modules/audit/routes/notification.js:524` | 静态路由匹配；逐项完整验收待补 |
| `deleteOrganization` | `server/src/core/routes/org.js:93` | 静态路由匹配；逐项完整验收待补 |
| `deletePubMeritRule` | `server/src/modules/scoring/routes/publications.js:1842` | 静态路由匹配；逐项完整验收待补 |
| `deletePubViewRule` | `server/src/modules/scoring/routes/publications.js:1735` | 静态路由匹配；逐项完整验收待补 |
| `deleteRateRule` | `server/src/modules/scoring/routes/rules.js:507` | 静态路由匹配；逐项完整验收待补 |
| `deleteScoreActivity` | `server/src/modules/scoring/routes/activities.js:132` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `deleteScoreTemplate` | `server/src/modules/scoring/routes/templates.js:179` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `deleteSignature` | `server/src/modules/audit/routes/auditSignature.js:176` | 静态路由匹配；逐项完整验收待补 |
| `deleteStamp` | `server/src/modules/audit/routes/auditAdmin.js:513` | 静态路由匹配；逐项完整验收待补 |
| `deleteVenue` | `server/src/modules/venue/routes/venueAdmin.js:182` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `deleteVenueApprovalFlow` | `server/src/modules/venue/routes/venueApprovalAdmin.js:145` | 静态路由匹配；逐项完整验收待补 |
| `deleteVenueBookingPurpose` | `server/src/modules/venue/routes/venueAdmin.js:1019` | 静态路由匹配；逐项完整验收待补 |
| `deleteWorkGroup` | `server/src/core/routes/workGroups.js:91` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `importHrTable` | `server/src/core/routes/hr.js:727` | 静态路由匹配；逐项完整验收待补 |
| `markAllNotificationsRead` | `server/src/modules/audit/routes/notification.js:480` | 静态路由匹配；逐项完整验收待补 |
| `markAllSubmissionsRead` | `server/src/modules/audit/routes/auditUser.js:2980` | 静态路由匹配；逐项完整验收待补 |
| `markNotificationRead` | `server/src/modules/audit/routes/notification.js:456` | 静态路由匹配；逐项完整验收待补 |
| `markSubmissionRead` | `server/src/modules/audit/routes/auditUser.js:2943` | 静态路由匹配；逐项完整验收待补 |
| `mergePersons` | `server/src/core/routes/hr.js:673` | 静态路由匹配；逐项完整验收待补 |
| `rejectStep` | `server/src/modules/audit/routes/auditUser.js:1781` | 静态路由匹配；逐项完整验收待补 |
| `revokeScoreRecord` | `server/src/modules/scoring/routes/results.js:1925` | 静态路由匹配；逐项完整验收待补 |
| `saveAdmin` | `server/src/core/routes/admin.js:140` | 静态路由匹配；逐项完整验收待补 |
| `saveAdminPermissions` | `server/src/core/routes/adminPermissions.js:124` | 静态路由匹配；逐项完整验收待补 |
| `saveAuditFlowTemplate` | `server/src/modules/audit/routes/auditAdmin.js:123` | 真实前端保存链路及隔离数据库通过；现场待验收 |
| `saveDepartment` | `server/src/core/routes/departments.js:33` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `saveHrInfo` | `server/src/core/routes/hr.js:420` | 静态路由匹配；逐项完整验收待补 |
| `saveHrPersonFull` | `server/src/core/routes/hrProfile.js:898` | 静态路由匹配；逐项完整验收待补 |
| `saveHrProfileTemplateDefinition` | `server/src/core/routes/hrProfile.js:394` | 静态路由匹配；逐项完整验收待补 |
| `saveIdentity` | `server/src/core/routes/identities.js:33` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `saveMembershipAssignment` | `server/src/core/routes/hr.js:370` | 静态路由匹配；逐项完整验收待补 |
| `saveMeritListDesignations` | `server/src/modules/scoring/routes/publications.js:833` | 静态路由匹配；逐项完整验收待补 |
| `saveOrgHrProfileTemplateSettings` | `server/src/core/routes/hrProfile.js:460` | 静态路由匹配；逐项完整验收待补 |
| `saveOrganization` | `server/src/core/routes/org.js:57` | 静态路由匹配；逐项完整验收待补 |
| `savePubMeritRule` | `server/src/modules/scoring/routes/publications.js:1766` | 静态路由匹配；逐项完整验收待补 |
| `savePubViewRule` | `server/src/modules/scoring/routes/publications.js:1627` | 静态路由匹配；逐项完整验收待补 |
| `saveRateRule` | `server/src/modules/scoring/routes/rules.js:469` | 静态路由匹配；逐项完整验收待补 |
| `saveResultPublication` | `server/src/modules/scoring/routes/publications.js:741` | 静态路由匹配；逐项完整验收待补 |
| `saveScoreActivity` | `server/src/modules/scoring/routes/activities.js:59` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `saveScoreTemplate` | `server/src/modules/scoring/routes/templates.js:102` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `saveSignature` | `server/src/modules/audit/routes/auditSignature.js:115` | 静态路由匹配；逐项完整验收待补 |
| `saveStamp` | `server/src/modules/audit/routes/auditAdmin.js:467` | 静态路由匹配；逐项完整验收待补 |
| `saveStampGrants` | `server/src/modules/audit/routes/auditAdmin.js:543` | 静态路由匹配；逐项完整验收待补 |
| `saveSystemConfig` | `server/src/core/routes/system.js:76` | 静态路由匹配；逐项完整验收待补 |
| `saveVenue` | `server/src/modules/venue/routes/venueAdmin.js:156` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `saveVenueApprovalFlowMeta` | `server/src/modules/venue/routes/venueApprovalAdmin.js:84` | 静态路由匹配；逐项完整验收待补 |
| `saveVenueBookingPurpose` | `server/src/modules/venue/routes/venueAdmin.js:989` | 静态路由匹配；逐项完整验收待补 |
| `saveVenueBookingWindow` | `server/src/modules/venue/routes/venueAdmin.js:337` | 静态路由匹配；逐项完整验收待补 |
| `saveVerificationPermission` | `server/src/modules/audit/routes/auditAdmin.js:595` | 静态路由匹配；逐项完整验收待补 |
| `saveWorkGroup` | `server/src/core/routes/workGroups.js:41` | 真实路由＋隔离 MySQL 基础用例通过；真实页面参数及现场待补 |
| `setCurrentScoreActivity` | `server/src/modules/scoring/routes/activities.js:200` | 静态路由匹配；逐项完整验收待补 |
| `setDefaultSignature` | `server/src/modules/audit/routes/auditSignature.js:205` | 静态路由匹配；逐项完整验收待补 |
| `submitMeritListDesignations` | `server/src/modules/scoring/routes/publications.js:1393` | 静态路由匹配；逐项完整验收待补 |
| `submitScoreRecord` | `server/src/modules/scoring/routes/scoring.js:884` | 静态路由匹配；逐项完整验收待补 |
| `submitUserHrProfile` | `server/src/core/routes/hrProfile.js:279` | 静态路由匹配；逐项完整验收待补 |
| `toggleActivityPause` | `server/src/modules/scoring/routes/activities.js:287` | 静态路由匹配；逐项完整验收待补 |
| `unbindHrWechat` | `server/src/core/routes/hr.js:762` | 静态路由匹配；逐项完整验收待补 |
| `updateAuditSubmission` | `server/src/modules/audit/routes/auditUser.js:1923` | 静态路由匹配；逐项完整验收待补 |
| `withdrawSubmission` | `server/src/modules/audit/routes/auditUser.js:2587` | 静态路由匹配；逐项完整验收待补 |

## 动态调用展开（2026-09-11）

| 调用方 | 实际接口/分支 | 验证口径 |
| --- | --- | --- |
| messageCenter.loadMore | listNotifications / listTodos | 只读分页；既有消息回归通过，现场待完成 |
| authPersonnelBehavior.runBatchedAuthAction | admin/auth/claims：issue_codes、issue_invites、revoke_codes、revoke_invites；admin/auth/recoveries：issue_codes、revoke_codes | 高影响账号操作；需与专用认证接口一起逐 action 验收，不能归入普通保存已通过 |
| hrInfoBehavior 永久删除 | deletePersonPermanently / deleteHrMembershipPermanently | 已有屏障/组织/幂等回归通过；生产禁止测试删除，不标为现场通过 |
| sharedApi.callCloud | 透传其他 Behavior 的 name/data | 调用点已计入静态清单，不是额外业务接口 |
| scorerTasks.callCloud | getScorerTaskStatus / exportScorerTaskStatus | 查询/导出，不写业务状态 |
| pendingVenueApprovals.submitApproval | approveVenueBookingStep / rejectVenueBookingStep / approveVenueBooking / rejectVenueBooking | venueApprovalEndpointRouting 测试实际页面分流与提交状态复位；不是实际业务审批的数据库闭环 |
| venueBooking.submitApproval | 同上四项 | 同上 |
| venueManage.saveRule | saveVenueOpenRule / saveVenueActivityRule / saveVenueBookingRule / saveVenueApprovalWholeFlow | 新增真实页面→JSON→路由→MySQL 测试通过 |
| venueManage.deleteRule | deleteVenueOpenRule / deleteVenueActivityRule / deleteVenueBookingRule | 新增真实页面→路由→MySQL 删除回读通过 |
| venueManage.submitApprovalAction | 四项场地审批接口 | 既有页面分流测试通过；生产不创建审批事实 |
| messageQueries.load（未发布性能工作） | listNotifications / listTodos | 只读请求合并，未纳入本次发布 |

普通静态清单还需补计 `reactivate*`、`apply*`、`duplicate*` 等命名及认证 action；前缀扫描只是排查起点，不是全量验收完成依据。
