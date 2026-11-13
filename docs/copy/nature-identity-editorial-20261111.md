# 岗位性质与身份类别：独立语言稿

语言负责人：nature_identity_language。实施者不得同时承担本稿写作。本文是编辑依据，不是运行语料源；唯一运行源仍为 shared/locales/zh-CN。下列 `{变量}` 均由语料函数接收完整业务值，不允许调用方拼接句子。

## 放行边界与结构

文字按已批准业务方案定稿；页面结构仍须由独立设计 Agent 确认，实际界面复审前不宣称完整放行。身份类别管理不得只显示身份名称：卡片先列适用岗位性质，再列身份类别。岗位卡使用当前岗位的一个性质，不把身份适用的全部性质误作该人的任职。授权身份（权限方案）不是人事身份类别，不改成岗位性质的下级。

同名合并、描述选择、关联解除为三个不同场景，禁止共用含糊的“确定修改”。描述冲突必须并列显示两份完整描述并明确选择；解除影响必须按岗位、规则、进行中审批等分组，不能用一条超长弹窗说明替代明细。未授权明细不得显示姓名或记录标题；可以显示经授权允许的汇总。

按钮、标签、短状态、加载短语不加句号。说明、校验与完整陈述使用句末标点。问句使用问号；不能按字数机械添加或删除标点。

## 通用、管理及选择

建议命名空间 identityNatureRelations。以下键为独立定稿，同一语义可复用现有已批准键，不得仅按相同文字串线。

| 键 | 定稿 | 情境与条件 |
|---|---|---|
| nature | 岗位性质 | 先于身份类别显示 |
| identity | 身份类别 | 紧随性质信息 |
| applicableNatures | 适用岗位性质 | 身份字典编辑多选标签 |
| chooseNatureFirst | 请先选择岗位性质 | 未选性质时身份控件占位 |
| selectNatureRequired | 请至少选择一种岗位性质。 | 新版保存的明确校验 |
| selectIdentity | 选择身份类别 | 性质已经选好 |
| name | 身份类别名称 | 编辑字段 |
| namePlaceholder | 请输入身份类别名称 | 输入占位 |
| description | 描述 | 编辑字段 |
| descriptionPlaceholder | 说明这个身份类别的职责，可不填 | 输入占位 |
| pending | 待配置 | 状态气泡 |
| pendingFilter | 待配置的身份类别 | 管理筛选入口 |
| allNatures | 全部岗位性质 | 管理列表筛选，不用于新规则保存 |
| configure | 配置岗位性质 | 待配置卡片动作 |
| pendingHelp | 尚未设置适用的岗位性质，暂不能用于新增岗位。 | 身份字典详情 |
| noMatchingIdentity | 所选岗位性质暂无可用的身份类别 | 当前筛选成功为空 |
| noIdentities | 暂无身份类别 | 成功读取完整空目录 |
| loading | 正在加载身份类别 | 标准加载组件 |
| saving | 正在保存 | 标准操作加载 |
| loadFailed | 身份类别未能加载，请重试。 | 已确认读取失败 |
| saved | 已保存 | 已确认保存成功 |
| reloadRequired | 内容已发生变化，请刷新后重新确认。 | 编辑或预览版本冲突 |
| incompatible | 所选身份类别不适用于这个岗位性质，请重新选择。 | 岗位组合无效 |
| nameRequired | 请填写身份类别名称。 | 名称为空 |
| renameConflict | 已有同名身份类别，请使用其他名称。 | 编辑改名撞名 |
| natureMissing | 岗位性质未记录 | 历史缺失，只读，不推断 |

## 新增同名、描述冲突与扩大关联

