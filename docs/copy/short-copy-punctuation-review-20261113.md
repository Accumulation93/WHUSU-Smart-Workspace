# 全局短文案标点审核清单

2026-11-13；独立语言 Agent。范围为 shared/locales/zh-CN 的全部 88 个文件，包括 generated。只读扫描用于定位，不自动改写任何语料。下列逐项定稿才可实施；实施者不得按长度、句号或同值批量替换。长说明、完整确认与多句提示保留自然标点；拼接片段须先检查完整句子，不孤立删句号。路径均相对 shared/locales/zh-CN。

## 第一批：通用、岗位性质、查询与业务短状态（批准）

| 文件 | 键 | 新值 | 情境 |
|---|---|---|---|
| assignmentNatures.js | nameRequired | 请填写岗位性质名称 | 单行校验 |
| assignmentNatures.js | descriptionTooLong | 描述不能超过2000字 | 单行校验 |
| assignmentNatures.js | loadFailed | 岗位性质未能加载，请重试 | 单行失败 |
| assignmentNatures.js | saveFailed | 岗位性质未能保存，请重试 | 单行失败 |
| assignmentNatures.js | deleteFailed | 岗位性质未能删除，请重试 | 单行失败 |
| calendar.js | participantsFailed | 参会人未能加载，请重试 | 单行失败 |
| calendar.js | invalidSchedule | 请检查日程日期、时间和重复设置 | 表单校验 |
| calendar.js | rangeTooLarge | 请选择不超过一年的日期范围 | 表单校验 |
| calendar.js | operationFailed | 日程操作未完成，请刷新查看结果 | 单行反馈 |
| calendar.js | subscriptionRevoked | 此订阅地址已失效 | 短状态 |
| calendar.js | reminderText | {title}即将开始 | 通知单行标题变量保持 |
| contactDirectory.js | loadFailed | 通讯录未能加载，请点击重试 | 单行失败 |
| contactDirectory.js | operationFailed | 操作未完成，请重试 | 单行失败 |
| contactDirectory.js | copyFailed | 复制未完成，请重试 | 单行失败 |
| contactDirectory.js | forbidden | 你没有通讯录规则管理权限 | 单行拒绝 |
| requestFeedback.js | networkUnavailable | 网络连接失败，请检查网络后重试 | 单行失败 |
| requestFeedback.js | readTimeout | 加载超时，请重试 | 单行失败 |
| requestFeedback.js | readFailed | 暂时无法加载，请稍后重试 | 单行失败 |
| requestFeedback.js | sessionExpired | 登录已失效，请重新登录 | 单行反馈 |
| requestFeedback.js | loginRequired | 请先登录后再操作 | 单行反馈 |
| requestFeedback.js | forbidden | 当前工作角色没有这项操作权限 | 单行拒绝 |
| requestFeedback.js | busy | 服务暂时繁忙，请稍后重试 | 单行反馈 |
| requestFeedback.js | rateLimited | 操作过于频繁，请稍后重试 | 单行反馈 |
| requestFeedback.js | cancelled | 已取消 | 短状态 |
| requestFeedback.js | checkingWriteResult | 正在确认操作结果，请稍候 | 加载 |
| requestFeedback.js | writeStillPending | 操作仍在处理中，请稍后查看结果 | 单行反馈 |
| requestFeedback.js | copyFailed | 复制未完成，请重试 | 单行失败 |
| requestFeedback.js | downloadFailed | 文件下载失败，请检查网络后重试 | 单行失败 |
| requestFeedback.js | emptyResult | 暂无内容 | 空态 |
| identityCard.js | failure | 身份卡暂时无法读取，请重试 | 单行失败 |
| identityCard.js | qrFailure | 核验码暂时无法生成，请重试 | 单行失败 |
| identityNatureRelations.js | selectNatureRequired | 请至少选择一种岗位性质 | 单行校验 |
| identityNatureRelations.js | loadFailed | 身份类别未能加载，请重试 | 单行失败 |
| identityNatureRelations.js | nameRequired | 请填写身份类别名称 | 单行校验 |
| identityNatureRelations.js | chooseDescription | 请选择要保留的描述 | 单行校验 |
| identityNatureRelations.js | selectTargetNature | 请选择目标组织中对应的岗位性质 | 单行校验 |
| stampAuthorization.js | imageReadFailed | 图片读取失败，请重新选择 | 单行失败 |
| hrProfileMigration.js | emptySelection | 请先选择需要迁移资料的成员 | 单行校验 |
| hrProfileMigration.js | rejectReasonRequired | 请填写驳回原因 | 单行校验 |
| hrTemplateSave.js | fieldNumberInvalid | 请输入数字；不限制时可留空 | 输入说明 |
| hrTemplateSave.js | template_name_required | 请填写资料模板名称 | 单行校验 |
| hrTemplateSave.js | template_edit_mode_invalid | 请重新选择资料的填写方式 | 单行校验 |
| hrTemplateSave.js | template_fields_required | 请至少添加一个资料项 | 单行校验 |
| hrTemplateSave.js | field_name_required | 请填写资料项名称 | 单行校验 |
| hrTemplateSave.js | field_type_invalid | 请重新选择资料类型 | 单行校验 |
| hrTemplateSave.js | field_options_required | 请至少填写一个可选项 | 单行校验 |
| hrValueValidation.js | integer_required | 请填写整数，不要带小数 | 单行校验 |
| home.js | text.refreshTargetsLater | 评分任务未能加载，请重试 | 单行失败 |
| home.js | text.profilePending | 资料修改已提交，正在等待审核 | 状态 |
| home.js | text.profileLoadFailed | 本人资料未能加载，请重试 | 单行失败 |
| home.js | text.noFeatureInOrganization | 当前组织尚未开放这项功能 | 单行状态 |
| home.js | text.phoneHint | 请输入中国大陆手机号（11位） | 输入提示 |
| home.js | text.contactAdminToEdit | 如需修改，请联系管理员 | 输入提示 |
| home.js | text.updateFailed | 资料未能更新，请刷新后查看 | 单行失败 |
| home.js | text.enterScorePageFailed | 评分页面未能打开，请重试 | 单行失败 |
| portal.js | view.authFrozen | 账号已被冻结，请联系管理员处理 | 状态 |

