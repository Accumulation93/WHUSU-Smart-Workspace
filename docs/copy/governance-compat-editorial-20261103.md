# 删除权限与旧管理员兼容页：独立语言审稿

语言 Agent `/root/language_editor`。已核实hr.people.delete用于deleteHrMembershipPermanently；普通deleteHrInfo只是离开组织、使用hr.people.update，两者不得共用永久删除提示。旧adminPermissions仍可只读渲染，不得整文件视为废弃；实际搜索姓名及管理身份，不搜学号。

## adminGovernance.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| auditSubmitter | 保留：发起人本人 | 审批自身条件 |
| read | 保留：查看 | 读取能力 |
| remove | 保留：删除 | 删除能力标签 |
| readDescription | 保留：查看本组织的相关记录 | 不突破资源范围 |
| deleteDescription | 改为：删除本组织权限范围内的记录；仍被其他业务使用的内容需先通过删除检查。 | 避免“关联数据保护要求”抽象 |
| auditRecordsDelete | 保留：永久删除审核申请 | 不等于撤回 |
| auditRecordsDeleteDescription | 保留：永久删除申请、所有轮次、签署记录和附件 | 完整后果 |
| venueRecordsDelete | 保留：永久删除借用记录 | 不等于取消借用 |
| venueRecordsDeleteDescription | 保留：永久删除本组织可管理的借用记录及审批记录 | 组织范围 |
| deleteTitle | 保留：永久删除记录 | 确认标题 |
| deleteBody | 保留：确定永久删除“{0}”？相关历史和附件也会被删除，无法恢复。 | 仅该动作实际清理对应历史附件时使用 |
| deleteConfirm | 保留：永久删除 | 危险动作明确 |
| deleted | 保留：记录已删除 | 数据已删除 |
| cleanupPending | 保留：记录已删除，附件正在清理 | 清理任务真实排队/运行才显示 |
| failed | 保留：删除失败，请重试 | 明确拒绝；未知结果先查记录 |
| forbidden | 改为：当前工作角色没有删除这条记录的权限。 | 不合并其他身份权限 |
| notFound | 保留：记录不存在或已删除 | 权威不存在 |
| changed | 保留：记录已发生变化，请重新查看后删除 | 版本变动 |
| invalid | 保留：请重新选择要删除的记录 | 无目标 |
| cancel | 保留：取消 | 放弃删除 |
| deletePermissions.scoring.activities | 保留：删除评分活动 | 能力对象 |
| deletePermissions.scoring.templates | 保留：删除评分模板 | 能力对象 |
| deletePermissions.scoring.rules | 保留：删除评分类别 | 能力对象 |
| deletePermissions.scoring.publications | 保留：删除公示规则与名单 | 能力对象 |
| deletePermissions.hr.people | 保留：永久删除组织成员 | 专用永久删除路由，不替代离开组织 |
| deletePermissions.hr.profile_templates.manage | 保留：删除资料模板 | 模板不是成员资料 |
| deletePermissions.hr.departments | 保留：删除部门 | 字典删除 |
| deletePermissions.hr.identities | 保留：删除身份类别 | 字典删除 |
| deletePermissions.hr.work_groups | 保留：删除职能组 | 字典删除 |
| deletePermissions.audit.templates | 保留：删除审核模板 | 配置删除 |
| deletePermissions.audit.stamps | 保留：删除电子印章 | 不改历史签章文件 |
| deletePermissions.venue.resources | 保留：删除场地及占用规则 | 范围必须在二次确认显示 |
| deletePermissions.venue.approvals | 保留：删除借用审批规则 | 配置删除 |
| deletePermissions.venue.purposes | 保留：删除常用事由 | 组织字典删除 |

## generated/subpackages/org/pages/adminPermissions/adminPermissions.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| navigationTitle | 保留：管理员权限 - WHUSU智慧工作台 | 旧版只读兼容页 |
| searchEmpty | 保留：没有符合条件的管理员 | 成功筛选为空 |
| copy_0278c19d5a | 保留：的权限 | 紧跟姓名，完整标题 |
| copy_06dbb49961 | 保留：取消 | 关闭未完成选择 |
| copy_06e8d3a970 | 保留：未命名管理员 | 名称缺失 |
| copy_09614cef6c | 保留：关闭 | 关闭详情 |
| copy_1557b96093 | 保留：普通管理员 | 管理身份 |
| copy_215e3c57da | 保留：保存失败，请重试 | 仅兼容备用；新架构只读时不显示保存 |
| copy_2370e6144f | 保留：人 | 管理员人数 |
| copy_267c7ab9d4 | 保留：管理员权限 | 页面主题 |
| copy_2948683a6d | 保留：管理员列表 | 目录 |
| copy_2a0e50c5f6 | 改为：清除搜索 | 若实际绑定不是搜索则须另定，不泛改清权限 |
| copy_40859eeee7 | 保留：未保存内容 | 兼容编辑状态 |
| copy_43ecd1ec09 | 保留：设置权限 | 只读时必须禁用或不显示，不以文案伪装可写 |
| copy_4dbdbf9dcd | 保留：未填写 | 空字段 |
| copy_56640dd4ae | 保留：请先保存或取消修改，再切换组织。 | 仅存在可编辑兼容状态 |
| copy_58460e829b | 保留：无法访问 | 只读权限不足 |
| copy_6214a926a3 | 保留：当前组织暂无可管理的管理员 | 成功为空 |
| copy_71db23a36b | 保留：保存 | 只读必须隐藏 |
| copy_72d3c6f7c2 | 保留：管理员 | 角色标签 |
| copy_80fba348b7 | 退回未引用学号标签 | 本页不提供学号，不能恢复显示 |
| copy_835048fcaf | 保留：全部 | 筛选项 |
| copy_9c0ceb5c90 | 保留：已启用 | 状态 |
| copy_aa4f0ed6cd | 保留品牌引用common.brandName | 品牌 |
| copy_c1961a2760 | 保留：继续编辑 | 可编辑兼容态动作 |
| copy_ccd219e5f1 | 保留：超级管理员 | 管理身份 |
| copy_cea1da7603 | 保留：搜索 | 搜索动作 |
| copy_d576d9e120 | 保留：正在加载管理员… | 目录读取 |
| copy_e3a7655873 | 改为：请切换到有权查看本页的管理身份。 | 角色而非权限当角色 |
| copy_e47065f3f1 | 保留：权限已生效 | 仅真实旧写入成功，不能用于只读加载 |
| copy_e52119b17e | 保留：请稍后重试 | 读取错误 |
| copy_f679e67c6f | 改为：搜索姓名或管理身份 | 实际搜索字段 |
| copy_f7eeef9596 | 保留：有未保存内容 | 兼容编辑态 |

## generated/subpackages/org/pages/authManagement/authManagement.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| navigationTitle | 保留：账号与认证 - WHUSU智慧工作台 | 兼容导航 |
| copy_166a418985 | 保留：人事信息 | 目标子应用 |
| copy_aa4f0ed6cd | 保留品牌引用common.brandName | 品牌 |
| copy_b5e5c2ce52 | 保留：正在打开账号与认证 | 真实跳转加载 |

删除、权限兼容页还需逐动作现场验证。尤其旧只读页面是否显示保存与权限开关，不能靠语料批准视为已锁定。
