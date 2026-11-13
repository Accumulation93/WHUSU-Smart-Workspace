# 时间显示与通知入口情境设计

2026-11-13，独立前端逻辑设计 Agent。本文只规定交互、事实及引用范围；最终可见语料由独立语言 Agent 放行，实施 Agent 接入。

## 用户意图和边界

用户先要求主页待办、通知的时间只到分钟，同一天范围只写一次日期；随后明确扩大为全系统可见时间。两端列表、详情、验签结果、账号安全记录、人事资料、实时钟及人类可读导出均采用分钟精度。数据库、请求参数、排序、比较、原始业务值、签名摘要、证书和日志保留原精度；不可从显示字符串反推机器参数。历史签署文件原字节不改变。

日期格式及连接符以语言稿为准；同日判断必须在系统时区换算后进行，不按设备时区或原 UTC 日期判断。日历日期及全天末日继续使用日期型规则，不强行换算。单端缺失仅显示可信端；时间待核对标记逐端保留，不能因同日压缩消失。

## 核实的实现范围

1. `shared/dateTimeFormat.js` 的 `formatListTime`、`formatDetailTime` 是网页展示入口的来源。小程序 `miniprogram/utils/dateTime.js` 有对应独立实现，须同步；`formatSystemClock` 的秒选项也应遵从本次显示要求。
2. `shared/hrProfileDate.js` 的 `formatDateTimeText` 目前独立拼秒，影响人事与通讯录；生成副本不可手改。
3. 身份卡两端实时时钟和核验时间、审核验签、场地流程、账号治理和评分详情已走上述公共格式器。保留时钟生命周期清理和身份核验行为，显示分钟不代表停止实时更新。
4. 发现四处把展示值当机器值使用，必须先拆分：小程序 `splitSystemDateTime` 通过显示结果拆日期；网页 `VenueScheduleDialog.vue`、`VenueBookingDialog.vue` 通过 `formatListTime(...).slice(0,10)` 取日期；`AuthorizationEditorView.vue` 用 `formatListTime(...).replace(' ','T')` 填 datetime-local。改用结构化时区部件/机器日期帮助函数，不得让中文显示格式进入保存参数。
5. 消息业务时间由 `shared/messageFactsView.js` 处理，调用方为小程序 portal、messageCenter 和网页 MessageRow；创建时间也是本轮范围。统一范围帮助函数应依据原始时间与字段状态生成，而非对中文显示值切片。
6. 场地范围集中在 `workContextPresentation.js`、`venueBookingDetail.js`、网页 `venuePresentation.js`，列表及详情模板目前分别渲染起止端。日程两端列表/详情也拼接两次日期，应改成预计算范围文本。
7. 场地活动占用在 `venueBooking.js`、`venueManagementBehavior.js`、网页 `VenueScheduleDialog.vue` 还分别调用语料 timeRange；覆盖实际占用、生效区间和原计划，不误改周期时刻或机器配置。
8. 服务端 `utils/dateTime.js`、`utils/dateValue.js` 的详细时间格式当前只找到定义；日志时间、PDF签名时间明确属于协议事实，不修改。导出按实际调用辨别人类可读值与原始可再次导入数据，不能批量替换 ISO 值。

## 通知交互

- 卡片常态保留业务标题、结果、真实步骤、时间和地点，不显示入口不可用说明，不把未知入口说成正常可打开。
- 当前共享模型为不可打开通知生成 `actionNotice`，两处 WXML 和 MessageRow 常驻渲染。移除常驻显示。
- 原生两个 `onNotificationTap` 当前直接返回；网页按钮在 `!canOpen` 时禁用，因此不能仅删提示后宣称已提供点击反馈。通知点击必须在导航前识别实际不可用并显示前端语料，不切换组织、不导航、不写已读。网页 `messageNavigation.js` 的未知目标当前使用开发中提示，需替换为本场景语料。
- 路由可信性、授权校验、角色切换、成功打开后已读、删除操作保持原链路。不能以隐藏提示来设置 `canOpen=true`。
- 示例只注入当前页面内存，业务名标示为示例，禁止写入生产通知；演示计数必须与数组一致。演示无真实目标时采用相同点击反馈，不伪装生产详情。

## 针对性验证

