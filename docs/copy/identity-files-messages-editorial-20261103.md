# 身份卡、文件操作、消息与人员选择：独立语言审稿

语言 Agent `/root/language_editor`。依据 identity-files-system-components-context 与 scoring-message-context；以下5个源逐项审阅，生成目录余项另批。

## 结构约束

卡面当前时间来自设备，不是防复制证明；核验时间与卡面时间分开。二维码与小程序码都能核验，加载错误不能一律称小程序码失败。文件操作只显示设备支持方式，不为无法调用的方式写“可用”；启动下载不等于保存完成。消息清除隐藏本人的同事件通知，不删除审批或业务记录。人员选择按自然人或岗位选择，单位与空状态按模式拆分，确认空选才清空，不把关闭当清空。

## identityCard.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| title | 保留：身份卡 | 页面标题 |
| navigationTitle | 保留：身份卡 - WHUSU智慧工作台 | 导航 |
| verifyTitle | 保留：身份核验 | 扫码结果 |
| loading | 保留：正在读取身份 | 身份请求 |
| generating | 改为：正在生成核验码 | 二维码和小程序码通用 |
| retry | 保留：重试 | 失败恢复 |
| refresh | 保留：刷新身份卡 | 已成功后刷新 |
| refreshVerification | 保留：刷新 | 成功核验刷新 |
| scanHint | 保留：扫一扫，核验身份 | 扫码用途 |
| expiryHint | 改为：24 小时内有效 | 已核对真实有效期 |
| credential | 保留：电子身份凭证 | 电子卡面，不称官方证件 |
| liveCheck | 保留：实时核验 | 仅服务器实际核验结果，不对设备时钟使用 |
| verificationCode | 保留：核验二维码 | 普通二维码 |
| miniProgramCode | 保留：小程序码 | 微信码类型 |
| originalImage | 保留：查看或保存原图 | 文件输出入口 |
| imageName | 保留：身份核验码 | 图片名 |
| verified | 保留：当前身份有效 | 当前请求已确认 |
| unavailable | 退回跨情境共用，改用personalUnavailable或verificationUnavailable | 本人请求无token过期，扫码可能多种原因 |
| personalUnavailable（新增） | 当前工作角色无法生成身份卡，请刷新或切换工作角色。 | 本人getMyIdentityCard返回valid:false |
| verificationUnavailable（新增） | 本次未能核实有效身份，请出示人刷新身份卡后重新扫码。 | 扫码verifyIdentityCard返回valid:false，不猜过期、格式或权限原因 |
| active | 保留：在职 | 岗位状态 |
| noPosition | 保留：在职，暂无岗位 | 组织成员无岗位 |
| adminActive | 改为：管理身份有效 | 角色而非权限集合 |
| organization | 保留：组织 | 当前组织 |
| position | 保留：当前岗位 | 管理身份须另用对应标签，不伪造岗位 |
| state | 保留：身份状态 | 状态标签 |
| failure | 保留：身份卡暂时无法读取，请重试。 | 网络/读取失败 |
| qrFailure | 改为：核验码暂时无法生成，请重试。 | 两类码通用 |
| noIdentity | 保留：当前身份无法生成身份卡，请切换有效工作角色。 | 当前角色失效 |
| login | 保留：登录后查看我的身份卡 | 本人卡需登录；扫码核验可匿名 |
| currentTime | 保留：当前时间 | 设备时间展示，不宣称认证 |
| checkedAt | 保留：核验时间 | 服务端核验事实 |
| open | 保留：查看身份卡 | 导航入口 |

