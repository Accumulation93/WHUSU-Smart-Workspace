# 登录、门户、工作角色与本人账号安全：写作语境

本文件由前端逻辑 Agent 维护，不是最终用户文案。检查日期为 2026-11-03；仅记录已核对的调用与结构，不把静态阅读当作现场验收。

## 实际入口及语料归属

| 范围 | 实际代码 | 共享语料来源 |
| --- | --- | --- |
| 小程序登录、认领、恢复 | miniprogram/subpackages/main/pages/login/login.js、login.wxml、loginValidation.js | login.js，经 main.js 导出；部分错误来自服务端 |
| 网页登录 | web/src/views/LoginView.vue | web/src/locales/zh-CN/login.js 是生成引用；真实源含 login.js、generated/utils/authContext.js 等 |
| 门户 | miniprogram/subpackages/main/pages/portal/portal.js、portal.wxml；web/src/views/PortalView.vue | portal.js、main.js、messagePerformance.js；通知正文另属消息模块 |
| 工作角色 | miniprogram/subpackages/org/pages/identitySwitch/identitySwitch.js、identitySwitch.wxml；web/src/views/WorkRoleView.vue | generated/subpackages/org/pages/identitySwitch/identitySwitch.js；网页生成 workRole.js 还复用 authorization、home、adminPersonnel |
| 本人账号安全 | miniprogram/subpackages/workspace/pages/home/home.js 的 loadAccountSecurity、rotateAccountRecoveryCode、saveAccountPassphrase、revokeAccountDevice 及对应模板 | home.js 的账号区域，不应顺带改其评分、人事字段文案 |
| 兼容入口 | org/pages/accountSecurity/accountSecurity.js、org/pages/switch/switch.js | 前者转到 workspace/home?subApp=hr&section=account，后者转到 identitySwitch；不是独立功能表单 |
| 管理他人账号 | scoring/pages/admin/modules/authPersonnelBehavior.js；web/src/components/HrAccountGovernance.vue | adminGovernance.js、generated/subpackages/scoring/pages/admin/admin.js、modules/authPersonnelBehavior.js；完整语境归人事治理批次 |

`shared/locales/zh-CN/generated` 是当前唯一源的一部分，可以由语言 Agent 审阅；miniprogram/locales、server/src/locales 与 web/src/locales 的副本不能独立写作。不得因为网页引用同名短字符串就假定两个场景含义一致。

## 操作事实与写作约束

| 阶段 | 主体与动作 | 结果及下一步 | 不能作出的承诺 |
| --- | --- | --- | --- |
| 微信登录 | 当前使用者明确点登录；服务端返回 login_success 或 need_claim | 成功更新统一会话后 reLaunch 门户；need_claim 进入认领表单 | 不能说所有人必须先认领；不能说微信绑定就是账号认证 |
| 口令登录 | 输入自己的学号和登录口令 | 成功进入门户；绑定邀请是后续可选流程 | 未绑定微信不等于临时会话，不能要求网页用户重新微信登录 |
| 首次认领 | need_claim 的临时认证状态下选择组织、填写姓名和学号；auth/claims | accepted 且有 claimId 才进验证码表单 | 不是新建组织或自行授予岗位；提交不等于认证成功 |
| 验证认领 | verifyClaim 先尝试 auth/claims/redeem，随后必要时走 auth/claims/verify | login_success 才写入正式会话并进入门户 | 当前前端同时接入兑换与认领校验，验证码有效期不能仅凭旧提示写死；服务端期限须另核对 |
| 账号恢复发起 | 组织、姓名、学号提交 auth/recovery/start | accepted 后按服务端允许的恢复方式进入凭据输入；没有可用方式则 recoveryPending | 发起申请不等于已更换微信或恢复成功；管理员待处理状态和用户自助验证不能混称 |
| 恢复验证 | requestId、method、credential 交给 auth/recovery/complete | login_success 后建立会话；返回 recoveryCode 时先展示新码，完成后进门户 | 不得把旧码继续有效或永久保管当作事实；不能展示凭据内部值于日志和解释 |
| 可选绑定 | 明确点击后取得微信 code，调用 bind-current-wechat | 成功或跳过均进入门户 | 不能暗示跳过会丧失口令账号资格；也不能自动抢占已有绑定 |
| 门户认证状态 | checking、unavailable、frozen 分开 | 未确认时重试或明确去登录；被冻结另行处理 | 网络失败不是已退出，也不是没有权限 |
| 门户局部列表失败 | result.partial 或 failedOrganizations 非空 | 保留已成功获取的数据；失败范围需重试 | 只能说明部分结果未读到，不证明组织本身失效；只有确实调度重试才能承诺正在重试 |
| 选择组织 | identitySwitch 点击组织只修改 draftOrganizationId | 展示该组织可用岗位与管理身份，尚未激活 | 不能提示已切换组织；组织选中态不等于正在使用 |
| 切换角色 | 选岗位/管理身份后 activateContext(contextId) | 成功后进入当前角色门户，失败保留旧会话并可重试 | 当前操作只用选中的角色，不合并同人其他角色权限 |
| 本人恢复码 | auth/security/recovery-credential，method=recovery_code | 返回新码后本页展示；复制与隐藏是两个独立动作 | 隐藏不等于已妥善备份；按钮不应宣称保存文件 |
| 本人口令 | 同一接口 method=passphrase，提交新口令 | 成功清空输入，提示更新结果 | 不是修改人事资料，也不是为其他人重置密码 |
| 登录设备 | auth/security 返回 devices，旧响应可由 sessions 兼容展示 | 按 deviceKey 或 sessionId 撤销，成功仅移除该行 | 未识别安装标识不能声称真实设备唯一；旧 sessions 兼容记录不能保证等于物理设备数 |

