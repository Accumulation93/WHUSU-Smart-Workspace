# 人员导入：独立语言逐项审稿

补充结构化事实兼容提示：新增 `issueDetailsUnavailable`＝**这次检查未能提供完整的问题明细，请重新检查导入内容。** 用于旧预览缺presentationFacts或未知reason且无法准确解释；不得解析旧message猜字段、人员或结果。此提示只说明检查明细不全，不说明资料已导入或导入失败；该组修复操作须禁用，保留“重新检查”入口。reason已知且事实完整时必须显示具体问题，不能图省事全部用此句。

语言 Agent `/root/language_editor`。对象为 hrImport.js，机器识别别名单独保留。语境依据 hr-directory-import-context-20261103.md。不得改用户姓名、原表内容、岗位识别码、原始版本或后端结果协议。

## 结构条件

问题组标题必须是字段与问题类型；人员、行号、列号与字段名进入明细，不以首人姓名当整组标题。整组／已选行／单行操作分别列影响人数与行数，确认名单须可查看全部行；不因分页缩小全选范围。错误中的“此人／本行／下方”仅在相应人员、原表行号、字段及数值同屏呈现时成立，独立Toast不能显示这些缺上下文句子。

检查成功不等于已导入；保存处理选择不等于写入正式资料；文件生成不等于保存手机；提交未响应不等于失败。同名职能组不同部门无关系，不允许文案掩盖跨部门错误匹配。岗位性质必须按当前组织字典校验，不能把文案写成只允许旧三项。

## 顶部、阶段与问题类别

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| checking | 保留：正在检查导入内容 | 生成预览 |
| processing | 保留：正在处理所选问题 | 决策重算 |
| importing | 保留：正在导入成员资料 | 正式执行 |
| exporting | 保留：正在生成表格 | 输出成表阶段 |
| title | 保留：人员导入 | 模块名 |
| navigationTitle | 保留：人员导入 - WHUSU智慧工作台 | 导航 |
| appName | 保留：人事信息 | 所属子应用 |
| peopleView | 保留：按人员查看 | 分组视图 |
| involvedPeopleRows | 保留：涉及 {0} 人，共 {1} 行 | 自然人与表格行分开 |
| chooseFile | 保留：选择文件 | 统一输入入口 |
| mapColumns | 保留：确认列对应 | 表列与系统字段对应 |
| preview | 保留：检查导入内容 | 不写正式数据 |
| problems | 保留：待处理问题 | 预览问题 |
| changes | 保留：本次变更 | 正式写入前摘要 |
| resolved | 保留：已处理 | 预览问题决策完成 |
| next | 保留：继续检查 | 继续预览 |
| back | 保留：返回修改 | 回前一步 |
| execute | 保留：确认导入 | 最终写入 |
| retry | 保留：重新检查 | 重新读取预览 |
| refresh | 保留：读取最新内容 | 权威结果读取 |
| exportTable | 保留：导出岗位表 | 维护表输出 |
| exportIssues | 保留：导出问题表 | 问题报告输出 |
| includeProfile | 保留：包含生效补充资料 | 不含待审默认值 |
| ignore | 保留：不导入此列 | 不删除原资料 |
| name | 保留：姓名 | 本人或管理导入字段 |
| studentId | 保留：学号 | 专用人事管理范围 |
| nature | 保留：岗位性质 | 字典字段 |
| department | 保留：部门 | 岗位属性 |
| identity | 保留：身份类别 | 岗位属性 |
| workGroup | 保留：职能组 | 岗位属性 |
| assignmentId | 保留：岗位识别码 | 维护表协议列不改名 |
| assignmentVersion | 保留：原始版本 | 维护表协议列不改名 |
| staff | 保留：本会岗位 | 旧兼容名称，不定义完整选项 |
| liaison | 保留：联络岗位 | 旧兼容名称，不强制替换既存字典 |
| other | 保留：其他岗位 | 旧兼容名称 |
| chooseNature | 改为：选择本批新增岗位的性质 | 明确修饰对象 |
| choose | 保留：请选择 | 需邻近字段标题 |
| empty | 保留：未填写 | 空内容 |
| identity_conflict | 保留：姓名不一致 | 系统与导入姓名差异 |
| row_name_difference | 保留：同学号姓名不一致 | 表内同学号不同姓名 |
| unavailable | 保留：人员状态待核对 | 旧预览缺具体状态 |
| member_departed | 保留：成员已离任 | 当前组织关系 |
| person_inactive | 保留：人员已停用 | 全局人员状态 |
| assignment_unavailable | 保留：原岗位已失效 | 岗位状态 |
| ambiguous | 保留：待选择对应岗位 | 多个可匹配岗位 |
| intent | 保留：待确认岗位变更 | 新增兼职或调岗 |
| incomplete | 保留：岗位信息缺失 | 必需岗位属性不全 |
| new_assignment | 保留：待确认新增岗位 | 新增确认 |
| group_mismatch | 改为：职能组与部门不对应 | 只允许真实引用关系错误触发 |
| dictionary | 保留：名称未登记 | 通用字典名称 |
| department_unregistered | 保留：部门未登记 | 具体字典 |
| identity_unregistered | 改为：身份类别未登记 | 与正式字段名一致 |
| work_group_unregistered | 保留：职能组未登记 | 具体字典 |
| value_conflict | 保留：与系统内容不一致 | 原值与导入值差异 |
| row_conflict | 保留：表内多行内容不一致 | 表内冲突 |
| required_missing | 保留：必填内容缺失 | 必需字段为空 |
| invalid | 保留：填写内容有误 | 具体原因须明细给出 |
| duplicate | 保留：岗位重复 | 新建与既有重复 |
| stale | 保留：系统资料已更新 | 导出后版本变化 |

