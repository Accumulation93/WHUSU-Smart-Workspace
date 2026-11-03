# 场地借用页面独立语言审稿

语言 Agent 只撰写语料。借用取消、提前结束使用、参会人退出是不同动作，不能共用成功或确认说明。读取失败不能显示成功空目录；写入结果未确认必须使用公共反馈，不承诺没有保存。以下键均相对于 `generated/subpackages/venue/`。保留条目也已按情境逐项审阅。

## utils/workContextPresentation.js

| 键 | 定稿 | 情境 |
|---|---|---|
| assignmentNatureStaff | 本会岗位 | 保留既有字典标签，不限制可扩展字典 |
| assignmentNatureLiaison | 学院对接岗位 | 同上 |
| assignmentNatureOther | 其他岗位 | 同上 |
| assignmentFallback | 岗位信息未完整记录 | 历史资料不足，不猜测 |
| contextFallback | 可用工作角色 | 角色摘要 |
| switchRequired | 请先切换到有权处理这项借用的工作角色。 | 不把可用组织与任意岗位拼接 |
| noAssignment | 当前工作角色没有可用于场地借用的岗位。 | 缺有效岗位 |
| switchAction | 切换工作角色 | 与统一角色入口一致 |
| cancelAction | 暂不切换 | 放弃切换 |

## utils/venueRuleDisplay.js

| 键 | 定稿 | 情境 |
|---|---|---|
| copy_493a127a99 | 步 | 数量单位保留 |
| copy_4f15bb9939 | 直接通过 | 规则动作保留 |
| copy_af20193574 | 管理员审批 | 旧模式标签，不能据此扩大审批资格 |
| copy_c5b4f4062e | 按步骤审批 | 顺序流程保留 |

## utils/flowTimeline.js

| 键 | 定稿 | 情境 |
|---|---|---|
| historyAssignmentMissing | 岗位未记录 | 不用模糊时间词补信息 |
| automaticApproved | 自动通过 | 图标由组件承担，不进入语料 |
| copy_1d12af72f6 | 等待审批 | 等待状态 |
| copy_2d8cba342c | 已通过 | 去除文字中的勾号 |
| copy_493a127a99 | 步 | 单位 |
| copy_532a477356 | 待处理 | 去除实心圆 |
| copy_5d5af942c5 | 已驳回 | 真实事件 |
| copy_70d7f7f742 | 已驳回 | 去除叉号 |
| copy_93c50c01c0 | 第 | 旧序号前缀，后续优先完整序号格式 |
| copy_9baefe7c49 | 未到达 | 只用于未来步骤，去除空心圆 |

结构要求：当前步骤与未来步骤必须依据真实状态区分；移除文案符号不能删掉已有状态色与图标。取消申请不凭步骤序号显示通过。

## utils/venueBookingDetail.js

| 键 | 定稿 | 情境 |
|---|---|---|
| copy_2220286f1c | 已完成 | 状态 |
| copy_29ec8299c4 | 已完成 | 进度前缀 |
| copy_3cd1b8dd73 | 步 | 进度单位 |
| copy_4cfdf3f638 | 状态暂未确认 | 未知状态不推定失败或取消 |
| copy_5d5af942c5 | 已驳回 | 状态 |
| copy_7602388726 | 审批流程已完成 | 明确审批，不等于使用结束 |
| copy_8f73640107 | 待审批 | 统一场地审批动作 |
| copy_ad310c8780 | 使用中 | 场地正在使用 |
| copy_ce171a2581 | 已通过 | 审批结果 |
| copy_fb1a45d8be | 借用申请已驳回 | 明确申请对象 |
| copy_fd4601c1f9 | 已取消 | 取消状态 |

## components/venueBookingDetail/venueBookingDetail.js

