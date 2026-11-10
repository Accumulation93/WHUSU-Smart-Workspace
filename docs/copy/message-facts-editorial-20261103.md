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

## 2026-11-10 具体业务概览重审：结构要求

前文“旧通知只有类型”仅适用于确实无法取得授权业务事实的历史记录，不得用于所有通知。当前 messageFactsView 的通知分支完全不读取 displayFacts，导致有业务名称也被类型标题替代，本结构退回重做。

每张卡使用三个层次：业务名称作为主标题；完整句说明发生了什么或需要做什么；相关步骤、场地、时间等事实作为简短明细。卡片能否打开只控制按钮与打开失败说明，不能覆盖已有业务描述。申请标题、步骤名称、成员姓名和理由直接使用已授权业务字段，不解析旧通知的系统句子。

通知记录对应某次事件，待办对应当前任务。若历史通知只能查询到业务当前状态，应以“当前进展”显示，不把当前步骤当作通知发生时的步骤。服务端必须区分事件事实与当前事实。未获得字段时省略相应明细，不填“未知人员”或猜序号。

### 四类待办逐项定稿

标题优先使用已授权业务名称；以下类型标题只在名称缺失时使用。步骤名称与步骤序号都可靠时可同列显示，但名称不嵌入序号占位符。

| 类型 | 无名称标题 | 完整动态描述及缺字段分支 |
|---|---|---|
| audit_approval | 审核申请待审批 | auditTodoFrom(name)：{name} 提交的申请等待你审批。；无姓名 auditTodo：这份申请等待你审批。；当前步骤独立明细必接可靠的步骤名或序号，不继续把主标题丢掉 |
| venue_approval | 场地借用待审批 | venueTodoFrom(name)：{name} 提交的借用等待你审批。；无姓名 venueTodo：这份借用申请等待你审批。；场地与当前步骤分别一行 |
| scoring_task | 评分任务 | scoringTodo(count)：还有 {count} 项评分待完成。；数量缺失 scoringTodoUnknown：请查看本活动中待完成的评分。；真实为0时 scoringTodoComplete：当前评分任务已全部完成。并应由业务逻辑移出待办，不能显示“还有0项待完成” |
| hr_profile_review | 成员资料待审核 | profileTodo(name)：{name} 提交的资料修改等待你审核。；无姓名 profileTodoUnknown：这份资料修改等待你审核。；姓名是独立memberName事实，不拿任意businessTitle当人名 |

### 十四类通知逐项定稿

主标题优先业务标题、活动名称或日程名称；人事类可用明确的成员资料标题。没有业务名称时才使用本表“缺名称标题”。描述不重复长标题，避免同一卡把名称打印两遍。

| type | 缺名称标题 | 完整描述 |
|---|---|---|
| submission_approved | 审核申请已通过 | auditApproved：这份申请已完成全部审批步骤。 |
| submission_progress | 审核进展 | auditProgress(completed,current)：第 {completed} 步审批已通过，现进入第 {current} 步。；仅已完成步骤 auditProgressCompleted(step)：第 {step} 步审批已通过。；只有当前事实 auditCurrentStep(step)：当前进行到第 {step} 步审批。；均缺 auditProgressUnknown：申请有新的审批进展，具体步骤请查看详情。 |
| submission_rejected | 审核申请被驳回 | auditRejectedAt(step)：申请在第 {step} 步审批被驳回。；无步骤 auditRejected：这份申请已被驳回。；真实理由独立显示，不从旧描述猜取 |
| booking_approved | 场地借用已通过 | venueApproved：这份借用申请已审批通过。；场地、借用起止时间独立展示 |
| booking_rejected | 场地借用被驳回 | venueRejected：这份借用申请已被驳回。；场地、原申请时间及授权可见理由分别展示 |
| booking_cancelled | 场地借用已取消 | venueCancelled：这次场地借用已取消。；真实取消原因独立行，无原因不臆测用户撤回或超时 |
| hr_profile_approved | 资料审核已通过 | profileApproved：你提交的资料修改已审核通过。；若存在审核通过即生效的权威事实可沿用本人资料生效状态，不能由当前字段值反推旧修改内容 |
| hr_profile_rejected | 资料审核未通过 | profileRejected：你提交的资料修改未通过审核。；可见驳回理由独立行，无理由不声称查看详情一定有理由 |
| hr_profile_migration | 跨组织资料迁移 | migrationPending：资料迁移申请正在等待审核。；migrationExecuted：资料迁移已完成。；migrationRejected：资料迁移申请未通过审核。；migrationCancelled：资料迁移申请已撤回。；migrationUnknown：资料迁移有新的处理进展，具体情况请查看申请。；只有权威状态时用前四句，宽type本身不证明成功 |
| score_activity_started | 评分活动已开始 | scoringStarted：本次评分活动已开始。；已授权截止时间单独显示，通知发生事实不等于现在仍可评分 |
| score_deadline_24h | 评分截止提醒 | scoringDeadline(time)：本次评分于 {time} 截止，请及时完成。；无截止时间 scoringDeadlineUnknown：请查看本次评分的截止时间，及时完成待评分任务。；不依据type计算“还有24小时” |
| score_results_published | 评分结果已发布 | scoringPublished：本次评分结果已发布，可查看你有权限查看的结果。 |
| calendar_reminder | 日程提醒 | calendarStartsAt(time)：日程开始时间为 {time}。；仅日期/全天状态应使用日程已有完整全天日期函数，不套具体开始时刻；缺时间 calendarTimeUnknown：请查看日程的时间和安排。 |
| account_security | 账号安全提醒 | accountWechatRecovered：账号的微信绑定已通过恢复操作更新。；仅在权威事件子类型明确是微信恢复时使用；无子类型 accountSecurityUnknown：账号有安全相关变更，请查看账号状态和微信绑定信息。 |

