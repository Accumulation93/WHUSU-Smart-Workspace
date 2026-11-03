# 审核签署、场地、日程写作队列与语境

前端逻辑 Agent 静态审阅，2026-11-03。三模块依次交语言 Agent，不把同一个模块有语料文件视为全部入口已审。最终文案不在本文件撰写。

## 本轮新边界

界面系统提示由前端根据语料键/状态码与结构化参数渲染，不能直接显示 API 的 message 或异常文字。姓名、组织、岗位、文件名、用户填写的申请标题、审批意见、驳回原因、日程描述等为业务事实，不得清除。服务端生成文档与外部消息允许使用独立输出语料；不能因此把同一份渲染好的段落直接作为页面提示。

每个接口需将失败原因码与事实参数分开，未知错误使用前端通用提示；不能根据服务端中文字符串反向猜码。可信字段也仅用文本渲染，不能用 HTML。参数不足应先补接口，不能让语言 Agent 编造原因。

## 审核与签署

真实入口为 miniprogram/subpackages/audit/pages 下 mySubmissions、submissionDetail、pendingApprovals、myApprovalHistory、signatureManager、signing、verification、verificationReport，以及审核管理 Behavior。网页为 AuditCreateView、AuditSubmissionView、AuditSignatureView、AuditPendingView、AuditHistoryView、AuditMySubmissionsView、audit/AuditSigningView、AuditVerificationView、AuditVerificationReportView、system/SystemAuditTemplateView。

语料包括 auditSigning.js、auditVerification.js、signingEvidence.js、stampAuthorization.js、generated/subpackages/audit/pages 与 components、generated/subpackages/scoring/pages/admin/modules/auditBehavior.js。网页 audit/verify 语言文件是引用入口，不能独立改写。

| 场景 | 用户实际动作及结果 | 写作必须明确 |
| --- | --- | --- |
| 创建申请 | 选择模板、填标题与业务表单、附件，按配置发起 | 草稿保存和正式提交分开；没有模板与模板加载失败分开 |
| 审批 | approveStep/rejectStep 对当前步骤执行，签章材料和下一处理人可能有要求 | pass/signature/stamp/both/either 五类要求；either 至少一种，both 两种都需，不得统称签章可选 |
| 已执行但详情重读失败 | 原生 pendingActionRead 防止重复处理 | 应引导重读结果，不是再次审批；未知网络提交结果也不能宣称一定未处理 |
| 撤回与重提 | withdrawSubmission 后可编辑；resubmitAudit 新轮次 | 重提逐步重审，不能沿用回到驳回人的旧说法；旧轮次历史仍存在 |
| 进入签署 | signing handoff 区分文件工作区与 pad | 文件签署不强制横屏，空白签名板才 landscape；浏览、移动、画笔分别处理镜头、已选对象、书写 |
| 签署确认 | 输出当前附件步骤草稿，confirm 回调用于返回原审批页 | 不等于提交审批；可选saveSignature只保存个人签名模板，不替用户完成审批 |
| 草稿与图层 | 以步骤/附件维护历史，可撤销材料调整；多次进入形成书写层 | 清空只针对当前附件本步骤书写，不删除正文、历史签章；不能笼统写清空文件 |
| 签名库 | 个人模板可保存，签署页可选同时存库 | 修改模板与当前文件材料区分；不能把临时直接书写自动说成已保存签名 |
| 验签 | 检查文件、历史步骤及对应签署证据 | 哈希、平台托管、外部CA认可与第三方时间证据不得混为真伪认证；专业证据与普通页面分层 |

系统提示直出路径已定位：原生 submissionDetail.js 的 approve/reject/resubmit/withdraw/upload分支使用 res.message/uploadRes.message；网页 AuditSubmissionView.load 的 result.message、AuditVerificationView.response.message。审批 step.comment、rejectionReason、event.comment、template.description 属于业务输入，必须保留。步骤 statusText、approverDesc 若是后端拼出的固定说明需改结构化岗位数据+前端格式化，不能按字段有 Text 后缀直接一律放行。

结构注意：签署保存失败当前有时归为统一图片导出失败，须区分文件读取、图片生成、个人签名保存三阶段。按钮仍确认返回时，不能用其提示暗示个人签名一定存库成功。未现场验证16倍缩放、旋转或改色不能据文案宣布体验完成。

## 场地借用