## fileIO.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| input | 保留：选择文件来源 | 输入方式 |
| output | 保留：选择文件操作 | 输出方式 |
| choose | 保留：选择文件 | 输入动作 |
| chat | 保留：微信聊天文件 | 微信支持方式 |
| album | 保留：相册 | 图片来源 |
| camera | 保留：拍照 | 拍照来源 |
| browse | 保留：浏览本地文件 | 浏览器支持；小程序无实际接口不得显示 |
| preview | 保留：预览文件 | 预览非保存 |
| share | 改为：转发给微信好友 | 明确接收对象，实际支持才显示 |
| systemShare | 保留：系统分享 | 系统分享面板 |
| save | 保留：保存到本地 | 真实保存能力 |
| cancel | 保留：取消 | 用户主动取消不报失败 |
| unavailable | 保留：当前设备不支持此方式 | 防过时能力检测的后备 |
| failed | 保留：文件操作失败，请重试 | 未分类后备，具体阶段错误优先 |
| invalid | 保留：文件格式、大小或数量不符合要求 | 需展示具体允许条件，有事实参数时专项指出 |
| downloadStarted | 保留：已发起下载 | 不说已保存 |
| previewUnavailable | 改为：此格式无法直接预览，请选择其他可用的文件操作。 | 避免设备没有保存入口却引导保存 |
| openMenu | 保留：打开菜单 | 文档菜单入口 |
| documentMenuHint | 改为：可在文档右上角菜单中查看保存或用其他应用打开的选项；具体选项由当前设备和微信版本提供。 | 不一刀切说当前微信不支持另存为，也不承诺菜单一定可保存 |

## messages.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| navigationTitle | 保留：消息中心 - WHUSU智慧工作台 | 导航 |
| categoryLabels.audit | 保留：审核 | 分类 |
| categoryLabels.venue | 保留：场地 | 分类 |
| categoryLabels.scoring | 保留：考核 | 分类 |
| categoryLabels.hr | 保留：人事 | 分类 |
| categoryLabels.system | 保留：其他 | 分类 |
| messages.notification | 保留：通知 | 非业务待办 |
| messages.allOrganizations | 保留：全部组织 | 可见组织范围 |
| messages.selectOrganizationOrWorkContext | 保留：请重新选择组织或工作角色 | 原范围失效 |
| messages.refreshLater | 保留：请稍后重试 | 后备读取失败 |
| messages.retryLater | 保留：请稍后重试 | 后备读取失败 |
| messages.switchWorkContext | 保留：切换工作角色后查看 | 角色导航 |
| messages.switchOrganizationAndWorkContext | 保留：切换组织与工作角色后查看 | 跨组织导航 |
| messages.targetOrganization | 保留：目标组织 | 切换目标 |
| messages.notificationReadFailed | 保留：标记已读失败，请重试 | 明确拒绝，未知写结果先刷新 |
| messages.selectWorkContext | 保留：请重新选择工作角色 | 角色失效 |
| messages.selectOrganization | 保留：请重新选择组织 | 组织失效 |
| messages.switchFailed | 保留：切换失败，请重试 | 激活失败 |
| messages.incomplete | 改为：操作未完成，请刷新查看结果 | 不盲重放未知写入 |
| messages.partialBulkAction | 改为：部分操作未完成，请刷新后核对 | 避免仅说部分未完成 |
| messages.deleteFailed | 保留：删除失败，请重试 | 明确删除拒绝 |
| messages.clearFailed | 保留：清除失败，请重试 | 明确批量拒绝 |
| messages.clearTitle | 保留：清除全部通知 | 清除确认 |
| messages.clearDescription | 改为：清除当前所选组织范围内的全部通知后，你在其他设备和工作角色下也不会再看到这些通知。待办和业务记录不受影响。 | 同组织同自然人同事件删除；不声称删除其他组织同名事件 |
| messages.clearConfirm | 保留：全部清除 | 最终动作 |
| view.appName | 保留 common.brandName | 品牌 |
| view.pageName | 保留：消息中心 | 页面名 |
| view.todos | 保留：待办 | 待处理业务 |
| view.notifications | 保留：通知 | 消息 |
| view.organizationScope | 保留：组织范围 | 筛选范围 |
| view.selectOrganization | 保留：选择组织 | 筛选操作 |
| view.loadingHint | 保留：加载提示 | 局部失败提示标题 |
| view.partialOrganizationLoading | 改为：部分组织的内容暂未加载，请重试 | 不虚假承诺自动重试；须补真实入口 |
| view.currentTodos | 保留：当前待办 | 待处理列表 |
| view.allNotifications | 保留：全部通知 | 当前范围的通知 |
| view.markAllRead | 改为：全部标为已读 | 动作与状态分开 |
| view.clearAll | 保留：全部清除 | 清除入口 |
| view.noTodos | 保留：暂无待处理事项 | 成功为空 |
| view.noNotifications | 保留：暂无通知 | 成功为空 |
| view.organization | 保留：所属组织 | 消息组织 |
| view.current | 保留：当前 | 当前组织标识 |
| view.enter | 保留 common.actions.enter | 进入业务 |
| view.deleteNotification | 保留：删除通知 | 不删业务 |
| view.loading | 改为：正在加载消息 | 标准加载 |
| view.crossOrganizationItem | 保留：跨组织事项 | 业务范围 |
| view.switchDescription | 改为：切换到以下组织与工作角色后查看 | 完整激活范围 |
| view.cancel | 保留 common.actions.cancel | 取消 |
| view.switchAndView | 保留：切换并查看 | 组合导航 |
| view.selectOrganizationScope | 保留：选择组织范围 | 筛选标题 |
| view.close | 保留 common.actions.close | 关闭 |
| view.selected | 保留：已选择 | 选择状态，不等于已切换 |
| view.confirm | 保留：确定 | 确认当前选择 |