### 通用明细与缺字段处理

新增本地明细标签：businessTitleLabel＝申请名称；activityTitleLabel＝活动名称；memberLabel＝成员；completedStepLabel＝已通过步骤；currentStepLabel＝当前步骤；rejectedStepLabel＝驳回步骤；venueLabel＝场地；bookingTimeLabel＝借用时间；reasonLabel＝原因；deadlineLabel＝截止时间；scheduleTimeLabel＝日程时间；sourceOrganizationLabel＝来源组织；targetOrganizationLabel＝目标组织；currentProgressLabel＝当前进展。

步骤完整函数 stepNameAndOrder(order,name)：第 {order} 步 · {name}；只有序号复用todoStepOrder；只有名称原样显示。时间范围复用全系统已审日期时间格式与完整范围函数，不拼时区不明的后端日期。只有一端时间时保留独立开始或结束标签，不填破折号组成貌似完整时间。

缺少全部业务名称和明细时必须降级为本表具体结果标题与描述，不能继续使用“有一条xxx”。同时追踪缺事实原因：新通知应有事实，历史可在原权限内补读；读取失败不能假称原记录没有信息。未知类型保留工作台通知，不解析旧系统句子。

此节语料须由前端逻辑 Agent 与服务端核对事实可用性后逐项放行；未来字段名可调整，语义不能变。尚未提供事实的事件级字段不得凭本稿自行填造。新增已提供字段的语义核对结果追加本节，不能以本稿替代后端授权检查。

### 已核事实追加

- 审核进展 eventKey 中的步骤序号属于已通过的步骤；只有创建时保存的 nextStepOrder 才能用于“现进入第几步”。旧事件缺少 nextStepOrder 时使用 auditProgressCompleted，不取当前步骤伪装事件。当前步骤若单独读取，仅用 auditCurrentStep 并标当前进展。
- 驳回的轮次与步骤可由规范化事件关联确定，理由只从该轮该事件读取，不取下一轮或其他审批步骤的理由。授权匹配通过后允许上述已通过、驳回句式。
- 资料审核通过/驳回通知的目标是收件人本人；批准使用“你提交的资料修改”。待审核资料是另一个对象，必须使用独立 memberName，不将卡片标题当姓名。
- 日程提醒支持补送，开始时间可能已过；已将 calendarStartsAt 改成中性事实句，不使用“将于”。权威发生日期和时间可从对应日程实例取得，不能凭通知创建时间推算开始时间。
- 当前 account_security 唯一生产事件为微信恢复，只有明确 subtype 或规范化事件标识确认时使用 accountWechatRecovered；未知 subtype 保留中立安全变更句。

### 14 类事实核对后的实施放行

前端逻辑 Agent 已核对全部14类通知：审核3类可由授权申请和事件取得业务名、轮次、步骤；场地3类可取得事由、场地与起止时间；本人资料2类可取得本人的结果及对应意见；评分3类可取得活动名与有授权的截止配置；日程可取得对应发生实例起止时间；账号可按结构化事件确认微信恢复。上述完整句及缺字段分支批准按实际返回字段接入。

资料迁移单独限制：同一个 type 包含多种事件，历史没有明确子类型。没有事件状态时默认 migrationUnknown；若返回的是 currentStatus，则必须使用以下当前状态句，不能套事件完成句冒称本条通知所报告的动作：migrationCurrentPending＝资料迁移申请当前正在等待审核。；migrationCurrentExecuted＝资料迁移申请当前已完成。；migrationCurrentRejected＝资料迁移申请当前未通过审核。；migrationCurrentCancelled＝资料迁移申请当前已撤回。；migrationCurrentUnknown＝资料迁移申请的当前状态暂未确认。来源与目标组织分别展示。未知状态不等于已撤回。