main.js、responseMessages.js、authorization.js 的 require 引用不得复制改写，随原键继承；只有字面量属于可改源。

## 第二批：网页直接语料（批准）

| 文件 | 键 | 新值 | 情境 |
|---|---|---|---|
| web.js | errors.roleRequired | 请先选择工作角色 | 校验 |
| web.js | system.noPermission | 当前工作角色没有可用的管理权限 | 空态 |
| web.js | venue.chooseVenue | 请选择场地 | 校验 |
| web.js | venue.emptyPending | 当前没有需要你审批的借用申请 | 空态 |
| web.js | venue.emptyHistory | 你审批过的借用申请会显示在这里 | 空态 |
| web.js | venue.mineNote | 这里显示你提交的场地借用申请 | 单行范围说明 |
| web.js | verify.verifyFailed | 文件核对未能完成，请重试 | 失败 |
| web.js | workbench.notPortedBody | 请在小程序中打开对应页面 | 引导 |
| web.js | audit.pendingNote | 查看需要你审批的申请 | 单行引导 |
| web.js | audit.historyNote | 查看你审批过的申请及处理结果 | 单行引导 |
| web.js | audit.loadFailed | 审核申请未能加载，请重试 | 失败 |
| web.js | audit.withdrawFailed | 申请未能撤回，请刷新详情后查看 | 失败 |
| web.js | audit.approveDone | 当前审批步骤已通过 | 状态 |
| web.js | audit.detailEmptyFiles | 这份申请没有附件 | 空态 |
| web.js | audit.approveCommentPlaceholder | 可补充审批意见，也可留空 | 输入提示 |
| web.js | audit.createTitleRequired | 请填写申请标题 | 校验 |
| web.js | audit.createFilesRequired | 请至少上传一个附件 | 校验 |
| web.js | audit.signatureNameRequired | 请填写签名名称 | 校验 |
| web.js | audit.signatureEmptyCanvas | 请先在签名板上签名 | 校验 |
| web.js | audit.signatureSaveFailed | 签名未能保存，请检查填写内容 | 失败 |
| web.js | scoring.activityWindowClosed | 当前不在评分时间内 | 状态 |
| web.js | scoring.loadFailed | 评分资料未能加载，请重试 | 失败 |
| web.js | scoring.submitFailed | 评分未获提交，请检查填写内容 | 失败 |
| web.js | scoring.readOnlyNotice | 这条评分记录只能查看，不能修改 | 短状态 |
| web.js | scoring.questionRequired | 请完成所有必填评分项 | 校验 |

## 保留与后续

本清单持续补齐 generated 与其余模块。单纯目录扫描不等于逐条完成审核，不把尚未列项的内容交实施者自行去标点。具体权限稿见 authorization-clarity-copy-20261113.md。

## 第三批：评分管理页与表单工具（批准）

