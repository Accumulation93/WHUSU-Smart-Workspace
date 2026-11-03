# 场地展示事实与缺失信息独立定稿

语料目标为 `shared/locales/zh-CN/venueFacts.js`。前端按creatorType、事件事实与真实步骤数引用；业务姓名、岗位标签、场地名称保留原文，不解析服务端拼接的creatorLabel。

| 键 | 完整定稿 | 使用情境与限制 |
|---|---|---|
| creatorAdmin | 管理员创建 | creatorType明确为admin |
| creatorUser | 用户创建 | creatorType明确为user；不额外推断此人的全部管理身份 |
| creatorUnknown | 创建方式暂未确认 | 缺失或未知creatorType，不默认管理员 |
| nameMissing | 姓名未记录 | 历史创建人或业务主体姓名确实未留存；不用于目录请求失败 |
| venueNameMissing | 场地名称未记录 | 记录中未留存场地名称；不把加载失败说成未记录 |
| assignmentMissing | 岗位未记录 | 历史事件确实没有岗位信息；不拿当前岗位填充 |
| approverMissing | 处理人未记录 | 已发生的审批事件缺处理人姓名；不是尚未处理步骤 |
| approverRangeUnknown | 审批人范围暂未确认 | 未知approverType且无法准确解释，不能称管理员或任何人 |
| defaultStepName(order) | 第 {order} 步审批 | 正整数步骤序号，用户自定义stepName优先 |
| stepNameMissing | 审批步骤 | 序号也缺失，不补造第1步 |
| completedSteps(completed,total) | 已完成 {completed} / {total} 个审批步骤 | 仅使用权威完成数量与有效总数，不由序号猜完成 |
| approvalProgressUnknown | 审批进度暂未确认 | 缺失、非法数量或未知流程，不把未知显示为完成 |

同一记录中姓名缺失时不再追加岗位缺失行，避免连续两个无意义缺失标签。姓名存在但历史岗位缺失时才显示assignmentMissing。未来待处理步骤仍由审批条件说明负责，不能用approverMissing误报处理人未记录。管理员创建不等于已经审批通过，创建类型标签不得替代借用状态。

approverType的已知动作说明复用已批准的审批条件/场地规则语料；这里不新增任意管理员均可处理的承诺。若事实只有处理人姓名和岗位，直接展示事实，不按类型重新推断岗位。

旧服务端缺失语料引用复核：venueApprovalAdmin无匹配审批流程分支可用既有copy_00853d1d28“请刷新审批流程后重试”维持旧协议，不由新前端直显。授权禁止不采用“请切换到相应的管理权限”，因为不能保证有另一个可用角色；新前端使用已审requestFeedback.forbidden。unifiedIdentity生成邀请的member_not_found实际含有效成员且无既有绑定的条件，不能断言人员不存在；旧兼容可用现有copy_014ac651ad“请重新选择”，新前端仍按稳定码处理，不从该旧消息推断原因。
