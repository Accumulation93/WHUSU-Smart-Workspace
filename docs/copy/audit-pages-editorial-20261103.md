# 审核页面剩余语料：独立审稿

作者 `/root/language_editor`。所有表格源均在 shared/locales/zh-CN/generated/subpackages/audit。同一值在不同页面仍按情境逐项确认，品牌引用统一common，不改用户申请名称或意见。

## pages/mySubmissions/mySubmissions.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_00a471585c | 保留：处理中… | 请求进行中 |
| copy_0531ed9e78 | 改为：操作未完成，请刷新查看结果 | 不能盲重提 |
| copy_0dc99cac16 | 保留：审核中 | 状态 |
| copy_2220286f1c | 保留：已完成 | 状态 |
| copy_282e15e226 | 保留：已撤回 | 状态 |
| copy_31d4595959 | 保留：全部 | 状态筛选 |
| copy_56d416c578 | 保留：审核 | 子应用 |
| copy_57b008f8c7 | 保留：待提交 | 状态 |
| copy_5d5af942c5 | 保留：已驳回 | 状态 |
| copy_638da8ae60 | 保留品牌组织，引用common.organizationName | 不指当前工作组织 |
| copy_6830671a51 | 改为：全部标为已读 | 动作 |
| copy_6a9352d30a | 保留：已全部设为已读 | 成功结果 |
| copy_8ad4a40192 | 保留：申请列表 | 列表标题 |
| copy_a7f09dc2db | 保留：暂无申请 | 仅成功为空 |
| copy_aa4f0ed6cd | 保留品牌，引用common.brandName | 品牌 |
| copy_bff094c480 | 保留：状态筛选 | 筛选标题 |
| copy_c64e979552 | 保留：发起申请 | 新建入口 |
| copy_e52119b17e | 保留：请稍后重试 | 读取后备 |
| copy_f6afc42806 | 保留：草稿 | 状态 |
| copy_fb0dc97a1d | 保留：我的申请 | 页面名 |
| currentWorkContext | 保留：当前工作角色 | 实际会话 |
| noAssignmentTitle | 保留：当前没有可用岗位 | 资格为空 |
| noAssignmentActionDescription | 改为：当前没有可发起审核申请的岗位，仍可查看有权访问的申请记录。 | 不承诺所有历史可读 |
| switchWorkContext | 保留：切换工作角色 | 导航 |
| cancel | 保留：取消 | 关闭提示 |
| loadFailed | 保留：申请加载失败，请重试 | 失败与空分开 |
| retry | 保留：重试 | 加载恢复 |
| positionAvailable | 保留：可发起 | 资格状态 |
| positionUnavailable | 保留：仅查看 | 资格状态 |
| navigationTitle | 保留：我的申请 - WHUSU智慧工作台 | 导航 |

## pages/myApprovalHistory/myApprovalHistory.js

| 键 | 状态／定稿 |
|---|---|
| copy_0dc99cac16 | 保留：审核中 |
| copy_2220286f1c | 保留：已完成 |
| copy_282e15e226 | 保留：已撤回 |
| copy_2ad6b11547 | 保留：审批记录 |
| copy_56d416c578 | 保留：审核 |
| copy_5d5af942c5 | 保留：已驳回 |
| copy_638da8ae60 | 保留品牌组织，引用common.organizationName |
| copy_86accadcca | 保留：暂无审批记录；仅成功为空 |
| copy_aa4f0ed6cd | 保留品牌，引用common.brandName |
| copy_e52119b17e | 保留：请稍后重试 |
| copy_f69eaef5c5 | 保留：我的审批记录 |
| processedAssignmentPrefix | 保留：处理岗位：；只展示处理时快照 |
| legacyAssignmentSnapshotUnavailable | 保留：审批岗位未记录；不猜当前岗位 |
| navigationTitle | 保留：我的审批记录 - WHUSU智慧工作台 |

## pages/pendingApprovals/pendingApprovals.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_109f042664 | 保留：待审批列表 | 列表 |
| copy_29f6c07d3f | 保留：轮 | 序号单位 |
| copy_322d34ce9c | 保留：提交人： | 申请发起人 |
| copy_36be0dfa1c | 保留：待我处理 | 状态 |
| copy_47cd44e2ed | 保留：更新于 | 时间前缀 |
| copy_49cbf30d6b | 改为：签名 | 与5种动作统一 |
| copy_545113905f | 保留：刷新 | 刷新成功页面 |
| copy_56d416c578 | 保留：审核 | 子应用 |
| copy_5aaf844f1e | 保留：待我审批 | 页面名 |
| copy_638da8ae60 | 保留品牌组织，引用common.organizationName | 品牌 |
| copy_7e6630535d | 保留：盖章 | 动作 |
| copy_8e2f75159e | 保留：通过 | 动作 |
| copy_9e545997b0 | 保留：步 | 序号单位 |
| copy_a14c4e583b | 保留：暂无待审批事项 | 成功为空 |
| copy_a63d02480e | 改为：签名＋盖章 | 两种必需 |
| copy_aa4f0ed6cd | 保留品牌，引用common.brandName | 品牌 |
| copy_bba7f8b8ba | 保留：请切换到可审批的岗位 | 业务资格 |
| copy_e52119b17e | 保留：请稍后重试 | 读取失败后备 |
| copy_ef8b7ffa9b | 保留：第 | 序号前缀；完整显示时必须连同数字和单位 |
| workContextRequiredTitle | 保留：需要切换工作角色 | 资格提示 |
| workContextRequiredDescription | 保留：当前工作角色不能处理此事项，请切换到要求的组织和岗位。 | 不自动代切审批 |
| noAssignmentActionDescription | 保留：当前没有可处理审批的岗位，请先切换工作角色。 | 无岗提示 |
| switchWorkContext | 保留：切换工作角色 | 导航 |
| cancel | 保留：取消 | 关闭提示 |
| currentWorkContext | 保留：当前工作角色 | 当前角色 |
| noAssignmentTitle | 保留：当前没有可用岗位 | 无岗 |
| requiredOrganizationPrefix | 改为：所属组织： | 指所要求岗位所在组织，不泛“要求组织” |
| requiredAssignmentPrefix | 保留：可处理岗位： | 具体可用岗位 |
| eligibleAssignmentsPrefix | 保留：请切换到以下可处理岗位： | 多岗选择 |
| assignmentSeparator | 保留：、 | 岗位连接 |
| navigationTitle | 保留：待我审批 - WHUSU智慧工作台 | 导航 |

