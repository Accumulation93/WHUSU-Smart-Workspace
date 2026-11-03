# 共享运行界面与兼容入口：独立语言审稿

语言 Agent `/root/language_editor`。源路径均位于 shared/locales/zh-CN。逐项记录，不修改业务和语料代码。

## 更新、导航、布局与时间

| 源与键 | 状态／定稿 | 情境 |
|---|---|---|
| app.updateReadyTitle | 保留：新版本已就绪 | 更新包已准备 |
| app.updateReadyDescription | 改为：重启小程序后使用新版本，未保存的编辑内容可能丢失。 | 重启影响未保存输入，不能隐瞒 |
| app.restartNow | 保留：立即重启 | 用户明确动作 |
| app.updateFailed | 保留：更新失败，请稍后重新打开小程序 | 下载更新失败 |
| app.upgradeRequiredTitle | 保留：请更新小程序 | 版本不支持 |
| app.upgradeRequiredDescription | 改为：当前版本不支持这项操作，请关闭小程序后重新打开，获取新版本。 | 不承诺普通重启必拿到包 |
| app.restartToUpdate | 保留：重启并更新 | 仅更新包已就绪时 |
| app.reopenProgram | 保留：请关闭小程序后重新打开 | 手动更新路径 |
| controlLayout.confirmSelection | 保留：确认选择 | 选择器提交 |
| controlLayout.selected | 保留：已选 | 选择摘要 |
| controlLayout.items | 保留：项 | 通用数量单位 |
| controlLayout.listSeparator | 保留：、 | 语料连接符 |
| controlLayout.timeRangeUnavailable | 保留：请选择连续可用的时段 | 连续范围要求 |
| controlLayout.start | 保留：开始 | 时间手柄标签 |
| controlLayout.end | 保留：结束 | 时间手柄标签 |
| uiNavbar.backAria | 保留：返回上一页 | 可访问名称 |
| uiNavbar.refreshing | 保留：正在刷新… | 实际刷新中 |
| uiNavbar.brandName | 保留文字WHUSU智慧工作台，使用common.brandName引用 | 品牌单源 |
| time.historicalTimezoneReviewRequired | 保留：时间待核对 | 历史时区无法确定，不猜时间 |

## generated/utils/api.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_c337bd9350 | 改为：登录已失效，请重新登录 | 与公共sessionExpired一致 |
| copy_c6070950c1 | 保留：请选择组织 | 缺组织上下文 |
| copy_d6a178f6ce | 保留：账号已冻结，请联系管理员 | 权威冻结状态 |
| copy_d869b80f50 | 改为：选择工作角色 | 入口目的明确 |
| copy_db7d9fed8e | 改为：请重新选择组织与工作角色。 | 不把角色称泛化身份 |
| copy_e58fa637eb | 保留：请稍后重试 | 后备只读失败 |
| copy_e7c4c49eab | 保留：请重新登录 | 认证失效 |

## generated/utils/filePreview.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_03d69a9d28 | 保留：请重新选择文件 | 输入失效 |
| copy_0c28c344e7 | 保留：未命名文件 | 缺文件名 |
| copy_123db04018 | 保留：\n\n请稍后重试 | 句末后备，不能拼服务端原始message |
| copy_2f0c925c1b | 改为：请切换到有权查看该文件的工作角色。 | 不合并其他角色权 |
| copy_3bc4a9b5be | 保留：请使用其他应用打开此文件。\n\n文件： | 仅已提供可获取文件时；无输出能力不显示 |
| copy_4a80a9d00d | 保留：请选择有效文件 | 文件为空或失效 |
| copy_535998c496 | 保留：请重新打开文件 | 重新读取 |
| copy_53de6ca47b | 保留：无法打开文件 | 错误标题 |
| copy_72fe3d5062 | 退回未引用旧语料，确认无引用后移除 | 当前filePreview无调用；writeAndOpen只写缓存再走outputFile，不应恢复此保存成功承诺 |
| copy_8807a41511 | 保留：文件暂时无法打开，请稍后重试 | 读取失败 |
| copy_883987ec9c | 保留：文件名： | 文件信息标签 |
| copy_8efe5e6dfd | 保留：请检查网络后重试 | 网络请求失败 |
| copy_9f1e38ec09 | 保留：文件已失效 | 仅权威失效结果 |
| copy_b10d64a68c | 改为：登录已失效，请重新登录 | 不强制微信认证 |
| copy_b6d7510119 | 保留：\n大小： | 文件大小事实 |
| copy_b8ede9c6ec | 改为：未取得文件内容，请返回后重新打开。 | 不把路径实现细节给用户 |
| copy_fc99c4cc7b | 改为：正在加载文件 | 明确对象 |
| copy_fee4566726 | 保留：文件信息 | 详情标题 |
| fileIntegrityFailure | 保留：文件内容校验失败，暂时无法打开 | 校验失败不能忽略继续 |

## generated/utils/tableFile.js

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| copy_03d69a9d28 | 保留：请重新选择文件 | 输入恢复 |
| copy_2e61b82784 | 改为：正在读取表格 | 用户不需解析术语 |
| copy_3244171e5e | 保留：文件中没有有效数据 | 解析成功空数据 |
| copy_3bf91c39df | 保留：请选择有内容的表格 | 空表 |
| copy_53de6ca47b | 保留：无法打开文件 | 读取错误标题 |
| copy_5a491fdc30 | 改为：CSV 文件中的引号不完整，请用表格软件重新导出后再试。 | 给普通用户可执行路径 |
| copy_9a61f0e990 | 保留：请选择有内容的文件 | 空文件 |
| copy_b8ebebd538 | 保留：无法识别该文件格式 | 格式不支持 |
| copy_cc78fc735e | 保留：请检查表格格式 | 通用后备 |
| copy_ebb6d1c181 | 改为：当前设备无法直接打开或保存此文件，请选择其他可用的文件操作。 | 不承诺更新微信解决硬能力限制 |

