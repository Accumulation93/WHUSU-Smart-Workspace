# 通讯录权限独立语言定稿

语言 Agent：directory_language。依据实际两端表单和 shared/contactDirectoryView，以及设计 Agent 核实的同岗位匹配、多组任一满足及逐目标字段授权。状态：以下定稿放行；须采用三个独立分区，不能继续把两类人员放在无主体的“条件组”中。

## 结构与放置

列表和编辑均按 audience → targets → columns 排列。区说明各出现一次，岗位匹配说明仅出现在 scope 项，people 与 self 不显示岗位条件说明。列表编号与编辑编号一致。编号不代表审批顺序，多项取并集。普通端联系人文案本轮不变。

## 共享 contactDirectory 逐键定稿

| 键 | 定稿 | 位置 |
|---|---|---|
| rules | 通讯录查看规则 | 管理列表标题 |
| permission | 通讯录规则管理 | 保留标准权限名称 |
| permissionDescription | 设置哪些人能查看哪些人的通讯录资料。管理规则本身不授予资料查看权限。 | 管理权限说明 |
| audience | 哪些人可以查看通讯录 | 第一分区标题 |
| audienceHelp | 以下人员获得本条规则的查看权限。添加多项时，符合其中任意一项即可。 | 第一分区说明 |
| targets | 他们可以查看哪些人 | 第二分区标题 |
| targetsHelp | 上方获得权限的人，可以查看以下人员。添加多项时，各项人员合并展示。 | 第二分区说明 |
| columns | 他们可以查看哪些资料 | 第三分区标题 |
| columnsHelp | 勾选的补充资料只对本条规则选定的人员开放，不会扩展到其他规则中的人员。 | 第三分区说明 |
| audienceGroupTitle | 查看人群 {index} | 第一分区编号，index 从 1 开始 |
| targetsGroupTitle | 可查看的人群 {index} | 第二分区编号 |
| audienceType | 如何选择查看者 | 第一分区选择方式标签 |
| targetsType | 如何选择资料所属人 | 第二分区选择方式标签 |
| audiencePeople | 指定查看者 | audience people 选项 |
| targetsPeople | 指定资料所属人 | targets people 选项 |
| audienceScope | 按查看者的岗位筛选 | audience scope 选项 |
| targetsScope | 按资料所属人的岗位筛选 | targets scope 选项 |
| self | 查看者本人 | targets self 选项及摘要 |
| selfHelp | 每位查看者可以查看自己的资料，不是配置这条规则的管理员资料。 | self 项说明 |
| audienceScopeHelp | 按查看者当前使用的岗位判断。该岗位须同时满足所选的岗位性质、部门、身份类别和职能组；每类选了多项时，符合其中一项即可。 | audience scope 项 |
| targetsScopeHelp | 只展示同时满足以下条件的岗位。同一人的不同岗位不能合并凑齐条件；每类选了多项时，符合其中一项即可。 | targets scope 项 |
| sameScopeHelp | “与查看者相同”按查看者当前使用的岗位判断。 | targets scope 相同条件说明 |
| addAudience | 添加查看人群 | audience 新增按钮 |
| addTargets | 添加可查看人群 | targets 新增按钮 |
| removeAudience | 移除此查看人群 | audience 移除按钮 |
| removeTargets | 移除此可查看人群 | targets 移除按钮 |
| chooseAudience | 选择查看者 | audience 人员选择按钮及弹窗标题 |
| chooseTargets | 选择资料所属人 | targets 人员选择按钮及弹窗标题 |
| audiencePeopleHelp | 所选人员可按本条规则查看通讯录资料。 | audience people 项 |
| targetsPeopleHelp | 上方获得权限的人可以查看所选人员的资料。 | targets people 项 |
| baseColumns | 姓名、部门、身份类别和职能组会一同显示。补充资料未勾选时，仅展示这些基本信息。 | 字段区域；按两端普通通讯录实际展示核实，不声称已展示岗位性质 |
| optionalScopeHelp | 部门、身份类别和职能组未选择时，表示不限制该项。岗位性质须先选择，或设为与查看者相同。 | scope 项，后一选项只在 targets 中存在，因此 audience 采用 audienceOptionalScopeHelp |
| audienceOptionalScopeHelp | 先选择岗位性质。部门、身份类别和职能组未选择时，表示不限制该项。 | audience scope 项 |
| noFields | 暂无可开放的补充资料 | 字段空态 |
| baseOnly | 仅查看基本信息 | 字段摘要 |
| ruleEffectHelp | 启用后，本条规则授予查看权限；停用后，其他已启用规则授予的权限仍然有效。 | 启用开关附近，仅一次 |
| noRules | 暂无通讯录查看规则 | 管理空态 |
| loadingRules | 正在加载查看规则 | 加载 |
| invalidRule | 请填写规则名称，并分别选择查看者和他们可以查看的人员。 | 规则校验 |
| confirmDelete | 确定删除以下 {count} 条通讯录查看规则？其他规则授予的权限不受影响。 | 删除确认 |
| namePlaceholder | 如：部门负责人查看本部门联系方式 | 规则名示例 |

