# 身份核验结果页结构复核

前端设计 Agent 与独立语言 Agent 已批准：浅色玻璃详情卡，标题、姓名与状态、核验结果、组织及岗位、核验时间、刷新依次展示。无岗位不在姓名下重复提示，岗位行保留。失败和加载不显示成功徽标。

复用现有 identityCard 语料：verifyTitle、verified、organization、position、checkedAt、refreshVerification、retry、loading、verificationUnavailable、failure、noPosition。无新增语料，不改接口、权限和本人身份卡；实施 Agent 只调整两端视图及局部样式。实体手机与 Pad 未完成现场验证。