## pages/signatureManager/signatureManager.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_06dbb49961 | 保留：取消 | 编辑放弃 |
| copy_076bb5d383 | 保留：删除失败，请重试 | 明确拒绝 |
| copy_082505816e | 改为：签名已保存到签名库 | 不误称审批保存 |
| copy_1c47adeb46 | 保留：签名已删除 | 库模板删除 |
| copy_1c620d13e8 | 保留：签名已更新 | 库模板修改 |
| copy_215e3c57da | 保留：保存失败，请重试 | 仅明确拒绝，未知结果另用公共反馈 |
| copy_290f4e2426 | 保留：我的签名 | 页面名 |
| copy_56d416c578 | 保留：审核 | 子应用 |
| copy_638da8ae60 | 保留品牌组织引用 | 品牌 |
| copy_66a2af4df9 | 保留：签名␠ | 默认名称前缀，␠为空格 |
| copy_78ad9dc82c | 保留：设置失败，请重试 | 默认设置失败 |
| copy_7f31eec657 | 保留：确认删除 | 删除确认 |
| copy_7f8fe1554d | 保留：默认 | 默认模板状态 |
| copy_aa4f0ed6cd | 保留品牌引用 | 品牌 |
| copy_acc985cabc | 保留：删除 | 删除库模板 |
| copy_ae48afe9fc | 保留：编辑签名 | 模板编辑 |
| copy_b9a2950b44 | 保留：暂无签名 | 成功为空 |
| copy_c103b678f0 | 保留：新建签名 | 新建模板 |
| copy_ce2b164f35 | 保留：已设为默认签名 | 设置成功 |
| copy_d654f6c1d3 | 保留：新建签名 | 新建标题 |
| copy_da92c43d07 | 保留：确定删除此签名模板吗？ | 不删除历史已签文件 |
| copy_e040ae3016 | 保留：编辑 | 模板操作 |
| copy_e52119b17e | 保留：请稍后重试 | 读取失败 |
| copy_e92a06d5bf | 保留：已保存签名 | 库列表分区 |
| copy_f1b28c5cf9 | 改为：设为默认 | 自然完整动作 |
| navigationTitle | 保留：我的签名 - WHUSU智慧工作台 | 导航 |

## components/signaturePad/signaturePad.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_2a0e50c5f6 | 改为：清空签名板 | 清空范围明确 |
| copy_36b96c0240 | 保留：确认签名 | 确认板内容 |
| copy_81bffbd366 | 改为：正在生成签名 | 实际导出过程 |
| copy_b5a7df5844 | 保留：请先书写签名 | 空内容校验 |
| copy_bff49f783f | 改为：签名未能生成，请重试 | 若此分支并非只生成须拆分，不用于审批未知结果 |
| copy_e22c5edfe9 | 保留：签名板尚未就绪，请稍后重试 | 画布未准备 |
| copy_ee931979e9 | 保留：签名板已失效，请重新打开 | 画布生命周期失效 |

