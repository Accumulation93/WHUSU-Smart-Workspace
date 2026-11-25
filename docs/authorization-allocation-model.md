# 权限分配与业务使用的边界

2026-11-25 的实现位置是 `authorizationCatalog.js`、`authorizationPolicy.js`、`authorizationManagement.js` 和 Model `authorization.js`。

## 正式角色与分配

- 角色中的 `assign:<业务能力键>` 表示分配该操作权限的权力。目录元数据 `allocationCapability` 指向原能力。
- 普通规则的 `policy.subjects` 是本次持有人；`policy.allocationSubjects` 是该持有人可授予的工作角色范围。包含允许分配能力时，后者必须提供。
- `scopes`、`fields`、`startsAt`、`endsAt` 共同约束业务数据、字段和时间。持有人范围和可授范围必须同时落在同一个来源内，不跨来源拼接。
- 服务端返回的来源 `envelope.capabilities` 同时包括原操作和相应分配能力；`envelope.subjects` 是可授对象。继续授予分配权使用同一个能力键，不再生成下一层开关。
- 新写入优先使用 `allocationSourceId`，兼容 `delegationId`；两字段同时存在但不同会被拒绝。来源 ID 是不透明值，通常为 `rule:<rule.id>`，超长历史编号使用固定长度摘要。选项 `ruleId` 保存实际规则编号。
- `allowRedelegation` 仅是旧接口兼容字段，不再参与授权决定。有效分配权本身包含同边界内继续授予分配权的权力。

上级来源停用、删除、到期、收窄，或原授予岗位失效后，依赖该来源的下级规则不再提供权限。其他独立来源继续有效。禁止规则优先；普通分配人不能给本人或本人其他岗位提权。

管理读取返回全部可见持久分配，包括来源失效的记录，并用 `sourceActive:false` 标记。业务执行只使用通过来源检查的规则。

## 普通业务归属子应用

目录以 `businessRoles` 包含普通用户且 `legacy` 为空识别 `businessOnly`。这些能力保留用于领域校验和历史解释，但不在中心目录中展示，也不生成对应分配能力。

统一身份模式下，调用者已完成业务校验并传入 `businessGranted:true`，且目录登记该角色业务资格时，使用该关系判断普通业务资格。中心对同键的允许和禁止不再限制此路径。身份、组织、特殊权限、`businessAllowed` 及受保护字段检查仍在前面执行。`businessGranted:false` 的管理操作继续检查正式角色规则。

原成员基础角色的关系记录、草稿和历史版本保留用于解释与旧进程兼容。新中心不显示该角色，并拒绝编辑、发布、复制及新绑定；历史版本仍可查。旧基础开关接口返回 `authorization_upgrade_required`。运行时 `disabledBasic` 恒为空。

## 存储与在线迁移

1. `20261124160000_unify_allocation_permissions.sql` 将仍有效的一般分配能力迁入正式角色和规则。外层、内层对象及数据边界分别保留，旧来源编号继续用作别名。仅有已退役业务项的旧来源只保留历史；混合来源只迁入中心管理能力。
2. 新完整策略保存在 `authorization_rules.allocation_policy_json`。旧 `policy_json` 对分配能力保留合法、停用的原业务键投影，且不含新字段，避免旧进程因未知策略结构拒绝整组授权。新 Model 优先读取完整策略。
3. 旧独立委托表的写入触发器在同一事务维护正式分配。正式分配和发布操作反向更新旧镜像时抑制触发器重复写入。旧单条保存改变能力时，不修改已被其他分配复用的角色和无关草稿。
4. `20261125100000_move_member_business_controls_to_apps.sql` 保留身份卡的实际关闭结果。转移记录防止重跑覆盖子应用后续设置；兼容触发器只同步旧进程实际改变的身份卡条件，并与旧发布同事务回滚。触发器创建前已提交的变化另行补齐。系统生成的转移记录和未改动默认设置不阻止删除空组织。
5. `20261125101000_retire_business_authorization_capabilities.sql` 为普通角色追加移除退役业务键后的发布版本，仅从草稿移除这些键；原版本不改。关联基础角色整行跳过。纯业务分配使用合法停用旧键投影保留，不能将空能力策略送入运行时计算。

合法空草稿可保存、查看和继续编辑。仅因业务退役而清空的角色隐藏，历史保留；以后重新添加管理能力后可正常显示。

两个权限迁移均由仓库分类器识别为非破坏性。迁移遇不可合法分配的特殊、受控或不支持能力时明确失败，不通过删除能力或放宽判权掩盖问题。

## 对应检查

- `server/test/authorizationAllocationPolicy.test.js`：目录、双层对象边界、数据与期限、撤销、禁止和旧进程投影。
- `server/test/authorizationAllocationIntegration.test.js`：隔离 MySQL 真实 HTTP 保存、发布、回读、继续分配、拒绝越界及旧接口镜像。
- `server/test/authorizationBusinessRoleRetirementIntegration.test.js`：重复迁移一致、追加发布版本、原历史不改、基础角色保护、纯业务策略不污染判权及空草稿维护。
- `server/test/memberBusinessPermissionsIntegration.test.js`：普通业务与中心管理分离、身份卡业务配置迁移及关闭结果保留。

这些检查不能代替两端现场界面、实体设备、最终提交完整 CI 和生产发布后核验。