以下路径前缀为 generated/subpackages/scoring/pages/admin/。均为单行校验、失败、空态或短控件说明；完整删除确认与多句风险说明不变。

| 文件 | 键 | 新值 |
|---|---|---|
| admin.js | copy_1427561539 | 请选择开始日期 |
| admin.js | copy_439c4fcf37 | 认证设置未能加载，请重试 |
| admin.js | copy_4875d82d59 | 没有需要处理的原有资料 |
| admin.js | copy_4fd2c90e08 | 请选择范围 |
| admin.js | copy_5327cd39d0 | 请先选择所属部门 |
| admin.js | copy_59641d46c9 | 请选择如何处理原有资料 |
| admin.js | copy_5ece2c09c8 | 请选择目标身份类别 |
| admin.js | copy_600dad22eb | 暂无评分记录 |
| admin.js | copy_66382c2bfd | 请填写不同于已有模板的名称 |
| admin.js | copy_6d3911624a | 请选择评分活动 |
| admin.js | copy_82461fae0c | 当前工作角色没有管理权限 |
| admin.js | copy_8859c785ab | 请选择职能组 |
| admin.js | copy_961b3afe6a | 请选择评分模板 |
| admin.js | copy_9d1ff80fae | 请选择日期 |
| admin.js | copy_a36ffa9141 | 请检查表格内容 |
| admin.js | copy_b3ef8687f3 | 请为每项资料选择对应的表格列 |
| admin.js | copy_d1856227b6 | 请选择身份类别 |
| admin.js | copy_dc077c17cf | 认证设置未能加载，请重试 |
| admin.js | copy_dd83cfe437 | 请选择结束日期 |
| admin.js | copy_df3af9a329 | 请先选择部门和身份类别 |
| admin.js | copy_eada426deb | 请选择部门 |
| admin.js | copy_f81bcf5295 | 请先保存修改 |
| admin.js | hrRejectReasonRequired | 请填写驳回原因 |
| admin.js | hrCorrectionConfirm | 我已核对修改内容和受影响的组织 |
| admin.js | hrCorrectionPreviewFailed | 修改影响范围未能加载，请重试 |
| admin.js | hrCorrectionConfirmRequired | 请先核对并确认修改影响范围 |
| modules/adminUtils.js | copy_007b4d4286 | 请填写整数 |
| modules/adminUtils.js | copy_2c1cbd4cee | “{0}”不能小于 {1} |
| modules/adminUtils.js | copy_388528b146 | 请填写中国大陆手机号（11位） |
| modules/adminUtils.js | copy_3f2df8f2ed | “{0}”不能大于 {1} |
| modules/adminUtils.js | copy_7151fd51a0 | 请选择被评分人的身份类别 |
| modules/adminUtils.js | copy_821b3229b0 | 请选择可用的选项 |
| modules/adminUtils.js | copy_8a0bd4d5b9 | 请选择“{0}” |
| modules/adminUtils.js | copy_8d49f37a37 | “{0}”需要填写整数 |
| modules/adminUtils.js | copy_952bf81d5f | “{0}”需要填写数字 |
| modules/adminUtils.js | copy_993602ff18 | 请重新选择“{0}”的有效选项 |
| modules/adminUtils.js | copy_9973008adb | 请检查“{0}”的填写内容 |
| modules/auditBehavior.js | copy_03d69a9d28 | 请重新选择文件 |
| modules/auditBehavior.js | copy_076bb5d383 | 删除操作未获通过，请刷新后查看 |
| modules/auditBehavior.js | copy_1376e7cf03 | 请填写审批步骤名称 |
| modules/auditBehavior.js | copy_215e3c57da | 内容未能保存，请检查填写内容 |
| modules/auditBehavior.js | copy_4c3b518dca | 请至少选择一项 |
| modules/auditBehavior.js | copy_6dc1d42f93 | 请至少添加一个审批步骤 |
| modules/auditBehavior.js | copy_76f2662073 | 请填写印章名称 |
| modules/auditBehavior.js | copy_93eb240494 | 请填写申请编号 |
| modules/auditBehavior.js | copy_9cf20101c9 | 请选择印章图片 |
| modules/auditBehavior.js | copy_ada965777d | 请至少选择一个身份类别 |
| modules/auditBehavior.js | copy_b07e47ba3f | 请至少添加一个审批条件 |
| modules/auditBehavior.js | copy_b791913c7a | 文件验证未能完成，请重试 |
| modules/auditBehavior.js | copy_cbf65b3559 | 请选择需要验证的文件 |
| modules/auditBehavior.js | copy_cf05c2ba56 | 请填写审核模板名称 |
| modules/auditBehavior.js | copy_de00c3e48a | 页面资料已变化，请刷新后查看 |
| modules/auditBehavior.js | copy_e0922834ac | 请先选择一名成员 |
| modules/auditBehavior.js | copy_e5d78a79f7 | 请选择具体审批岗位 |
| modules/authPersonnelBehavior.js | copy_0bc2266433 | 所选成员不需要生成认证码 |
| modules/authPersonnelBehavior.js | copy_3947b0ede8 | 所选成员暂无可用账号 |
| modules/authPersonnelBehavior.js | copy_439c4fcf37 | 认证设置未能加载，请重试 |
| modules/authPersonnelBehavior.js | copy_65d888be46 | 请输入新口令 |
| modules/authPersonnelBehavior.js | copy_e58fa637eb | 账号认证信息未能加载，请重试 |
| modules/authPersonnelBehavior.js | copy_f250d102a5 | 所选成员暂无可撤销的认证码 |
| modules/departmentBehavior.js | copy_215e3c57da | 部门未能保存，请检查填写内容 |
| modules/departmentBehavior.js | copy_2531b7527d | 请填写部门名称 |
| modules/departmentBehavior.js | copy_3ab009e9ad | 部门列表未能加载，请重试 |
| modules/identityBehavior.js | copy_f5b2fb24f1 | 请填写身份类别名称 |
| modules/identityBehavior.js | copy_f878df1668 | 身份类别列表未能加载，请重试 |
| modules/publicationBehavior.js | publicationLoadFailed | 公示设置未能加载，请重试 |
| modules/resultBehavior.js | copy_bd06e9a531 | 评分结果未能加载，请重试 |
| modules/settingsBehavior.js | defaultOrganizationRejected | 默认组织未能设置，请核对后重试 |
| modules/workGroupBehavior.js | copy_5778bc8da0 | 职能组列表未能加载，请重试 |
| modules/workGroupBehavior.js | copy_ce1f5597c6 | 请填写职能组名称 |