## messagePerformance.js

`retry` 保留“加载未完成，点此重试”，只用于真正绑定重试动作的点击目标；不能显示成无操作纯文字。

## personnelPicker.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| choose | 保留：选择 | 无独立椭圆小按钮，整卡选择 |
| cancelSelection | 保留：取消 | 取消本卡选择 |
| close | 保留：关闭 | 不提交未确认选择 |
| confirm | 保留：确认 | 提交选中集合，包括明确空集合 |
| retry | 保留：重试 | 失败恢复 |
| selectedTitle | 保留：已选岗位 | 一岗一卡模式 |
| selectedPersonTitle | 保留：已选人员 | 一人一卡模式 |
| expandSelected | 保留：展开 | 选中区展开 |
| collapseSelected | 保留：收起 | 选中区收起 |
| candidateTitle | 保留：可选岗位 | 岗位候选 |
| candidatePersonTitle | 保留：可选人员 | 自然人候选 |
| department | 保留：部门 | 筛选项 |
| identity | 保留：身份类别 | 人事身份筛选 |
| workGroup | 保留：职能组 | 筛选项 |
| all | 保留：全部 | 当前候选范围内 |
| searchPlaceholder | 保留：搜索姓名或岗位 | 实际支持搜索范围 |
| loading | 保留：正在加载候选人员… | 自然人模式 |
| empty | 保留：暂无可选人员 | 自然人成功空 |
| noMatch | 保留：没有符合筛选条件的人员 | 自然人筛选空 |
| noSelection | 改为：尚未选择；确认后将清空原有选择。 | 明确确认空集合后果 |
| unnamed | 保留：未命名人员 | 缺少姓名后备 |
| assignmentUnavailable | 保留：岗位信息暂不可用 | 不推测岗位 |
| selectedCount(count) | 保留：已选 {count} 项 | 兼容未知类型后备；明确模式用以下专用键 |
| selectedPeopleCount(count)（新增） | 已选 {count} 人 | 自然人去重计数 |
| selectedAssignmentCount(count)（新增） | 已选 {count} 个岗位 | 岗位计数 |
| loadingAssignments（新增） | 正在加载可选岗位 | 岗位模式 |
| emptyAssignments（新增） | 暂无可选岗位 | 岗位模式成功空 |
| noMatchingAssignments（新增） | 没有符合筛选条件的岗位 | 岗位模式筛选空 |

静态语料通过不代表扫码识别、手机文件保存、通知跨端删除或选择器现场已验收；必须分别验证。