| 键 | 定稿 | 情境与变量 |
|---|---|---|
| mergeTitle | 合并同名身份类别 | 新增同名预览标题 |
| mergeHelp | 已有“{identityName}”，本次将合并适用的岗位性质，不再新增一条。 | identityName 为完整身份名称 |
| existingNatures | 已有岗位性质 | 并列集合标签 |
| addedNatures | 本次新增的岗位性质 | 仅显示差集 |
| mergedNatures | 合并后的岗位性质 | 并集展示 |
| noNewNatures | 没有新增岗位性质 | 集合完全相同时 |
| mergeConfirm | 确认合并 | 保存动作 |
| merged | 已合并 | 服务端确认后 |
| descriptionConflictTitle | 选择保留的描述 | 描述不同时独立选择区 |
| existingDescription | 已有描述 | 完整旧描述标签 |
| incomingDescription | 本次填写的描述 | 完整输入描述标签 |
| emptyDescription | 未填写 | 空描述占位，不写入真实值 |
| keepExisting | 保留已有描述 | 互斥选项 |
| useIncoming | 使用本次描述 | 互斥选项 |
| chooseDescription | 请选择要保留的描述。 | 未选择时禁止确认 |
| addedNatureHelp | 新增关联后，这些岗位性质也可以使用该身份类别；相关规则的匹配范围可能随之变化。 | 只能搭配真实影响预览，不暗示立即授予权限 |
| mergePermissionDenied | 你没有修改已有同名身份类别的权限，无法合并。 | 新增资格不足以修改已有记录 |

## 解除关联与暂停

| 键 | 定稿 | 情境与变量 |
|---|---|---|
| unlinkTitle | 解除岗位性质关联 | 不得称删除身份类别 |
| affectedTitle | 受影响的内容 | 明细总标题 |
| affectedPositions | 岗位 | 分组 |
| affectedRules | 规则 | 分组 |
| affectedApprovals | 进行中的审批 | 分组 |
| affectedStamps | 印章授权 | 分组 |
| affectedCopyDrafts | 复制草稿 | 分组 |
| positionCount | {count} 个岗位 | count 为服务端确认的数量 |
| ruleCount | {count} 条规则 | 同上 |
| approvalCount | {count} 项审批 | 同上 |
| unavailableDetails | 部分明细不在你的查看权限内 | 仅当后端确实限制明细 |
| unlinkBlocked | 该关联仍在使用，请先处理下列内容，或查看强制解除的影响。 | 确实允许查看强制路径时 |
| forceTitle | 确认强制解除 | 危险确认标题 |
| forceHelp | 解除“{natureName}”与“{identityName}”的关联后，受影响岗位将暂停业务操作，直到配置修正。其他有效岗位和管理身份不受影响，历史记录保留。 | 两个名称均为完整值；下方必须展示引用明细 |
| forceConfirm | 强制解除 | 危险按钮，不能默认聚焦自动提交 |
| unlinkConfirm | 确认解除 | 无引用普通确认 |
| unlinking | 正在解除关联 | 操作状态 |
| unlinked | 已解除关联 | 已确认成功 |
| positionPaused | 岗位待配置 | 岗位气泡 |
| positionPausedHelp | 这个岗位的性质与身份类别尚未匹配，暂不能办理业务。请联系有权限的管理员修正岗位配置。 | 普通用户的实际无效岗位 |
| adminPositionPausedHelp | 这个岗位的性质与身份类别尚未匹配。修正配置后，系统会重新检查该岗位是否可用。 | 管理详情，不保证无条件恢复 |
| approvalBlocked | 指定处理岗位需要重新配置，当前步骤暂不能处理。 | 不能显示已通过、未到达 |
| ruleInvalidCombination | 这组岗位性质与身份类别已不再适用，请重新选择。 | 规则编辑定位到具体条件 |
| impactChanged | 受影响的内容已发生变化，请重新查看后确认。 | 预览和执行之间变化 |
| previewRequired | 请先查看本次修改的影响，再确认保存。 | 缺少有效修改预览 |
| associationInUse | 该关联仍在使用，请先查看受影响的内容。 | 通用接口拒绝，不暗示用户具有强制解除权 |

## 旧版与跨组织复制

| 键 | 定稿 | 情境与变量 |
|---|---|---|
| legacyScope | 不限岗位性质 | 仅旧规则原有效范围 |
| legacyScopeHelp | 这条原有规则未限制岗位性质。修改时请明确选择，并确认影响范围。 | 编辑旧规则，不允许静默窄化 |
| pendingSaved | 已保存，待配置岗位性质 | 旧版缺参数的明确成功状态，不用短Toast承载 |
| pendingSavedHelp | 身份类别已保存。请在新版中设置适用岗位性质后，再用于新增岗位。 | 旧客户端兼容完整提示 |
| copyNatureTitle | 对应目标组织的岗位性质 | 复制映射区先于身份类别 |
| sourceNature | 来源岗位性质 | 映射左列 |
| targetNature | 目标岗位性质 | 映射右列 |
| selectTargetNature | 请选择目标组织中对应的岗位性质。 | 映射缺失 |
| legacyCopyHelp | 这份旧配置未记录适用岗位性质，请为目标组织补充选择。 | 旧分享包缺字段 |
| copyMergeHelp | 目标组织已有“{identityName}”，本次将合并岗位性质关联。来源组织的配置保持不变。 | 复制同名合并预览 |
| mappingInvalid | 所选岗位性质已不可用，请重新选择。 | 映射失效或删除，不暴露内部编号 |

