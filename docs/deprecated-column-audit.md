# 2026-10-18 废弃列审计与退役

生产结构共 102 表、1,028 列，分审核、身份人事、评分场地与基础设施核对。完整逐列索引见 [结构清单](audits/2026-10-18-column-inventory.json)。清单不包含账号、文件或个人数据。逐字引用统计不是废弃证明；模块复核同时核对客户端、SQL、授权、后台任务、历史详情、密码证据、迁移与索引。

## 本轮确认退役的 7 列

| 表 | 列 | 确认依据与兼容方式 |
|---|---|---|
| admin_info | invite_code、invited_at、invite_expires_at、invite_consumed_at | 管理员创建已走统一账号与授权，邀请码查找/更新无生产调用；旧输入忽略，新客户端原本不发，移除SQL与初始化脚本残留。唯一索引仅属于废弃列，显式在线移除。 |
| auth_sessions | openid_hash | 原为口令随机占位或微信绑定摘要副本，创建后不参与会话读取或认证。先INSTANT设置兼容默认空串，再移除INSERT，后续删列。其他表同名摘要继续保护绑定、挑战和恢复。 |
| score_activities | participant_granularity | 当前全部固定为岗位，旧模式校验及SQL残留移除；新端不发，旧输入任意值忽略，响应assignment保持兼容。 |
| audit_flow_template_steps | related_relation | 当前步骤与条件体系不使用；模型不写，新端不读，兼容响应固定空。 |

上轮已删除的 resubmit_mode 两列不计入本轮数量；本轮移除两端残留状态、提交参数及小程序编辑选择框。旧客户端参数继续忽略，响应fresh保持兼容。

## 保留项与原因

- 审核 previous_reject_step_index 仍用于驳回步骤提示；starter_hr_id 涉及历史指定发起人模板与人事删除预检。签名密钥、摘要、证书、legacy_prefix、材料与岗位快照仍参与历史验签。
- 身份 legacy_hr_id、legacy_admin_id 是现行业务映射。account_wechat_bindings.active_openid_hash 是生成列，唯一索引防止双重绑定。其他表的 openid_hash、会话 binding_mode/openid_ciphertext、设备字段仍用于绑定、恢复或会话治理。
- 场地 approval_flow_id/current_step/total_steps/reject_step 仍承担历史流程重建及详情；旧规则范围字段进入不可变规则。生产 venues 与规则表没有残留 org_id 列。
- 评分记录岗位、上下文、模板签名用于历史结果；score_template_order 保留模板引用保护；评分回填审计保留证据。
- absolute_time_*、identity_migration_guards、schema_migrations 属于时间证明/身份迁移/发布账本；删除审计时间、字典锁时间与限流桶不是废弃列。旧 auth_challenges 表仍有历史清理引用，不能以业务入口少为由删空结构。

## 发布与检查

先发布省略旧字段的客户端和兼容服务端（会话摘要先加默认值），核对运行版本后第二次发布在线删列声明。不得一次提交就删除旧运行版本还需写的列；不使用停机维护。共享列名仅允许经人工确认的其他表引用，按确切文件SHA256绑定，源码变化即停止迁移重新审计，不采用路径通配豁免。

专项测试覆盖新端实际参数、旧参数缺省/旧值/异常值、两种schema、真实HTTP/MySQL保存回读、会话创建认证、跨组织拒绝、INSTANT和索引在线删除、元数据锁超时、迁移账本及重复执行。微信主包与6分包真实编译共2,578,703字节；实体手机与Pad未现场验证。全量CI未运行。生产执行结果以最终部署版本、迁移账本与字段查询为准。