## 必须先修正或隔离的结构

1. 网页 LoginView 的 reason=expired 使用 copy.login.relogin；该键实际映射 shared/generated/utils/authContext.js 的 copy_b10d64a68c，目前明确要求微信登录，但网页只有口令登录。应按登录状态使用认证方式中立的独立键，不能仅改 login.messages.relogin 而漏掉真实引用。
2. login.wxml 的 passwordBinding 分支仍保留 unavailable 与临时登录描述。实际口令成功路径应以当前会话与邀请机制核实可达性；语言不能继续把正常口令会话写成临时。不可达旧分支应记录并由实施 Agent 清理或保留兼容说明，不能新造流程。
3. WorkRoleView 的 loaded 变量在 ensureLoaded 开始即置 true，模板未用其保护空状态；请求未完时可能显示没有组织/岗位。结构需分别表达加载、读取失败、成功为空。当前 session 缓存有结果时可保留结果并附失败状态，不能覆盖成空目录。
4. 工作角色页两类角色是岗位与管理身份，权限方案中的授权身份又是另一概念。语言不能统一成没有限定的身份；授权身份赋给岗位不会创建另一个可切换岗位。
5. 本人账号安全实际在小程序人事页内。已阅读网页 HrProfileView，当前只有本人资料/通讯录及资料表单；全 web/src 搜索 auth/security 只发现管理员组件，未证实本人安全页。文案改造不可宣传尚未落实的网页本人安全入口；是否补齐功能另列实施范围，不以字符串替换冒充完成。
6. 管理他人账号相关词先由人事治理批次核对对象、账号全局范围、冻结/凭据重置及确认层，不与本人恢复操作共用一个无对象的按钮说明。

上述均保持现有业务认证和权限边界；结构调整遵循共享 Hero、标准加载、共享按钮和页面模板，不新建账号目录，不把所有恢复步骤塞进一个含混说明。

## 语言 Agent 的交付粒度

先逐键审阅 login 与 portal，再按实际引用拆出工作角色语料；home 仅此处列明的账号安全键纳入本批。每个最终条目必须有状态条件、对象和可执行下一步。服务端返回的直接 message 需附回对应服务端共享源的待核清单，不因前端 fallback 已改而标完整。24 小时验证码、新恢复码失效规则等须核实服务端后才能批准具体数字。

## 验收要求及边界

补充服务端核实：`core/models/unifiedIdentity.js` 的验证码生成是 `randomCode(12)`；默认期限为 48 小时，允许 1—168 小时，管理员可传具体时长，因此通用入口不能保证 24 小时。本人恢复码写入通过账号与方式唯一键覆盖旧哈希，成功后旧码失效。home 的 `hideAccountRecoveryCode` 仅清空页面展示，不把恢复码保存为文件。当前门户局部失败标记不直接触发自动重试，不能将已读重试或游标失效重载视为局部失败自动重试；冻结账号入口未查到独立的处理方式页面，不能承诺登录后必有此页。

两端分别覆盖失效会话、失败重试、空组织、仅管理角色、仅岗位、多组织、切换被撤销的角色；小程序覆盖认领、恢复待处理、自助恢复、新恢复码复制与隐藏、明确绑定和跳过。真实成功请求须回读，模拟 Toast 不算通过。此文档只完成静态语境整理，未执行现场操作或批准发布。
