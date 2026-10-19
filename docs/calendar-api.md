# 统一日程接口

两端共用 `/api`，除 `GET calendarFeed` 外均为已有统一会话认证下的 POST。账号自然人及工作角色只取服务端认证结果。日程没有报名、接受邀请或拒绝邀请接口。

| 接口 | 用途与边界 |
| --- | --- |
| getCalendarConfiguration | 当前角色可安排人员、范围字典、独立权限及系统时区。 |
| getCalendarRules / saveCalendarRule / batchCalendarRules | 规则读取、保存、启停、批量删除；需要 calendar.rules.manage，版本冲突整批回滚。 |
| getCalendar | from/to 最长一年；managed 只扩大获管理权限的组织日程，不扩大私人日程。detailId/occurrenceDate 返回授权详情；例外移动后仍按原发生日期定位。 |
| saveCalendarEvent | 独立日程创建/修改；更新携带 id/version/scope/occurrenceDate。clientRequestId 使同一创建请求重试不重复创建。 |
| changeCalendarParticipation | action=leave/cancel；scope=instance/following/series。退出仅作用于当前自然人，取消必须复核管理权限。 |
| getCalendarParticipants / saveCalendarParticipants | sourceKind=venue_booking/venue_activity、sourceId；场地原权限负责安排参会人，日程不能修改场地时间或批准借用。edit=true 且具有原业务编辑权限才返回候选目录。 |
| exportCalendar | 输出本人获授权日程的 UTF-8 iCalendar 文本；网页使用统一文件输出组件选择保存或系统分享。 |
| manageCalendarSubscription | create/revoke。专用随机凭据只在生成时返回，数据库保存 SHA-256；重新生成撤销旧凭据。 |
| GET calendarFeed | HTTP Basic 专用订阅认证，用户名 calendar；实时复核账号及有效组织关系。无工作台版本头要求，不使用工作台登录令牌。 |

规则包含 audience、targets、actions；条件复用通讯录同岗位匹配规则。actions 为 assign/update/cancel。各类条件失效不扩大为全部人员。详情名单只含姓名及可见岗位名称，不返回学号或联系方式。

订阅输出最近 31 天至未来 334 天的实例，UID 按日程和原发生日期稳定生成。全天结束日不包含当天；时间使用 UTC。订阅单向读取，刷新和缓存清理由手机日历控制，外部删除副本不表示退出工作台。微信一次添加使用 addPhoneCalendar，只有设备报告能力可用时显示；一次添加不提供后续更新/删除承诺。

通知 Worker 每分钟读取日程，按自然人、实例、提前量及开始时刻去重。收据与通知在一个事务提交；退出、取消及活动结束后不再投递。活动开始后的名单及岗位记录保存于 calendar_occurrence_records；没有历史记录的旧实例不补造历史身份。

迁移：20261019210000_unified_calendar.sql，独立新增 7 张表，可重复执行，线上执行不需要维护停机。日程来源读取原场地权威状态，不复制场地审批表或修改原审批算法。
