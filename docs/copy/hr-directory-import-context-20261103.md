# 人事、通讯录与表格导入导出：前端写作语境

本稿是前端逻辑 Agent 的静态阅读记录，日期 2026-11-03，不含批准的用户最终语料。范围较大，以下按实际功能边界分开，不能把改完某个共享文件视为所有入口完成。

## 文件与功能归属

| 功能 | 小程序事实入口 | 网页事实入口 | 唯一源语料 |
| --- | --- | --- | --- |
| 本人资料 | workspace/pages/home/home.js 与模板 | views/hr/HrProfileView.vue | home.js、hrTemplateFieldDisplay.js |
| 人事管理、岗位、资料模板 | scoring/pages/admin/modules/hrInfoBehavior.js 与 admin 模板 | views/admin/AdminConsoleView.vue、components/HrPersonDetail.vue、HrAssignmentEditor.vue、AdminHrTemplatePanel.vue | adminPersonnel.js、hrTemplateSave.js、generated/subpackages/scoring/pages/admin/admin.js、modules/hrInfoBehavior.js |
| 账号治理 | scoring/pages/admin/modules/authPersonnelBehavior.js；hrInfoBehavior.js 的解绑与目录 | components/HrAccountGovernance.vue、HrAuthenticationPolicy.vue | adminGovernance.js、generated/.../authPersonnelBehavior.js 与 admin.js |
| 通讯录 | components/contact-directory/contact-directory.js 与模板；管理入口需沿 admin 引用核对 | components/ContactDirectory.vue、ContactDirectoryAdmin.vue | contactDirectory.js；shared/contactDirectoryView.js 为两端展示计算 |
| 表格导入 | scoring/pages/hrImport/hrImport.js 与模板、admin/components/hrImportIssueList | 搜索 web/src 未发现 previewHrImport/importHrTable/exportHrAssignmentTable 的对应新版流程 | hrImport.js；后端 core/models/hrImportV2.js、services/hrImportPlan.js、hrImportPresentation.js 消费同源 |
| 资料迁移 | scoring/pages/admin/modules/hrProfileMigrationBehavior.js | components/HrProfileMigrationPanel.vue | hrProfileMigration.js |

上述 package-resources 与前端 locale 目录属于生成副本，不能在那里独立写作。网页当前缺失的新版表格流程不能借此次改写假称已同步；旧 admin/hrInfoBehavior 中的导入入口也须单列核对可达性，不能凭名称视为已替换。

## 普通用户资料与通讯录

本人资料的基础身份与岗位由管理员维护，补充资料依模板分别只读、直接保存或提交审核。生效资料、待审核资料和驳回原因是不同状态；不得用一个保存成功提示暗示审核已通过。日期与日期时间分别按类型格式化。

通讯录首屏 `getContactDirectory({summaryOnly:true})` 只读姓名与可见岗位基础信息；点击卡片再以 key 读取详情。搜索只匹配当前已授权列表中的姓名、部门、身份类别、职能组，不查补充字段。因此输入框不能声称支持手机号或全部资料搜索。每个卡片对应可见岗位，同一个人可有多张岗位卡；人数和岗位数不得混为一项。

详情中电话图标仅在已授权字段被识别为电话时出现；复制单字段与复制当前联系人可见资料是两个动作。复制不会取得未授权信息。其他可见岗位来自服务端关联，不是同名合并，不提示未授权岗位的数量或存在。权限变化后详情可能不可读；失败消息应引导回列表刷新，不能说明被删除，除非服务端确认。

网页 copyValue 捕获剪贴板失败后目前把 detailNotice 置为 operationFailed，模板据此隐藏详细字段。这把“复制失败”与“详情无法读取”混用了，建议拆分局部复制反馈与读取错误；语言不能让用户重读整份详情来解决剪贴板权限。

## 通讯录规则的两类人群

每条规则的 audience 是获得查看资格的人群，targets 是他们可查看的人群，fieldIds 是额外可见的补充字段。targets 的 self 指每名查看者本人；sameDepartment/sameIdentity/sameWorkGroup 指查看者当前岗位，与编辑规则的管理员无关。

规则条件组之间为任意一组，组内不同维度须在一个岗位同时满足，同一维度多个选项为任一个。管理配置权限不赠送资料查看权。复制按钮只是将规则载入编辑副本并删除 id/version，直到保存才创建；停用不是删除，删除前需列明确切名称和数量。无补充字段授权仍可显示该范围内岗位基础信息，不能描述为没有权限。

结构问题：shared/contactDirectoryView.ruleSummary 使用斜杠连接不同维度、分号连接条件组，信息较复杂时难辨 AND/OR。语言 Agent 可要求改为有层次的条件组摘要，不要为了短句扭曲逻辑。任何调整保持同一范围解释器和服务端裁剪规则，不扩大通讯录授权。

## 成员管理与账号治理必须区分的事实