原生入口为 venue/pages 下 venueBookings、venueBooking、myVenueBookings、pendingVenueApprovals、venueApprovalHistory、venueApprovalHistoryDetail、venueManage 与 venueManagementBehavior；共享详情为 venue/components/venueBookingDetail 与 utils/venueBookingDetail、flowTimeline、venueRuleDisplay。网页为 views/venue 全系列。语料包括 venueFlowManagement.js 与 generated/subpackages/venue 下对应页面、组件及工具。

预约创建、审批、取消、提前结束、永久删除、周期活动占用、参会名单各有不同对象。取消个人借用不是仅退出参会；提前结束只影响后续占用；永久删除必须服从权限和二次确认。时间选择受开放、截止和冲突三类条件，不得只给无效时间而不指出阻止原因。活动占用详情须展示具体本次时间及周期规则，不能把周期生效范围当本次活动起止。

审批列表与历史读取不等于编辑权限；可看参会人与可修改参会人分开。普通用户参与者退出会反映名单，但不能写成取消整场借用。借用人姓名、参会人姓名/岗位、事由实际内容保留；系统状态、流程当前步骤与未到达说明由前端语料生成。

已定位网页 VenueMyBookingsView 的 listMyVenueBookings、cancelVenueBooking、endVenueBooking均直接用 result.message，其 catch走errorText；这些需要前端码映射。历史缺岗位记录不能借文案恢复授权或当前岗位补历史，应显示事实不足并保持读取限制。

全局共享场地开放时间与组织独立审批规则不同；管理文案不能把所有场地设置都标仅当前组织。配置复制中的共享场地影响提示仍保留，不能为了精简删掉范围。

## 日程

网页入口 CalendarView、CalendarEditView、CalendarConditions；原生workspace分包的calendar相关页与组件需按路由继续逐个读。主要语料calendar.js，显示计算shared/calendarView.js。

| 动作 | 实际范围 | 不可混淆 |
| --- | --- | --- |
| 新建 | 个人私有日程或组织安排日程，参会人受规则限制 | 没有用户主动报名，不提供接受/拒绝邀请语义 |
| 选择参会人 | 当前规则允许的指定人或动态范围 | 选择范围会动态变化，主动退出不能被再加回 |
| 修改重复日程 | instance/following/series 分别作用本次、本次以后、整个系列 | 网页非series禁改重复规则与targets，说明不能承诺任意范围都能改参会规则 |
| leave | 仅退出自己的参会，场地来源联动移除本人 | 不取消其他人日程，不删除整场活动 |
| cancel | 有资格的创建者/管理者取消活动 | 必须显示影响范围；和leave不能共用含糊的取消确认按钮 |
| 场地来源 | 审批通过后加入，变更或取消联动 | 不能在日程直接修改场地本体规则；sourceKind编辑页只保存参会人 |
| 手机日历 | ICS一次导出、订阅凭据、撤销订阅分别处理 | 下载不保证已写入系统日历；订阅刷新由客户端决定，不能承诺立即同步；凭据是私密访问能力 |

网页changeCalendarParticipation带id/version/occurrenceDate/scope/action；文案必须用当前确认对象，保存后刷新。CalendarView和Edit错误目前统一errorText，需码映射与已批准前端fallback。日程title/location/description及参会人姓名为业务数据；sourceKind为枚举需前端语料，服务端error message不能原样显示。ICS content是文件输出例外，不属于页面提示。

## 交接与验收要求

先逐键补齐审核签署语境，再场地、再日程；上述仅建立队列和重点，并未完整读完所有页面与所有失败码。语言 Agent 可据结构问题拒绝出稿，实施 Agent 必须先补结构/参数再引用批准语料。各阶段需实际保存回读；文本检查不证明签名保存、审批或借用提交成功。手机和Pad现场未执行必须如实记录。
# 补充：待审批读取失败与成功空态（2026-11-03复核）

`venue/components/pendingApprovals`的loadData与`venue/pages/venueBooking`的loadPendingData均在失败时只Toast，首次pending为空会被WXML当作全部处理完。两处实现都活跃；pendingVenueApprovals页只作组件壳，不能只修改旧页壳。

需要独立读取失败状态：首次失败显示错误与重试，不显示成功空态；同角色同范围刷新失败保留列表但禁止据此提交；切换角色/查询范围清理旧结果，迟到失败不得写回。组件候选读取失败仍保留当前审批编辑内容，不误作审批提交失败。审批成功提示必须是完整动作句，仅在明确success分支出现。
