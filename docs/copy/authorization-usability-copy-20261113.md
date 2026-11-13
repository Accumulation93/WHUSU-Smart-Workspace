# 权限页面易用性语料定稿

2026-11-13；独立语言 Agent 撰写。依据前端设计 Agent 核实的三类任务与委托管理区域。以下键属于 authorization；只批准表内定稿，不授权实施者自行补写。短标签不加句号，说明句保留标点。运行语料仍仅在 shared/locales/zh-CN/authorization.js。

## 称谓与结构

scheme 对应一种授权身份，其包含可复用的功能权限，不包含人员或记录范围；按用户已确认的业务名称采用“授权身份”；人事“身份类别”与当前“工作角色”保留原义。分配页同时支持岗位、管理身份、自选权限和禁止规则，页签不能窄化为“给岗位分配身份”。委托界面必须分别显示负责分配的工作角色与可获授权的对象。普通岗位仅在服务端授予有效分配资格时有写入口。

## 逐键定稿

下列无变量条目均批准实施，但与普通岗位委托有关的条目须在服务端支持、设计确认后接入。

| 键 | 定稿 | 场景 |
|---|---|---|
| rules | 分配权限 | 主任务 |
| schemes | 授权身份 | 主任务 |
| effective | 查询权限 | 主任务 |
| tabHelp.rules | 为岗位或管理员设置权限，并选择适用的记录范围。 | 分配页说明 |
| tabHelp.schemes | 设置“场地负责人”等授权身份，分配时即可使用其中的权限。 | 身份列表 |
| tabHelp.effective | 查看某个工作角色的权限、适用范围和授权来源。 | 查询页 |
| firstUse | 先新建授权身份并发布，再选择岗位或管理员进行分配。 | 具有身份维护权的首次使用者 |
| createScheme | 新建授权身份 | 列表按钮 |
| createRule | 分配权限 | 新增规则 |
| searchIdentities | 搜索授权身份 | 身份搜索 |
| identityExample | 例如：场地负责人 | 身份名称示例 |
| stepPeople | 1. 选择岗位或管理员 | 分配第一步 |
| stepIdentity | 2. 选择授权身份 | 分配第二步 |
| stepScope | 3. 选择记录范围 | 分配第三步 |
| chooseIdentity | 请选择已发布的授权身份。 | 选择校验 |
| identityPlaceholder | 选择授权身份 | 选择框 |
| identityExplanation | 授权身份只包含功能权限，不会改变人员的岗位或身份类别。 | 身份选择说明 |
| useScheme | 选择授权身份 | 编辑方式 |
| advancedRules | 按授权规则查看 | 列表视图切换 |
| byRecipient | 按获授权岗位查看 | 新键；直接岗位授权列表 |
| advancedSettings | 自定义权限与条件 | 编辑切换 |
| simpleSettings | 返回身份分配 | 编辑切换 |
| simpleUnavailable | 这项授权包含自定义条件，请在“自定义权限与条件”中修改。 | 复杂规则 |
| noDirectGrants | 暂无直接分配的权限。按部门等条件分配的权限，请切换到“按授权规则查看”。 | 直接授权列表空态 |
| createSchemeTitle | 新建授权身份 | 身份编辑 |
| editSchemeTitle | 编辑授权身份 | 身份编辑 |
| schemeName | 身份名称 | 新键；替代泛称名称 |
| ruleName | 授权名称 | 新键；规则编辑 |
| delegationName | 分配资格名称 | 新键；委托编辑 |
| schemeCapabilitiesTitle | 身份包含的权限 | 身份能力区 |
| schemeCapabilitiesHelp | 选择这个身份包含的功能权限。发布后才能用于分配。 | 身份能力区 |
| identityCapabilitiesTitle | 所选身份包含的权限 | 分配能力区 |
| identityCapabilitiesHelp | 这些权限由身份统一维护。如需单独设置，请选择“自定义权限与条件”。 | 分配能力区 |
| schemeTaskHelp | 选择功能权限并保存草稿，发布后即可用于分配。 | 身份编辑 |
| publish | 发布身份 | 按钮 |
| publishing | 正在发布身份 | 加载 |
| publishedSuccess | 身份发布成功 | 成功提示 |
| publishSchemeNotice | 发布后，已使用这个授权身份的授权会同步更新。 | 发布确认 |
| noSchemes | 暂无已发布的授权身份。 | 无可选组合，不向无权用户指示新建 |
| identitySettingsEntry | 管理授权身份 | 仅有维护权显示 |
| createRuleTitle | 分配权限 | 规则新增 |
| ruleTaskHelp | 先选择岗位或管理员，再选择权限和记录范围。 | 编辑说明 |
| selectRecipientAssignment | 选择获授权岗位 | 新键；编辑对象按钮 |
| selectRecipientAdmin | 选择获授权管理员 | 新键；编辑对象按钮 |
| delegations | 分配资格 | 委托管理区域 |
| createDelegation | 添加分配资格 | 委托新增 |
| delegateRecipients | 负责分配的工作角色 | 委托第一个人群 |
| delegationSubjects | 可获授权的岗位或管理员 | 委托第二个人群 |
| delegationCapabilities | 可分配的功能权限 | 委托上限 |
| delegationScopeTitle | 可分配权限的记录范围 | 委托记录范围 |
| delegationScopeHelp | 该工作角色分配的权限只能用于这些记录。 | 委托说明 |
| delegationFieldsTitle | 可分配权限的资料项 | 委托字段 |
| delegationFieldsHelp | 该工作角色只能分配这些资料项的权限。 | 委托说明 |
| createDelegationTitle | 添加分配资格 | 委托编辑 |
| editDelegationTitle | 修改分配资格 | 委托编辑 |
| delegationTaskHelp | 选择负责分配的工作角色，再限定其可授权的对象、权限和范围。 | 委托编辑 |
| delegationNotice | 分配资格只允许该工作角色向他人分配权限，不会让其本人获得这些功能的使用权限。 | 委托说明 |
| deleteDelegationNotice | 撤销后，该工作角色不能再按这项设置分配权限；此前已分配的权限仍然有效。 | 撤销确认 |
| delegationWillBeRemoved | 将撤销这项分配资格 | 撤销确认标题 |
| allocationUnavailable | 当前工作角色没有分配权限。 | 新键；已确定无写资格的只读状态 |
| effectiveHelp | 查询结果针对所选工作角色。处理具体业务时，还需符合指定审批人等要求。 | 新键；结果说明 |

