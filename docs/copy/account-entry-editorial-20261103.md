# 登录、门户、工作角色与本人账号：独立语言定稿

语言 Agent：`/root/language_editor`。语境依据 account-entry-context-20261103.md。仅写文档，不改语料 JS 或业务代码。表内“保留”也经过逐项语义审阅；“待核”不允许按原承诺发布。

## 结构决定

有条件批准现有登录及角色选择流程。必须先修正：网页失效会话使用认证方式中立文案；口令登录成功不再称临时登录；工作角色选择加载完成前不显示空组织；角色选择区统一称“岗位”和“管理身份”，不称管理权限；认证码期限及位数必须以后端为准。本人账号安全网页尚未证实存在，不增加该入口承诺。恢复申请、自助恢复、管理员待处理分开呈现，不把请求成功写成已恢复。

## login.js

基础语料 common.js 逐项审阅：`loading`＝“正在加载”，用于无更具体对象的标准加载；`brandName`＝“WHUSU智慧工作台”，品牌名；`organizationName`＝“武汉大学学生会”，固定品牌组织而非当前工作组织；`actions.cancel`＝“取消”，放弃当前操作；`actions.close`＝“关闭”，关闭展示；`actions.enter`＝“进入”，进入明确目标；`actions.retryLater`＝“请稍后再试”，暂不可用反馈。七项全部批准保留，不把“关闭”写成“已保存”，不把固定品牌组织放到当前组织字段。

