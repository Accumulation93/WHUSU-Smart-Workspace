# 身份卡、文件操作、系统设置与共享组件：前端语境

2026-11-03，前端逻辑 Agent。各区域独立交语言 Agent写作；此处无最终文案，静态事实不代表现场验证。

## 身份卡

入口：org/pages/identityCard，web/src/views/IdentityCardView.vue；共享语言 identityCard.js。服务端getMyIdentityCard/verifyIdentityCard/createMyIdentityCardCode分别获取本人、公开核验、生成码。

本人卡每秒显示当前时间；公开核验页显示result.checkedAt，是核验发生时间，不是持有人实时在场证明。卡面当前时间由前端Date.now生成，不能用其宣称防截图或不可复制。扫码查询有效性与持卡者是否本人不是同一个事实，文案既不添加用户已拒绝的长免责声明，也不夸大验证能力。

身份有效状态、在职无岗位、有效管理身份分开；不能把管理身份套用普通岗位字段。公开页失败不要求先登录再核验。成功时刷新与失败时重试动作不同。二维码与小程序码是两种图，不能统一称小程序码失败；当前generating/qrFailure对两种生成阶段共用，需语言评审中立或分支键。

后端identityCard.js创建token有效期确为24小时，identityCardCode.js设置小程序码is_hyaline、普通二维码透明light，页面浅色容器不代表文件不透明。码有效期不是组织任职期限。`env_version`只用于生成正确微信码环境；小程序内扫码导航还必须核实当前环境，不可文案承诺替代路由验证。展示姓名、组织、岗位、状态为核验事实，保留；错误不直接显示服务端message，当前网页catch已用前端failure/qrFailure。

## 统一文件输入输出

实际入口：miniprogram/utils/fileIO.js、filePreview.js；web/src/runtime/fileIO.js；语料fileIO.js与generated/utils/filePreview.js。平台选择能力只展示支持项，不能以静态平台名保证原生菜单具体有哪些选项。

| 分支 | 当前真实能力 | 写作约束 |
| --- | --- | --- |
| 小程序输入 | chooseMessageFile，允许图片时chooseImage的album/camera | 当前实现没有系统本地文件browse分支，不能宣传所有设备支持系统浏览；聊天文件不是系统文件管理 |
| 小程序图片输出 | 预览、支持时shareFileMessage、保存相册 | 保存相册与任意目录另存为不是一回事 |
| 小程序文档输出 | PDF/Word/Excel/PPT经openDocument并showMenu；PC通过saveFileToDisk | 打开文档不等于已保存；手机文档菜单能否另存取决设备实际能力 |
| 网页输入 | file input的browse，图片capture属性可提供camera | selection_started仅说明已打开选择器，不代表已选文件 |
| 网页输出 | 支持时showSaveFilePicker写入；否则a.download启动下载；navigator.share按canShare | download_started不能写成已保存，系统分享成功不等于已发给指定人 |
| 取消 | 原生cancel或网页AbortError，返回cancelled | 不显示失败警报，不当作格式错误 |
| 切换角色 | 比较scope后取消迟到操作 | 不把当前文件以另一角色重新上传 |

文件名为业务输入，允许安全清理字符但不得用提示语替代真实名称。原生namedDocument只是创建预览缓存，不能说保存到用户文件管理。签署页独立编辑逻辑不受统一文件接口改变。生成PDF文字保留与接口选择无关，不能在导出提示中保证未经回读验证的文件质量。

## 系统设置与组织管理

原生真实维护入口是scoring/pages/admin/modules/settingsBehavior.js，不存在已核实的system分包。网页SystemConfigView当前只读时区、配置版本和当前组织；不可写成网页可保存全部设置。

语料为generated/subpackages/scoring/pages/admin/modules/settingsBehavior.js与admin.js中的相关键，网页system语言是生成引用。load/saveSystemConfig、list/save/deleteOrganization、旧switchOrganization/createAndSwitchOrganization分支需结合最终模板绑定核对。服务端message在保存、删除、切换成功/失败多处直出，全部系统反馈必须改成前端码映射。组织名称、用户编辑内容保留；timezoneConfigVersion是实现数据，不必作为一般用户操作指引。

必须区分系统默认组织设置、当前用户工作角色激活、永久删除组织三类行为。旧switchOrganization函数存在不代表允许它绕过统一会话激活，发现可达需交实施核对，不用文案掩盖。删除组织必须显示范围与引用阻断，不保证跨组织自然人被一起删。时区调整改变显示，不改写绝对时间；文案不能称数据库时间迁移。

## 共享组件

组件清单本批已定位：workspace-hero、ui-navbar、ui-icon、app-loading、app-toast、viewport-portal、personnel-picker、person-link、assignment-nature-create、audit-verification-matches/result、hr-profile-migration-dialog/requests、contact-directory；网页同义组件分别在components目录。

- Hero的姓名/组织/岗位为事实，管理员标签必须用hero语料，不能因同字绑定到授权规则adminGrants；固定品牌与当前组织分开。
- personnel-picker有person与assignment两模式。person以自然人键去重，assignment展开每人岗位并以assignmentId去重；已选人数与岗位数、搜索和确认标题必须随模式，不以同一“人”计数。整卡选择、确认后返回；取消不写，清空需真实可达。
- person-link是否可跳转取决服务端授权关系，不按名字匹配。不能在无权时提示另有隐藏岗位；链接不可用保持业务姓名，不删姓名。
- 加载提示应描述当前阶段，如检查、生成、保存；不可把所有过程叫加载，也不能已成功后保留处理中。loading组件不应自己推断业务成功。
- Toast/Modal/通知栏的string只是显示管道，不是准许服务端系统message直出。调用方应提交前端语料结果，业务用户文本不能误当需要翻译的提示。
- navbar返回、关闭弹窗、取消编辑是不同动作；图标由组件渲染，不把叉号、箭头等符号拼入语料。
- viewport-portal/ui-icon若无用户可见语料不需要人为制造提示；可访问名称必须描述作用，不能用组件内部名。

## 继续核查与验收

追加核实：settingsBehavior.switchOrganization 与 createAndSwitchOrganization 确有 WXML 绑定；server/core/routes/org.js 的 switchOrganization 仅更新系统默认组织，前端 applySystemDefaultOrganization 仅更新默认组织展示，不改变当前角色会话。函数名称不能作为切换工作角色的依据。新建再设默认是两次请求，第二步失败须保留组织已创建这一事实。网页 system.currentOrganizationLabel 读取的是默认组织，应脱离 authorization.currentOrganization 的工作角色语义引用。

共享人员选择器全部调用模式、文件接口消费者、系统旧切换入口可达性尚需逐项完成；不能将此清单视为全局改完。后续语言Agent应逐键登记前端语义来源及服务端事实参数。真实设备须验证文件菜单、取消、原图保存与扫码；模拟API存在不能证明设备支持。任何未实测手机/Pad项目都保留未完成状态。
