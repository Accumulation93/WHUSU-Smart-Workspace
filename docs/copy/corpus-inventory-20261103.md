# 全系统语料架构盘点

2026-11-03，实施 Agent 只读盘点。本文不批准任何提示语，不提供替代文案；每个模块仍须先由前端逻辑 Agent 提供情境，再由语言 Agent 独立定稿。

## 数量与边界

遍历 `shared/locales/zh-CN` 的 79 个 JS 文件导出对象，读取到 5494 个字符串叶节点和 89 个函数节点，共 5583 个导出条目出现次数。这不是去重后的语料数，也不是完整句子数：`main.js` 聚合其他文件，重复引用会重复计数；数组元素、标点、标签亦计入字符串。函数只计节点，不执行猜测参数。新增、删除及聚合调整后须重算。

| 业务 | 主要唯一源文件或目录 | 已量化重点文件：字符串 / 函数 | 两端调用位置 |
| --- | --- | --- | --- |
| 权限与组织复制 | authorization.js | 443 / 30 | org 权限首页、编辑、变更、复制页；网页对应 Authorization、OrganizationCopy；shared presentation；服务端授权模块 |
| 登录、门户、角色及账号 | login.js、portal.js、app.js、adminGovernance.js、generated/subpackages/org、generated/components/workspace-hero | login 70 / 0；portal 85 / 0；adminGovernance 34 / 0 | main、org 页面与网页登录、门户、角色和治理组件 |
| 人事及导入 | adminPersonnel.js、hrImport.js、hrProfileMigration.js、hrTemplateSave.js、hrTemplateFieldDisplay.js、generated/subpackages/scoring/pages/admin/modules 中人事及字典模块 | hrImport 245 / 0；adminPersonnel 61 / 2；迁移 55 / 2；模板保存 53 / 0 | scoring 管理宿主、人事 Behavior、网页人事管理和服务端人事接口 |
| 通讯录 | contactDirectory.js | 81 / 0 | 两端人事通讯录、规则编辑及共享目录展示 |
| 审核、签署与验签 | auditSigning.js、auditVerification.js、signingEvidence.js、stampAuthorization.js、generated/subpackages/audit、generated/.../admin/modules/auditBehavior.js | auditSigning 99 / 0；signingEvidence 134 / 2；submissionDetail 308 / 0 | audit 页面、签署组件、网页审核、服务端审核及验签响应 |
| 场地 | venueFlowManagement.js、generated/subpackages/venue | venueManage 331 / 0；venueBooking 179 / 0；venueFlowManagement 25 / 0 | venue 页面、详情/流程组件、网页场地页面及服务端场地接口 |
| 评分 | generated/subpackages/scoring（人事审核治理项另分） | score 63 / 0；scorerTasks 41 / 0；admin 862 / 0 | scoring 页面、管理 Behavior、网页评分与管理组件 |
| 日程 | calendar.js | 146 / 0 | workspace 日程各页、网页日程及服务端日程 |
| 身份卡 | identityCard.js | 31 / 0 | 两端身份卡、核验页及服务端身份卡 |
| 通知 | messages.js、messagePerformance.js、generated/utils/messageScope.js | messages 52 / 0 | message 分包、网页消息中心、通知 worker |
| 文件输入输出 | fileIO.js、generated/utils/tableFile.js、generated/utils/filePreview.js | fileIO 19 / 0；tableFile 10 / 0；filePreview 19 / 0 | 共用文件工具、导入导出与预览入口 |
| 共用与网页专用 | common.js、controlLayout.js、personnelPicker.js、time.js、uiNavbar.js、home.js、main.js、web.js、generated/utils 其余项 | home 167 / 23；main 384 / 23；web 163 / 0；personnelPicker 22 / 1 | 两端共享控件、聚合页、运行时、网络错误与导航 |

`admin.js`、`home.js`、`main.js` 跨业务，不能凭文件名归为单一模块后漏掉其他调用方。逐条审阅需要键路径到实际调用位置的清单；当前表仅作模块分派，不能宣称全量逐键语义核验完成。

## 单一来源与生成链

1. 人工维护唯一源为 `shared/locales/zh-CN/**`。其中 `generated/**` 是历史抽取后保留的语料源，不是当前两端生成副本；不可因目录名删除或从业务代码重新生成覆盖语言 Agent 定稿。
2. `scripts/sync-shared-modules.js --write` 生成小程序、网页及已登记服务端副本。网页模块采用 ESM。部分网页专用、退役语料不生成小程序副本。
3. `scripts/locale-align.js --write` 生成网页聚合引用。`web/src/locales/zh-CN/shared` 为副本，其他网页语言文件只引用源条目，不独立写中文。
4. 小程序按包资源分配还有副本；只能通过既有同步流程产生。业务 JS、WXML、Vue 和服务端响应引用语料；不得把说明文本嵌回业务分支。
5. 所有格式化句子应在语料层接受命名清楚的参数，完整句子须经语言 Agent 审阅；不能由实施 Agent 用多个片段在页面临时拼句。

## 现有检查覆盖与盲点

`user-visible-copy-audit.js` 扫描小程序 WXML/JS/WXS/JSON、网页 JS/Vue、服务端 src JS 和 notificationWorker；跳过 locales，排除服务端 config 与 schemaContract。JSON 仅识别 navigationBarTitleText；服务端识别指定 message/title/content 等属性。`--strict-localization` 依赖中文和数字 placeholder 检测，不能证明英文提示、动态拼接、间接赋值、未登记属性或 HTML/PDF/CSV 输出完全覆盖。CSS content、服务端其他目录、数据库种子文字及用户自定义内容不在该扫描完整覆盖范围。

`locale-single-source-audit.js` 证明网页语言引用结构及登记，不评价语义。`copy-quality-audit.js` 的标点、死键和术语建议不能代替语言 Agent；短键值可能只是片段，必须看最终渲染。旧网页别名按值关联，改共享值后应核对生成映射，不能假定键名稳定等于语义稳定。

动态函数在 authorization、home、main、adminPersonnel、hrProfileMigration、hrTemplateFieldDisplay、auditVerification、signingEvidence、stampAuthorization、personnelPicker 中出现；需逐一记录参数含义、零值、单复数、未知值及完整句子。服务端错误须区分业务拒绝与非预期异常，不能用含糊提示掩盖真实失败；日志、匹配词典、内部错误码和用户输入不应被当作提示语机械替换。

## 实施依赖

主 Agent 已核实一个具体跨域漂移：`hero.adminLabel` 由 workspace-hero 的语料引用变成 `authorization.adminGrants`，当时文字相同但使用情境不同。这不是可接受的语义绑定。生成器应保存显式来源键；新增网页引用必须登记来源，现有引用不能因另一个模块出现相同文字就自动迁移。现有可疑绑定需前端语境、语言含义及实施引用三方逐项确认，不能直接把当前生成结果冻结为正确。主 Agent 负责生成器工程改造，本实施 Agent 不并行修改该文件。

首模块等待 `frontend_context` 的页面设计和 `language_editor` 的逐项书面批准。未获批准不得修改语料或页面结构。实施后由独立语言 Agent 按实际页面复核；保留两端针对性检查、共享副本一致性、实际保存回读及真实微信编译。涉及服务端行为或架构变化须由主 Agent 判断用户授权和 CI 范围。

当前仅完成语料目录和检查机制盘点，未完成全系统逐键语境映射、独立语言重写或替换，未修改任何业务代码。