## 问题解释与校验

以下逐项保留者已确认包含处理方向；原表行、人员、列、字段由明细结构提供，不能在无定位信息时单独显示。

| 键 | 状态／完整定稿 |
|---|---|
| identityMismatch | 保留：同一学号的姓名不一致。请核对下方姓名，修改本行内容或排除此行 |
| unavailableMember | 保留：这份旧预览没有记录具体人员状态。请重新检查，查看成员是否已离任或停用 |
| unavailableAssignment | 保留：原岗位已失效。请重新导出岗位表后导入，或排除此行 |
| ambiguousAssignment | 保留：此人有多个岗位。请选择本行对应的岗位 |
| chooseIntent | 保留：本行岗位与系统记录不同。新增兼职请选择“新增岗位”；调整原岗位请选择“选择已有岗位” |
| missingAssignment | 保留：建立岗位需要的资料没有填齐。请修改本行，或选择“只维护成员资料” |
| confirmNewAssignment | 保留：此人还没有岗位。请确认新增，或选择“只维护成员资料” |
| wrongGroup | 保留：请核对本行的部门和职能组。同名职能组在不同部门分别登记，不互相替代 |
| newDictionary | 保留：{0}“{1}”尚未登记{2}。写错了可修改本行；名称正确请选择“确认创建” |
| dictionaryForbidden | 保留：{0}“{1}”尚未登记{2}。可修改为已有名称；确需新增时，请联系有权限的管理员创建后重新检查 |
| differentValue | 保留：表格内容与系统记录不同。请对照下方内容，选择“保留原值”或“采用导入值”，也可以修改本行 |
| multipleValues | 保留：同一项资料在表格多行填写不同。请核对各行内容，再选择采用哪一行，或修改、排除相关行 |
| invalidValue | 保留：填写内容有误，请按下方要求修改本行 |
| requiredValue | 保留：必填内容缺失。请修改本行并补齐这一项 |
| numberValue | 保留：数字填写有误，请按下方范围和位数要求修改本行 |
| sequenceValue | 保留：填写的内容不在允许选项中，请从下方选项中选择一个 |
| dateValue | 保留：这一格不是完整日期，请改成“2026-10-18”这样的年月日格式 |
| datetimeValue | 保留：这一格不是完整日期时间，请改成“2026-10-18 14:30:00”这样的格式 |
| lengthValue | 保留：字数不符合要求，请按下方字数范围修改本行 |
| phoneValue | 改为：这一格不是有效的 11 位手机号码，请检查是否漏填、写错或带了其他文字 |
| emailValue | 保留：这一格不是有效的邮箱地址，请按“name@example.com”这样的格式填写 |
| requirementLength | 保留：文字长度：{0} 至 {1} 个字符 |
| requirementNumber | 保留：数值范围：{0} 至 {1} |
| requirementDigits | 保留：数字位数：{0} 至 {1} 位 |
| requirementOptions | 保留：允许选项：{0} |
| requirementInteger | 保留：仅允许整数 |
| requirementDecimal | 保留：允许小数 |
| noLimit | 保留：不限 |
| duplicateAssignment | 保留：岗位重复：修改后会与已有岗位相同。请修改本行，或选择要维护的已有岗位 |
| staleAssignment | 保留：系统资料在导出后有更新。请核对最新资料，再确认采用当前版本 |
| stalePreview | 保留：检查后，系统资料或你的权限有更新。本批尚未导入，请重新检查；仅服务端明确整批未写时使用 |
| missingIdentity | 保留：请提供有效的姓名和学号 |
| invalidMapping | 保留：请为姓名和学号分别选择列，并检查是否重复对应 |
| invalidFile | 保留：文件内容或处理选择不符合要求，请检查行数、列数及资料长度；有准确字段错误时不得降级为此提示 |
| upgrade | 保留：请更新小程序后使用新版人员导入，原表格可以重新选择导入；仅小程序旧版本拒绝使用 |
| expired | 保留：导入预览已失效，请重新检查文件 |
| forbidden | 改为：当前工作角色没有本组织的导入权限，请选择有权限的工作角色或联系管理员 |
| pendingIssues | 保留：还有未处理的问题，请先处理或明确排除相关行 |
| failed | 改为：暂未确认人员导入结果，请先查询执行结果，避免重复导入 |
| requestConflict | 保留：这次提交与原请求不一致，请查询原执行结果 |
| notFound | 保留：尚未找到本次执行结果，可使用原请求重试；按钮必须复用原requestId |