admin.js 的 copy_26d18e7955、copy_7c22a48e84，以及 hrInfoBehavior 的 copy_ab34b1e15d 是拼接片段，不独立改写。需按完整语句另审，避免句间粘连。

## 第四批：人事资料短反馈（批准）

路径为 generated/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js。

| 键 | 新值 |
|---|---|
| hrTemplateSwitchPreviewFailed | 模板适用情况未能检查，请重试 |
| copy_028fbc8a93 | 请先修改列出的问题资料 |
| copy_215e3c57da | 资料未能保存，请检查填写内容 |
| copy_2550a901e4 | 请选择部门和身份类别 |
| copy_2b61466286 | 成员资料文件未能生成，请重试 |
| copy_2e92a9de4f | 请先修改列出的表格问题 |
| copy_37795f5bde | 请选择需要导出的资料项 |
| copy_4f9250c03f | 请填写姓名和学号 |
| copy_530e6c15c0 | 成员资料未能加载，请重试 |
| copy_7582cffe69 | 内容已变化，请重新核对并确认 |
| copy_838181f305 | 成员列表未能加载，请重试 |
| copy_89be75a701 | 资料未能更新，请刷新详情后查看 |
| copy_94b36657df | 成员详情未能加载，请重试 |
| copy_b433d31323 | 复制未完成，请重试 |
| copy_b559e020b7 | 请填写资料项名称 |
| copy_b702b25b77 | 未发现需要补齐的基础资料 |
| copy_c24b3e04d9 | 岗位和管理身份未能加载，请重试 |
| copy_cc78fc735e | 请检查表格格式后重新选择 |
| copy_d03e81ea80 | 请填写资料模板名称 |
| copy_d593ce302d | “{0}”需要填写整数 |
| copy_d661ec9421 | 请为以下资料选择对应的表格列 |
| copy_defcb9a40c | 请选择资料对应的表格列 |
| copy_deff18cd29 | 请选择目标资料项 |
| copy_e59729af18 | 当前没有可导出的资料 |
| copy_e6b5e03497 | 请选择新的资料项 |
| copy_e6f89839f1 | 请填写姓名和学号 |
| integrityCheckFailed | 基础资料检查未能完成，请重试 |
| rejectionReasonRequired | 请填写驳回原因 |
| hrDeletionPreviewFailed | 删除前检查未能完成，请重试 |

## 第五批：场地与独立页面（批准）

路径前缀 generated/subpackages/venue/pages/。短校验、状态、失败和输入示例不加句末句号。

