# 网页独有语料独立审稿

来源 `web.js`。同义内容优先引用既有共享源，不因本表再次定稿复制一份。表中“保留”已按实际用途审阅；旧版不支持提示分辨有无真实调用，不把已实现功能重新禁用。业务写入未确认走公共反馈。

## common 与 errors

| 键 | 定稿／处理 |
|---|---|
| common.webVersionLabel | 网页版 |
| common.back | 返回 |
| common.empty | 暂无内容（仅读取成功为空） |
| common.searchPlaceholder | 输入关键词搜索 |
| common.more | 更多 |
| common.logoutConfirmBody | 退出后，需要重新登录才能继续使用。 |
| common.logoutDone | 已退出登录 |
| common.goPortal | 返回应用服务 |
| common.notFoundTitle | 页面不存在 |
| common.notFoundBody | 这个地址没有对应页面，请返回应用服务重新进入。 |
| errors.networkFailed | 退回：按公共readFailed/writeResultUnknown区分，不能统一重试 |
| errors.requestFailed | 退回：按公共请求结果分类 |
| errors.upgradeRequired | 页面版本已更新，请刷新页面后继续。 |
| errors.originRejected | 这次请求未获接受，请从工作台入口重新打开页面。 |
| errors.permissionDenied | 当前工作角色没有执行这项操作的权限。 |
| errors.roleRequired | 请先选择工作角色。 |

## hr 与 system

| 键 | 定稿／处理 |
|---|---|
| hr.navigationTitle | 人事信息 - WHUSU智慧工作台 |
| hr.profileTitle | 本人资料 |
| hr.reviewTitle | 资料审核 |
| hr.nameLabel | 姓名 |
| hr.departmentLabel | 部门 |
| hr.identityLabel | 身份类别 |
| hr.workGroupLabel | 职能组 |
| hr.assignmentLabel | 岗位 |
| hr.profileReadOnlyNote | 删除无引用旧限制提示 |
| system.navigationTitle | 基本设置 - WHUSU智慧工作台 |
| system.configTitle | 系统设置 |
| system.dictionaryTitle | 岗位选项管理 |
| system.permissionsTitle | 权限管理 |
| system.timezoneLabel | 系统显示时区 |
| system.configVersionLabel | 配置版本（仅设置诊断，不扩散普通业务页） |
| system.currentOrganizationLabel | 引用settingsBehavior.systemDefaultOrganization“默认组织” |
| system.adminLevelLabel | 管理身份 |
| system.permissionListTitle | 已有权限 |
| system.noPermission | 当前工作角色没有可用的管理权限。 |
| system.departmentTitle | 部门 |
| system.identityTitle | 身份类别 |
| system.workGroupTitle | 职能组 |
| system.dictionaryNote | 删除无引用旧限制提示 |
| system.templateStepCount | 共 {0} 个审批步骤 |
| system.emptyTemplates | 暂无可用审批流程 |

## venue、verify、workbench

| 键 | 定稿／处理 |
|---|---|
| venue.createTitle | 发起借用 |
| venue.chooseVenue | 请选择场地。 |
| venue.emptyPending | 当前没有需要你审批的借用申请。 |
| venue.emptyHistory | 你审批过的借用申请会显示在这里。 |
| venue.adminNote | 删除无引用旧限制提示 |
| venue.mineNote | 这里显示你提交的场地借用申请。 |
| verify.navigationTitle | 文件验签 - WHUSU智慧工作台 |
| verify.title | 文件验签 |
| verify.pageName | 审核 · 文件验签 |
| verify.modeLabel | 核对方式 |
| verify.fileLabel | 待核对文件 |
| verify.fileTooLarge | 文件超过 10 MiB，请重新选择。 |
| verify.verifyAction | 开始核对 |
| verify.verifying | 正在核对文件 |
| verify.resultTitle | 核对结果 |
| verify.verifyFailed | 文件核对未能完成，请重试。 |
| verify.forbidden | 当前工作角色没有验证这份文件的权限。 |
| workbench.navigationTitle | 工作台 - WHUSU智慧工作台 |
| workbench.title | 工作台 |
| workbench.unreadLabel | 未读消息 |
| workbench.sectionAccount | 账号安全 |
| workbench.scoringEntry | 进入评分 |
| workbench.hrEntry | 本人资料 |
| workbench.auditEntry | 审核审批 |
| workbench.notPortedTitle | 暂时无法在网页打开这个页面 |
| workbench.notPortedBody | 请在小程序中打开对应页面。 |
| workbench.heroTitle | 工作台 |