## pages/verification/verification.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_03d69a9d28 | 保留：请重新选择文件 | 输入恢复 |
| copy_07c93eae72 | 保留：签名记录 | 记录列表 |
| copy_0ad36ee44c | 保留：签名有效；本平台暂时无法确认签名来源 | 密码与来源分离 |
| copy_1a50073a0e | 保留：轮： | 轮次标签 |
| copy_1ddd4c9b39 | 保留：提交编号 | 记录检索标识 |
| copy_2592864779 | 保留：查询方式 | 上传或编号 |
| copy_3196e9e72b | 保留：无效 | 只用于明确签名失败 |
| copy_33935075c0 | 保留：签名验证结果 | 结果标题 |
| copy_3e081d0fa1 | 保留：签名验证通过 | 必须逐项真实结果，不盖过来源未知 |
| copy_3eb9b187ef | 保留：上传文件 | 文件入口 |
| copy_3f3f603e7b | 改为：文件内容不一致 | 比对不一致不必然证明修改历史 |
| copy_4e1ba9317f | 保留：文件内签名： | 签名数量标签 |
| copy_5494a3274f | 保留：有效 | 明确密码结果 |
| copy_56d416c578 | 保留：审核 | 子应用 |
| copy_5d41fef45a | 保留：按提交编号 | 只查记录方式 |
| copy_61390dea0a | 保留：记录完整 | 已核实记录完整 |
| copy_638da8ae60 | 保留品牌组织引用 | 品牌 |
| copy_6db0cdad11 | 保留：签名总数 | 数量 |
| copy_71234ac12a | 保留：签署 | 动作标签 |
| copy_73b11affc2 | 保留：签名验证未通过 | 明确失败 |
| copy_794d97df79 | 改为：暂时无法确认 | 未知结果 |
| copy_7bb4b58022 | 改为：暂时无法核实文件内容 | 未知内容 |
| copy_93eb240494 | 保留：请输入提交编号 | 空输入 |
| copy_98aea69c53 | 保留：选择文件 | 输入动作 |
| copy_aa4f0ed6cd | 保留品牌引用 | 品牌 |
| copy_accba28cad | 保留：文件内容 | 检查标签 |
| copy_b0ecda76b1 | 改为：记录内容不一致 | 不凭差异断言已改写 |
| copy_b49d7af0bd | 保留：验证签名 | 只读验证动作 |
| copy_b791913c7a | 保留：签名验证未完成，请重试 | 只读失败 |
| copy_c0915246d1 | 保留：如：SUB-20260611-001 | 示例，不是实际记录 |
| copy_c25d1b8a38 | 保留：由 | 必须与已核实人/动作完整组合 |
| copy_c9448bb954 | 保留：文件内签名：无 | 实际无密码签名 |
| copy_cbf65b3559 | 保留：请选择要验证的文件 | 空输入 |
| copy_d1cbed9945 | 改为：请切换到有权验证此文件的工作角色 | 不限定只有岗位，按业务权限 |
| copy_df548b0f40 | 保留：个签名） | 数量尾缀，不能孤立显示 |
| copy_e68b797796 | 保留：文件签名验证 | 页面名 |
| copy_ef8b7ffa9b | 保留：第 | 序号前缀 |
| copy_fb4bf20470 | 保留：选择要验证的文件 | 选择说明 |
| copy_fbf2871317 | 保留：文件内容一致 | 比对事实 |
| copy_fde988de1e | 保留：签名来源信息完整 | 信息完整不等于身份已核实，须独立状态 |
| navigationTitle | 保留：文件签名验证 - WHUSU智慧工作台 | 导航 |

## submissionDetail 结构先退回项

已经完整读源，但约束不允许把大量碎句默认保留后称完成：旧“回到驳回人”、普通审批选人搜索学号、预览失败仍可提交等正由前端Agent核对活跃调用。活跃审批人组合语料应完整表达条件对象；未引用过时字段可清除，不补写虚假行为。该文件逐key表尚待补齐，当前不在已完成范围。

### 已核实结构及完整语料

1. copy_2313ec3016、copy_7897981e63、copy_42dba54426在非生成小程序源码无调用，属于过时语料，退回清理，不允许重启“回到驳回人”或学号搜索。
2. copy_3a89b81529仅为模板步骤预览失败，不是附件预览。定稿为“审批步骤未能加载，请重新选择模板后重试。”，不得承诺仍可提交；保持已有必需步骤校验，不因文案新增业务绕过。
3. approverDesc与stepConditionsDisplay目前优先服务端拼接，不满足新前端语料要求。需要结构化条件值和名称，用以下语料组合；名字是业务事实保留，不信任服务端说明段落。

| 新键 | 定稿 | 适用情境 |
|---|---|---|
| designatedApprovers(names) | 指定审批人：{names} | 明确人员候选，不能当真实处理人 |
| designatedApprovalAssignments(labels) | 指定审批岗位：{labels} | 明确岗位候选 |
| allIdentityApprovers(identity) | 审批范围：本组织的“{identity}”岗位 | all仅范围，不表示全体共同审批 |
| sameDepartmentApprovers(identity) | 审批范围：与申请人同部门的“{identity}”岗位 | 相对申请岗位 |
| sameWorkGroupApprovers(identity) | 审批范围：与申请人同职能组的“{identity}”岗位 | 相对申请岗位 |
| departmentApprovers(department,identity) | 审批范围：“{department}”中的“{identity}”岗位 | 指定部门 |
| workGroupApprovers(department,group,identity) | 审批范围：“{department} · {group}”中的“{identity}”岗位 | 指定职能组，部门不可遗漏 |
| approverRangeUnavailable | 暂时无法确认审批人范围 | 条件缺失，不拿未指定拼长句 |
| approverConditionGroups | 满足以下任意一组条件的岗位可审批。 | 多组候选，不表示所有岗位都必须处理 |
| applicantApprover | 由申请人本人审批 | 允许自己选项 |

此前“由 全体／由 同部门／由 同职能组”碎句退回上述函数；身份缺失不能填写“未指定身份类别”后仍声称确定范围。详细处理人须按实际事件显示，与候选范围分区。

### conditionFacts多维条件的最终结构定稿

