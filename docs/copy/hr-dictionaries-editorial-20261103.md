# 人事字典与管理入口：独立语言审稿

以下来源为 `generated/subpackages/scoring/pages/admin/modules/`。字典删除受引用检查约束，不得引导删除业务历史来解锁。保存失败与网络未确认区别按公共反馈实现；日志前缀不是界面提示，不能显示异常内容。

人事管理独立新增 `adminPersonnel.memberSearchPlaceholder`：**搜索姓名或学号**。仅用于有权的人事成员目录；不能引用已删除的场地学号搜索旧键。系统设置的 `system.currentOrganizationLabel` 则引用 `settingsBehavior.systemDefaultOrganization`（默认组织），不引用当前工作角色的组织标签。

## workGroupBehavior.js 全部键

| 键 | 定稿 | 情境 |
|---|---|---|
| copy_076bb5d383 | 职能组未能删除，请检查是否仍被岗位或规则使用。 | 明确拒绝；网络未知另用公共反馈 |
| copy_1d828c61a6 | 职能组已删除 | 成功 |
| copy_215e3c57da | 职能组未能保存，请检查名称和所属部门。 | 明确拒绝 |
| copy_2bc5d4cf83 | 删除职能组 | 标题 |
| copy_4b213fd88a | 取消 | 取消动作 |
| copy_4fdb08add2 | 职能组已保存 | 成功 |
| copy_54e953f1bb | 无 | 缺选项标签 |
| copy_5778bc8da0 | 职能组列表未能加载，请重试。 | 读取失败 |
| copy_7093ebdf5f | 职能组列表读取失败 | 诊断前缀，不得直接展示日志 |
| copy_7f31eec657 | 确认删除 | 删除确认 |
| copy_ce1f5597c6 | 请填写职能组名称。 | 本地验证 |
| copy_e9870f418c | 是否删除这个职能组？正在使用的职能组不能删除。 | 字典删除，不删除成员 |

## departmentBehavior.js 全部键

| 键 | 定稿 | 情境 |
|---|---|---|
| copy_076bb5d383 | 部门未能删除，请检查是否仍被岗位或规则使用。 | 明确拒绝 |
| copy_215e3c57da | 部门未能保存，请检查填写内容。 | 明确拒绝 |
| copy_21cc5de126 | 删除部门 | 标题 |
| copy_2531b7527d | 请填写部门名称。 | 本地验证 |
| copy_3ab009e9ad | 部门列表未能加载，请重试。 | 读取失败 |
| copy_4b213fd88a | 取消 | 动作 |
| copy_59591bcd20 | 部门列表读取失败 | 诊断前缀 |
| copy_7f31eec657 | 确认删除 | 动作 |
| copy_89017791b3 | 部门已保存 | 成功 |
| copy_8fe7c4c171 | 是否删除这个部门？正在使用的部门不能删除。 | 不混同成员清理 |
| copy_e7dcd6f241 | 部门已删除 | 成功 |

## identityBehavior.js 全部键

| 键 | 定稿 | 情境 |
|---|---|---|
| copy_076bb5d383 | 身份类别未能删除，请检查是否仍被岗位或规则使用。 | 明确拒绝 |
| copy_215e3c57da | 身份类别未能保存，请检查填写内容。 | 明确拒绝 |
| copy_30267845ce | 是否删除这个身份类别？正在使用的身份类别不能删除。 | 不混同授权身份 |
| copy_437b04668d | 身份类别已保存 | 成功 |
| copy_4b213fd88a | 取消 | 动作 |
| copy_7f31eec657 | 确认删除 | 动作 |
| copy_9167d1395d | 删除身份类别 | 标题 |
| copy_b538d2281a | 身份类别列表读取失败 | 诊断前缀 |
| copy_e000ed06dd | 身份类别已删除 | 成功 |
| copy_f5b2fb24f1 | 请填写身份类别名称。 | 本地验证 |
| copy_f878df1668 | 身份类别列表未能加载，请重试。 | 读取失败 |

这三份文件全部键已审阅。动态确认最好独立展示待删选项名称；不要在正文内用无上下文的“这个”代替对象卡。现有窗口若没有名称，须新增独立名称行并保留共享确认结构。

## settingsBehavior.js 全部键

新增默认组织9项已在shared-runtime稿定稿，此处按实际接入复审同值批准：systemDefaultOrganization、setSystemDefaultOrganization、systemDefaultOrganizationHelp、settingDefaultOrganization、defaultOrganizationSaved(name)、defaultOrganizationRejected、defaultOrganizationUnknown、organizationCreatedDefaultUnknown(name)、organizationCreatedDefaultRejected(name)。这些设置不改变当前工作角色；创建组织和设置默认是两次请求，第二次不确定时不能引导重复创建。

