# 人事资料模板与跨组织资料迁移：独立语言审稿

语言 Agent：`/root/language_editor`。不实施代码。依据 frontend_context 的真实流程说明，逐项审查四份语料。模板字段修改、当前组织应用模板、跨组织复制个人资料是三件不同的事，不统一命名为“迁移”。

## 结构批准条件

1. 应用新模板前分别显示旧资料项的移入、隐藏保留、永久删除；不能只用“应用”按钮隐去删除后果。忽略不兼容的入口必须展示将清空或跳过的资料项与人数，两个后果不能混用。
2. 跨组织资料迁移确认必须列出来源组织、目标组织、人员数量、字段对应和保留／覆盖选择。目标为当前组织也须明示名称，不能只有人员名单。
3. 网页迁移的阻断项没有“忽略后继续”入口，通用说明不得引导不存在的动作。
4. 模板的表格读取只提取字段，不导入成员资料。两端类型识别能力不一致时，不能共用“自动识别”承诺。删除模板字段不等于删除已应用组织的所有个人资料。

## hrProfileMigration.js 全部条目

| 键 | 状态／定稿 | 情境与后果 |
|---|---|---|
| title | 保留：跨组织迁移补充资料 | 现有业务术语，需说明复制不删来源 |
| entry | 保留：跨组织迁移 | 人事资料内入口 |
| sourceOrg | 保留：来源组织 | 资料来源 |
| sourceOrgPlaceholder | 保留：请选择来源组织 | 选择占位 |
| selectMembers | 改为：选择迁移资料的成员 | 不让用户误以为迁移任职关系 |
| selectAll | 保留：全选可见成员 | 只在有权查看范围内 |
| clearAll | 保留：清空选择 | 清选中，不删成员 |
| selectedCount(count) | 保留：已选 {count} 人 | 人数 |
| selectedPrefix | 保留：已选␠ | 数量前缀；␠表示原有排版空格 |
| selectedSuffix | 保留：␠人 | 数量单位 |
| peoplePrefix | 保留：共␠ | 总人数前缀 |
| peopleSuffix | 保留：␠人 | 总人数单位 |
| fieldPlanTitle | 保留：选择资料处理方式 | 字段对应与跳过 |
| actionCopy | 保留：复制到目标资料项 | 来源不会删除 |
| actionSkip | 保留：跳过不复制 | 此字段跳过 |
| targetField | 保留：目标资料项 | 当前组织字段 |
| preview | 改为：检查迁移内容 | 仅预览不写入 |
| backToEdit | 保留：返回修改 | 预览回编辑 |
| applyDirect | 保留：直接执行迁移 | 有直接执行权限 |
| submitRequest | 保留：提交迁移申请 | 仍需审批 |
| reportTitle | 保留：部分资料无法复制 | 格式不兼容 |
| reportIntro | 改为：以下资料内容不符合目标资料项的格式，请返回修改后重新检查。 | 不引导不存在的忽略入口 |
| conflictTitle | 保留：目标已有内容 | 目标值冲突 |
| conflictIntro | 改为：目标组织的以下资料项已有内容。默认保留目标内容；也可选择用来源内容覆盖。 | 明确两种来源 |
| keepAll | 改为：全部保留目标内容 | 不省对象 |
| overwriteAll | 改为：全部用来源内容覆盖 | 不省对象 |
| keep | 改为：保留目标内容 | 单字段选项 |
| overwrite | 改为：用来源内容覆盖 | 单字段选项 |
| requestSection | 保留：迁移申请 | 审批区 |
| myRequests | 保留：我的申请 | 本人发起 |
| pendingForMe | 保留：待我审批 | 本人待办 |
| approve | 保留：同意 | 审批同意 |
| reject | 保留：驳回 | 审批拒绝 |
| rejectReasonPlaceholder | 保留：请填写驳回原因 | 拒绝说明 |
| emptyRequests | 保留：暂无迁移申请 | 读取成功为空 |
| statusPending | 保留：待审批 | 申请未执行 |
| statusExecuted | 保留：已完成 | 已执行 |
| statusRejected | 保留：已驳回 | 审批拒绝 |
| statusCancelled | 保留：已撤回 | 发起人撤回 |
| statusUnknown（新增） | 状态暂未确认 | 未知状态不可归为撤回；保留详情刷新入口 |
| cancelRequest | 保留：撤回 | 撤回申请不删已执行资料 |
| orgProfilesTitle | 保留：各组织补充资料 | 按组织展示 |
| currentOrg | 保留：当前组织 | 当前工作组织 |
| expandHint | 保留：点击展开或折叠 | 折叠操作 |
| sep | 保留：： | 标签分隔 |
| closeText | 保留：关闭 | 关闭详情 |
| cancelText | 保留：取消 | 放弃动作 |
| pendingValue | 保留：待审核 | 尚未生效资料 |
| emptyValue | 保留：暂无内容 | 空值 |
| loading | 改为：正在加载迁移资料 | 明确加载对象 |
| noSourceFields | 保留：来源组织没有可迁移的补充资料 | 成功空目录 |
| noMembers | 改为：请先选择需要迁移资料的成员 | 不迁移人员归属 |
| success | 保留：跨组织迁移已完成 | 执行并落库成功 |
| submitted | 保留：迁移申请已提交 | 不混为已执行 |
| reviewed | 保留：迁移申请已处理 | 审批成功 |
| cancelled | 保留：迁移申请已撤回 | 撤回成功 |
| failed | 保留：操作未完成，请重试 | 未知失败后备 |
| requestPeople(count) | 保留：{count} 人 | 申请人数 |
| targetOrg（新增） | 目标组织 | 确认摘要 |
| transferScopeNotice（新增） | 仅复制所选成员的补充资料，不改变任职关系，也不删除来源组织的资料。 | 范围说明 |
| confirmTransferTitle（新增） | 核对资料迁移 | 写入或申请前摘要 |
| confirmTransferPeople(count)（新增） | 本次涉及 {count} 名成员 | 摘要人数 |