| 文件 | 键 | 新值 |
|---|---|---|
| myVenueBookings/myVenueBookings.js | copy_e52119b17e | 借用记录未能加载，请重试 |
| pendingVenueApprovals/pendingVenueApprovals.js | copy_bef4bbef62 | 例如：同意借用 |
| pendingVenueApprovals/pendingVenueApprovals.js | copy_e52119b17e | 待审批事项未能加载，请重试 |
| pendingVenueApprovals/pendingVenueApprovals.js | copy_e58fa637eb | 审批岗位未能加载，请重试 |
| pendingVenueApprovals/pendingVenueApprovals.js | stepApproved | 当前审批步骤已通过 |
| pendingVenueApprovals/pendingVenueApprovals.js | approvalPassed | 借用申请已通过 |
| pendingVenueApprovals/pendingVenueApprovals.js | approvalRejected | 借用申请已驳回 |
| venueApprovalHistory/venueApprovalHistory.js | copy_e52119b17e | 审批记录未能加载，请重试 |
| venueBooking/venueBooking.js | copy_10df33d76e | 请选择晚于现在的借用时间 |
| venueBooking/venueBooking.js | copy_29ea17e75c | 请选择审批流程 |
| venueBooking/venueBooking.js | copy_560bd817fb | 请先选择开始时间 |
| venueBooking/venueBooking.js | copy_6ce770a0a6 | 请先选择借用日期 |
| venueBooking/venueBooking.js | copy_7d2ebd6d78 | 这次借用已完成，不能再取消 |
| venueBooking/venueBooking.js | copy_7db68605c6 | 请填写借用事由 |
| venueBooking/venueBooking.js | copy_902c3411f2 | 请选择今天或之后的借用日期 |
| venueBooking/venueBooking.js | copy_9d1ff80fae | 请选择借用日期 |
| venueBooking/venueBooking.js | copy_9dc5c7d79f | 请补全借用申请中的必填内容 |
| venueBooking/venueBooking.js | copy_ab5ebc56e8 | 请重新选择借用日期 |
| venueBooking/venueBooking.js | copy_bef4bbef62 | 例如：同意借用 |
| venueBooking/venueBooking.js | copy_c46b04a9c5 | 该时段已被占用，请选择其他时段 |
| venueBooking/venueBooking.js | copy_e52119b17e | 借用记录未能加载，请重试 |
| venueBooking/venueBooking.js | copy_e58fa637eb | 审批岗位未能加载，请重试 |
| venueManage/venueManage.js | copy_0531ed9e78 | 本次操作未获通过，请刷新后查看 |
| venueManage/venueManage.js | copy_076bb5d383 | 删除未获通过，请刷新列表后查看 |
| venueManage/venueManage.js | copy_0de5656de5 | 请切换到有权管理场地的工作角色 |
| venueManage/venueManage.js | copy_1376e7cf03 | 请填写审批步骤名称 |
| venueManage/venueManage.js | copy_215e3c57da | 设置未能保存，请检查填写内容 |
| venueManage/venueManage.js | copy_4514e50856 | 请填写场地名称 |
| venueManage/venueManage.js | copy_560bd817fb | 请先选择开始时间 |
| venueManage/venueManage.js | copy_6ce770a0a6 | 请先选择日期 |
| venueManage/venueManage.js | copy_7db68605c6 | 请填写借用事由 |
| venueManage/venueManage.js | copy_9d1ff80fae | 请选择日期 |
| venueManage/venueManage.js | copy_9dc5c7d79f | 请补全表单中的必填内容 |
| venueManage/venueManage.js | copy_9dfd1d5a78 | 请先选择结束日期 |
| venueManage/venueManage.js | copy_bd8dff5ca7 | 当前工作角色没有场地管理权限 |
| venueManage/venueManage.js | copy_bef4bbef62 | 例如：同意借用 |
| venueManage/venueManage.js | copy_bff49f783f | 本次操作未获通过，请刷新后查看 |
| venueManage/venueManage.js | copy_c46b04a9c5 | 该时段已被占用，请选择其他时段 |
| venueManage/venueManage.js | copy_de00c3e48a | 页面资料已变化，请刷新后查看 |
| venueManage/venueManage.js | copy_f81bcf5295 | 请先保存修改 |
| venueManage/venueManage.js | copy_fdb45fb38f | 请填写借用事由 |

以下恢复为完整相对路径。