| 键 | 定稿／处理 | 情境 |
|---|---|---|
| copy_076bb5d383 | 组织未能删除，请检查是否仍有关联资料。 | 明确删除拒绝 |
| copy_0a1deb4187 | 默认组织已更新 | 成功 |
| copy_0ff87aff65 | 正在设置默认组织 | 进行中 |
| copy_215e3c57da | 设置未能保存，请检查填写内容。 | 明确拒绝 |
| copy_292043f789 | 删除 | 操作 |
| copy_4706701186 | 正在创建组织 | 不提前宣称已成为默认 |
| copy_4b213fd88a | 取消 | 放弃 |
| copy_53d5e0a0c8 | 默认组织未能设置，请刷新设置后查看。 | 不是切换角色失败 |
| copy_6616a4de3c | 设为默认 | 组织操作 |
| copy_770ca6e54d | 组织已删除 | 成功 |
| copy_7946938ca9 | 正在删除组织 | 进行中 |
| copy_96a69f21ff | 删除组织 | 标题 |
| copy_a032183564 | 请填写组织名称。 | 本地验证 |
| copy_a58d703333 | 设置默认组织 | 不混同本人登录偏好 |
| copy_b3614bb93e | 组织未能创建，请检查组织名称。 | 明确拒绝 |
| copy_c1360f875d | 只能删除没有关联资料且未设为默认的组织。删除后无法恢复，是否继续？ | 名称另行展示 |
| copy_c1add6c36e | 设置已保存 | 成功 |
| copy_d41345ef29 | 组织已保存 | 成功 |
| copy_d5f0842283 | 确认 | 通用确认 |
| copy_e7e3787584 | 退回碎片与未核实承诺；使用systemDefaultOrganizationHelp | 不保证任意新用户立即进入该组织 |
| copy_fcc6193afc | 新建组织并设为默认 | 明示两项动作 |

## authPersonnelBehavior.js：已明确条目

凭据导出只能依据真实文件输出结果提示，生成文件不等于保存成功。恢复和认证分开，冻结是全局账号操作，不能淡化为当前组织停用。以下为本文件逐项审阅；标待核的文字不批准实施，文末追加的最终批准优先。