评分截止补充：若截止时间来自现行活动配置，用 currentScoringDeadline(time)＝本活动当前的评分截止时间为 {time}。不得声称这是通知发出时的截止时间；已有 scoringDeadline 仅在事件事实或实时提醒明确对应这一截止配置时使用。无需显示“24小时”以免历史提醒倒计时失真。

轮次明细新增 roundLabel＝审批轮次，roundNumber(order)＝第 {order} 轮，仅有正整数事实时展示。业务名称缺失可用已授权申请编号作标题；不取旧通知title/description里的系统句子或拆解中文找名称。

四类待办全部批准按本节独立事实接入；14类通知全部完成逐项语义审查。待完成的是服务端事实投影与两端实现验收，不是允许实施自行补写未知情境。禁止缺字段伪造、跨轮次理由、未授权细节及依据当前状态伪造旧事件的条件继续有效。

时间明细完整定稿：startTimeLabel＝开始时间；endTimeLabel＝结束时间，可引用现有 calendar 同语义标签。timeRange(start,end)＝{start} 至 {end}，可复用已批准完整范围函数；allDayDate(date)＝{date}（全天）；allDayDateRange(startDate,endDate)＝{startDate} 至 {endDate}（全天）。全天范围中的结束日期必须是业务实际包含的最后一天，不把日历协议排他结束日期直接展示为多一天；同一天用 allDayDate。缺少任一日期或时间时不调用双参数范围函数，仅显示实际可确认的一端及其标签。

### 2026-11-10 实际 formatter 复审补充

新增 nextStepLabel 定稿：**转交步骤**。只标识该审批进展事件完成后转交到的步骤，值来自 event.nextStepOrder 与 event.nextStepName，沿用 stepText 完整函数。不能以 current.stepOrder/name 填入此行。

修订 auditProgress(completed,next) 为：**第 {completed} 步审批已通过，并转交第 {next} 步审批。** 原稿“现进入”容易把历史转交误读为当前进展，本句取代此前同键稿；真正当前步骤继续使用 auditCurrentStep 与 currentProgressLabel。

补充 calendarAllDay：**日程按全天安排。** allDay=true 且有可靠日期时使用，与完整日期明细同卡呈现；不要在已经展示全天日期时仍写“请查看日程的时间和安排”。若日期事实缺失仍用 calendarTimeUnknown。日程已返回授权 venueName 时追加现有 venueLabel 明细，不能在 formatter 丢掉。

本次实际复核已覆盖通知14个分支及待办4个分支：标题优先业务名/编号、资料待办独立 memberName、零评分数量专门句、历史event与当前current状态分开、不可打开仅actionNotice，均符合批准结构。以上转交步骤、历史措辞与全天日程3项须补齐后，语言实现复审通过；后端事实授权和真实交互仍须单独验证。

批准清理已被替代且实施已核两端生产/测试无引用的旧语料：auditPendingFrom、auditPendingWithoutName、auditPendingWithoutStep、auditPendingGeneric、venuePendingFrom、venuePendingGeneric、scoringPending、scoringPendingGeneric、profilePending、profilePendingGeneric、todoVenueLabel、todoCurrentStepLabel 和 notifications 旧数组。todoStepOrder 仍被新 formatter 使用，必须保留。网页 MessageRow 已逐行展示 title、description、detailLines、actionNotice，未把不可打开覆盖成空业务内容，静态语义通过。

### 日程地点与审核事件最终复审

日程提醒新增 `locationLabel`：**地点**，直接引用已审 `calendar.location`，不另造同义文本。值来自已授权 `displayFacts.location`，原样显示用户填写的地址、房间或线上会议地点；不能命名为“场地”。布局保持标题、完整描述、明细三层，地点列放在日程时间明细之后。location 缺失则省略该行，不用“暂无地点”占位。

真正来自场地资源的 venueName 仍可使用“场地”标签，不能将自由填写 location 填入 venueName。两项同时存在且不同可各占一行；文字完全相同可只保留“地点”行，不能通过模糊匹配合并不同地点。

已复核最终 messageFactsView：审核进展仅在 event 中确有 nextStepOrder 时生成转交句，缺失则只显示可靠已完成步骤，current 另行标当前进展。服务端取消推断 nextStep 后，这个显示分支合理，不必为了保留长句补造下一步。明确终态不显示仍在进行；当前步骤的字段必须是权威当前事实，不能因缺 status 将历史步骤塞入 current。

日程全天句、独立账号安全子类型、资料迁移当前状态、业务名称优先、不可打开仅影响 actionNotice，仍符合已批准语义。此次批准地点标签及明细位置后可继续实现验收；质量审计建议数量不等于语料错误数量，不据此批量重写已冻结文案。