## hrTemplateSave.js 全部条目

### 跨组织迁移业务拒绝补充定稿

以下新增到前端 `hrProfileMigration`，仅按稳定 `hr_migration_<key>` 结果码引用。不得直接展示服务端 message，未知结果仍使用公共未确认反馈。

| 键 | 定稿 | 使用情境 |
|---|---|---|
| invalidPlan | 迁移设置不完整，请重新选择来源组织并检查迁移内容。 | 来源、目标缺失或相同等无效设置 |
| incompatibleAction | 来源资料项与目标资料项的类型不匹配，请调整对应关系。 | 字段类型不兼容 |
| duplicateTargetField | 多个来源资料项不能复制到同一个目标资料项，请调整对应关系。 | 重复目标字段 |
| fieldActionsRequired | 请为每个来源资料项选择复制到哪里，或选择跳过。 | 处理方式未完成 |
| sourceNotVisible | 当前工作角色无法读取所选来源组织的资料，请重新选择来源组织。 | 来源访问被拒绝 |
| notFound | 来源组织或目标组织的资料模板不存在，请检查两边的资料设置。 | 缺资料模板，不是成员不存在 |
| emptySelection | 请先选择需要迁移资料的成员。 | 人员选择为空 |
| stale | 资料或迁移设置已变化，请重新检查迁移内容。 | 检查凭据无效、过期或内容变化 |
| requestNotFound | 这条迁移申请不存在或已处理，请刷新申请列表。 | 申请无法继续处理 |
| rejectReasonRequired | 请填写驳回原因。 | 缺审批原因 |
| noPermissionToReview | 当前工作角色没有审批这条迁移申请的权限。 | 审批权限不足，不硬编码管理身份 |
| invalidOperation | 这条迁移申请当前不能执行此操作，请刷新详情。 | 申请状态不允许 |
| forbidden | 当前工作角色没有执行这项资料迁移操作的权限。 | 迁移操作权限不足 |


