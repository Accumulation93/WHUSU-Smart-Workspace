# 岗位性质字典接口

岗位性质为组织独立字典。两端在人事管理页签内使用共享编辑器，旧独立页面与复制深链继续可用。文案唯一来源为 `shared/locales/zh-CN/assignmentNatures.js`。

## 读取与保存

`listAssignmentNatures` 返回当前角色范围内的 `list` 和 `canCreate`。每行包含 `id`、`name`、`description`、`version`、`canUpdate`、`canDelete`、`deleteRestrictionCode`。描述为空统一返回空字符串；`deleteRestrictionCode=legacy_required` 表示系统保留编号，不能删除，其他行为空字符串。`canDelete` 表示授权资格，不代表引用校验已通过。

`saveAssignmentNature` 接收名称、新建可省略编号、编辑必须传编号和版本。`description` 可选，类型为字符串，上限2000个Unicode码点，保留原换行。编辑时省略该字段保留原描述；显式空字符串清空；新建省略时保存空描述。非法类型或超长返回 `assignment_nature_description_invalid`，版本冲突不覆盖记录。所有写入在事务内复核当前组织和行级授权。

## 删除与复制

`deleteAssignmentNature` 接收编号与版本。保留编号返回 `assignment_nature_legacy_required`；岗位、规则或历史引用返回 `assignment_nature_in_use`，不解除既有引用保护。前端有删除权限时保留入口，保留编号在同一卡片说明限制，点击不发删除请求。

跨组织复制的新载荷携带描述并在目标独立保存。历史载荷缺少描述时保持原结构参与摘要校验，避免增加空字段导致旧分享或草稿失效；实际创建时补空描述。

## 迁移与验证

`20261110190000_assignment_nature_description.sql` 通过信息表检查新增可空TEXT列，使用INSTANT，重复执行不重写数据。授权隔离数据库测试执行两遍迁移，并通过真实HTTP参数保存、回读、省略保留、显式清空、边界与删除保护。组织复制隔离测试验证新描述及旧载荷摘要兼容。

网页两份专项在三档浏览器共18项通过，包括描述多行保存后重开、内置项删除不发请求。浏览器使用模拟响应，数据库保存证据来自独立HTTP集成。微信编译、原生操作及实体设备结果由主任务单独登记。

本轮官方预览日志 `tmp/nature-description-preview.log` 返回 `√ preview`，主包及6个分包共4277862字节。模拟器在预览后出现 `wx://not-found` 和页面栈错误，正常关闭重开后恢复；实际从门户进入人事信息、切换岗位性质、查看描述及删除按钮、编辑回填和取消均已检查。未在生产保存或删除测试数据，保存证据来自隔离数据库；实体手机与Pad未完成现场验证。
