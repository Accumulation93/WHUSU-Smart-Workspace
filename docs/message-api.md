# 消息 API 与加载契约

接口均为已认证 POST `/api/<名称>`。目录只来自服务端认证账号的有效工作角色；`organizationId` 只缩小范围，不授予权限。响应保留原 `status/items/total/unreadCount/nextCursor/organizations/selectedOrganizationId/partial/failedOrganizations`。

| 接口 | 输入 | 行为 |
| --- | --- | --- |
| getMessageOverview | limit（默认 10）、可选 refresh | 兼容旧客户端，返回 todos 与 notifications 两组，仍须等待两组完成 |
| listTodos | organizationId、limit（1～50）、cursor、旧 offset、refresh | 返回去重待办，跨岗位选用原有优先级 |
| getTodoCount | organizationId、refresh | 相同资格/去重集合，只算数量，不格式化/排序 |
| listNotifications | organizationId、limit、cursor、refresh | 收件人去重，通知独立于待办加载 |
| getNotificationUnreadCount | organizationId、refresh | 计数 SQL，不读取通知列表 |

`refresh: true` 跳过结果缓存，不跳过认证、权限、限流、版本校验或并发控制；同范围在途计算仍可合并。缺省短缓存最多 5 秒，依赖版本变化立即换键。权限和资源执行再次读取权威事实。部分失败不存入正常缓存，失败组织仍明确返回，不伪装成空数据。

## 游标

新待办游标为版本 2，包含查询范围摘要、领域/列表版本摘要与排序位置。版本或范围不匹配、非法新游标返回 `status: cursor_expired` 和 locale 自然语言提示；客户端重读首屏。旧数字/base64 位移游标继续兼容。通知继续使用既有 createdAt＋id 游标。

游标不是授权令牌，不能凭游标读取其他组织。列表未变化不重新传入视图层、不清空已加载页数；数据确实变化时重建首屏并作废旧分页响应，禁止混合两个版本的列表。

## 客户端

- 门户与消息中心并行调用 listTodos/listNotifications；任一完成即可展示，失败仅影响本区，已有成功内容刷新时保持可见。
- `messageQueries` 合并相同范围请求、短期复用成功结果；业务成功/部分成功、退出、账号/角色切换立即清理。页面请求代次与会话快照共同阻止迟到写回。
- 30 秒轮询只在可见页运行；手动重试传 `refresh: true`。分页请求与首屏刷新互斥或按代次作废。
- 通知仍只在可信导航成功和服务端确认后变为已读；读取、刷新或待办缓存命中不得改写已读。
- 不新增返回学号、内部诊断、SQL、缓存键或角色资料的调试响应。

观测、失效矩阵、规模和未完成验收见 [性能维护](performance.md)。
