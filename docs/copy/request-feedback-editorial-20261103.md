# 请求结果与错误：公共语言定稿

独立语言 Agent `/root/language_editor`。用户界面不得直接使用服务端 message；根据稳定结果码与已校验事实参数取前端共享语料。此稿先规定通用情境，主 Agent 提供实际 API 代码映射后逐项批准映射；不改变错误分类或凭提示判断请求是否成功。

## 必须区分的结果

读取失败可以提示重试；提交超时、断网和未知结果不能一律说提交失败，因为请求可能已经完成。必须保留已有提交标识并查原结果，不能以文案要求用户盲目再次提交。没有结果查询能力时使用不确定提示，避免引导重复业务。

401只提示重新登录；403提示当前工作角色无权，不自动更换账号或工作角色重放。限流须区别用户短时间操作频繁和服务整体繁忙，有明确可用等待秒数才显示数字。取消是用户主动行为时不报错。成功为空、没权限、网络失败必须各自独立。

## 新语料建议归属 shared/locales/zh-CN/requestFeedback.js

| 键 | 情境及前提 | 完整定稿 |
|---|---|---|
| networkUnavailable | 请求未能建立连接；读取或确认未发出的写入 | 网络连接失败，请检查网络后重试。 |
| readTimeout | 只读请求超时 | 加载超时，请重试。 |
| readFailed | 未分类读取失败 | 暂时无法加载，请稍后重试。 |
| sessionExpired | 登录失效 | 登录已失效，请重新登录。 |
| loginRequired | 尚未登录 | 请先登录后再操作。 |
| forbidden | 当前角色权限不足 | 当前工作角色没有这项操作权限。 |
| roleUnavailable | 当前岗位或管理身份失效 | 当前工作角色已不可用，请重新选择工作角色。 |
| organizationUnavailable | 目标组织无法访问 | 当前无法访问这个组织，请重新选择组织。 |
| resourceUnavailable | 不存在或不可读，不能泄露存在性 | 这项内容已不存在或无法访问，请返回列表刷新。 |
| conflict | 数据版本变化、旧编辑未写入 | 内容已被更新，请刷新后核对，再重新保存。 |
| referenceChanged | 引用岗位、字典或业务对象失效 | 所选内容已发生变化，请重新选择后再提交。 |
| invalidInput | 未分类输入不合法，已知字段用专项语料 | 填写内容不符合要求，请检查后再提交。 |
| requiredField(label) | label须来自已批准字段目录，不直接服务端自由文本 | 请填写{label}。 |
| requiredSelection(label) | 同上，选择控件 | 请选择{label}。 |
| busy | 临时服务繁忙，未接受写入或只读 | 服务暂时繁忙，请稍后重试。 |
| rateLimited | 当前请求明确受到频率限制 | 操作过于频繁，请稍后重试。 |
| retryAfterSeconds(seconds) | 服务端已验证正整数等待秒数 | 操作过于频繁，请在 {seconds} 秒后重试。 |
| cancelled | 用户主动取消且界面需要确认 | 已取消。 |
| writeRejected | 服务端明确拒绝且没有写入，未知业务原因后备 | 本次操作未获通过，请核对页面内容；如仍无法完成，请联系管理员。 |
| writeResultUnknown | 写请求已发出但结果未知 | 暂未确认操作结果，请先刷新查看，避免重复提交。 |
| checkingWriteResult | 已实际开始查询同一提交结果 | 正在确认操作结果，请稍候。 |
| writeStillPending | 服务端确认同请求仍处理 | 操作仍在处理中，请稍后查看结果。 |
| unsupportedResult | 前端无法理解新结果结构，不视为成功或失败 | 暂时无法确认处理结果，请刷新查看；如仍有问题，请联系管理员。 |
| outdatedClient | 旧版写入口明确只读或协议不支持 | 当前版本不支持这项操作，请更新后重试。 |
| partialRead | 部分读取失败但已有结果保留 | 部分内容未能加载，已显示可读取的内容，请重试。 |
| copyFailed | 剪贴板写入失败 | 复制未完成，请重试。 |
| downloadFailed | 文件获取失败，未进入保存阶段 | 文件下载失败，请检查网络后重试。 |
| fileSaveFailed | 明确本机保存失败 | 文件未能保存，请重新选择保存方式。 |
| emptyResult | 成功空结果，只作无业务对象的后备 | 暂无内容。 |
| retryAction | 真正恢复动作 | 重试 |
| refreshAction | 重新读取权威状态 | 刷新 |
| loginAction | 登录导航 | 去登录 |
| chooseRoleAction | 工作角色导航 | 选择工作角色 |

