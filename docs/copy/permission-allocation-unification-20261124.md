# 权限角色与分配筛选语料

日期：2026-11-24。语言 Agent：`permission_copy`。前端逻辑设计 Agent：`permission_ui_design`。服务端事实由 `allocation_backend` 提供，实施由主 Agent 完成。

## 已确认的场景

- 操作权限与分配权限均进入普通权限角色。`assign:<原操作键>` 允许持有人在获准范围内授予对应的操作权限和分配权限，本人操作业务仍需相应操作权限。删除独立分配资格管理入口及转授开关。
- 分配中的 `subjects` 是角色持有人。角色包含分配权限时，单独显示 `allocationSubjects`，限定持有人可以再授予权限的工作角色。记录、资料项及期限继续限制业务范围。该区域放在持有人之后、数据范围之前。
- 权限来源仍按一条完整授权选用，不跨来源组合范围。来源停用、删除、到期、范围收窄或来源岗位失效会使仅依赖它的后续授权失效。
- 分配列表支持搜索及权限角色、子应用、配置状态、数据范围、允许或禁止、工作角色性质、部门、身份类别、职能组的组合筛选。同一工作角色须同时满足岗位条件。批量选择仅包含当前页中可修改的记录；搜索、筛选或页码变化后清空选择。
- 配置启用不等于每条业务记录均可操作。因此状态字段显示“配置状态”，选项复用 `enabled`、`disabled`，不写“已生效”。

## 本轮新增定稿

以下键均在 `authorization` 下。未特别注明的条目没有变量，均已语言放行。实际界面与引用尚待实施后复核。

| 键 | 定稿 | 场景及变量 |
|---|---|---|
| allocation.filterRole | 权限角色 | 列表筛选 |
| allocation.filterApplication | 所属子应用 | 按原操作所属模块筛选，分配权限归入原模块 |
| allocation.filterState | 配置状态 | 允许/停用配置筛选 |
| allocation.filterScope | 数据范围 | 按实际 policy.scopes 筛选 |
| allocation.filterEffect | 允许或禁止 | allow/deny 筛选 |
| allocation.moreFilters | 更多筛选 | 展开工作角色条件等次级筛选 |
| allocation.fewerFilters | 收起筛选 | 收起次级筛选，不清空选值 |
| allocation.clearFilters | 清空筛选 | 同时清空所有筛选和搜索词 |
| allocation.filterHelp | 各项筛选同时生效。工作角色条件须由同一个工作角色同时满足。 | 组合筛选说明 |
| allocation.batchHelp | 批量选择只包含本页中可以修改的记录。更改搜索、筛选或页码后，需要重新选择。 | 批量区说明，2026-11-25 按最终前端设计改稿 |
| allocation.resultCount(shown, total) | 显示 {shown} 条，共 {total} 条 | shown 为筛选后总数，不是当前分页数；例“显示 3 条，共 18 条” |
| allocation.scopeTypes.organization | 本组织记录 | scope.kind=organization |
| allocation.scopeTypes.self | 本人记录 | scope.kind=self |
| allocation.scopeTypes.records | 指定记录 | scope.kind=records |
| allocation.scopeTypes.assignmentScope | 按工作角色限定 | scope.kind=assignmentScope |
| allocation.scopeTypes.people | 指定人员 | scope.kind=people |
| unified.operationPermission | 操作权限 | 可选分类标记，不替代操作完整名称 |
| unified.allocationPermission | 分配权限 | 可选分类标记，不替代操作完整名称 |
| unified.allocationCapabilityName(permission) | 分配“{permission}”权限 | permission 为原操作完整可见名称；例“分配‘查看成员资料’权限”，引号以运行模板的中文双引号为准 |
| unified.migratedAllocationRoleName(name, index) | {name}（权限分配） / {name}（权限分配 {index}） | name 为旧授权原名；只在与不同职责角色同名时添加；index 从 2 递增且仅重名时显示。例“场地负责人（权限分配 2）”。迁移写入后是角色名称事实，保留用户原名部分 |
| unified.allocationPermissionHelp | 分配权限允许持有人在获准范围内向他人授予对应的操作权限和分配权限。本人使用相应功能仍需操作权限。 | 权限角色编辑说明 |
| unified.allocationSubjectsTitle | 可以向哪些工作角色分配 | 角色持有人的可授予对象区域 |
| unified.allocationSubjectsHelp | 持有这个角色的人，可以在以下工作角色范围内分配权限。数据、资料项和有效期仍受本次授权限制。 | 紧接可授予对象标题，仅含分配权限时显示 |
| unified.allocationSubjectsEmpty | 当前没有可选择的工作角色。请核对筛选条件和你的可分配范围。 | 候选正常加载但当前为空；不得用于接口失败 |

## 本轮改稿及复用