## 动态语料

以下均由语言库函数或模板完整拥有，业务代码只传参数，不拼标签与标点。

- `scopeFieldLine(label, value)`：`{label}：{value}`。label 为已批准的岗位性质、部门、身份类别或职能组标签；value 为业务名称或已批准状态。示例：`岗位性质：校学生会成员`。
- `specifiedPeopleLine(count, names)`：有 names 时为 `指定人员（{count} 人）：{names}`；无 names 时为 `指定人员：{count} 人`。names 为可访问候选姓名列表，示例：`指定人员（2 人）：张三、李四`，不得为缺失候选补造姓名。
- `optionWithDepartment(name, department)`：有 department 时为 `{name} · {department}`，否则为 `{name}`。供职能组选项展示其所属部门。
- `audienceGroupTitle(index)` 与 `targetsGroupTitle(index)` 按上表实现函数，示例分别为 `查看人群 1`、`可查看的人群 2`。

## 保留与停用

编辑、复制、删除、保存、取消、启用、停用、岗位分类名及选择数量等标准短标签保留。管理页停止引用 conditionHint、groupMatchHelp、samePositionHelp、conditionGroupTitle、addCondition、removeCondition；不要修改这些旧键来影响其他调用方。普通端 search、copyValue、call 等不在本轮改写范围。

短标签不加句号；完整解释与错误句保留句号。实施者不可自行缩写定稿，若空间不足应调整分区或折叠，提交语言复审。

## 实际界面复审补充

已查看手机浏览器完整编辑截图，三个权限主体与本人含义清晰，定稿引用正确，语言放行。补充资料分区标题与展开标题重复，展开控件新增键 `chooseFields`，定稿为 `选择补充资料`，仅用于该展开控件，保留上层标题。

历史兼容摘要函数批准使用 `summarySection(title, groups)`：输出 `{title}：{groups}`；groups 为各组的行以 `；` 连接后，再用 `；` 连接。连接行为全部由语言库函数拥有；示例 `他们可以查看哪些人：查看者本人`。当前无业务调用，不新增展示位置。

2026-11-13 最终原生语言复审通过。语言 Agent 实际查看 `tmp/directory-native-final-scope.png` 与 `tmp/directory-native-final-bottom.png`：查看者和资料所属人的岗位筛选主体分开，未选择维度表示不限、与查看者当前岗位比较、旧规则性质范围待确认均有明确说明；补充资料区域使用“选择补充资料”，列出四项基础资料，说明字段授权仅属于本条规则，启停说明未夸大撤权效果。最终文字与批准稿一致，未发现需要修改的语言问题。

上述为浏览器截图及微信开发者工具模拟器语言复审，不代表实体手机、Pad 竖屏或横屏现场验证。截图控制台存在网络和工具错误，语言放行不替代工程验证，也不宣称控制台无错误。