| 键 | 定稿 | 情境 |
|---|---|---|
| applicantAssignment | 借用岗位 | 提交岗位 |
| approverAssignment | 处理岗位： | 经办岗位 |
| copy_02419589be | 部门 | 基础信息 |
| copy_303b7a8611 | 职能组 | 基础信息 |
| copy_34e2d1f8a0 | 组织 | 基础信息 |
| copy_3b3b392755 | 审批意见： | 有标点标签 |
| copy_41c20cc066 | 审批意见 | 无标点标题 |
| copy_4202a27ca6 | 借用时间 | 区分申请与审批时间 |
| copy_4edcf754ff | 收起详情 | 图标由组件显示 |
| copy_56feddb4d3 | 借用 | 业务名称 |
| copy_866290fa02 | 审批人： | 真实经办人 |
| copy_8aee737e64 | 状态 | 状态标签 |
| copy_baec508307 | 查看详情 | 图标由组件显示 |
| copy_bbbebc1abf | 场地 | 资源 |
| copy_c1965e0690 | 身份类别 | 岗位属性 |
| copy_c5d9511809 | 说明 | 借用附加文字 |
| copy_ce30bda5a2 | 借用人 | 提交者 |
| copy_dcadcebf08 | 审批时间： | 审批事件时间 |
| copy_e8d9493a44 | 至 | 时间范围连接词 |

## pages/myVenueBookings/myVenueBookings.js

| 键 | 定稿 | 情境 |
|---|---|---|
| bookingAssignment | 提交岗位 | 不用当前岗位替代历史 |
| bookingDetailTitle | 借用详情 | 详情标题 |
| bookingNotFound | 未找到这条借用记录，请刷新列表后查看。 | 不保证记录仍在 |
| cancelInUse | 借用已开始。如需提前结束，请选择“结束使用”。 | 指明实际操作 |
| cancelUnavailable | 这条借用当前不能取消，请刷新详情。 | 状态变化 |
| close | 关闭 | 关闭窗口 |
| confirmEndContent | 结束后，借用结束时间将改为现在。是否结束使用？ | 提前结束后果 |
| confirmEndTitle | 结束使用 | 确认标题 |
| copy_059dd7bc2c | 取消借用 | 业务取消 |
| copy_10bd4c9a19 | 确认取消 | 确认动作 |
| copy_28981b382e | 暂无借用记录 | 只用于读取成功为空 |
| copy_301f0250ef | 这条借用未能取消，请刷新详情后查看。 | 已知业务拒绝；网络未知改公共反馈 |
| copy_3b3b392755 | 审批意见： | 标签 |
| copy_589d645596 | 是否取消这次借用？ | 不虚构后续自动动作 |
| copy_5d5af942c5 | 已驳回 | 状态 |
| copy_638da8ae60 | 武汉大学学生会 | 固定品牌 |
| copy_8f73640107 | 待审批 | 统一名称 |
| copy_9639901862 | 借用申请 | 资源 |
| copy_9ba3b8c8a9 | 场地借用 | 子应用 |
| copy_aa4f0ed6cd | WHUSU智慧工作台 | 固定品牌 |
| copy_b40ec83bc1 | 我的借用 | 页签 |
| copy_ba7787dd8d | 浏览场地 | 入口 |
| copy_ce171a2581 | 已通过 | 状态 |
| copy_decce2c059 | 借用记录 | 列表 |
| copy_e52119b17e | 借用记录未能加载，请重试。 | 只用于读取失败 |
| copy_e8d9493a44 | 至 | 时间范围 |
| copy_fd4601c1f9 | 已取消 | 状态 |
| endSuccess | 使用已结束 | 真实写成功 |
| endUnavailable | 这条借用当前不能结束使用，请刷新详情。 | 状态拒绝 |
| endUse | 结束使用 | 动作 |
| navigationTitle | 我的借用 - WHUSU智慧工作台 | 导航 |
| operationFailed | 本次操作未获通过，请刷新借用详情后查看。 | 明确拒绝；未知写结果不能使用 |

## pages/venueApprovalHistory/venueApprovalHistory.js