| 键 | 定稿 | 场景 |
|---|---|---|
| allocation.status | 配置状态 | 分配卡片状态 |
| allocation.search | 搜索权限角色、姓名、工作角色、权限或数据范围 | 列表搜索，占位及无障碍名称共用 |
| unified.schemePickHelp | 选择这个角色包含的操作权限和分配权限。保存草稿后，可核对并发布。 | 权限角色编辑 |
| unified.grantSourceInvalid | 对应的分配权限已失效，请选择其他权限来源。 | 原授权来源不能继续用于编辑 |
| unified.delegationSource | 分配权限来源 | 来源摘要 |
| unified.delegationSourceInvalid | 作为来源的分配权限已失效，请重新选择权限来源。 | 依赖来源失效 |
| unified.redelegationOutOfScope | 只能在你获准的工作角色、数据、资料项和有效期范围内分配权限。 | 分配范围越界 |
| unified.redelegationOwnRole | 不能通过分配权限增加自己的权限。 | 自行扩权拒绝 |
| unified.revokeDelegationCascadeNotice | 撤销后，仅依赖这条授权取得的后续权限会一并失效。其他来源授予的权限仍然有效。 | 来源撤销确认 |
| delegationChoiceTitle | 本次使用的分配权限 | 普通分配来源选择 |
| delegationChoiceHelp | 每次分配只能依据一条完整授权。下方列出这条授权允许分配的工作角色、权限和范围。 | 来源选择说明 |
| delegationChoicePlaceholder | 选择权限来源 | 来源选择空值 |
| chooseDelegation | 请先选择本次使用的分配权限来源 | 缺来源校验 |
| changeDelegationTitle | 更换权限来源 | 切换来源确认 |
| emptyAssignableSchemes | 暂无符合这项分配权限的已发布权限角色 | 来源内没有可分配角色 |
| delegationNoLongerAvailable | 这项授权超出你当前可分配的范围，无法修改。请联系权限管理人员。 | 原记录超出当前修改范围 |
| advancedManagementHelp | 单独设置允许或禁止的权限及其适用条件。 | 自定义限制设置入口 |
| schemeCapabilitiesHelp | 选择这个权限角色包含的操作权限和分配权限 | 角色编辑权限区 |
| delegationNotice | 分配权限允许持有人在获准范围内向他人授予对应的操作权限和分配权限。本人使用相应功能仍需操作权限。 | 只用于新分配权限说明，不保留旧独立资格入口 |
| recordsSummaryHelp | 这些记录由所选分配权限限定，本次分配不能更换。这里仅显示记录类型和数量。 | 来源记录范围只读摘要 |

`allocation.all`、`allocation.noMatches`、`allocation.empty`、`enabled`、`disabled`、`nature`、`department`、`identityCategory`、`workGroup`、`allow`、`deny`、`subjects` 以及现有角色、预览、历史、分页和批量按钮已审阅，语义适用，保持原文。

## 结构限制和待核验

- 操作与分配能力继续使用现有完整权限卡片，不新增只有“使用/分配”而没有对象名称的手机控件。已选清单及发布预览必须显示同一完整名称。
- 列表不再使用 `specified/conditional/relationship/historical` 这组技术分类按钮。历史对象无法查到时仍复用准确的未知对象提示，不将其猜测为管理员。
- 范围筛选机器值已与 `authorizationPolicy.normalizeScope` 和当前目录核对，只有 `organization/records/self/assignmentScope/people`。无效空值及未知历史值不能当成本组织记录，应显示现有失效引用提示。多范围记录只要包含所选范围即可匹配。
- `unified.allowRedelegation`、旧独立资格按钮与旧委托编辑字段保留源键只为兼容，禁止接回本轮新界面。
- 本记录只确认语言及使用条件，不代表真实浏览器、微信编译、实体手机与 Pad 已验证。新增后台错误及子应用设置场景收到后另行逐项补稿。

## 2026-11-25 最终语言复核

语言 Agent `permission_copy_v2` 根据 `permission_ui_design` 的最终交互及 `allocation_backend` 的行为说明，复核两端页面实际引用并补充放行如下稿件。实施后仍需主 Agent 执行共享副本生成及实际界面验证。