## 操作、范围与结果

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| keep | 保留：保留原值 | 不采用本行新值 |
| replace | 保留：采用导入值 | 采用表格值 |
| clear | 保留：明确清空 | 主动删值 |
| exclude | 保留：排除此行 | 排除本行全部变更 |
| excludeRelated | 保留：排除相关行 | 明确列范围 |
| restore | 保留：撤销本次处理 | 回退预览决策 |
| create | 保留：确认创建 | 创建未登记分类 |
| newAssignment | 保留：新增岗位 | 不覆盖原岗 |
| selectAssignment | 保留：选择已有岗位 | 调整原岗 |
| personOnly | 保留：只维护成员资料 | 不新增岗位 |
| edit | 保留：修改本行内容 | 仅改预览 |
| save | 保留：保存选择 | 保存处理决策 |
| cancel | 保留：取消 | 放弃选择 |
| useRow | 保留：采用此行 | 表内冲突决策 |
| rebase | 保留：核对并采用当前版本 | 接受最新岗位版本 |
| selectProblem | 保留：选择此问题 | 批量问题选择 |
| batchKeep | 改为：批量保留原值 | 与单项一致 |
| batchReplace | 改为：批量采用导入值 | 不把替换对象省略 |
| batchExclude | 保留：批量排除 | 范围另列 |
| batchCreate | 改为：批量确认创建 | 仅记录预览中的创建选择，正式导入才新建分类 |
| batchNature | 改为：批量设置岗位性质 | 不省字段 |
| confirmTitle | 保留：确认本次操作 | 批量确认 |
| confirmAction | 保留：将对已选的 {0} 项执行“{1}”，请核对范围 | 操作名来自批准语料 |
| excludeNotice | 保留：排除后，这些行中的岗位和资料修改均不执行；其他行将重新检查 | 排除整行后果 |
| summary | 保留：待处理 {0} 个问题，涉及 {1} 行，已处理 {2} 个问题 | 总览数量 |
| groupSummary | 保留：{0} 个待处理问题，涉及 {1} 行，已处理 {2} 个问题 | 分组数量 |
| rowLabel | 保留：原表第 {0} 行 | 来源定位 |
| otherIssues | 保留：本行另有 {0} 个待处理问题 | 不掩盖同人多问题 |
| before | 改为：系统原有内容 | 明确来源 |
| after | 保留：导入内容 | 表格来源 |
| target | 保留：目标岗位 | 选择的维护对象 |
| fileSummary | 保留：{0}，共 {1} 行 | 文件名称与行数 |
| loading | 保留：正在检查导入内容 | 检查过程 |
| noProblems | 保留：没有待处理问题，请核对本次变更后确认导入 | 仍需确认 |
| noChanges | 保留：本次没有需要写入的内容 | 不空报成功 |
| more | 保留：加载更多 | 只显示更多，不改变选择范围 |
| selectedSummary | 保留：已选 {0} 项 | 问题数量 |
| executionSummary | 保留：新增 {0} 名成员，新增 {1} 个岗位，修改 {2} 个岗位，维护 {3} 项资料，创建 {4} 个分类，排除 {5} 行 | 服务端权威执行计数 |
| success | 改为：人员资料已导入 | 不展示回读内部实现 |
| result | 保留：执行结果 | 结果区 |
| queryResult | 保留：查询执行结果 | 同提交查结果 |
| retryExecution | 保留：重试原提交 | 必须同幂等标识 |
| profile | 保留：生效补充资料 | 已生效值 |
| changeMember | 保留：新增成员 | 预览变更类型 |
| changeAssignment | 保留：新增岗位 | 预览变更类型 |
| changeUpdate | 保留：修改岗位 | 预览变更类型 |
| changeProfile | 保留：维护资料 | 预览变更类型 |
| unchanged | 改为：无需修改 | 自然表述 |
| instructions | 保留：空白保留原值，删行不删除岗位；修改已有值需要确认，清空请在预览中明确操作 | 防误删 |
| issueFile | 保留：人员导入问题 | 问题表名称 |
| maintenanceFile | 保留：岗位维护表 | 维护表名称 |
| category | 保留：问题类别 | 报告列 |
| reason | 保留：问题说明 | 报告列 |
| rows | 保留：原表行号 | 报告列 |
| state | 保留：处理状态 | 报告列 |
| open | 保留：待处理 | 状态 |
| done | 保留：已处理 | 状态 |
| excluded | 保留：已排除 | 状态 |
| assignmentChoice | 保留：选择本行要维护的岗位 | 多岗决策 |
| rowEditor | 保留：修改这一行 | 行编辑标题 |
| editNotice | 保留：只修改本次导入内容，确认导入后才保存到系统。修改姓名或学号后会重新匹配人员；岗位空白保留原值 | 预览与持久化分开 |
| versionNotice | 保留：岗位表含识别信息，请保留识别码和原始版本；旧版本须先核对最新资料 | 保护协议列 |
| columnSummary | 保留：第 {0} 列：{1} | 列定位 |
| fieldLabel | 保留：资料项：{0} | 系统字段定位 |
| emptyFile | 保留：文件没有可导入内容，请重新选择 | 空文件 |
| errorDetails | 保留：检查未完成，请保留当前内容并重试 | 检查失败 |
| categoryLink | 保留：查看其他问题 | 分类跳转 |
| mappings | 保留：表格列对应 | 列映射标题 |
| confirmImport | 保留：请核对所有新增、替换、清空及排除内容，确认后整批保存 | 全批写入确认 |
| exportFailed | 保留：表格导出失败，请重新导出 | 文件生成失败；手机保存失败需另用文件输出语料 |
| exportReady | 保留：表格已生成 | 不称已保存手机 |
| queryHint | 保留：提交结果暂未确认，请查询结果，避免重复导入 | 结果未知 |
| pending | 保留：等待确认 | 决策等待 |
| rowMissing | 保留：该行已不存在，请重新检查文件 | 行引用失效 |