| 文件 | 键 | 新值 |
|---|---|---|
| generated/subpackages/audit/pages/submissionDetail/submissionDetail.js | rejectedStepUnknown | 申请已被驳回，可修改后重新提交 |
| generated/subpackages/audit/pages/submissionDetail/submissionDetail.js | placeSelectedSignature | 点击文件，将所选签名放到该位置 |
| generated/subpackages/audit/pages/submissionDetail/submissionDetail.js | placeSelectedStamp | 点击文件，将所选印章放到该位置 |
| generated/subpackages/audit/pages/submissionDetail/submissionDetail.js | copy_d86124b728 | 请返回审核列表后重新打开申请 |
| generated/subpackages/audit/pages/submissionDetail/submissionDetail.js | copy_e4882ec81b | 文件读取失败，请重新选择文件 |
| generated/subpackages/org/pages/adminPermissions/adminPermissions.js | copy_56640dd4ae | 请先保存或取消修改，再切换组织 |
| generated/subpackages/org/pages/adminPermissions/adminPermissions.js | copy_e3a7655873 | 请切换到有权查看本页的管理身份 |
| generated/subpackages/scoring/pages/score/score.js | loadFailedDescription | 评分内容未能加载，请重试 |
| generated/subpackages/scoring/pages/score/score.js | historicalDataRecovering | 历史评分数据暂不可读取，请稍后重试 |
| generated/subpackages/scoring/pages/score/score.js | scoreRevisionConflict | 这条评分已被更新，正在重新加载最新内容 |
| generated/subpackages/scoring/pages/scorerTasks/scorerTasks.js | copy_c0d3210812 | 未选择评分活动，请返回后重新选择 |
| generated/utils/api.js | copy_db7d9fed8e | 请重新选择组织与工作角色 |
| generated/utils/authContext.js | copy_97169e852e | 请重新打开“组织与工作角色”选择页面 |
| generated/utils/filePreview.js | copy_2f0c925c1b | 请切换到有权查看该文件的工作角色 |
| generated/utils/filePreview.js | copy_b8ede9c6ec | 未取得文件内容，请返回后重新打开 |
| main.js | reopenWorkContext | 请重新打开“组织与工作角色”选择页面 |

## 第六批：权限与通知短项（批准）

权限称谓的更改以 clarity 稿为准；这里补充句末标点。authorization.selectNatureRequired 由 identityNatureRelations 原键继承。

| 文件 | 键 | 新值 |
|---|---|---|
| authorization.js | inheritedFieldsHelp | 本次分配沿用以下资料项范围 |
| authorization.js | inheritedPeriodHelp | 本次分配沿用以下有效期 |
| authorization.js | inheritedRecordsHelp | 本次分配仅适用于以下记录 |
| authorization.js | inheritedSubjectsReadOnlyHelp | 本次分配沿用以下岗位条件 |
| authorization.js | chooseDelegation | 请先选择本次使用的分配资格 |
| authorization.js | allocationUnavailable | 当前工作角色没有分配权限 |
| authorization.js | copyInvalid | 复制内容不完整，请重新选择 |
| authorization.js | copyConflict | 复制配置已变更，请刷新后确认 |
| authorization.js | copyMissing | 这份配置已不存在，请刷新列表 |
| authorization.js | copyUnsupported | 这类配置暂不支持复制 |
| authorization.js | withinGroup | 同一岗位须同时符合本组条件 |
| authorization.js | betweenGroups | 符合任意一组条件即可 |
| authorization.js | effectiveFieldsUnrestricted | 这条授权未单独限制资料项 |
| authorization.js | effectiveNoVisibleFields | 这条授权没有可显示的资料项 |
| authorization.js | forbidden | 你没有这项操作权限 |
| authorization.js | loginRequired | 登录已失效，请重新登录 |
| authorization.js | operationFailed | 操作未完成，请稍后重试 |
| authorization.js | invalidName | 请填写名称，最多 80 个字 |
| authorization.js | purposeUnavailable | 这条事由已不存在，请刷新列表 |
| authorization.js | configurationCopy.copyUnavailable | 副本不存在或无权编辑 |
| authorization.js | configurationCopy.unavailable | 来源已撤销分享，不能继续复制 |
| authorization.js | invalidNature | 请选择有效的岗位性质 |
| authorization.js | duplicateNature | 已有同名岗位性质，请直接选择 |
| messageFacts.js | scoringTodoUnknown | 请查看本活动中待完成的评分 |
| messageFacts.js | scoringDeadlineAction | 请及时完成评分 |
| messageFacts.js | migrationPending | 资料迁移申请正在等待审核 |
| messageFacts.js | migrationExecuted | 资料迁移已完成 |
| messageFacts.js | migrationRejected | 资料迁移申请未通过审核 |
| messageFacts.js | migrationCancelled | 资料迁移申请已撤回 |
| messageFacts.js | migrationCurrentPending | 资料迁移申请当前正在等待审核 |
| messageFacts.js | migrationCurrentExecuted | 资料迁移申请当前已完成 |
| messageFacts.js | migrationCurrentRejected | 资料迁移申请当前未通过审核 |
| messageFacts.js | migrationCurrentCancelled | 资料迁移申请当前已撤回 |
| messageFacts.js | migrationCurrentUnknown | 资料迁移申请的当前状态暂未确认 |
| messageFacts.js | calendarTimeUnknown | 请查看日程的时间和安排 |
| messageFacts.js | calendarAllDay | 日程按全天安排 |
| messageFacts.js | notificationDetailUnavailable | 这条通知暂时无法打开详情 |
| messageFacts.js | todoDetailUnavailable | 这项待办暂时无法打开详情 |
| responseMessages.js | organization_name_required | 请填写组织名称 |
| responseMessages.js | department_name_required | 请填写部门名称 |
| responseMessages.js | identity_name_required | 请填写身份类别名称 |
| responseMessages.js | work_group_name_required | 请填写职能组名称 |
| responseMessages.js | work_group_department_required | 请先选择职能组所属部门 |
| responseMessages.js | signature_image_required | 请先添加签名图片 |
| responseMessages.js | scoring_template_name_required | 请填写评分模板名称 |

