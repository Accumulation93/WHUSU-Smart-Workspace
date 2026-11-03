# 接口反馈的事实参数与分支语境

本文只记录真实分支与前端结构，不撰写最终提示语。语言Agent独立审核措辞；实施Agent使用稳定code引用语料，不按message字符串反推。

## 日程、通讯录、身份卡

- calendar路由把CalendarError和DirectoryError的code映射为calendar_前缀。已核实invalidSchedule、forbidden、conflict、unavailable、sourceReadOnly、changeRecurrenceSeries、rangeTooLarge；DirectoryError还可能带invalidRule和staleReferences。每项只能对应相同含义的calendar语料，不扩展为具体人员或字段失败。
- contactDirectory路由把DirectoryError映射为directory_前缀。invalidRule为结构参数错误；staleReferences为人员、资料字段、字典引用失效；conflict为保存或批量版本变化/记录缺失；contactUnavailable为详情key无效或无法返回该获授权条目。不能把contactUnavailable仅解释为人员已离任。
- identityCard路由仅有unauthorized、identity_card_unavailable，后者为捕获异常。业务无效仍返回success与valid:false。本人读取可能是当前角色或权限无效；公开核验还可能是token格式错误、过期、身份或权限失效。两端目前共用unavailable文案，必须按publicView拆分；本人不能提示找出示人，公开不能断言仅是过期。

## 同status不同原因：需要独立code

| 真实位置 | 触发事实 | 当前status | 应对应既有语料 |
| --- | --- | --- | --- |
| auditSignature.js:28 | 签名名称超过100码点 | invalid_params | signatureNameTooLong |
| auditSignature.js:34 | 图片检查too_large | invalid_params | signatureImageTooLarge |
| 同处其余图片检查失败 | 图片格式或内容无效 | invalid_params | signatureImageInvalid |
| auditSignature.js:138 | 保存没有imageData | invalid_params | copy_a35b383a47 |
| auditSignature.js:282/286 | hash不是64位十六进制或申请标识过长 | invalid_params | verificationInputInvalid |
| auditSignature.js:293 | 请求文件无法解码 | invalid_params | verificationFileInvalid |
| auditSignature.js:297 | 请求hash与实际文件摘要不符 | invalid_params | auditSigningEvidence.inputMismatch |
| scoring/routes/templates.js:127 | 模板名称为空 | invalid_params | copy_9a51765619 |
| 同文件:131 | 题目为空或题目结构无效 | invalid_params | scoring.templateQuestionsInvalid |
| 同文件:230 | 模板被条款配置或活动顺序引用 | forbidden | copy_1680976116；不得映射为缺少权限 |

新增code由后端实施负责人处理，保留旧status兼容；本表不规定code命名，也不修改权限判断。

## 人事转换阻断明细结构

每条问题保留成员定位、来源字段、目标字段、原内容与格式要求，不能以一个通用失败替代整条。使用成员ID及字段ID区分，不按姓名合并。option_missing必须显示可选项；缺少格式参数时仅将要求部分降为未知，保留其他定位事实。

原生hr-profile-migration-dialog现为自然流卡片，可按上述顺序增加语义行；网页HrProfileMigrationPanel和AdminHrTemplatePanel现为一行拼接或成员加错误，应改成每个invalidItem独立卡片并自然换行。复用现有滚动正文，不增加嵌套弹窗。