## 不批准的处理

- 把服务端自由文本、内部结果码、SQL、堆栈拼入上述句子。事实参数只允许受约束的数值、日期和业务数据；姓名、活动名等用户事实不由语言 Agent 改写。
- 把未知结果统一映射“操作失败”或“保存成功”。HTTP成功也需识别业务结果码。
- 把所有无权限映射“请联系超级管理员”：多数是当前角色范围不符，不能承诺管理员应赋权。
- 在无实际重试、查询或跳转入口时写“正在重试／正在确认”。
- 将后端需要生成的正式文书、表格列头、对外通知内容硬塞为前端错误码。此类输出仍需独立输出语料与审稿；机器协议字段不作为文案改写。

未完成项：实际API结果码清单与每个写请求的幂等、结果查询事实尚待提供，不能据本稿宣称全系统错误显示已接入。

## 公共映射第一轮审查

批准401→sessionExpired、403→forbidden、426→outdatedClient、429→rateLimited；已登记只读请求按读取失败／超时处理。invalid_params/invalid_request→invalidInput仅作为不知具体字段时后备。

conflict/stale→conflict须有版本校验发生在写入之前的事实；否则不得提示重新保存。not_found→resourceUnavailable仅适合业务资源读取，导入执行结果未找到不等于资源删除，应走原请求查询／重试专项语料。未知200业务拒绝并不自动证明没有写入，只有接口明确保证未写入时才能用writeRejected；否则用writeResultUnknown。无法解码、5xx、断网且不能证明只读时采用writeResultUnknown，批准该保守结果表述。

本地验证错误可由已审前端语料创建；服务端错误应保留code及受约束事实参数到解析层，禁止先转为任意message后再判断。

### 权限路由24项映射批准

已读 server/src/core/routes/authorization.js 的ERRORS，批准以下前端引用映射（目标均为已审authorization语料，不复制正文）。专项码优先于HTTP后备。

| code | 语料键 |
|---|---|
| authorization_forbidden | forbidden |
| authorization_actor_missing | forbidden |
| authorization_conflict | conflict |
| authorization_stale_reference | staleReference |
| authorization_organization_missing | forbidden |
| authorization_scheme_unpublished | unpublishedScheme |
| invalid_authorization_name | invalidName |
| invalid_authorization_policy | invalidPolicy |
| invalid_authorization_selection | invalidPolicy |
| invalid_authorization_capabilities | invalidPolicy |
| invalid_authorization_delegation | invalidPolicy |
| assignment_nature_invalid | invalidNature |
| assignment_nature_name_invalid | invalidName |
| assignment_nature_duplicate | duplicateNature |
| assignment_nature_in_use | natureInUse |
| assignment_nature_legacy_required | legacyNatureRequired |
| config_copy_invalid | copyInvalid |
| config_copy_conflict | copyConflict |
| config_copy_missing | copyMissing |
| config_copy_unavailable | copyUnavailable |
| config_copy_unsupported | copyUnsupported |
| config_copy_duplicate | copyDuplicate |
| config_copy_reference | copyReference |
| config_copy_approval_conflict | copyApprovalConflict |

该表不批准未知500直接说操作失败；未知结果仍按公共读写情境处理。

### 日程与通讯录路由映射批准

前端逻辑Agent已核路由和抛出点，以下保持实际大小写，不根据返回message猜原因。

| code | 语料引用 |
|---|---|
| calendar_invalidSchedule | calendar.invalidSchedule |
| calendar_forbidden | calendar.forbidden |
| calendar_conflict | calendar.conflict |
| calendar_unavailable | calendar.unavailable |
| calendar_sourceReadOnly | calendar.sourceReadOnly |
| calendar_changeRecurrenceSeries | calendar.changeRecurrenceSeries |
| calendar_rangeTooLarge | calendar.rangeTooLarge |
| calendar_invalidRule | calendar.invalidRule |
| calendar_staleReferences | calendar.staleReferences |
| directory_forbidden | contactDirectory.forbidden |
| directory_conflict | contactDirectory.conflict |
| directory_invalidRule | contactDirectory.invalidRule |
| directory_staleReferences | contactDirectory.staleReferences |
| directory_contactUnavailable | contactDirectory.contactUnavailable |
| identity_card_unavailable | identityCard.failure |

