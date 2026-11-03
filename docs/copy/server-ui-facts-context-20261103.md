# 服务端嵌套系统文字进入界面的语境审查

本记录属于前端逻辑设计审查，不是最终用户文案；语言由独立语言 Agent 审定，实施由独立实施 Agent 完成。2026-11-03 按当前源码核实，未进行实体设备验收。

## 边界

姓名、组织名、用户填写的业务标题、意见、驳回原因、自定义字段名和字段值属于业务事实。固定标题、状态说明、字段默认名、格式要求、拼接说明和空值占位属于系统语言，必须由前端共享语料生成。不能因为字段叫 `title`、`description`、`content` 而一概保留，也不能把所有同名字段一概删除。服务端生成的独立文档和外部通知可有独立输出语料，不能成为界面绕过前端语料的理由。

## 待办与通知

`server/src/modules/audit/services/todoService.js` 的四种待办均生成系统 description。`MessageRow.vue`、小程序门户和消息中心直接渲染该值。需要按 sourceType 返回事实并在两端使用同一格式器：

| sourceType | 业务事实 | 系统部分 |
| --- | --- | --- |
| audit_approval | 申请标题、发起人姓名、步骤序号 | 待审批说明、无标题或无姓名占位 |
| venue_approval | 借用标题、场地名、申请人姓名、当前步骤名称或序号 | 借用/申请人/步骤的关系句 |
| scoring_task | 活动名称、未完成任务数 | 待评分数量句 |
| hr_profile_review | 成员姓名 | 资料审核说明 |

`notification.js` 持久化列只有 type/title/description/target，没有独立内容事实；`notificationHelper.js` 和 `notificationOutboxService.js` 只传递拼好的文字。历史通知不得从描述反向拆人名、标题、意见。历史事实不可恢复时，使用类型级本地说明并提供原有详情入口；未知类型不能直接展示旧系统句。

通知类型覆盖 submission_approved/progress/rejected、booking_approved/rejected/cancelled、hr_profile_approved/rejected、hr_profile_migration、score_activity_started/deadline_24h/results_published、calendar_reminder、account_security。其中 hr_profile_migration 一个类型对应多个结果，需结果枚举，不可看标题猜测。account_security 当前生产方为统一账号微信恢复通知，但未来新增安全事件必须增加明确事件事实，不能把所有安全通知都称为微信恢复。

新增事实需经过 Outbox recipient 投影；仅在生产函数传入但 buildRecipient 丢弃，仍然不完整。日程提醒从 calendarReminders 直接 batchCreate，不走 createNotification，也须覆盖。不得为重建文案额外加载未授权详情。

消息所属角色由 organizationMetadata 的 identityType/role/adminLevel/assignmentLabel 在前端展示；assignment 的岗位组合为业务事实，membership 的无岗位与 admin 的管理等级为系统语料。不能继续优先使用 identityName 中已拼好的管理身份默认词。

### 本轮导航边界

本轮不新增尚未移植的网页账号安全页面，也不新接人事通知已读回执链。`messageRoute` 只对现有已支持目标返回可打开；未支持目标使用语言 Agent 批准的详情不可用说明，不产生已读确认，不改变源通知 targetUrl。

事实依据：网页 WorkbenchView 仍是未移植工作台壳，未读取 `section=account`；现有 `/account` 兼容重定向不能作为账号安全详情已实现的证据。评分任务页内有 ScoringPublication，实际页签只有 scoring/results/meritList，但默认 scoring 且不读取路由页签，不能仅跳到任务页就声称已展示公示。新增目的地不能只做路由映射并提前标读，须作为独立业务接入核对成功加载与回执。

## 人事导入

`hrImportV2.details` 把 rowIssue.message 写到人员行 content；分类卡返回 categoryTitle、groupTitle、otherCategories.title；visibleItem 保留 message。原生 `hrImport.js` 使用这些字符串构成卡片与标题。公共 API 过滤顶层 message 无法修复此路径。

已有事实包括 reason/category/field/issueFields/unavailableKind/dictionaryDepartment/before/after/actions。仍缺失：

- 列位置 facts：字段键、1 起始列号或未映射、原表头。
- 每行人员：rowNumber、name；姓名不得由同组第一人代表所有人。
- 缺项：字段键、是否缺少映射列。
- 不合格字段：缺失或超长、允许长度。
- 补充资料要求：type、长度、数值、整数小数、位数和选项事实，不能仅返回 requirements 句。
- 岗位差异：字段键、已有值列表、导入值，不能仅保留 assignmentDifference 句。
- 多行冲突：行号及值或岗位组成事实。
- 空比较值的原因：无岗位、字典尚无选项和实际空值必须区分，不把 copy.noAssignment/noRegisteredValue 混入业务 before 值。

`details(issueId)` 当前只返回 rowNumber/name/content/actions，需传出每一行自身的 reason 与事实；不能拿组级问题说明覆盖逐行差异。操作类型、选中范围和写入规则不因文案调整而改变。语言重写不能改变分组键造成整组拆散；分组最终应基于业务事实而非中文句。

## 验签

网页 AuditVerificationResult 当前按 reasonCode 映射前端 copy.reasons，文件摘要按 copy.fileChecks/simpleResults 生成，步骤标题用 copy.stepTitle，属于正确方向。核验通过才展示的文件名、姓名、组织、岗位及密码事实保留。不能把服务端 reason/message 引回报告。details 的固定字段名单应全部具备本地标签，避免 `copy[key] || key` 将内部英文键显示给用户。