| 键 | 状态／定稿 | 情境与后果 |
|---|---|---|
| previewAction | 保留：查看资料项 | 模板字段预览 |
| collapseAction | 保留：收起资料项 | 收起预览 |
| viewEditAction | 改为：查看与编辑 | 不使用斜杠堆动作 |
| editFieldAction | 保留：展开编辑 | 打开字段编辑 |
| collapseFieldAction | 保留：收起编辑 | 关闭字段编辑 |
| unnamedField | 保留：未命名资料项 | 空名称后备 |
| libraryNote | 保留：在资料预览中直接展开编辑；保存模板后，可应用到当前组织。 | 保存与应用分开 |
| savedTitle | 保留：模板已保存 | 只说明模板落库 |
| applyQuestion | 保留：模板已保存，但当前组织的资料设置尚未更新。是否现在应用这个模板？ | 明确应用另一步 |
| savedOnly | 保留：模板已保存，各组织已应用的资料设置不会自动改变。 | 不自动改组织配置 |
| applyAction | 保留：应用模板 | 更新当前组织配置 |
| laterAction | 保留：暂不应用 | 保存但不应用 |
| failureTitle | 保留：模板未保存 | 保存失败 |
| failureMessage | 保留：暂时无法保存模板，请稍后重试。编辑内容已保留。 | 仅前端确实保留编辑内容时 |
| moveFieldUpAction | 保留：上移 | 字段上移 |
| moveFieldDownAction | 保留：下移 | 字段下移 |
| dragFieldLabel | 保留：按住拖动排序 | 长按拖拽入口 |
| fieldOptionsHint | 保留：每行填一个选项 | 序列选项输入 |
| fieldOptionsCount | 保留：已填 {0} 项 | 选项数 |
| fieldOptionsSummary | 保留：{0} 等共 {1} 项 | 示例与总数 |
| fieldOptionsDuplicate | 保留：有重复选项：{0} | 精确指出重复值 |
| fieldOptionsDedupeAction | 改为：去除重复选项 | 保留唯一值，不泛称清理 |
| fieldOptionsRequired | 改为：序列资料项至少需要一个选项 | 明确字段类型 |
| removeOptionAction | 保留：删除这个选项 | 单项删除 |
| fieldOptionsExpandAction | 保留：展开全部（共 {0} 项） | 展开数量 |
| fieldOptionsCollapseAction | 保留：收起选项 | 收起 |
| fieldOptionsOrderHint | 保留：展开后可调整顺序 | 实际动作提示 |
| moveOptionUpAction | 保留：上移这个选项 | 单项上移 |
| moveOptionDownAction | 保留：下移这个选项 | 单项下移 |
| fieldNameDuplicate | 改为：资料项名称“{0}”重复，请修改。 | 不依赖“前面的”含糊位置 |
| fieldLengthOrderInvalid | 保留：最小长度不能大于最大长度 | 长度范围错误 |
| fieldValueOrderInvalid | 保留：下限不能大于上限 | 数值范围错误 |
| fieldDigitsOrderInvalid | 保留：最少位数不能大于最多位数 | 位数范围错误 |
| fieldNumberInvalid | 改为：请输入数字；不限制时可留空。 | 明确输入与空值 |
| fieldHintTooLong | 改为：填写说明最多 {0} 个字 | 数量边界 |
| fieldHintLabel | 保留：填写说明 | 成员输入引导 |
| fieldHintPlaceholder | 保留：例如：请填写常用手机号，可写多行 | 示例 |
| errorSummary | 保留：有 {0} 处需要修改，已定位到第一处 | 必须真实定位才显示 |
| dirtyBadge | 保留：有未保存的修改 | 未写入状态 |
| discardTitle | 保留：放弃修改 | 确认标题 |
| discardMessage | 保留：有未保存的修改，放弃后无法恢复。确定放弃吗？ | 当前未保存内容消失 |
| discardAction | 保留：放弃修改 | 确认放弃 |
| keepEditingAction | 保留：继续编辑 | 保留输入 |
| leaveWarning | 保留：模板还有未保存的修改 | 离页提示 |
| deleteFieldTitle | 保留：删除资料项 | 模板字段删除 |
| deleteFieldMessage | 改为：确定从模板中删除“{0}”及其填写规则？保存模板后，已应用到各组织的资料设置不会自动改变。 | 不误称已删除成员资料 |
| deleteFieldAction | 保留：删除 | 确认当前字段 |
| editModeHintDirect | 保留：成员自己修改，保存后立即生效 | 直改模式 |
| editModeHintAudit | 保留：成员提交后由管理员审核通过才生效 | 待审与生效分离 |
| editModeHintReadonly | 保留：成员只能查看，由管理员维护 | 只读模式 |
| importDetectedItem | 保留：{0} 个{1} | 字段类型计数 |
| importDetectedSummary | 改为：根据表格列名和内容建议类型：{0}，其余按文本。请检查后保存。 | 已核实小程序结合列名与值推断，不承诺识别准确；仅小程序使用 |
| importDetectedNone | 改为：未能从表格列名和内容判断类型，暂按文本处理，请逐项检查。 | 小程序推断无结果；网页直接用importFieldsAsText |
| importTemplateFieldsNotice（新增） | 从表格读取资料项名称，不导入成员资料。 | 模板读取表头的明确边界 |
| importFieldsAsText（新增） | 已将表格列名读为文本资料项，可逐项调整类型。 | 网页全部按文本时使用 |