messageFacts 的动态完整进展句（例如第几步通过并转交）、验签技术报告 signingEvidence 的完整证据结论与错误说明保留自然句号；它们是报告/详情中的完整句，不当作按钮或状态标签批量去除。


## 全目录覆盖登记

以下88文件均纳入句号定位。数字为源文本句号数，包含注释，不能当作错误数。无句号文件不需要本次改动；有句号文件按上述逐键表实施，其他完整说明/确认/报告或拼接句保留。该登记不授权未列条目的机械改写。

| 文件 | 源文本句号数 |
|---|---|
| adminGovernance.js | 3 |
| adminPersonnel.js | 9 |
| app.js | 2 |
| assignmentNatures.js | 6 |
| auditConditions.js | 14 |
| auditSigning.js | 7 |
| auditVerification.js | 0 |
| authorization.js | 107 |
| calendar.js | 34 |
| common.js | 0 |
| contactDirectory.js | 35 |
| controlLayout.js | 0 |
| fileIO.js | 2 |
| generated/components/workspace-hero/workspace-hero.js | 0 |
| generated/subpackages/audit/components/signaturePad/signaturePad.js | 0 |
| generated/subpackages/audit/pages/myApprovalHistory/myApprovalHistory.js | 0 |
| generated/subpackages/audit/pages/mySubmissions/mySubmissions.js | 1 |
| generated/subpackages/audit/pages/pendingApprovals/pendingApprovals.js | 2 |
| generated/subpackages/audit/pages/signatureManager/signatureManager.js | 0 |
| generated/subpackages/audit/pages/submissionDetail/submissionDetail.js | 13 |
| generated/subpackages/audit/pages/verification/verification.js | 0 |
| generated/subpackages/org/pages/accountSecurity/accountSecurity.js | 0 |
| generated/subpackages/org/pages/adminPermissions/adminPermissions.js | 2 |
| generated/subpackages/org/pages/authManagement/authManagement.js | 0 |
| generated/subpackages/org/pages/identitySwitch/identitySwitch.js | 3 |
| generated/subpackages/org/pages/switch/switch.js | 0 |
| generated/subpackages/scoring/pages/admin/admin.js | 89 |
| generated/subpackages/scoring/pages/admin/modules/activityBehavior.js | 2 |
| generated/subpackages/scoring/pages/admin/modules/adminManagementBehavior.js | 0 |
| generated/subpackages/scoring/pages/admin/modules/adminUtils.js | 21 |
| generated/subpackages/scoring/pages/admin/modules/auditBehavior.js | 25 |
| generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js | 29 |
| generated/subpackages/scoring/pages/admin/modules/departmentBehavior.js | 5 |
| generated/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js | 59 |
| generated/subpackages/scoring/pages/admin/modules/identityBehavior.js | 5 |
| generated/subpackages/scoring/pages/admin/modules/publicationBehavior.js | 6 |
| generated/subpackages/scoring/pages/admin/modules/resultBehavior.js | 2 |
| generated/subpackages/scoring/pages/admin/modules/ruleBehavior.js | 1 |
| generated/subpackages/scoring/pages/admin/modules/settingsBehavior.js | 9 |
| generated/subpackages/scoring/pages/admin/modules/templateBehavior.js | 1 |
| generated/subpackages/scoring/pages/admin/modules/workGroupBehavior.js | 5 |
| generated/subpackages/scoring/pages/score/score.js | 6 |
| generated/subpackages/scoring/pages/scorerTasks/scorerTasks.js | 1 |
| generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail.js | 0 |
| generated/subpackages/venue/pages/myVenueBookings/myVenueBookings.js | 9 |
| generated/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals.js | 10 |
| generated/subpackages/venue/pages/venueApprovalHistory/venueApprovalHistory.js | 3 |
| generated/subpackages/venue/pages/venueApprovalHistoryDetail/venueApprovalHistoryDetail.js | 0 |
| generated/subpackages/venue/pages/venueBooking/venueBooking.js | 35 |
| generated/subpackages/venue/pages/venueBookings/venueBookings.js | 1 |
| generated/subpackages/venue/pages/venueManage/venueManage.js | 49 |
| generated/subpackages/venue/utils/flowTimeline.js | 0 |
| generated/subpackages/venue/utils/venueBookingDetail.js | 0 |
| generated/subpackages/venue/utils/venueRuleDisplay.js | 0 |
| generated/subpackages/venue/utils/workContextPresentation.js | 2 |
| generated/utils/adminPermissions.js | 0 |
| generated/utils/api.js | 1 |
| generated/utils/authContext.js | 1 |
| generated/utils/filePreview.js | 4 |
| generated/utils/messageScope.js | 0 |
| generated/utils/organizationActivation.js | 0 |
| generated/utils/tableFile.js | 2 |
| generated/utils/trustedNavigation.js | 0 |
| home.js | 25 |
| hrImport.js | 31 |
| hrProfileMigration.js | 17 |
| hrTemplateFieldDisplay.js | 4 |
| hrTemplateSave.js | 30 |
| hrValueValidation.js | 15 |
| identityCard.js | 5 |
| identityNatureRelations.js | 43 |
| legacyPermissions.js | 36 |
| login.js | 16 |
| main.js | 5 |
| messageFacts.js | 29 |
| messagePerformance.js | 0 |
| messages.js | 5 |
| personnelPicker.js | 1 |
| portal.js | 7 |
| requestFeedback.js | 28 |
| responseMessages.js | 42 |
| signingEvidence.js | 67 |
| stampAuthorization.js | 7 |
| time.js | 0 |
| uiNavbar.js | 0 |
| venueFacts.js | 1 |
| venueFlowManagement.js | 1 |
| web.js | 57 |