| 键 | 定稿 | 情境 |
|---|---|---|
| applicantAssignment | 借用岗位 | 申请岗位 |
| copy_0804df041f | 这里显示你以当前工作角色审批过的本组织借用申请。 | 明确范围，不跨角色合并 |
| copy_100eaafa28 | 查看借用详情和审批进展 | 入口说明 |
| copy_2220286f1c | 已完成 | 状态 |
| copy_2b8b8bf904 | 当前组织 | 角色组织 |
| copy_5825b0b531 | 当前工作角色 | 角色标签 |
| copy_5d5af942c5 | 已驳回 | 状态 |
| copy_638da8ae60 | 武汉大学学生会 | 固定品牌 |
| copy_7c80a228a6 | 当前组织与工作角色 | 完整标题 |
| copy_7d935d1225 | 借用人： | 标签 |
| copy_8650ae5bf6 | 审批历史 | 页签 |
| copy_86accadcca | 暂无审批记录 | 成功空状态 |
| copy_8f73640107 | 待审批 | 状态 |
| copy_9639901862 | 借用申请 | 资源 |
| copy_9ba3b8c8a9 | 场地借用 | 子应用 |
| copy_aa4f0ed6cd | WHUSU智慧工作台 | 固定品牌 |
| copy_ad310c8780 | 使用中 | 状态 |
| copy_ce171a2581 | 已通过 | 状态 |
| copy_e52119b17e | 审批记录未能加载，请重试。 | 读取失败 |
| copy_e8d9493a44 | 至 | 时间范围 |
| copy_f3a46d24ad | 你以当前工作角色审批后，记录会显示在这里。 | 空态解释 |
| copy_fd4601c1f9 | 已取消 | 状态 |
| navigationTitle | 审批历史 - WHUSU智慧工作台 | 导航 |

## pages/venueApprovalHistoryDetail/venueApprovalHistoryDetail.js

| 键 | 定稿 | 情境 |
|---|---|---|
| copy_0d62e31a58 | 你曾驳回这条借用申请 | 真实个人历史动作 |
| copy_40d594ac66 | 借用详情 | 标题 |
| copy_4ed1cce37c | 正在加载借用详情 | 加载对象 |
| copy_5d5af942c5 | 已驳回 | 状态 |
| copy_638da8ae60 | 武汉大学学生会 | 固定品牌 |
| copy_6425d55335 | 暂时无法查看这条借用详情 | 不猜已删除或无权限 |
| copy_80f4fbb3c6 | 暂时无法查看这条借用详情 | 同一未知不可用状态 |
| copy_8b4ae14b7b | 重新加载 | 实际重试 |
| copy_8ef0c52229 | 你曾审批这条借用申请 | 个人历史动作 |
| copy_9ba3b8c8a9 | 场地借用 | 子应用 |
| copy_aa4f0ed6cd | WHUSU智慧工作台 | 固定品牌 |
| copy_b55447798c | 审批详情 | 标题 |
| copy_ce171a2581 | 已通过 | 状态 |
| navigationTitle | 场地借用审批详情 - WHUSU智慧工作台 | 导航 |

## pages/venueBookings/venueBookings.js

| 键 | 定稿 | 情境 |
|---|---|---|
| copy_0696de3430 | 请在场地管理中查看借用记录和审批事项。 | 旧入口重定向 |
| copy_70936c600a | 正在加载场地管理 | 明确对象 |
| copy_b1585d96c0 | 正在打开场地管理 | 跳转状态 |
| navigationTitle | 场地借用 - WHUSU智慧工作台 | 导航保留 |

## pages/pendingVenueApprovals/pendingVenueApprovals.js