| 键 | 状态／定稿 | 情境与后果 |
|---|---|---|
| navigationTitle | 保留：登录 - WHUSU智慧工作台 | 导航标题 |
| messages.pageOpenFailed | 保留：页面打开失败，请重试 | 导航失败 |
| messages.passwordRequired | 保留：请输入学号和口令 | 口令登录空输入 |
| messages.passwordStudentIdRequired | 保留：请输入学号 | 本人认证信息 |
| messages.passwordPassphraseRequired | 保留：请输入口令 | 登录凭据 |
| messages.loginInvalid | 保留：登录信息不正确 | 不分别泄露账号是否存在 |
| messages.relogin | 改为：登录已失效，请重新登录 | 微信与口令共用 |
| messages.loginUnavailable | 保留：暂时无法登录 | 登录异常，不认定账号无效 |
| messages.profileRequired | 改为：请选择组织，并填写姓名和学号 | 区分选择与输入 |
| messages.submitFailed | 保留：提交失败，请重试 | 未知提交失败后备 |
| messages.verificationRequired | 保留：请输入个人认证码 | 认领认证 |
| messages.verificationInvalid | 改为：认证码未通过验证，请检查后重试 | 不含糊称“检查认证码” |
| messages.recoveryRequired | 保留：请输入恢复码或恢复口令 | 取决于可用方式 |
| messages.recoveryInvalid | 改为：恢复信息未通过验证，请检查后重试 | 不宣称恢复成功 |
| messages.recoveryCode | 保留：账号恢复码 | 凭据类型 |
| messages.recoveryPassphrase | 保留：恢复口令 | 恢复凭据类型，不与登录口令混淆 |
| view.appName | 保留 common.brandName 引用 | 品牌单源 |
| view.organizationName | 保留 common.organizationName 引用 | 固定品牌组织 |
| view.wechatLogin | 保留：微信登录 | 明确认证方式 |
| view.loginSubtitle | 改为：登录后进入工作台，可切换组织与工作角色 | 成功实际先门户，不强制选择 |
| view.loginHint | 保留：登录提示 | 提示区标题 |
| view.loginTitle | 保留：登录 | 页面标题 |
| view.useOwnWechat | 保留：请使用本人微信登录 | 微信方式本人使用 |
| view.passwordLogin | 保留：口令登录 | 另一认证方式 |
| view.titleVerify | 保留：输入个人认证码 | 认领下一步 |
| view.titleRecoveryVerify | 保留：验证恢复信息 | 自助验证 |
| view.titleRecoveryRotated | 改为：妥善保管新恢复码 | 页面展示可复制，不承诺保存文件 |
| view.titleRecoveryPending | 保留：等待管理员审核 | 待管理员处理状态 |
| view.titleRecovery | 保留：更换微信 | 本批实际微信恢复入口 |
| view.titleClaim | 保留：身份认证 | 组织成员认领 |
| view.closeWithIcon | 改为：关闭 | ×由图标组件单独显示，拒绝文案内拼图标 |
| view.recoveryStartNote | 改为：提交后，系统会显示当前可用的恢复方式；无法自助恢复时，可等待管理员审核。 | 不承诺每人都有两种凭据 |
| view.claimStartNote | 改为：选择组织并填写姓名、学号，再输入管理员提供的个人认证码。 | 补组织选择 |
| view.organization | 保留：所属组织 | 认领组织 |
| view.chooseOrganization | 保留：请选择组织 | 选择占位 |
| view.name | 保留：姓名 | 本人姓名 |
| view.namePlaceholder | 保留：请输入姓名 | 输入占位 |
| view.studentId | 保留：学号 | 本人认证允许输入 |
| view.studentIdPlaceholder | 保留：请输入学号 | 输入占位 |
| view.continueAction | 保留：继续 | 表单进入下一步 |
| view.claimUnavailable | 保留：暂未开放认证 | 仅服务端明确未开放 |
| view.submitRecovery | 保留：提交恢复请求 | 不称立即恢复 |
| view.changeWechat | 保留：更换微信 | 恢复入口 |
| view.backToClaim | 保留：返回身份认证 | 恢复页回认领 |
| view.passwordNote | 保留：使用已设置的口令登录 | 已有口令前提 |
| view.passphrase | 保留：口令 | 登录口令 |
| view.passphrasePlaceholder | 保留：请输入口令 | 输入占位 |
| view.loginAction | 保留：登录 | 提交登录 |
| view.titlePasswordBinding | 保留：绑定当前微信 | 登录后独立可选动作 |
| view.passwordBindingNote | 保留：已通过口令登录。是否为该账号绑定当前微信，方便下次登录？也可以跳过。 | 明确已登录和可选 |
| view.passwordBindingBlockedNote | 改为：当前微信已绑定其他账号，无法绑定。你仍可使用已登录的账号进入工作台。 | 移除虚假临时登录；不可达则删除分支 |
| view.bindPasswordWechat | 保留：绑定当前微信 | 明确动作 |
| view.skipPasswordBinding | 保留：暂不绑定 | 无惩罚跳过 |
| view.enterAfterTemporaryLogin | 保留文字：进入工作台；建议迁移语义键enterWorkspace | 文案不再临时，键名去过时含义 |
| view.backToWechat | 保留：返回微信登录 | 仅实际回微信入口 |
| view.verificationNote | 改为：请向所属组织的管理员获取个人认证码，并在有效期内使用。 | 24小时待核，不硬写期限 |
| view.verificationCode | 保留：个人认证码 | 凭据名称 |
| view.verificationPlaceholder | 保留：请输入 12 位认证码 | 已核对服务端randomCode(12) |
| view.finishClaim | 保留：完成身份认证 | 提交验证动作，成功前不显示已完成 |
| view.backToProfile | 保留：返回修改信息 | 返回认领资料 |
| view.recoveryNote | 改为：没有可用的恢复方式时，请等待管理员审核。审核通过后，再用当前微信登录。 | 不限定“其他”管理员 |
| view.recoveryMethod | 保留：恢复方式 | 自助凭据选项 |
| view.recoveryPlaceholder | 保留：请输入恢复码或恢复口令 | 须跟随实际可选方式 |
| view.confirmWechatChange | 保留：确认更换微信 | 最终绑定变更 |
| view.waitForReview | 保留：等待管理员审核 | 待处理路径 |
| view.rotatedRecoveryNote | 保留：请保存新的恢复码。关闭后不再显示。 | 用户自行保管，不等于下载文件 |
| view.copyRecoveryCode | 保留：复制恢复码 | 仅复制动作 |
| view.finish | 保留：完成 | 关闭新码展示并进门户 |
| view.recoveryPendingNote | 改为：恢复申请已提交。请等待管理员审核，审核通过后用当前微信重新登录。 | 去掉不明“其他” |
| view.close | 保留 common.actions.close 引用 | 共享动作 |

## portal.js