## 变量、权限与状态检查

### 规则选择与启用前状态补稿

以下情境由前端实施 Agent 和主 Agent 提供，语言已放行；不得将查看者与安排人混用。

| 键 | 定稿 | 情境与变量 |
|---|---|---|
| directorySameNature | 与查看者当前岗位相同 | 通讯录目标的“岗位性质”分区选项；分区标签必须始终可见 |
| calendarSameNature | 与安排人当前岗位相同 | 日程目标的“岗位性质”分区选项；分区标签必须始终可见 |
| directorySameNatureSummary | 岗位性质与查看者当前岗位相同 | 脱离性质字段单独展示的规则摘要 |
| calendarSameNatureSummary | 岗位性质与安排人当前岗位相同 | 脱离性质字段单独展示的规则摘要 |
| incompatibleSelectionTitle | 重新选择身份类别 | 修改性质后原身份部分不适用，确认标题 |
| incompatibleSelectionHelp | 以下身份类别不适用于所选岗位性质，需要清除后重新选择；其余已选身份类别会保留。 | 下方必须列出将清除的具体身份，禁止仅笼统提示 |
| clearIncompatibleSelection | 清除不适用项 | 确认动作；取消恢复上一次有效性质与身份选择，不静默清空 |
| legacyScopeChangeTitle | 确认岗位性质范围 | 旧规则原来不限性质，新版选择了具体性质 |
| legacyScopeChangeHelp | 这条规则原来不限岗位性质，保存后将仅适用于：{natureNames}。其他岗位性质不再匹配这条规则。 | natureNames 为所选性质的完整名称列表，由语料函数统一以顿号连接；不得表示其他规则授权也被撤销 |
| confirmScopeChange | 确认并保存 | 旧规则范围变化的确认按钮 |
| configurationNotEnabled | 岗位性质与身份类别的关联设置尚未开放，暂时无法保存修改。请稍后重试。 | 服务器明确返回该功能尚未启用；不是网络失败，不清空编辑内容，不声称已保存 |

若现有结构无法持续显示“岗位性质”分区标签，同性质选项须使用对应 Summary 完整文案，不能单独显示“相同”。切换性质不能在未确认时先永久清除身份选择；上述清除确认只针对本次编辑草稿，不修改已有岗位或规则。

- name、natureName、identityName 取授权业务原文，不把真实名称加入静态语料库；同名展示必须同时带组织上下文。
- 数量以服务端实际影响为准，不使用当前加载页数量冒充总数。
- “已保存”“已合并”“已解除关联”只在确认成功后出现；网络中断或未知写入结果复用项目已审的未知结果提示，禁止说“保存失败，请再试”造成重复写入。
- 无改权、无强制解除资格时，不得使用暗示可操作的 unlinkBlocked 文案；使用既有权限不足语料。
- 待配置不是离任、冻结或账号异常；不能复用这些状态颜色说明或文案。
- 任何额外用户可见文字、结果码映射、导出表头或动态句式必须回到语言 Agent 增补，实施者不能现场创作。

## 实施与验收记录

已收到独立设计 Agent 的场景结构及 `nature-identity-design-20261111.md`，与本稿结构一致。以上定稿已按明确场景放行，可由另一位实施 Agent 接入；新增场景仍须回审。源码引用、真实界面及手机/Pad复审均未完成，不以文案放行视为界面验收通过。

后端结果码映射批准如下：identity_natures_required → selectNatureRequired；identity_nature_invalid → mappingInvalid；identity_nature_mismatch → incompatible；identity_change_conflict → reloadRequired；identity_change_preview_required → previewRequired；identity_description_choice_required → chooseDescription；identity_nature_in_use → associationInUse。preview.mode、impactToken、版本值仅作流程控制，不展示。descriptionConflict 为真才展示描述选择；usages 的 kind 必须映射为本地已审分组名，不能直接显示内部英文。
