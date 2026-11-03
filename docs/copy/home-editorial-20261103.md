# 普通端人事、评分与审核入口语言审稿

源 `home.js`。账号区域定稿沿用 account-entry-editorial；本稿补全其余键及格式函数。已加载目录为空和加载失败分开，不在未取得权限结果时宣称没有权限。本人资料可显示本人学号，评分人选不可显示或搜索学号。

## text 剩余键

| 键 | 定稿／处理 |
|---|---|
| all | 全部 |
| rankMedalGold | 保留金牌装饰符，不作身份或可信证明 |
| rankMedalSilver | 保留银牌装饰符 |
| rankMedalBronze | 保留铜牌装饰符 |
| appName | 保留common.brandName引用 |
| organizationName | 保留common.organizationName引用 |
| defaultPageName | 考核评分 |
| scoring | 考核评分 |
| hr | 人事信息 |
| audit | 审核 |
| results | 结果公示 |
| meritList | 评优名单 |
| welcome | 欢迎使用 |
| signedOut | 未登录 |
| signInWithWechat | 请先登录（不能要求唯一微信认证） |
| superAdmin | 超级管理员 |
| admin | 普通管理员 |
| unsetIdentity | 未设置岗位 |
| currentActivity | 当前评分活动 |
| loadingDots | 正在加载 |
| noActivity | 暂无评分活动 |
| totalTargets | 需评分人数（总数不能称剩余待评人数） |
| completed | 已完成 |
| pendingScore | 待评分 |
| scoreTarget | 被评分人 |
| activityPaused | 当前评分活动已暂停 |
| activityNotStarted | 当前评分活动尚未开始 |
| activityEnded | 当前评分活动已结束 |
| loadingTargets | 正在加载评分任务 |
| refreshTargetsLater | 评分任务未能加载，请重试。 |
| noTargets | 暂无可评分人员 |
| unclassified | 未分类 |
| assignmentNatureStaff | 本会岗位 |
| assignmentNatureLiaison | 学院对接岗位 |
| assignmentNatureOther | 其他岗位 |
| waitingPublication | 等待公示 |
| noPublication | 暂无结果公示 |
| noPermission | 当前工作角色无权查看 |
| noVisibleResults | 暂无可查看的评分结果 |
| scoringResults | 评分结果 |
| totalPrefix | 共 |
| publicationCount | 公示人数 |
| maxScore | 最高分 |
| averageScore | 平均分 |
| personSuffix | 人 |
| positionSuffix | 个岗位 |
| groupSuffix | 个组别 |
| search | 搜索 |
| resultSearchPlaceholder | 搜索姓名、身份类别、部门或职能组（已核home.memberMatches确实搜索四项，不包含学号） |
| filter | 筛选 |
| identity | 身份类别 |
| department | 部门 |
| workGroup | 职能组 |
| clearAllFilters | 清除全部筛选 |
| grade | 等第 |
| score | 分数 |
| earnedScore | 得分 |
| noMatchingResults | 没有符合筛选条件的结果 |
| unrated | 未评级 |
| merit | 评优 |
| meritGroup | 评优组别 |
| designatedCount | 已指定人数 |
| involvedDepartments | 涉及部门 |
| edit | 编辑（独立图标，不放在文本） |
| noDesignatedMember | 暂未指定人选 |
| noMeritList | 暂无评优名单 |
| noTemplate | 当前组织未设置补充资料项（不能将未配置推断为无需填写） |
| profilePending | 资料修改已提交，正在等待审核。 |
| rejectionReasonPrefix | 驳回原因： |
| name | 姓名 |
| studentId | 学号（仅本人资料） |
| belongingDepartment | 所属部门 |
| workDivision | 职能组 |
| profileManagedByAdmin | 基础信息由管理员维护，如需修改请联系管理员。 |
| loadingProfile | 正在加载本人资料 |
| profileLoadFailed | 本人资料未能加载，请重试。 |
| reloadProfile | 重新加载 |
| noExtraProfile | 暂无补充资料 |
| select | 请选择 |
| inputNumber | 请输入数字 |
| selectDate | 请选择日期 |
| selectDateTime | 请选择日期与时间 |
| selectTime | 请选择时间 |
| inputPhone | 请输入手机号 |
| inputEmail | 请输入邮箱 |
| inputPrefix | 退回动态输入提示碎片，按format.required(label)完整句渲染 |
| submitReview | 提交审核 |
| saveProfile | 保存本人资料 |
| auditCenter | 审核中心 |
| myAudits | 我的申请 |
| pendingApprovals | 待我审批 |
| approvalHistory | 审批记录 |
| myApprovalHistory | 我的审批记录 |
| auditVerification | 文件验签 |
| auditVerificationDescription | 核对文件内容与签署记录。 |
| enter | 保留common.actions.enter引用 |
| noIdentity | 暂无可用工作角色 |
| backToPortal | 返回应用服务 |
| designateMeritList | 指定评优人选 |
| close | 保留common.actions.close引用 |
| currentList | 已选人选 |
| remove | 移除 |
| noCandidate | 暂无可选人选 |
| availableMembers | 可选成员 |
| nameOrStudentId | 搜索姓名（如未引用则删除；不得保留学号） |
| noMatchingMembers | 没有符合筛选条件的成员 |
| selected | 已选 |
| choose | 选择 |
| cancel | 保留common.actions.cancel引用 |
| saveList | 保存名单 |
| noFeatureInOrganization | 当前组织尚未开放这项功能。 |
| profileNotSubmitted | 尚未提交补充资料 |
| managementIdentity | 管理身份 |
| regularPosition | 岗位 |
| numberType | 数字 |
| sequenceType | 序列选择 |
| dateType | 日期 |
| datetimeType | 日期时间 |
| phoneType | 手机号 |
| emailType | 邮箱 |
| textType | 文本 |
| integerOnly | 仅限整数 |
| decimalAllowed | 可填小数 |
| dateFormat | 日期格式：年-月-日，例如 2006-10-20 |
| phoneHint | 请输入中国大陆手机号（11位）。 |
| emailHint | 例如：name@example.com |
| noProfile | 暂无本人资料 |
| contactAdminToEdit | 如需修改，请联系管理员。 |
| updateFailed | 资料未能更新，请刷新后查看。 |
| updated | 已更新 |
| enteringScorePage | 正在打开评分页面 |
| enterScorePageFailed | 评分页面未能打开，请重试。 |
| refreshLater | 退回无对象失败提示，实际请求使用公共反馈 |
| unlimitedPeople | 不限人数 |