批准在现有流程展开区按条件组展示，不新增弹窗。每组为独立自然行区块；identity_scope使用关系说明加部门／身份类别／职能组三行；不能把多维条件简化为上述某个单维函数。人员及岗位名称作为事实文本，不被翻译改写。

| 新键／函数 | 完整定稿 | 条件 |
|---|---|---|
| approvalConditionGroupsHint | 符合以下任意一组条件即可；每组条件须在同一岗位上同时满足。 | 多组OR、组内同岗AND |
| approvalConditionGroup(index) | 条件组 {index} | 逐组标题 |
| approvalIdentityScopeHint | 符合本组条件且具有审批资格的任一岗位，可以处理本步骤。 | 不暗示全部人必须审批、不绕过业务资格 |
| approvalSpecificValuesHint | 同一类中列出多个选项时，符合任意一个即可。 | 维度内OR，显示一次 |
| approvalSubmitterCondition | 由申请人本人审批。 | submitter类型 |
| approvalPeopleCondition(names) | 指定审批人：{names}。 | person类型，具体名单 |
| approvalAssignmentsCondition(labels) | 指定审批岗位：{labels}。 | assignment类型，具体岗位 |
| approvalDepartmentLabel | 部门 | 维度标题 |
| approvalIdentityLabel | 身份类别 | 维度标题 |
| approvalWorkGroupLabel | 职能组 | 维度标题 |
| approvalAllDepartments | 不限部门 | 仅明确all |
| approvalAllIdentities | 不限身份类别 | 仅明确all |
| approvalAllWorkGroups | 不限职能组 | 仅明确all |
| approvalOwnDepartment | 与申请岗位所属部门相同 | own部门，非当前查看者 |
| approvalOwnIdentity | 与申请岗位的身份类别相同 | own身份 |
| approvalOwnWorkGroup | 与申请岗位所属职能组相同 | own职能组 |
| approvalSpecifiedValues(names) | 指定：{names} | specific已解析名称，任一由上方说明 |
| approvalConditionIncomplete | 本组部分条件未能读取，暂时无法完整显示审批范围。 | unresolved组保留已知事实并显示警告 |
| approvalDimensionUnavailable | 此项条件暂未确认 | 缺失维度，不默认all |

全all仍只是候选范围，不显示“全体共同审批”；未解析维度不得空白省略成无限制。现有已处理人快照另在处理结果显示，不拿候选条件代替真实处理人。

### submissionDetail逐键记录

“保留”项必须在当前既有字段或完整句上下文使用；序号单位是排版片段，不得作为独立提示。退回碎句须用上方完整函数替换后移除引用；未引用过时项在全端引用核对后可清除。

