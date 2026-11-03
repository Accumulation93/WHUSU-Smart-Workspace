# 旧权限只读目录：前端语料定稿

来源依据：`server/src/core/services/adminPermissions.js` 明确权限key与ACTION_GROUPS。此稿只给旧目录名称与说明，不修改旧权限或迁移映射。一个旧键可能覆盖多个动作，不能拿某一个新能力名替代全部含义。新增前端 `legacyPermissions`，按机器key查label/description；未知键不显示原始key或服务端label，用“未识别的旧权限／这项旧权限暂时无法显示说明。”并登记差异，不猜测补权。

## 分组

| key | label |
|---|---|
| calendar | 日程 |
| authentication | 账号认证 |
| permissions | 权限管理 |
| scoring | 考核评分 |
| hr | 人事信息 |
| audit | 审核 |
| venue | 场地管理 |
| system | 系统设置 |

分组description均为空，禁止为了填满卡片生成无意义介绍。

## 旧权限逐项定稿

| key | label | description |
|---|---|---|
| calendar.manage | 日程管理 | 管理授权范围内的日程。 |
| calendar.rules.manage | 日程安排规则 | 设置哪些人可以安排他人的日程。 |
| auth.identity.verify | 身份认证管理 | 审核成员认证并生成认证码。 |
| auth.accounts.recover | 组织账号查看 | 查看本组织成员的账号状态和登录记录。 |
| auth.accounts.global_manage | 全局账号管理 | 管理成员的全局账号，相关操作会影响其在各组织的登录。 |
| auth.accounts.audit | 安全审计 | 空；保持hidden，不新增用户入口。 |
| auth.policy.manage | 认证设置 | 设置身份认证和账号恢复的可用方式。 |
| permissions.manage_regular_admins | 普通管理员权限设置 | 设置本组织普通管理员的管理权限。 |
| scoring.activities | 评分活动管理 | 新增和维护评分活动。 |
| scoring.templates | 评分模板管理 | 新增和维护评分模板及题目。 |
| scoring.rules | 评分范围设置 | 设置评分人和被评分人的范围。 |
| scoring.results | 查看评分结果 | 查看评分结果、明细和完成情况。 |
| scoring.results_export | 导出评分结果 | 导出评分结果和任务完成情况。 |
| scoring.results_revoke | 撤销评分记录 | 撤销已提交的评分记录。 |
| scoring.publications | 公示与评优管理 | 设置结果公示和评优人选规则。 |
| hr.people | 成员资料管理 | 维护成员资料及岗位；账号操作还需对应账号权限。 |
| hr.directory.manage | 通讯录规则管理 | 设置通讯录的可见人员和资料项，不附带查看其资料的权限。 |
| hr.import | 人事表格导入 | 检查表格内容并导入成员资料。 |
| hr.profile_review | 补充资料审核 | 审核成员提交的补充资料修改。 |
| hr.profile_templates.manage | 资料模板管理 | 新增和维护可供组织使用的资料模板。 |
| hr.profile_templates.select | 本组织资料设置 | 为本组织选择资料模板及填写方式。 |
| hr.departments | 部门管理 | 新增和修改部门选项。 |
| hr.identities | 身份类别管理 | 新增和修改身份类别选项。 |
| hr.work_groups | 职能组管理 | 新增和修改职能组选项。 |
| audit.templates | 审核模板管理 | 设置申请模板、审批步骤及适用范围。 |
| audit.stamps | 印章管理 | 维护电子印章及使用授权。 |
| audit.submissions | 查看审核记录 | 查看授权范围内的申请记录和审批进展。 |
| audit.submissions_delete | 引用adminGovernance.auditRecordsDelete | 引用adminGovernance.auditRecordsDeleteDescription |
| audit.verification | 文件验证管理 | 设置文件验证权限并核验已获授权的文件。 |
| venue.resources | 场地与排期管理 | 维护场地资料、开放时间及活动占用。 |
| venue.bookings | 借用管理 | 管理授权范围内的场地借用。 |
| venue.bookings_delete | 引用adminGovernance.venueRecordsDelete | 引用adminGovernance.venueRecordsDeleteDescription |
| venue.approvals | 借用审批管理 | 设置借用审批流程，并在具备处理资格时审批借用。 |
| venue.purposes | 借用事由管理 | 新增和修改常用借用事由。 |
| system.admin_accounts.read | 查看管理员 | 查看并导出本组织的管理员目录。 |
| system.admin_accounts.write | 管理普通管理员 | 新增、修改和移除本组织的普通管理员身份。 |
| system.settings | 系统基本设置 | 查看和修改已授权的系统设置。 |
| system.organizations | 组织管理 | 管理组织资料和系统默认组织。 |

ACTION_GROUPS另派生14项`.delete`：scoring.activities、scoring.templates、scoring.rules、scoring.publications、hr.people、hr.profile_templates.manage、hr.departments、hr.identities、hr.work_groups、audit.templates、audit.stamps、venue.resources、venue.approvals、venue.purposes。每项label严格引用已经独立审定的 `adminGovernance.deletePermissions[base]`，description引用 `adminGovernance.deleteDescription`；不在上面普通管理说明中再写包含删除。

creatableLevels只有admin和super_admin，分别引用已批准的“普通管理员”“超级管理员”。仍以服务端允许的value集合决定选项，不把本地有标签当成可新增该身份。

## 旧版只读入口复审

readOnly时箭头及无障碍名称使用已批准“查看权限”，详情底栏使用已批准“关闭”；此时没有可保存的修改，切换工作角色不显示未保存警告，先关闭旧详情，再按角色切换流程清理。只有真实可写的旧兼容模式才保留编辑和未保存提醒。

| 新键 | 定稿 | 使用边界 |
|---|---|---|
| unknownGroup | 权限分组暂未确认 | 未识别的分组标识，不显示原始标识或服务端说明 |
| unknownAdminLevel | 管理身份暂未确认 | 未识别的管理员级别，不默认普通管理员 |

未知管理身份的条目不能凭默认标签推定可编辑；已有权限限制仍由服务端执行。未知权限条目沿用本稿“未识别的旧权限”与说明，分组未知不抹去仍能准确识别的子项。