| 键 | 状态／定稿 | 情境与理由 |
|---|---|---|
| partialOrganizationLoading | 改为：部分组织的内容暂未加载，请重试 | 未核实自动调度前不承诺正在重试；应有重试入口 |
| navigationTitle | 保留：应用服务 - WHUSU智慧工作台 | 导航标题 |
| appName | 保留 common.brandName | 品牌 |
| pageName | 保留：应用服务 | 入口目录 |
| organizationName | 保留 common.organizationName | 固定品牌组织 |
| categoryLabels.audit | 保留：审核 | 应用分组 |
| categoryLabels.venue | 保留：场地 | 应用分组 |
| categoryLabels.scoring | 保留：考核 | 应用分组 |
| categoryLabels.hr | 保留：人事 | 应用分组 |
| categoryLabels.system | 保留：其他 | 其他工具分组 |
| cards.scan | 保留：扫一扫 | 扫码入口 |
| cards.messages | 保留：消息中心 | 消息入口 |
| cards.workContextSwitch | 保留：组织与工作角色 | 角色切换入口 |
| cards.scoring | 保留：考核评分 | 子应用名称 |
| cards.hr | 保留：人事信息 | 子应用名称 |
| cards.audit | 保留：审核 | 子应用名称 |
| cards.venueBooking | 保留：场地借用 | 子应用名称 |
| cards.system | 保留：基本设置 | 设置入口 |
| cards.venueManage | 保留：场地管理 | 管理入口 |
| cards.permissions | 保留：权限管理 | 授权入口 |
| workContext.signedOut | 保留：未登录 | 权威未登录状态 |
| workContext.superAdmin | 保留：超级管理员 | 管理身份 |
| workContext.admin | 保留：普通管理员 | 管理身份 |
| workContext.unset | 保留：未设置岗位 | 不能套用管理身份无岗位情形 |
| workContext.welcome | 保留：欢迎使用 | 品牌欢迎语 |
| messages.notification | 保留：通知 | 非待办消息 |
| messages.todo | 保留：待办 | 待处理业务 |
| messages.readFailed | 保留：标记已读失败，请重试 | 写入失败 |
| messages.deleteFailed | 保留：删除失败，请重试 | 写入失败 |
| messages.incomplete | 保留：操作未完成，请重试 | 未知失败 |
| messages.partialBulkAction | 改为：部分操作未完成，请重试 | 不只有抽象状态 |
| messages.retryLater | 保留 common.actions.retryLater | 通用延迟重试 |
| messages.switchWorkContext | 保留：切换工作角色后查看 | 当前角色无业务上下文 |
| messages.switchOrganizationAndWorkContext | 保留：切换组织与工作角色后查看 | 跨组织业务 |
| messages.targetOrganization | 保留：目标组织 | 确认切换目标 |
| messages.selectWorkContext | 保留：请重新选择工作角色 | 原角色失效 |
| messages.selectOrganization | 保留：请重新选择组织 | 原组织不可选 |
| messages.switchFailed | 保留：切换失败，请重试 | 不暗示已切换 |
| view.appName | 保留 common.brandName | 品牌 |
| view.pageName | 保留：应用服务 | 页面名 |
| view.organizationName | 保留 common.organizationName | 品牌组织 |
| view.workContextHint | 保留：工作角色提示 | 提示标题 |
| view.loadingHint | 保留：加载提示 | 局部读取提示 |
| view.partialOrganizationLoading | 同顶层改稿 | 两端同义提示一致 |
| view.todoTitle | 保留：待办事项 | 待处理列表 |
| view.totalPrefix | 保留：共 | 数量前缀 |
| view.itemSuffix | 保留：条 | 消息数量单位 |
| view.viewAll | 保留：查看全部 | 打开完整列表 |
| view.noTodos | 保留：暂无待处理事项 | 只在成功为空 |
| view.todoType | 保留：待办类型 | 待办分类 |
| view.organization | 保留：所属组织 | 待办组织 |
| view.current | 保留：当前 | 当前组织状态 |
| view.enter | 保留 common.actions.enter | 进入业务 |
| view.loadingMore | 保留：正在加载更多… | 列表增量读取 |
| view.notificationTitle | 保留：通知 | 通知列表 |
| view.markAllRead | 改为：全部标为已读 | 动作不冒充当前状态 |
| view.noNotifications | 保留：暂无通知 | 仅成功为空 |
| view.notificationType | 保留：通知类型 | 通知分类 |
| view.delete | 保留：删除 | 删除本人消息 |
| view.servicesTitle | 保留：应用服务 | 入口区 |
| view.grid | 保留：宫格 | 排列方式 |
| view.list | 保留：列表 | 排列方式 |
| view.search | 保留：搜索 | 搜索动作 |
| view.searchPlaceholder | 保留：搜索应用… | 应用搜索 |
| view.clearSearch | 保留：清除搜索 | 清空条件 |
| view.scan | 保留：扫一扫 | 扫码入口 |
| view.scanResultTitle | 改为：扫码结果 | 中性结果标题 |
| view.scanExternalHint | 改为：该内容无法在工作台内打开，可复制后查看。 | 扫码也可能是文本，不承诺均为浏览器URL |
| view.scanCopyAction | 保留：复制内容 | 复制结果 |
| view.scanCloseAction | 保留：关闭 | 关闭结果 |
| view.scanFailed | 改为：扫一扫未能打开，请检查微信的相机权限后重试。 | 打开失败，不对识别失败通用 |
| view.navLoginAction | 保留：登录 | 导航入口 |
| view.authUnavailable | 改为：暂时无法确认登录状态，请重试或重新登录。 | 网络未知不是已退出 |
| view.authFrozen | 改为：账号已被冻结，请联系管理员处理。 | 未证实登录后处理页，不造承诺 |
| view.authRetryAction | 保留：重试 | 重新读取会话 |
| view.authLoginAction | 保留：去登录 | 明确去登录 |
| view.noMatchingApps | 保留：没有匹配的应用 | 搜索成功空结果 |
| view.noApps | 保留：暂无应用 | 成功空目录 |
| view.developing | 保留：开发中 | 真实未开放功能 |
| view.workContextSwitch | 保留：组织与工作角色 | 角色切换 |
| view.logout | 保留：退出登录 | 清除会话 |
| view.crossOrganization | 保留：跨组织事项 | 跨组织业务 |
| view.switchDescription | 改为：切换到以下组织与工作角色后查看 | 实际激活完整角色 |
| view.cancel | 保留 common.actions.cancel | 取消 |
| view.switchAndView | 保留：切换并查看 | 明确两步动作 |