## 调用方复核补正

- main.js 的完整键为 authContext.reopenWorkContext，上表简称不得当顶层键新增。
- hrInfoBehavior.js 的 copy_d661ec9421 被用于 `提示 + 缺失资料名称 + copy_ab34b1e15d`，最终定稿为“请为以下资料选择对应的表格列：”，覆盖第四批该项。后缀“。工作分工可留空。”保留，构成完整说明，不使名称与句子粘连。
- admin.js 的 copy_7c22a48e84 在“错误行数 + 片段 + 后续处理说明”中作分句，保留；copy_26d18e7955 在永久移除管理身份确认中收尾，保留。

## 审核汇总

目录定位覆盖88个源文件，逐项批准表共282条，另有上述1条同键定稿修正与1条完整路径纠正，不重复计数。其余句号保留的依据是完整说明、确认后果、多句消息/报告、句间拼接或源码注释；不是按长度自动决定。无句号的24个文件无需修改。本清单不代表282条已实施，也不代表所有界面现场验证通过；实施后必须核对引用和必要截图。

## 实施中只读对照记录

2026-11-14，使用只读 Node 遍历批准表、读取对应导出值比对，没有写语料源。批准表总数确认为282：第一批56、第二批25、第三批70、第四批29、第五批57、第六批45。此次取样时第一批55/56匹配，唯一 chooseDescription 原值确有句号；第五57/57、第六45/45匹配。第二25/25，第三26/70、第四0/29属于并行实施尚未结束，不作为最终验收。已向主 Agent 指出第一批漏项，最终需待全部实施结束复核。

## 最终逐值验收

2026-11-14，全部实施完成后重跑只读表值对照：282/282匹配，0项不符，涉及40个实际语料源文件。六批分别为56/56、25/25、70/70、29/29、57/57、45/45。chooseDescription已经按批准值去除句号，copy_d661ec9421保持最终冒号，拼接后缀未删。全局短文案标点批准项源值验收通过；生成副本一致性、运行测试及实体设备验证由主 Agent 另行报告。