| 键 | 状态／定稿 |
|---|---|
| copy_00e277a673 | 保留：修改 |
| copy_0172f60994 | 保留：请选择审核流程 |
| copy_01c2184200 | 保留：手写新签名 |
| copy_02419589be | 保留：部门 |
| copy_03c3f77e01 | 改为：未开始；图标由组件显示 |
| copy_03d69a9d28 | 保留：请重新选择文件 |
| copy_0531ed9e78 | 改为：操作未完成，请刷新查看结果 |
| copy_060a64d6e7 | 保留：上传失败，请重试；仅明确失败 |
| copy_0657662c42 | 改为：已盖章；图标分离 |
| copy_06dbb49961 | 保留：取消 |
| copy_082505816e | 改为：签名已保存到签名库 |
| copy_0887668fa5 | 保留：调整位置 |
| copy_091dc4f11f | 保留：选择审核模板 |
| copy_09614cef6c | 保留：关闭 |
| copy_0a01cb3a51 | 保留：重新提交 |
| copy_0b61c482f3 | 改为：添加指定审批岗位；已核实assignment模式 |
| copy_0b9e83ebb1 | 保留：未指定时，按下一步审批条件确定审批人 |
| copy_0c02992813 | 保留：签名 |
| copy_0c28c344e7 | 保留：未命名文件 |
| copy_0c90eb0204 | 保留：驳回 |
| copy_0dc99cac16 | 保留：审核中 |
| copy_0f143c0d61 | 保留：下一页 |
| copy_0f438fa581 | 改为：撤回申请 |
| copy_0f88ef1634 | 保留：暂无已保存的签名 |
| copy_0fd9f5f9e8 | 保留：自定义流程 |
| copy_10d3269bb4 | 保留：请重新选择岗位 |
| copy_1188f4f2ad | 保留：全部流程已完成 |
| copy_12555b2518 | 保留：审批意见（可选） |
| copy_126a0e1f4c | 保留：审批通过 |
| copy_14144be09d | 保留：轮 |
| copy_14ba55edf3 | 保留：等待重新提交 |
| copy_14ebfed982 | 保留：撤回失败，请重试；未知结果不得使用 |
| copy_15b653039c | 保留：使用模板 |
| copy_165509f937 | 保留：新增附件 |
| copy_16d27aa59e | 保留：步）；仅完整数量尾缀 |
| copy_17a7472824 | 保留：调整签名位置 |
| copy_17bcc41217 | 退回审批条件拼接：由结构化多组标题代替“或”串联长句 |
| copy_17f5307ade | 保留：指定部门成员 |
| copy_1860c2d121 | 保留：已撤回，可重新提交 |
| copy_19e33b3f68 | 保留：等待重新提交 |
| copy_1bb7eb3e1a | 保留：通过 |
| copy_1d953e38dc | 保留：签名名称（可选） |
| copy_1fac292fcb | 保留：处理人：；仅真实处理事件 |
| copy_213b890c07 | 保留：正在加载人员列表… |
| copy_215e3c57da | 保留：保存失败，请重试；仅明确拒绝 |
| copy_2220286f1c | 保留：已完成 |
| copy_2313ec3016 | 退回未引用旧“回到驳回人”语料 |
| copy_23590ac13f | 改为：签名与印章；分区总称，不代表动作要求 |
| copy_2370e6144f | 保留：人；仅自然人计数 |
| copy_237707b205 | 保留：指定职能组 |
| copy_239cbf0257 | 保留：步待处理；需含完整数字 |
| copy_2415963f64 | 保留：修改申请 |
| copy_253aca0bd3 | 保留：操作人： |
| copy_258347beac | 保留：指定职能组；不用于缺名称却假定已知的后备 |
| copy_25e1199dc3 | 改为：说明 |
| copy_2649ec5bae | 保留：选择签名方式 |
| copy_265568fe85 | 保留：审批步骤 |
| copy_2758c01952 | 保留：该步骤按审批条件确定审批人 |
| copy_282e15e226 | 保留：已撤回 |
| copy_290f4e2426 | 保留：我的签名 |
| copy_29f31e5552 | 改为：未找到当前待审批步骤，请刷新申请详情。 |
| copy_29f6c07d3f | 保留：轮 |
| copy_2aad29e5cf | 保留：指定；只作条件选项 |
| copy_2c67faf1c7 | 改为：与申请人同职能组 |
| copy_2d40e10806 | 保留：审核 · 审核详情 |
| copy_303b7a8611 | 保留：职能组 |
| copy_30f93d24ca | 改为：申请标题 |
| copy_31d4595959 | 保留：全部 |
| copy_31d6da5144 | 保留：盖章 |
| copy_3234735724 | 保留：填写说明（选填） |
| copy_32a2bb57fd | 保留：请选择签名或印章；仅材料选择，不用于both要求校验 |
| copy_3315a98bd6 | 保留：修改已保存 |
| copy_332bc9211a | 保留：预览 |
| copy_34f5bab454 | 保留：审批人按流程设置确定 |
| copy_361de3f050 | 保留：剩余；需完整数字与单位 |
| copy_3714fd6353 | 保留：等待第；需完整步骤描述 |
| copy_3764af0483 | 保留：请填写驳回理由 |
| copy_37ad645951 | 改为：与申请人同部门 |
| copy_38ca054171 | 保留：右转 |
| copy_39bf6116f7 | 保留：步被驳回；仅完整步骤状态 |
| copy_3a89b81529 | 改为：审批步骤未能加载，请重新选择模板后重试。 |
| copy_3b3b392755 | 保留：审批意见：；保留用户原文 |
| copy_3bc010171a | 保留：审批流程 |
| copy_3cd3d7a8c2 | 改为：从第一步重新审批；旧模式选择若无调用则清除 |
| copy_3ebd5d2cf0 | 改为：请输入申请标题 |
| copy_3ef3c50164 | 改为：已签名；图标分离 |
| copy_3f9ec35c15 | 保留：没有匹配的人员 |
| copy_3fb5aace39 | 保留：申请方式 |
| copy_3fc6899daa | 保留：指定下一步审批人（可选） |
| copy_4161e513f6 | 保留：审批意见： |
| copy_41c20cc066 | 保留：审批意见 |
| copy_42dba54426 | 退回未引用学号搜索语料，审核人员选择禁止学号 |
| copy_448b029911 | 保留：请添加签名和印章；both专用 |
| copy_45ef5ac49b | 保留：暂无已选人员；岗位选择模式用已选岗位专用 |
| copy_46a814a2c4 | 保留：按审批条件 |
| copy_4707e47a7a | 保留：轮；序号单位 |
| copy_4711f10351 | 保留：审批人身份类别 |
| copy_472d3dfdab | 保留：尚未添加印章 |
| copy_47a12cc974 | 保留：驳回理由 |
| copy_493a127a99 | 保留：步 |
| copy_49cbf30d6b | 改为：签名 |
| copy_49ef170f0b | 保留：确认通过 |
| copy_4aa1a817a1 | 保留：已撤回（共；必须完整数量组合，不能独立提示 |
| copy_4cecd19152 | 改为：与申请人同部门的成员 |
| copy_4d6d7783a5 | 保留：默认签名 |
| copy_4edcf754ff | 改为：收起；图标分离 |
| copy_500e30ed6d | 保留：步待处理 |
| copy_532a477356 | 改为：待处理；图标分离，当前步骤按共享processing |
| copy_53ce695b90 | 保留：选择图片 |
| copy_5477363bc5 | 保留：审批已完成 |
| copy_5564430f9c | 保留：驳回理由： |
| copy_55780718f9 | 保留：全部身份类别 |
| copy_55de802a51 | 保留：第一步审批人 |
| copy_57b008f8c7 | 保留：待提交 |
| copy_5833eb9b10 | 改为：PDF 文件 · 放置所选签章 · 第；需当前明确选中对象，后续页码完整显示 |
| copy_5c499d7608 | 保留：指定职能组成员 |
| copy_5d2dc79b89 | 保留：模板审批步骤（共；须完整数量组合 |
| copy_5d46d06a0e | 保留：位置： |
| copy_5d5af942c5 | 保留：已驳回 |
| copy_5fff626dd6 | 保留：未指定人员；仅配置候选，不能作已处理人的名字 |
| copy_600e8c5df8 | 保留：使用模板 |
| copy_60dd7897d1 | 保留：撤回申请 |
| copy_6321f35418 | 改为：可选；须邻近准确要求字段 |
| copy_638da8ae60 | 保留品牌组织引用 |
| copy_66240d9d99 | 保留：基本信息 |
| copy_66a2af4df9 | 保留：签名；默认名称前缀 |
| copy_67587e6612 | 保留：审核 · 发起申请 |
| copy_68e750360c | 保留：确定撤回此审核申请吗？ |
| copy_68f7277730 | 保留：全部部门 |
| copy_69df1816f0 | 保留：已提交 |
| copy_6a200ce590 | 保留：签署记录 |
| copy_6acb97d4c6 | 改为：，第；完整步骤句连接 |
| copy_6befa183d0 | 保留：上一页 |
| copy_6cd86bd7ed | 保留：按身份类别 |
| copy_7043c094bd | 保留：未记录；紧邻明确字段 |
| copy_70d7f7f742 | 改为：已驳回；图标分离 |
| copy_7214028117 | 保留：保存修改 |
| copy_72dd9e6203 | 保留：人）；仅自然人计数 |
| copy_73ad4b84ff | 保留：全部完成（共；完整数量组合 |
| copy_751c159dd2 | 保留：按身份类别添加 |
| copy_759682a69b | 改为：指定审批岗位；已核实assignment模式 |
| copy_75bca7ebb3 | 保留：请上传 PNG、JPG、WEBP 图片或 PDF 文件；需与实际白名单一致 |
| copy_76c0925fc7 | 保留：大小 |
| copy_76d431a4dc | 保留：全体成员；范围选项，不代表共同审批 |
| copy_76dac19a0a | 保留：签名 |
| copy_777df8daa0 | 改为：保存到签名库 |
| copy_784c704c64 | 保留：再放一处 |
| copy_7897981e63 | 退回未引用旧直接驳回模式 |
| copy_7963fb24a5 | 保留：添加审批步骤 |
| copy_79e3568eee | 保留：填写审批意见（选填） |
| copy_7abed5378f | 退回审批人句子尾缀，用完整函数 |
| copy_7aeee7513d | 改为：填写审批意见（选填） |
| copy_7bc6908a17 | 保留：审批操作 |
| copy_7ccfef7ef3 | 保留：条）；数量单位 |
| copy_7e6630535d | 保留：盖章 |
| copy_7f23b372a9 | 改为：点击文件放置所选签章 |
| copy_7f3502c81e | 改为：签名与印章；分区总称 |
| copy_84e125402d | 保留：暂无审批步骤；加载失败不得显示 |
| copy_86accadcca | 保留：暂无审批记录；成功为空 |
| copy_86bbf0d28e | 保留：未指定；仅候选配置，不代表已处理者 |
| copy_88218650ba | 保留：请上传文件 |
| copy_8831c65b75 | 改为：暂未确认提交结果，请刷新申请列表后查看；明确拒绝用具体校验反馈 |
| copy_896f105132 | 保留：选择 |
| copy_8980340210 | 保留：，再次点击可调整；仅确有当前对象点击移动行为 |
| copy_8984f2dd04 | 改为：步骤已通过；图标分离 |
| copy_8aee737e64 | 保留：状态 |
| copy_8b1a42b718 | 保留：可选人员；岗位模式须用可选岗位 |
| copy_8b55fdc995 | 保留：使用 |
| copy_8d3aac9d85 | 保留：驳回后重新提交；不新增模式控件 |
| copy_8e2f75159e | 保留：通过 |
| copy_8e66e528a2 | 改为：步骤已处理；图标分离 |
| copy_8f10667855 | 改为：确认位置 |
| copy_8f5c5f658c | 保留：审批范围 |
| copy_8ff5c9662e | 保留：未指定时按模板审批条件确定第一步审批人，指定后由所选人员审批。 |
| copy_9167c33257 | 保留：请添加审批步骤 |
| copy_9288d54fa0 | 改为：文件超过 10 MiB，请选择较小的文件；已核实两端实际阈值 |
| copy_92c9f0b2b4 | 改为：当前申请不可编辑，请刷新详情后查看可用操作。；可编辑态含草稿、待提交、驳回、撤回，不缩成只有后两种 |
| copy_93c50c01c0 | 保留：第 |
| copy_94988c2510 | 保留：进度 |
| copy_95cf78856c | 保留：当前：第；须完整步骤数 |
| copy_97d569974c | 保留：下一步按审批条件确定审批人 |
| copy_98aea69c53 | 保留：选择文件 |
| copy_999a2408c6 | 保留：页 |
| copy_9a766011a1 | 保留：确认撤回 |
| copy_9aa3c3673c | 保留：添加 |
| copy_9ab49ffac1 | 保留：左转 |
| copy_9b3c1f7a01 | 保留：全体；范围选项 |
| copy_9b774f950c | 退回：用allIdentityApprovers完整函数 |
| copy_9b8709737d | 保留：文件预览 |
| copy_9baefe7c49 | 改为：未到达；图标分离 |
| copy_9c898a71af | 保留：审批步骤预览（共；完整数量组合 |
| copy_9e545997b0 | 保留：步 |
| copy_9ecea0b582 | 保留：审核状态 |
| copy_9f09d6a2b3 | 保留：请重新选择部门 |
| copy_9f142da1e5 | 保留：未选择审批人 |
| copy_a19ba476ce | 保留：旋转 |
| copy_a2d2583699 | 保留：请填写驳回理由（必填） |
| copy_a31db08a14 | 改为：正在加载 |
| copy_a5674f1e5b | 保留：按审批条件确定审批人 |
| copy_a58e97a9f8 | 保留：确定 |
| copy_a63d02480e | 改为：签名＋盖章 |
| copy_a6f8fa4809 | 保留：尚未添加签名 |
| copy_a7f220a4a7 | 保留：重置；必须明确重置位置等范围 |
| copy_a9df85e7e6 | 保留：手写签名 |
| copy_aa4f0ed6cd | 保留品牌引用 |
| copy_aa5c293ca5 | 保留：处理时间： |
| copy_ab4e14a283 | 保留：类型 |
| copy_ac4d7a45e0 | 保留：如：部门负责人审批 |
| copy_ae42f47cf6 | 保留：审批人尚未确定 |
| copy_aed5de2d69 | 保留：重新提交 |
| copy_aee302ae49 | 保留：暂无模板；成功为空 |
| copy_afad9f1b56 | 保留：文件 |
| copy_b121b80801 | 保留：自动处理；仅真实自动业务事件 |
| copy_b141bec1f6 | 保留：备注：；用户文本 |
| copy_b2c4876b3d | 保留：暂无审批流程 |
| copy_b33e8e9a52 | 保留：当前附件 |
| copy_b3604f443f | 保留：指定部门；仅选项标签，缺名称不得当真实部门名 |
| copy_b3cdc001ce | 改为：与申请人同职能组的成员 |
| copy_b4432643e3 | 保留：驳回 |
| copy_b45ad4069d | 保留：已选人员（；岗位模式用专用键 |
| copy_b66608a15f | 保留：请选择审批人 |
| copy_b99e01d38c | 改为：请输入申请标题 |
| copy_baec508307 | 改为：查看详情；图标分离 |
| copy_bd83f7065b | 改为：逐步重审；旧模式控件无调用则删除 |
| copy_bdabcbc8ff | 保留：（第；完整序号组合 |
| copy_c07097f6db | 保留：提交申请 |
| copy_c1965e0690 | 保留：身份类别 |
| copy_c363ddef77 | 保留：尚未提交 |
| copy_c387a19415 | 保留：待提交（共；完整数量组合 |
| copy_c3e182f0c6 | 保留：移除 |
| copy_c47f370afa | 保留：选择 |
| copy_c4f6a0088b | 保留：请重新选择职能组 |
| copy_c5dd070c37 | 保留：步骤名称 |
| copy_c5ec30e07d | 保留：审批类型 |
| copy_c76fae0e08 | 保留：未指定身份类别；不能据此拼出确定范围 |
| copy_c94eb77b73 | 保留：提交审核 |
| copy_c9695bb971 | 保留：审批 |
| copy_ca1c2400cc | 保留：时间： |
| copy_ca5c78dc29 | 保留：暂无可用模板；成功为空 |
| copy_cacc39a0fd | 改为：编辑申请 |
| copy_cbacf49da2 | 保留：未开始 |
| copy_cb9e71339c | 保留：数字签名；只用于密码签名而非手写外观 |
| copy_cc26adb7da | 保留：填写驳回理由 |
| copy_cd42af3f87 | 保留：确认驳回 |
| copy_d012f0d85e | 改为：正在加载文件预览 |
| copy_d0348010eb | 退回：用sameWorkGroupApprovers完整函数 |
| copy_d036aa723a | 保留：附件 |
| copy_d03f1546e9 | 保留：轮）；完整数量组合 |
| copy_d14d285351 | 改为：点击区域放置所选签章 |
| copy_d1856227b6 | 保留：请选择身份类别 |
| copy_d2dbf88099 | 保留：步）；完整数量组合 |
| copy_d3028048b3 | 退回：审批人说明改完整格式函数 |
| copy_d5b151752b | 保留：下一步：第；完整步骤序号 |
| copy_d5fa17c99b | 改为：修改指定审批人 |
| copy_d7c8fd23a8 | 保留：或；只用于明确的任一选项 |
| copy_d86124b728 | 改为：请返回审核列表后重新打开申请。 |
| copy_da41cca7fe | 保留：暂无可用的印章；成功为空 |
| copy_db18a7c8cf | 改为：已签名并盖章；图标分离 |
| copy_db70b8527a | 保留：已指定审批人 |
| copy_dc449bac28 | 保留：审批动作 |
| copy_dd46cd92a6 | 保留：选择印章 |
| copy_e012d6739e | 改为：签署位置；不得孤立“签在” |
| copy_e1af2c13f5 | 保留：驳回意见： |
| copy_e1b8f22129 | 保留：模板 |
| copy_e31ec452dd | 保留：指定人员审批；若实际岗位模式则改用指定岗位审批 |
| copy_e3f95790ae | 改为：已重新提交 |
| copy_e4882ec81b | 改为：文件读取失败，请重新选择文件。；禁止在后面拼异常message |
| copy_e4a2b8faee | 保留：申请操作 |
| copy_e4c3cdbf04 | 改为：申请已驳回 |
| copy_e52119b17e | 保留：请稍后重试 |
| copy_e6f444764d | 改为：暂未确认重新提交结果，请刷新申请详情后查看；明确拒绝用专项结果 |
| copy_e986e973a2 | 保留：全部职能组 |
| copy_eada426deb | 保留：请选择部门 |
| copy_ec3b03ecc7 | 保留：请选择职能组 |
| copy_ed981b1744 | 保留：印章 |
| copy_edbf7136ff | 保留：驳回理由： |
| copy_ee81f5d088 | 保留：请调整位置 |
| copy_eeb3a23b87 | 保留：轮审批；完整序号 |
| copy_ef0bb32ca6 | 保留：步）；完整数量 |
| copy_ef8b7ffa9b | 保留：第 |
| copy_f1643742d1 | 保留：指定部门 |
| copy_f34e9d1f5c | 保留：份）；附件数量 |
| copy_f49717b207 | 保留：自定义流程 |
| copy_f600823615 | 保留：步审批；完整序号 |
| copy_f67213967c | 保留：页 |
| copy_f69a5ce118 | 保留：步已驳回，可修改后重新提交；完整步骤序号 |
| copy_f6afc42806 | 保留：草稿 |
| copy_f90d5fcc1f | 保留：尚未提交 |
| copy_fbc220bedd | 保留：模板加载失败，请稍后重试 |
| copy_fbdf6b37eb | 保留：审批条件： |
| copy_fc2ce54999 | 保留：按身份类别审批 |
| copy_fc98ff863c | 退回：用sameDepartmentApprovers完整函数 |
| workContextRequiredTitle | 保留：需要切换工作角色 |
| workContextRequiredDescription | 保留：当前工作角色不能执行此操作，请切换到符合要求的组织和岗位后重试。 |
| workContextMismatchDescription | 保留：当前组织或岗位不符合该流程要求，请切换工作角色后重试。 |
| switchWorkContext | 保留：切换工作角色 |
| noAssignmentTitle | 保留：当前没有可用岗位 |
| noAssignmentActionDescription | 改为：当前没有可用于审核的岗位，仍可查看有权访问的历史记录。；不能凭无岗承诺公共内容 |
| currentWorkContext | 保留：当前工作角色 |
| assignmentLabelUnavailable | 保留：岗位信息不完整 |
| selectedAssignmentsTitle | 保留：已选岗位（ |
| selectedAssignmentsUnit | 改为：个）；与已选岗位前缀形成“已选岗位（3个）” |
| assignmentUnit | 保留：个岗位 |
| submittedAssignment | 保留：提交岗位 |
| processedAssignment | 保留：审批岗位： |
| operationAssignment | 保留：操作岗位： |
| legacyAssignmentSnapshotUnavailable | 保留：岗位未记录 |
| navigationTitle | 保留：审核申请 - WHUSU智慧工作台 |