## 工作角色语料

路径：generated/subpackages/org/pages/identitySwitch/identitySwitch.js。以下逐项不把授权身份与可切换管理身份混用。全局管理身份必须仅用于真实全局上下文。

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| navigationTitle | 保留：组织与工作角色 - WHUSU智慧工作台 | 导航 |
| copy_05644ca9d3 | 保留：加载失败，请重试 | 失败不显示空 |
| copy_08113b4ae2 | 保留：搜索组织 | 搜索入口 |
| copy_14d02ca4c3 | 保留：选择此组织 | 仅选择草稿组织 |
| copy_27446ca109 | 保留：没有匹配的组织 | 搜索结果为空 |
| copy_34e2d1f8a0 | 保留：组织 | 组织标题 |
| copy_3704f9b212 | 改为：管理身份 | 角色类型 |
| copy_53d5e0a0c8 | 保留：切换失败，请重试 | 激活失败 |
| copy_54474b693d | 保留：提示 | 通用提示标题 |
| copy_56f0b27402 | 保留：已选择 | 草稿选择态，不是已切换 |
| copy_58063dc31f | 保留：当前工作角色 | 实际激活角色 |
| copy_5ccdea4fbf | 保留：岗位 | 角色类型 |
| copy_6bec6cf9f0 | 保留：待选择工作角色 | 尚未激活 |
| copy_6db7a44985 | 保留：岗位 | 角色名称 |
| copy_7c36a9a835 | 改为：请选择其他组织，或联系管理员确认你的岗位或管理身份。 | 目录为空处理 |
| copy_81f76a3946 | 保留：暂无组织 | 仅成功为空 |
| copy_83d91b058a | 保留：已选组织 | 草稿组织 |
| copy_9fa9026726 | 保留：选择组织 | 第一步 |
| copy_aa4f0ed6cd | 保留文字WHUSU智慧工作台，改为品牌引用 | 品牌单源 |
| copy_ac7b734021 | 改为：即将使用的工作角色： | 确认激活而非已激活 |
| copy_c1256b26d6 | 保留：搜索组织全称 | 搜索条件 |
| copy_c2a3133a92 | 改为：请联系组织管理员添加你的成员信息。 | 统一称你 |
| copy_c3e7d7fee4 | 保留：组织与工作角色 | 页面名 |
| copy_c47f370afa | 保留：选择 | 控件动作 |
| copy_d77e17f5b0 | 改为：选好组织后，请在下方选择岗位或管理身份。 | 两步选择 |
| copy_da8326b294 | 保留：该组织暂无可用工作角色 | 仅加载成功为空 |
| copy_dd633ab414 | 保留：暂无可选组织 | 仅加载成功为空 |
| copy_e0b24e2033 | 改为：管理身份 | 角色类型 |
| copy_e3eb24175c | 改为：全局管理身份 | 全局角色类型 |
| copy_e74c96dd07 | 保留：当前组织 | 实际激活组织 |
| copy_e8b001bfef | 保留：选择工作角色 | 第二步 |
| copy_ed081670d5 | 保留：清除搜索 | 清条件 |
| copy_ee42a0dcb0 | 保留：使用此工作角色 | 真正激活 |

路径：generated/utils/authContext.js。

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_53d5e0a0c8 | 保留：切换失败，请重试 | 激活失败 |
| copy_97169e852e | 改为：请重新打开“组织与工作角色”选择页面。 | 页面名与入口一致 |
| copy_a805235eb4 | 保留：请选择可访问的组织 | 权限目录限制 |
| copy_b10d64a68c | 改为：登录已失效，请重新登录 | 网页真实失效登录引用，中立认证方式 |