notPorted用于未映射的导航目标，不承诺整个模块未开发，也不作“以后将开放”的进度承诺。venue.emptyPending若实际显示在有数据列表上必须拆为pendingIntro＝“请查看并处理待审批的借用申请。”，不得把空态句用于列表介绍。

## audit

| 键 | 定稿／处理 |
|---|---|
| navigationTitle | 审核审批 - WHUSU智慧工作台 |
| title | 审核审批 |
| mySubmissionsNote | 查看申请进展，或发起新的审核申请。 |
| pendingNote | 查看需要你审批的申请。 |
| historyNote | 查看你审批过的申请及处理结果。 |
| stepStatusLabels.skipped | 已跳过（仅真实历史跳过，不新增跳过逻辑） |
| loadFailed | 审核申请未能加载，请重试。 |
| submissionNumberLabel | 申请编号 |
| submitterLabel | 发起人 |
| submittedAtLabel | 提交时间 |
| currentStepLabel | 当前审批进度 |
| stepProgress | 第 {0} 步，共 {1} 步 |
| stepNumber | 第 {0} 步 |
| unreadBadge | 有更新 |
| actionDownload | 下载附件 |
| actionBackToList | 返回列表 |
| withdrawConfirmBody | 撤回后，本轮审批停止。重新提交时，将从第一步重新审批。 |
| withdrawDone | 申请已撤回 |
| withdrawFailed | 申请未能撤回，请刷新详情后查看。 |
| approveDone | 当前审批步骤已通过。 |
| rejectDone | 申请已驳回 |
| actionFailed | 本次操作未获通过，请刷新申请详情后查看。 |
| detailTitle | 申请详情 |
| detailDescriptionLabel | 申请说明 |
| detailStepsTitle | 审批进度 |
| detailFilesTitle | 申请附件 |
| detailEmptyFiles | 这份申请没有附件。 |
| approveCommentPlaceholder | 可补充审批意见，也可留空。 |
| signatureRequiredTitle | 当前步骤需要签名 |
| signatureRequiredBody | 删除无引用旧“没有签名定位”提示 |
| designateRequiredBody | 删除无引用旧“需转小程序指定”提示 |
| createPanelNote | 选择审批流程并填写申请，提交后按步骤审批。 |
| createTemplateLabel | 选择审批流程 |
| createTitleLabel | 申请标题 |
| createTitlePlaceholder | 简要说明申请事项 |
| createTitleRequired | 请填写申请标题。 |
| createDescLabel | 申请说明 |
| createDescPlaceholder | 补充申请说明，可留空 |
| createFilesLabel | 申请附件 |
| createFilesRequired | 请至少上传一个附件。 |
| createSubmitting | 正在提交申请 |
| createDone | 申请已提交 |
| createStepsHint | 该流程有 {0} 个审批步骤，提交后将逐步审批。 |
| createUploading | 正在上传附件 |
| createFileTooLarge | 单个附件不能超过 10 MiB，请重新选择。 |
| createAdHocNotAvailable | 网页目前支持按已有流程发起申请。如需自定义流程，请在小程序中发起。 |
| signaturePanelNote | 保存常用签名，签署文件时可直接选用。 |
| signatureClear | 清空签名板 |
| signatureSave | 保存签名 |
| signatureNameLabel | 签名名称 |
| signatureNamePlaceholder | 为这个签名填写名称 |
| signatureNameRequired | 请填写签名名称。 |
| signatureEmptyCanvas | 请先在签名板上签名。 |
| signatureDeleteConfirmTitle | 删除签名 |
| signatureDeleteConfirmBody | 删除后，签名库将不再提供这个签名，不影响已签署的文件。 |
| signatureSaveFailed | 签名未能保存，请检查填写内容。 |
| signatureHint | 用鼠标或手指书写，保存后可在签署文件时选用。 |