## 动态条目与边界

| 键 | 定稿 | 变量与示例 | 放行 |
|---|---|---|---|
| identityGrantName(name) | {name}权限分配 | name 为身份业务名称；“场地负责人权限分配” | 批准 |

保留已有 allow/deny、allowCapabilitiesTitle、denyCapabilitiesTitle、scopes、fields、withinGroup、betweenGroups 等方向明确的标签，不用“可以做什么”替换。不得把未选权限解释为禁止。查询按钮 inspectAssignment/inspectAdmin 仅用于查询，编辑按钮使用新键。

## 复核状态

本稿完成语言定稿；普通岗位委托条目按上述业务条件放行。尚未核对实施后的两端实际界面，不能宣称视觉及现场验证通过。实现后须逐一核对标题与其下控件、无身份状态、无分配权状态、身份发布、撤销分配资格、条件授权列表及查询结果。


## 设计复核后补充批准（2026-11-13）

此表覆盖前表同名键。设计已确认接收者列表同时包含岗位和管理身份，因此不能称为岗位列表。复杂动态委托保留原条件编辑；不得因增加显式选择按钮清空或改写动态条件。

| 键 | 定稿 | 使用条件 |
|---|---|---|
| byRecipient | 按获授权角色查看 | 岗位与管理身份的直接授权列表 |
| selectDelegateAssignment | 选择负责分配的岗位 | 委托负责人显式选择 |
| selectDelegateAdmin | 选择负责分配的管理员 | 委托负责人显式选择 |
| advancedManagement | 其他权限设置 | 自定义规则与委托区域 |
| advancedManagementHelp | 单独设置允许或禁止的权限，或管理权限分配资格。 | 两类入口均可见 |
| advancedRulesHelp | 单独选择允许或禁止的权限，并设置适用条件。 | 无委托管理入口 |
| createCustomRule | 自定义授权 | 自定义规则入口 |

以上七键已由语言 Agent 批准，实施 Agent 按定稿接入共享源。语言 Agent 不修改运行代码。实际截图复核待实施完成。

## 实施后独立语言复核

已核对共享源、两端首页与编辑模板，以及手机尺寸的 authorization-simple-editor.png、平板尺寸的 authorization-person-grants.png（web/test-results-authorization-usability）。三步表单的动作、岗位与授权身份区分、记录范围说明通过本次语言复核。截图属于浏览器测试，不能代替微信与实体设备。

暂缓完整放行两处：无已发布身份时，首次使用说明与“管理授权身份”入口须只向有身份维护能力者显示；无维护权只保留 noSchemes。委托列表的删除按钮不能复用 remove（撤销授权），新增 revokeDelegation 定稿“撤销分配资格”，两端接入。完成这两项后复核引用即可；尚未检查委托界面实际截图。

## 最终引用复核放行

实施后再次核对：两端首页首次引导已经绑定 canManage；编辑页先读取 management，明确无分配资格时显示 allocationUnavailable 并停止加载编辑资料。根据主 Agent 核实的服务端事实，有效委托者可在其允许范围内维护授权身份，不另设身份维护权限。因此本稿此前要求的维护资格条件由 canManage 表达。两端委托列表及撤销确认均已引用 revokeDelegation。

以上两项退回问题已修正，本次语料与模板上下文最终放行。该结论覆盖源码引用及此前检查的两张浏览器截图，不扩大为委托界面截图、微信实机或手机及 Pad 实体设备验证通过。