| 键 | 定稿／处理 |
|---|---|
| accountStateUnknown | 账号状态暂未确认 |
| accountNotCreated | 未创建账号 |
| accountPendingVerification | 待认证 |
| credentialRevokeAction | 撤销 |
| credentialSelectedPrefix | 已选择␠ |
| credentialSelectedSuffix | ␠名成员 |
| credentialExportColumnName | 姓名 |
| credentialExportColumnStudentId | 学号（仅专用授权人事导出） |
| credentialExportColumnVerificationCode | 认证码 |
| credentialExportColumnRecoveryCode | 恢复码 |
| credentialExportFileVerification | 认证码清单 |
| credentialExportFileRecovery | 恢复码清单 |
| credentialExportSheetVerification | 认证码 |
| credentialExportSheetRecovery | 恢复码 |
| credentialExportFormatExcel | Excel 表格（.xlsx） |
| credentialExportFormatCsv | CSV 文本（.csv） |
| credentialExportEmptyVerification | 暂无可导出的认证码 |
| credentialExportEmptyRecovery | 暂无可导出的恢复码 |
| credentialExportFailed | 凭据清单未能生成，请重试。 |
| recoveryRevokeBatchTitle | 批量撤销恢复码 |
| recoveryRevokeMessage | 撤销后，所选成员的当前恢复码将立即失效。 |
| recoveryRevokeTitle | 撤销恢复码 |
| verificationRevokeBatchTitle | 批量撤销认证码 |
| verificationRevokeMessage | 撤销后，所选成员的当前认证码将立即失效。 |
| verificationRevokeTitle | 撤销认证码 |
| copy_0531ed9e78 | 本次操作未获通过，请刷新成员详情后查看。 |
| copy_0aacec2714 | 已保存 |
| copy_0bc2266433 | 所选成员不需要生成认证码。 |
| copy_16399ef078 | 待恢复账号 |
| copy_171e9799a7 | 待核：若仅微信状态，改已绑定微信 |
| copy_1ceaebed03 | 待核：不得把未绑定微信认定为待激活 |
| copy_202391487f | 尚未生成认证码 |
| copy_215e3c57da | 认证设置未能保存，请检查填写内容。 |
| copy_2b6803bda1 | 待生成认证码 |
| copy_2b8b8bf904 | 当前组织 |
| copy_2e5c18ad5a | 恢复码有效 |
| copy_2f9c8ba49c | 完成账号认证后可设置恢复码。 |
| copy_35ca909941 | 凭据生成未全部确认完成，请查看各成员的处理结果。 |
| copy_3947b0ede8 | 所选成员暂无可用账号。 |
| copy_42e9898395 | 恢复码已撤销 |
| copy_439c4fcf37 | 认证设置未能加载，请重试。 |
| copy_4b5b472953 | 已撤销 |
| copy_4c2f44d390 | 解绑后，原微信将不能用于登录，已有登录也会结束。该成员需使用其他可用方式重新登录。 |
| copy_4c36a79f14 | 已完成认证 |
| copy_4defd9babd | 账号已冻结 |
| copy_5254a703ec | 恢复码撤销未全部确认完成，请查看各成员的处理结果。 |
| copy_5b583a7975 | 账号已解除冻结 |
| copy_5cde2d7c64 | 清除 |
| copy_65d888be46 | 请输入新口令。 |
| copy_69d8cb0e31 | 待核设备与会话分类后定稿 |
| copy_6e1cafa10a | 成员 |
| copy_6eb4c651be | 清除后，该成员需要重新设置口令，才能使用口令登录。 |
| copy_71962e6b30 | 解绑微信 |
| copy_78b51a10ec | 待核设备与会话分类后定稿 |
| copy_8351ecc192 | 凭据未能撤销，请刷新成员详情后查看。 |
| copy_8724ac4ea3 | 冻结后，该成员的账号将无法使用工作台，包括在其他组织的工作角色。 |
| copy_87e91ac4b4 | 待认证成员 |
| copy_8832186f8b | 认证码已撤销 |
| copy_8986ce443d | 登录口令已清除 |
| copy_89be75a701 | 账号设置未能更新，请刷新成员详情后查看。 |
| copy_8e4abe3d58 | 账号正常 |
| copy_9662ceba48 | 凭据未能生成，请刷新成员详情后查看。 |
| copy_a2c1301ea7 | 尚未生成恢复码 |
| copy_aef40f4a64 | 认证设置 |
| copy_b04a71edad | 该成员 |
| copy_b86e259dd7 | 解绑 |
| copy_b88a1260e3 | 冻结 |
| copy_ba9b0425fd | 待核：若仅微信状态，改未绑定微信 |
| copy_bff49f783f | 本次操作未获通过，请刷新成员详情后查看。 |
| copy_c3f53dd501 | 退出 |
| copy_c69999ba88 | 待核设备与会话分类后定稿 |
| copy_cb56cac0f1 | 最近使用时间未记录 |
| copy_cd01c4669c | 口令已更新 |
| copy_d337157f74 | 全部组织 |
| copy_d7ceb7b422 | 认证码生成未全部确认完成，请查看各成员的处理结果。 |
| copy_dc71c071bc | 账号已恢复 |
| copy_ddaba44b59 | 已冻结 |
| copy_ddd0a0c28a | 认证码有效 |
| copy_e169da88b9 | 待核设备与会话分类后定稿 |
| copy_e5392c8b50 | 恢复码生成未全部确认完成，请查看各成员的处理结果。 |
| copy_e58fa637eb | 待核具体读取或写入调用 |
| copy_e9798c95c0 | 认证码撤销未全部确认完成，请查看各成员的处理结果。 |
| copy_eb1ebe5d11 | 冻结账号 |
| copy_f250d102a5 | 所选成员暂无可撤销的认证码。 |
| copy_f6eb285e87 | 已冻结 |
| copy_f8990cda8e | 清除登录口令 |
| copy_fe17a0abf0 | 凭据撤销未全部确认完成，请查看各成员的处理结果。 |

部分成功必须保留逐成员结果；若界面没有处理结果列表，不批准只加“请查看”而没有入口。凭据撤销说明中的“所选成员”单人也适用，但单人卡必须同时显示姓名。

## adminManagementBehavior.js 全部键

真实新增仍可达，按能力控制；不能把整份旧页语料当作未使用删除。新版从已有成员中选择，旧兼容表单可能输入姓名学号，必须分别校验提示。

| 键 | 定稿／处理 | 情境 |
|---|---|---|
| copy_076bb5d383 | 管理身份未能移除，请刷新列表后查看。 | 明确拒绝，不删除自然人 |
| copy_215e3c57da | 管理身份未能保存，请检查所选成员和管理身份。 | 明确拒绝 |
| copy_2b61466286 | 管理员清单未能生成，请重试。 | 生成失败，不承诺系统保存 |
| copy_6026566679 | 管理员列表未能加载，请重试。 | 读取失败 |
| copy_87c8c6a02a | 已填入所选成员的信息 | 只填草稿，不代表已授管理权 |
| copy_98d4171816 | 请填写管理员姓名和学号。 | 仅旧兼容输入表单；新版选择缺失用新键 |
| copy_99539c496e | 管理身份已保存 | 写入成功 |
| copy_ab0b962d3e | 管理身份已移除 | 成功，不暗示删除人 |
| adminMemberRequired（新增） | 请先选择需要授予管理身份的成员。 | 新版已有账号候选 |