| 键 | 定稿 | 使用条件 |
|---|---|---|
| selectShown | 全选本页 | 仅选择当前页可见且可修改的记录；不得用于跨页全选 |
| unified.customAllowPickHelp | 选择要允许的操作权限和分配权限，再设置适用范围。 | 允许规则可同时包含操作与分配权限 |
| unified.customDenyPickHelp | 选择要禁止的操作权限和分配权限，再设置限制范围。 | 禁止规则可同时包含操作与分配权限 |
| unified.grantPreviewOperations / capabilities | 涉及的权限 | 权限摘要中包含操作与分配权限 |
| allowCapabilitiesTitle | 允许的权限 | 允许规则编辑标题 |
| allowCapabilitiesHelp | 选择要授予的操作权限和分配权限，再在下方设置适用范围。 | 允许规则编辑说明 |
| denyCapabilitiesTitle | 禁止的权限 | 禁止规则编辑标题 |
| denyCapabilitiesHelp | 限制所选对象的操作权限或分配权限，即使其他规则允许也仍受限制。超级管理员保留的权限不受普通禁止规则影响。 | 统一中心管理权限限制，不用于普通成员业务关系 |
| systemControlledHelp | 这些选项仅用于解释旧授权，不再用于新增分配。分配权限请在权限角色中设置。 | 历史系统控制能力的只读解释，禁止暗示分配资格仍需独立设置 |
| tabHelp.schemes | 选择权限角色，查看或修改其中的权限 | 角色列表说明 |
| delegationCapabilitiesSummary | 可分配的权限 | 来源摘要，可能同时包含操作与分配权限 |
| identityCapabilitiesHelp | 展开查看这个权限角色包含的权限 | 角色权限摘要 |
| scopeHelp | 此处决定上方权限适用于哪些记录，不会增加新的权限。 | 普通分配数据范围说明 |
| schemeTaskHelp | 选择操作权限和分配权限并保存草稿，发布后即可用于分配。 | 角色编辑页面说明 |

以下 13 项业务与管理共用的键在统一中心仅表达管理端操作。`capabilityNames` 为完整名称，`capabilityDisplayNames` 为列表名称；分配名称由已批准的 `allocationCapabilityName` 包含该完整列表名称。普通成员的评分、申请、本人资料等使用条件由子应用判断，不使用这些管理名称。

| 能力键 | capabilityNames | capabilityDisplayNames |
|---|---|---|
| audit.submissions.read | 在管理端查看审核申请 | 查看 · 审核申请（管理端） |
| venue.resources.read | 在管理端查看场地与占用规则 | 查看 · 场地与占用规则（管理端） |
| venue.approvalHistory.read | 在管理端查看本人场地审批历史 | 查看 · 本人场地审批历史（管理端） |
| venue.bookings.read | 在管理端查看场地借用 | 查看 · 场地借用（管理端） |
| venue.bookings.create | 在管理端新增场地借用 | 新增 · 场地借用（管理端） |
| venue.bookings.approve | 在管理端审批场地借用 | 审批 · 场地借用（管理端） |
| venue.bookingParticipants.read | 在管理端查看借用参会名单 | 查看 · 借用参会名单（管理端） |
| venue.bookingParticipants.update | 在管理端修改借用参会名单 | 修改 · 借用参会名单（管理端） |
| venue.purposes.read | 在管理端查看借用事由 | 查看 · 借用事由（管理端） |
| calendar.events.read | 在管理端查看日程 | 查看 · 日程（管理端） |
| calendar.events.create | 在管理端新增日程 | 新增 · 日程（管理端） |
| calendar.events.update | 在管理端修改日程 | 修改 · 日程（管理端） |
| calendar.events.cancel | 在管理端取消日程 | 取消 · 日程（管理端） |

旧 `deleteDelegationNotice` 仅用于非统一授权兼容路径，后端确认该路径删除来源不追踪已有规则，故保留原稿。统一路径继续使用已批准的 `unified.revokeDelegationCascadeNotice`，说明依赖该来源的后续权限会失效。

保留源文件里的基础角色及独立资格旧键仅为历史和旧客户端兼容；新版权限中心不得引用这些入口。源码引用复核未见新版页面中的转授开关和基础角色显示区域，独立资格编辑分支仅保留兼容调用。实体手机、Pad 和最终 Chrome 截图未由语言 Agent 实际检查，不能标为现场通过。

## 禁止分配权限的对象范围补审

独立审查发现，禁止规则中的 `allocationSubjects` 也必须原样展示和编辑，不能在打开或保存时无提示删除。主 Agent 提供实际场景：选择对象时仅对这些可授对象限制分配；不选时对所有可授对象限制分配，记录、资料项与期限仍按规则限制。语言 Agent `permission_copy_v2` 放行以下两个完整定稿，无变量。

| 键 | 定稿 | 使用条件 |
|---|---|---|
| unified.allocationDenySubjectsTitle | 禁止向哪些工作角色分配 | effect=deny 且包含分配权限时的可授对象区域标题 |
| unified.allocationDenySubjectsHelp | 这条规则禁止向以下工作角色分配所选权限。未选择时，适用于所有可分配对象。涉及的数据、资料项和有效期仍按这条规则设置。 | 紧接标题，说明空值与选值的不同；空选择保存时应省略 allocationSubjects，不得写为无效空数组 |

允许规则继续使用既有 `allocationSubjectsTitle`、`allocationSubjectsHelp`，且必须选择有效对象范围。以上是语料及语义放行，不代表两端保存回读、浏览器或微信实际界面已验证。