identity_card_unavailable表示服务端读取失败，不表示卡过期。身份核验status success且valid:false是业务核验状态，不能抛成网络错误或私自缩为过期。通用unauthorized/forbidden沿公共认证映射；普通error不映射未知细分原因。

### 签名与评分模板校验码：新增前端语料

已核对服务端原句和触发条件。原句不是此前已批准前端库，不能直接复制服务端文件作为前端资源；采用下列独立定稿，建议加入responseMessages对应键。评分资源统一称“评分模板”，模板内部为“题目”，不把整份模板称一个评分问题。

| 稳定码 | 建议语料键 | 完整定稿 |
|---|---|---|
| signature_name_too_long | signatureNameTooLong | 签名名称过长，请缩短后再保存（最大长度：100）。 |
| signature_image_too_large | signatureImageTooLarge | 签名图片超过 2 MiB，请缩小图片后重新选择。 |
| signature_image_invalid | signatureImageInvalid | 签名图片无法读取，请重新选择支持的图片文件。 |
| signature_image_required | signatureImageRequired | 请先添加签名图片。 |
| verification_input_invalid | verificationInputInvalid | 验证信息不完整或格式不正确，请重新选择文件或填写申请编号。 |
| verification_file_invalid | verificationFileInvalid | 文件无法读取，请重新选择不超过 10 MiB 的文件。 |
| verification_input_mismatch | verificationInputMismatch | 上传文件与本次校验信息不一致，请重新选择文件。 |
| scoring_template_name_required | scoringTemplateNameRequired | 请填写评分模板名称。 |
| scoring_template_questions_invalid | scoringTemplateQuestionsInvalid | 题目内容或分值设置不符合要求，请逐项检查后再保存。 |
| scoring_template_referenced | scoringTemplateReferenced | 这份评分模板仍被评分规则使用，请先调整相关规则，再删除模板。 |

说明：签名名称实际JS.length限制，不写100个字；大小采用实际二进制限制MiB。模板被使用属于业务删除限制，不映射成无管理权限。verification_input_invalid兼容摘要或申请编号校验失败，界面不应要求普通用户手填摘要；若确有技术摘要输入则须独立专业页面语料。若真实新增码命名不同，仅调整映射键，不改定稿正文。

认证 `method_disabled` 同时用于口令登录、恢复码及恢复流程中已关闭的方式。新增 `authenticationMethodDisabled` 定稿：**所选认证方式已关闭，请选择其他可用方式。** 仅在该结果码下使用；不能只写“口令登录已关闭”误报恢复码情境。页面没有其他可用方式时应保留返回登录或联系管理员入口，不凭提示自动切换认证。

## 评分活动与记录删除明确拒绝

| 语料键 | 定稿 | 真实分支 |
|---|---|---|
| scoringActivityNameExists | 已存在同名评分活动，请换一个名称。 | 新增评分活动duplicate，不用于任意模块同名状态 |
| scoringActivityHasHistory | 这个评分活动已有评分记录或结果公示，不能删除。 | 删除活动conflict；已核同时检查score_records和result_publications，不只评分记录 |
| recordChangedBeforeDeletion | 这条记录已被更新，请重新查看内容后，再确认删除。 | 删除预检revision与当前不一致的record_changed，未执行删除 |

这三类都是明确业务拒绝，不得使用操作结果未知提示。记录变化后必须重新读取并重新确认，不自动重复删除；活动存在历史数据不引导用户批量删除历史来绕过保护。

新增 `scoring_rule_referenced` → `scoringRuleHasRecords`：**这个评分人分类已有评分记录，不能删除。** 已读 scoring/routes/rules.js 的 deleteRateRule：事务中按 rule_id 和 org_id 查 score_records，存在则整次拒绝，不删除分类或其条款。界面被删除对象是“评分人分类”（部门与身份类别组合），不是整场评分活动，也不是单个评分记录。不得把其他保存接口的 conflict 映射到此句，不指引用户清除历史来绕过保护。
