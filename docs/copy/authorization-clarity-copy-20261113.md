# 权限页面情境语料定稿

2026-11-13，独立语言 Agent。按用户最新决定，功能权限集合统一称“权限角色”；不改人事身份类别、管理身份或账号身份认证。下面逐键批准，实施 Agent 接入；本文件不授权批量字符串替换。

## 查询先明确所看范围

默认展示有有效允许规则或禁止规则的功能；搜索只过滤所选范围，不能因输入关键词暗中改为全部功能。超级管理员另按真实状态展示。无显式授权不等于具体业务一定不能办理，不用“不可执行”替代事实。

| 新键 | 定稿 | 触发/位置 |
|---|---|---|
| effectiveAssigned | 已设置权限 | 默认范围；含允许和禁止设置 |
| effectiveAll | 全部功能 | 全能力目录 |
| effectiveUnassigned | 未设置权限 | 无有效显式规则 |
| effectiveAssignedHelp | 显示为所选工作角色设置了允许或禁止规则的功能 | 默认范围说明 |
| effectiveAllHelp | 显示全部功能，包括尚未为所选工作角色设置权限的功能 | 全集说明 |
| effectiveUnassignedHelp | 显示尚未为所选工作角色设置允许或禁止规则的功能 | 未设置范围说明 |
| permissionAllowed | 已授予 | 有有效allow且无相关deny |
| permissionRestricted | 已授予，有限制 | allow与部分deny并存 |
| permissionDenied | 已禁止 | 整项明确deny |
| permissionNotAssigned | 未单独授权 | 无有效显式规则；不得当无业务资格 |
| permissionSuperAdmin | 超级管理员权限 | 明确super_admin |
| permissionRuleDetails | 查看授权范围 | 打开具体规则/记录/字段/期限 |
| noMatchingPermissions | 当前范围内没有匹配的功能 | 搜索空态 |
| noConfiguredPermissions | 尚未为所选工作角色设置权限 | 默认显式规则集合为空 |
| dynamicAssignments | 按条件分配的权限 | 分配列表独立折叠组 |
| roleGrantCount(count) | {count} 项授权 | count为当前一级工作角色的授权条目数；例3项授权 |

删除查询界面对 businessCheckRequired、reasons.scope_and_business_check_required、reasons.business_relationship_required 的通用解释渲染；不写新空话替代。状态需要后端事实与规则方向判断，不允许按旧 conditional 字段直接套“已授予”。对于仅依赖业务关系而无规则的功能，使用 permissionNotAssigned，实际业务页面保留业务操作判断。已禁止、部分限制、普通允许须分别列出对应规则的实际范围。

## 权限角色逐键定稿

以下键均位于 authorization.js，除明确列出新增函数外保持原参数。

| 键 | 定稿 | 情境 |
|---|---|---|
| schemes | 权限角色 | 页签 |
| tabHelp.schemes | 选择权限角色，查看或修改其中的功能权限 | 角色列表 |
| tabHelp.rules | 选择工作角色，为其分配权限角色 | 分配列表 |
| rulesTaskHelp | 选择工作角色，为其分配权限角色 | 受限分配列表 |
| tabHelp.effective | 查看所选工作角色的权限设置 | 查询页；细分范围由上表说明 |
| schemeLifecycleHelp | 保存草稿不会改变现有权限。发布后，已分配这个权限角色的工作角色会同步使用新权限。 | 发布影响说明保留完整句 |
| changeDelegationNotice | 更换后，已选对象、权限角色和范围将重新设置，尚未保存的修改不会保留。 | 更换确认 |
| emptyAssignableSchemes | 暂无符合这项分配资格的已发布权限角色 | 受限可选角色为空 |
| firstUse | 请先新建并发布权限角色，再进行分配 | 无可用角色且可维护 |
| searchIdentities | 搜索权限角色 | 搜索框 |
| simpleSettings | 返回角色分配 | 简单模式按钮 |
| stepIdentity | 2. 选择权限角色 | 分配第二步 |
| chooseIdentity | 请选择已发布的权限角色 | 校验 |
| identityPlaceholder | 选择权限角色 | 选择框 |
| identityExplanation | 分配权限角色不会改变人员的岗位或人事身份类别 | 必要区别，非页首常驻作文 |
| createScheme | 新建权限角色 | 按钮 |
| publish | 发布角色 | 按钮 |
| schemeName | 角色名称 | 字段 |
| publishSchemeNotice | 发布后，已分配这个权限角色的工作角色会同步使用新权限。 | 确认 |
| schemeCapabilitiesTitle | 角色包含的权限 | 编辑区域 |
| schemeCapabilitiesHelp | 选择这个权限角色包含的功能权限 | 编辑指引 |
| identityCapabilitiesTitle | 所选角色包含的权限 | 分配折叠 |
| identityCapabilitiesHelp | 展开查看这个权限角色包含的功能权限 | 折叠操作指引 |
| createSchemeTitle | 新建权限角色 | 页面 |
| editSchemeTitle | 编辑权限角色 | 页面 |
| ruleTaskHelp | 先选择接收权限的岗位或管理身份，再选择权限角色和记录范围 | 编辑指引 |
| identitySettingsEntry | 管理权限角色 | 按钮 |
| noSchemes | 暂无已发布的权限角色 | 空态 |
| publishing | 正在发布角色 | 加载 |
| search | 搜索姓名、岗位或权限角色 | 搜索框 |
| useScheme | 选择权限角色 | 按钮 |
| publishedSuccess | 角色发布成功 | 成功 |
| resources.authorization.schemes | 权限角色 | 资源映射实际键为authorization.schemes |
| unpublishedScheme | 这个权限角色尚未发布，请先发布或选择其他角色 | 校验 |
| configurationCopy.schemeNotice | 请核对复制后的功能权限，再发布并分配这个权限角色。 | 复制结果下一步 |
| configurationCopy.capabilities | 角色包含的功能权限 | 复制摘要 |