以上失败句仅适用于明确拒绝，不能作为网络未知结果的默认fallback。signatureDelete说明需保持删除只影响模板的现有行为；不得因此删除历史材料。

## scoring

| 键 | 定稿／处理 |
|---|---|
| taskNote | 查看需要完成的评分任务。可修改的评分会显示“修改评分”。 |
| adminTitle | 考核管理 |
| activityWindowClosed | 当前不在评分时间内。 |
| progressLabel | 评分进度 |
| progressText | 已评 {0} 人，共 {1} 人 |
| scoreStatusScored | 已评分 |
| actionOpenScore | 开始评分 |
| actionRewriteScore | 修改评分 |
| actionBackToTasks | 返回任务列表 |
| loadFailed | 评分资料未能加载，请重试。 |
| submitFailed | 评分未获提交，请检查填写内容。 |
| submitDone | 评分已提交 |
| submitting | 正在提交评分 |
| actionSubmit | 提交评分 |
| readOnlyNotice | 这条评分记录只能查看，不能修改。 |
| readOnlyReason | 这条记录缺少原评分规则，目前只能查看已保存的评分结果。 |
| existingRecordNotice | 你已提交过这项评分，再次提交将更新这条评分记录。 |
| revisionConflict | 这条评分已被更新，请重新加载后核对。 |
| questionRequired | 请完成所有必填评分项。 |
| questionRange | 第 {0} 项的分数应在 {1} 到 {2} 之间。 |
| questionStep | 第 {0} 项的分数需要按 {1} 的间隔填写。 |
| totalLabel | 合计得分 |

并发冲突不能在重新加载尚未成功时说已加载；页面应保留实际重新加载动作。评分任务若按岗位计数，progressText另用岗位单位，不以人冒充岗位。

## admin

| 键 | 定稿／处理 |
|---|---|
| navigationTitle | 综合管理 - WHUSU智慧工作台 |
| title | 管理 |
| consoleTitle | 综合管理 |
| authTitle | 账号认证管理 |
| tabScoring | 考核管理 |
| tabAudit | 审核管理 |
| tabDictionary | 岗位选项管理 |
| tabSystem | 系统设置 |
| permissionsSaving | 正在保存权限设置 |
| tabHr | 人事信息 |
| memberSearchPlaceholder | 引用adminPersonnel.memberSearchPlaceholder“搜索姓名或学号” |
| memberEmpty | 暂无成员 |
| memberDetailTitle | 成员详情 |
| memberCountSuffix | 人 |
| accountStatusLabel | 账号状态 |
| consoleNote | 退回跨情境复用；AdminAuthView只读清单使用accountDirectoryReadOnly，AdminConsole未映射管理页使用managementPageUnavailable，见文末追加 |

全文全部原有键已审阅，仍有consoleNote、列表空态复用及实际单位待上下文核实；这不是网页全页面实测通过声明。

## 旧账号目录与未映射页面分别定稿

- `admin.accountDirectoryReadOnly`：这里仅显示账号状态。如需管理账号，请打开人事信息中的成员详情。
- `admin.managementPageUnavailable`：这个管理页面暂时无法在网页打开，请在小程序中使用。

前者仅用于AdminAuthView真实只读目录；后者仅用于AdminConsoleView未命中已有管理组件的末尾分支，不能放在已有可操作组件上。人事详情操作仍按权限显示，不承诺所有查看目录的人均可修改。

AdminAuthView当前将verified映射审批已通过、frozen映射已撤回的结构不批准。必须使用已批准的账号四状态及未知状态，不能输出原始枚举。读取失败必须只展示失败与重试，不同时展示没有成员。