## 兼容别名：明确不重写

`headerAliases.identity` 的“身份／身份类别”、`workGroup` 的“职能组／职能组（全称）／工作分工（职能组）／工作分工”、`department` 的“部门／部门（全称）”、`name` 的“姓名”、`studentId` 的“学号”均为读取旧文件的匹配协议，全部原样保留，不是面向用户的新提示语。

## 行定位与分组处理余项

| 键 | 状态／完整定稿 |
|---|---|
| spreadsheetIdentityError | 保留：学号单元格是表格错误值“{0}”，不能识别人员。请先修正原表中的学号，再重新选择文件 |
| importedAssignment | 保留：本行岗位内容 |
| existingAssignments | 保留：系统现有岗位 |
| noAssignment | 保留：系统中没有岗位 |
| noRegisteredValue | 保留：尚未登记 |
| departmentScope | 保留：（所属部门：{0}） |
| assignmentDifference | 保留：{0}。这是增加一份兼职，还是修改原来的岗位？兼职请点“新增岗位”，调岗请点“选择已有岗位” |
| assignmentAmbiguous | 保留：此人有多个岗位符合本行内容。请点“选择已有岗位”，指定本行要修改的岗位 |
| missingAssignmentFields | 保留：岗位信息缺失：{0}。请修改本行并补齐；不安排岗位时，可选择“只维护成员资料” |
| newAssignmentDetails | 保留：此人还没有岗位。请核对下方岗位信息，选择“新增岗位”或“只维护成员资料” |
| groupDepartmentDifference | 退回闲置语料：当前无业务调用，不得重新启用其跨部门推断；实施可在确认全引用为空后移除。若今后新增明确职能组ID错配情境须重新送审 |
| nameDifference | 保留：姓名不一致：系统记录为“{0}”，本行填写“{1}”。请核对并修改本行姓名或学号，不要将不同人员合并 |
| rowNameDifference | 保留：同学号姓名不一致：{0}。请分别修改有误行的姓名或学号 |
| fieldValueDifference | 保留：“{0}”与系统内容不一致。请对照下方内容，选择“保留原值”或“采用导入值”，也可以修改本行 |
| fieldInvalid | 保留：“{0}”：{1}；第二参数应为批准的校验文案，不直出任意服务端message |
| missingColumn | 保留：{0}（尚未对应表格列） |
| categoryCount | 保留：{0} 项 |
| issueList | 保留：问题明细 |
| currentCategory | 保留：{0} · {1} 项 |
| listSeparator | 保留：、 |
| issuePerson | 保留：第 {0} 行 · {1} |
| unnamedPerson | 保留：姓名未填 |
| issueColumn | 保留：第 {0} 列“{1}” |
| unmappedColumn | 保留：“{0}”（未选择对应列） |
| issueLocation | 保留：{0}\n检查：{1}\n{2}；分别为人员行定位、字段检查对象、原因，不合并成笼统Toast |
| valueDifference | 保留：{0}：系统里是“{1}”，表格填的是“{2}” |
| cellEmpty | 保留：空白 |
| missingCell | 保留：{0}没有填写，请修改本行并补齐 |
| longCell | 保留：{0}超过 {1} 个字，请修改本行并缩短内容 |
| rowContents | 保留：第 {0} 行填的是“{1}” |
| conflictingRows | 保留：表内多行内容不一致：{0}。请核对后选择采用哪一行，或分别修改相关行 |
| invalidNature | 改为：岗位性质“{0}”未能匹配本组织的可用选项，请选择已登记的岗位性质后重新检查；若根因为权限而非不存在，须专用错误，不能以此覆盖 |
| duplicateDetails | 保留：“{0}”这个岗位已经存在，不能再建一份。请修改已有岗位，或排除多余行 |
| departedMember | 保留：成员已离任。请先在成员管理中重新加入当前组织，再导入资料；本次不导入可排除此行 |
| inactivePerson | 保留：人员已停用。请联系有权限的管理员核对并恢复人员状态；本次不导入可排除此行 |
| expandRows | 保留：展开逐行处理 |
| collapseRows | 保留：收起逐行处理 |
| singleRowAction | 保留：第 {0} 行 · {1}：{2} |
| chooseExisting | 保留：选择已有名称 |
| groupedNotice | 改为：上方操作处理本组全部行；展开后可单独处理，也可勾选部分行一起处理 |
| editGroup | 保留：统一修改内容 |
| groupRows | 保留：本次选定 {0} 行 |
| groupEditNotice | 保留：仅修改选定行的这一列。保存后先核对姓名、行号和新值，再确认；其他行和其他资料保持不变 |
| editSelected | 保留：修改已选行 |
| selectedRows | 保留：已选 {0} 行 |
| affectedRows | 保留：本次影响 {0} 行，名单如下 |
| batchChange | 保留：将导入的“{0}”改为“{1}” |
| batchRequired | 保留：“{0}”不能留空，请填写后继续 |
| batchClear | 保留：清空选定行的“{0}” |
| batchField | 改为：需要修改的表格列 |
| selectionHint | 保留：全选、取消全选和反选均作用于整组，包括尚未展开的行；点击单行可单独调整 |
| selectGroupAll | 保留：全选 |
| selectGroupNone | 保留：取消全选 |
| selectGroupInvert | 保留：反选 |
| selectedPeopleRows | 保留：已选 {0} 人，共 {1} 行 |
| selectedPeopleRowsEmpty | 保留：已选 0 人，共 0 行 |
| scopeMore | 保留：继续查看受影响名单 |
| operationValue | 保留：{0}：“{1}” |
| useSourceRow | 保留：采用第 {0} 行内容 |
| categoryNoProblems | 保留：本类别没有待处理问题，请继续核对其他类别 |
| restart | 保留：开始下一次导入 |

已核实hrImportPlan优先使用组织岗位性质字典，只有缺少字典上下文才回退旧三项；invalidNature无当前调用，不应作为活跃指导。职能组按部门与名称联合识别，另一部门同名项不作为错误依据。batchCreate只记录预览决策，正式执行才创建分类。以上语言批准不代表算法运行测试通过。问题表与对外导出属于服务端输出例外，仍使用独立输出语料；界面仅消费代码与事实参数。