- 当前组织成员关系、一个或多个岗位、全局自然人、全局账号是四层对象。deleteHr 调 deleteHrInfo 的用户动作是离开组织，不是永久删除自然人；永久删除另有预检与阻断引用明细。不能因内部函数叫 delete 就写成删人。
- 删除岗位只针对岗位，撤销管理身份只针对管理授权。已有历史记录不因界面移除消失。身份类别与授权身份不是同一字段，岗位性质亦不可写死为三种。
- 已离开成员的资料只读；重新加入不会自动恢复全部旧岗位。冻结全局账号、解除微信绑定、设置/撤销口令、生成/撤销恢复码不能称为修改当前部门资料。
- HrAccountGovernance 的读取、认证、恢复、全局治理分权，按钮还依每名成员的 canVerifyIdentity/canRecoverAccount/canGlobalAccountManage。没有某个按钮不代表该账号不存在。状态读取失败为未知，不能默认未认证。
- 网页 verification 明确提交 expiresInHours:24，但后端支持 1—168 小时、默认48；通用登录页面不能保证所有验证码都24小时。生成凭据成功的已显示值与关闭面板分开，关闭不意味着已保存到文件。
- 网页多个危险动作确认正文只提供姓名或通用提示；语言 Agent 如认为无法区分影响整个账号还是本组织，应要求实施增加当前动作的范围摘要，不能仅换更长的按钮。

## 表格导入：阶段、粒度、结果

| 阶段 | 真实状态 | 文案应描述的对象与下一步 |
| --- | --- | --- |
| 选择与列对应 | 文件尚未写入人事数据；列映射姓名、学号、岗位各属性、补充字段 | 区分原表列、系统资料项；显示哪列映射到哪项，不把忽略列写成删除资料 |
| 检查 | 服务端生成预览与待处理问题 | 正在检查，不等于正在导入；未通过只改预览决策 |
| 同类问题聚合 | 相同问题值可归组，组内多个原表行与多名自然人 | 组标题以字段/问题为主体，不用第一个人的名字；行号、姓名、字段、原值/导入值在明细中完整展示 |
| 组/部分行处理 | 整组、勾选行、单行三种粒度 | 明确本次影响哪些人和行；全选与反选须覆盖该组尚未加载的所有行 |
| 修改/确认/排除 | 修改行内容、采用系统原值、采用导入值、确认创建、排除行是不同决策 | 创建分类不能代替纠正错字；排除行会排除该行全部岗位/资料修改，不只是当前问题 |
| 预览确认 | 决策重新计算后进入本次变更 | 可见新增、修改、清空、排除；空白默认保留原值，删表格行不删岗位 |
| 正式执行 | importHrTable 带 previewId 和稳定 requestId，事务复核并写入 | 没收到结果不等于没写；查询原执行结果，不新建另一请求重复执行 |
| 已成功 | hrImportV2.execute 先 persistPlan，再事务内 loadContext 回读，保存 result_json | 成功成立；给用户结果与数量即可，不需要内部回读术语 |
| 过期/并发更新 | import_stale/proble​ms/expired/permission_denied 退回预览 | 全批未按旧预览继续写；需要重新核对；不要暗示重开页面一定解决权限问题 |
| 导出 | 岗位维护表或问题表生成，再进入统一文件输出 | 生成表格不等于已保存到手机；输出失败与数据检查失败分开 |

语言源中的 headerAliases 是表格兼容别名，不是面向用户的新标题，禁止当普通句子重写造成旧表失配。assignmentId、assignmentVersion 是维护表识别字段，名称变化要审查读写双方兼容。`invalidNature` 仍写死三项的现有说法须与岗位性质字典判定核对，不能照旧保留固定列表。服务端创建分类必须依部门限定职能组，同名跨部门不关联；对应提示不能凭另一部门同名记录判本行部门错误。

## 尚须逐项阅读后才能批准的区域

已追加核对：网页 `AdminHrTemplatePanel.appendSheet` 只把表头作为文本字段，可替换或追加模板字段，不导入任何成员资料。模板切换对旧字段值采用 hide/map/delete；跨组织个人补充资料迁移采用 copy/skip，并为冲突选择 keep/overwrite，两类操作不能共用含糊的迁移说明。小程序 `confirmHrProfileExport` 从当前筛选结果取勾选列，经 buildTableFile 后进入 saveAndShareFile，生成结果与设备保存结果分开。

`HrProfileMigrationPanel` 的目标为当前组织，来源组织单独选择；检查返回 token 与阻断项后，按权限直接执行或提交审批。网页提交确认目前只列人数名单，应补来源/目标摘要。语料 `reportIntro` 承诺可忽略不兼容继续，但当前网页不提供该操作且 blockers 阻止提交；需按实际入口分别指导，不能让语言推荐一个不存在的按钮。

大体量 hrInfoBehavior 包含模板字段约束、审核、导出列选项、资料迁移和删除预检，当前只定位及核对了主要边界。语言 Agent 对其中每个键仍需登记触发入口；不能把这份语境文档当作全部键已审。hrProfileMigration 的映射、隐藏、永久删除值须单独读保存链后批准。管理员批量凭据操作、冻结等须逐按钮核对确认对象及数量。

专项验收必须覆盖无权限、空范围、同人多岗位、同名不同人、复制失败后详情仍可读；导入覆盖组、部分行、整组未加载行、取消、重复提交结果查询、真实保存回读和导出取消。此文档未执行设备现场验证或生产写入。
