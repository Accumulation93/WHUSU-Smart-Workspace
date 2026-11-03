# 部门、身份类别与职能组操作反馈定稿

独立语言审阅。依据三个 core/routes 字典路由及 dictionaryDefinition、dictionaryUsage 的实际拒绝分支；仅批准以下具体映射，不把所有 conflict、duplicate 或 in_use 合并解释。

| 语料键 | 完整定稿 | 使用情境 |
|---|---|---|
| departmentNameRequired | 请填写部门名称。 | saveDepartment 缺名称 |
| identityNameRequired | 请填写身份类别名称。 | saveIdentity 缺名称 |
| workGroupNameRequired | 请填写职能组名称。 | saveWorkGroup 缺名称 |
| workGroupDepartmentRequired | 请先选择职能组所属部门。 | saveWorkGroup 缺 departmentId |
| departmentNameExists | 本组织已存在同名部门，请换一个名称。 | saveDepartment duplicate |
| identityNameExists | 本组织已存在同名身份类别，请换一个名称。 | saveIdentity duplicate |
| workGroupNameExists | 所选部门已存在同名职能组，请换一个名称。 | saveWorkGroup duplicate；其他部门同名不构成重复 |
| departmentUnavailable | 无法找到这个部门，请刷新列表后重新选择。 | 部门保存或删除 not_found；删除缺 id 可同样引导重选 |
| identityUnavailable | 无法找到这个身份类别，请刷新列表后重新选择。 | 身份类别保存或删除 not_found；删除缺 id |
| workGroupUnavailable | 无法找到这个职能组，请刷新列表后重新选择。 | 职能组保存或删除 not_found；删除缺 id |
| departmentInUse | 这个部门仍有关联的人员、业务配置或历史记录，不能删除。 | deleteDepartment in_use；包含旧成员及历史快照，不仅当前岗位 |
| identityInUse | 这个身份类别仍有关联的人员、业务配置或历史记录，不能删除。 | deleteIdentity in_use |
| workGroupInUse | 这个职能组仍有关联的人员、业务配置或历史记录，不能删除。 | deleteWorkGroup in_use |
| workGroupDepartmentUnavailable | 所选部门已失效或不属于当前组织，请重新选择。 | saveWorkGroup invalid_department |
| workGroupDepartmentInUse | 这个职能组已有岗位使用，不能更换所属部门。 | saveWorkGroup in_use；只在更换所属部门且 membership_assignments 有引用时触发，不禁止改名称或说明 |

结构批准条件：按照接口和稳定原因码选择语料；同一个 in_use 在职能组保存与删除时必须分开。未知异常保留公共未知结果说明，不猜测重复或引用。若展示 usages，应以本地分类名称和数量显示，不直出服务端描述；本稿不承诺页面已有引用明细，也不指引用户查看不存在的列表。权限不足沿用已批准公共 forbidden，不引导用户切换到未确认存在的其他身份。

## 组织维护拒绝反馈

已核 `core/routes/org.js` 和 `core/models/organization.js`。组织名称在整个 organizations 表比较，无父级或同级范围。删除检查所有带组织关联列的表，可能包括人员、配置、历史业务与变更记录；不是只检查在职人数。dependencyCount 是关联表种类数，不能展示为资料条数。

| 语料键 | 完整定稿 | 具体分支 |
|---|---|---|
| organizationNameRequired | 请填写组织名称。 | saveOrganization 缺名称 |
| organizationNameExists | 系统中已存在同名组织，请换一个名称。 | saveOrganization duplicate |
| organizationUnavailable | 无法找到这个组织，请刷新列表后重新选择。 | save/deleteOrganization not_found；删除缺 id |
| organizationNotEmpty | 这个组织仍有人员、配置或业务记录，不能删除。 | deleteOrganization organization_not_empty；不暗示删除人员后就必定能删 |
| defaultOrganizationCannotDelete | 这个组织是系统默认组织，请先设置其他默认组织，再尝试删除。 | removeEmpty 返回 current，目前路由混在 forbidden，须拆独立稳定码；换默认后仍须通过关联检查 |

仅初始化且未改动的岗位性质、授权组织初始化记录、缓存版本表不会阻止空组织删除；自定义或修改过的岗位性质、规则、变更记录会阻止。正文不必向用户列数据库细节，不提供强制级联删除的暗示。默认组织不是当前登录工作角色的组织，不能使用“先切换工作角色”的提示。