时间覆盖：同日、跨日、跨月/跨年、系统时区使 UTC 日期跨界、非零秒、空值、非法值、单端、全天、逐端待核对；原 ISO 值、机器日期及保存参数逐字保持。四处表单依赖需真实加载已有值及保存参数检查，不能只验格式器。

消息覆盖：日程、审核、场地、评分；正常与不可用卡片常态均不出现入口失败提示；不可用点击提示且导航、切角色及已读调用为零；正常点击仍进入目标。原有未知事实提示不能错误引导打开不可用详情。

建议执行现有 `messageFactsView.test.js`、消息批量操作前端测试、`message-overview.spec.js`、时间体系和人事日期测试，以及场地日历与权限编辑的真实参数回归。修改共用层后生成两端副本，完成语料审计、兼容审计、网页构建和三档浏览器检查。微信编译与实际示例证据独立记录；未覆盖实体设备不得声明通过。

本设计不修改业务代码、不提供未经语言 Agent 审核的产品文案。

## 全局只读审计补充

以下行号按实施前源码记录，后续以符号定位为准。

| 位置 | 事实与处理建议 |
|---|---|
| `shared/hrProfileDate.js:224-228` | 日期时间资料自行拼秒；修改显示函数，保留解析、归一化和 picker 原值精度。 |
| `miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js:1614-1635,1705-1707` | 导出列只有 fieldId 没有类型，资料值直接进入普通成员资料导出；补类型/按类型格式化导出副本，不修改 currentValues 或 pendingValues。 |
| `server/src/modules/scoring/routes/results.js:2168,2194,2207,2240` | 评分明细导出直接使用 submittedAt 原值，并交通用表格生成器；需在最终导出行副本按系统时区转成分钟显示，保留业务原值及排序。 |
| `server/src/core/models/hrImportV2.js:382-395`、`hrAuthorization.js:351-386` | 人事维护表可重新导入，带岗位版本或用于同一维护链，原始补充资料不可为视觉要求削掉秒再回导。此类数据交换文件与普通可读导出应明确区分。 |
| `miniprogram/subpackages/org/pages/identityCard/identityCard.js:78-80`、`web/src/views/IdentityCardView.vue:89-92` | 实时钟与核验时刻已走 formatDetailTime，无页内绕过；公共格式器覆盖即可。 |
| `miniprogram/components/audit-verification-result/audit-verification-result.js:79`、`web/src/views/audit/AuditVerificationResult.vue:253` | 报告和简洁结果共用 signedAtText 格式器；专业 fields 白名单没有其他时间。DER 复制/导出继续保留原证书。 |
| `miniprogram/subpackages/audit/pages/pendingApprovals/pendingApprovals.js:147`、`miniprogram/subpackages/venue/pages/venueBooking/venueBooking.js:1904`、`miniprogram/subpackages/venue/components/pendingApprovals/pendingApprovals.js:270` | 刷新时刻用 formatSystemClock 的秒分支，需公共入口去秒。 |
| `web/src/views/CalendarView.vue:18,22,24`、原生 `calendar.js:32` / `calendarDetail.js:23` | 直接拼两个完整日期时间；统一范围文本。全天列表当前甚至拼全天标签和完整结束时刻，需按日期范围展示，注意排他结束日。 |
| 原生场地 `pendingApprovals.wxml:26,101`、`venueBookingDetail.wxml:10`、`venueApprovalHistory.wxml:25`、`myVenueBookings.wxml:22`、`venueBooking.wxml:79,118,408`、`venueManagementContent.wxml:140,685,887` | 起止字段分开渲染；消费共同预计算 timeRangeText，不能模板拼接中文。 |
| 网页 `VenuePendingView.vue:138`、`VenueMyBookingsView.vue:122`、`VenueHistoryView.vue:70`、`runtime/venuePresentation.js:33` | 本地 range 函数重复完整日期，接统一范围工具。 |

WXS 源仅 `pickerIndex.wxs` 和 `gradeBand.wxs`（后者有生成副本），未发现时间格式化。模板检索未发现身份卡或验签把原始 ISO 直接展示；原生人事导出和服务端评分明细导出是本轮查到的两个显示绕过点。管理员导出、评分未完成名单和评优汇总的当前字段未含时间。ICS、数据库 DATE_FORMAT 关联键、PDF/CMS时间、logger 时间均属于协议或内部事实，不能去秒。