| 键 | 定稿／处理 | 情境 |
|---|---|---|
| applicantAssignment | 借用岗位 | 提交岗位 |
| approverAssignment | 处理岗位： | 处理岗位 |
| contextSwitchRequired | 请切换工作角色后处理 | 当前角色无权 |
| requiredContextPrefix | 请切换到以下任一岗位： | 可处理岗位候选 |
| requiredContextGeneric | 请先切换到有权审批这条借用的工作角色。 | 无具体候选摘要 |
| switchWorkContext | 切换工作角色 | 统一入口 |
| copy_0531ed9e78 | 本次操作未获通过，请刷新借用详情后查看。 | 仅明确业务拒绝 |
| copy_06dbb49961 | 取消 | 放弃编辑 |
| copy_09614cef6c | 关闭 | 关闭详情 |
| copy_0c90eb0204 | 驳回 | 审批动作 |
| copy_109f042664 | 待审批列表 | 列表标题 |
| copy_1264209cb6 | 更新于␠ | 时间前缀 |
| copy_1bb7eb3e1a | 通过 | 审批动作 |
| copy_1f13a570b9 | 选择下一步审批岗位 | 候选必须按岗位选择 |
| copy_1fc8f9baba | 当前工作角色的待审批事项 | 管理身份也可能进入 |
| copy_2ea2cd3a4f | 删除未引用旧语料 | 已核实业务页面无引用；不得复活学号搜索 |
| copy_310d71700e | 待审批 | 状态 |
| copy_34e2d1f8a0 | 组织 | 标签 |
| copy_36be0dfa1c | 待我处理 | 页签 |
| copy_3b3b392755 | 审批意见： | 标签 |
| copy_3fc6899daa | 指定下一步审批岗位（选填） | 岗位选择；不得改业务必填逻辑 |
| copy_4202a27ca6 | 借用时间 | 时间类型 |
| copy_48283f4043 | 借用详情 | 标题 |
| copy_49ef170f0b | 确认通过 | 动作 |
| copy_4edcf754ff | 收起详情 | 独立图标 |
| copy_545113905f | 刷新 | 更新已读数据 |
| copy_5aaf844f1e | 待我审批 | 页签 |
| copy_5dbaec0fcf | 暂无可选审批岗位 | 成功空候选，不泛称成员 |
| copy_638da8ae60 | 武汉大学学生会 | 固定品牌 |
| copy_6986f4a5fd | 选择审批岗位 | 岗位卡片 |
| copy_8650ae5bf6 | 审批历史 | 页签 |
| copy_866290fa02 | 审批人： | 实际人标签 |
| copy_8aee737e64 | 状态 | 标签 |
| copy_8e2f75159e | 通过 | 动作 |
| copy_9639901862 | 借用申请 | 对象 |
| copy_9ba3b8c8a9 | 场地借用 | 子应用 |
| copy_9e26c149ee | 当前步骤 | 阶段 |
| copy_9e545997b0 | 步 | 数量单位 |
| copy_a14c4e583b | 暂无待审批事项 | 读取成功为空 |
| copy_a93266a8d4 | 请说明驳回原因，例如：时间冲突，请调整借用时间。 | 输入示例 |
| copy_aa4f0ed6cd | WHUSU智慧工作台 | 品牌 |
| copy_b4432643e3 | 驳回 | 动作 |
| copy_baec508307 | 查看详情 | 独立图标 |
| copy_bba7f8b8ba | 请先切换到有权审批这条借用的工作角色。 | 操作前角色检查 |
| copy_bbbebc1abf | 场地 | 标签 |
| copy_bddb855314 | 审批意见（选填） | 通过意见；驳回必填不得共用 |
| copy_bef4bbef62 | 例如：同意借用。 | 输入示例 |
| copy_c5d9511809 | 说明 | 借用说明 |
| copy_cd42af3f87 | 确认驳回 | 动作 |
| copy_ce30bda5a2 | 借用人 | 人员 |
| copy_dc59906817 | 已完成 | 进度 |
| copy_dcadcebf08 | 审批时间： | 时间 |
| copy_e52119b17e | 待审批事项未能加载，请重试。 | listPendingVenueApprovals读取失败 |
| copy_e58fa637eb | 审批岗位未能加载，请重试。 | listVenueApproverCandidates读取失败 |
| copy_e8d9493a44 | 至 | 时间范围 |
| copy_ef8b7ffa9b | 第 | 序号 |
| copy_f658e7b4d0 | 退回：不得用“已”拼接审批成功句 | 需独立通过／驳回成功完整句 |
| navigationTitle | 待我审批 - WHUSU智慧工作台 | 导航 |

新增审批成功句：approvalPassed＝“借用申请已通过。”；approvalRejected＝“借用申请已驳回。”，仅真实对应操作成功后使用。首步或中间步通过并不保证整个申请已通过，分步调用使用stepApproved＝“当前审批步骤已通过。”；仅返回status=success未返回整体状态时不能选approvalPassed。

待审批组件读取失败必须有独立失败区域，使用copy_e52119b17e和“重新加载”按钮（retryPending新增）；失败不得显示“全部处理完”或“暂无待审批事项”。已加载内容继续显示时须保留失败提示。

本批待审批页旧字词拼接与失败结构待实施整改，借用创建及场地管理页仍在独立审查，不能据本稿标记全部场地页面完成。

## pages/venueBooking/venueBooking.js

