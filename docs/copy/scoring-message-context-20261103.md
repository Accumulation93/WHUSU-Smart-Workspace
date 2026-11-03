# 评分与消息中心：前端写作语境

2026-11-03，前端逻辑 Agent。本文记录真实入口、操作对象及结构风险，最终文案由语言 Agent 另写；不是运行验收报告。

## 评分

原生入口：scoring/pages/score、scorerTasks，workspace/pages/home 的待评分、公示、评优区；管理端 scoring/pages/admin/modules 的 activityBehavior、templateBehavior、ruleBehavior、resultBehavior、publicationBehavior。网页入口：views/scoring/ScoringTasksView.vue、ScoringFillView.vue，views/WorkbenchView.vue、admin/AdminConsoleView.vue 及管理组件。语料来源：home.js 的评分区与 generated/subpackages/scoring/pages 下对应页面、admin/modules；不能因 admin.js 包含评分和人事文案而整文件算同模块已完成。

| 对象 | 实际用途 | 写作边界 |
| --- | --- | --- |
| 评分活动 | 起止、暂停状态与本次评分的所属活动 | 无活动、未开始、已暂停、已结束不是同一种空状态；恢复加载不能解除活动暂停 |
| 被评分岗位 | getRateTargets 返回当前角色有资格评分的对象 | 评分人和被评分人必须区分，目标岗位不能只按姓名合并；不展示学号 |
| 评分表 | getScoreFormData，题目、范围、步长、只读状态 | 題目文本是管理员业务内容；错误应指明哪题、允许范围和增量，不泛称格式错误 |
| 保存评分 | submitScoreRecord 包含当前评分人岗位、目标岗位、活动、答案、配置标识与并发版本 | 再次评分覆盖当前结果，不能说新增一条历史版本；未保存离开必须说明会丢失未提交修改 |
| 并发变更 | score_revision_conflict 后重新读取表单 | 不应声称保存成功或自动保留全部本地修改；加载重新赋值需与提示一致 |
| 模板 | 题目顺序、分值等可编辑；duplicateScoreTemplate直接请求复制 | 模板复制成功与载入本地编辑草稿不同；导入模板是导入题目，不导入评分结果 |
| 评分规则 | 被评类别、评分者条件、模板组合、计算方法等 | 条件、评分模板与汇总方式是不同层；不能用泛称设置让用户不知保存哪层 |
| 结果/公示 | 管理结果、发布可见范围、评优规则与指定人选 | 有评分结果不等于已公开；公示规则的查看者与被公示人员分开；管理员能看不证明普通人可见 |

已读评分表 submit：成功显示前端确认后回待评分列表；失败 `result.message` 当前直出，须改状态码映射；getScoreFormData 与活动状态同样存在 message 优先。用户题目标题、模板名、活动名、姓名、部门岗位是业务事实应保留，后端产生的状态文字与错误解释须前端格式化。

管理规则多层编辑中有本地添加/取消条款、最终saveRateRule、batchSaveRateRules、自动generateRateTargetRules。最终语料必须依据实际提交层，不能把本地条款保存写成规则已生效。批量选择基于筛选后的可见规则，不能套用人事导入“含未加载全部行”的语义。规则生成Safe/Final兼容函数及旧入口仍需逐WXML事件核对可达性，不能搜索方法名即认定全部仍提供给用户。

## 消息中心

实际入口：miniprogram/subpackages/message/pages/messageCenter/messageCenter.js/.wxml；web/src/views/MessagesView.vue；门户的预览另在portal。语言为messages.js、messagePerformance.js、generated/utils/messageScope.js；跨角色导航见两端messageNavigation/messageScope/receipt工具。

待办由当前业务事实生成，通知为消息记录。标为已读不会完成审批，删除通知也不取消申请、预约或日程。全部清除只作用当前选择的组织范围内通知，不清待办；必须明确本次选的是某组织还是全部可访问组织。跨组织跳转需要选择或激活可用工作角色，不能把列表切换范围当作已切换工作角色。

网页 listTodos/listNotifications 会分页；当前已加载条数不等于总条数。清除不是只清当前页面；组织部分失败须保留失败状态，不宣称全部清空。原生deleteNotification错误构造仍使用result.message，但最终有固定失败提示；应保留码而不运输可显示的系统语句。

服务端 notifications 路由 deleteAll 使用 scope上下文聚合执行并返回failedOrganizations/partial，deleteById按actor查询记录。因此前端不能用单个成功status推断所有组织成功。自然人跨设备隐藏的实现应继续到notification Model逐项核对，不凭路由就宣称可永久跨设备保证。

通知标题/描述需分类：系统生成的步骤、状态、提醒句应由事件类型与事实参数映射；真实活动标题、用户意见等保持原值。外部推送使用独立服务端输出语料是例外，但页面不直接显示外部推送文案来绕过前端资源。

结构问题：messages.view.partialOrganizationLoading 目前承诺正在重试，需查事件是否真的自动调度；无重试时应提供实际入口并交语言 Agent写定稿。全部已读、全部清除、单条删除三种动作须分开确认范围和反馈数量。成功记录消失后定位稳定、部分失败后仍可继续，不能只隐藏失败卡片。

## 未完成核查

追加核实：notification Model 的 deleteById 在事务中写入 notification_dismissals(org_id, person_id, event_hash)，列表 visibleSql 按同组织自然人与事件摘要过滤；同一事件跨该人的角色隐藏有此代码依据，不是删除审批等业务实体。publicationBehavior.loadPublicationData 失败清空规则与指定名单，但未提供整体独立失败状态；写作不能把它解释成未配置规则。resultBehavior 的导出区分完成情况与结果报告，传当前活动及筛选范围，权限也分别检查。

评分管理全部条款/计算配置/结果导出、通知Model自然人删除关系尚未逐项读完。本文为后续逐键写作基础，不代表这些业务已验收。实施需实际执行一次合法评分并回读、并发覆盖拒绝、仅有已读通知与混合组织失败；生产不得创建测试评分或通知。