## 系统默认组织

SystemConfigView 的 currentOrganizationLabel 指 config.currentOrganization。原生 settingsBehavior 对应字段已叫 systemDefaultOrganizationId；它是系统默认组织，非当前登录工作角色组织。现网页别名绑定 authorization.currentOrganization 不符合事实，需独立语义引用；组织名称本身仍是业务数据。

## 继续查出的旁路

- 本人资料：home.js 使用 result.statusText，HrProfileView 使用 profileData.statusText/template.modeText；成员详情 HrPersonDetail、hrInfoBehavior 和目录 adminUtils 也用 auditStatusText。已有 auditStatus/editMode 枚举足以本地映射，无须改权限或增加数据库字段。readonly 不允许成员写，audit 写待审资料，direct 写生效资料。驳回原因和模板介绍仍是业务原文。
- 旧权限兼容页 AdminPermissionsView 仍渲染服务端 PERMISSION_GROUPS 的 label/description；只读页仍须按 group.key/permission.key 引用前端语料。旧权限常对应多个新能力，不能按相似名称强行当成一个新能力。管理员身份选项 creatableLevels 只含 admin/super_admin，应按 value 本地映射。
- 通讯录 contactDirectory.js 将无岗位成员的 departmentName/group.name/relatedPositions.label 填成 copy.noPosition。需 hasAssignment 或 group kind 等明确事实，不能比较中文是否等于“暂无岗位”来猜是否有岗位。已有部门名、身份类别名、职能组名和自定义补充资料标签属于业务事实。
- 场地未知 displayStatus 的多处前端回退会展示原枚举；应使用前端未知状态。账号未知 accountStatus 不应默认已认证。AdminAuthView 将 frozen 复用审核 withdrawn 标签，虽然同为语料引用，语义仍错误。
- 场地审批历史 venueUser.js 的 snapshots.stepName、approverName、approverAssignmentLabel 及 applicantAssignmentLabel 混有服务端默认词；应保留缺失事实，交前端按身份类型和快照是否存在显示。myActionLabel 也须按 myAction 枚举本地转换，未知不可默认通过。此项只改变响应与展示，不回写历史姓名或岗位记录。
- unifiedAuth.js 的本人和管理设备响应 deviceLabel=model/platform/系统默认词混合。已有 model/platform/recognized，可在前端生成设备标题与缺失提示；设备事实不能因禁用服务端提示一并丢失。

## 核验说明

以上为源码路径审查，已逐项交给主 Agent、语言 Agent 和实施 Agent；不是已修复清单，也不表示全系统所有嵌套输出均已审完。后续须检查实际 API 结果和两端消费，尤其旧通知与导入展开明细。

## 管理端共享词条的跨场景复核

- `AdminPublicationPanel.vue` 的查看规则和评优指定规则不可共用查看范围选项。`publicationAssignments.matchesMeritClause` 会先按目标身份类别筛选所有模式，再按获权指定人的岗位比较部门或职能组；查看规则仅两种带身份条件的模式筛目标身份。新编辑可以呈现三类等价范围，但编辑旧规则不能仅因打开页面就把合法旧枚举改写。
- 评优候选 `openDesignations` 的前端筛选也必须始终检查目标身份类别，不能只在 `identityScopes` 内检查。此项是候选展示与服务端校验不一致，不是扩大服务端权限。
- `copy_08b30a529d` 在公示面板用于把当前条款应用到所选规则，并非修改身份类别字典；按钮和确认标题都必须使用对应规则的语境。
- `copy_49b5b1ec92` 在两端审核条件编辑器表示 `identity_scope` 条件类型，包含部门、身份类别、职能组。语言审稿已批准该处引用岗位范围条件；内层 `copy_4990ecbcc4` 才是身份类别范围字段。
- 已分别核对 `copy_41e8060a1f` 的资料模板保存、`copy_5a49161fd7` 的评分模板、`copy_31e8aaf67d` 的评优对象身份类别，以及身份字典编辑、描述和空状态；这些调用没有发现跨业务误用。该结论仅针对已检查的引用，不代替全系统验收。

## 文案审计器准确性复核

- `copy-quality-audit.js` 的 R2 尾部标点集合含句号，会把完整提示句误判为碎片。完整句末句号、问号、叹号应合法；独立标点和未闭合开括号仍应检查。
- R8 使用裸 hash 作为跨文件身份。历史 hash 不是全系统语义标识；同情境资源的生成副本必须一致，不同资源经独立语境重写后不要求同文。
- R9 只收集字面量，漏掉 `workspace-hero.copy_0cb5ae8471: common.brandName` 这类有效引用。声明存在与文案值质量应分开判断，并校验引用目标。
- R10 的引用扫描遗漏网页 Vue 文件，同时裸 hash 会掩盖另一资源下的闲置键。未能静态解析的动态引用只能列人工核实，不能据此自动删除。
- 建议测试同时覆盖完整句、碎片标点、合法和失效资源引用、两端副本不一致、不同模块同 hash、网页独有调用。不得用错误的静态命中数要求语言 Agent 删除正常句号或把不同语境强行改成同文。