下表的“保留”均为已逐条确认的字段名、状态、标准日期单位或既有品牌，不代表未审。时间规则碎片另有结构要求；涉及写入的失败键仅用于明确拒绝，未知结果走公共反馈。

| 键 | 定稿／处理 |
|---|---|
| timelineTicks | 保留数组：0:00、6:00、12:00、18:00、24:00；时间轴刻度 |
| applicantAssignment | 借用岗位 |
| approverAssignment | 处理岗位： |
| contextSwitchRequired | 请切换工作角色后处理 |
| noActiveAssignment | 当前工作角色没有可用于提交借用的岗位。 |
| noActiveAssignmentNotice | 当前未选择有效岗位。你可以查看有权访问的场地和借用记录；提交借用或审批前，请先切换工作角色。 |
| requiredContextPrefix | 请切换到以下任一岗位： |
| requiredContextGeneric | 请先切换到有权处理这条借用的工作角色。 |
| switchWorkContext | 切换工作角色 |
| copy_015de41f7c | 2小时 |
| copy_017e3df1a1 | 周四 |
| copy_02ef2f799d | 提交借用申请 |
| copy_0522689efc | 选择第一步审批岗位 |
| copy_0531ed9e78 | 本次操作未获通过，请刷新借用详情后查看。 |
| copy_059dd7bc2c | 取消借用 |
| copy_06dbb49961 | 取消 |
| copy_09614cef6c | 关闭 |
| copy_0b091cba77 | 结束时间必须晚于开始时间，请重新选择。 |
| copy_0c90eb0204 | 驳回 |
| copy_10bd4c9a19 | 确认取消 |
| copy_10df33d76e | 请选择晚于现在的借用时间。 |
| copy_11286a7a75 | 结束时间不在场地开放时段内，请重新选择。 |
| copy_183fdf9907 | 借用 |
| copy_1bb7eb3e1a | 通过 |
| copy_1c5bbf664c | 已借用 |
| copy_1df9bf856e | 结束使用 |
| copy_1f13a570b9 | 选择下一步审批岗位 |
| copy_21268f5ef7 | 退回碎片，改 occupiedRange(time)：{time} 已被占用，请选择不重叠的借用时段。 |
| copy_2220286f1c | 已完成 |
| copy_26f5cb7f15 | 使用已结束 |
| copy_28981b382e | 暂无借用记录 |
| copy_29ea17e75c | 请选择审批流程。 |
| copy_2b262b7940 | 借用申请 |
| copy_2bd6adcbb9 | 结束时间 |
| copy_2ea2cd3a4f | 删除未引用旧学号搜索语料 |
| copy_2edf3fde90 | 补充说明 |
| copy_2f48862253 | 周三 |
| copy_301f0250ef | 这条借用未能取消，请刷新详情后查看。 |
| copy_310d71700e | 待审批 |
| copy_34e2d1f8a0 | 组织 |
| copy_36be0dfa1c | 待我处理 |
| copy_391b522838 | 日程 |
| copy_39fcaa02ad | 借用日期 |
| copy_3b3b392755 | 审批意见： |
| copy_3bc010171a | 审批流程 |
| copy_3ecbe06312 | 场地浏览 |
| copy_3fc6899daa | 指定下一步审批岗位（选填） |
| copy_40d594ac66 | 借用详情 |
| copy_41a9548e60 | 周五 |
| copy_4202a27ca6 | 借用时间 |
| copy_44ce05c859 | 退回规则句碎片，见完整时间规则定稿 |
| copy_47cd44e2ed | 更新于 |
| copy_48283f4043 | 借用详情 |
| copy_49eedaa56d | 活动 |
| copy_49ef170f0b | 确认通过 |
| copy_4edcf754ff | 收起详情 |
| copy_4f15bb9939 | 直接通过 |
| copy_52cc321ea5 | 1小时 |
| copy_545113905f | 刷新 |
| copy_552d783261 | 快捷时长 |
| copy_560bd817fb | 请先选择开始时间。 |
| copy_57f8fbd947 | 退回相对时间拼句，见完整时间规则定稿 |
| copy_584ba3052b | 不限制最早提交时间 |
| copy_591a108272 | 结束使用 |
| copy_592351d93c | 场地借用 |
| copy_59799547cb | 退回日期碎片，改 weekFrom(date)：{date} 起的一周 |
| copy_5aaf844f1e | 待我审批 |
| copy_5b5ccadb74 | 备注（选填） |
| copy_5c8d830c46 | 正在加载场地信息 |
| copy_5d5af942c5 | 已驳回 |
| copy_5dbaec0fcf | 暂无可选审批岗位 |
| copy_638da8ae60 | 武汉大学学生会 |
| copy_6491116806 | 所选时间不在可借用范围内，请重新选择。 |
| copy_66a92fc57e | 指定第一步审批岗位（选填） |
| copy_6986f4a5fd | 选择审批岗位 |
| copy_6a72419c84 | 未开放 |
| copy_6ce770a0a6 | 请先选择借用日期。 |
| copy_6d6ab79183 | 退回数量碎片，见周期完整说明 |
| copy_70d4911767 | 改 venueClosedAt(time)：{time} 场地不开放，请选择其他时段。 |
| copy_761b97e0d4 | 需审批 |
| copy_789e05b4e1 | 占用时段 |
| copy_7bbe7387fa | 小时 |
| copy_7c25b53857 | 本次占用 |
| copy_7d2ebd6d78 | 这次借用已完成，不能再取消。 |
| copy_7db68605c6 | 请填写借用事由。 |
| copy_824768a506 | 所选日期没有可借用时段，请选择其他日期。 |
| copy_82b3c19342 | 退回相对时间拼句，见完整时间规则定稿 |
| copy_8650ae5bf6 | 审批历史 |
| copy_866290fa02 | 审批人： |
| copy_8aa6e63e5e | 已借用 |
| copy_8aee737e64 | 状态 |
| copy_8e2f75159e | 通过 |
| copy_8f73640107 | 待审批 |
| copy_902c3411f2 | 请选择今天或之后的借用日期。 |
| copy_91fd6d9600 | 借用时间 |
| copy_92af9d9017 | 周一 |
| copy_960969cd90 | 退回数量碎片，见周期完整说明 |
| copy_9639901862 | 借用申请 |
| copy_96eaa4c0be | 正在查询可借用时段 |
| copy_9ba3b8c8a9 | 场地借用 |
| copy_9d1ff80fae | 请选择借用日期。 |
| copy_9dc5c7d79f | 请补全借用申请中的必填内容。 |
| copy_9e26c149ee | 当前步骤 |
| copy_9e545997b0 | 步 |
| copy_9e824e777e | 退回提交截止碎片，见完整时间规则定稿 |
| copy_9feed17479 | 分钟 |
| copy_a14c4e583b | 暂无待审批事项 |
| copy_a1f843d887 | 已占用 |
| copy_a22e0c994a | 借用已开始。如需提前结束，请选择“结束使用”。 |
| copy_a60fcec226 | 暂无可用场地 |
| copy_a814b25100 | 周日 |
| copy_a8a6082fe6 | 已占用 |
| copy_a93266a8d4 | 请说明驳回原因，例如：时间冲突，请调整借用时间。 |
| copy_aa4f0ed6cd | WHUSU智慧工作台 |
| copy_aa510c50b5 | 所选日期不在可借用范围内，请重新选择。 |
| copy_ab5ebc56e8 | 请重新选择借用日期。 |
| copy_abf766aebc | 退回占用碎片，使用occupiedRange |
| copy_acd4c5c171 | 活动 |
| copy_ad183b164d | 未设置岗位 |
| copy_ad310c8780 | 使用中 |
| copy_b210c95498 | 可用场地 |
| copy_b40ec83bc1 | 我的借用 |
| copy_b4432643e3 | 驳回 |
| copy_b71db2ea6f | 拖动滑块调整借用的开始和结束时间。 |
| copy_b80d60c556 | 周 |
| copy_b8c87b0fb5 | 未设置结束日期 |
| copy_baec508307 | 查看详情 |
| copy_bba7f8b8ba | 请先切换到有权提交借用的工作角色。 |
| copy_bbb0cc00c9 | 借用事由 |
| copy_bbbebc1abf | 场地 |
| copy_bd24ac5b0c | 确认 |
| copy_bddb855314 | 审批意见（选填） |
| copy_bef4bbef62 | 例如：同意借用。 |
| copy_c1ce05d451 | 该时段已安排活动，请选择不重叠的借用时段。 |
| copy_c3a847252e | 30分钟 |
| copy_c44dbba9e9 | ␠至␠ |
| copy_c46b04a9c5 | 该时段已被占用，请选择其他时段。 |
| copy_c4df6642e3 | 活动占用详情 |
| copy_c51e10955c | 开始 |
| copy_c5aa06059a | 次 |
| copy_c5d9511809 | 说明 |
| copy_c895f6c29e | 原安排： |
| copy_c96ab61422 | 1.5小时 |
| copy_cb696a9796 | 选择或填写借用事由 |
| copy_ccd4af477f | 借用申请未获提交，请检查申请内容。 |
| copy_cd42af3f87 | 确认驳回 |
| copy_ce171a2581 | 已通过 |
| copy_ce30bda5a2 | 借用人 |
| copy_d08fb8244e | 退回提前天数碎片，见完整时间规则定稿 |
| copy_d5973d50ff | 3小时 |
| copy_db4932f471 | 退回提交截止碎片，见完整时间规则定稿 |
| copy_dc59906817 | 已完成 |
| copy_dcadcebf08 | 审批时间： |
| copy_deb776d2af | 开始时间 |
| copy_decce2c059 | 借用记录 |
| copy_e3233a4b58 | 周二 |
| copy_e52119b17e | 未确认具体调用前不批准；读写须拆开 |
| copy_e58fa637eb | 未确认具体调用前不批准；读写须拆开 |
| copy_e75039f02b | 我知道了 |
| copy_e7c53f5f68 | 结束后，借用结束时间将改为现在。是否结束使用？ |
| copy_e8d9493a44 | 至 |
| copy_eb3a2a30a8 | 空闲 |
| copy_ed57cd26dc | 结束 |
| copy_eeb5f0e78e | 重复活动有效期： |
| copy_ef8b7ffa9b | 第 |
| copy_f2c74088c9 | 周六 |
| copy_f54e24d97d | 未设置开始日期 |
| copy_f658e7b4d0 | 删除成功句碎片，按待审批页独立结果句 |
| copy_fbf78f3644 | 活动规则 |
| copy_fc99c4cc7b | 正在加载场地信息 |
| copy_fcd3dd2cc8 | 天 |
| copy_fd4601c1f9 | 已取消 |
| copy_ff86a949be | 暂无借用记录 |
| copy_ff9e9017e0 | 是否取消这次借用？ |
| navigationTitle | 场地借用 - WHUSU智慧工作台 |