fieldLabels.assignedIdentities 仍表示印章授权的人事身份类别，不得改成权限角色。identity.cards、hr.identities、管理身份等其他同字业务名称保持原义。responseMessages内引用 authorization.unpublishedScheme 的条目继承共享源，不手写另一份。

## 具体审批申请

Web AuditSubmissionView.vue 具体申请的 approverDesc 与 ApprovalConditions 条件解释移除。小程序 submissionDetail.wxml 的当前审批、下一步及流程节点条件组解释移除。用户当前任务是处理这份申请，不需要阅读成为审批人的配置条件。模板配置、自由创建/编辑步骤的指定人和指定岗位选择仍保留 auditConditions 语料；不删共享组件或以空字符串破坏配置页。

## 放行边界

上表语料可实施。查询范围与状态按已核实事实接入后还需独立查看实际界面；不把这些文案当作变更授权算法的许可。全局短文案句号逐项审核另见配套清单。

## 查询最终结构补正（覆盖首节）

主 Agent 最终确认只有两个范围，默认 grantState=granted；全部范围呈现各状态。依据字段为 grantState、grantBasis、hasRestrictions，不依旧 conditional 推断。

| 键 | 最终定稿 | 条件 |
|---|---|---|
| effectiveAssigned | 已授权 | 默认，仅granted |
| effectiveAll | 全部权限 | 全部状态 |
| effectiveAssignedHelp | 显示已授予所选工作角色的权限 | 默认范围 |
| effectiveAllHelp | 显示全部权限及所选工作角色的授权状态 | 全部范围 |
| permissionAllowed | 已授权 | granted、无局部限制、非super |
| permissionRestricted | 已授权，有限制 | granted且hasRestrictions |
| permissionDenied | 已禁止 | blocked |
| permissionNotAssigned | 未单独授权 | not_granted，不否定业务关系资格 |
| permissionSuperAdmin | 超级管理员权限 | grantBasis=super_admin |
| permissionUnavailable | 暂时无法确认 | unavailable |
| noConfiguredPermissions | 暂无已授予所选工作角色的权限 | 默认集合为空 |

effectiveUnassigned 与 effectiveUnassignedHelp 不接界面，不新增第三筛选。搜索只过滤当前范围。原首节的“已设置权限”定义及包含禁止的默认范围已撤回，以此节为准。具体申请审批条件解释纯删除已向设计 Agent 放行。

## 实施补充批准

- noDirectGrants：“暂无直接分配的权限，按条件分配的权限见下方”。动态授权已改同页，不再指引切换列表。
- effectiveHelp：“这里查询的是工作角色的授权配置，不是某条申请或记录能否操作的结果。”本人/他人查询在范围切换处仅显示一次，不逐项重复。
- 角色外卡功能数量允许复用 effectiveCount(count)，相邻角色标题确定对象。

## 具体审批申请截图复核

已查看 web/test-results-audit-clarity/audit-application-detail-r-90769-late-condition-explanations-phone/audit-detail-without-conditions.png。当前审批直接显示意见与通过/驳回操作，历史保留步骤及处理记录，未出现成为审批人的条件组解释。此具体场景独立语言放行；模板配置保留由设计另行验证。截图中的驳回短提示标点由全局批准稿实施，不因本次纯删除扩大修改。

查询未知状态补充：默认已授权集合为空但存在 grantState=unavailable 时，优先显示 permissionUnavailable，不使用“暂无已授予”的空态，不把未知当成未授权。

空态补充：noDirectGrants 的“见下方”仅在同页确有动态条件授权组时使用。没有直接授权且没有动态授权时用新增 noAssignments：“暂无已分配的权限”。该键已批准，避免指引不存在的内容。

源码清理批准：实施后检索显示 businessCheckRequired、reasons.scope_and_business_check_required、reasons.business_relationship_required 仅剩语料定义与生成副本，不再有产品调用。批准删除这3个无效文案键，随后重新生成副本；内部 reason 枚举不重命名，不用空字符串保留旧解释。

## 最终权限语言复核放行

已查看 authorization-clarity-hierarchy-final 下手机尺寸的 allocation-dynamic、inspection-states，以及 authorization-clarity-role-visible 下 allocation-role-expanded。一级为工作角色完整标签、姓名为副标题，展开后权限角色逐项折叠；动态条件独立可见。查询只有已授权/全部权限两范围，允许、局部限制、禁止、未单独授权与不可确认状态按事实分别展示，不再逐项使用业务办理空话。权限页面本轮独立语言复核放行。

此结论覆盖双端模板引用与上述浏览器截图，不代替微信原生及实体设备验收。全局标点282项以配套清单逐值核对结果另行记录。