## hrTemplateFieldDisplay.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| types.text | 保留：文本 | 字段类型 |
| types.number | 保留：数字 | 字段类型 |
| types.sequence | 保留：序列 | 字段类型 |
| types.date | 保留：日期 | 字段类型 |
| types.phone | 保留：手机号 | 字段类型 |
| types.email | 保留：邮箱 | 字段类型 |
| unknownType | 保留：未指定类型 | 不猜字段类型 |
| noCompatibleTarget | 保留：当前模板没有类型匹配的资料项，已改为隐藏保存；如不再需要，请选择“删除现有资料”。 | 必须已实际设为隐藏才显示 |
| typeAutoMapped(name,type) | 改为：新模板中的“{name}”类型为{type}，已选择移入现有资料；应用前将检查内容能否转换。 | 不提前承诺转换成功 |
| targetLabel(name,type) | 保留：{name} · {type} | 目标名及类型 |
| typeChanged(name,type) | 保留：新模板中的“{name}”已改为{type}。选择“隐藏保存”会保留原有资料；如需移入新类型，请选择“移入现有资料”并检查格式是否符合要求。 | 明确隐藏与移入 |

## adminPersonnel.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| excelFormatTitle | 保留：Excel | 格式标准名称 |
| excelFormatExtension | 保留：.xlsx | 文件扩展名协议，不改写 |
| csvFormatTitle | 保留：CSV | 格式标准名称 |
| csvFormatExtension | 保留：.csv | 文件扩展名协议，不改写 |
| hrTemplateSwitchActionMove | 保留：移入现有资料 | 切换模板旧值映射 |
| hrTemplateSwitchActionHide | 保留：隐藏保存 | 保留旧值不展示 |
| hrTemplateSwitchActionDelete | 保留：删除现有资料 | 删除旧字段值，须确认范围 |
| hrTemplateSwitchDuplicateTarget | 改为：请为每个资料项选择不同的目标资料项。 | 避免“保存位置”被理解成文件夹 |
| hrTemplateSwitchIncompatibleReportTitle | 保留：部分资料无法移入 | 格式不兼容 |
| hrTemplateSwitchIncompatibleReportIntro | 改为：以下资料项与目标资料项的格式不匹配，无法直接移入： | 明确目标字段 |
| hrTemplateSwitchIncompatibleReportHint | 保留：可将该项改为“隐藏保存”保留原资料，或选择“删除现有资料”；调整后重新检查。 | 可执行的处理路径 |
| hrTemplateSwitchIncompatibleReportDetailIntro | 改为：以下资料内容不符合新资料项的格式。可返回修改；若选择清空不兼容内容后应用，下列内容将被清空。 | 明确清空，不用“忽略”淡化 |
| hrTemplateSwitchIncompatibleBackToEdit | 保留：返回修改 | 修改选择 |
| hrTemplateSwitchIncompatibleApplyAnyway | 改为：清空不兼容内容并应用 | 破坏性结果写入按钮 |
| hrTemplateSwitchIncompatibleUnnamedMember | 保留：未命名成员 | 缺姓名后备 |
| hrTemplateSwitchIncompatibleOriginalValue | 保留：原值 | 原内容 |
| hrTemplateSwitchIncompatibleEmptyValue | 保留：（空） | 空值 |
| hrTemplateSwitchIncompatiblePending | 保留：待审核 | 未生效状态 |
| hrTemplateSwitchIncompatibleRow(count,field,target) | 保留：{field} → {target}：{count} 条资料不符合格式 | 明确来源目标及数量 |
| dictionaryRetry | 保留：重新加载 | 字典读取失败恢复 |
| dictionaryLoadFailed.departments.title | 保留：部门列表加载失败 | 具体对象 |
| dictionaryLoadFailed.departments.description | 保留：暂时无法获取部门列表，已加载的内容会继续保留。 | 保留已有可见目录 |
| dictionaryLoadFailed.identities.title | 保留：身份类别加载失败 | 具体对象 |
| dictionaryLoadFailed.identities.description | 保留：暂时无法获取身份类别，已加载的内容会继续保留。 | 保留已有目录 |
| dictionaryLoadFailed.workGroups.title | 保留：职能组列表加载失败 | 具体对象 |
| dictionaryLoadFailed.workGroups.description | 保留：暂时无法获取职能组列表，已加载的内容会继续保留。 | 保留已有目录 |
| dictionaryUsageDialogTitle | 保留：暂时无法删除 | 使用中删除阻断 |
| dictionaryUsageDialogDescription | 改为：以下配置或记录仍在使用该选项。请先调整相关内容，再删除；历史记录不能直接改写。 | 不引导篡改历史解引用 |
| dictionaryUsageTargetLabel | 改为：待删除选项 | 不用“当前项”泛称 |
| dictionaryUsageCount(count) | 改为：{count} 处使用 | 用户理解引用关系 |
| dictionaryUsageClose | 保留：我知道了 | 确认知悉 |
| dictionaryUsageCategories.legacy_people | 保留：历史人员资料 | 使用来源 |
| dictionaryUsageCategories.positions | 保留：成员岗位 | 使用来源 |
| dictionaryUsageCategories.work_groups | 保留：职能组 | 使用来源 |
| dictionaryUsageCategories.scoring_rules | 保留：评分规则 | 使用来源 |
| dictionaryUsageCategories.scoring_history | 保留：评分历史 | 使用来源 |
| dictionaryUsageCategories.publication_rules | 保留：结果公示规则 | 使用来源 |
| dictionaryUsageCategories.audit_templates | 保留：审核模板 | 使用来源 |
| dictionaryUsageCategories.directory_rules | 保留：通讯录规则 | 使用来源 |
| dictionaryUsageCategories.authorization_rules | 改为：授权规则 | 与权限模块资源名一致 |
| dictionaryUsageCategories.calendar_rules | 保留：日程安排规则 | 使用来源 |
| dictionaryUsageCategories.calendar_events | 保留：日程记录 | 使用来源 |
| dictionaryUsageCategories.audit_history | 保留：审核历史 | 使用来源 |
| dictionaryUsageCategories.venue_rules | 保留：场地借用规则 | 使用来源 |
| dictionaryUsageCategories.venue_history | 保留：场地借用历史 | 使用来源 |
| dictionaryUsageCategories.stamp_bindings | 改为：印章使用授权 | 不是账号微信绑定 |
| dictionaryUsageCategories.unknown | 保留：其他业务内容 | 未知来源后备 |
| adminCandidateNoPosition | 保留：暂未设置岗位 | 管理候选岗位缺失 |
| adminCandidatePositionPrefix | 保留：岗位 | 岗位摘要 |
| hrProfileSelfSubmittedAt | 保留：本人提交时间 | 操作时间 |
| hrProfileMaintainedAt | 保留：管理员维护时间 | 操作时间 |
| hrProfileMaintainedBy | 改为：维护管理员 | 更自然的经办人标签 |
| hrProfileLastChangedAt | 保留：资料最后变更时间 | 最后变化时间 |
| deletedPerson | 保留：已删除人员 | 权威已删除状态 |
| deletedPersonWithStudentId | 保留：{0}（原学号 {1}） | 仅授权人事管理/专用导出可用，禁止流入其他页面 |
| assignmentNatureLabels.staff | 保留：本会岗位 | 旧字典名称，不写死可选集合 |
| assignmentNatureLabels.liaison | 保留：学院对接岗位 | 旧字典名称 |
| assignmentNatureLabels.other | 保留：其他岗位 | 旧字典名称 |
| chooseAssignmentNature | 保留：请选择岗位性质 | 字典选择 |
| addAssignmentNature | 保留：新增岗位性质 | 字典新增 |
| assignmentNatureName | 保留：岗位性质名称 | 字典名称字段 |
| createAndSelectNature | 保留：新增并选用 | 组合动作 |
| assignmentNatureMissing | 保留：岗位性质未记录 | 历史缺失，不推测补值 |

已核实：小程序结合列名与内容建议字段类型，网页直接采用文本字段；删除模板字段只改编辑草稿；类型对应只预填处理方式，实际转换仍需检查和应用。分端使用准确语料，不为统一文字改变行为。人事管理员大文件、本人资料剩余字段、导入问题库另批审查，不能以本稿宣称人事模块全部审完。

## 更换模板的检查按钮

AdminHrTemplatePanel调用previewHrProfileTemplateSwitch只检查处理计划并返回报告，不应用模板。新增 `previewTemplateSwitch`：**检查更换模板的影响**，归模板切换语料；禁止引用不存在的admin.copy_f6076cddc4，也不能借hrInfo同名“确认应用模板”冒称检查即提交。检查通过后的正式按钮继续使用已批准applyAction，两阶段分开。