## format 全部函数

| 函数 | 定稿 |
|---|---|
| navigationTitle(pageName) | 保留：{pageName或默认页名} - {品牌名} |
| shortest(value) | 最短 {value} |
| longest(value) | 最长 {value} |
| lengthLimit(parts) | 长度限制：{parts以顿号连接} |
| numberLength(parts,decimalText) | 数字长度：{parts以顿号连接}；{decimalText} |
| minimum(value) | 最小值 {value} |
| maximum(value) | 最大值 {value} |
| numberRange(parts,decimalText) | 数值范围：{parts以顿号连接}；{decimalText} |
| required(label) | 请填写“{label}”。 |
| minimumCharacters(label,value) | “{label}”的内容太短，请补充后再试（最低长度：{value}）。 |
| maximumCharacters(label,value) | “{label}”的内容太长，请缩短后再试（最大长度：{value}）。 |
| integer(label) | “{label}”需要填写整数。 |
| number(label) | “{label}”需要填写数字。 |
| minimumDigits(label,value) | “{label}”至少需要 {value} 位数字。 |
| maximumDigits(label,value) | “{label}”不能超过 {value} 位数字。 |
| minimumValue(label,value) | “{label}”不能小于 {value}。 |
| maximumValue(label,value) | “{label}”不能大于 {value}。 |
| select(label) | 请选择“{label}”。 |
| selectValid(label) | “{label}”的选项已不可用，请重新选择。 |
| check(label) | 请检查“{label}”的填写内容。 |
| reopenScorePage(name) | 请重新打开“{name}”的评分页面。 |
| exactQuota(value) | 需指定 {value} 人 |
| maximumQuota(value) | 最多指定 {value} 人 |

长度验证按实际字符串长度，不以字数作保证。选择无效与未选择需要不同提示；selectValid仅用于已有失效选择，首次空值用select。没有真实选项失效判断的调用需继续用select而非推测失效。

## 资料审核状态与完整度分离

root已明确新增 `reviewStatus` 保留原始审核状态，旧 `auditStatus` 保留旧客户端兼容含义；新端不得把因缺必填资料降为none的旧状态当成从未提交。新端使用reviewStatus，缺失时仅在已知旧状态不是降级场景才可采用，否则显示未知。没有字段读取授权时不展示该状态，不用未知提示泄露隐藏字段存在。

| 新键 | 定稿 | 使用事实 |
|---|---|---|
| profileReviewNone | 未提交审核 | reviewStatus=none |
| profileReviewPending | 待审核 | reviewStatus=pending |
| profileReviewApproved | 已生效 | reviewStatus=approved |
| profileReviewRejected | 已驳回 | reviewStatus=rejected |
| profileStatusUnknown | 资料审核状态暂未确认 | 未知或未提供的已授权审核状态 |
| profileComplete | 必填资料已填齐 | isComplete=true |
| profileIncomplete | 必填资料待补充 | isComplete=false |
| profileCompletenessUnknown | 资料完整度暂未确认 | 未返回完整度，不能当false |
| profileModeDirect | 修改后直接生效 | editMode=direct |
| profileModeAudit | 修改后需审核 | editMode=audit |
| profileModeReadonly | 仅管理员可修改 | editMode=readonly |
| profileModeUnknown | 填写方式暂未确认 | 未知模式，不能默认放开编辑 |

“已生效”与“必填资料待补充”可以并列：旧资料已经生效，但当前模板还有必填项未填。不能将两项状态合并成未提交，也不能把待审核等同资料不完整。