## 其余共享工具与兼容页逐项

| 源与键 | 状态／定稿 | 情境 |
|---|---|---|
| generated/utils/organizationActivation.copy_53d5e0a0c8 | 保留：切换失败，请重试 | 旧入口切换失败 |
| generated/utils/trustedNavigation.copy_4becb061c6 | 保留：页面打开失败，请重试 | 导航失败 |
| generated/utils/trustedNavigation.copy_9aad91c741 | 保留：请从应用服务重新进入 | 失效导航恢复 |
| generated/utils/adminPermissions.copy_e52119b17e | 保留：请稍后重试 | 读取失败后备 |
| generated/utils/messageScope.copy_d337157f74 | 保留：全部组织 | 当前可见组织范围 |
| generated/components/workspace-hero.copy_0c1ba11af0 | 保留：正在加载工作角色… | 角色读取 |
| generated/components/workspace-hero.copy_0cb5ae8471 | 保留品牌文字，改common.brandName引用 | 品牌 |
| generated/components/workspace-hero.copy_511b01626f | 保留：当前组织与工作角色 | 实际会话角色 |
| generated/components/workspace-hero.copy_6d7a32c169 | 保留：正在加载组织信息… | 组织读取 |
| generated/components/workspace-hero.copy_b58ff21ac7 | 保留：切换组织与工作角色 | 角色导航 |
| generated/components/workspace-hero.copy_c01a9aef59 | 保留：管理员 | 管理身份类别 |
| generated/components/workspace-hero.copy_c488bf29b9 | 保留：切换 | 角色切换动作 |
| generated/components/workspace-hero.copy_ccd219e5f1 | 保留：超级管理员 | 管理身份 |
| generated/subpackages/org/pages/accountSecurity.navigationTitle | 保留：账号与登录 - WHUSU智慧工作台 | 兼容页导航 |
| generated/subpackages/org/pages/accountSecurity.copy_166a418985 | 保留：人事信息 | 跳转目标子应用 |
| generated/subpackages/org/pages/accountSecurity.copy_7c1addc466 | 保留：正在打开账号与登录 | 兼容跳转 |
| generated/subpackages/org/pages/accountSecurity.copy_aa4f0ed6cd | 保留品牌文字，改common.brandName引用 | 品牌 |
| generated/subpackages/org/pages/switch.navigationTitle | 保留：组织与工作角色 - WHUSU智慧工作台 | 兼容页导航 |
| generated/subpackages/org/pages/switch.copy_a434110c44 | 保留：正在打开组织与工作角色… | 兼容跳转 |

## main.js 的自存语料

实际不只是聚合，还含以下10项，必须审阅，不能因文件注释称聚合而漏掉。login/portal/messageCenter/home引用不重复改写。

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| passwordBinding.title | 保留：绑定当前微信 | 可选绑定 |
| passwordBinding.note | 保留：是否将当前微信绑定到刚刚口令登录的账号？仅在这是你本人的账号时绑定，也可以暂不绑定。 | 当前会话明确，不抢占绑定 |
| passwordBinding.confirm | 保留：确认绑定 | 明确动作 |
| passwordBinding.cancel | 保留：暂不绑定 | 可跳过 |
| passwordBinding.success | 保留：绑定成功 | 服务端成功 |
| passwordBinding.failed | 改为：暂未确认绑定结果，请稍后查看；当前登录不受影响。 | 超时不能说未绑定，不引导未经确认存在的账号页面 |
| authContext.switchFailed | 保留：切换失败，请重试 | 激活失败 |
| authContext.reopenWorkContext | 改为：请重新打开“组织与工作角色”选择页面。 | 真实入口名 |
| authContext.selectAccessibleOrganization | 保留：请选择可访问的组织 | 组织范围 |
| authContext.relogin | 改为：登录已失效，请重新登录 | 中立认证方式 |

## 系统默认组织专用新增语料

`systemDefaultOrganization`＝“默认组织”；`setSystemDefaultOrganization`＝“设置默认组织”；`systemDefaultOrganizationHelp`＝“设置系统默认使用的组织，不切换你当前的工作角色。”。实际系统设置接口仅改system_config.current_organization，禁止复用“当前组织”或“切换工作角色”的标题。

| 新键 | 定稿 | 情境 |
|---|---|---|
| settingDefaultOrganization | 正在设置默认组织 | 实际请求开始 |
| defaultOrganizationSaved(name) | 默认组织已设为“{name}”。 | 服务端明确成功；name为组织业务名称 |
| defaultOrganizationRejected | 默认组织未能设置，请核对后重试。 | 明确业务拒绝且未更改 |
| defaultOrganizationUnknown | 暂未确认默认组织是否设置成功，请刷新设置后查看。 | 请求结果未知，不盲重放 |
| organizationCreatedDefaultUnknown(name) | 组织“{name}”已创建，但暂未确认默认组织是否设置成功。请刷新设置后查看，不要重复创建组织。 | 两请求部分成功，第一步已确定写入 |
| organizationCreatedDefaultRejected(name) | 组织“{name}”已创建，但默认组织未能设置。请在默认组织设置中重新选择，不要重复创建组织。 | 第一请求成功、第二明确拒绝 |

两请求必须按已确认结果分别选择语料。组织创建未知时不能使用上述已创建句子；默认设置成功也不能说已切换当前工作角色。

已核实filePreview旧保存成功提示无调用，退回清理；绑定未知结果采用不引导页面的中立措辞。静态语料批准不代表运行验证。
