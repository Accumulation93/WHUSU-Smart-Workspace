# 待办事实与旧通知：独立前端语料定稿

语言 Agent 定稿。服务端只给已授权的类型和事实，前端格式化。用户填写的申请标题、活动名可原样显示，但不能从旧通知标题或正文中猜测提取事实。

## 有结构化事实的待办

各卡标题使用本地类型标题，业务名称单独一行，人员和步骤再用以下完整句。没有返回的姓名不展示，不以“未知人员”凑句。实际标题为空才使用本地类型名。

| 类型 | 本地标题 | 事实呈现 | 独立语料 |
|---|---|---|---|
| audit_approval | 待审批的审核申请 | title独立显示；submitterName与stepOrder | auditPendingFrom(name,step)：{name} 提交的申请，第 {step} 步等待你审批。 |
| venue_approval | 待审批的场地借用 | title独立显示；venueName独立场地行；applicantName与当前步骤 | venuePendingFrom(name)：{name} 提交的借用等待你审批。 |
| scoring_task | 待完成的评分 | activityName独立显示；pendingCount | scoringPending(count)：还有 {count} 项评分需要完成。 |
| hr_profile_review | 待审核的成员资料 | name | profilePending(name)：{name} 提交了资料修改，等待你审核。 |

补充键：todoVenueLabel＝“场地”；todoCurrentStepLabel＝“当前步骤”；todoStepOrder(order)＝“第 {order} 步”；auditPendingWithoutName(step)＝“第 {step} 步等待你审批。”；auditPendingWithoutStep(name)＝“{name} 提交的申请等待你审批。”；auditPendingGeneric＝“有一条审核申请等待你审批。”；venuePendingGeneric＝“有一条场地借用等待你审批。”；profilePendingGeneric＝“有一份成员资料等待你审核。”；scoringPendingGeneric＝“有评分任务等待你完成。”

步骤名称是业务数据，不与序号混拼。如果姓名缺失不填替代身份；pendingCount必须真实数字，不存在时用通用句，不把未知显示为0项。

## 旧通知只有类型时

旧条目只能表达“系统曾发出该结果通知”；描述引导查看当前状态，不能认定业务仍待处理。隐藏机制和权限继续由服务端执行，文案不代替业务状态过滤。

| type | 本地标题 | 本地描述 |
|---|---|---|
| submission_approved | 审核申请通过通知 | 查看申请详情，了解审批结果。 |
| submission_progress | 审核进展通知 | 查看申请详情，了解当前审批进展。 |
| submission_rejected | 审核申请驳回通知 | 查看申请详情，了解驳回原因。 |
| booking_approved | 场地借用通过通知 | 查看借用详情，确认借用安排。 |
| booking_rejected | 场地借用驳回通知 | 查看借用详情，了解驳回原因。 |
| booking_cancelled | 场地借用取消通知 | 查看借用详情，了解取消情况。 |
| hr_profile_approved | 资料审核通过通知 | 查看本人资料，确认已生效的内容。 |
| hr_profile_rejected | 资料审核驳回通知 | 查看本人资料，了解需要修改的内容。 |
| hr_profile_migration | 资料迁移通知 | 查看迁移申请，了解处理结果。 |
| score_activity_started | 评分活动开始通知 | 查看评分活动，了解需要完成的任务。 |
| score_activity_deadline_24h | 评分截止提醒 | 查看评分活动，确认截止时间和任务进度。 |
| score_results_published | 评分结果发布通知 | 查看已获授权的评分结果。 |
| calendar_reminder | 日程提醒 | 查看日程详情，确认时间和安排。 |
| account_security | 账号安全通知 | 查看账号状态和微信绑定信息。 |

上表实际 type 名称以服务端登记为准；不得依标题正文反推。账号实际type已核为account_security，当前用于微信恢复完成；仅凭该宽类型不推断其他安全事件。旧截止提醒不承诺“还有24小时”，旧活动开始不承诺“正在进行”。类型未知用 unknownNotificationTitle＝“工作台通知”，unknownNotificationDescription＝“打开详情，查看这条通知的相关信息。”；没有可打开目标时改用 notificationDetailUnavailable＝“这条通知暂时无法打开详情。”，不能显示无效打开按钮。
