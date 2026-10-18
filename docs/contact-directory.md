# 人事信息通讯录

通讯录属于原人事信息子应用。小程序工作台与网页版本人资料页新增通讯录页签；管理端人事信息内新增规则配置页签。原成员资料、导入导出及账号治理使用原入口和接口。

## 权限与接口

`hr.directory.manage` 为独立管理权限：超级管理员自动具备，普通管理员默认关闭。管理权限不授予通讯录人员或补充资料读取权，配置候选仅含姓名、自然人引用及岗位基础信息，无学号和补充资料值。

所有接口均为已认证组织下的 POST；组织、操作者和当前岗位来自统一认证中间件，不接受客户端替换。

| 接口 | 请求 | 返回 |
| --- | --- | --- |
| getContactDirectory | `{summaryOnly:true}` | groups：按部门分组的姓名与岗位基础信息；fields 为空，不查询补充资料值 |
| getContactDirectory | `{key}`，来自本次列表 | contact：重新检查当前权限后，读取该岗位获授权的补充资料 |
| getContactDirectoryConfiguration | 空对象 | rules、people、departments、identities、workGroups、fields；须独立管理权限 |
| saveContactDirectoryRule | id/version（编辑时）、name、enabled、audience、targets、fieldIds | 保存后回读的 rule |
| batchContactDirectoryRules | action 为 enable/disable/delete，rules 为 id/version 列表 | 成功操作数量；任一项失效则整体回滚 |

规则复制在前端建立不含 id/version 的副本，保存前不写数据库。配置候选与资料列目录合并在配置读取接口中，减少重复授权与查询；普通通讯录接口不返回配置候选。

## 条件格式

audience 与 targets 是条件数组，各组之间 OR。同一个 scope 中不同维度 AND，同维度多个值 OR，所有维度必须在同一个有效岗位上成立。

- people：`{type:'people', personIds:[...]}`，按自然人授权。
- scope：`{type:'scope', departmentIds:[], identityCategoryIds:[], workGroupIds:[]}`。
- targets 额外支持 `{type:'self'}`，以及 scope 的 sameDepartment/sameIdentity/sameWorkGroup 布尔开关；同维度不能同时指定静态值和“与查看者相同”。
- 空范围、未知类型和未知属性拒绝保存；已保存失效条件不能被当成全员。已离任指定人员不再命中，其他仍在职的指定人员不受影响。
- 查看者范围只使用当前岗位；被查看者逐岗位匹配。无岗位成员仅可由本人或指定人员条件返回。
- 每个可见岗位单独合并命中规则的 fieldIds，不把其他人的列授权带过来。姓名和岗位基础信息必显，补充资料仅读取当前组织当前模板已生效值。待审值、学号和认证资料不得返回。
- 同名不关联。关联键使用本次列表随机数和用途区分的身份 HMAC，绑定组织、查看者、工作角色、当前岗位与目标岗位；不公开自然人或学号摘要，不透露不可见岗位。详情每次重新匹配当前规则，键不是授权凭据；切换角色、撤销规则、离任后不能凭旧键取得资料。
- 旧客户端不传 summaryOnly 时保留原完整响应；新客户端固定使用轻量列表和按需详情。搜索仅基于基础信息，不为搜索下载全部补充资料。

## 存储与生命周期

新增表 hr_contact_directory_rules，迁移 `20261018230000_hr_contact_directory.sql` 可重复执行，属于在线建表，不修改原人事表。规则保存使用组织分类锁、自然人删除锁及当前权限复核；编辑版本递增。永久删除人员时清理指定人员引用、清空后的规则停用，删除预览列出受影响规则。岗位分类引用检查包含通讯录两类条件。

首版不建立跨请求结果缓存。前端隐藏页面、退出、组织或角色变化时清空结果并丢弃旧请求。搜索和关联跳转只使用已经授权返回的数据。共享人员选择器按自然人选择。管理表单为页面内三段编辑区，删除先冻结并展示名称和数量；规则提交及回读期间显示标准加载反馈。

2026-10-19：列表按部门标签分组，每个可见岗位使用独立紧凑人员卡片；点击进入详情后才加载补充资料。详情保留一个资料复制按钮与电话拨号，删除逐字段复制。返回恢复原筛选和人员位置；返回或隐藏后丢弃迟到详情。规则范围与补充资料选项默认折叠，标题显示已选摘要；展开使用带边框和圆角的浅色选项，选中保留蓝色边框，不影响原有多选条件。

## 验证清单

- `server/test/contactDirectoryRoutes.test.js`：真实 HTTP 入口拒绝未授权管理操作，不能通过请求参数替换认证身份。

- `server/test/contactDirectoryPolicy.test.js`：同岗位条件、逐人逐列、未知条件、无岗位及前端参数。
- `server/test/contactDirectoryIntegration.test.js`：隔离 MySQL 建表两次、真实表单保存回读、并发版本、批量回滚、调岗离任、多岗位及人员清理。
- `server/test/contactDirectoryComponent.test.js`：小程序人员确认、实际提交参数、删除取消、加载反馈、隐藏与迟到请求。
- `web/tests/e2e/contact-directory.spec.js`：三个浏览器设备项目中的只读搜索、拨号链接、岗位定位、独立管理员配置、复制与确认删除。

完整本机 CI、本轮微信主包和全部分包编译、部署状态分别记录。浏览器模拟尺寸和微信开发者工具不替代实体手机、Pad 竖屏及横屏现场测试。生产不创建测试人员或规则，不自动发布微信正式版。