本表已逐项覆盖原文件；标明条件的语料须核实调用类型，退回的活跃结构须改后再静态复核，不能把逐项读完等同全部批准上线。

## 审核详情完整状态与定位提示补充

| 建议键 | 完整定稿 | 条件 |
|---|---|---|
| rejectedAtStep(order) | 第 {order} 步审批已驳回，可修改后重新提交。 | order 为真实有效的一基步骤序号 |
| rejectedStepUnknown | 申请已被驳回，可修改后重新提交。 | 驳回已确认，但步骤序号缺失；不显示问号或猜第1步 |
| pagePosition(current,total) | 第 {current} / {total} 页 | 两个页数有效且 current 不超过 total |
| pagePositionUnknown | 页码暂未确认 | 已进入文件预览但缺少可靠页码；不得作为加载成功证据 |
| placeSelectedSignature | 点击文件，将所选签名放到该位置。 | 当前明确选中签名，处于点击定位模式 |
| placeSelectedStamp | 点击文件，将所选印章放到该位置。 | 当前明确选中印章，处于点击定位模式 |

模板名称、自定义流程标题保留独立标题；步骤总数用已批准 stepCount(count)“{count} 个审批步骤”独立摘要，不继续拼接左右括号与“步”。定位提示只用于真实点击定位模式，不覆盖画笔、浏览或拖动专用提示。

标题拆分定稿：`templateStepPreviewTitle` 为 **审批步骤预览**，用于申请创建中预览所选模板的步骤；下方或旁边独立显示 `stepCount(count)`。自定义步骤编辑区标题复用已批准 **审批步骤**，其计数同样独立显示。不把数量塞进按钮或以半个括号组成标题。