结构要求：规则摘要中的开放／截止必须明确是“申请提交时间”，不与场地开放时间混用。完整句格式待前端核实实际参数：按天开放、按提前时长开放、按天截止、按提前时长截止分别使用不同格式函数；不得以字符串前后半句继续替换。周期说明中的数量也须核实是次数还是日期跨度，不能只凭“共”猜测。

### 时间规则参数核实后的定稿

frontend已核实际mode为days/minutes，days为天数，minutes可换算为小时与分钟，repeatCount为次数。以下函数可以实施；格式化时0小时或0分钟省略，不留下“0小时30分钟”的冗余。

| 新键／函数 | 定稿 |
|---|---|
| submissionOpenDays(days) | 最早可在借用日期前 {days} 天提交申请 |
| submissionOpenDuration(duration) | 最早可在借用开始前 {duration} 提交申请 |
| submissionOpenUnlimited | 不限制最早提交时间 |
| submissionDeadlineDays(days) | 请在借用日期前 {days} 天提交申请 |
| submissionDeadlineDuration(duration) | 请至少提前 {duration} 提交借用申请 |
| submissionDeadlineAtStart | 请在借用开始前提交申请 |
| durationHours(hours) | {hours} 小时 |
| durationMinutes(minutes) | {minutes} 分钟 |
| durationHoursMinutes(hours,minutes) | {hours} 小时 {minutes} 分钟 |
| repeatedOccurrences(count) | 共安排 {count} 次 |
| weekFrom(date) | {date} 起的一周 |

天数mode若服务端含每日截止钟点，还需独立显示其真实时间，不用提前整24小时替代按日计算。e521/e58分别使用“借用记录未能加载，请重试。”与“审批岗位未能加载，请重试。”，不得在写入catch用它们。