若删除接口实际同时删除旧版管理员行，用户后果仍是撤掉这项管理身份，不是删除其账号或全部人事资料。移除确认必须展示姓名及这项管理身份。

## 账号安全追加定稿与结构要求

`revokeMemberDevice` 实际按 `sessionId` 或 `deviceKey` 执行，须分别显示下列语料，不把一次会话撤销说成退出整台设备。旧69d8拼接、78b5标题及c699成功提示改为这些完整键；e169默认设备名称保留对象含义。

| 键 | 定稿 | 适用条件 |
|---|---|---|
| endSessionTitle | 结束这次登录 | sessionId撤销 |
| endSessionBody(name) | 是否结束“{name}”这次登录？该成员需要重新登录后才能继续使用。 | 指定登录记录 |
| endSessionDone | 这次登录已结束 | 已确认成功 |
| signOutDeviceTitle | 退出这台设备 | deviceKey撤销 |
| signOutDeviceBody(name) | 是否结束“{name}”上的全部登录？该成员需要重新登录后才能在这台设备继续使用。 | 指定设备全部会话 |
| signOutDeviceDone | 这台设备上的登录已结束 | 已确认成功 |
| copy_e169da88b9 | 未识别的设备 | 无业务设备名称 |
| copy_e58fa637eb | 账号认证信息未能加载，请重试。 | 实际读取认证目录及策略，非写入 |
| batchResultTitle | 批量处理结果 | 持久结果区域标题 |
| batchCompleted | 已完成 | 有成功响应的人员 |
| batchUnconfirmed | 结果待确认 | 断网、响应无法解析等不能确认是否写入 |
| batchRejected | 未获通过 | 明确业务拒绝且未写入 |
| batchUnconfirmedHelp | 部分人员的处理结果尚未确认，请先重新加载查看，避免重复操作。 | 不能声称整批失败或自动重试 |
| copy_35ca909941 | 凭据生成未全部确认完成，请查看各成员的处理结果。 | 可能混合明确拒绝与结果未知，不称均未生成 |
| copy_fe17a0abf0 | 凭据撤销未全部确认完成，请查看各成员的处理结果。 | 可能混合明确拒绝与结果未知，不称均未撤销 |
| copy_d7ceb7b422 | 认证码生成未全部确认完成，请查看各成员的处理结果。 | 认证码生成混合结果 |
| copy_e5392c8b50 | 恢复码生成未全部确认完成，请查看各成员的处理结果。 | 恢复码生成混合结果 |
| copy_e9798c95c0 | 认证码撤销未全部确认完成，请查看各成员的处理结果。 | 认证码撤销混合结果 |
| copy_5254a703ec | 恢复码撤销未全部确认完成，请查看各成员的处理结果。 | 恢复码撤销混合结果 |
| bindingStatusUnknown | 微信绑定状态暂未确认 | 缺失或未知bindingStatus，不能默认未绑定 |

批量部分失败仅Toast的结构不批准。至少在当前页保留结果摘要及人员名单；成功名单与结果待确认名单分开，不能把未知批次合并成失败人数。已有生成凭据结果应保留，不因后续批次失败而丢弃；敏感凭据不写入日志。只有完成权威重读后才能缩小待确认集合。

管理身份菜单复用 `home.text.superAdmin`／`home.text.admin`；账号状态使用人事已批准映射：verified=账号正常、pending_verification=待认证、frozen=账号已冻结、recovery_required=需要恢复账号；未知值=账号状态暂未确认，不回退到微信绑定状态。选项是否可创建仍由服务端返回的value决定，不因本地有标签而添加权限。

两端复核纠正：原生authPersonnelBehavior不引用copy_171e9799a7、copy_1ceaebed03、copy_ba9b0425fd，但网页HrAccountGovernance仍从此源引用171e及ba9。因此保留copy_171e9799a7“已绑定微信”、copy_ba9b0425fd“未绑定微信”；新增bindingStatusUnknown“微信绑定状态暂未确认”，缺失或未知bindingStatus不能被二元表达式判断为未绑定。仅copy_1ceaebed03无实际两端引用，允许移除；人事导出的同名键按其单独审稿处理。