## home.js 本人账号区域

不审入其他评分、人事、审核字段。本表“设备”兼容旧会话记录需结构分辨，不能只靠改词宣称设备准确。

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| accountAndLogin | 保留：账号与登录 | 本人账号区 |
| accountDescription | 改为：管理本人的恢复方式、登录口令和登录设备 | 明确本人及三功能 |
| verified | 保留：已认证 | 账号已认证，不依赖微信绑定 |
| loadingAccount | 保留：正在加载账号信息… | 标准加载 |
| contactAdminForWechat | 改为：如无法自行更换微信，请联系管理员。 | 不掩盖自助恢复 |
| recoveryCode | 保留：账号恢复码 | 凭据 |
| recoveryCodeWarning | 保留：新码生成后，旧码立即失效 | 已核对按账号和方式覆盖凭据哈希 |
| generateCode | 改为：生成新恢复码 | 明确对象 |
| copy | 保留：复制 | 实际复制 |
| saved | 改为：关闭恢复码 | 仅关闭展示，不伪称已保存 |
| loginPassphrase | 保留：登录口令 | 本人口令 |
| passphraseDescription | 保留：设置后可用于口令登录 | 使用方式 |
| passphrasePlaceholder | 保留：输入新的登录口令 | 修改输入 |
| savePassphrase | 保留：保存口令 | 写入动作 |
| loginDevices | 保留：登录设备 | 仅设备目录语境 |
| loginDevicesDescription | 保留：可退出不再使用的设备 | 撤销该设备登录 |
| deviceSuffix | 保留：台 | 只用于权威设备计数；旧session须另用会话单位 |
| recentActivity | 保留：最近活动 | 最后活动时间 |
| current | 保留：当前 | 当前设备标识 |
| signOutDevice | 保留：退出设备 | 撤销设备会话 |
| noDevices | 保留：暂无登录设备 | 成功空列表 |
| managementIdentity | 改为：管理身份 | 角色概念统一 |
| regularPosition | 保留：岗位 | 角色类型 |
| currentDevice | 保留：当前设备 | 仅有可信安装关联 |
| signedInDevice | 保留：已登录设备 | 设备记录 |
| unrecognizedDevice | 保留：无法识别的设备 | 不推测设备唯一性 |
| deviceModelUnavailable | 保留：暂未获取设备型号 | 未知型号 |
| miniProgram | 保留：微信小程序 | 登录客户端类型 |
| retryLater | 保留：请稍后重试 | 后备反馈 |
| generationFailed | 改为：恢复码生成失败，请重试 | 若其他调用存在须拆专用键，不污染通用键 |
| passphraseRequired | 保留：请输入登录口令 | 输入校验 |
| saveFailed | 保留：保存失败，请重试 | 通用保存失败 |
| passphraseUpdated | 保留：口令已更新 | 真实写入后 |
| retry | 保留：请重试 | 失败恢复 |
| deviceSignedOut | 保留：该设备已退出 | 真实撤销后 |

## 尚未批准的边界

### 登录设备与旧登录记录分开显示

已核实旧接口以每个 session 生成一行，没有按设备合并。实施必须显式区分设备目录与登录记录模式，以下新增键只用于旧登录记录；不能把新设备目录也改成记录。旧记录不得使用“台”或识别设备的肯定措辞。

| 新键 | 定稿 | 使用情境 |
|---|---|---|
| loginSessions | 登录记录 | 旧session列表标题 |
| loginSessionsDescription | 可结束不再使用的登录；多条记录可能来自同一台设备。 | 不误计物理设备 |
| sessionSuffix | 条 | 旧session计数单位 |
| currentSession | 当前登录 | 当前session明确匹配 |
| otherSession | 其他登录 | 非当前session |
| endSession | 结束登录 | 撤销指定session |
| noSessions | 暂无登录记录 | 成功读取为空 |
| sessionEnded | 这条登录记录已结束 | 服务端撤销成功 |

本表语料新增于home账号区，待实施接入。不准仅靠修改标题保留误导的“当前设备／台”子项。

本批仅审上列源及账号字段。服务端直接返回的错误语料、messagePerformance局部失败文案、web独有文案尚须纳入后续语境库存。已核实认证码为12位，期限可配置为1至168小时、默认48小时，因此不能写死24小时；旧恢复码在新码成功生成后失效。网页本人账号安全入口未完成现场或代码证明，不能宣称两端功能已对齐。本文不是运行验收报告。
